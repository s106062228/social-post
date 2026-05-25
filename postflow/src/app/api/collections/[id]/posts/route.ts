import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const addPostSchema = z.object({
  postId: z.string().min(1),
});

// ── POST /api/collections/[id]/posts ─────────────────────────────────────────

export async function POST(
  req: NextRequest,
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

    const collection = await prisma.postCollection.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!collection) {
      return NextResponse.json(
        { error: "Collection not found" },
        { status: 404 }
      );
    }
    if (collection.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = addPostSchema.safeParse(await req.json());
    if (!body.success) {
      return NextResponse.json(
        { error: body.error.flatten() },
        { status: 400 }
      );
    }

    const post = await prisma.post.findUnique({
      where: { id: body.data.postId },
      select: { userId: true },
    });
    if (!post || post.userId !== session.user.id) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    await prisma.collectionPost.upsert({
      where: {
        collectionId_postId: {
          collectionId: id,
          postId: body.data.postId,
        },
      },
      create: { collectionId: id, postId: body.data.postId },
      update: {},
    });

    return NextResponse.json({ added: true }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
