import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const MAX_TESTIMONIALS = 200;

const createSchema = z.object({
  authorName: z.string().min(1).max(200),
  authorTitle: z.string().max(200).optional().nullable(),
  company: z.string().max(200).optional().nullable(),
  content: z.string().min(1).max(5000),
  rating: z.number().int().min(1).max(5).optional().nullable(),
  sourceUrl: z.string().url().max(2000).optional().nullable(),
  imageUrl: z.string().url().max(2000).optional().nullable(),
  isFeatured: z.boolean().optional(),
});

const select = {
  id: true,
  authorName: true,
  authorTitle: true,
  company: true,
  content: true,
  rating: true,
  sourceUrl: true,
  imageUrl: true,
  isFeatured: true,
  source: true,
  approved: true,
  createdAt: true,
  updatedAt: true,
} as const;

// ── GET /api/testimonials ─────────────────────────────────────────────────────

export async function GET(request: NextRequest): Promise<NextResponse> {
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

    const featuredParam = request.nextUrl.searchParams.get("featured");
    const featured = featuredParam === "true" ? true : featuredParam === "false" ? false : undefined;

    const approvedParam = request.nextUrl.searchParams.get("approved");
    const approved = approvedParam === "true" ? true : approvedParam === "false" ? false : undefined;

    const items = await prisma.testimonial.findMany({
      where: {
        userId: session.user.id,
        ...(featured !== undefined && { isFeatured: featured }),
        ...(approved !== undefined && { approved }),
      },
      orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }],
      select,
    });

    return NextResponse.json({ items });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── POST /api/testimonials ────────────────────────────────────────────────────

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

    const count = await prisma.testimonial.count({
      where: { userId: session.user.id },
    });
    if (count >= MAX_TESTIMONIALS) {
      return NextResponse.json(
        { error: `Maximum ${MAX_TESTIMONIALS} testimonials per user` },
        { status: 422 }
      );
    }

    const {
      authorName,
      authorTitle,
      company,
      content,
      rating,
      sourceUrl,
      imageUrl,
      isFeatured,
    } = parsed.data;

    const item = await prisma.testimonial.create({
      data: {
        userId: session.user.id,
        authorName,
        authorTitle: authorTitle ?? null,
        company: company ?? null,
        content,
        rating: rating ?? null,
        sourceUrl: sourceUrl ?? null,
        imageUrl: imageUrl ?? null,
        isFeatured: isFeatured ?? false,
      },
      select,
    });

    return NextResponse.json({ item }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
