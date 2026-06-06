import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const MAX_PAGES = 5;

const createSchema = z.object({
  slug: z
    .string()
    .min(3)
    .max(50)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens only"),
  title: z.string().min(1).max(200),
  welcomeMessage: z.string().max(2000).optional().nullable(),
  thankYouMessage: z.string().max(2000).optional().nullable(),
  isActive: z.boolean().optional(),
});

const select = {
  id: true,
  slug: true,
  title: true,
  welcomeMessage: true,
  thankYouMessage: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

// ── GET /api/testimonial-pages ────────────────────────────────────────────────

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

    const pages = await prisma.testimonialPage.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      select,
    });

    return NextResponse.json({ pages });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── POST /api/testimonial-pages ───────────────────────────────────────────────

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

    const count = await prisma.testimonialPage.count({
      where: { userId: session.user.id },
    });
    if (count >= MAX_PAGES) {
      return NextResponse.json(
        { error: `Maximum ${MAX_PAGES} testimonial pages per user` },
        { status: 422 }
      );
    }

    const existing = await prisma.testimonialPage.findUnique({
      where: { slug: parsed.data.slug },
    });
    if (existing) {
      return NextResponse.json({ error: "Slug is already taken" }, { status: 409 });
    }

    const { slug, title, welcomeMessage, thankYouMessage, isActive } = parsed.data;

    const page = await prisma.testimonialPage.create({
      data: {
        userId: session.user.id,
        slug,
        title,
        welcomeMessage: welcomeMessage ?? null,
        thankYouMessage: thankYouMessage ?? null,
        isActive: isActive ?? true,
      },
      select,
    });

    return NextResponse.json({ page }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
