import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";

const MAX_TESTIMONIALS_PER_USER = 200;

const submitSchema = z.object({
  authorName: z.string().min(1).max(200),
  authorTitle: z.string().max(200).optional().nullable(),
  company: z.string().max(200).optional().nullable(),
  content: z.string().min(1).max(5000),
  rating: z.number().int().min(1).max(5).optional().nullable(),
});

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

// ── GET /api/t/[slug] ─────────────────────────────────────────────────────────
// Public endpoint — no auth required; returns collection page config

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
): Promise<NextResponse> {
  try {
    const { slug } = await params;

    const page = await prisma.testimonialPage.findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        title: true,
        welcomeMessage: true,
        thankYouMessage: true,
        isActive: true,
      },
    });

    if (!page || !page.isActive) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ page });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── POST /api/t/[slug] ────────────────────────────────────────────────────────
// Public endpoint — no auth required; accepts a testimonial submission for review

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
): Promise<NextResponse> {
  try {
    const { slug } = await params;

    const ip = getClientIp(request);
    const rl = await rateLimit(`testimonial-submit:${slug}:${ip}`, {
      limit: 5,
      windowMs: 60_000,
    });
    if (!rl.success) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: rateLimitHeaders(rl) }
      );
    }

    const page = await prisma.testimonialPage.findUnique({ where: { slug } });
    if (!page || !page.isActive) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = submitSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", issues: parsed.error.issues },
        { status: 422 }
      );
    }

    const count = await prisma.testimonial.count({ where: { userId: page.userId } });
    if (count >= MAX_TESTIMONIALS_PER_USER) {
      return NextResponse.json({ error: "Submissions are currently closed" }, { status: 422 });
    }

    const { authorName, authorTitle, company, content, rating } = parsed.data;

    await prisma.testimonial.create({
      data: {
        userId: page.userId,
        authorName,
        authorTitle: authorTitle ?? null,
        company: company ?? null,
        content,
        rating: rating ?? null,
        source: "public",
        approved: false,
        isFeatured: false,
      },
    });

    return NextResponse.json({ success: true, thankYouMessage: page.thankYouMessage }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
