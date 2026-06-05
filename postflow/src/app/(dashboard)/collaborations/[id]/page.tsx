import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, DollarSign, CalendarRange, FileText,
  BarChart2, Users2
} from "lucide-react";
import { AddPostButton } from "./add-post-button";
import { RemovePostButton } from "./remove-post-button";

const STATUS_COLORS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  ACTIVE: "default",
  COMPLETED: "secondary",
  CANCELLED: "destructive",
};

const POST_STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  SCHEDULED: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  PUBLISHING: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
  PUBLISHED: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  PARTIALLY_PUBLISHED: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
  FAILED: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
};

type PageProps = { params: Promise<{ id: string }> };

export default async function CollaborationDetailPage({ params }: PageProps) {
  const { id } = await params;
  const session = await auth();
  const userId = session!.user!.id;

  const collaboration = await prisma.collaboration.findFirst({
    where: { id, userId },
    select: {
      id: true,
      name: true,
      partnerName: true,
      partnerHandle: true,
      platform: true,
      deliverables: true,
      startDate: true,
      endDate: true,
      budget: true,
      notes: true,
      status: true,
      createdAt: true,
      posts: {
        orderBy: { addedAt: "desc" },
        select: {
          addedAt: true,
          post: {
            select: {
              id: true,
              content: true,
              status: true,
              scheduledAt: true,
              createdAt: true,
              mediaType: true,
            },
          },
        },
      },
      _count: { select: { posts: true } },
    },
  });

  if (!collaboration) notFound();

  // Compute performance summary directly
  const collabPostsWithInsights = await prisma.collaborationPost.findMany({
    where: { collaborationId: id },
    select: {
      post: {
        select: {
          status: true,
          publishResults: {
            where: { status: "PUBLISHED" },
            select: {
              insights: {
                select: { likes: true, comments: true, shares: true, reach: true },
              },
            },
          },
        },
      },
    },
  });

  let totalReach = 0, totalLikes = 0, totalComments = 0, totalShares = 0, publishedCount = 0;
  for (const cp of collabPostsWithInsights) {
    if (cp.post.status !== "PUBLISHED") continue;
    publishedCount++;
    for (const pr of cp.post.publishResults) {
      for (const ins of pr.insights) {
        totalReach += ins.reach ?? 0;
        totalLikes += ins.likes ?? 0;
        totalComments += ins.comments ?? 0;
        totalShares += ins.shares ?? 0;
      }
    }
  }
  const totalEngagement = totalLikes + totalComments + totalShares;
  const avgEngagement = publishedCount > 0 ? Math.round(totalEngagement / publishedCount) : 0;
  const perf = publishedCount > 0 ? { totalPosts: publishedCount, totalReach, totalLikes, totalComments, totalShares, totalEngagement, avgEngagement } : null;

  return (
    <div className="flex flex-col gap-8 p-8">
      <div className="flex items-center gap-3">
        <Link
          href="/collaborations"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight">{collaboration.name}</h1>
            <Badge variant={STATUS_COLORS[collaboration.status] ?? "secondary"}>
              {collaboration.status.charAt(0) + collaboration.status.slice(1).toLowerCase()}
            </Badge>
            {collaboration.platform && (
              <Badge variant="outline">
                {collaboration.platform.charAt(0) + collaboration.platform.slice(1).toLowerCase().replace(/_/g, " ")}
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground">
            Partnership with <strong>{collaboration.partnerName}</strong>
            {collaboration.partnerHandle && ` (${collaboration.partnerHandle})`}
          </p>
        </div>
      </div>

      {/* Details + Performance */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users2 className="h-4 w-4" /> Details
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {(collaboration.startDate ?? collaboration.endDate) && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <CalendarRange className="h-4 w-4 shrink-0" />
                <span>
                  {collaboration.startDate ? new Date(collaboration.startDate).toLocaleDateString() : "—"}
                  {" → "}
                  {collaboration.endDate ? new Date(collaboration.endDate).toLocaleDateString() : "ongoing"}
                </span>
              </div>
            )}
            {collaboration.budget != null && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <DollarSign className="h-4 w-4 shrink-0" />
                <span>${collaboration.budget.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} budget</span>
              </div>
            )}
            {collaboration.deliverables.length > 0 && (
              <div>
                <p className="font-medium mb-1">Deliverables</p>
                <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                  {collaboration.deliverables.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              </div>
            )}
            {collaboration.notes && (
              <p className="text-muted-foreground whitespace-pre-wrap">{collaboration.notes}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart2 className="h-4 w-4" /> Performance
            </CardTitle>
          </CardHeader>
          <CardContent>
            {perf ? (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Published posts</p>
                  <p className="text-2xl font-bold">{perf.totalPosts}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total engagement</p>
                  <p className="text-2xl font-bold">{perf.totalEngagement.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total reach</p>
                  <p className="text-2xl font-bold">{perf.totalReach.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Avg engagement</p>
                  <p className="text-2xl font-bold">{perf.avgEngagement.toLocaleString()}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-4">
                Publish linked posts to see performance data.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Linked posts */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4" />
              Linked posts ({collaboration._count.posts})
            </CardTitle>
            <AddPostButton collaborationId={collaboration.id} />
          </div>
        </CardHeader>
        <CardContent>
          {collaboration.posts.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No posts linked yet. Add posts using the button above.
            </div>
          ) : (
            <div className="divide-y">
              {collaboration.posts.map(({ post, addedAt }) => (
                <div key={post.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="flex-1 min-w-0">
                    <Link href={`/posts`} className="text-sm hover:underline line-clamp-1">
                      {post.content.slice(0, 80)}
                      {post.content.length > 80 ? "…" : ""}
                    </Link>
                    <div className="mt-1 flex items-center gap-2">
                      <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${POST_STATUS_COLORS[post.status] ?? ""}`}>
                        {post.status}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Added {new Date(addedAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <RemovePostButton collaborationId={collaboration.id} postId={post.id} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
