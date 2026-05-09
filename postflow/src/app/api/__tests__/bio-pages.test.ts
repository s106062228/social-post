jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
  dbLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  publishLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
}));

jest.mock("@prisma/client", () => ({
  Prisma: {
    PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error {
      code: string;
      constructor(msg: string, opts: { code: string }) {
        super(msg);
        this.code = opts.code;
      }
    },
    PrismaClientValidationError: class PrismaClientValidationError extends Error {},
    PrismaClientInitializationError: class PrismaClientInitializationError extends Error {},
  },
}));

jest.mock("@/auth", () => ({ auth: jest.fn() }));

jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn(),
  rateLimitHeaders: jest.fn().mockReturnValue({}),
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    linkBioPage: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    linkBioItem: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
  },
}));

import { NextRequest } from "next/server";
import { GET as listPages, POST as createPage } from "@/app/api/bio-pages/route";
import {
  GET as getPage,
  PATCH as updatePage,
  DELETE as deletePage,
} from "@/app/api/bio-pages/[id]/route";
import { POST as addItem } from "@/app/api/bio-pages/[id]/items/route";
import {
  PATCH as updateItem,
  DELETE as deleteItem,
} from "@/app/api/bio-pages/[id]/items/[itemId]/route";
import { GET as getPublicPage } from "@/app/api/bio/[slug]/route";
import { POST as trackClick } from "@/app/api/bio/[slug]/click/[itemId]/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockPageFindMany = prisma.linkBioPage.findMany as jest.Mock;
const mockPageFindUnique = prisma.linkBioPage.findUnique as jest.Mock;
const mockPageCreate = prisma.linkBioPage.create as jest.Mock;
const mockPageUpdate = prisma.linkBioPage.update as jest.Mock;
const mockPageDelete = prisma.linkBioPage.delete as jest.Mock;
const mockPageCount = prisma.linkBioPage.count as jest.Mock;
const mockItemFindUnique = prisma.linkBioItem.findUnique as jest.Mock;
const mockItemCreate = prisma.linkBioItem.create as jest.Mock;
const mockItemUpdate = prisma.linkBioItem.update as jest.Mock;
const mockItemDelete = prisma.linkBioItem.delete as jest.Mock;
const mockItemCount = prisma.linkBioItem.count as jest.Mock;

const USER_ID = "user-1";
const OTHER_ID = "user-2";
const PAGE_ID = "page-1";
const ITEM_ID = "item-1";
const AUTHED = { user: { id: USER_ID, email: "user@example.com" } };
const RL_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RL_FAIL = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

const BASE_PAGE = {
  id: PAGE_ID,
  userId: USER_ID,
  slug: "my-page",
  title: "My Links",
  bio: "All my links",
  isPublished: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  _count: { items: 2 },
};

const BASE_ITEM = {
  id: ITEM_ID,
  pageId: PAGE_ID,
  label: "My Website",
  url: "https://example.com",
  icon: null,
  order: 0,
  isActive: true,
  clicks: 5,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeReq(url: string, method = "GET", body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
}

// ── GET /api/bio-pages ─────────────────────────────────────────────────────────────────────

describe("GET /api/bio-pages", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await listPages();
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_FAIL);
    const res = await listPages();
    expect(res.status).toBe(429);
  });

  it("returns list of bio pages", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockPageFindMany.mockResolvedValueOnce([BASE_PAGE]);
    const res = await listPages();
    expect(res.status).toBe(200);
    const data = (await res.json()) as { pages: typeof BASE_PAGE[] };
    expect(data.pages).toHaveLength(1);
    expect(data.pages[0].slug).toBe("my-page");
  });
});

// ── POST /api/bio-pages ────────────────────────────────────────────────────────────────────

