import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PostStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { suggestTagsForContent } from "@/lib/ai";

const bulkAutoTagSchema = z.object({
  postIds: z.array(z.string().cuid()).min(1).max(50),
  applyTopN: z.number().int().min(1).max(10).default(3),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
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
        { error: "AI features are not enabled" },
        { status: 503 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = bulkAutoTagSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          issues: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { postIds, applyTopN } = parsed.data;
    const userId = session.user.id;

    // Load posts — only those owned by the user
    const posts = await prisma.post.findMany({
      where: { id: { in: postIds }, userId },
      select: { id: true, content: true, status: true },
    });

    // Load existing tags for the user
    const existingTags = await prisma.tag.findMany({
      where: { userId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    let tagged = 0;
    let created = 0;
    let skipped = 0;

    for (const post of posts) {
      // Skip posts that are currently being published
      if (post.status === PostStatus.PUBLISHING) {
        skipped++;
        continue;
      }

      const suggestions = await suggestTagsForContent(
        post.content,
        existingTags
      );
      const topSuggestions = suggestions.slice(0, applyTopN);

      if (topSuggestions.length === 0) {
        skipped++;
        continue;
      }

      // Resolve or create tags for each suggestion
      const tagIdsToApply: string[] = [];

      for (const suggestion of topSuggestions) {
        if (!suggestion.isNew && suggestion.tagId) {
          tagIdsToApply.push(suggestion.tagId);
        } else {
          // Create new tag
          const newTag = await prisma.tag.create({
            data: {
              userId,
              name: suggestion.name.slice(0, 50),
              color: "#6366f1",
            },
            select: { id: true, name: true },
          });
          existingTags.push(newTag);
          tagIdsToApply.push(newTag.id);
          created++;
        }
      }

      // Upsert PostTag records
      await prisma.$transaction(
        tagIdsToApply.map((tagId) =>
          prisma.postTag.upsert({
            where: { postId_tagId: { postId: post.id, tagId } },
            create: { postId: post.id, tagId },
            update: {},
          })
        )
      );

      tagged++;
    }

    return NextResponse.json({ tagged, created, skipped });
  } catch (err) {
    return handleRouteError(err);
  }
}
