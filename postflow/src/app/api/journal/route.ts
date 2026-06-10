import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const MAX_ENTRIES = 500;

const ENTRY_TYPES = ["SUCCESS", "FAILURE", "INSIGHT", "HYPOTHESIS", "EXPERIMENT"] as const;

const createSchema = z.object({
  title: z.string().min(1).max(300),
  entryType: z.enum(ENTRY_TYPES).default("INSIGHT"),
  content: z.string().min(1).max(10000),
  postId: z.string().optional(),
  rating: z.number().int().min(1).max(5).optional(),
  tags: z.array(z.string().max(50)).max(20).default([]),
  isPublicToTeam: z.boolean().default(false),
});

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

    const url = new URL(request.url);
    const entryType = url.searchParams.get("entryType");
    const tag = url.searchParams.get("tag");
    const postId = url.searchParams.get("postId");
    const search = url.searchParams.get("search");
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") ?? "20", 10)));
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { userId: session.user.id };
    if (entryType && ENTRY_TYPES.includes(entryType as (typeof ENTRY_TYPES)[number])) {
      where.entryType = entryType;
    }
    if (postId) where.postId = postId;
    if (tag) {
      where.tags = { has: tag };
    }
    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { content: { contains: search, mode: "insensitive" } },
      ];
    }

    const [entries, total] = await Promise.all([
      prisma.contentJournalEntry.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          post: { select: { id: true, content: true, status: true } },
        },
      }),
      prisma.contentJournalEntry.count({ where }),
    ]);

    return NextResponse.json({ entries, total, page, limit });
  } catch (err) {
    return handleRouteError(err);
  }
}

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

    const body = await request.json().catch(() => null);
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
    }

    const count = await prisma.contentJournalEntry.count({ where: { userId: session.user.id } });
    if (count >= MAX_ENTRIES) {
      return NextResponse.json({ error: `Max ${MAX_ENTRIES} journal entries` }, { status: 422 });
    }

    const { postId, ...rest } = parsed.data;

    // Verify post ownership if postId provided
    if (postId) {
      const post = await prisma.post.findFirst({ where: { id: postId, userId: session.user.id } });
      if (!post) {
        return NextResponse.json({ error: "Post not found" }, { status: 404 });
      }
    }

    const entry = await prisma.contentJournalEntry.create({
      data: {
        ...rest,
        userId: session.user.id,
        postId: postId ?? null,
      },
      include: {
        post: { select: { id: true, content: true, status: true } },
      },
    });

    return NextResponse.json({ entry }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
