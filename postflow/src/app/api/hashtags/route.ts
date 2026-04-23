import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

// ── Zod Schemas ───────────────────────────────────────────────────────────────

const createHashtagGroupSchema = z.object({
  name: z.string().min(1).max(100),
  hashtags: z
    .array(z.string().min(1).max(100))
    .min(1, "At least one hashtag is required")
    .max(30, "Maximum 30 hashtags per group"),
});

// ── GET /api/hashtags ─────────────────────────────────────────────────────────

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

    const groups = await prisma.hashtagGroup.findMany({
      where: { userId: session.user.id },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        hashtags: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ groups });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── POST /api/hashtags ────────────────────────────────────────────────────────

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

    const parsed = createHashtagGroupSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { name, hashtags } = parsed.data;

    // Normalise: ensure each hashtag starts with #
    const normalised = hashtags.map((h) =>
      h.startsWith("#") ? h : `#${h}`
    );

    try {
      const group = await prisma.hashtagGroup.create({
        data: { userId: session.user.id, name: name.trim(), hashtags: normalised },
        select: { id: true, name: true, hashtags: true, createdAt: true },
      });
      return NextResponse.json(group, { status: 201 });
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        "code" in err &&
        (err as { code: string }).code === "P2002"
      ) {
        return NextResponse.json(
          { error: "A hashtag group with this name already exists" },
          { status: 409 }
        );
      }
      throw err;
    }
  } catch (err) {
    return handleRouteError(err);
  }
}
