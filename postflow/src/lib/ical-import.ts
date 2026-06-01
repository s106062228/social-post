export interface ParsedEvent {
  uid: string;
  summary: string;
  description: string;
  dtstart: Date | null;
  dtend: Date | null;
  location?: string;
}

export interface ICalImportResult {
  events: ParsedEvent[];
  parseErrors: string[];
}

function unescapeICalText(text: string): string {
  return text
    .replace(/\\n/g, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

function parseICalDate(value: string): Date | null {
  if (!value) return null;

  const v = value.trim();

  // Strip TZID prefix: TZID=America/New_York:20260101T100000
  const colonIdx = v.lastIndexOf(":");
  const raw = colonIdx !== -1 ? v.slice(colonIdx + 1) : v;

  // DATE-TIME: 20260101T100000Z or 20260101T100000
  const dateTimeMatch = raw.match(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/
  );
  if (dateTimeMatch) {
    const [, year, month, day, hour, min, sec, utc] = dateTimeMatch;
    const iso = `${year}-${month}-${day}T${hour}:${min}:${sec}${utc === "Z" ? "Z" : ""}`;
    const d = new Date(iso);
    return isNaN(d.getTime()) ? null : d;
  }

  // DATE only: 20260101
  const dateMatch = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateMatch) {
    const [, year, month, day] = dateMatch;
    const d = new Date(`${year}-${month}-${day}T00:00:00`);
    return isNaN(d.getTime()) ? null : d;
  }

  return null;
}

function unfoldICalLines(raw: string): string[] {
  // RFC 5545: continuation lines begin with a space or tab
  const unfolded: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && unfolded.length > 0) {
      unfolded[unfolded.length - 1] += line.slice(1);
    } else {
      unfolded.push(line);
    }
  }
  return unfolded;
}

export function parseICS(content: string): ICalImportResult {
  const events: ParsedEvent[] = [];
  const parseErrors: string[] = [];

  const lines = unfoldICalLines(content);

  let inVEvent = false;
  let current: Partial<ParsedEvent> & { rawLines?: string[] } = {};

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === "BEGIN:VEVENT") {
      inVEvent = true;
      current = { rawLines: [] };
      continue;
    }

    if (trimmed === "END:VEVENT") {
      inVEvent = false;

      // Validate and store event
      const event: ParsedEvent = {
        uid: current.uid ?? `generated-${Date.now()}-${Math.random()}`,
        summary: current.summary ?? "",
        description: current.description ?? "",
        dtstart: current.dtstart ?? null,
        dtend: current.dtend ?? null,
        location: current.location,
      };

      if (!event.dtstart) {
        parseErrors.push(
          `Event "${event.summary || event.uid}" has no valid DTSTART — skipped`
        );
      } else {
        events.push(event);
      }

      current = {};
      continue;
    }

    if (!inVEvent) continue;

    // Split at first colon after the property name/param section
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) continue;

    const propPart = trimmed.slice(0, colonIdx).toUpperCase();
    const value = trimmed.slice(colonIdx + 1);

    // Strip parameters from property name (e.g. DTSTART;TZID=...)
    const propName = propPart.split(";")[0];

    switch (propName) {
      case "UID":
        current.uid = unescapeICalText(value);
        break;
      case "SUMMARY":
        current.summary = unescapeICalText(value);
        break;
      case "DESCRIPTION":
        current.description = unescapeICalText(value);
        break;
      case "LOCATION":
        current.location = unescapeICalText(value);
        break;
      case "DTSTART":
        current.dtstart = parseICalDate(`${propPart}:${value}`);
        break;
      case "DTEND":
        current.dtend = parseICalDate(`${propPart}:${value}`);
        break;
    }
  }

  return { events, parseErrors };
}

export interface ImportPostDraft {
  content: string;
  scheduledAt: Date;
  source: "ics";
  uid: string;
}

export function icsEventsToPostDrafts(
  events: ParsedEvent[],
  options: { skipPastEvents?: boolean } = {}
): { drafts: ImportPostDraft[]; skipped: string[] } {
  const drafts: ImportPostDraft[] = [];
  const skipped: string[] = [];
  const now = new Date();

  for (const event of events) {
    if (!event.dtstart) {
      skipped.push(`"${event.summary}" has no start date`);
      continue;
    }

    if (options.skipPastEvents && event.dtstart < now) {
      skipped.push(`"${event.summary}" is in the past`);
      continue;
    }

    // Build content from summary + description
    const parts: string[] = [];
    if (event.summary) parts.push(event.summary);
    if (event.description && event.description !== event.summary) {
      parts.push(event.description);
    }
    if (event.location) parts.push(`📍 ${event.location}`);

    const content = parts.join("\n\n").trim() || event.summary || "Imported event";

    drafts.push({
      content,
      scheduledAt: event.dtstart,
      source: "ics",
      uid: event.uid,
    });
  }

  return { drafts, skipped };
}