describe("POST /api/bio-pages", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await createPage(makeReq("http://localhost/api/bio-pages", "POST", {}));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_FAIL);
    const res = await createPage(makeReq("http://localhost/api/bio-pages", "POST", {}));
    expect(res.status).toBe(429);
  });

  it("returns 400 for invalid input", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    const res = await createPage(
      makeReq("http://localhost/api/bio-pages", "POST", { slug: "ab", title: "" })
    );
    expect(res.status).toBe(400);
  });

  it("returns 422 when max pages exceeded", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockPageCount.mockResolvedValueOnce(10);
    const res = await createPage(
      makeReq("http://localhost/api/bio-pages", "POST", {
        slug: "my-page",
        title: "My Page",
      })
    );
    expect(res.status).toBe(422);
  });

  it("returns 409 when slug is taken", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockPageCount.mockResolvedValueOnce(0);
    mockPageFindUnique.mockResolvedValueOnce(BASE_PAGE); // slug exists
    const res = await createPage(
      makeReq("http://localhost/api/bio-pages", "POST", {
        slug: "my-page",
        title: "My Page",
      })
    );
    expect(res.status).toBe(409);
  });

  it("creates a bio page successfully", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockPageCount.mockResolvedValueOnce(0);
    mockPageFindUnique.mockResolvedValueOnce(null); // slug not taken
    mockPageCreate.mockResolvedValueOnce(BASE_PAGE);
    const res = await createPage(
      makeReq("http://localhost/api/bio-pages", "POST", {
        slug: "my-page",
        title: "My Links",
        bio: "All my links",
      })
    );
    expect(res.status).toBe(201);
    const data = (await res.json()) as { page: typeof BASE_PAGE };
    expect(data.page.slug).toBe("my-page");
  });
});

// ── GET /api/bio-pages/[id] ─────────────────────────────────────────────────────────────────────

