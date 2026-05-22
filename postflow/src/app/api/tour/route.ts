import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { TOTAL_TOUR_STEPS } from "@/lib/tour";

// ── GET /api/tour ─────────────────────────────────────────────────────────────

export async function GET(_request: NextRequest): Promise<NextResponse> {
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

    const userId = session.user.id;

    const progress = await prisma.tourProgress.findUnique({
      where: { userId },
    });

    return NextResponse.json({
      completedSteps: progress?.completedSteps ?? [],
      dismissed: progress?.dismissed ?? false,
      totalSteps: TOTAL_TOUR_STEPS,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── PATCH /api/tour ───────────────────────────────────────────────────────────

const patchSchema = z.object({
  completedStep: z.string().optional(),
  dismissed: z.boolean().optional(),
});

export async function PATCH(request: NextRequest): Promise<NextResponse> {
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

    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { completedStep, dismissed } = parsed.data;
    const userId = session.user.id;

    const existing = await prisma.tourProgress.findUnique({
      where: { userId },
    });

    let newCompletedSteps = existing?.completedSteps ?? [];
    if (completedStep && !newCompletedSteps.includes(completedStep)) {
      newCompletedSteps = [...newCompletedSteps, completedStep];
    }

    const progress = await prisma.tourProgress.upsert({
      where: { userId },
      create: {
        userId,
        completedSteps: newCompletedSteps,
        dismissed: dismissed ?? false,
      },
      update: {
        completedSteps: newCompletedSteps,
        ...(dismissed !== undefined ? { dismissed } : {}),
      },
    });

    return NextResponse.json({
      completedSteps: progress.completedSteps,
      dismissed: progress.dismissed,
      totalSteps: TOTAL_TOUR_STEPS,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
