jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
  dbLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  publishLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
}));

jest.mock("@/auth", () => ({ auth: jest.fn() }));

jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn(),
  rateLimit: jest.fn(),
  rateLimitHeaders: jest.fn().mockReturnValue({}),
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    testimonialPage: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    testimonial: {
      count: jest.fn(),
      create: jest.fn(),
    },
  },
}));

import { NextRequest } from "next/server";
import { GET as listPages, POST as createPage } from "@/app/api/testimonial-pages/route";
import { PATCH as updatePage, DELETE as deletePage } from "@/app/api/testimonial-pages/[id]/route";
import { GET as getCollectionPage, POST as submitTestimonial } from "@/app/api/t/[slug]/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter, rateLimit } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockRateLimit = rateLimit as jest.Mock;
const mockFindMany = prisma.testimonialPage.findMany as jest.Mock;
const mockFindUnique = prisma.testimonialPage.findUnique as jest.Mock;
const mockCreate = prisma.testimonialPage.create as jest.Mock;
const mockUpdate = prisma.testimonialPage.update as jest.Mock;
const mockDelete = prisma.testimonialPage.delete as jest.Mock;
const mockCount = prisma.testimonialPage.count as jest.Mock;
const mockTestimonialCount = prisma.testimonial.count as jest.Mock;
const mockTestimonialCreate = prisma.testimonial.create as jest.Mock;

const MOCK_USER_ID = "user_test_001";
const OTHER_USER_ID = "user_other_002";
const VALID_ID = "page_001";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "test@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

const BASE_PAGE = {
  id: VALID_ID,
  userId: MOCK_USER_ID,
  slug: "acme-feedback",
  title: "Share Your Feedback",
  welcomeMessage: "We'd love to hear from you!",
  thankYouMessage: "Thanks for sharing your experience!",
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeRequest(url: string, opts?: RequestInit): NextRequest {
  return new NextRequest(url, opts);
}

function jsonRequest(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue(AUTHED_SESSION);
  mockApiLimiter.mockResolvedValue(RATE_LIMIT_OK);
  mockRateLimit.mockResolvedValue(RATE_LIMIT_OK);
});

// ── GET /api/testimonial-pages ────────────────────────────────────────────────
describe("GET /api/testimonial-pages", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await listPages();
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await listPages();
    expect(res.status).toBe(429);
  });

  it("returns the user's testimonial pages", async () => {
    mockFindMany.mockResolvedValueOnce([BASE_PAGE]);
    const res = await listPages();
    expect(res.status).toBe(200);
    const data = (await res.json()) as { pages: (typeof BASE_PAGE)[] };
    expect(data.pages).toHaveLength(1);
    expect(data.pages[0].slug).toBe("acme-feedback");
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: MOCK_USER_ID } })
    );
  });
});

// ── POST /api/testimonial-pages ───────────────────────────────────────────────
describe("POST /api/testimonial-pages", () => {
  function postRequest(body?: unknown) {
    return jsonRequest("http://localhost:3000/api/testimonial-pages", "POST", body);
  }

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await createPage(postRequest({ slug: "acme-feedback", title: "Feedback" }));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await createPage(postRequest({ slug: "acme-feedback", title: "Feedback" }));
    expect(res.status).toBe(429);
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new NextRequest("http://localhost:3000/api/testimonial-pages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not-json",
    });
    const res = await createPage(req);
    expect(res.status).toBe(400);
  });

  it("returns 422 for an invalid slug", async () => {
    const res = await createPage(postRequest({ slug: "AB", title: "Feedback" }));
    expect(res.status).toBe(422);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Validation error");
  });

  it("returns 422 when title is missing", async () => {
    const res = await createPage(postRequest({ slug: "acme-feedback" }));
    expect(res.status).toBe(422);
  });

  it("returns 422 when the user has reached the page limit", async () => {
    mockCount.mockResolvedValueOnce(5);
    const res = await createPage(postRequest({ slug: "acme-feedback", title: "Feedback" }));
    expect(res.status).toBe(422);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Maximum 5 testimonial pages per user");
  });

  it("returns 409 when the slug is already taken", async () => {
    mockCount.mockResolvedValueOnce(1);
    mockFindUnique.mockResolvedValueOnce({ id: "other_page" });
    const res = await createPage(postRequest({ slug: "acme-feedback", title: "Feedback" }));
    expect(res.status).toBe(409);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Slug is already taken");
  });

  it("creates a testimonial page and returns 201", async () => {
    mockCount.mockResolvedValueOnce(0);
    mockFindUnique.mockResolvedValueOnce(null);
    mockCreate.mockResolvedValueOnce(BASE_PAGE);

    const res = await createPage(
      postRequest({ slug: "acme-feedback", title: "Share Your Feedback", welcomeMessage: "Hi!" })
    );
    expect(res.status).toBe(201);
    const data = (await res.json()) as { page: typeof BASE_PAGE };
    expect(data.page.slug).toBe("acme-feedback");
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: MOCK_USER_ID, slug: "acme-feedback", isActive: true }),
      })
    );
  });
});

