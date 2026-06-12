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

const updateContestSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  platform: z.enum(PLATFORM_VALUES).optional().nullable(),
  postId: z.string().optional().nullable(),
  startDate: z.string().datetime().optional().nullable(),
  endDate: z.string().datetime().optional().nullable(),
  prizeDescription: z.string().max(500).optional().nullable(),
  requiredAction: z.enum(["comment", "share", "follow", "like", "tag"]).optional(),
  winnersCount: z.number().int().min(1).max(100).optional(),
  status: z.enum(["DRAFT", "ACTIVE", "ENDED", "CANCELLED"]).optional(),
});

export async function GET(
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

    const contest = await prisma.contest.findFirst({
      where: { id, userId: session.user.id },
      include: {
        entries: {
          orderBy: { createdAt: "desc" },
          take: 100,
        },
        _count: { select: { entries: true } },
      },
    });

    if (!contest) {
      return NextResponse.json({ error: "Contest not found" }, { status: 404 });
    }

    return NextResponse.json(contest);
  } catch (err) {
    return handleRouteError(err);
  }
}

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

    const existing = await prisma.contest.findFirst({
      where: { id, userId: session.user.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Contest not found" }, { status: 404 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = updateContestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const {
      name,
      description,
      platform,
      postId,
      startDate,
      endDate,
      prizeDescription,
      requiredAction,
      winnersCount,
      status,
    } = parsed.data;

    const updated = await prisma.contest.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description: description?.trim() ?? null }),
        ...(platform !== undefined && { platform: platform ?? null }),
        ...(postId !== undefined && { postId: postId ?? null }),
        ...(startDate !== undefined && { startDate: startDate ? new Date(startDate) : null }),
        ...(endDate !== undefined && { endDate: endDate ? new Date(endDate) : null }),
        ...(prizeDescription !== undefined && {
          prizeDescription: prizeDescription?.trim() ?? null,
        }),
        ...(requiredAction !== undefined && { requiredAction }),
        ...(winnersCount !== undefined && { winnersCount }),
        ...(status !== undefined && { status }),
      },
      select: {
        id: true,
        name: true,
        description: true,
        platform: true,
        postId: true,
        startDate: true,
        endDate: true,
        prizeDescription: true,
        requiredAction: true,
        winnersCount: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { entries: true } },
      },
    });

    return NextResponse.json(updated);
  } catch (err) {
    return handleRouteError(err);
  }
}

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

    const existing = await prisma.contest.findFirst({
      where: { id, userId: session.user.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Contest not found" }, { status: 404 });
    }

    await prisma.contest.delete({ where: { id } });

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return handleRouteError(err);
  }
}
