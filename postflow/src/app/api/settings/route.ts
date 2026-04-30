import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  timezone: true,
  emailNotifications: true,
  theme: true,
  createdAt: true,
} as const;

const VALID_THEMES = ["light", "dark", "system"] as const;

const updateSettingsSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    timezone: z.string().min(1).max(100).optional(),
    emailNotifications: z.boolean().optional(),
    theme: z.enum(VALID_THEMES).optional(),
  })
  .refine((d: Record<string, unknown>) => Object.keys(d).length > 0, {
    message: "No fields to update",
  });

// ── GET /api/settings ─────────────────────────────────────────────────────────

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

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: USER_SELECT,
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json(user);
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── PATCH /api/settings ───────────────────────────────────────────────────────

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

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = updateSettingsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const user = await prisma.user.update({
      where: { id: session.user.id },
      data: parsed.data,
      select: USER_SELECT,
    });

    return NextResponse.json(user);
  } catch (err) {
    return handleRouteError(err);
  }
}
