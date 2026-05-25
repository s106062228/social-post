import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FolderOpen, ArrowRight, FileText } from "lucide-react";
import { CreateCollectionForm } from "./create-collection-form";
import { DeleteCollectionButton } from "./delete-collection-button";

export default async function CollectionsPage() {
  const session = await auth();
  const userId = session!.user!.id;

  const collections = await prisma.postCollection.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      description: true,
      color: true,
      createdAt: true,
      _count: { select: { posts: true } },
    },
  });

  return (
    <div className="flex flex-col gap-8 p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Collections</h1>
        <p className="text-muted-foreground">
          Organise your posts into named collections for easier management.
        </p>
      </div>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>New collection</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateCollectionForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {collections.length} collection{collections.length !== 1 ? "s" : ""}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {collections.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <FolderOpen className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No collections yet</p>
              <p className="text-xs text-muted-foreground">
                Create your first collection above to start organising posts.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {collections.map((col) => (
                <div
                  key={col.id}
                  className="relative rounded-lg border p-4 hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="mt-0.5 h-4 w-4 shrink-0 rounded-full"
                      style={{ backgroundColor: col.color }}
                    />
                    <div className="flex-1 min-w-0">
                      <Link
                        href={`/collections/${col.id}`}
                        className="text-sm font-medium hover:underline line-clamp-1"
                      >
                        {col.name}
                      </Link>
                      {col.description && (
                        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                          {col.description}
                        </p>
                      )}
                      <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                        <FileText className="h-3 w-3" />
                        <span>
                          {col._count.posts} post{col._count.posts !== 1 ? "s" : ""}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="absolute right-3 top-3 flex items-center gap-1">
                    <Link
                      href={`/collections/${col.id}`}
                      className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                      title="View collection"
                    >
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                    <DeleteCollectionButton collectionId={col.id} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
