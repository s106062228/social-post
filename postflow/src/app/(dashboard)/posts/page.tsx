import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { PostStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Plus, FileText } from "lucide-react";
import { DeletePostButton } from "./delete-post-button";

export default async function PostsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const session = await auth();
  const userId = session!.user!.id;

  const { status: statusFilter, page: pageStr } = await searchParams;
  const page = Math.max(1, parseInt(pageStr ?? "1", 10));
  const limit = 20;
  const skip = (page - 1) * limit;

  const statusEnum = statusFilter as PostStatus | undefined;

  const where = {
    userId,
    ...(statusEnum && Object.values(PostStatus).includes(statusEnum)
      ? { status: statusEnum }
      : {}),
  };

  const [posts, total] = await Promise.all([
    prisma.post.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        publishResults: {
          select: { platform: true, status: true, publishedUrl: true },
        },
      },
    }),
    prisma.post.count({ where }),
  ]);

  const totalPages = Math.ceil(total / limit);

  const statuses: Array<{ value: string; label: string }> = [
    { value: "", label: "All" },
    { value: "DRAFT", label: "Draft" },
    { value: "SCHEDULED", label: "Scheduled" },
    { value: "PUBLISHED", label: "Published" },
    { value: "FAILED", label: "Failed" },
  ];

  return (
    <div className="flex flex-col gap-8 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Posts</h1>
          <p className="text-muted-foreground">
            Manage and track all your posts.
          </p>
        </div>
        <Button asChild>
          <Link href="/posts/new">
            <Plus className="mr-2 h-4 w-4" />
            New post
          </Link>
        </Button>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-2">
        {statuses.map(({ value, label }) => {
          const isActive = (statusFilter ?? "") === value;
          const href = value ? `/posts?status=${value}` : "/posts";
          return (
            <Link
              key={value}
              href={href}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </div>

      {/* Posts list */}
      <Card>
        <CardHeader>
          <CardTitle>{total} post{total !== 1 ? "s" : ""}</CardTitle>
          {statusFilter && (
            <CardDescription>
              Filtered by: {statusFilter.toLowerCase()}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {posts.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <FileText className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No posts found</p>
              <Button size="sm" asChild>
                <Link href="/posts/new">Create a post</Link>
              </Button>
            </div>
          ) : (
            <div className="divide-y">
              {posts.map((post) => (
                <div key={post.id} className="flex items-start gap-4 py-4 first:pt-0 last:pb-0">
                  <div className="flex-1 min-w-0">
                    <p className="line-clamp-2 text-sm">{post.content}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <StatusBadge status={post.status} />
                      {post.scheduledAt && (
                        <span className="text-xs text-muted-foreground">
                          {post.status === PostStatus.SCHEDULED
                            ? `Scheduled: ${new Date(post.scheduledAt).toLocaleString()}`
                            : new Date(post.scheduledAt).toLocaleString()}
                        </span>
                      )}
                      {post.publishResults.length > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {post.publishResults.map((r) => r.platform).join(", ")}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {(post.status === PostStatus.DRAFT ||
                      post.status === PostStatus.SCHEDULED) && (
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/posts/${post.id}/edit`}>Edit</Link>
                      </Button>
                    )}
                    <DeletePostButton postId={post.id} status={post.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          {page > 1 && (
            <Button variant="outline" size="sm" asChild>
              <Link
                href={`/posts?page=${page - 1}${statusFilter ? `&status=${statusFilter}` : ""}`}
              >
                Previous
              </Link>
            </Button>
          )}
          <span className="flex items-center text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <Button variant="outline" size="sm" asChild>
              <Link
                href={`/posts?page=${page + 1}${statusFilter ? `&status=${statusFilter}` : ""}`}
              >
                Next
              </Link>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    DRAFT: "bg-gray-100 text-gray-700",
    SCHEDULED: "bg-blue-100 text-blue-700",
    PUBLISHING: "bg-yellow-100 text-yellow-700",
    PUBLISHED: "bg-green-100 text-green-700",
    PARTIALLY_PUBLISHED: "bg-orange-100 text-orange-700",
    FAILED: "bg-red-100 text-red-700",
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] ?? "bg-gray-100 text-gray-700"}`}
    >
      {status.replace(/_/g, " ").toLowerCase()}
    </span>
  );
}
