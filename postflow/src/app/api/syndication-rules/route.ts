import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { Platform } from "@prisma/client";

const createSchema = z.object({
  name: z.string().min(1).max(100),
  sourcePlatform: z.nativeEnum(Platform),
  targetPlatforms: z.array(z.nativeEnum(Platform)).min(1),
  transformations: z
    .object({
      truncate: z.boolean().optional(),
      stripLinks: z.boolean().optional(),
      appendHashtags: z.string().max(500).optional(),
      customSuffix: z.string().max(500).optional(),
    })
    .optional()
    .default({}),
  delayMinutes: z.number().int().min(0).max(1440).default(0),
  isActive: z.boolean().default(true),
});

const MAX_RULES = 20;

export async function GET(): Promise<NextResponse> {
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

  const rules = await prisma.syndicationRule.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ rules });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
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
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { sourcePlatform, targetPlatforms } = parsed.data;
  if (targetPlatforms.includes(sourcePlatform)) {
    return NextResponse.json(
      { error: "Source platform cannot be a target platform" },
      { status: 400 }
    );
  }

  const count = await prisma.syndicationRule.count({
    where: { userId: session.user.id },
  });
  if (count >= MAX_RULES) {
    return NextResponse.json(
      { error: "Maximum 20 syndication rules allowed" },
      { status: 400 }
    );
  }

  const rule = await prisma.syndicationRule.create({
    data: {
      ...parsed.data,
      userId: session.user.id,
    },
  });

  return NextResponse.json({ rule }, { status: 201 });
}
