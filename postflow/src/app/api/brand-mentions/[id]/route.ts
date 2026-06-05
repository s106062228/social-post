import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const patchSchema = z.object({
  content: z.string().min(1).max(10000).optional(),
  mentionUrl: z.string().url().optional().or(z.literal("")).optional(),
  platform: z.string().max(50).nullable().optional(),
  authorName: z.string().max(200).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  sentiment: z.enum(["POSITIVE", "NEUTRAL", "NEGATIVE"]).optional(),
  responseStatus: z.enum(["none", "acknowledged", "replied", "ignored"]).optional(),
  relatedPostId: z.string().nullable().optional(),
  mentionedAt: z.string().datetime().optional(),
});

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
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: rateLimitHeaders(rl) }
      );
    }

    const { id } = await params;

    const existing = await prisma.brandMention.findFirst({
      where: { id, userId: session.user.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    if (parsed.data.relatedPostId) {
      const post = await prisma.post.findFirst({
        where: { id: parsed.data.relatedPostId, userId: session.user.id },
      });
      if (!post) {
        return NextResponse.json({ error: "Related post not found" }, { status: 404 });
      }
    }

    const updated = await prisma.brandMention.update({
      where: { id },
      data: {
        ...(parsed.data.content !== undefined ? { content: parsed.data.content } : {}),
        ...(parsed.data.mentionUrl !== undefined ? { mentionUrl: parsed.data.mentionUrl || null } : {}),
        ...(parsed.data.platform !== undefined ? { platform: parsed.data.platform } : {}),
        ...(parsed.data.authorName !== undefined ? { authorName: parsed.data.authorName } : {}),
        ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes } : {}),
        ...(parsed.data.sentiment !== undefined ? { sentiment: parsed.data.sentiment } : {}),
        ...(parsed.data.responseStatus !== undefined ? { responseStatus: parsed.data.responseStatus } : {}),
        ...(parsed.data.relatedPostId !== undefined ? { relatedPostId: parsed.data.relatedPostId } : {}),
        ...(parsed.data.mentionedAt !== undefined ? { mentionedAt: new Date(parsed.data.mentionedAt) } : {}),
      },
      include: {
        relatedPost: {
          select: { id: true, content: true, status: true },
        },
      },
    });

    return NextResponse.json(updated);
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function DELETE(
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
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: rateLimitHeaders(rl) }
      );
    }

    const { id } = await params;

    const existing = await prisma.brandMention.findFirst({
      where: { id, userId: session.user.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.brandMention.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return handleRouteError(err);
  }
}
