import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

// ── Zod Schemas ───────────────────────────────────────────────────────────────

const updateCampaignSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).nullable().optional(),
  goal: z.string().max(500).nullable().optional(),
  startDate: z.string().datetime().nullable().optional(),
  endDate: z.string().datetime().nullable().optional(),
  isActive: z.boolean().optional(),
});

// ── GET /api/campaigns/[id] ───────────────────────────────────────────────────

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

    if (!id || id.length < 10) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const campaign = await prisma.campaign.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        description: true,
        goal: true,
        startDate: true,
        endDate: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        userId: true,
        posts: {
          orderBy: { addedAt: "desc" },
          select: {
            addedAt: true,
            post: {
              select: {
                id: true,
                content: true,
                status: true,
                mediaType: true,
                scheduledAt: true,
                createdAt: true,
              },
            },
          },
        },
      },
    });

    if (!campaign || campaign.userId !== session.user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { userId: _uid, ...rest } = campaign;
    return NextResponse.json(rest);
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── PATCH /api/campaigns/[id] ─────────────────────────────────────────────────

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

    if (!id || id.length < 10) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = updateCampaignSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const existing = await prisma.campaign.findUnique({ where: { id } });
    if (!existing || existing.userId !== session.user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { name, description, goal, startDate, endDate, isActive } = parsed.data;

    const resolvedStart = startDate !== undefined
      ? (startDate ? new Date(startDate) : null)
      : existing.startDate;
    const resolvedEnd = endDate !== undefined
      ? (endDate ? new Date(endDate) : null)
      : existing.endDate;

    if (resolvedStart && resolvedEnd && resolvedStart > resolvedEnd) {
      return NextResponse.json(
        { error: "startDate must be before endDate" },
        { status: 400 }
      );
    }

    const updated = await prisma.campaign.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description: description?.trim() ?? null }),
        ...(goal !== undefined && { goal: goal?.trim() ?? null }),
        ...(startDate !== undefined && { startDate: startDate ? new Date(startDate) : null }),
        ...(endDate !== undefined && { endDate: endDate ? new Date(endDate) : null }),
        ...(isActive !== undefined && { isActive }),
      },
      select: {
        id: true,
        name: true,
        description: true,
        goal: true,
        startDate: true,
        endDate: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { posts: true } },
      },
    });

    return NextResponse.json(updated);
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── DELETE /api/campaigns/[id] ────────────────────────────────────────────────

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

    if (!id || id.length < 10) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const campaign = await prisma.campaign.findUnique({ where: { id } });
    if (!campaign || campaign.userId !== session.user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.campaign.delete({ where: { id } });

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return handleRouteError(err);
  }
}
