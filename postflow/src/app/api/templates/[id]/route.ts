import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";

const templateIdSchema = z.string().cuid();

// ── GET /api/templates/[id] ───────────────────────────────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!templateIdSchema.safeParse(id).success) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    const template = await prisma.template.findUnique({ where: { id } });
    if (!template || template.userId !== session.user.id) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    return NextResponse.json(template);
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── DELETE /api/templates/[id] ────────────────────────────────────────────────

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!templateIdSchema.safeParse(id).success) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    const template = await prisma.template.findUnique({ where: { id } });
    if (!template || template.userId !== session.user.id) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    await prisma.template.delete({ where: { id } });

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return handleRouteError(err);
  }
}
