import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { ImportClient } from "./import-client";

export const metadata = { title: "Import Posts — PostFlow" };

export default async function ImportPage() {
  const session = await auth();
  const userId = session!.user!.id;

  const batches = await prisma.importBatch.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  const serialised = batches.map((b) => ({
    ...b,
    createdAt: b.createdAt.toISOString(),
    errors: b.errors as Array<{ row: number; errors: string[] }>,
  }));

  return (
    <div className="flex flex-col gap-8 p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Import Posts</h1>
        <p className="text-muted-foreground">
          Bulk-import posts from a CSV file. Up to 100 rows per upload.
        </p>
      </div>
      <ImportClient initialBatches={serialised} />
    </div>
  );
}
