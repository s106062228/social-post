import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma as db } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";
import { z } from "zod";
import { PostStatus, Platform } from "@prisma/client";
import { logActivity } from "@/lib/activity-log";

const startSchema = z.object({
  startDate: z.string().datetime(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await apiLimiter(session.user.id);
  if (!rl.success) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  const { id } = await params;
  const sequence = await db.postSequence.findFirst({
    where: { id, userId: session.user.id },
    include: { steps: { orderBy: { stepOrder: "asc" } } },
  });

  if (!sequence) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (sequence.status === "ACTIVE") {
    return NextResponse.json({ error: "Sequence is already active" }, { status: 409 });
  }

  if (sequence.status === "CANCELLED") {
    return NextResponse.json({ error: "Cancelled sequences cannot be restarted" }, { status: 409 });
  }

  if (sequence.steps.length === 0) {
    return NextResponse.json({ error: "Sequence has no steps" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = startSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const startDate = new Date(parsed.data.startDate);
  const createdPostIds: string[] = [];

  await db.$transaction(async (tx) => {
    for (const step of sequence.steps) {
      const scheduledAt = new Date(startDate);
      scheduledAt.setDate(scheduledAt.getDate() + step.delayDays);

      const post = await tx.post.create({
        data: {
          userId: session.user.id,
          content: step.content,
          mediaType: step.mediaType,
          mediaUrls: step.mediaUrls,
          status: PostStatus.SCHEDULED,
          scheduledAt,
        },
      });

      createdPostIds.push(post.id);

      await tx.sequenceStep.update({
        where: { id: step.id },
        data: { postId: post.id },
      });

      const validPlatforms = step.platforms.filter((p): p is Platform =>
        Object.values(Platform).includes(p as Platform)
      );

      for (const platform of validPlatforms) {
        const account = await tx.socialAccount.findFirst({
          where: { userId: session.user.id, platform, isActive: true },
        });
        if (account) {
          await tx.publishResult.create({
            data: {
              postId: post.id,
              platform,
              accountId: account.id,
              status: "PENDING",
            },
          });
        }
      }
    }

    await tx.postSequence.update({
      where: { id },
      data: { status: "ACTIVE", startDate },
    });
  });

  logActivity({
    userId: session.user.id,
    action: "sequence.started",
    entityId: id,
    entityType: "PostSequence",
    metadata: { name: sequence.name, postsCreated: createdPostIds.length },
  });

  return NextResponse.json({
    message: "Sequence started",
    postsCreated: createdPostIds.length,
    postIds: createdPostIds,
  });
}
