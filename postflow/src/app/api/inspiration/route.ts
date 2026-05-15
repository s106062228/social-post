import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { fetchOgMetadata } from "@/lib/og-preview";
import { Platform } from "@prisma/client";

const MAX_ITEMS = 200;

const createSchema = z.object({
  url: z.string().url().max(2000),
  notes: z.string().max(5000).optional().nullable(),
  platform: z.nativeEnum(Platform).optional().nullable(),
});

// ── GET /api/inspiration ──────────────────────────────────────────────────────

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

    const items = await prisma.inspirationItem.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        url: true,
        title: true,
        description: true,
        imageUrl: true,
        notes: true,
        platform: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ items });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── POST /api/inspiration ─────────────────────────────────────────────────────

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
        { error: "Validation error", issues: parsed.error.issues },
        { status: 422 }
      );
    }

    const { url, notes, platform } = parsed.data;

    // Enforce per-user limit
    const count = await prisma.inspirationItem.count({
      where: { userId: session.user.id },
    });
    if (count >= MAX_ITEMS) {
      return NextResponse.json(
        { error: `Maximum ${MAX_ITEMS} inspiration items per user` },
        { status: 422 }
      );
    }

    // Fetch OG metadata for the URL (fire-and-forget safe)
    const meta = await fetchOgMetadata(url).catch(() => ({
      url,
      title: "",
      description: "",
      image: "",
    }));

    const item = await prisma.inspirationItem.create({
      data: {
        userId: session.user.id,
        url,
        title: meta.title || null,
        description: meta.description || null,
        imageUrl: meta.image || null,
        notes: notes ?? null,
        platform: platform ?? null,
      },
      select: {
        id: true,
        url: true,
        title: true,
        description: true,
        imageUrl: true,
        notes: true,
        platform: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ item }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
