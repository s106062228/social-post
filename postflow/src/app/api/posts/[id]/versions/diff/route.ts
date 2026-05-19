import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { computeDiff, diffStats } from "@/lib/text-diff";

const postIdSchema = z.string().cuid();
const versionIdSchema = z.string().cuid();

// ── GET /api/posts/[id]/versions/diff ─────────────────────────────────────────
// ?from=versionId&to=versionId|"current"
// Returns a word-level diff between two versions of a post's content.

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const limit = await apiLimiter(session.user.id);
    if (!limit.success) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: rateLimitHeaders(limit) }
      );
    }

    const { id } = await params;
    if (!postIdSchema.safeParse(id).success) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const post = await prisma.post.findUnique({
      where: { id },
      select: { userId: true, content: true, updatedAt: true },
    });
    if (!post || post.userId !== session.user.id) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");

    if (!fromParam || !toParam) {
      return NextResponse.json(
        { error: "Both 'from' and 'to' query params are required" },
        { status: 400 }
      );
    }

    // Resolve "from" version
    if (!versionIdSchema.safeParse(fromParam).success) {
      return NextResponse.json({ error: "Invalid 'from' version ID" }, { status: 400 });
    }
    const fromVersion = await prisma.postVersion.findFirst({
      where: { id: fromParam, postId: id },
      select: { id: true, content: true, createdAt: true },
    });
    if (!fromVersion) {
      return NextResponse.json({ error: "Version not found" }, { status: 404 });
    }

    // Resolve "to" version: CUID or the keyword "current"
    let toContent: string;
    let toMeta: { id: string; createdAt: Date };

    if (toParam === "current") {
      toContent = post.content;
      toMeta = { id: "current", createdAt: post.updatedAt };
    } else {
      if (!versionIdSchema.safeParse(toParam).success) {
        return NextResponse.json({ error: "Invalid 'to' version ID" }, { status: 400 });
      }
      const toVersion = await prisma.postVersion.findFirst({
        where: { id: toParam, postId: id },
        select: { id: true, content: true, createdAt: true },
      });
      if (!toVersion) {
        return NextResponse.json({ error: "Version not found" }, { status: 404 });
      }
      toContent = toVersion.content;
      toMeta = toVersion;
    }

    const diff = computeDiff(fromVersion.content, toContent);
    const stats = diffStats(diff);

    return NextResponse.json(
      {
        diff,
        stats,
        fromVersion: {
          id: fromVersion.id,
          createdAt: fromVersion.createdAt,
        },
        toVersion: {
          id: toMeta.id,
          createdAt: toMeta.createdAt,
        },
      },
      { headers: rateLimitHeaders(limit) }
    );
  } catch (err) {
    return handleRouteError(err);
  }
}
