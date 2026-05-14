import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const HEX_COLOR = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, "Must be a valid hex color (e.g. #ff0000)")
  .optional()
  .nullable();

const patchSchema = z.object({
  primaryColor: HEX_COLOR,
  secondaryColor: HEX_COLOR,
  accentColor: HEX_COLOR,
  logoUrl: z.string().url().max(2048).optional().nullable(),
  tagline: z.string().max(200).optional().nullable(),
  voiceGuide: z.string().max(2000).optional().nullable(),
  doKeywords: z.array(z.string().max(50)).max(30).optional(),
  dontKeywords: z.array(z.string().max(50)).max(30).optional(),
});

// ── GET /api/brand-kit ──────────────────────────────────────────────────────

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

    const brandKit = await prisma.brandKit.findUnique({
      where: { userId: session.user.id },
    });

    return NextResponse.json(brandKit ?? null);
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── PATCH /api/brand-kit ────────────────────────────────────────────────────

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

    const brandKit = await prisma.brandKit.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        primaryColor: data.primaryColor ?? null,
        secondaryColor: data.secondaryColor ?? null,
        accentColor: data.accentColor ?? null,
        logoUrl: data.logoUrl ?? null,
        tagline: data.tagline ?? null,
        voiceGuide: data.voiceGuide ?? null,
        doKeywords: data.doKeywords ?? [],
        dontKeywords: data.dontKeywords ?? [],
      },
      update: {
        ...(data.primaryColor !== undefined && { primaryColor: data.primaryColor }),
        ...(data.secondaryColor !== undefined && { secondaryColor: data.secondaryColor }),
        ...(data.accentColor !== undefined && { accentColor: data.accentColor }),
        ...(data.logoUrl !== undefined && { logoUrl: data.logoUrl }),
        ...(data.tagline !== undefined && { tagline: data.tagline }),
        ...(data.voiceGuide !== undefined && { voiceGuide: data.voiceGuide }),
        ...(data.doKeywords !== undefined && { doKeywords: data.doKeywords }),
        ...(data.dontKeywords !== undefined && { dontKeywords: data.dontKeywords }),
      },
    });

    return NextResponse.json(brandKit);
  } catch (err) {
    return handleRouteError(err);
  }
}
