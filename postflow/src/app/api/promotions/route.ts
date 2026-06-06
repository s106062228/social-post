import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Platform } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const MAX_PROMOTIONS = 200;

const createSchema = z.object({
  postId: z.string().min(1).max(100).optional().nullable(),
  platform: z.nativeEnum(Platform),
  campaignName: z.string().min(1).max(200),
  budget: z.number().min(0).max(10_000_000),
  spend: z.number().min(0).max(10_000_000).optional(),
  currency: z.string().min(1).max(10).optional(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime().optional().nullable(),
  goal: z.string().max(200).optional().nullable(),
  status: z.enum(["PLANNED", "ACTIVE", "COMPLETED", "CANCELLED"]).optional(),
  impressions: z.number().int().min(0).max(1_000_000_000).optional().nullable(),
  clicks: z.number().int().min(0).max(1_000_000_000).optional().nullable(),
  conversions: z.number().int().min(0).max(1_000_000_000).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

const select = {
  id: true,
  postId: true,
  platform: true,
  campaignName: true,
  budget: true,
  spend: true,
  currency: true,
  startDate: true,
  endDate: true,
  goal: true,
  status: true,
  impressions: true,
  clicks: true,
  conversions: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  post: { select: { id: true, content: true } },
} as const;

// ── GET /api/promotions ───────────────────────────────────────────────────────

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

    const statusParam = request.nextUrl.searchParams.get("status");
    const status =
      statusParam === "PLANNED" ||
      statusParam === "ACTIVE" ||
      statusParam === "COMPLETED" ||
      statusParam === "CANCELLED"
        ? statusParam
        : undefined;

    const platformParam = request.nextUrl.searchParams.get("platform");
    const platform =
      platformParam && (Object.values(Platform) as string[]).includes(platformParam)
        ? (platformParam as Platform)
        : undefined;

    const items = await prisma.postPromotion.findMany({
      where: {
        userId: session.user.id,
        ...(status !== undefined && { status }),
        ...(platform !== undefined && { platform }),
      },
      orderBy: { createdAt: "desc" },
      take: MAX_PROMOTIONS,
      select,
    });

    return NextResponse.json({ items });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── POST /api/promotions ──────────────────────────────────────────────────────

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
      return NextResponse.json(
        { error: "Validation error", issues: parsed.error.issues },
        { status: 422 }
      );
    }

    const count = await prisma.postPromotion.count({
      where: { userId: session.user.id },
    });
    if (count >= MAX_PROMOTIONS) {
      return NextResponse.json(
        { error: `Maximum ${MAX_PROMOTIONS} promotions per user` },
        { status: 422 }
      );
    }

    const {
      postId,
      platform,
      campaignName,
      budget,
      spend,
      currency,
      startDate,
      endDate,
      goal,
      status,
      impressions,
      clicks,
      conversions,
      notes,
    } = parsed.data;

    if (postId) {
      const post = await prisma.post.findUnique({ where: { id: postId } });
      if (!post || post.userId !== session.user.id) {
        return NextResponse.json({ error: "Post not found" }, { status: 404 });
      }
    }

    const item = await prisma.postPromotion.create({
      data: {
        userId: session.user.id,
        postId: postId ?? null,
        platform,
        campaignName,
        budget,
        spend: spend ?? 0,
        currency: currency ?? "USD",
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : null,
        goal: goal ?? null,
        status: status ?? "PLANNED",
        impressions: impressions ?? null,
        clicks: clicks ?? null,
        conversions: conversions ?? null,
        notes: notes ?? null,
      },
      select,
    });

    return NextResponse.json({ item }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
