"use client";

import { useState, useCallback } from "react";
import { isPostDraggable, computeNewScheduledAt } from "@/lib/calendar-reschedule";

interface ScheduledPost {
  id: string;
  content: string;
  scheduledAt: string;
  status: string;
}

export function useCalendarReschedule(initialPosts: ScheduledPost[]) {
  const [posts, setPosts] = useState<ScheduledPost[]>(initialPosts);

  const isDraggable = useCallback(
    (postId: string) => {
      const post = posts.find((p) => p.id === postId);
      if (!post) return false;
      return isPostDraggable(post.status);
    },
    [posts]
  );

  const handleDrop = useCallback(
    async (
      postId: string,
      targetYear: number,
      targetMonth: number,
      targetDay: number
    ): Promise<boolean> => {
      const post = posts.find((p) => p.id === postId);
      if (!post) return false;

      const newDate = computeNewScheduledAt(
        post.scheduledAt,
        targetYear,
        targetMonth,
        targetDay
      );

      const prevPosts = [...posts];

      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, scheduledAt: newDate.toISOString() } : p
        )
      );

      try {
        const res = await fetch(`/api/posts/${postId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scheduledAt: newDate.toISOString() }),
        });

        if (!res.ok) throw new Error("API error");
        return true;
      } catch {
        setPosts(prevPosts);
        return false;
      }
    },
    [posts]
  );

  return { posts, handleDrop, isDraggable };
}
