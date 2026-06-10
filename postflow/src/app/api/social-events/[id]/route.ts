import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

export async function DELETE(
  req: NextRequest,
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

    const event = await prisma.socialEvent.findUnique({ where: { id } });
    if (!event) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (event.isGlobal) {
      return NextResponse.json(
        { error: "Cannot delete global events" },
        { status: 403 }
      );
    }
    if (event.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.socialEvent.delete({ where: { id } });

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return handleRouteError(err);
  }
}
