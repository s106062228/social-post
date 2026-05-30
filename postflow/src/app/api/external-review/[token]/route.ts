import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";

// ── GET /api/external-review/[token] ─────────────────────────────────────────
// Public endpoint — no auth required

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
): Promise<NextResponse> {
  try {
    const { token } = await params;

    const review = await prisma.externalReview.findUnique({
      where: { token },
      include: {
        post: {
          select: {
            id: true,
            content: true,
            mediaType: true,
            mediaUrls: true,
            status: true,
          },
        },
      },
    });

    if (!review || review.status === "CANCELLED") {
      return NextResponse.json({ error: "Review not found" }, { status: 404 });
    }

    if (review.expiresAt && review.expiresAt < new Date()) {
      return NextResponse.json({ error: "Review link has expired" }, { status: 410 });
    }

    const { userId: _userId, ...safePost } = review.post as typeof review.post & { userId?: unknown };

    return NextResponse.json({
      review: {
        id: review.id,
        reviewerEmail: review.reviewerEmail,
        reviewerName: review.reviewerName,
        message: review.message,
        status: review.status,
        expiresAt: review.expiresAt,
        createdAt: review.createdAt,
      },
      post: safePost,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
