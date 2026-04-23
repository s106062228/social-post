import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PostStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { logActivity } from "@/lib/activity-log";

const bulkRescheduleSchema = z.object({
  ids: z.array(z.string().cuid()).min(1).max(100),
  shiftMinutes: z.number().int().min(-525960).max(525960), // ±1 year
});

// ── PATCH /api/posts/bulk-reschedule ──────────────────────────────────────────

export async function PATCH(request: NextRequest): Promise<NextResponse> {
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

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = bulkRescheduleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { ids, shiftMinutes } = parsed.data;
    const shiftMs = shiftMinutes * 60 * 1000;

    // Fetch the matching scheduled posts owned by this user
    const posts = await prisma.post.findMany({
      where: {
        id: { in: ids },
        userId: session.user.id,
        status: PostStatus.SCHEDULED,
        scheduledAt: { not: null },
      },
      select: { id: true, scheduledAt: true },
    });

    if (posts.length === 0) {
      return NextResponse.json({ rescheduled: 0 });
    }

    // Update each post's scheduledAt by the shift amount
    await prisma.$transaction(
      posts.map((p) =>
        prisma.post.update({
          where: { id: p.id },
          data: { scheduledAt: new Date(p.scheduledAt!.getTime() + shiftMs) },
        })
      )
    );

    logActivity({
      userId: session.user.id,
      action: "post.bulk_rescheduled",
      entityId: ids[0],
      entityType: "post",
      metadata: { ids, shiftMinutes, count: posts.length },
    });

    return NextResponse.json({ rescheduled: posts.length });
  } catch (err) {
    return handleRouteError(err);
  }
}
