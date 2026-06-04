import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const smartListFiltersSchema = z.object({
  statuses: z.array(z.string()).optional(),
  platforms: z.array(z.string()).optional(),
  sentiment: z.string().optional(),
  tagIds: z.array(z.string()).optional(),
  starred: z.boolean().optional(),
  evergreen: z.boolean().optional(),
  archived: z.boolean().optional(),
  contentContains: z.string().max(200).optional(),
  scheduledFrom: z.string().optional(),
  scheduledTo: z.string().optional(),
  contentCategory: z.string().optional(),
  workflowStageId: z.string().optional(),
  mediaType: z.string().optional(),
}).default({});

const createSmartListSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  filters: smartListFiltersSchema,
  pinned: z.boolean().default(false),
});

const MAX_SMART_LISTS = 20;

// ── GET /api/smart-lists ──────────────────────────────────────────────────────

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

    const smartLists = await prisma.smartList.findMany({
      where: { userId: session.user.id },
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        name: true,
        description: true,
        filters: true,
        pinned: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ smartLists });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── POST /api/smart-lists ─────────────────────────────────────────────────────

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

    const parsed = createSmartListSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const count = await prisma.smartList.count({
      where: { userId: session.user.id },
    });
    if (count >= MAX_SMART_LISTS) {
      return NextResponse.json(
        { error: `Maximum ${MAX_SMART_LISTS} smart lists allowed` },
        { status: 422 }
      );
    }

    const smartList = await prisma.smartList.create({
      data: {
        userId: session.user.id,
        name: parsed.data.name.trim(),
        description: parsed.data.description?.trim(),
        filters: parsed.data.filters,
        pinned: parsed.data.pinned,
      },
      select: {
        id: true,
        name: true,
        description: true,
        filters: true,
        pinned: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(smartList, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
