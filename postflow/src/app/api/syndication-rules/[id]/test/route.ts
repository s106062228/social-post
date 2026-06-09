import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { MediaType, Platform } from "@prisma/client";
import { applyTransformations, type SyndicationTransformations } from "@/lib/syndication";

const testSchema = z.object({
  content: z.string().min(1).max(10000),
  mediaType: z.nativeEnum(MediaType).optional(),
});

export async function POST(
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
  const rule = await prisma.syndicationRule.findUnique({ where: { id } });
  if (!rule) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (rule.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = testSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const transformations = rule.transformations as SyndicationTransformations;
  const adapted = (rule.targetPlatforms as Platform[]).map((platform) => ({
    platform,
    content: applyTransformations(parsed.data.content, transformations, platform),
  }));

  return NextResponse.json({ original: parsed.data.content, adapted });
}
