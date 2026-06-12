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

const addEntrySchema = z.object({
  participantName: z.string().min(1).max(200),
  participantHandle: z.string().min(1).max(200),
  platform: z.enum(PLATFORM_VALUES).optional(),
  entryType: z.enum(["manual", "comment", "share", "follow", "like"]).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const MAX_ENTRIES = 10000;

export async function GET(
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

    const contest = await prisma.contest.findFirst({
      where: { id, userId: session.user.id },
    });
    if (!contest) {
      return NextResponse.json({ error: "Contest not found" }, { status: 404 });
    }

    const url = new URL(request.url);
    const winnersOnly = url.searchParams.get("winnersOnly") === "true";
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "100"), 500);

    const entries = await prisma.contestEntry.findMany({
      where: {
        contestId: id,
        ...(winnersOnly ? { isWinner: true } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    const total = await prisma.contestEntry.count({ where: { contestId: id } });

    return NextResponse.json({ entries, total });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(
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

    const contest = await prisma.contest.findFirst({
      where: { id, userId: session.user.id },
    });
    if (!contest) {
      return NextResponse.json({ error: "Contest not found" }, { status: 404 });
    }

    if (contest.status === "ENDED" || contest.status === "CANCELLED") {
      return NextResponse.json(
        { error: "Cannot add entries to an ended or cancelled contest" },
        { status: 409 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = addEntrySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const entryCount = await prisma.contestEntry.count({ where: { contestId: id } });
    if (entryCount >= MAX_ENTRIES) {
      return NextResponse.json(
        { error: `Maximum of ${MAX_ENTRIES} entries per contest` },
        { status: 409 }
      );
    }

    const { participantName, participantHandle, platform, entryType, metadata } = parsed.data;

    const entry = await prisma.contestEntry.create({
      data: {
        contestId: id,
        participantName: participantName.trim(),
        participantHandle: participantHandle.trim(),
        platform,
        entryType: entryType ?? "manual",
        metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : undefined,
      },
    });

    return NextResponse.json(entry, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
