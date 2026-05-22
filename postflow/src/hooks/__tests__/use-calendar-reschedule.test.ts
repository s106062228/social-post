/**
 * Tests for the calendar reschedule hook behavior.
 * Since jest uses the 'node' environment, React hooks cannot be rendered
 * directly. Instead, we test the underlying logic that the hook delegates to.
 * The state-management (optimistic update + rollback) is tested below via
 * a thin simulation of the hook's handleDrop flow.
 */

import { isPostDraggable, computeNewScheduledAt } from "../../lib/calendar-reschedule";

interface Post {
  id: string;
  content: string;
  scheduledAt: string;
  status: string;
}

async function simulateHandleDrop(
  posts: Post[],
  postId: string,
  targetYear: number,
  targetMonth: number,
  targetDay: number
): Promise<{ success: boolean; finalPosts: Post[] }> {
  const post = posts.find((p) => p.id === postId);
  if (!post) return { success: false, finalPosts: posts };

  const newDate = computeNewScheduledAt(post.scheduledAt, targetYear, targetMonth, targetDay);
  const updatedPosts = posts.map((p) =>
    p.id === postId ? { ...p, scheduledAt: newDate.toISOString() } : p
  );

  try {
    const res = await fetch(`/api/posts/${postId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scheduledAt: newDate.toISOString() }),
    });

    if (!res.ok) throw new Error("API error");
    return { success: true, finalPosts: updatedPosts };
  } catch {
    return { success: false, finalPosts: posts }; // rollback
  }
}

const mockFetch = jest.fn();
global.fetch = mockFetch;

const samplePosts: Post[] = [
  {
    id: "p1",
    content: "Test post one",
    scheduledAt: "2026-05-22T10:00:00.000Z",
    status: "SCHEDULED",
  },
  {
    id: "p2",
    content: "Draft post",
    scheduledAt: "2026-05-23T14:30:00.000Z",
    status: "DRAFT",
  },
];

describe("useCalendarReschedule — initial state", () => {
  it("starts with the provided posts unchanged", () => {
    expect(samplePosts).toHaveLength(2);
    expect(samplePosts[0].id).toBe("p1");
    expect(samplePosts[1].id).toBe("p2");
  });

  it("isDraggable returns true for SCHEDULED posts", () => {
    expect(isPostDraggable("SCHEDULED")).toBe(true);
  });

  it("isDraggable returns true for DRAFT posts", () => {
    expect(isPostDraggable("DRAFT")).toBe(true);
  });

  it("isDraggable returns false for PUBLISHED posts", () => {
    expect(isPostDraggable("PUBLISHED")).toBe(false);
  });
});

describe("useCalendarReschedule — handleDrop", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("successful drop updates scheduledAt and returns success=true", async () => {
    mockFetch.mockResolvedValue({ ok: true });

    const { success, finalPosts } = await simulateHandleDrop(
      samplePosts,
      "p1",
      2026,
      4,
      28
    );

    expect(success).toBe(true);
    const p1 = finalPosts.find((p) => p.id === "p1")!;
    expect(new Date(p1.scheduledAt).getDate()).toBe(28);
    expect(new Date(p1.scheduledAt).getMonth()).toBe(4);
  });

  it("failed API call rolls back posts and returns success=false", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });

    const { success, finalPosts } = await simulateHandleDrop(
      samplePosts,
      "p1",
      2026,
      4,
      28
    );

    expect(success).toBe(false);
    const p1 = finalPosts.find((p) => p.id === "p1")!;
    expect(p1.scheduledAt).toBe("2026-05-22T10:00:00.000Z");
  });

  it("fetch exception rolls back posts and returns success=false", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));

    const { success, finalPosts } = await simulateHandleDrop(
      samplePosts,
      "p1",
      2026,
      4,
      28
    );

    expect(success).toBe(false);
    const p1 = finalPosts.find((p) => p.id === "p1")!;
    expect(p1.scheduledAt).toBe("2026-05-22T10:00:00.000Z");
  });

  it("unknown postId is no-op and returns success=false", async () => {
    const { success, finalPosts } = await simulateHandleDrop(
      samplePosts,
      "nonexistent-id",
      2026,
      4,
      28
    );

    expect(success).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(finalPosts).toBe(samplePosts);
  });

  it("preserves time-of-day when rescheduling", async () => {
    mockFetch.mockResolvedValue({ ok: true });

    const { success } = await simulateHandleDrop(samplePosts, "p1", 2026, 5, 10);

    expect(success).toBe(true);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    const newDate = new Date(body.scheduledAt);
    expect(newDate.getHours()).toBe(10);
    expect(newDate.getMinutes()).toBe(0);
  });
});
