"use client";

import Link from "next/link";
import { Calendar, Clock, Edit } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface UpcomingPost {
  id: string;
  content: string;
  scheduledAt: string | Date | null;
  platforms: string[];
}

interface UpcomingPostsCardProps {
  posts: UpcomingPost[];
}

function formatCountdown(scheduledAt: string | Date | null): string {
  if (!scheduledAt) return "";
  const now = Date.now();
  const target = new Date(scheduledAt).getTime();
  const diffMs = target - now;
  if (diffMs <= 0) return "now";
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay > 0) return `in ${diffDay}d ${diffHr % 24}h`;
  if (diffHr > 0) return `in ${diffHr}h ${diffMin % 60}m`;
  return `in ${diffMin}m`;
}

const PLATFORM_COLORS: Record<string, string> = {
  FACEBOOK: "bg-blue-100 text-blue-700",
  INSTAGRAM: "bg-pink-100 text-pink-700",
  THREADS: "bg-gray-100 text-gray-700",
  TWITTER: "bg-sky-100 text-sky-700",
  LINKEDIN: "bg-blue-100 text-blue-800",
  YOUTUBE: "bg-red-100 text-red-700",
  TIKTOK: "bg-slate-100 text-slate-700",
  REDDIT: "bg-orange-100 text-orange-700",
  BLUESKY: "bg-cyan-100 text-cyan-700",
  MASTODON: "bg-purple-100 text-purple-700",
  TELEGRAM: "bg-teal-100 text-teal-700",
  NOSTR: "bg-yellow-100 text-yellow-700",
  TUMBLR: "bg-indigo-100 text-indigo-700",
  WORDPRESS: "bg-blue-100 text-blue-600",
  MEDIUM: "bg-green-100 text-green-700",
  GHOST: "bg-yellow-100 text-yellow-800",
  DEVTO: "bg-gray-100 text-gray-800",
  HASHNODE: "bg-blue-100 text-blue-700",
  PINTEREST: "bg-red-100 text-red-700",
  LINKEDIN_PERSONAL: "bg-blue-100 text-blue-800",
};

export function UpcomingPostsCard({ posts }: UpcomingPostsCardProps) {
  if (posts.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Upcoming Posts
          </CardTitle>
          <CardDescription>Your next scheduled posts</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <Calendar className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No upcoming posts</p>
            <Button size="sm" asChild>
              <Link href="/posts/new">Schedule a post</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Upcoming Posts
            </CardTitle>
            <CardDescription>Your next scheduled posts</CardDescription>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/calendar">View calendar</Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="divide-y">
          {posts.map((post) => (
            <div key={post.id} className="flex items-start gap-3 py-3">
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm">{post.content.slice(0, 80)}{post.content.length > 80 ? "…" : ""}</p>
                <div className="mt-1 flex items-center gap-2 flex-wrap">
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {formatCountdown(post.scheduledAt)}
                  </span>
                  {post.platforms.slice(0, 3).map((p) => (
                    <span
                      key={p}
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${PLATFORM_COLORS[p] ?? "bg-gray-100 text-gray-700"}`}
                    >
                      {p.charAt(0) + p.slice(1).toLowerCase()}
                    </span>
                  ))}
                  {post.platforms.length > 3 && (
                    <span className="text-xs text-muted-foreground">+{post.platforms.length - 3}</span>
                  )}
                </div>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" asChild>
                <Link href={`/posts/${post.id}/edit`}>
                  <Edit className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
