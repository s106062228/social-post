import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const filtersSchema = z.object({
  status: z.string().optional(),
  platform: z.string().optional(),
  tag: z.string().optional(),
  search: z.string().optional(),
  starred: z.string().optional(),
  evergreen: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

const createPresetSchema = z.object({
  name: z.string().min(1).max(100),
  filters: filtersSchema,
});

const MAX_PRESETS = 20;

// ── GET /api/filter-presets ───────────────────────────────────────────────────

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

    const presets = await prisma.filterPreset.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, filters: true, createdAt: true },
    });

    return NextResponse.json({ presets });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── POST /api/filter-presets ──────────────────────────────────────────────────

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

    const parsed = createPresetSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const count = await prisma.filterPreset.count({
      where: { userId: session.user.id },
    });
    if (count >= MAX_PRESETS) {
      return NextResponse.json(
        { error: `Maximum ${MAX_PRESETS} filter presets allowed` },
        { status: 422 }
      );
    }

    const preset = await prisma.filterPreset.create({
      data: {
        userId: session.user.id,
        name: parsed.data.name.trim(),
        filters: parsed.data.filters,
      },
      select: { id: true, name: true, filters: true, createdAt: true },
    });

    return NextResponse.json(preset, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
