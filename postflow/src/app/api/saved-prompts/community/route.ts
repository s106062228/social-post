import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";

// ── GET /api/saved-prompts/community ─────────────────────────────────────────
// Public endpoint — no auth required. Returns top 50 public prompts sorted by
// usageCount descending so the most popular prompts appear first.

export async function GET(_request: NextRequest): Promise<NextResponse> {
  try {
    const prompts = await prisma.savedPrompt.findMany({
      where: { isPublic: true },
      orderBy: { usageCount: "desc" },
      take: 50,
      select: {
        id: true,
        name: true,
        description: true,
        prompt: true,
        category: true,
        usageCount: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ prompts });
  } catch (err) {
    return handleRouteError(err);
  }
}
