import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

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
    if (rl) return NextResponse.json({ error: "Too Many Requests" }, { status: 429, headers: rateLimitHeaders(rl) });

    const { id } = await params;

    const record = await prisma.competitorContentAnalysis.findUnique({ where: { id } });
    if (!record) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (record.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.competitorContentAnalysis.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return handleRouteError(err);
  }
}
