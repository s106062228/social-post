import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Rss, Clock } from "lucide-react";
import { CreateFeedForm } from "./create-feed-form";
import { DeleteFeedButton } from "./delete-feed-button";
import { FetchFeedButton } from "./fetch-feed-button";

export default async function RssFeedsPage() {
  const session = await auth();
  const userId = session!.user!.id;

  const feeds = await prisma.rssFeed.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      url: true,
      autoCreate: true,
      lastFetchedAt: true,
      createdAt: true,
      _count: { select: { items: true } },
    },
  });

  return (
    <div className="flex flex-col gap-8 p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">RSS Feeds</h1>
        <p className="text-muted-foreground">
          Import content from RSS and Atom feeds. New items can automatically
          become draft posts.
        </p>
      </div>

      {/* Add feed form */}
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Add RSS feed</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateFeedForm />
        </CardContent>
      </Card>

      {/* Feed list */}
      <Card>
        <CardHeader>
          <CardTitle>
            {feeds.length} feed{feeds.length !== 1 ? "s" : ""}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {feeds.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <Rss className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No feeds yet</p>
              <p className="text-xs text-muted-foreground">
                Add an RSS or Atom feed URL above to start importing content.
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {feeds.map((feed) => (
                <div
                  key={feed.id}
                  className="flex items-start gap-4 py-4 first:pt-0 last:pb-0"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{feed.name}</span>
                      {feed.autoCreate && (
                        <Badge variant="outline" className="text-xs">
                          Auto-draft
                        </Badge>
                      )}
                    </div>

                    <p className="mt-1 text-xs text-muted-foreground truncate max-w-md">
                      {feed.url}
                    </p>

                    <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>
                        {feed._count.items} item{feed._count.items !== 1 ? "s" : ""} imported
                      </span>

                      {feed.lastFetchedAt && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Last fetched:{" "}
                          {new Date(feed.lastFetchedAt).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <FetchFeedButton feedId={feed.id} />
                    <DeleteFeedButton feedId={feed.id} />
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
