import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const MAX_FIELDS = 20;

const VALID_FIELD_TYPES = ["text", "number", "date", "url", "select"] as const;

const createSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-zA-Z0-9_]+$/, "Key must contain only letters, numbers, and underscores"),
  label: z.string().min(1).max(100),
  fieldType: z.enum(VALID_FIELD_TYPES),
  options: z.array(z.string().max(100)).default([]),
  defaultValue: z.string().max(500).optional(),
  isRequired: z.boolean().default(false),
  isActive: z.boolean().default(true),
  order: z.number().int().min(0).default(0),
});

// ── GET /api/custom-fields ────────────────────────────────────────────────────

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

    const fields = await prisma.customField.findMany({
      where: { userId: session.user.id },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    });

    return NextResponse.json({ fields });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── POST /api/custom-fields ───────────────────────────────────────────────────

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

    const count = await prisma.customField.count({
      where: { userId: session.user.id },
    });
    if (count >= MAX_FIELDS) {
      return NextResponse.json(
        { error: `Maximum ${MAX_FIELDS} custom fields per user` },
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

    // Check key uniqueness
    const existing = await prisma.customField.findUnique({
      where: { userId_key: { userId: session.user.id, key: parsed.data.key } },
    });
    if (existing) {
      return NextResponse.json(
        { error: "A custom field with this key already exists" },
        { status: 409 }
      );
    }

    const field = await prisma.customField.create({
      data: {
        userId: session.user.id,
        ...parsed.data,
      },
    });

    return NextResponse.json({ field }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
