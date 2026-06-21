import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { handleRouteError } from "@/lib/errors";
import { generateInfluencerOutreach } from "@/lib/ai";

const schema = z.object({
  influencerName: z.string().min(1).max(100),
  handle: z.string().min(1).max(100),
  platform: z.string().optional(),
  followerCount: z.number().int().positive().optional(),
  niche: z.string().max(100).optional(),
  campaignBrief: z.string().min(10).max(2000),
  tone: z.enum(["professional", "friendly", "casual"]).default("friendly"),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const limit = await apiLimiter(request, session.user.id);
    if (!limit.success) {
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        { status: 429, headers: rateLimitHeaders(limit) }
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

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message ?? "Invalid input" },
        { status: 400 }
      );
    }

    const {
      influencerName,
      handle,
      platform,
      followerCount,
      niche,
      campaignBrief,
      tone,
    } = parsed.data;

    const outreach = await generateInfluencerOutreach(
      influencerName,
      handle,
      platform ?? null,
      followerCount ?? null,
      niche ?? null,
      campaignBrief,
      tone
    );

    if (!outreach) {
      return NextResponse.json(
        { error: "Failed to generate outreach messages" },
        { status: 500 }
      );
    }

    return NextResponse.json({ outreach });
  } catch (err) {
    return handleRouteError(err);
  }
}
