import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const MAX_CUSTOM_EVENTS = 100;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_REGEX = /^\d{4}-\d{2}$/;

const createSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  date: z.string().regex(DATE_REGEX, "Date must be YYYY-MM-DD format"),
  type: z
    .enum(["HOLIDAY", "OBSERVANCE", "AWARENESS_DAY", "CUSTOM"])
    .default("CUSTOM"),
  platforms: z.array(z.string()).default([]),
  categories: z.array(z.string()).default([]),
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

    const { searchParams } = req.nextUrl;
    const month = searchParams.get("month"); // YYYY-MM
    const type = searchParams.get("type");
    const platform = searchParams.get("platform");

    // Determine date range
    let dateFrom: string;
    let dateTo: string;

    if (month && MONTH_REGEX.test(month)) {
      const [y, m] = month.split("-").map(Number);
      dateFrom = `${month}-01`;
      const lastDay = new Date(y, m, 0).getDate();
      dateTo = `${month}-${String(lastDay).padStart(2, "0")}`;
    } else {
      const now = new Date();
      const y = now.getFullYear();
      const m = now.getMonth() + 1;
      const monthStr = `${y}-${String(m).padStart(2, "0")}`;
      dateFrom = `${monthStr}-01`;
      const lastDay = new Date(y, m, 0).getDate();
      dateTo = `${monthStr}-${String(lastDay).padStart(2, "0")}`;
    }

    const where: Record<string, unknown> = {
      date: { gte: dateFrom, lte: dateTo },
      OR: [{ isGlobal: true }, { userId: session.user.id }],
    };

    if (type) {
      where.type = type;
    }

    const events = await prisma.socialEvent.findMany({
      where,
      orderBy: { date: "asc" },
    });

    // Filter by platform if specified (empty platforms = all platforms)
    const filtered = platform
      ? events.filter(
          (e) => e.platforms.length === 0 || e.platforms.includes(platform)
        )
      : events;

    return NextResponse.json({ events: filtered });
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

    const count = await prisma.socialEvent.count({
      where: { userId: session.user.id },
    });
    if (count >= MAX_CUSTOM_EVENTS) {
      return NextResponse.json(
        { error: `Maximum of ${MAX_CUSTOM_EVENTS} custom events reached` },
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

    const event = await prisma.socialEvent.create({
      data: {
        userId: session.user.id,
        title: parsed.data.title,
        description: parsed.data.description,
        date: parsed.data.date,
        type: parsed.data.type,
        platforms: parsed.data.platforms,
        categories: parsed.data.categories,
        isGlobal: false,
      },
    });

    return NextResponse.json({ event }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
