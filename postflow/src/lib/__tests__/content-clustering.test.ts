import { clusterPostsByTopic } from "@/lib/content-clustering";

interface PostData {
  id: string;
  content: string;
  engagement: number;
}

function makePost(
  id: string,
  content: string,
  engagement = 0
): PostData {
  return { id, content, engagement };
}

// ── clusterPostsByTopic ────────────────────────────────────────────────────────

describe("clusterPostsByTopic", () => {
  // ── Empty input ──────────────────────────────────────────────────────────────

  it("returns empty result for empty posts array", () => {
    const result = clusterPostsByTopic([]);
    expect(result.clusters).toHaveLength(0);
    expect(result.totalPosts).toBe(0);
    expect(result.uncategorizedCount).toBe(0);
  });

  // ── Single post (below minClusterSize) ───────────────────────────────────────

  it("returns no clusters when only one post exists (below minClusterSize=2)", () => {
    const result = clusterPostsByTopic([
      makePost("1", "marketing strategy digital growth"),
    ]);
    // Single post cannot form a cluster of size >= 2
    expect(result.totalPosts).toBe(1);
    expect(result.uncategorizedCount).toBe(1);
    expect(result.clusters).toHaveLength(0);
  });

  // ── Clustering by keyword ────────────────────────────────────────────────────

  it("groups posts sharing a dominant keyword into the same cluster", () => {
    const posts = [
      makePost("1", "marketing strategy for social media growth"),
      makePost("2", "digital marketing techniques for small businesses"),
      makePost("3", "marketing tips for better engagement"),
      makePost("4", "cooking recipes pasta italian food"),
      makePost("5", "cooking pasta carbonara classic recipe"),
    ];
    const result = clusterPostsByTopic(posts, 5, 2);

    expect(result.totalPosts).toBe(5);
    // Marketing and cooking should form clusters
    const topics = result.clusters.map((c) => c.topic);
    // At least one cluster expected
    expect(result.clusters.length).toBeGreaterThan(0);

    // Each cluster should have postCount >= 2
    for (const cluster of result.clusters) {
      expect(cluster.postCount).toBeGreaterThanOrEqual(2);
    }
  });

  // ── Coverage percentage ───────────────────────────────────────────────────────

  it("coverage sums to at most 100% across all clusters", () => {
    const posts = [
      makePost("1", "marketing strategy digital"),
      makePost("2", "digital marketing growth tips"),
      makePost("3", "marketing content creation best"),
      makePost("4", "marketing brand awareness"),
    ];
    const result = clusterPostsByTopic(posts, 5, 2);

    const totalCoverage = result.clusters.reduce((s, c) => s + c.coverage, 0);
    expect(totalCoverage).toBeLessThanOrEqual(100);

    for (const cluster of result.clusters) {
      expect(cluster.coverage).toBeGreaterThanOrEqual(0);
      expect(cluster.coverage).toBeLessThanOrEqual(100);
    }
  });

  // ── postIds populated ─────────────────────────────────────────────────────────

  it("populates postIds for each cluster", () => {
    const posts = [
      makePost("p1", "startup funding venture capital investment"),
      makePost("p2", "startup growth hacking techniques investment"),
      makePost("p3", "startup valuation funding rounds series"),
    ];
    const result = clusterPostsByTopic(posts, 5, 2);

    for (const cluster of result.clusters) {
      expect(Array.isArray(cluster.postIds)).toBe(true);
      expect(cluster.postIds.length).toBe(cluster.postCount);
      // All postIds should be from the input
      for (const id of cluster.postIds) {
        expect(["p1", "p2", "p3"]).toContain(id);
      }
    }
  });

  // ── Engagement average ────────────────────────────────────────────────────────

  it("computes avgEngagement correctly", () => {
    const posts = [
      makePost("1", "fitness workout gym training", 100),
      makePost("2", "fitness diet nutrition workout", 200),
      makePost("3", "fitness running marathon training", 300),
    ];
    const result = clusterPostsByTopic(posts, 5, 2);

    if (result.clusters.length > 0) {
      const cluster = result.clusters[0];
      expect(cluster.totalEngagement).toBe(
        posts
          .filter((p) => cluster.postIds.includes(p.id))
          .reduce((s, p) => s + p.engagement, 0)
      );
      expect(cluster.avgEngagement).toBe(
        Math.round(cluster.totalEngagement / cluster.postCount)
      );
    }
  });

  // ── relatedKeywords ───────────────────────────────────────────────────────────

  it("includes relatedKeywords (up to 3) for each cluster", () => {
    const posts = [
      makePost("1", "technology innovation software development"),
      makePost("2", "technology artificial intelligence machine learning"),
      makePost("3", "technology blockchain distributed systems"),
    ];
    const result = clusterPostsByTopic(posts, 5, 2);

    for (const cluster of result.clusters) {
      expect(Array.isArray(cluster.relatedKeywords)).toBe(true);
      expect(cluster.relatedKeywords.length).toBeLessThanOrEqual(3);
      // The cluster topic itself should NOT appear in relatedKeywords
      expect(cluster.relatedKeywords).not.toContain(cluster.topic);
    }
  });

  // ── maxClusters limit ──────────────────────────────────────────────────────────

  it("respects the maxClusters limit", () => {
    const posts: PostData[] = [];
    // Create many different topic posts
    for (let i = 0; i < 20; i++) {
      posts.push(
        makePost(`p${i}`, `topic${i} keyword${i} content${i} subject${i}`)
      );
      posts.push(
        makePost(`p${i}x`, `topic${i} another${i} post${i} writing${i}`)
      );
    }
    const result = clusterPostsByTopic(posts, 3, 2);
    expect(result.clusters.length).toBeLessThanOrEqual(3);
  });

  // ── Sorted by postCount desc ───────────────────────────────────────────────────

  it("returns clusters sorted by postCount descending", () => {
    const posts = [
      makePost("1", "marketing digital strategy"),
      makePost("2", "marketing growth hacking"),
      makePost("3", "marketing brand awareness"),
      makePost("4", "marketing content creation"),
      makePost("5", "cooking pasta recipe"),
      makePost("6", "cooking dinner meal prep"),
    ];
    const result = clusterPostsByTopic(posts, 5, 2);

    for (let i = 1; i < result.clusters.length; i++) {
      expect(result.clusters[i - 1].postCount).toBeGreaterThanOrEqual(
        result.clusters[i].postCount
      );
    }
  });

  // ── totalPosts + uncategorizedCount ─────────────────────────────────────────────

  it("totalPosts equals the input count", () => {
    const posts = [
      makePost("1", "random xyz content"),
      makePost("2", "some other different topic"),
      makePost("3", "marketing strategy digital"),
      makePost("4", "marketing content creation"),
    ];
    const result = clusterPostsByTopic(posts, 5, 2);
    expect(result.totalPosts).toBe(4);
  });
});
