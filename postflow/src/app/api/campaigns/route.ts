import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

// ── Zod Schemas ───────────────────────────────────────────────────────────────

const createCampaignSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  goal: z.string().max(500).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  isActive: z.boolean().optional().default(true),
});

// ── GET /api/campaigns ────────────────────────────────────────────────────────

export async function GET(): Promise<NextResponse> {
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

    const campaigns = await prisma.campaign.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        description: true,
        goal: true,
        startDate: true,
        endDate: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { posts: true } },
      },
    });

    return NextResponse.json({ campaigns });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── POST /api/campaigns ───────────────────────────────────────────────────────

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

    const parsed = createCampaignSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { name, description, goal, startDate, endDate, isActive } = parsed.data;

    if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
      return NextResponse.json(
        { error: "startDate must be before endDate" },
        { status: 400 }
      );
    }

    const campaign = await prisma.campaign.create({
      data: {
        userId: session.user.id,
        name: name.trim(),
        description: description?.trim(),
        goal: goal?.trim(),
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        isActive: isActive ?? true,
      },
      select: {
        id: true,
        name: true,
        description: true,
        goal: true,
        startDate: true,
        endDate: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { posts: true } },
      },
    });

    return NextResponse.json(campaign, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
