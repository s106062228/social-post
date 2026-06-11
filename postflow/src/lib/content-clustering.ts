import { computeWordFrequency } from "./word-frequency";

export interface TopicCluster {
  topic: string;
  postCount: number;
  postIds: string[];
  avgEngagement: number;
  totalEngagement: number;
  /** Percentage of total posts in this cluster (0–100) */
  coverage: number;
  /** Up to 3 co-occurring keywords in cluster posts */
  relatedKeywords: string[];
}

export interface ClusteringResult {
  clusters: TopicCluster[];
  totalPosts: number;
  uncategorizedCount: number;
}

interface PostData {
  id: string;
  content: string;
  engagement: number;
}

/**
 * Tokenises a single post content into unique lowercase words
 * (same cleaning pipeline as word-frequency.ts, without stop-word filtering).
 */
function tokenisePost(content: string): string[] {
  const cleaned = content
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/@\w+/g, " ")
    .replace(/[^a-zA-Z0-9#'\-\s]/g, " ")
    .replace(/#/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  return cleaned
    .split(/\s+/)
    .map((w) => w.replace(/^[-']+|[-']+$/g, ""))
    .filter((w) => w.length >= 3);
}

/**
 * Clusters posts by dominant topic keyword.
 *
 * Algorithm:
 *  1. Compute global top keywords across all posts (after stop-word removal).
 *  2. For each post, find which of those top keywords appears first in the post
 *     (i.e., is most prominent by global rank).
 *  3. Assign the post to that keyword's cluster.
 *  4. Drop clusters smaller than `minClusterSize`.
 *
 * @param posts       Array of post data including engagement score
 * @param maxClusters Maximum number of topic clusters to return (default 12)
 * @param minClusterSize Minimum posts required to form a cluster (default 2)
 */
export function clusterPostsByTopic(
  posts: PostData[],
  maxClusters = 12,
  minClusterSize = 2
): ClusteringResult {
  if (posts.length === 0) {
    return { clusters: [], totalPosts: 0, uncategorizedCount: 0 };
  }

  // Step 1: Global top keywords (stop-words already removed by computeWordFrequency)
  const globalTopWords = computeWordFrequency(
    posts.map((p) => p.content),
    maxClusters * 4
  );
  if (globalTopWords.length === 0) {
    return { clusters: [], totalPosts: posts.length, uncategorizedCount: posts.length };
  }

  // Ordered list for priority (lower index = higher global frequency)
  const topKeywordsOrdered = globalTopWords.map((w) => w.text);
  const topKeywordSet = new Set(topKeywordsOrdered);

  // Step 2: Assign each post to its primary cluster keyword
  const clusterMap = new Map<
    string,
    { postIds: string[]; totalEngagement: number }
  >();

  let uncategorized = 0;

  for (const post of posts) {
    const tokens = tokenisePost(post.content);

    // Find the first token (in post order) that's also a global top keyword
    const primaryKeyword = tokens.find((t) => topKeywordSet.has(t));
    if (!primaryKeyword) {
      uncategorized++;
      continue;
    }

    let entry = clusterMap.get(primaryKeyword);
    if (!entry) {
      entry = { postIds: [], totalEngagement: 0 };
      clusterMap.set(primaryKeyword, entry);
    }
    entry.postIds.push(post.id);
    entry.totalEngagement += post.engagement;
  }

  // Step 3: Build cluster objects, drop too-small ones
  const clusters: TopicCluster[] = [];

  for (const [topic, data] of clusterMap.entries()) {
    if (data.postIds.length < minClusterSize) {
      uncategorized += data.postIds.length;
      continue;
    }

    // Related keywords: top 5 words across cluster posts, excluding the topic itself
    const clusterContents = posts
      .filter((p) => data.postIds.includes(p.id))
      .map((p) => p.content);
    const relatedWords = computeWordFrequency(clusterContents, 6)
      .map((w) => w.text)
      .filter((w) => w !== topic)
      .slice(0, 3);

    clusters.push({
      topic,
      postCount: data.postIds.length,
      postIds: data.postIds,
      totalEngagement: data.totalEngagement,
      avgEngagement:
        data.postIds.length > 0
          ? Math.round(data.totalEngagement / data.postIds.length)
          : 0,
      coverage: 0, // computed below
      relatedKeywords: relatedWords,
    });
  }

  // Step 4: Sort by post count desc, then limit
  clusters.sort((a, b) => b.postCount - a.postCount || b.avgEngagement - a.avgEngagement);
  const limited = clusters.slice(0, maxClusters);

  // Step 5: Compute coverage as % of all posts
  for (const c of limited) {
    c.coverage = posts.length > 0
      ? Math.round((c.postCount / posts.length) * 100)
      : 0;
  }

  const totalAccountedFor = limited.reduce((s, c) => s + c.postCount, 0);

  return {
    clusters: limited,
    totalPosts: posts.length,
    uncategorizedCount: posts.length - totalAccountedFor + uncategorized,
  };
}
