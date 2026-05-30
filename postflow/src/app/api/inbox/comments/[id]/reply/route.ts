import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Platform } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { getTokenWithRefresh } from "@/lib/auth/token-manager";
import { facebookAdapter } from "@/lib/platforms/facebook";
import { instagramAdapter } from "@/lib/platforms/instagram";
import type { PlatformAdapter } from "@/lib/platforms/types";
import { logActivity } from "@/lib/activity-log";

const replyAdapters: Partial<Record<Platform, PlatformAdapter>> = {
  [Platform.FACEBOOK]: facebookAdapter,
  [Platform.INSTAGRAM]: instagramAdapter,
};

const replySchema = z.object({
  reply: z.string().min(1).max(2200),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const rl = await apiLimiter(userId, { limit: 30, windowMs: 60_000 });
  if (!rl.success) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: rateLimitHeaders(rl) }
    );
  }

  try {
    const { id } = await params;
    const body = await req.json();
    const parsed = replySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const comment = await prisma.socialComment.findFirst({
      where: { id, userId },
      include: { account: true },
    });

    if (!comment) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const adapter = replyAdapters[comment.platform];
    if (!adapter?.addComment) {
      return NextResponse.json(
        { error: "Platform does not support replies" },
        { status: 400 }
      );
    }

    const token = await getTokenWithRefresh(comment.account);
    await adapter.addComment(comment.platformCommentId, parsed.data.reply, token);

    await prisma.socialComment.update({
      where: { id },
      data: { isReplied: true, isRead: true },
    });

    logActivity({ userId, action: "comment.replied", entityId: id, entityType: "SocialComment" });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
