import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const putSchema = z.object({
  checks: z.record(z.string(), z.boolean()),
});

// ── GET /api/posts/[id]/checklist ─────────────────────────────────────────────

export async function GET(
  _request: NextRequest,
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

    const { id } = await params;

    const post = await prisma.post.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!post || post.userId !== session.user.id) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const [items, record] = await Promise.all([
      prisma.checklistItem.findMany({
        where: { userId: session.user.id, isActive: true },
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          label: true,
          description: true,
          order: true,
          isActive: true,
        },
      }),
      prisma.postChecklistRecord.findUnique({
        where: { postId: id },
        select: { checks: true },
      }),
    ]);

    const checks = (record?.checks as Record<string, boolean>) ?? {};

    return NextResponse.json({ items, checks });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── PUT /api/posts/[id]/checklist ─────────────────────────────────────────────

export async function PUT(
  request: NextRequest,
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

    const { id } = await params;

    const post = await prisma.post.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!post || post.userId !== session.user.id) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const body = await request.json();
    const parsed = putSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const record = await prisma.postChecklistRecord.upsert({
      where: { postId: id },
      create: {
        postId: id,
        userId: session.user.id,
        checks: parsed.data.checks,
      },
      update: {
        checks: parsed.data.checks,
      },
      select: {
        id: true,
        postId: true,
        checks: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ record });
  } catch (err) {
    return handleRouteError(err);
  }
}
