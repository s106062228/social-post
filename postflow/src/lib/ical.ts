import { PostStatus } from "@prisma/client";

export interface ICalPost {
  id: string;
  content: string;
  scheduledAt: Date;
  status: PostStatus;
}

function escapeICalText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "");
}

function formatICalDate(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

function foldLine(line: string): string {
  // RFC 5545: lines must be <= 75 octets; fold with CRLF + space
  const limit = 75;
  if (line.length <= limit) return line;
  let result = "";
  let pos = 0;
  while (pos < line.length) {
    if (pos === 0) {
      result += line.slice(0, limit);
      pos = limit;
    } else {
      result += "\r\n " + line.slice(pos, pos + limit - 1);
      pos += limit - 1;
    }
  }
  return result;
}

export function generateICalFeed(
  posts: ICalPost[],
  calendarName = "PostFlow Schedule"
): string {
  const now = formatICalDate(new Date());

  const events = posts
    .filter((p) => p.scheduledAt != null)
    .map((p) => {
      const dtstart = formatICalDate(p.scheduledAt);
      // Events last 30 minutes by default
      const dtend = formatICalDate(
        new Date(p.scheduledAt.getTime() + 30 * 60 * 1000)
      );

      const summary = escapeICalText(
        p.content.length > 60
          ? p.content.slice(0, 57) + "..."
          : p.content
      );
      const description = escapeICalText(p.content);
      const statusLabel =
        p.status === PostStatus.PUBLISHED ? "Published" : "Scheduled";

      return [
        "BEGIN:VEVENT",
        foldLine(`UID:postflow-${p.id}@postflow`),
        foldLine(`DTSTAMP:${now}`),
        foldLine(`DTSTART:${dtstart}`),
        foldLine(`DTEND:${dtend}`),
        foldLine(`SUMMARY:[${statusLabel}] ${summary}`),
        foldLine(`DESCRIPTION:${description}`),
        "END:VEVENT",
      ].join("\r\n");
    });

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    foldLine(`PRODID:-//PostFlow//PostFlow Calendar//EN`),
    foldLine(`X-WR-CALNAME:${escapeICalText(calendarName)}`),
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");
}
