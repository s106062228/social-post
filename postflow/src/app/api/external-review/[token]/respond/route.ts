import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { createNotification, NOTIFICATION_TYPES } from "@/lib/notifications";
import { logActivity } from "@/lib/activity-log";

const respondSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  feedback: z.string().max(2000).optional(),
});

// ── POST /api/external-review/[token]/respond ─────────────────────────────────
// Public endpoint — no auth required

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
): Promise<NextResponse> {
  try {
    const { token } = await params;

    let body: z.infer<typeof respondSchema>;
    try {
      const raw: unknown = await request.json();
      const parsed = respondSchema.safeParse(raw);
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
      }
      body = parsed.data;
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const review = await prisma.externalReview.findUnique({
      where: { token },
    });

    if (!review || review.status === "CANCELLED") {
      return NextResponse.json({ error: "Review not found" }, { status: 404 });
    }

    if (review.expiresAt && review.expiresAt < new Date()) {
      return NextResponse.json({ error: "Review link has expired" }, { status: 410 });
    }

    if (review.status === "APPROVED" || review.status === "REJECTED") {
      return NextResponse.json(
        { error: "This review has already been responded to" },
        { status: 409 }
      );
    }

    await prisma.externalReview.update({
      where: { token },
      data: {
        status: body.decision,
        feedback: body.feedback ?? null,
        respondedAt: new Date(),
      },
    });

    // Notify the post owner
    createNotification({
      userId: review.userId,
      type: NOTIFICATION_TYPES.EXTERNAL_REVIEW_RESPONDED,
      title: `Review request ${body.decision.toLowerCase()}`,
      body: `Your review request was ${body.decision.toLowerCase()} by ${review.reviewerEmail}`,
      entityId: review.postId,
      entityType: "post",
    });

    logActivity({
      userId: review.userId,
      action: "post.review_responded",
      entityId: review.postId,
      entityType: "post",
      metadata: {
        reviewId: review.id,
        decision: body.decision,
        reviewerEmail: review.reviewerEmail,
      },
    });

    return NextResponse.json({ status: body.decision });
  } catch (err) {
    return handleRouteError(err);
  }
}
