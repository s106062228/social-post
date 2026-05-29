import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const MAX_RULES = 50;

const createSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum([
    "REQUIRED_HASHTAG",
    "FORBIDDEN_WORD",
    "MIN_LENGTH",
    "MAX_HASHTAGS",
    "REQUIRED_CTA",
    "CUSTOM_REGEX",
  ]),
  value: z.string().max(500).default(""),
  platforms: z.array(z.string()).default([]),
  severity: z.enum(["ERROR", "WARNING"]).default("WARNING"),
  isActive: z.boolean().default(true),
});

// ── GET /api/content-rules ────────────────────────────────────────────────────

export async function GET(): Promise<NextResponse> {
  try {
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

    const rules = await prisma.contentRule.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ rules });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── POST /api/content-rules ───────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
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

    const count = await prisma.contentRule.count({
      where: { userId: session.user.id },
    });
    if (count >= MAX_RULES) {
      return NextResponse.json(
        { error: `Maximum ${MAX_RULES} rules per user` },
        { status: 422 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const rule = await prisma.contentRule.create({
      data: {
        userId: session.user.id,
        ...parsed.data,
      },
    });

    return NextResponse.json({ rule }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