describe("GET /api/bio-pages/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await getPage(makeReq("http://localhost/api/bio-pages/page-1"), {
      params: Promise.resolve({ id: PAGE_ID }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 when page not found", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockPageFindUnique.mockResolvedValueOnce(null);
    const res = await getPage(makeReq("http://localhost/api/bio-pages/page-1"), {
      params: Promise.resolve({ id: PAGE_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 403 for page owned by another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockPageFindUnique.mockResolvedValueOnce({ ...BASE_PAGE, userId: OTHER_ID });
    const res = await getPage(makeReq("http://localhost/api/bio-pages/page-1"), {
      params: Promise.resolve({ id: PAGE_ID }),
    });
    expect(res.status).toBe(403);
  });

  it("returns page with items", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockPageFindUnique.mockResolvedValueOnce({
      ...BASE_PAGE,
      items: [BASE_ITEM],
    });
    const res = await getPage(makeReq("http://localhost/api/bio-pages/page-1"), {
      params: Promise.resolve({ id: PAGE_ID }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { page: typeof BASE_PAGE & { items: typeof BASE_ITEM[] } };
    expect(data.page.items).toHaveLength(1);
    expect(data.page.items[0].label).toBe("My Website");
  });
});

// ── PATCH /api/bio-pages/[id] ────────────────────────────────────────────────────────────────────

describe("PATCH /api/bio-pages/[id]", () => {
  it("returns 404 when page not found", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockPageFindUnique.mockResolvedValueOnce(null);
    const res = await updatePage(
      makeReq("http://localhost/api/bio-pages/page-1", "PATCH", { title: "New" }),
      { params: Promise.resolve({ id: PAGE_ID }) }
    );
    expect(res.status).toBe(404);
  });

  it("updates page successfully", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockPageFindUnique.mockResolvedValueOnce(BASE_PAGE); // ownership check
    // no slug conflict check needed since same slug
    mockPageUpdate.mockResolvedValueOnce({ ...BASE_PAGE, title: "Updated" });
    const res = await updatePage(
      makeReq("http://localhost/api/bio-pages/page-1", "PATCH", { title: "Updated" }),
      { params: Promise.resolve({ id: PAGE_ID }) }
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { page: { title: string } };
    expect(data.page.title).toBe("Updated");
  });
});

// ── DELETE /api/bio-pages/[id] ────────────────────────────────────────────────────────────────────

describe("DELETE /api/bio-pages/[id]", () => {
  it("returns 403 for page owned by another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockPageFindUnique.mockResolvedValueOnce({ ...BASE_PAGE, userId: OTHER_ID });
    const res = await deletePage(makeReq("http://localhost/api/bio-pages/page-1", "DELETE"), {
      params: Promise.resolve({ id: PAGE_ID }),
    });
    expect(res.status).toBe(403);
  });

  it("deletes page successfully", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockPageFindUnique.mockResolvedValueOnce(BASE_PAGE);
    mockPageDelete.mockResolvedValueOnce(BASE_PAGE);
    const res = await deletePage(makeReq("http://localhost/api/bio-pages/page-1", "DELETE"), {
      params: Promise.resolve({ id: PAGE_ID }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { success: boolean };
    expect(data.success).toBe(true);
  });
});

// ── POST /api/bio-pages/[id]/items ───────────────────────────────────────────────────────────────────

describe("POST /api/bio-pages/[id]/items", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await addItem(
      makeReq("http://localhost/api/bio-pages/page-1/items", "POST", {}),
      { params: Promise.resolve({ id: PAGE_ID }) }
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when page not found", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockPageFindUnique.mockResolvedValueOnce(null);
    const res = await addItem(
      makeReq("http://localhost/api/bio-pages/page-1/items", "POST", {
        label: "My Site",
        url: "https://example.com",
      }),
      { params: Promise.resolve({ id: PAGE_ID }) }
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid URL", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockPageFindUnique.mockResolvedValueOnce(BASE_PAGE);
    mockItemCount.mockResolvedValueOnce(0);
    const res = await addItem(
      makeReq("http://localhost/api/bio-pages/page-1/items", "POST", {
        label: "My Site",
        url: "not-a-url",
      }),
      { params: Promise.resolve({ id: PAGE_ID }) }
    );
    expect(res.status).toBe(400);
  });

  it("adds item successfully", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockPageFindUnique.mockResolvedValueOnce(BASE_PAGE);
    mockItemCount.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    mockItemCreate.mockResolvedValueOnce(BASE_ITEM);
    const res = await addItem(
      makeReq("http://localhost/api/bio-pages/page-1/items", "POST", {
        label: "My Website",
        url: "https://example.com",
      }),
      { params: Promise.resolve({ id: PAGE_ID }) }
    );
    expect(res.status).toBe(201);
    const data = (await res.json()) as { item: typeof BASE_ITEM };
    expect(data.item.label).toBe("My Website");
    expect(data.item.clicks).toBe(5);
  });

  it("returns 422 when max items exceeded", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockPageFindUnique.mockResolvedValueOnce(BASE_PAGE);
    mockItemCount.mockResolvedValueOnce(30);
    const res = await addItem(
      makeReq("http://localhost/api/bio-pages/page-1/items", "POST", {
        label: "My Website",
        url: "https://example.com",
      }),
      { params: Promise.resolve({ id: PAGE_ID }) }
    );
    expect(res.status).toBe(422);
  });
});

// ── PATCH /api/bio-pages/[id]/items/[itemId] ──────────────────────────────────────────────────────────

describe("PATCH /api/bio-pages/[id]/items/[itemId]", () => {
  it("returns 404 when item not found", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockPageFindUnique.mockResolvedValueOnce(BASE_PAGE);
    mockItemFindUnique.mockResolvedValueOnce(null);
    const res = await updateItem(
      makeReq("http://localhost/api/bio-pages/page-1/items/item-1", "PATCH", { label: "New" }),
      { params: Promise.resolve({ id: PAGE_ID, itemId: ITEM_ID }) }
    );
    expect(res.status).toBe(404);
  });

  it("updates item successfully", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockPageFindUnique.mockResolvedValueOnce(BASE_PAGE);
    mockItemFindUnique.mockResolvedValueOnce(BASE_ITEM);
    mockItemUpdate.mockResolvedValueOnce({ ...BASE_ITEM, label: "Updated Label" });
    const res = await updateItem(
      makeReq("http://localhost/api/bio-pages/page-1/items/item-1", "PATCH", {
        label: "Updated Label",
      }),
      { params: Promise.resolve({ id: PAGE_ID, itemId: ITEM_ID }) }
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { item: { label: string } };
    expect(data.item.label).toBe("Updated Label");
  });
});

