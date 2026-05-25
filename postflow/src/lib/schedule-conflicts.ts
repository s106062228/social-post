import type { Platform } from "@prisma/client";

export interface ScheduledPostLike {
  id: string;
  scheduledAt: Date;
  publishResults?: Array<{ platform: Platform }>;
}

export interface ScheduleConflict {
  postAId: string;
  postBId: string;
  platform: Platform | "any";
  postATime: string;
  postBTime: string;
  overlapMinutes: number;
}

export interface ResolutionItem {
  postId: string;
  newScheduledAt: Date;
}

/**
 * Detects scheduling conflicts among SCHEDULED posts.
 * Two posts conflict when they are scheduled within `windowMinutes` of each other
 * and share at least one common platform (or either post has no platform info).
 */
export function detectConflicts(
  posts: ScheduledPostLike[],
  windowMinutes = 30
): ScheduleConflict[] {
  const windowMs = windowMinutes * 60 * 1000;
  const conflicts: ScheduleConflict[] = [];

  for (let i = 0; i < posts.length; i++) {
    for (let j = i + 1; j < posts.length; j++) {
      const a = posts[i];
      const b = posts[j];

      const diff = Math.abs(a.scheduledAt.getTime() - b.scheduledAt.getTime());
      if (diff >= windowMs) continue;

      const platformsA = a.publishResults?.map((r) => r.platform) ?? [];
      const platformsB = b.publishResults?.map((r) => r.platform) ?? [];

      // Determine conflicting platform
      let conflictPlatform: Platform | "any" = "any";
      if (platformsA.length > 0 && platformsB.length > 0) {
        const shared = platformsA.find((p) => platformsB.includes(p));
        if (!shared) continue; // different platforms — no conflict
        conflictPlatform = shared;
      }

      conflicts.push({
        postAId: a.id,
        postBId: b.id,
        platform: conflictPlatform,
        postATime: a.scheduledAt.toISOString(),
        postBTime: b.scheduledAt.toISOString(),
        overlapMinutes: Math.round((windowMs - diff) / 60_000),
      });
    }
  }

  return conflicts;
}

/**
 * Builds a plan to space conflicting posts evenly.
 * Takes the earliest post in a conflict cluster as the anchor and spaces
 * subsequent posts `spacingMinutes` apart.
 */
export function buildResolutionPlan(
  posts: ScheduledPostLike[],
  conflicts: ScheduleConflict[],
  spacingMinutes = 30
): ResolutionItem[] {
  if (conflicts.length === 0) return [];

  const spacingMs = spacingMinutes * 60 * 1000;

  // Build adjacency sets of conflicting post IDs
  const conflictSet = new Set<string>();
  conflicts.forEach((c) => {
    conflictSet.add(c.postAId);
    conflictSet.add(c.postBId);
  });

  // Sort conflicting posts by their original scheduledAt
  const conflictingPosts = posts
    .filter((p) => conflictSet.has(p.id))
    .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());

  if (conflictingPosts.length === 0) return [];

  const plan: ResolutionItem[] = [];
  let nextAvailable = conflictingPosts[0].scheduledAt.getTime();

  for (const post of conflictingPosts) {
    const originalMs = post.scheduledAt.getTime();
    // If this post is already at or after the next available slot, keep it there
    // but advance the pointer
    if (originalMs >= nextAvailable) {
      nextAvailable = originalMs + spacingMs;
    } else {
      // Needs to be moved
      plan.push({
        postId: post.id,
        newScheduledAt: new Date(nextAvailable),
      });
      nextAvailable += spacingMs;
    }
  }

  return plan;
}
