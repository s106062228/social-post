import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma as db } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";
import { logActivity } from "@/lib/activity-log";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await apiLimiter(session.user.id);
  if (!rl.success) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  const { id } = await params;
  const sequence = await db.postSequence.findFirst({
    where: { id, userId: session.user.id },
    include: { steps: true },
  });
  if (!sequence) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (sequence.status === "CANCELLED") {
    return NextResponse.json({ error: "Sequence already cancelled" }, { status: 409 });
  }

  const postIds = sequence.steps
    .map((s) => s.postId)
    .filter((pid): pid is string => pid !== null);

  await db.$transaction([
    db.post.updateMany({
      where: { id: { in: postIds }, status: "SCHEDULED" },
      data: { status: "DRAFT", scheduledAt: null },
    }),
    db.postSequence.update({
      where: { id },
      data: { status: "CANCELLED" },
    }),
  ]);

  logActivity({
    userId: session.user.id,
    action: "sequence.cancelled",
    entityId: id,
    entityType: "PostSequence",
    metadata: { name: sequence.name },
  });

  return NextResponse.json({ message: "Sequence cancelled" });
}
