import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const updateRotationSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  groupIds: z.array(z.string().min(1)).min(1).max(50).optional(),
  isActive: z.boolean().optional(),
});

// ── PATCH /api/hashtag-rotations/[id] ────────────────────────────────────────

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

    const rotation = await prisma.hashtagRotation.findFirst({
      where: { id, userId: session.user.id },
    });
    if (!rotation) {
      return NextResponse.json({ error: "Rotation not found" }, { status: 404 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = updateRotationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { name, description, groupIds, isActive } = parsed.data;

    // If groupIds are being updated, validate ownership
    if (groupIds) {
      const ownedGroups = await prisma.hashtagGroup.findMany({
        where: { id: { in: groupIds }, userId: session.user.id },
        select: { id: true },
      });
      if (ownedGroups.length !== groupIds.length) {
        return NextResponse.json(
          { error: "One or more hashtag groups not found" },
          { status: 404 }
        );
      }
    }

    const updated = await prisma.hashtagRotation.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description: description?.trim() ?? null }),
        ...(groupIds !== undefined && { groupIds, currentIndex: 0 }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    return NextResponse.json(updated);
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── DELETE /api/hashtag-rotations/[id] ───────────────────────────────────────

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

    const rotation = await prisma.hashtagRotation.findFirst({
      where: { id, userId: session.user.id },
    });
    if (!rotation) {
      return NextResponse.json({ error: "Rotation not found" }, { status: 404 });
    }

    await prisma.hashtagRotation.delete({ where: { id } });

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return handleRouteError(err);
  }
}
