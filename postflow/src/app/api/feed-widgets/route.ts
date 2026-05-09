import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const MAX_WIDGETS = 10;

const createSchema = z.object({
  name: z.string().min(1).max(100),
  accountIds: z.array(z.string()).min(1).max(50),
  maxPosts: z.number().int().min(1).max(50).optional(),
  theme: z.enum(["light", "dark"]).optional(),
  showPlatformIcons: z.boolean().optional(),
  showTimestamps: z.boolean().optional(),
});

// ── GET /api/feed-widgets ────────────────────────────────────────────────────

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

    const widgets = await prisma.feedWidget.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ widgets });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── POST /api/feed-widgets ───────────────────────────────────────────────────

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

    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const count = await prisma.feedWidget.count({
      where: { userId: session.user.id },
    });
    if (count >= MAX_WIDGETS) {
      return NextResponse.json(
        { error: `Maximum ${MAX_WIDGETS} feed widgets allowed` },
        { status: 422 }
      );
    }

    const widget = await prisma.feedWidget.create({
      data: {
        userId: session.user.id,
        name: parsed.data.name,
        accountIds: parsed.data.accountIds,
        maxPosts: parsed.data.maxPosts ?? 10,
        theme: parsed.data.theme ?? "light",
        showPlatformIcons: parsed.data.showPlatformIcons ?? true,
        showTimestamps: parsed.data.showTimestamps ?? true,
      },
    });

    return NextResponse.json({ widget }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