// ── PATCH /api/testimonial-pages/[id] ─────────────────────────────────────────
describe("PATCH /api/testimonial-pages/[id]", () => {
  const params = Promise.resolve({ id: VALID_ID });

  function patchRequest(body?: unknown) {
    return jsonRequest(`http://localhost:3000/api/testimonial-pages/${VALID_ID}`, "PATCH", body);
  }

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await updatePage(patchRequest({ title: "New Title" }), { params });
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await updatePage(patchRequest({ title: "New Title" }), { params });
    expect(res.status).toBe(429);
  });

  it("returns 422 for an invalid payload", async () => {
    const res = await updatePage(patchRequest({ slug: "AB" }), { params });
    expect(res.status).toBe(422);
  });

  it("returns 404 when the page does not exist", async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    const res = await updatePage(patchRequest({ title: "New Title" }), { params });
    expect(res.status).toBe(404);
  });

  it("returns 404 when the page belongs to another user", async () => {
    mockFindUnique.mockResolvedValueOnce({ ...BASE_PAGE, userId: OTHER_USER_ID });
    const res = await updatePage(patchRequest({ title: "New Title" }), { params });
    expect(res.status).toBe(404);
  });

  it("returns 409 when changing to a slug that is already taken", async () => {
    mockFindUnique
      .mockResolvedValueOnce(BASE_PAGE)
      .mockResolvedValueOnce({ id: "other_page" });
    const res = await updatePage(patchRequest({ slug: "taken-slug" }), { params });
    expect(res.status).toBe(409);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Slug is already taken");
  });

  it("updates the page and returns 200", async () => {
    mockFindUnique.mockResolvedValueOnce(BASE_PAGE);
    mockUpdate.mockResolvedValueOnce({ ...BASE_PAGE, title: "Updated Title" });

    const res = await updatePage(patchRequest({ title: "Updated Title" }), { params });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { page: typeof BASE_PAGE };
    expect(data.page.title).toBe("Updated Title");
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: VALID_ID } })
    );
  });
});

// ── DELETE /api/testimonial-pages/[id] ────────────────────────────────────────
describe("DELETE /api/testimonial-pages/[id]", () => {
  const params = Promise.resolve({ id: VALID_ID });

  function delRequest() {
    return makeRequest(`http://localhost:3000/api/testimonial-pages/${VALID_ID}`, { method: "DELETE" });
  }

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await deletePage(delRequest(), { params });
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await deletePage(delRequest(), { params });
    expect(res.status).toBe(429);
  });

  it("returns 404 when the page does not exist", async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    const res = await deletePage(delRequest(), { params });
    expect(res.status).toBe(404);
  });

  it("returns 404 when the page belongs to another user", async () => {
    mockFindUnique.mockResolvedValueOnce({ ...BASE_PAGE, userId: OTHER_USER_ID });
    const res = await deletePage(delRequest(), { params });
    expect(res.status).toBe(404);
  });

  it("deletes the page and returns success", async () => {
    mockFindUnique.mockResolvedValueOnce(BASE_PAGE);
    mockDelete.mockResolvedValueOnce(BASE_PAGE);

    const res = await deletePage(delRequest(), { params });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { success: boolean };
    expect(data.success).toBe(true);
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: VALID_ID } });
  });
});

