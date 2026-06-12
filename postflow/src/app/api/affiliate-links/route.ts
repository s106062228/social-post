import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const MAX_AFFILIATE_LINKS = 200;

const createSchema = z.object({
  name: z.string().min(1).max(200),
  originalUrl: z.string().url("Must be a valid URL").max(2048),
  affiliateCode: z.string().max(200).optional(),
  platform: z.string().max(100).optional(),
  category: z.string().max(100).optional(),
  currency: z.string().length(3).default("USD"),
});

// ── GET /api/affiliate-links ──────────────────────────────────────────────────

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

    const links = await prisma.affiliateLink.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ links }, { headers: rateLimitHeaders(rl) });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── POST /api/affiliate-links ─────────────────────────────────────────────────

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

    const count = await prisma.affiliateLink.count({
      where: { userId: session.user.id },
    });
    if (count >= MAX_AFFILIATE_LINKS) {
      return NextResponse.json(
        { error: `Maximum ${MAX_AFFILIATE_LINKS} affiliate links per user` },
        { status: 422 }
      );
    }

    const { name, originalUrl, affiliateCode, platform, category, currency } = parsed.data;

    const link = await prisma.affiliateLink.create({
      data: {
        userId: session.user.id,
        name,
        originalUrl,
        affiliateCode: affiliateCode ?? null,
        platform: platform ?? null,
        category: category ?? null,
        currency,
      },
    });

    return NextResponse.json({ link }, { status: 201, headers: rateLimitHeaders(rl) });
  } catch (err) {
    return handleRouteError(err);
  }
}
