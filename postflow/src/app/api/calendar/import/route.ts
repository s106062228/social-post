import { type NextRequest, NextResponse } from "next/server";
import { MediaType, PostStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { sanitizePostContent } from "@/lib/sanitize";
import { logActivity } from "@/lib/activity-log";
import { parseICS, icsEventsToPostDrafts } from "@/lib/ical-import";
import { apiLogger } from "@/lib/logger";

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB
const MAX_EVENTS = 100;

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = await apiLimiter(session.user.id);
    if (!rl.success) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: rateLimitHeaders(rl) }
      );
    }

    const userId = session.user.id;

    let icsText: string;

    const contentType = req.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file");

      if (!file || typeof file === "string") {
        return NextResponse.json(
          { error: "No file provided" },
          { status: 400 }
        );
      }

      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: "File too large (max 2 MB)" },
          { status: 400 }
        );
      }

      const name = file.name ?? "";
      if (!name.toLowerCase().endsWith(".ics") && !name.toLowerCase().endsWith(".ical")) {
        return NextResponse.json(
          { error: "Only .ics / .ical files are supported" },
          { status: 400 }
        );
      }

      icsText = await file.text();
    } else {
      // Accept raw ICS body for testing
      const body = await req.text();
      if (!body.trim()) {
        return NextResponse.json({ error: "Empty body" }, { status: 400 });
      }
      icsText = body;
    }

    if (!icsText.includes("BEGIN:VCALENDAR") && !icsText.includes("BEGIN:VEVENT")) {
      return NextResponse.json(
        { error: "Invalid ICS file: no VCALENDAR or VEVENT found" },
        { status: 400 }
      );
    }

    const { events, parseErrors } = parseICS(icsText);

    if (events.length === 0) {
      return NextResponse.json({
        imported: 0,
        skipped: parseErrors,
        postIds: [],
        message: "No valid events found in the ICS file",
      });
    }

    const eventsToImport = events.slice(0, MAX_EVENTS);
    const { drafts, skipped: draftSkipped } = icsEventsToPostDrafts(eventsToImport, {
      skipPastEvents: false,
    });

    const allSkipped = [...parseErrors, ...draftSkipped];

    if (drafts.length === 0) {
      return NextResponse.json({
        imported: 0,
        skipped: allSkipped,
        postIds: [],
        message: "No importable events (all may be missing start dates)",
      });
    }

    const postIds: string[] = [];

    for (const draft of drafts) {
      const sanitized = sanitizePostContent(draft.content);
      const post = await prisma.post.create({
        data: {
          userId,
          content: sanitized,
          mediaType: MediaType.NONE,
          mediaUrls: [],
          status: PostStatus.DRAFT,
          scheduledAt: draft.scheduledAt,
        },
        select: { id: true },
      });
      postIds.push(post.id);
    }

    await logActivity({
      userId,
      action: "calendar.imported",
      entityId: userId,
      entityType: "user",
      metadata: { imported: postIds.length, skipped: allSkipped.length },
    });

    apiLogger.info({ userId, imported: postIds.length }, "ICS import completed");

    return NextResponse.json({
      imported: postIds.length,
      skipped: allSkipped,
      postIds,
      message: `Successfully imported ${postIds.length} event${postIds.length === 1 ? "" : "s"} as draft posts`,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
