import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const MAX_SHORT_LINKS = 200;
const SLUG_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";
const AUTO_SLUG_LENGTH = 6;

function generateSlug(): string {
  let slug = "";
  for (let i = 0; i < AUTO_SLUG_LENGTH; i++) {
    slug += SLUG_CHARS[Math.floor(Math.random() * SLUG_CHARS.length)];
  }
  return slug;
}

const createSchema = z.object({
  originalUrl: z.string().url("Must be a valid URL").max(2048),
  slug: z
    .string()
    .min(3)
    .max(50)
    .regex(/^[a-z0-9-_]+$/, "Only lowercase letters, numbers, hyphens and underscores")
    .optional(),
  title: z.string().max(200).optional(),
  expiresAt: z.string().datetime().optional(),
});

// ── GET /api/short-links ──────────────────────────────────────────────────────

export async function GET(): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = await apiLimiter(session.user.id);
    if (!rl.success) {
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        { status: 429, headers: rateLimitHeaders(rl) }
      );
    }

    const links = await prisma.shortLink.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(
      { links },
      { headers: rateLimitHeaders(rl) }
    );
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── POST /api/short-links ─────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = await apiLimiter(session.user.id);
    if (!rl.success) {
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        { status: 429, headers: rateLimitHeaders(rl) }
      );
    }

    const body: unknown = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const count = await prisma.shortLink.count({
      where: { userId: session.user.id },
    });
    if (count >= MAX_SHORT_LINKS) {
      return NextResponse.json(
        { error: `Maximum ${MAX_SHORT_LINKS} short links per user` },
        { status: 422 }
      );
    }

    const { originalUrl, slug: customSlug, title, expiresAt } = parsed.data;

    // Determine slug — use custom or auto-generate (with collision retry)
    let slug = customSlug ?? generateSlug();
    if (customSlug) {
      const existing = await prisma.shortLink.findUnique({ where: { slug } });
      if (existing) {
        return NextResponse.json(
          { error: "Slug already taken" },
          { status: 409 }
        );
      }
    } else {
      // Auto-generate: retry up to 10 times on collision
      for (let attempt = 0; attempt < 10; attempt++) {
        const existing = await prisma.shortLink.findUnique({ where: { slug } });
        if (!existing) break;
        slug = generateSlug();
      }
    }

    const link = await prisma.shortLink.create({
      data: {
        userId: session.user.id,
        originalUrl,
        slug,
        title: title ?? null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
    });

    return NextResponse.json({ link }, { status: 201, headers: rateLimitHeaders(rl) });
  } catch (err) {
    return handleRouteError(err);
  }
}
