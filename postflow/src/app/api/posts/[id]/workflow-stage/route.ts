import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const assignStageSchema = z.object({
  workflowStageId: z.string().nullable(),
});

// ── PATCH /api/posts/[id]/workflow-stage ──────────────────────────────────────

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

    const post = await prisma.post.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }
    if (post.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = assignStageSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { workflowStageId } = parsed.data;

    // If assigning a stage, verify it belongs to the current user
    if (workflowStageId !== null) {
      const stage = await prisma.workflowStage.findUnique({
        where: { id: workflowStageId },
        select: { userId: true },
      });
      if (!stage || stage.userId !== session.user.id) {
        return NextResponse.json(
          { error: "Workflow stage not found" },
          { status: 404 }
        );
      }
    }

    const updated = await prisma.post.update({
      where: { id },
      data: { workflowStageId },
      select: { workflowStageId: true },
    });

    return NextResponse.json({ workflowStageId: updated.workflowStageId });
  } catch (err) {
    return handleRouteError(err);
  }
}
