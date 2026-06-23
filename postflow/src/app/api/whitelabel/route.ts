import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const HEX_COLOR = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, "Must be a valid hex color (e.g. #6366f1)")
  .optional()
  .nullable();

const patchSchema = z.object({
  appName: z.string().min(1).max(50).optional(),
  logoUrl: z.string().url().max(2048).optional().nullable(),
  primaryColor: HEX_COLOR,
  accentColor: HEX_COLOR,
  emailSignature: z.string().max(1000).optional().nullable(),
  faviconUrl: z.string().url().max(2048).optional().nullable(),
});

// ── GET /api/whitelabel ─────────────────────────────────────────────────────

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

    const config = await prisma.whitelabelConfig.findUnique({
      where: { userId: session.user.id },
    });

    if (!config) {
      return NextResponse.json({
        appName: "PostFlow",
        logoUrl: null,
        primaryColor: "#6366f1",
        accentColor: "#8b5cf6",
        emailSignature: null,
        faviconUrl: null,
      });
    }

    return NextResponse.json(config);
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── PATCH /api/whitelabel ───────────────────────────────────────────────────

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

    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const data = parsed.data;

    const config = await prisma.whitelabelConfig.upsert({
      where: { userId: session.user.id },
      update: {
        ...(data.appName !== undefined && { appName: data.appName }),
        ...(data.logoUrl !== undefined && { logoUrl: data.logoUrl }),
        ...(data.primaryColor !== undefined && { primaryColor: data.primaryColor }),
        ...(data.accentColor !== undefined && { accentColor: data.accentColor }),
        ...(data.emailSignature !== undefined && { emailSignature: data.emailSignature }),
        ...(data.faviconUrl !== undefined && { faviconUrl: data.faviconUrl }),
      },
      create: {
        userId: session.user.id,
        appName: data.appName ?? "PostFlow",
        logoUrl: data.logoUrl ?? null,
        primaryColor: data.primaryColor ?? "#6366f1",
        accentColor: data.accentColor ?? "#8b5cf6",
        emailSignature: data.emailSignature ?? null,
        faviconUrl: data.faviconUrl ?? null,
      },
    });

    return NextResponse.json(config);
  } catch (err) {
    return handleRouteError(err);
  }
}
