import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { MediaType, PostStatus } from "@prisma/client";

// ── POST /api/ideas/[id]/to-post ──────────────────────────────────────────────

export async function POST(
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

    const idea = await prisma.contentIdea.findUnique({ where: { id } });
    if (!idea || idea.userId !== session.user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const content = [idea.title, idea.description].filter(Boolean).join("\n\n");

    const post = await prisma.post.create({
      data: {
        userId: session.user.id,
        content,
        mediaType: MediaType.NONE,
        mediaUrls: [],
        status: PostStatus.DRAFT,
      },
      select: { id: true },
    });

    return NextResponse.json({ postId: post.id }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
