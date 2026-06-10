import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const MAX_COMPETITORS = 20;

const createSchema = z.object({
  name: z.string().min(1).max(200),
  platform: z.enum([
    "FACEBOOK", "INSTAGRAM", "THREADS", "LINKEDIN", "PINTEREST",
    "YOUTUBE", "TIKTOK", "TWITTER", "BLUESKY", "MASTODON", "TELEGRAM",
    "REDDIT", "NOSTR", "TUMBLR", "WORDPRESS", "MEDIUM", "GHOST",
    "DEVTO", "GOOGLE_BUSINESS", "HASHNODE", "BEEHIIV", "PIXELFED", "VIMEO",
  ]),
  handle: z.string().min(1).max(200),
  profileUrl: z.string().url().optional().or(z.literal("")),
  notes: z.string().max(2000).optional(),
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
    const platform = url.searchParams.get("platform");

    const where: Record<string, unknown> = { userId: session.user.id };
    if (platform) where.platform = platform;

    const competitors = await prisma.competitorAccount.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        snapshots: {
          orderBy: { recordedAt: "desc" },
          take: 1,
        },
      },
    });

    return NextResponse.json({ competitors });
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
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const count = await prisma.competitorAccount.count({
      where: { userId: session.user.id },
    });
    if (count >= MAX_COMPETITORS) {
      return NextResponse.json(
        { error: `Maximum of ${MAX_COMPETITORS} competitor accounts reached` },
        { status: 422 }
      );
    }

    const competitor = await prisma.competitorAccount.create({
      data: {
        userId: session.user.id,
        name: parsed.data.name,
        platform: parsed.data.platform,
        handle: parsed.data.handle,
        profileUrl: parsed.data.profileUrl || null,
        notes: parsed.data.notes || null,
      },
      include: {
        snapshots: true,
      },
    });

    return NextResponse.json(competitor, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
