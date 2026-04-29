import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ReportFrequency } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Compute the next send time based on frequency from a given reference date. */
export function computeNextSendAt(
  frequency: ReportFrequency,
  from: Date = new Date()
): Date {
  const next = new Date(from);
  switch (frequency) {
    case ReportFrequency.DAILY:
      next.setDate(next.getDate() + 1);
      break;
    case ReportFrequency.WEEKLY:
      next.setDate(next.getDate() + 7);
      break;
    case ReportFrequency.MONTHLY:
      next.setMonth(next.getMonth() + 1);
      break;
  }
  return next;
}

// ── Zod schemas ────────────────────────────────────────────────────────────────

const createSchema = z.object({
  frequency: z.nativeEnum(ReportFrequency),
  recipientEmail: z.string().email("recipientEmail must be a valid email").max(255),
});

// ── GET /api/report-schedules ─────────────────────────────────────────────────

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

    const schedules = await prisma.reportSchedule.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        frequency: true,
        recipientEmail: true,
        isActive: true,
        lastSentAt: true,
        nextSendAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ schedules });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── POST /api/report-schedules ────────────────────────────────────────────────

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

    const { frequency, recipientEmail } = parsed.data;

    const schedule = await prisma.reportSchedule.create({
      data: {
        userId: session.user.id,
        frequency,
        recipientEmail,
        nextSendAt: computeNextSendAt(frequency),
      },
      select: {
        id: true,
        frequency: true,
        recipientEmail: true,
        isActive: true,
        lastSentAt: true,
        nextSendAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(schedule, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