// ── DELETE /api/bio-pages/[id]/items/[itemId] ──────────────────────────────────────────────────────────

describe("DELETE /api/bio-pages/[id]/items/[itemId]", () => {
  it("deletes item successfully", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED);
    mockApiLimiter.mockResolvedValueOnce(RL_OK);
    mockPageFindUnique.mockResolvedValueOnce(BASE_PAGE);
    mockItemFindUnique.mockResolvedValueOnce(BASE_ITEM);
    mockItemDelete.mockResolvedValueOnce(BASE_ITEM);
    const res = await deleteItem(
      makeReq("http://localhost/api/bio-pages/page-1/items/item-1", "DELETE"),
      { params: Promise.resolve({ id: PAGE_ID, itemId: ITEM_ID }) }
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { success: boolean };
    expect(data.success).toBe(true);
  });
});

// ── GET /api/bio/[slug] (public) ──────────────────────────────────────────────────────────────────

describe("GET /api/bio/[slug] (public)", () => {
  it("returns 404 when page not found", async () => {
    mockPageFindUnique.mockResolvedValueOnce(null);
    const res = await getPublicPage(makeReq("http://localhost/api/bio/my-page"), {
      params: Promise.resolve({ slug: "my-page" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 for unpublished page", async () => {
    mockPageFindUnique.mockResolvedValueOnce({ ...BASE_PAGE, isPublished: false });
    const res = await getPublicPage(makeReq("http://localhost/api/bio/my-page"), {
      params: Promise.resolve({ slug: "my-page" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns public page data (no userId in select)", async () => {
    // Prisma select excludes userId — mock reflects what Prisma actually returns
    mockPageFindUnique.mockResolvedValueOnce({
      id: PAGE_ID,
      slug: "my-page",
      title: "My Links",
      bio: "All my links",
      isPublished: true,
      items: [{ id: ITEM_ID, label: "My Site", url: "https://example.com", icon: null, clicks: 3, order: 0 }],
    });
    const res = await getPublicPage(makeReq("http://localhost/api/bio/my-page"), {
      params: Promise.resolve({ slug: "my-page" }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      page: { slug: string; title: string; items: { label: string }[] };
    };
    expect(data.page.slug).toBe("my-page");
    expect(data.page.items).toHaveLength(1);
    expect(data.page.items[0].label).toBe("My Site");
  });
});

// ── POST /api/bio/[slug]/click/[itemId] (public) ──────────────────────────────────────────────────

describe("POST /api/bio/[slug]/click/[itemId] (public)", () => {
  it("returns 404 when page not found", async () => {
    mockPageFindUnique.mockResolvedValueOnce(null);
    const res = await trackClick(
      makeReq("http://localhost/api/bio/my-page/click/item-1", "POST"),
      { params: Promise.resolve({ slug: "my-page", itemId: ITEM_ID }) }
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when item not found", async () => {
    mockPageFindUnique.mockResolvedValueOnce(BASE_PAGE);
    mockItemFindUnique.mockResolvedValueOnce(null);
    const res = await trackClick(
      makeReq("http://localhost/api/bio/my-page/click/item-1", "POST"),
      { params: Promise.resolve({ slug: "my-page", itemId: ITEM_ID }) }
    );
    expect(res.status).toBe(404);
  });

  it("increments click count", async () => {
    mockPageFindUnique.mockResolvedValueOnce(BASE_PAGE);
    mockItemFindUnique.mockResolvedValueOnce(BASE_ITEM);
    mockItemUpdate.mockResolvedValueOnce({ ...BASE_ITEM, clicks: 6 });
    const res = await trackClick(
      makeReq("http://localhost/api/bio/my-page/click/item-1", "POST"),
      { params: Promise.resolve({ slug: "my-page", itemId: ITEM_ID }) }
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { success: boolean };
    expect(data.success).toBe(true);
    expect(mockItemUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { clicks: { increment: 1 } },
      })
    );
  });
});
