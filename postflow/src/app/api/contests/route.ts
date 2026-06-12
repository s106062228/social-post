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

const createContestSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  platform: z.enum(PLATFORM_VALUES).optional(),
  postId: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  prizeDescription: z.string().max(500).optional(),
  requiredAction: z.enum(["comment", "share", "follow", "like", "tag"]).optional(),
  winnersCount: z.number().int().min(1).max(100).optional(),
  status: z.enum(["DRAFT", "ACTIVE", "ENDED", "CANCELLED"]).optional(),
});

const MAX_CONTESTS = 50;

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

    const contests = await prisma.contest.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
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

    return NextResponse.json({ contests });
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

    const parsed = createContestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const count = await prisma.contest.count({ where: { userId: session.user.id } });
    if (count >= MAX_CONTESTS) {
      return NextResponse.json(
        { error: `Maximum of ${MAX_CONTESTS} contests allowed` },
        { status: 409 }
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

    // Validate postId ownership if provided
    if (postId) {
      const post = await prisma.post.findFirst({
        where: { id: postId, userId: session.user.id },
      });
      if (!post) {
        return NextResponse.json(
          { error: "Post not found or not owned by user" },
          { status: 404 }
        );
      }
    }

    const contest = await prisma.contest.create({
      data: {
        userId: session.user.id,
        name: name.trim(),
        description: description?.trim(),
        platform,
        postId,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        prizeDescription: prizeDescription?.trim(),
        requiredAction: requiredAction ?? "comment",
        winnersCount: winnersCount ?? 1,
        status: status ?? "DRAFT",
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

    return NextResponse.json(contest, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
