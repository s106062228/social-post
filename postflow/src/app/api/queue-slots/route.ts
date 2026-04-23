import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const createSlotSchema = z.object({
  label: z.string().max(80).default(""),
  platform: z.enum(["FACEBOOK", "INSTAGRAM", "THREADS"]).nullable().default(null),
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59).default(0),
  daysOfWeek: z
    .array(z.number().int().min(0).max(6))
    .max(7)
    .default([]),
});

// ── GET /api/queue-slots ──────────────────────────────────────────────────────

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

    const slots = await prisma.postQueueSlot.findMany({
      where: { userId: session.user.id },
      orderBy: [{ hour: "asc" }, { minute: "asc" }],
      select: {
        id: true,
        label: true,
        platform: true,
        hour: true,
        minute: true,
        daysOfWeek: true,
        isActive: true,
        createdAt: true,
      },
    });

    // Annotate with human-readable day labels
    const annotated = slots.map((s) => ({
      ...s,
      daysLabel:
        s.daysOfWeek.length === 0
          ? "Every day"
          : s.daysOfWeek.map((d) => DAY_NAMES[d] ?? "?").join(", "),
      timeLabel: `${String(s.hour).padStart(2, "0")}:${String(s.minute).padStart(2, "0")}`,
    }));

    return NextResponse.json({ slots: annotated });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── POST /api/queue-slots ─────────────────────────────────────────────────────

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

    const parsed = createSlotSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    // Cap total slots per user at 50
    const count = await prisma.postQueueSlot.count({
      where: { userId: session.user.id },
    });
    if (count >= 50) {
      return NextResponse.json(
        { error: "Maximum 50 queue slots per user" },
        { status: 422 }
      );
    }

    const { label, platform, hour, minute, daysOfWeek } = parsed.data;

    const slot = await prisma.postQueueSlot.create({
      data: {
        userId: session.user.id,
        label: label.trim(),
        platform: platform ?? undefined,
        hour,
        minute,
        daysOfWeek,
      },
      select: {
        id: true,
        label: true,
        platform: true,
        hour: true,
        minute: true,
        daysOfWeek: true,
        isActive: true,
        createdAt: true,
      },
    });

    return NextResponse.json(slot, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
