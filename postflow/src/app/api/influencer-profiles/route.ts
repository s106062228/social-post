import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const PLATFORM_VALUES = [
  "FACEBOOK", "INSTAGRAM", "THREADS", "LINKEDIN", "PINTEREST",
  "YOUTUBE", "TIKTOK", "TWITTER", "BLUESKY", "MASTODON", "TELEGRAM",
  "REDDIT", "NOSTR", "TUMBLR", "WORDPRESS", "MEDIUM", "GHOST", "DEVTO",
  "GOOGLE_BUSINESS", "HASHNODE", "BEEHIIV", "PIXELFED", "VIMEO",
] as const;

const OUTREACH_STATUSES = [
  "PROSPECT", "CONTACTED", "RESPONDED", "NEGOTIATING", "AGREED", "COMPLETED", "DECLINED",
] as const;

const createSchema = z.object({
  name: z.string().min(1).max(200),
  handle: z.string().min(1).max(200),
  platform: z.enum(PLATFORM_VALUES).optional(),
  followerCount: z.number().int().min(0).optional(),
  engagementRate: z.number().min(0).max(100).optional(),
  niche: z.string().max(100).optional(),
  email: z.string().email().optional().or(z.literal("")),
  profileUrl: z.string().url().optional().or(z.literal("")),
  outreachStatus: z.enum(OUTREACH_STATUSES).optional(),
  notes: z.string().max(2000).optional(),
  lastContactedAt: z.string().datetime().optional(),
});

const MAX_PROFILES = 500;

// ── GET /api/influencer-profiles ─────────────────────────────────────────────

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

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const platform = searchParams.get("platform");
    const niche = searchParams.get("niche");
    const search = searchParams.get("search");

    const where: Record<string, unknown> = { userId: session.user.id };
    if (status && OUTREACH_STATUSES.includes(status as typeof OUTREACH_STATUSES[number])) {
      where.outreachStatus = status;
    }
    if (platform && PLATFORM_VALUES.includes(platform as typeof PLATFORM_VALUES[number])) {
      where.platform = platform;
    }
    if (niche) {
      where.niche = { contains: niche, mode: "insensitive" };
    }
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { handle: { contains: search, mode: "insensitive" } },
        { niche: { contains: search, mode: "insensitive" } },
      ];
    }

    const profiles = await prisma.influencerProfile.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: MAX_PROFILES,
    });

    return NextResponse.json({ profiles });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── POST /api/influencer-profiles ────────────────────────────────────────────

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
        { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const count = await prisma.influencerProfile.count({
      where: { userId: session.user.id },
    });
    if (count >= MAX_PROFILES) {
      return NextResponse.json(
        { error: `Maximum of ${MAX_PROFILES} influencer profiles allowed` },
        { status: 409 }
      );
    }

    const {
      name, handle, platform, followerCount, engagementRate,
      niche, email, profileUrl, outreachStatus, notes, lastContactedAt,
    } = parsed.data;

    const profile = await prisma.influencerProfile.create({
      data: {
        userId: session.user.id,
        name: name.trim(),
        handle: handle.trim(),
        platform,
        followerCount,
        engagementRate,
        niche: niche?.trim(),
        email: email?.trim() || null,
        profileUrl: profileUrl?.trim() || null,
        outreachStatus: outreachStatus ?? "PROSPECT",
        notes: notes?.trim(),
        lastContactedAt: lastContactedAt ? new Date(lastContactedAt) : undefined,
      },
    });

    return NextResponse.json(profile, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
