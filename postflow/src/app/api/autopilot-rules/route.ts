import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { TriggerType, ActionType } from "@prisma/client";

const MAX_RULES = 20;

const createSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional().nullable(),
  trigger: z.nativeEnum(TriggerType),
  conditionJson: z.record(z.unknown()),
  action: z.nativeEnum(ActionType),
  actionDataJson: z.record(z.unknown()).optional().default({}),
});

// ── GET /api/autopilot-rules ──────────────────────────────────────────────────

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

    const rules = await prisma.autopilotRule.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        description: true,
        trigger: true,
        conditionJson: true,
        action: true,
        actionDataJson: true,
        isActive: true,
        lastTriggeredAt: true,
        triggerCount: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ rules });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── POST /api/autopilot-rules ─────────────────────────────────────────────────

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

    const count = await prisma.autopilotRule.count({
      where: { userId: session.user.id },
    });
    if (count >= MAX_RULES) {
      return NextResponse.json(
        { error: `Maximum of ${MAX_RULES} autopilot rules reached` },
        { status: 422 }
      );
    }

    const body: unknown = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { name, description, trigger, conditionJson, action, actionDataJson } =
      parsed.data;

    const rule = await prisma.autopilotRule.create({
      data: {
        userId: session.user.id,
        name,
        description: description ?? null,
        trigger,
        conditionJson,
        action,
        actionDataJson: actionDataJson ?? {},
      },
      select: {
        id: true,
        name: true,
        description: true,
        trigger: true,
        conditionJson: true,
        action: true,
        actionDataJson: true,
        isActive: true,
        lastTriggeredAt: true,
        triggerCount: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ rule }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
