import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ConversionType } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const MAX_CONVERSIONS_PER_USER = 500;

const createSchema = z.object({
  type: z.nativeEnum(ConversionType),
  value: z.number().positive().optional().nullable(),
  currency: z.string().min(1).max(10).optional(),
  notes: z.string().max(1000).optional().nullable(),
  occurredAt: z.string().datetime().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
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

    const { id: postId } = await params;
    const userId = session.user.id;

    // Verify ownership
    const post = await prisma.post.findFirst({ where: { id: postId, userId } });
    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const conversions = await prisma.contentConversion.findMany({
      where: { postId, userId },
      orderBy: { occurredAt: "desc" },
    });

    return NextResponse.json({ conversions });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
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

    const { id: postId } = await params;
    const userId = session.user.id;

    // Verify ownership
    const post = await prisma.post.findFirst({ where: { id: postId, userId } });
    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    // Check per-user limit
    const count = await prisma.contentConversion.count({ where: { userId } });
    if (count >= MAX_CONVERSIONS_PER_USER) {
      return NextResponse.json(
        { error: `Maximum ${MAX_CONVERSIONS_PER_USER} conversions per user` },
        { status: 422 }
      );
    }

    const body: unknown = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { type, value, currency, notes, occurredAt } = parsed.data;

    const conversion = await prisma.contentConversion.create({
      data: {
        userId,
        postId,
        type,
        value: value ?? null,
        currency: currency ?? "USD",
        notes: notes ?? null,
        occurredAt: occurredAt ? new Date(occurredAt) : new Date(),
      },
    });

    return NextResponse.json({ conversion }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
