import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { HashtagRotationsClient } from "./hashtag-rotations-client";

export default async function HashtagRotationsPage() {
  const session = await auth();
  const userId = session!.user!.id;

  const [rotations, groups] = await Promise.all([
    prisma.hashtagRotation.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.hashtagGroup.findMany({
      where: { userId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, hashtags: true },
    }),
  ]);

  // Resolve group info for each rotation
  const groupMap = new Map(groups.map((g) => [g.id, g]));
  const enrichedRotations = rotations.map((r) => ({
    ...r,
    groups: r.groupIds
      .map((id) => groupMap.get(id))
      .filter(Boolean) as { id: string; name: string; hashtags: string[] }[],
    currentGroup:
      (groupMap.get(r.groupIds[r.currentIndex] ?? "") ?? null) as {
        id: string;
        name: string;
        hashtags: string[];
      } | null,
  }));

  return (
    <div className="flex flex-col gap-8 p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Hashtag Rotations</h1>
        <p className="text-muted-foreground">
          Cycle through hashtag groups automatically — insert the current group
          into posts and advance to the next one each time.
        </p>
      </div>

      <HashtagRotationsClient
        initialRotations={enrichedRotations}
        availableGroups={groups}
      />
    </div>
  );
}
