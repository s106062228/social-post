import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { MediaLibrary } from "./media-library";

export const metadata = { title: "Media Library — PostFlow" };

const PAGE_SIZE = 20;

export default async function MediaPage() {
  const session = await auth();
  const userId = session!.user!.id;

  const [assets, total] = await Promise.all([
    prisma.mediaAsset.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
    }),
    prisma.mediaAsset.count({ where: { userId } }),
  ]);

  const serialised = assets.map((a) => ({
    ...a,
    createdAt: a.createdAt.toISOString(),
  }));

  return (
    <div className="flex flex-col gap-8 p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Media Library</h1>
        <p className="text-muted-foreground">
          Upload and manage images and videos for your posts.
        </p>
      </div>

      <MediaLibrary
        initialAssets={serialised}
        initialPagination={{
          page: 1,
          limit: PAGE_SIZE,
          total,
          totalPages: Math.ceil(total / PAGE_SIZE),
        }}
      />
    </div>
  );
}
