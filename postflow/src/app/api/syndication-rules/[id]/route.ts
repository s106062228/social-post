import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { Platform } from "@prisma/client";

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  sourcePlatform: z.nativeEnum(Platform).optional(),
  targetPlatforms: z.array(z.nativeEnum(Platform)).min(1).optional(),
  transformations: z
    .object({
      truncate: z.boolean().optional(),
      stripLinks: z.boolean().optional(),
      appendHashtags: z.string().max(500).optional(),
      customSuffix: z.string().max(500).optional(),
    })
    .optional(),
  delayMinutes: z.number().int().min(0).max(1440).optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
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

  const { id } = await params;
  const existing = await prisma.syndicationRule.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (existing.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  const sourcePlatform = data.sourcePlatform ?? existing.sourcePlatform;
  const targetPlatforms = data.targetPlatforms ?? (existing.targetPlatforms as Platform[]);
  if (targetPlatforms.includes(sourcePlatform)) {
    return NextResponse.json(
      { error: "Source platform cannot be a target platform" },
      { status: 400 }
    );
  }

  const rule = await prisma.syndicationRule.update({ where: { id }, data });
  return NextResponse.json({ rule });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
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

  const { id } = await params;
  const existing = await prisma.syndicationRule.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (existing.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.syndicationRule.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
