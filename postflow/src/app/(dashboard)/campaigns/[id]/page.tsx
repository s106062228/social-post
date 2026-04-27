import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  CalendarRange,
  Target,
  FileText,
} from "lucide-react";
import { RemovePostButton } from "./remove-post-button";
import { AddPostPanel } from "./add-post-panel";

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  const userId = session!.user!.id;
  const { id } = await params;

  const campaign = await prisma.campaign.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      description: true,
      goal: true,
      startDate: true,
      endDate: true,
      isActive: true,
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

  if (!campaign || campaign.userId !== userId) {
    notFound();
  }

  const postIdsInCampaign = new Set(campaign.posts.map((cp) => cp.post.id));

  const allPosts = await prisma.post.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { id: true, content: true, status: true },
  });

  const availablePosts = allPosts.filter((p) => !postIdsInCampaign.has(p.id));

  const statusColors: Record<string, string> = {
    DRAFT: "bg-gray-100 text-gray-700",
    SCHEDULED: "bg-blue-100 text-blue-700",
    PUBLISHING: "bg-yellow-100 text-yellow-700",
    PUBLISHED: "bg-green-100 text-green-700",
    PARTIALLY_PUBLISHED: "bg-orange-100 text-orange-700",
    FAILED: "bg-red-100 text-red-700",
  };

  return (
    <div className="flex flex-col gap-8 p-8">
      {/* Back link */}
      <div>
        <Link
          href="/campaigns"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All campaigns
        </Link>
      </div>

      {/* Campaign header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{campaign.name}</h1>
            <Badge variant={campaign.isActive ? "default" : "secondary"}>
              {campaign.isActive ? "Active" : "Paused"}
            </Badge>
          </div>

          {campaign.description && (
            <p className="mt-1 text-muted-foreground">{campaign.description}</p>
          )}

          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
            {campaign.goal && (
              <span className="flex items-center gap-1.5">
                <Target className="h-4 w-4" />
                {campaign.goal}
              </span>
            )}
            {(campaign.startDate ?? campaign.endDate) && (
              <span className="flex items-center gap-1.5">
                <CalendarRange className="h-4 w-4" />
                {campaign.startDate
                  ? new Date(campaign.startDate).toLocaleDateString()
                  : "—"}
                {" → "}
                {campaign.endDate
                  ? new Date(campaign.endDate).toLocaleDateString()
                  : "ongoing"}
              </span>
            )}
          </div>
        </div>

        <Button variant="outline" asChild>
          <Link href={`/campaigns/${campaign.id}`}>
            {campaign.posts.length} post{campaign.posts.length !== 1 ? "s" : ""}
          </Link>
        </Button>
      </div>

      {/* Add post panel */}
      <Card>
        <CardHeader>
          <CardTitle>Add a post</CardTitle>
        </CardHeader>
        <CardContent>
          <AddPostPanel campaignId={campaign.id} availablePosts={availablePosts} />
        </CardContent>
      </Card>

      {/* Posts in campaign */}
      <Card>
        <CardHeader>
          <CardTitle>Posts in this campaign</CardTitle>
        </CardHeader>
        <CardContent>
          {campaign.posts.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <FileText className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No posts in this campaign yet</p>
              <p className="text-xs text-muted-foreground">
                Add existing posts using the selector above.
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {campaign.posts.map(({ post, addedAt }) => (
                <div
                  key={post.id}
                  className="flex items-start gap-4 py-4 first:pt-0 last:pb-0"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          statusColors[post.status] ?? "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {post.status}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Added {new Date(addedAt).toLocaleDateString()}
                      </span>
                    </div>
                    <Link
                      href={`/posts/${post.id}`}
                      className="mt-1 block text-sm line-clamp-2 hover:underline"
                    >
                      {post.content}
                    </Link>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {post.scheduledAt
                        ? `Scheduled for ${new Date(post.scheduledAt).toLocaleString()}`
                        : `Created ${new Date(post.createdAt).toLocaleDateString()}`}
                    </p>
                  </div>
                  <RemovePostButton campaignId={campaign.id} postId={post.id} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
