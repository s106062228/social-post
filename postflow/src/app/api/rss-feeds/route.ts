import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

// ── Zod Schemas ───────────────────────────────────────────────────────────────

const createFeedSchema = z.object({
  name: z.string().min(1).max(200),
  url: z.string().url("url must be a valid URL").max(2000),
  autoCreate: z.boolean().optional().default(true),
});

// ── GET /api/rss-feeds ────────────────────────────────────────────────────────

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

    const feeds = await prisma.rssFeed.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        url: true,
        autoCreate: true,
        lastFetchedAt: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { items: true } },
      },
    });

    return NextResponse.json({ feeds });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── POST /api/rss-feeds ───────────────────────────────────────────────────────

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

    const parsed = createFeedSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { name, url, autoCreate } = parsed.data;

    // Check for duplicate URL per user
    const existing = await prisma.rssFeed.findUnique({
      where: { userId_url: { userId: session.user.id, url } },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        { error: "A feed with this URL already exists" },
        { status: 409 }
      );
    }

    const feed = await prisma.rssFeed.create({
      data: {
        userId: session.user.id,
        name: name.trim(),
        url,
        autoCreate: autoCreate ?? true,
      },
      select: {
        id: true,
        name: true,
        url: true,
        autoCreate: true,
        lastFetchedAt: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { items: true } },
      },
    });

    return NextResponse.json(feed, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
