import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const MAX_ROTATIONS = 20;

const createRotationSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  groupIds: z
    .array(z.string().min(1))
    .min(1, "At least one hashtag group is required")
    .max(50),
  isActive: z.boolean().optional(),
});

// ── GET /api/hashtag-rotations ────────────────────────────────────────────────

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

    const rotations = await prisma.hashtagRotation.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
    });

    // Resolve group names for each rotation
    const allGroupIds = Array.from(
      new Set(rotations.flatMap((r) => r.groupIds))
    );
    const groups = await prisma.hashtagGroup.findMany({
      where: { id: { in: allGroupIds }, userId: session.user.id },
      select: { id: true, name: true, hashtags: true },
    });
    const groupMap = new Map(groups.map((g) => [g.id, g]));

    const enriched = rotations.map((r) => ({
      ...r,
      groups: r.groupIds
        .map((id) => groupMap.get(id))
        .filter(Boolean),
      currentGroup: groupMap.get(r.groupIds[r.currentIndex] ?? "") ?? null,
    }));

    return NextResponse.json({ rotations: enriched });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── POST /api/hashtag-rotations ───────────────────────────────────────────────

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

    const count = await prisma.hashtagRotation.count({
      where: { userId: session.user.id },
    });
    if (count >= MAX_ROTATIONS) {
      return NextResponse.json(
        { error: `Maximum ${MAX_ROTATIONS} rotations allowed` },
        { status: 422 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = createRotationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { name, description, groupIds, isActive } = parsed.data;

    // Validate that all groupIds belong to this user
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

    const rotation = await prisma.hashtagRotation.create({
      data: {
        userId: session.user.id,
        name: name.trim(),
        description: description?.trim(),
        groupIds,
        currentIndex: 0,
        isActive: isActive ?? true,
      },
    });

    return NextResponse.json(rotation, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
