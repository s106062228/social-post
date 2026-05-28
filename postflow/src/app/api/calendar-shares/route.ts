import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { Platform } from "@prisma/client";

const MAX_SHARES = 20;

const createSchema = z.object({
  title: z.string().min(1).max(200),
  platforms: z.array(z.nativeEnum(Platform)).optional().default([]),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  showContent: z.boolean().optional().default(true),
  expiresAt: z.string().datetime().optional().nullable(),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
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

    const shares = await prisma.calendarShare.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        token: true,
        title: true,
        platforms: true,
        startDate: true,
        endDate: true,
        showContent: true,
        expiresAt: true,
        views: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ shares });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
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

    const count = await prisma.calendarShare.count({
      where: { userId: session.user.id },
    });
    if (count >= MAX_SHARES) {
      return NextResponse.json(
        { error: `Maximum of ${MAX_SHARES} calendar shares reached` },
        { status: 422 }
      );
    }

    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const share = await prisma.calendarShare.create({
      data: {
        userId: session.user.id,
        title: parsed.data.title,
        platforms: parsed.data.platforms,
        startDate: parsed.data.startDate ?? null,
        endDate: parsed.data.endDate ?? null,
        showContent: parsed.data.showContent,
        expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
      },
    });

    return NextResponse.json({ share }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
