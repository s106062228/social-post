import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const ENTRY_TYPES = ["SUCCESS", "FAILURE", "INSIGHT", "HYPOTHESIS", "EXPERIMENT"] as const;

const updateSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  entryType: z.enum(ENTRY_TYPES).optional(),
  content: z.string().min(1).max(10000).optional(),
  postId: z.string().nullable().optional(),
  rating: z.number().int().min(1).max(5).nullable().optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  isPublicToTeam: z.boolean().optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = await apiLimiter(session.user.id);
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: rateLimitHeaders(rl) });
    }

    const { id } = await params;
    const entry = await prisma.contentJournalEntry.findFirst({
      where: { id, userId: session.user.id },
      include: { post: { select: { id: true, content: true, status: true } } },
    });

    if (!entry) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ entry });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = await apiLimiter(session.user.id);
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: rateLimitHeaders(rl) });
    }

    const { id } = await params;
    const existing = await prisma.contentJournalEntry.findFirst({ where: { id, userId: session.user.id } });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => null);
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
    }

    const { postId, ...rest } = parsed.data;

    // Verify post ownership if postId is being changed
    if (postId !== undefined && postId !== null) {
      const post = await prisma.post.findFirst({ where: { id: postId, userId: session.user.id } });
      if (!post) {
        return NextResponse.json({ error: "Post not found" }, { status: 404 });
      }
    }

    const entry = await prisma.contentJournalEntry.update({
      where: { id },
      data: {
        ...rest,
        ...(postId !== undefined ? { postId: postId ?? null } : {}),
      },
      include: { post: { select: { id: true, content: true, status: true } } },
    });

    return NextResponse.json({ entry });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = await apiLimiter(session.user.id);
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: rateLimitHeaders(rl) });
    }

    const { id } = await params;
    const existing = await prisma.contentJournalEntry.findFirst({ where: { id, userId: session.user.id } });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.contentJournalEntry.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return handleRouteError(err);
  }
}
