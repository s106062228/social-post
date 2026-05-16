import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const MAX_VARIABLES = 50;

const createSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-zA-Z0-9_]+$/, "Key may only contain letters, numbers, and underscores"),
  value: z.string().min(1).max(1000),
  description: z.string().max(200).optional().nullable(),
});

// ── GET /api/caption-variables ────────────────────────────────────────────────

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

    const variables = await prisma.captionVariable.findMany({
      where: { userId: session.user.id },
      orderBy: { key: "asc" },
      select: {
        id: true,
        key: true,
        value: true,
        description: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ variables });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── POST /api/caption-variables ───────────────────────────────────────────────

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

    const count = await prisma.captionVariable.count({
      where: { userId: session.user.id },
    });
    if (count >= MAX_VARIABLES) {
      return NextResponse.json(
        { error: `Maximum ${MAX_VARIABLES} variables allowed` },
        { status: 422 }
      );
    }

    try {
      const variable = await prisma.captionVariable.create({
        data: {
          userId: session.user.id,
          key: parsed.data.key,
          value: parsed.data.value,
          description: parsed.data.description ?? null,
        },
        select: {
          id: true,
          key: true,
          value: true,
          description: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return NextResponse.json({ variable }, { status: 201 });
    } catch (err: unknown) {
      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code: string }).code === "P2002"
      ) {
        return NextResponse.json(
          { error: `Variable key '${parsed.data.key}' already exists` },
          { status: 409 }
        );
      }
      throw err;
    }
  } catch (err) {
    return handleRouteError(err);
  }
}
