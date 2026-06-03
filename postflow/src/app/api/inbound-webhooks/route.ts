import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "crypto";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const MAX_INBOUND_WEBHOOKS = 20;

const fieldMappingSchema = z.object({
  contentField: z.string().optional(),
  scheduledAtField: z.string().optional(),
  mediaUrlsField: z.string().optional(),
  titleField: z.string().optional(),
});

const createSchema = z.object({
  name: z.string().min(1).max(100),
  fieldMapping: fieldMappingSchema.optional().default({}),
  defaultPlatforms: z.array(z.string()).optional().default([]),
  isActive: z.boolean().optional().default(true),
});

// ── GET /api/inbound-webhooks ─────────────────────────────────────────────────

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

    const webhooks = await prisma.inboundWebhook.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        fieldMapping: true,
        defaultPlatforms: true,
        isActive: true,
        lastTriggeredAt: true,
        triggerCount: true,
        createdAt: true,
        updatedAt: true,
        // secret is intentionally excluded from list view
      },
    });

    return NextResponse.json({ webhooks });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── POST /api/inbound-webhooks ────────────────────────────────────────────────

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

    const count = await prisma.inboundWebhook.count({
      where: { userId: session.user.id },
    });
    if (count >= MAX_INBOUND_WEBHOOKS) {
      return NextResponse.json(
        { error: `Maximum ${MAX_INBOUND_WEBHOOKS} inbound webhooks per user` },
        { status: 422 }
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

    const secret = randomBytes(32).toString("hex");

    const webhook = await prisma.inboundWebhook.create({
      data: {
        userId: session.user.id,
        name: parsed.data.name,
        secret,
        fieldMapping: parsed.data.fieldMapping,
        defaultPlatforms: parsed.data.defaultPlatforms,
        isActive: parsed.data.isActive,
      },
    });

    // Return the secret only on creation
    return NextResponse.json({ webhook: { ...webhook, secret } }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
