import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { z } from "zod";
import { discoverTrendingTopics } from "@/lib/ai";
import { prisma } from "@/lib/db";

const schema = z.object({
  niche: z.string().max(200).optional(),
  platforms: z.array(z.string()).min(1),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await apiLimiter(session.user.id);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: rateLimitHeaders(rl) }
    );
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "AI service not configured" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { niche = "", platforms } = parsed.data;

  // Load recent published posts for topic context
  const recentPosts = await prisma.post.findMany({
    where: { userId: session.user.id, status: "PUBLISHED" },
    orderBy: { updatedAt: "desc" },
    take: 30,
    select: { content: true },
  });

  const existingTopics = recentPosts.map((p: { content: string }) =>
    p.content.split(/\s+/).slice(0, 6).join(" ")
  );

  const result = await discoverTrendingTopics(niche, existingTopics, platforms);

  if (!result) {
    return NextResponse.json({ error: "AI service not available" }, { status: 503 });
  }

  return NextResponse.json({
    topics: result.topics,
    generalInsights: result.generalInsights,
  });
}
