import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { computeSimilarity } from "@/lib/similarity";

const bodySchema = z.object({
  content: z.string().min(1).max(65536),
  excludeId: z.string().cuid().optional(),
});

const SIMILARITY_THRESHOLD = 0.4;
const MAX_CANDIDATES = 100;
const MAX_RESULTS = 5;

export async function POST(request: NextRequest): Promise<NextResponse> {
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

    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { content, excludeId } = parsed.data;

    const candidates = await prisma.post.findMany({
      where: {
        userId: session.user.id,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: MAX_CANDIDATES,
      select: { id: true, content: true, status: true, createdAt: true },
    });

    const scored = candidates
      .map((c) => ({
        id: c.id,
        content: c.content,
        status: c.status,
        createdAt: c.createdAt,
        score: computeSimilarity(content, c.content),
      }))
      .filter((c) => c.score >= SIMILARITY_THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RESULTS);

    return NextResponse.json({
      duplicates: scored.map((c) => ({
        id: c.id,
        contentPreview: c.content.slice(0, 120),
        status: c.status,
        createdAt: c.createdAt,
        score: Math.round(c.score * 100),
      })),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
