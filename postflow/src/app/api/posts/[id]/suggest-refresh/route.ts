import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Platform } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { suggestContentRefresh } from "@/lib/ai";

const postIdSchema = z.string().cuid();

const refreshSchema = z.object({
  targetPlatforms: z.array(z.nativeEnum(Platform)).min(1).max(10).optional(),
});

export async function POST(
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

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "AI features are not configured" },
        { status: 503 }
      );
    }

    const { id } = await params;
    if (!postIdSchema.safeParse(id).success) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const parsed = refreshSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const post = await prisma.post.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        content: true,
        createdAt: true,
        publishResults: {
          select: { platform: true },
        },
      },
    });

    if (!post || post.userId !== session.user.id) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const publishedPlatforms = post.publishResults.map((r) => r.platform as string);
    const targetPlatforms =
      parsed.data.targetPlatforms?.map((p) => p as string) ??
      (publishedPlatforms.length > 0 ? publishedPlatforms : Object.values(Platform));

    const originalDate = post.createdAt.toISOString().split("T")[0];
    const result = await suggestContentRefresh(post.content, originalDate, targetPlatforms);

    return NextResponse.json(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
