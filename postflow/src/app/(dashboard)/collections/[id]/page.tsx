import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, FileText } from "lucide-react";
import { RemoveFromCollectionButton } from "./remove-from-collection-button";
import { AddToCollectionPanel } from "./add-to-collection-panel";

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  SCHEDULED: "bg-blue-100 text-blue-700",
  PUBLISHING: "bg-yellow-100 text-yellow-700",
  PUBLISHED: "bg-green-100 text-green-700",
  PARTIALLY_PUBLISHED: "bg-orange-100 text-orange-700",
  FAILED: "bg-red-100 text-red-700",
};

export default async function CollectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  const userId = session!.user!.id;
  const { id } = await params;

  const collection = await prisma.postCollection.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      description: true,
      color: true,
      userId: true,
      posts: {
        orderBy: { addedAt: "desc" },
        select: {
          addedAt: true,
          post: {
            select: {
              id: true,
              content: true,
              status: true,
              mediaType: true,
              scheduledAt: true,
              createdAt: true,
            },
          },
        },
      },
    },
  });

  if (!collection || collection.userId !== userId) {
    notFound();
  }

  const postIdsInCollection = new Set(collection.posts.map((cp) => cp.post.id));

  const allPosts = await prisma.post.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { id: true, content: true, status: true },
  });

  const availablePosts = allPosts.filter((p) => !postIdsInCollection.has(p.id));

  return (
    <div className="flex flex-col gap-8 p-8">
      <div>
        <Link
          href="/collections"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All collections
        </Link>
      </div>

      <div className="flex items-center gap-3">
        <div
          className="h-5 w-5 shrink-0 rounded-full"
          style={{ backgroundColor: collection.color }}
        />
        <h1 className="text-3xl font-bold tracking-tight">{collection.name}</h1>
      </div>

      {collection.description && (
        <p className="text-muted-foreground">{collection.description}</p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Add a post</CardTitle>
        </CardHeader>
        <CardContent>
          <AddToCollectionPanel
            collectionId={collection.id}
            availablePosts={availablePosts}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {collection.posts.length} post{collection.posts.length !== 1 ? "s" : ""} in this collection
          </CardTitle>
        </CardHeader>
        <CardContent>
          {collection.posts.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <FileText className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No posts in this collection yet</p>
              <p className="text-xs text-muted-foreground">
                Add existing posts using the selector above.
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {collection.posts.map(({ post, addedAt }) => (
                <div
                  key={post.id}
                  className="flex items-start gap-4 py-4 first:pt-0 last:pb-0"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          STATUS_COLORS[post.status] ?? "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {post.status}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Added {new Date(addedAt).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="mt-1 text-sm line-clamp-2">{post.content}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {post.scheduledAt
                        ? `Scheduled for ${new Date(post.scheduledAt).toLocaleString()}`
                        : `Created ${new Date(post.createdAt).toLocaleDateString()}`}
                    </p>
                  </div>
                  <RemoveFromCollectionButton
                    collectionId={collection.id}
                    postId={post.id}
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
