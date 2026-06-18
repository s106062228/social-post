import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const querySchema = z.object({
  category: z.string().optional(),
  tag: z.string().optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  page: z.coerce.number().int().min(1).default(1),
});

// ── GET /api/marketplace/templates ───────────────────────────────────────────
// Public endpoint — no session required.

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "anon";
    const rl = await apiLimiter.limit(ip);
    if (!rl.success) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: rateLimitHeaders(rl) }
      );
    }

    const params = querySchema.safeParse(
      Object.fromEntries(request.nextUrl.searchParams)
    );
    if (!params.success) {
      return NextResponse.json({ error: "Invalid query" }, { status: 400 });
    }

    const { category, tag, search, limit, page } = params.data;
    const skip = (page - 1) * limit;

    const where = {
      marketplacePublished: true,
      ...(category ? { marketplaceCategory: category } : {}),
      ...(tag ? { marketplaceTags: { has: tag } } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" as const } },
              { content: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [templates, total] = await Promise.all([
      prisma.template.findMany({
        where,
        orderBy: { importCount: "desc" },
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          content: true,
          mediaType: true,
          marketplaceCategory: true,
          marketplaceTags: true,
          importCount: true,
          createdAt: true,
        },
      }),
      prisma.template.count({ where }),
    ]);

    const sanitized = templates.map((t) => ({
      ...t,
      content: t.content.slice(0, 150),
    }));

    return NextResponse.json({
      templates: sanitized,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
