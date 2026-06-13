import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { analyzeCommentSentiment } from "@/lib/ai";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const bodySchema = z.object({
  commentId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const rl = await apiLimiter(userId);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: rateLimitHeaders(rl) }
    );
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "AI not configured" }, { status: 503 });
  }

  let commentId: string | undefined;
  try {
    const body = await req.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    commentId = parsed.data.commentId;
  } catch {
    // empty body is ok — analyze batch
  }

  try {
    const where = commentId
      ? { id: commentId, userId }
      : { userId, sentiment: null as string | null };

    const comments = await prisma.socialComment.findMany({
      where,
      take: 50,
      orderBy: { postedAt: "desc" },
      select: { id: true, content: true },
    });

    let positive = 0;
    let neutral = 0;
    let negative = 0;
    let analyzed = 0;

    for (const comment of comments) {
      const result = await analyzeCommentSentiment(comment.content);
      if (result) {
        await prisma.socialComment.update({
          where: { id: comment.id },
          data: { sentiment: result.sentiment, sentimentScore: result.score },
        });
        analyzed++;
        if (result.sentiment === "POSITIVE") positive++;
        else if (result.sentiment === "NEGATIVE") negative++;
        else neutral++;
      }
    }

    return NextResponse.json({ analyzed, positive, neutral, negative });
  } catch (err) {
    console.error("analyze comments error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
