import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const smartListFiltersSchema = z.object({
  statuses: z.array(z.string()).optional(),
  platforms: z.array(z.string()).optional(),
  sentiment: z.string().optional(),
  tagIds: z.array(z.string()).optional(),
  starred: z.boolean().optional(),
  evergreen: z.boolean().optional(),
  archived: z.boolean().optional(),
  contentContains: z.string().max(200).optional(),
  scheduledFrom: z.string().optional(),
  scheduledTo: z.string().optional(),
  contentCategory: z.string().optional(),
  workflowStageId: z.string().optional(),
  mediaType: z.string().optional(),
}).optional();

const updateSmartListSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  filters: smartListFiltersSchema,
  pinned: z.boolean().optional(),
});

// ── PATCH /api/smart-lists/[id] ───────────────────────────────────────────────

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

    const existing = await prisma.smartList.findUnique({ where: { id } });
    if (!existing || existing.userId !== session.user.id) {
      return NextResponse.json({ error: "Smart list not found" }, { status: 404 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = updateSmartListSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) updateData.name = parsed.data.name.trim();
    if (parsed.data.description !== undefined) updateData.description = parsed.data.description?.trim() ?? null;
    if (parsed.data.filters !== undefined) updateData.filters = parsed.data.filters;
    if (parsed.data.pinned !== undefined) updateData.pinned = parsed.data.pinned;

    const smartList = await prisma.smartList.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        description: true,
        filters: true,
        pinned: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ smartList });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── DELETE /api/smart-lists/[id] ──────────────────────────────────────────────

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

    const existing = await prisma.smartList.findUnique({ where: { id } });
    if (!existing || existing.userId !== session.user.id) {
      return NextResponse.json({ error: "Smart list not found" }, { status: 404 });
    }

    await prisma.smartList.delete({ where: { id } });

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return handleRouteError(err);
  }
}
