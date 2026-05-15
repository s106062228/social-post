import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { MediaType, PostStatus } from "@prisma/client";
import { generateInspiredContent } from "@/lib/ai";

const bodySchema = z.object({
  useAi: z.boolean().optional(),
});

// ── POST /api/inspiration/[id]/to-post ────────────────────────────────────────

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
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: rateLimitHeaders(rl) }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const parsed = bodySchema.safeParse(body);
    const useAi = parsed.success ? (parsed.data.useAi ?? false) : false;

    const { id } = await params;

    const item = await prisma.inspirationItem.findUnique({ where: { id } });
    if (!item || item.userId !== session.user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    let content: string;

    if (useAi && process.env.ANTHROPIC_API_KEY) {
      try {
        content = await generateInspiredContent(
          item.title ?? item.url,
          item.description ?? "",
          item.notes ?? "",
          item.platform ? [item.platform] : []
        );
      } catch {
        // Fall back to plain content if AI fails
        content = [item.title, item.description, item.url]
          .filter(Boolean)
          .join("\n\n");
      }
    } else {
      content = [item.title, item.description, item.url]
        .filter(Boolean)
        .join("\n\n");
    }

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
