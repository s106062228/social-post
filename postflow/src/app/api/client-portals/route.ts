import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const MAX_PORTALS = 10;

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 60);
}

async function generateUniqueSlug(base: string): Promise<string> {
  const slug = slugify(base) || "portal";
  const existing = await prisma.clientPortal.findUnique({ where: { slug } });
  if (!existing) return slug;
  // Append random suffix
  const suffix = Math.random().toString(36).substring(2, 7);
  return `${slug}-${suffix}`;
}

const createSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(500).optional().nullable(),
  slug: z
    .string()
    .min(3)
    .max(60)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens")
    .optional(),
  accentColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional()
    .default("#6366f1"),
  showCalendar: z.boolean().optional().default(true),
  showAnalytics: z.boolean().optional().default(true),
  showPosts: z.boolean().optional().default(true),
  isPublished: z.boolean().optional().default(false),
  expiresAt: z.string().datetime().optional().nullable(),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
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

    const portals = await prisma.clientPortal.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        accentColor: true,
        showCalendar: true,
        showAnalytics: true,
        showPosts: true,
        isPublished: true,
        expiresAt: true,
        views: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ portals });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
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

    const count = await prisma.clientPortal.count({
      where: { userId: session.user.id },
    });
    if (count >= MAX_PORTALS) {
      return NextResponse.json(
        { error: `Maximum of ${MAX_PORTALS} client portals reached` },
        { status: 422 }
      );
    }

    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { title, description, slug: providedSlug, accentColor, showCalendar, showAnalytics, showPosts, isPublished, expiresAt } = parsed.data;

    let slug: string;
    if (providedSlug) {
      const existing = await prisma.clientPortal.findUnique({ where: { slug: providedSlug } });
      if (existing) {
        return NextResponse.json({ error: "Slug already in use" }, { status: 409 });
      }
      slug = providedSlug;
    } else {
      slug = await generateUniqueSlug(title);
    }

    const portal = await prisma.clientPortal.create({
      data: {
        userId: session.user.id,
        slug,
        title,
        description: description ?? null,
        accentColor,
        showCalendar,
        showAnalytics,
        showPosts,
        isPublished,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
    });

    return NextResponse.json({ portal }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
