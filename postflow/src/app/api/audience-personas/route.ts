import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const MAX_PERSONAS = 20;

const createSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional().nullable(),
  ageRange: z.string().max(50).optional().nullable(),
  primaryPlatforms: z.array(z.string().max(50)).max(10).optional(),
  interests: z.array(z.string().max(100)).max(20).optional(),
  painPoints: z.array(z.string().max(200)).max(10).optional(),
  goals: z.array(z.string().max(200)).max(10).optional(),
  contentTypes: z.array(z.string().max(100)).max(10).optional(),
  notes: z.string().max(1000).optional().nullable(),
});

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

    const personas = await prisma.audiencePersona.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ personas });
  } catch (err) {
    return handleRouteError(err);
  }
}

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

    const count = await prisma.audiencePersona.count({
      where: { userId: session.user.id },
    });
    if (count >= MAX_PERSONAS) {
      return NextResponse.json(
        { error: `Maximum ${MAX_PERSONAS} audience personas allowed` },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const persona = await prisma.audiencePersona.create({
      data: {
        userId: session.user.id,
        ...parsed.data,
      },
    });

    return NextResponse.json({ persona }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
