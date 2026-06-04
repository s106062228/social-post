import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const MAX_STAGES = 20;

const createStageSchema = z.object({
  name: z.string().min(1).max(100),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Color must be a valid hex color")
    .optional()
    .default("#6366f1"),
  order: z.number().int().min(0).optional(),
});

// ── GET /api/workflow-stages ──────────────────────────────────────────────────

export async function GET(request: NextRequest): Promise<NextResponse> {
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

    const stages = await prisma.workflowStage.findMany({
      where: { userId: session.user.id },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      include: {
        _count: { select: { posts: true } },
      },
    });

    return NextResponse.json({ stages });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── POST /api/workflow-stages ─────────────────────────────────────────────────

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

    const count = await prisma.workflowStage.count({
      where: { userId: session.user.id },
    });
    if (count >= MAX_STAGES) {
      return NextResponse.json(
        { error: `Maximum of ${MAX_STAGES} workflow stages allowed` },
        { status: 400 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = createStageSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { name, color, order } = parsed.data;
    const stageOrder = order ?? count;

    const stage = await prisma.workflowStage.create({
      data: {
        userId: session.user.id,
        name,
        color,
        order: stageOrder,
      },
      include: {
        _count: { select: { posts: true } },
      },
    });

    return NextResponse.json({ stage }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
