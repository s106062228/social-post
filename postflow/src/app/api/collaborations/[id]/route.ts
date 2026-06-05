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

const updateCollaborationSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  partnerName: z.string().min(1).max(200).optional(),
  partnerHandle: z.string().max(100).nullable().optional(),
  platform: z.enum(PLATFORM_VALUES).nullable().optional(),
  deliverables: z.array(z.string().max(200)).max(20).optional(),
  startDate: z.string().datetime().nullable().optional(),
  endDate: z.string().datetime().nullable().optional(),
  budget: z.number().min(0).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  status: z.enum(["ACTIVE", "COMPLETED", "CANCELLED"]).optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

// ── GET /api/collaborations/[id] ──────────────────────────────────────────────

export async function GET(
  _request: NextRequest,
  context: RouteContext
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

    const { id } = await context.params;

    const collaboration = await prisma.collaboration.findFirst({
      where: { id, userId: session.user.id },
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
        posts: {
          take: 20,
          orderBy: { addedAt: "desc" },
          select: {
            addedAt: true,
            post: {
              select: {
                id: true,
                content: true,
                status: true,
                scheduledAt: true,
                createdAt: true,
                mediaType: true,
              },
            },
          },
        },
        _count: { select: { posts: true } },
      },
    });

    if (!collaboration) {
      return NextResponse.json({ error: "Collaboration not found" }, { status: 404 });
    }

    return NextResponse.json({ collaboration });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── PATCH /api/collaborations/[id] ───────────────────────────────────────────

export async function PATCH(
  request: NextRequest,
  context: RouteContext
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

    const { id } = await context.params;

    const existing = await prisma.collaboration.findFirst({
      where: { id, userId: session.user.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Collaboration not found" }, { status: 404 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = updateCollaborationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const data = parsed.data;

    const updated = await prisma.collaboration.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name.trim() }),
        ...(data.partnerName !== undefined && { partnerName: data.partnerName.trim() }),
        ...(data.partnerHandle !== undefined && { partnerHandle: data.partnerHandle?.trim() ?? null }),
        ...(data.platform !== undefined && { platform: data.platform }),
        ...(data.deliverables !== undefined && { deliverables: data.deliverables }),
        ...(data.startDate !== undefined && { startDate: data.startDate ? new Date(data.startDate) : null }),
        ...(data.endDate !== undefined && { endDate: data.endDate ? new Date(data.endDate) : null }),
        ...(data.budget !== undefined && { budget: data.budget }),
        ...(data.notes !== undefined && { notes: data.notes?.trim() ?? null }),
        ...(data.status !== undefined && { status: data.status }),
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

    return NextResponse.json({ collaboration: updated });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── DELETE /api/collaborations/[id] ──────────────────────────────────────────

export async function DELETE(
  _request: NextRequest,
  context: RouteContext
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

    const { id } = await context.params;

    const existing = await prisma.collaboration.findFirst({
      where: { id, userId: session.user.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Collaboration not found" }, { status: 404 });
    }

    await prisma.collaboration.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
