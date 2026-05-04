import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const createSchema = z.object({
  name: z.string().min(1).max(100),
  source: z.string().min(1).max(100),
  medium: z.string().min(1).max(100),
  campaign: z.string().max(200).optional().nullable(),
  content: z.string().max(200).optional().nullable(),
  term: z.string().max(200).optional().nullable(),
});

const MAX_PRESETS = 20;

// ── GET /api/utm-presets ──────────────────────────────────────────────────────

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

    const presets = await prisma.utmPreset.findMany({
      where: { userId: session.user.id },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        name: true,
        source: true,
        medium: true,
        campaign: true,
        content: true,
        term: true,
        isDefault: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ presets });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── POST /api/utm-presets ─────────────────────────────────────────────────────

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
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const count = await prisma.utmPreset.count({ where: { userId: session.user.id } });
    if (count >= MAX_PRESETS) {
      return NextResponse.json(
        { error: `Maximum ${MAX_PRESETS} UTM presets allowed` },
        { status: 422 }
      );
    }

    const { name, source, medium, campaign, content, term } = parsed.data;

    const preset = await prisma.utmPreset.create({
      data: {
        userId: session.user.id,
        name: name.trim(),
        source: source.trim(),
        medium: medium.trim(),
        campaign: campaign?.trim() ?? null,
        content: content?.trim() ?? null,
        term: term?.trim() ?? null,
      },
      select: {
        id: true,
        name: true,
        source: true,
        medium: true,
        campaign: true,
        content: true,
        term: true,
        isDefault: true,
        createdAt: true,
      },
    });

    return NextResponse.json(preset, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
