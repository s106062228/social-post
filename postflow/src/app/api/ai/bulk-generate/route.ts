import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { handleRouteError } from "@/lib/errors";
import { prisma } from "@/lib/db";
import { bulkGenerateContent } from "@/lib/ai";
import { MediaType, PostStatus } from "@prisma/client";

const bulkGenerateSchema = z.object({
  topics: z.array(z.string().min(1).max(300)).min(1).max(20),
  platforms: z.array(z.string().min(1)).min(1).max(20),
  tone: z.string().max(100).optional(),
  createPosts: z.boolean().optional(),
  campaignName: z.string().max(200).optional(),
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
        { error: "AI features are not configured" },
        { status: 503 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = bulkGenerateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          issues: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { topics, platforms, tone, createPosts, campaignName } = parsed.data;
    const userId = session.user.id;

    const generated = await bulkGenerateContent(topics, platforms, tone);

    if (!createPosts) {
      return NextResponse.json({ generated });
    }

    // Optionally create a campaign
    let campaignId: string | undefined;
    if (campaignName) {
      const campaign = await prisma.campaign.create({
        data: {
          userId,
          name: campaignName,
          isActive: true,
        },
      });
      campaignId = campaign.id;
    }

    const createdPostIds: string[] = [];
    for (const item of generated) {
      const post = await prisma.post.create({
        data: {
          userId,
          content: item.content,
          mediaType: MediaType.NONE,
          mediaUrls: [],
          status: PostStatus.DRAFT,
        },
      });
      createdPostIds.push(post.id);

      if (campaignId) {
        await prisma.campaignPost.create({
          data: { campaignId, postId: post.id },
        });
      }
    }

    return NextResponse.json({ generated, createdPostIds, campaignId });
  } catch (err) {
    return handleRouteError(err);
  }
}
