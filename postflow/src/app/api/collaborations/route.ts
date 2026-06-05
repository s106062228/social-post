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

const createCollaborationSchema = z.object({
  name: z.string().min(1).max(200),
  partnerName: z.string().min(1).max(200),
  partnerHandle: z.string().max(100).optional(),
  platform: z.enum(PLATFORM_VALUES).optional(),
  deliverables: z.array(z.string().max(200)).max(20).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  budget: z.number().min(0).optional(),
  notes: z.string().max(2000).optional(),
  status: z.enum(["ACTIVE", "COMPLETED", "CANCELLED"]).optional(),
});

const MAX_COLLABORATIONS = 50;

// ── GET /api/collaborations ───────────────────────────────────────────────────

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

    const collaborations = await prisma.collaboration.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: MAX_COLLABORATIONS,
      select: {
        id: true,
        name: true,
        partnerName: true,
        partnerHandle: true,
        platform: true,
        deliverables: true,
        startDate: true,
        endDate: true,
        budget: true,
        notes: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { posts: true } },
      },
    });

    return NextResponse.json({ collaborations });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── POST /api/collaborations ──────────────────────────────────────────────────

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

    const parsed = createCollaborationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const count = await prisma.collaboration.count({
      where: { userId: session.user.id },
    });
    if (count >= MAX_COLLABORATIONS) {
      return NextResponse.json(
        { error: `Maximum of ${MAX_COLLABORATIONS} collaborations allowed` },
        { status: 409 }
      );
    }

    const {
      name, partnerName, partnerHandle, platform, deliverables,
      startDate, endDate, budget, notes, status,
    } = parsed.data;

    const collaboration = await prisma.collaboration.create({
      data: {
        userId: session.user.id,
        name: name.trim(),
        partnerName: partnerName.trim(),
        partnerHandle: partnerHandle?.trim(),
        platform,
        deliverables: deliverables ?? [],
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        budget,
        notes: notes?.trim(),
        status: status ?? "ACTIVE",
      },
      select: {
        id: true,
        name: true,
        partnerName: true,
        partnerHandle: true,
        platform: true,
        deliverables: true,
        startDate: true,
        endDate: true,
        budget: true,
        notes: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { posts: true } },
      },
    });

    return NextResponse.json(collaboration, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