// ── GET /api/t/[slug] ─────────────────────────────────────────────────────────
describe("GET /api/t/[slug]", () => {
  const params = Promise.resolve({ slug: "acme-feedback" });

  it("returns 404 when the page does not exist", async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    const res = await getCollectionPage(makeRequest("http://localhost:3000/api/t/acme-feedback"), { params });
    expect(res.status).toBe(404);
  });

  it("returns 404 when the page is inactive", async () => {
    mockFindUnique.mockResolvedValueOnce({ ...BASE_PAGE, isActive: false });
    const res = await getCollectionPage(makeRequest("http://localhost:3000/api/t/acme-feedback"), { params });
    expect(res.status).toBe(404);
  });

  it("returns the page config when active", async () => {
    mockFindUnique.mockResolvedValueOnce(BASE_PAGE);
    const res = await getCollectionPage(makeRequest("http://localhost:3000/api/t/acme-feedback"), { params });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { page: typeof BASE_PAGE };
    expect(data.page.slug).toBe("acme-feedback");
    expect(data.page.title).toBe("Share Your Feedback");
  });
});

// ── POST /api/t/[slug] ────────────────────────────────────────────────────────
describe("POST /api/t/[slug]", () => {
  const params = Promise.resolve({ slug: "acme-feedback" });

  function submitRequest(body?: unknown, headers?: Record<string, string>) {
    return new NextRequest("http://localhost:3000/api/t/acme-feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  const VALID_SUBMISSION = {
    authorName: "Jane Doe",
    authorTitle: "Marketing Director",
    company: "Acme Inc.",
    content: "PostFlow transformed how we schedule content!",
    rating: 5,
  };

  it("returns 429 when rate limited", async () => {
    mockRateLimit.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await submitTestimonial(submitRequest(VALID_SUBMISSION), { params });
    expect(res.status).toBe(429);
  });

  it("returns 404 when the page does not exist", async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    const res = await submitTestimonial(submitRequest(VALID_SUBMISSION), { params });
    expect(res.status).toBe(404);
  });

  it("returns 404 when the page is inactive", async () => {
    mockFindUnique.mockResolvedValueOnce({ ...BASE_PAGE, isActive: false });
    const res = await submitTestimonial(submitRequest(VALID_SUBMISSION), { params });
    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid JSON body", async () => {
    mockFindUnique.mockResolvedValueOnce(BASE_PAGE);
    const req = new NextRequest("http://localhost:3000/api/t/acme-feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not-json",
    });
    const res = await submitTestimonial(req, { params });
    expect(res.status).toBe(400);
  });

  it("returns 422 for a validation error", async () => {
    mockFindUnique.mockResolvedValueOnce(BASE_PAGE);
    const res = await submitTestimonial(submitRequest({ authorName: "", content: "" }), { params });
    expect(res.status).toBe(422);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Validation error");
  });

  it("returns 422 when submissions are closed (max testimonials reached)", async () => {
    mockFindUnique.mockResolvedValueOnce(BASE_PAGE);
    mockTestimonialCount.mockResolvedValueOnce(200);
    const res = await submitTestimonial(submitRequest(VALID_SUBMISSION), { params });
    expect(res.status).toBe(422);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Submissions are currently closed");
  });

  it("creates a pending testimonial and returns 201", async () => {
    mockFindUnique.mockResolvedValueOnce(BASE_PAGE);
    mockTestimonialCount.mockResolvedValueOnce(0);
    mockTestimonialCreate.mockResolvedValueOnce({ id: "new_testimonial" });

    const res = await submitTestimonial(submitRequest(VALID_SUBMISSION), { params });
    expect(res.status).toBe(201);
    const data = (await res.json()) as { success: boolean; thankYouMessage: string | null };
    expect(data.success).toBe(true);
    expect(data.thankYouMessage).toBe(BASE_PAGE.thankYouMessage);
    expect(mockTestimonialCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: BASE_PAGE.userId,
          authorName: "Jane Doe",
          source: "public",
          approved: false,
          isFeatured: false,
        }),
      })
    );
  });
});
