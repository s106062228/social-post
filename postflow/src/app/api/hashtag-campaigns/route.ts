import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const MAX_CAMPAIGNS = 50;

const createSchema = z.object({
  name: z.string().min(1).max(200),
  hashtags: z.array(z.string().min(1).max(100)).default([]),
  startDate: z.string().datetime(),
  endDate: z.string().datetime().optional(),
  targetPlatforms: z.array(z.string()).default([]),
  goal: z.string().max(1000).optional(),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
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

    const url = new URL(request.url);
    const isActiveParam = url.searchParams.get("isActive");

    const where: { userId: string; isActive?: boolean } = { userId: session.user.id };
    if (isActiveParam === "true") where.isActive = true;
    if (isActiveParam === "false") where.isActive = false;

    const campaigns = await prisma.hashtagCampaign.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ campaigns });
  } catch (err) {
    return handleRouteError(err);
  }
}

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

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request body", details: parsed.error.flatten() }, { status: 400 });
    }

    const count = await prisma.hashtagCampaign.count({ where: { userId: session.user.id } });
    if (count >= MAX_CAMPAIGNS) {
      return NextResponse.json(
        { error: `Maximum of ${MAX_CAMPAIGNS} hashtag campaigns reached` },
        { status: 422 }
      );
    }

    const campaign = await prisma.hashtagCampaign.create({
      data: {
        userId: session.user.id,
        name: parsed.data.name,
        hashtags: parsed.data.hashtags,
        startDate: new Date(parsed.data.startDate),
        endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : null,
        targetPlatforms: parsed.data.targetPlatforms,
        goal: parsed.data.goal ?? null,
      },
    });

    return NextResponse.json(campaign, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
