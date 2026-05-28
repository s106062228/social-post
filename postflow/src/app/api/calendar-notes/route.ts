import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const MAX_NOTES = 500;

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const createSchema = z.object({
  date: z.string().regex(DATE_REGEX, "Date must be YYYY-MM-DD format"),
  title: z.string().min(1).max(200),
  body: z.string().max(2000).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional()
    .default("#6366f1"),
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

    const month = req.nextUrl.searchParams.get("month"); // optional YYYY-MM filter

    const notes = await prisma.calendarNote.findMany({
      where: {
        userId: session.user.id,
        ...(month ? { date: { startsWith: month } } : {}),
      },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        date: true,
        title: true,
        body: true,
        color: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ notes });
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

    const count = await prisma.calendarNote.count({
      where: { userId: session.user.id },
    });
    if (count >= MAX_NOTES) {
      return NextResponse.json(
        { error: `Maximum of ${MAX_NOTES} calendar notes reached` },
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

    const note = await prisma.calendarNote.create({
      data: {
        userId: session.user.id,
        date: parsed.data.date,
        title: parsed.data.title,
        body: parsed.data.body,
        color: parsed.data.color,
      },
    });

    return NextResponse.json({ note }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
