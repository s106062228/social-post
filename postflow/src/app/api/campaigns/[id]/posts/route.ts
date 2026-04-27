import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

// ── Zod Schemas ───────────────────────────────────────────────────────────────

const addPostSchema = z.object({
  postId: z.string().min(1),
});

// ── POST /api/campaigns/[id]/posts ────────────────────────────────────────────

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

    const { id: campaignId } = await params;

    if (!campaignId || campaignId.length < 10) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign || campaign.userId !== session.user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = addPostSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { postId } = parsed.data;

    const post = await prisma.post.findUnique({ where: { id: postId } });
    if (!post || post.userId !== session.user.id) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    try {
      const entry = await prisma.campaignPost.create({
        data: { campaignId, postId },
        select: { campaignId: true, postId: true, addedAt: true },
      });
      return NextResponse.json(entry, { status: 201 });
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        "code" in err &&
        (err as { code: string }).code === "P2002"
      ) {
        return NextResponse.json(
          { error: "Post is already in this campaign" },
          { status: 409 }
        );
      }
      throw err;
    }
  } catch (err) {
    return handleRouteError(err);
  }
}
