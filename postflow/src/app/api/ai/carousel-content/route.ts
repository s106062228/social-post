import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { handleRouteError } from "@/lib/errors";
import { generateCarouselContent } from "@/lib/ai";

const carouselSchema = z.object({
  topic: z.string().min(2).max(300),
  slideCount: z.number().int().min(3).max(15).default(5),
  platforms: z.array(z.string().min(1)).min(1).max(20),
  tone: z.string().max(100).optional(),
  audience: z.string().max(200).optional(),
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
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = carouselSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 }
      );
    }

    const { topic, slideCount, platforms, tone, audience } = parsed.data;

    const carousel = await generateCarouselContent(
      topic,
      slideCount,
      platforms,
      tone,
      audience
    );

    if (!carousel) {
      return NextResponse.json(
        { error: "Failed to generate carousel content" },
        { status: 500 }
      );
    }

    return NextResponse.json({ carousel }, { headers: rateLimitHeaders(rl) });
  } catch (err) {
    return handleRouteError(err);
  }
}
