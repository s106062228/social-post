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

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  handle: z.string().min(1).max(200).optional(),
  platform: z.enum(PLATFORM_VALUES).nullish(),
  followerCount: z.number().int().min(0).nullish(),
  engagementRate: z.number().min(0).max(100).nullish(),
  niche: z.string().max(100).nullish(),
  email: z.string().email().nullish().or(z.literal("")),
  profileUrl: z.string().url().nullish().or(z.literal("")),
  outreachStatus: z.enum(OUTREACH_STATUSES).optional(),
  notes: z.string().max(2000).nullish(),
  lastContactedAt: z.string().datetime().nullish(),
});

// ── PATCH /api/influencer-profiles/[id] ──────────────────────────────────────

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
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

    const { id } = await params;

    const existing = await prisma.influencerProfile.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (existing.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const data: Record<string, unknown> = {};
    const d = parsed.data;
    if (d.name !== undefined) data.name = d.name.trim();
    if (d.handle !== undefined) data.handle = d.handle.trim();
    if ("platform" in d) data.platform = d.platform ?? null;
    if ("followerCount" in d) data.followerCount = d.followerCount ?? null;
    if ("engagementRate" in d) data.engagementRate = d.engagementRate ?? null;
    if ("niche" in d) data.niche = d.niche?.trim() ?? null;
    if ("email" in d) data.email = d.email?.trim() || null;
    if ("profileUrl" in d) data.profileUrl = d.profileUrl?.trim() || null;
    if (d.outreachStatus !== undefined) data.outreachStatus = d.outreachStatus;
    if ("notes" in d) data.notes = d.notes?.trim() ?? null;
    if ("lastContactedAt" in d) {
      data.lastContactedAt = d.lastContactedAt ? new Date(d.lastContactedAt) : null;
    }

    const profile = await prisma.influencerProfile.update({
      where: { id },
      data,
    });

    return NextResponse.json(profile);
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── DELETE /api/influencer-profiles/[id] ─────────────────────────────────────

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
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

    const { id } = await params;

    const existing = await prisma.influencerProfile.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (existing.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.influencerProfile.delete({ where: { id } });

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return handleRouteError(err);
  }
}
