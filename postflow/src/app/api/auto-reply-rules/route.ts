import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const MAX_RULES = 20;

const createSchema = z.object({
  name: z.string().min(1).max(100),
  triggerKeywords: z.array(z.string().min(1).max(100)).min(1).max(20),
  templateId: z.string().min(1),
  platform: z.string().optional(),
  isActive: z.boolean().optional().default(true),
});

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const rl = await apiLimiter(userId, { limit: 60, windowMs: 60_000 });
  if (!rl.success) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: rateLimitHeaders(rl) }
    );
  }

  try {
    const rules = await prisma.autoReplyRule.findMany({
      where: { userId },
      include: {
        template: {
          select: { id: true, name: true, content: true, category: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ rules });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const rl = await apiLimiter(userId, { limit: 20, windowMs: 60_000 });
  if (!rl.success) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: rateLimitHeaders(rl) }
    );
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const count = await prisma.autoReplyRule.count({ where: { userId } });
    if (count >= MAX_RULES) {
      return NextResponse.json(
        { error: `Maximum ${MAX_RULES} auto-reply rules allowed` },
        { status: 422 }
      );
    }

    // Verify template belongs to user
    const template = await prisma.responseTemplate.findUnique({
      where: { id: parsed.data.templateId },
    });
    if (!template || template.userId !== userId) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 }
      );
    }

    const rule = await prisma.autoReplyRule.create({
      data: { userId, ...parsed.data },
      include: {
        template: {
          select: { id: true, name: true, content: true, category: true },
        },
      },
    });

    return NextResponse.json({ rule }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
