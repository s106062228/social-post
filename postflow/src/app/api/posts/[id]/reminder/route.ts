import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PostStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { scheduleReminder, cancelReminder } from "@/lib/queue/scheduler";

const postIdSchema = z.string().cuid();

// reminderMinutes: null clears the reminder; 1–10080 (1 min – 7 days) sets it
const bodySchema = z.object({
  reminderMinutes: z.number().int().min(1).max(10080).nullable(),
});

// ── PATCH /api/posts/[id]/reminder ────────────────────────────────────────────

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
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

    const { id } = await params;
    if (!postIdSchema.safeParse(id).success) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { reminderMinutes } = parsed.data;

    const post = await prisma.post.findUnique({
      where: { id },
      select: { id: true, userId: true, scheduledAt: true, status: true },
    });

    if (!post || post.userId !== session.user.id) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    // Persist the setting
    const updated = await prisma.post.update({
      where: { id },
      data: { reminderMinutes },
      select: { reminderMinutes: true },
    });

    // Manage the BullMQ delayed job when the post is already SCHEDULED
    if (post.status === PostStatus.SCHEDULED && post.scheduledAt) {
      if (reminderMinutes === null) {
        await cancelReminder(id);
      } else {
        await scheduleReminder(
          id,
          session.user.id,
          post.scheduledAt,
          reminderMinutes
        );
      }
    }

    return NextResponse.json({ reminderMinutes: updated.reminderMinutes });
  } catch (err) {
    return handleRouteError(err);
  }
}
