import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { scoreContentIdea } from "@/lib/ai";
import { Platform } from "@prisma/client";

const bodySchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  platforms: z.array(z.nativeEnum(Platform)).min(1),
});

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

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "AI features not configured" },
        { status: 503 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { title, description, platforms } = parsed.data;

    // Load recent idea titles as context for originality scoring
    const existingIdeas = await prisma.contentIdea.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { title: true },
    });
    const existingTopics = existingIdeas.map((i: { title: string }) => i.title);

    const score = await scoreContentIdea(title, platforms, description, existingTopics);
    if (!score) {
      return NextResponse.json(
        { error: "AI scoring failed" },
        { status: 500 }
      );
    }

    return NextResponse.json({ score });
  } catch (err) {
    return handleRouteError(err);
  }
}
