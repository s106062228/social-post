import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const POST_SELECT = {
  id: true,
  content: true,
  status: true,
  mediaType: true,
  scheduledAt: true,
  publishResults: {
    select: {
      platform: true,
      status: true,
      publishedAt: true,
      insights: {
        select: {
          impressions: true,
          reach: true,
          likes: true,
          comments: true,
          shares: true,
          syncedAt: true,
        },
      },
    },
  },
} as const;

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
    const test = await prisma.postABTest.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        name: true,
        winner: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
        postA: { select: POST_SELECT },
        postB: { select: POST_SELECT },
      },
    });

    if (!test) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (test.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ test });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function DELETE(
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
    const test = await prisma.postABTest.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!test) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (test.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.postABTest.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
