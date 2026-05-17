import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const createSchema = z.object({
  name: z.string().min(1).max(100),
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).default([]),
  timezone: z.string().min(1).max(100).default("UTC"),
});

const MAX_PRESETS = 30;

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

    const presets = await prisma.scheduleTimePreset.findMany({
      where: { userId: session.user.id },
      orderBy: [{ hour: "asc" }, { minute: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        hour: true,
        minute: true,
        daysOfWeek: true,
        timezone: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ presets });
  } catch (err) {
    return handleRouteError(err);
  }
}

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

    const count = await prisma.scheduleTimePreset.count({
      where: { userId: session.user.id },
    });
    if (count >= MAX_PRESETS) {
      return NextResponse.json(
        { error: `Maximum ${MAX_PRESETS} schedule presets allowed` },
        { status: 422 }
      );
    }

    const preset = await prisma.scheduleTimePreset.create({
      data: {
        userId: session.user.id,
        name: parsed.data.name.trim(),
        hour: parsed.data.hour,
        minute: parsed.data.minute,
        daysOfWeek: parsed.data.daysOfWeek,
        timezone: parsed.data.timezone,
      },
      select: {
        id: true,
        name: true,
        hour: true,
        minute: true,
        daysOfWeek: true,
        timezone: true,
        createdAt: true,
      },
    });

    return NextResponse.json(preset, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
