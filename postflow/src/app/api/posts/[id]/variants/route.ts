import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { MediaType, Platform } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { sanitizePostContent } from "@/lib/sanitize";

const postIdSchema = z.string().cuid();

const variantSchema = z.object({
  platform: z.nativeEnum(Platform),
  content: z.string().min(1).max(63206),
  mediaType: z.nativeEnum(MediaType).default(MediaType.NONE),
  mediaUrls: z.array(z.string().url()).default([]),
});

const putVariantsSchema = z.object({
  variants: z.array(variantSchema).max(3),
});

// ── GET /api/posts/[id]/variants ───────────────────────────────────────────────

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

    const post = await prisma.post.findUnique({ where: { id }, select: { userId: true } });
    if (!post || post.userId !== session.user.id) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const variants = await prisma.postVariant.findMany({
      where: { postId: id },
      orderBy: { platform: "asc" },
      select: {
        id: true,
        platform: true,
        content: true,
        mediaType: true,
        mediaUrls: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ variants });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── PUT /api/posts/[id]/variants ───────────────────────────────────────────────
// Replaces all variants for the post. Send an empty array to clear all variants.

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
    if (!postIdSchema.safeParse(id).success) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const post = await prisma.post.findUnique({ where: { id }, select: { userId: true } });
    if (!post || post.userId !== session.user.id) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = putVariantsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { variants } = parsed.data;

    // Ensure no duplicate platforms in the request
    const platforms = variants.map((v) => v.platform);
    if (new Set(platforms).size !== platforms.length) {
      return NextResponse.json(
        { error: "Duplicate platforms in variants" },
        { status: 400 }
      );
    }

    // Replace all variants atomically
    const saved = await prisma.$transaction(async (tx) => {
      await tx.postVariant.deleteMany({ where: { postId: id } });

      if (variants.length === 0) return [];

      return tx.postVariant.createManyAndReturn({
        data: variants.map((v) => ({
          postId: id,
          platform: v.platform,
          content: sanitizePostContent(v.content),
          mediaType: v.mediaType,
          mediaUrls: v.mediaUrls,
        })),
        select: {
          id: true,
          platform: true,
          content: true,
          mediaType: true,
          mediaUrls: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    });

    return NextResponse.json({ variants: saved });
  } catch (err) {
    return handleRouteError(err);
  }
}
