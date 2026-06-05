import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const addPostSchema = z.object({
  postId: z.string().min(1),
});

type RouteContext = { params: Promise<{ id: string }> };

// ── POST /api/collaborations/[id]/posts ───────────────────────────────────────

export async function POST(
  request: NextRequest,
  context: RouteContext
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

    const { id } = await context.params;

    const collaboration = await prisma.collaboration.findFirst({
      where: { id, userId: session.user.id },
    });
    if (!collaboration) {
      return NextResponse.json({ error: "Collaboration not found" }, { status: 404 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = addPostSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { postId } = parsed.data;

    const post = await prisma.post.findFirst({
      where: { id: postId, userId: session.user.id },
    });
    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const existing = await prisma.collaborationPost.findUnique({
      where: { collaborationId_postId: { collaborationId: id, postId } },
    });
    if (existing) {
      return NextResponse.json({ error: "Post already linked to this collaboration" }, { status: 409 });
    }

    await prisma.collaborationPost.create({
      data: { collaborationId: id, postId },
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
