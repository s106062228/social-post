import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter } from "@/lib/rate-limit";
import { suggestGapContent } from "@/lib/ai";

const schema = z.object({
  gapDates: z.array(z.string()).min(1).max(7),
  platforms: z.array(z.string()).min(1),
  tone: z.string().optional(),
});

// ── POST /api/ai/fill-gaps ────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const limited = await apiLimiter(req, session.user.id);
    if (limited) return limited as NextResponse;

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "AI features are not configured" },
        { status: 503 }
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { gapDates, platforms, tone } = parsed.data;
    const userId = session.user.id;

    // Fetch recent published posts for context
    const recentPosts = await prisma.post.findMany({
      where: {
        userId,
        status: "PUBLISHED",
      },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: { content: true },
    });

    const recentContext =
      recentPosts.length > 0
        ? recentPosts
            .map((p, i) => `${i + 1}. ${p.content.slice(0, 150)}`)
            .join("\n")
        : undefined;

    const result = await suggestGapContent(
      gapDates,
      platforms,
      tone,
      recentContext
    );

    if (!result) {
      return NextResponse.json(
        { error: "Failed to generate gap content suggestions" },
        { status: 500 }
      );
    }

    return NextResponse.json({ suggestions: result.suggestions });
  } catch (err) {
    return handleRouteError(err);
  }
}
