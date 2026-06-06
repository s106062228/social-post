import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { MediaType, PostStatus } from "@prisma/client";

// ── POST /api/testimonials/[id]/to-post ───────────────────────────────────────

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

    const item = await prisma.testimonial.findUnique({ where: { id } });
    if (!item || item.userId !== session.user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const attribution = [item.authorName, item.authorTitle, item.company]
      .filter(Boolean)
      .join(item.authorTitle || item.company ? ", " : "");

    const stars = item.rating ? "⭐".repeat(item.rating) : "";

    const content = [
      `"${item.content}"`,
      [`— ${attribution}`, stars].filter(Boolean).join("  "),
    ]
      .filter(Boolean)
      .join("\n\n");

    const post = await prisma.post.create({
      data: {
        userId: session.user.id,
        content,
        mediaType: item.imageUrl ? MediaType.IMAGE : MediaType.NONE,
        mediaUrls: item.imageUrl ? [item.imageUrl] : [],
        status: PostStatus.DRAFT,
      },
      select: { id: true },
    });

    return NextResponse.json({ postId: post.id }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
