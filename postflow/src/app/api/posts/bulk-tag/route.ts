import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PostStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const bulkTagSchema = z.object({
  postIds: z.array(z.string().cuid()).min(1).max(100),
  tagIds: z.array(z.string().cuid()).min(1).max(50),
  action: z.enum(["add", "remove"]),
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

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = bulkTagSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { postIds, tagIds, action } = parsed.data;
    const userId = session.user.id;

    // Verify all tags belong to the user
    const tags = await prisma.tag.findMany({
      where: { id: { in: tagIds }, userId },
      select: { id: true },
    });
    if (tags.length !== tagIds.length) {
      return NextResponse.json({ error: "One or more tags not found" }, { status: 404 });
    }

    // Load posts — only those owned by the user, skipping PUBLISHING
    const posts = await prisma.post.findMany({
      where: { id: { in: postIds }, userId },
      select: { id: true, status: true },
    });

    const eligible = posts.filter((p) => p.status !== PostStatus.PUBLISHING);
    const skipped = posts.length - eligible.length;
    const eligibleIds = eligible.map((p) => p.id);

    if (eligibleIds.length === 0) {
      return NextResponse.json({ updated: 0, skipped });
    }

    if (action === "add") {
      // Upsert PostTag rows — createMany with skipDuplicates
      const pairs: { postId: string; tagId: string }[] = [];
      for (const postId of eligibleIds) {
        for (const tagId of tagIds) {
          pairs.push({ postId, tagId });
        }
      }
      await prisma.postTag.createMany({ data: pairs, skipDuplicates: true });
    } else {
      // Remove PostTag rows
      await prisma.postTag.deleteMany({
        where: {
          postId: { in: eligibleIds },
          tagId: { in: tagIds },
        },
      });
    }

    return NextResponse.json({ updated: eligibleIds.length, skipped });
  } catch (err) {
    return handleRouteError(err);
  }
}
