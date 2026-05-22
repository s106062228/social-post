import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const postIdSchema = z.string().cuid();

const pollUpsertSchema = z.object({
  question: z.string().min(1).max(140),
  options: z
    .array(z.string().min(1).max(25))
    .min(2, "At least 2 options are required")
    .max(4, "At most 4 options are allowed"),
  durationHours: z
    .number()
    .int()
    .refine((v: number) => [1, 6, 24, 72, 168].includes(v), {
      message: "durationHours must be one of 1, 6, 24, 72, or 168",
    })
    .default(24),
});

// Helper — returns the post if it belongs to the current user, or null.
async function getOwnedPost(id: string, userId: string) {
  const post = await prisma.post.findUnique({
    where: { id },
    select: { id: true, userId: true },
  });
  if (!post || post.userId !== userId) return null;
  return post;
}

// ── GET /api/posts/[id]/poll ──────────────────────────────────────────────────

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
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: rateLimitHeaders(rl) }
      );
    }

    const { id } = await params;
    if (!postIdSchema.safeParse(id).success) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const post = await getOwnedPost(id, session.user.id);
    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const poll = await prisma.postPoll.findUnique({ where: { postId: id } });
    if (!poll) {
      return NextResponse.json({ error: "No poll found for this post" }, { status: 404 });
    }

    return NextResponse.json(poll);
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── PUT /api/posts/[id]/poll ──────────────────────────────────────────────────

export async function PUT(
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

    const post = await getOwnedPost(id, session.user.id);
    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = pollUpsertSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { question, options, durationHours } = parsed.data;

    const poll = await prisma.postPoll.upsert({
      where: { postId: id },
      create: { postId: id, question, options, durationHours },
      update: { question, options, durationHours },
    });

    return NextResponse.json(poll);
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── DELETE /api/posts/[id]/poll ───────────────────────────────────────────────

export async function DELETE(
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
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: rateLimitHeaders(rl) }
      );
    }

    const { id } = await params;
    if (!postIdSchema.safeParse(id).success) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const post = await getOwnedPost(id, session.user.id);
    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const poll = await prisma.postPoll.findUnique({ where: { postId: id } });
    if (!poll) {
      return NextResponse.json({ error: "No poll found for this post" }, { status: 404 });
    }

    await prisma.postPoll.delete({ where: { postId: id } });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
