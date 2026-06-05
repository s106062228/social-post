import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const MAX_MENTIONS = 500;
const PAGE_SIZE = 20;

const createSchema = z.object({
  content: z.string().min(1).max(10000),
  mentionUrl: z.string().url().optional().or(z.literal("")),
  platform: z.string().max(50).optional(),
  authorName: z.string().max(200).optional(),
  notes: z.string().max(5000).optional(),
  sentiment: z.enum(["POSITIVE", "NEUTRAL", "NEGATIVE"]).optional(),
  responseStatus: z.enum(["none", "acknowledged", "replied", "ignored"]).optional(),
  relatedPostId: z.string().optional(),
  mentionedAt: z.string().datetime().optional(),
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
    const sentiment = url.searchParams.get("sentiment");
    const platform = url.searchParams.get("platform");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const responseStatus = url.searchParams.get("responseStatus");
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? String(PAGE_SIZE), 10)));

    const where: Record<string, unknown> = { userId: session.user.id };

    if (sentiment && ["POSITIVE", "NEUTRAL", "NEGATIVE"].includes(sentiment)) {
      where.sentiment = sentiment;
    }
    if (platform) {
      where.platform = platform;
    }
    if (responseStatus && ["none", "acknowledged", "replied", "ignored"].includes(responseStatus)) {
      where.responseStatus = responseStatus;
    }
    if (from || to) {
      where.mentionedAt = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      };
    }

    const [mentions, total] = await Promise.all([
      prisma.brandMention.findMany({
        where,
        orderBy: { mentionedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          relatedPost: {
            select: { id: true, content: true, status: true },
          },
        },
      }),
      prisma.brandMention.count({ where }),
    ]);

    return NextResponse.json({ mentions, total, page, limit });
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

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const count = await prisma.brandMention.count({ where: { userId: session.user.id } });
    if (count >= MAX_MENTIONS) {
      return NextResponse.json(
        { error: `Maximum of ${MAX_MENTIONS} brand mentions reached` },
        { status: 422 }
      );
    }

    if (parsed.data.relatedPostId) {
      const post = await prisma.post.findFirst({
        where: { id: parsed.data.relatedPostId, userId: session.user.id },
      });
      if (!post) {
        return NextResponse.json({ error: "Related post not found" }, { status: 404 });
      }
    }

    const mention = await prisma.brandMention.create({
      data: {
        userId: session.user.id,
        content: parsed.data.content,
        mentionUrl: parsed.data.mentionUrl || null,
        platform: parsed.data.platform || null,
        authorName: parsed.data.authorName || null,
        notes: parsed.data.notes || null,
        sentiment: parsed.data.sentiment ?? "NEUTRAL",
        responseStatus: parsed.data.responseStatus ?? "none",
        relatedPostId: parsed.data.relatedPostId || null,
        mentionedAt: parsed.data.mentionedAt ? new Date(parsed.data.mentionedAt) : new Date(),
      },
      include: {
        relatedPost: {
          select: { id: true, content: true, status: true },
        },
      },
    });

    return NextResponse.json(mention, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
