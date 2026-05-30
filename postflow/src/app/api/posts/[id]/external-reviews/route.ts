import crypto from "crypto";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter } from "@/lib/rate-limit";
import { logActivity } from "@/lib/activity-log";
import { sendEmail } from "@/lib/email";

const postIdSchema = z.string().cuid();

const createReviewSchema = z.object({
  reviewerEmail: z.string().email(),
  reviewerName: z.string().max(200).optional(),
  message: z.string().max(2000).optional(),
  expiresAt: z.string().datetime().optional(),
});

// ── GET /api/posts/[id]/external-reviews ──────────────────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

    const { id } = await params;
    if (!postIdSchema.safeParse(id).success) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const post = await prisma.post.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });
    if (!post || post.userId !== session.user.id) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const reviews = await prisma.externalReview.findMany({
      where: { postId: id },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ reviews });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── POST /api/posts/[id]/external-reviews ─────────────────────────────────────

export async function POST(
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
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const { id } = await params;
    if (!postIdSchema.safeParse(id).success) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const post = await prisma.post.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });
    if (!post || post.userId !== session.user.id) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    let body: z.infer<typeof createReviewSchema>;
    try {
      const raw: unknown = await request.json();
      const parsed = createReviewSchema.safeParse(raw);
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
      }
      body = parsed.data;
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const token = crypto.randomBytes(32).toString("hex");

    const review = await prisma.externalReview.create({
      data: {
        postId: id,
        userId: session.user.id,
        reviewerEmail: body.reviewerEmail,
        reviewerName: body.reviewerName ?? null,
        token,
        message: body.message ?? null,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      },
    });

    // Fire-and-forget email to reviewer
    const appUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
    const reviewUrl = `${appUrl}/external-review/${token}`;
    const expiryText = review.expiresAt
      ? `This link expires on ${review.expiresAt.toUTCString()}.`
      : "This link does not expire.";
    const messageSection = body.message
      ? `<p>${body.message}</p>`
      : `<p>You have been invited to review a post. Please click the link below to view and respond.</p>`;

    void sendEmail({
      to: body.reviewerEmail,
      subject: "You've been invited to review a post",
      html: `
        <h2>You've been invited to review a post</h2>
        ${messageSection}
        <p><a href="${reviewUrl}" style="background:#4f46e5;color:#fff;padding:10px 20px;text-decoration:none;border-radius:6px;display:inline-block;">Review Post</a></p>
        <p>${expiryText}</p>
      `,
    });

    logActivity({
      userId: session.user.id,
      action: "post.review_requested",
      entityId: id,
      entityType: "post",
      metadata: { reviewerEmail: body.reviewerEmail, reviewId: review.id },
    });

    return NextResponse.json({ review }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
