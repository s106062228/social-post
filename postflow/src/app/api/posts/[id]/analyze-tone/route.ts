import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { analyzeTone } from "@/lib/ai";

const postIdSchema = z.string().cuid();

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

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: "AI features are not enabled" }, { status: 503 });
    }

    const { id } = await params;
    if (!postIdSchema.safeParse(id).success) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const post = await prisma.post.findUnique({
      where: { id },
      select: { id: true, userId: true, content: true },
    });

    if (!post || post.userId !== session.user.id) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const result = await analyzeTone(post.content);

    const updated = await prisma.post.update({
      where: { id },
      data: { tone: result.tone, toneTraits: result.traits },
      select: { tone: true, toneTraits: true },
    });

    return NextResponse.json({
      tone: updated.tone,
      toneTraits: updated.toneTraits,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
