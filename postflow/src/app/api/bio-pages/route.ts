import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const MAX_PAGES = 10;

const createSchema = z.object({
  slug: z
    .string()
    .min(3)
    .max(50)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens only"),
  title: z.string().min(1).max(100),
  bio: z.string().max(500).optional().nullable(),
  isPublished: z.boolean().optional(),
});

// ── GET /api/bio-pages ────────────────────────────────────────────────────────

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

    const pages = await prisma.linkBioPage.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        slug: true,
        title: true,
        bio: true,
        isPublished: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { items: true } },
      },
    });

    return NextResponse.json({ pages });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── POST /api/bio-pages ───────────────────────────────────────────────────────

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

    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const count = await prisma.linkBioPage.count({
      where: { userId: session.user.id },
    });
    if (count >= MAX_PAGES) {
      return NextResponse.json(
        { error: `Maximum ${MAX_PAGES} bio pages allowed` },
        { status: 422 }
      );
    }

    const existing = await prisma.linkBioPage.findUnique({
      where: { slug: parsed.data.slug },
    });
    if (existing) {
      return NextResponse.json(
        { error: "Slug is already taken" },
        { status: 409 }
      );
    }

    const page = await prisma.linkBioPage.create({
      data: {
        userId: session.user.id,
        slug: parsed.data.slug,
        title: parsed.data.title,
        bio: parsed.data.bio ?? null,
        isPublished: parsed.data.isPublished ?? true,
      },
      select: {
        id: true,
        slug: true,
        title: true,
        bio: true,
        isPublished: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { items: true } },
      },
    });

    return NextResponse.json({ page }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
