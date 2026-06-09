import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma as db } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await apiLimiter(session.user.id);
  if (!rl.success) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  const { id } = await params;
  const sequence = await db.postSequence.findFirst({ where: { id, userId: session.user.id } });
  if (!sequence) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (sequence.status !== "ACTIVE") {
    return NextResponse.json({ error: "Only active sequences can be paused" }, { status: 409 });
  }

  const updated = await db.postSequence.update({
    where: { id },
    data: { status: "PAUSED" },
    include: { steps: { orderBy: { stepOrder: "asc" } } },
  });

  return NextResponse.json({ sequence: updated });
}
