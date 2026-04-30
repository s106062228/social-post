import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const MAX_RESULTS_PER_CATEGORY = 5;

export async function GET(request: NextRequest): Promise<NextResponse> {
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

    const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
    if (q.length < 2) {
      return NextResponse.json({ error: "Query must be at least 2 characters" }, { status: 400 });
    }

    const userId = session.user.id;

    const [posts, templates, campaigns, tags, hashtagGroups] = await Promise.all([
      prisma.post.findMany({
        where: { userId, content: { contains: q, mode: "insensitive" } },
        take: MAX_RESULTS_PER_CATEGORY,
        orderBy: { updatedAt: "desc" },
        select: { id: true, content: true, status: true, scheduledAt: true },
      }),
      prisma.template.findMany({
        where: {
          userId,
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { content: { contains: q, mode: "insensitive" } },
          ],
        },
        take: MAX_RESULTS_PER_CATEGORY,
        orderBy: { createdAt: "desc" },
        select: { id: true, name: true, content: true },
      }),
      prisma.campaign.findMany({
        where: {
          userId,
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { description: { contains: q, mode: "insensitive" } },
          ],
        },
        take: MAX_RESULTS_PER_CATEGORY,
        orderBy: { updatedAt: "desc" },
        select: { id: true, name: true, description: true, isActive: true },
      }),
      prisma.tag.findMany({
        where: { userId, name: { contains: q, mode: "insensitive" } },
        take: MAX_RESULTS_PER_CATEGORY,
        orderBy: { name: "asc" },
        select: { id: true, name: true, color: true },
      }),
      prisma.hashtagGroup.findMany({
        where: { userId, name: { contains: q, mode: "insensitive" } },
        take: MAX_RESULTS_PER_CATEGORY,
        orderBy: { name: "asc" },
        select: { id: true, name: true, hashtags: true },
      }),
    ]);

    return NextResponse.json({
      query: q,
      results: {
        posts: posts.map((p) => ({
          type: "post" as const,
          id: p.id,
          label: p.content.slice(0, 80) + (p.content.length > 80 ? "…" : ""),
          status: p.status,
          scheduledAt: p.scheduledAt,
          href: `/posts/${p.id}/versions`,
        })),
        templates: templates.map((t) => ({
          type: "template" as const,
          id: t.id,
          label: t.name,
          preview: t.content.slice(0, 60) + (t.content.length > 60 ? "…" : ""),
          href: `/templates`,
        })),
        campaigns: campaigns.map((c) => ({
          type: "campaign" as const,
          id: c.id,
          label: c.name,
          description: c.description ?? undefined,
          isActive: c.isActive,
          href: `/campaigns/${c.id}`,
        })),
        tags: tags.map((t) => ({
          type: "tag" as const,
          id: t.id,
          label: t.name,
          color: t.color,
          href: `/posts?tag=${t.id}`,
        })),
        hashtagGroups: hashtagGroups.map((g) => ({
          type: "hashtagGroup" as const,
          id: g.id,
          label: g.name,
          preview: g.hashtags.slice(0, 3).join(" "),
          href: `/hashtags`,
        })),
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
