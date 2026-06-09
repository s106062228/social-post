import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma as db } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";
import { z } from "zod";
import { MediaType } from "@prisma/client";

const createStepSchema = z.object({
  content: z.string().min(1).max(10000),
  delayDays: z.number().int().min(0).max(3650).default(0),
  stepOrder: z.number().int().min(0).optional(),
  mediaType: z.nativeEnum(MediaType).default("NONE"),
  mediaUrls: z.array(z.string()).default([]),
  platforms: z.array(z.string()).default([]),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await apiLimiter(session.user.id);
  if (!rl.success) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  const { id } = await params;
  const sequence = await db.postSequence.findFirst({ where: { id, userId: session.user.id } });
  if (!sequence) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const steps = await db.sequenceStep.findMany({
    where: { sequenceId: id },
    orderBy: { stepOrder: "asc" },
  });

  return NextResponse.json({ steps });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await apiLimiter(session.user.id);
  if (!rl.success) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  const { id } = await params;
  const sequence = await db.postSequence.findFirst({ where: { id, userId: session.user.id } });
  if (!sequence) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const stepCount = await db.sequenceStep.count({ where: { sequenceId: id } });
  if (stepCount >= 50) {
    return NextResponse.json({ error: "Maximum 50 steps per sequence" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createStepSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const order = parsed.data.stepOrder ?? stepCount;

  const step = await db.sequenceStep.create({
    data: {
      sequenceId: id,
      content: parsed.data.content,
      delayDays: parsed.data.delayDays,
      stepOrder: order,
      mediaType: parsed.data.mediaType,
      mediaUrls: parsed.data.mediaUrls,
      platforms: parsed.data.platforms,
    },
  });

  return NextResponse.json({ step }, { status: 201 });
}
