import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { extractUrls, checkUrlsHealth } from "@/lib/link-health";

const postIdSchema = z.string().cuid();

export async function POST(
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
      select: { id: true, userId: true, content: true },
    });

    if (!post || post.userId !== session.user.id) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const urls = extractUrls(post.content);
    if (urls.length === 0) {
      return NextResponse.json({ checked: 0, healthy: 0, broken: 0, results: [] });
    }

    const results = await checkUrlsHealth(urls);

    await prisma.$transaction(
      results.map((r) =>
        prisma.linkHealthCheck.upsert({
          where: { postId_url: { postId: post.id, url: r.url } },
          update: {
            statusCode: r.statusCode,
            isHealthy: r.isHealthy,
            errorMessage: r.errorMessage,
            checkedAt: new Date(),
          },
          create: {
            postId: post.id,
            userId: session.user.id,
            url: r.url,
            statusCode: r.statusCode,
            isHealthy: r.isHealthy,
            errorMessage: r.errorMessage,
          },
        })
      )
    );

    const healthy = results.filter((r) => r.isHealthy).length;

    return NextResponse.json({
      checked: results.length,
      healthy,
      broken: results.length - healthy,
      results,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
