import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter } from "@/lib/rate-limit";

const postIdSchema = z.string().cuid();

// ── DELETE /api/posts/[id]/external-reviews/[reviewId] ────────────────────────

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; reviewId: string }> }
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = await apiLimiter(session.user.id);
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const { id, reviewId } = await params;
    if (!postIdSchema.safeParse(id).success) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const review = await prisma.externalReview.findUnique({
      where: { id: reviewId },
    });

    if (!review || review.postId !== id || review.userId !== session.user.id) {
      return NextResponse.json({ error: "Review not found" }, { status: 404 });
    }

    if (review.status !== "PENDING") {
      return NextResponse.json(
        { error: "Only pending reviews can be cancelled" },
        { status: 409 }
      );
    }

    const updated = await prisma.externalReview.update({
      where: { id: reviewId },
      data: { status: "CANCELLED" },
    });

    return NextResponse.json({ review: updated });
  } catch (err) {
    return handleRouteError(err);
  }
}
