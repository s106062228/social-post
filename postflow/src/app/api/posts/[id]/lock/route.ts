import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const postIdSchema = z.string().cuid();

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(
  _request: NextRequest,
  { params }: RouteContext
): Promise<NextResponse> {
  try {
    const { id } = await params;
    if (!postIdSchema.safeParse(id).success) {
      return NextResponse.json({ locked: false });
    }

    const lock = await prisma.postLock.findUnique({
      where: { postId: id },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    if (!lock || lock.expiresAt < new Date()) {
      if (lock) {
        await prisma.postLock.delete({ where: { postId: id } }).catch(() => {});
      }
      return NextResponse.json({ locked: false });
    }

    return NextResponse.json({
      locked: true,
      lockedBy: { id: lock.user.id, name: lock.user.name, email: lock.user.email },
      expiresAt: lock.expiresAt.toISOString(),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(
  _request: NextRequest,
  { params }: RouteContext
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
    if (!postIdSchema.safeParse(id).success) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const post = await prisma.post.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });
    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const existing = await prisma.postLock.findUnique({
      where: { postId: id },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    const now = new Date();
    if (existing && existing.expiresAt >= now && existing.userId !== session.user.id) {
      return NextResponse.json(
        {
          error: "Post is locked by another user",
          lockedBy: { id: existing.user.id, name: existing.user.name, email: existing.user.email },
          expiresAt: existing.expiresAt.toISOString(),
        },
        { status: 409 }
      );
    }

    const expiresAt = new Date(now.getTime() + LOCK_DURATION_MS);
    const lock = await prisma.postLock.upsert({
      where: { postId: id },
      create: { postId: id, userId: session.user.id, expiresAt },
      update: { userId: session.user.id, lockedAt: now, expiresAt },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    return NextResponse.json({
      locked: true,
      lockedBy: { id: lock.user.id, name: lock.user.name, email: lock.user.email },
      expiresAt: lock.expiresAt.toISOString(),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: RouteContext
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
    if (!postIdSchema.safeParse(id).success) {
      return NextResponse.json({ error: "Lock not found" }, { status: 404 });
    }

    const lock = await prisma.postLock.findUnique({
      where: { postId: id },
      select: { userId: true, expiresAt: true },
    });

    if (!lock) {
      return NextResponse.json({ error: "Lock not found" }, { status: 404 });
    }

    if (lock.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.postLock.delete({ where: { postId: id } });

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return handleRouteError(err);
  }
}
