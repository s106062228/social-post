import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Layers } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ContentPillarsClient } from "./content-pillars-client";

export default async function ContentPillarsPage() {
  const session = await auth();
  const userId = session!.user!.id;

  const pillars = await prisma.contentPillar.findMany({
    where: { userId, isActive: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      color: true,
      description: true,
      createdAt: true,
      _count: { select: { posts: true } },
    },
  });

  return (
    <div className="flex flex-col gap-8 p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Content Pillars</h1>
        <p className="text-muted-foreground">
          Organise posts into strategic content pillars to track your content mix.
        </p>
      </div>

      <ContentPillarsClient initialPillars={pillars} />

      {pillars.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Layers className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm font-medium">No content pillars yet</p>
            <p className="text-xs text-muted-foreground max-w-sm">
              Create your first pillar above. You can then assign posts to pillars and track performance by strategy.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
