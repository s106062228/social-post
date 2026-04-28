import crypto from "crypto";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const MAX_KEYS_PER_USER = 10;

const createSchema = z.object({
  name: z.string().min(1).max(64),
  expiresAt: z.string().datetime().optional(),
});

function generateApiKey(): { raw: string; prefix: string; hash: string } {
  const bytes = crypto.randomBytes(32);
  const raw = `pf_${bytes.toString("hex")}`;
  const prefix = raw.slice(0, 10);
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  return { raw, prefix, hash };
}

// ── GET /api/api-keys ─────────────────────────────────────────────────────────

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

    const keys = await prisma.apiKey.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        prefix: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ keys });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── POST /api/api-keys ────────────────────────────────────────────────────────

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

    const count = await prisma.apiKey.count({ where: { userId: session.user.id } });
    if (count >= MAX_KEYS_PER_USER) {
      return NextResponse.json(
        { error: `Maximum of ${MAX_KEYS_PER_USER} API keys allowed per user` },
        { status: 409 }
      );
    }

    const { raw, prefix, hash } = generateApiKey();
    const { name, expiresAt } = parsed.data;

    const key = await prisma.apiKey.create({
      data: {
        userId: session.user.id,
        name,
        keyHash: hash,
        prefix,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
      select: {
        id: true,
        name: true,
        prefix: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    // Return raw key only on creation — never shown again
    return NextResponse.json({ ...key, key: raw }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
