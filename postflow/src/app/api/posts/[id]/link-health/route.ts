import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const postIdSchema = z.string().cuid();

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
    if (!postIdSchema.safeParse(id).success) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const post = await prisma.post.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });

    if (!post || post.userId !== session.user.id) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const checks = await prisma.linkHealthCheck.findMany({
      where: { postId: post.id },
      orderBy: { checkedAt: "desc" },
      select: {
        id: true,
        url: true,
        statusCode: true,
        isHealthy: true,
        errorMessage: true,
        checkedAt: true,
      },
    });

    const broken = checks.filter((c) => !c.isHealthy).length;

    return NextResponse.json({
      checks,
      total: checks.length,
      healthy: checks.length - broken,
      broken,
      lastCheckedAt: checks[0]?.checkedAt ?? null,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
