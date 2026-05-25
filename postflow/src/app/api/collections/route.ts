import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const MAX_COLLECTIONS = 50;

const createSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional()
    .default("#6366f1"),
});

// ── GET /api/collections ──────────────────────────────────────────────────────

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

    const collections = await prisma.postCollection.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        description: true,
        color: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { posts: true } },
      },
    });

    return NextResponse.json({ collections });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── POST /api/collections ─────────────────────────────────────────────────────

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

    const count = await prisma.postCollection.count({
      where: { userId: session.user.id },
    });
    if (count >= MAX_COLLECTIONS) {
      return NextResponse.json(
        { error: `Maximum of ${MAX_COLLECTIONS} collections reached` },
        { status: 422 }
      );
    }

    const body = createSchema.safeParse(await req.json());
    if (!body.success) {
      return NextResponse.json(
        { error: body.error.flatten() },
        { status: 400 }
      );
    }

    const collection = await prisma.postCollection.create({
      data: {
        userId: session.user.id,
        name: body.data.name,
        description: body.data.description,
        color: body.data.color,
      },
      select: {
        id: true,
        name: true,
        description: true,
        color: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { posts: true } },
      },
    });

    return NextResponse.json({ collection }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
