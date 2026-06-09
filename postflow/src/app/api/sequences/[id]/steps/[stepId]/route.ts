import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma as db } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";
import { z } from "zod";
import { MediaType } from "@prisma/client";

const updateStepSchema = z.object({
  content: z.string().min(1).max(10000).optional(),
  delayDays: z.number().int().min(0).max(3650).optional(),
  stepOrder: z.number().int().min(0).optional(),
  mediaType: z.nativeEnum(MediaType).optional(),
  mediaUrls: z.array(z.string()).optional(),
  platforms: z.array(z.string()).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; stepId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await apiLimiter(session.user.id);
  if (!rl.success) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  const { id, stepId } = await params;
  const sequence = await db.postSequence.findFirst({ where: { id, userId: session.user.id } });
  if (!sequence) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const step = await db.sequenceStep.findFirst({ where: { id: stepId, sequenceId: id } });
  if (!step) return NextResponse.json({ error: "Step not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = updateStepSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const updated = await db.sequenceStep.update({
    where: { id: stepId },
    data: parsed.data,
  });

  return NextResponse.json({ step: updated });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; stepId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await apiLimiter(session.user.id);
  if (!rl.success) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  const { id, stepId } = await params;
  const sequence = await db.postSequence.findFirst({ where: { id, userId: session.user.id } });
  if (!sequence) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const step = await db.sequenceStep.findFirst({ where: { id: stepId, sequenceId: id } });
  if (!step) return NextResponse.json({ error: "Step not found" }, { status: 404 });

  await db.sequenceStep.delete({ where: { id: stepId } });
  return new NextResponse(null, { status: 204 });
}
