jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
  dbLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  publishLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
}));

jest.mock("@prisma/client", () => ({
  Prisma: {
    PrismaClientKnownRequestError: class extends Error {
      code: string;
      constructor(msg: string, opts: { code: string }) {
        super(msg);
        this.code = opts.code;
      }
    },
    PrismaClientValidationError: class extends Error {},
    PrismaClientInitializationError: class extends Error {},
  },
}));

jest.mock("@/auth", () => ({ auth: jest.fn() }));

jest.mock("@/lib/rate-limit", () => ({
  apiLimiter: jest.fn(),
  rateLimitHeaders: jest.fn().mockReturnValue({}),
}));

jest.mock("qrcode", () => ({
  toBuffer: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    linkBioPage: {
      findUnique: jest.fn(),
    },
    bioPageClick: {
      create: jest.fn(),
    },
  },
}));

import { NextRequest } from "next/server";
import { GET as getAnalytics } from "@/app/api/bio-pages/[id]/analytics/route";
import { GET as getQr } from "@/app/api/bio-pages/[id]/qr/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";
import QRCode from "qrcode";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockPageFindUnique = prisma.linkBioPage.findUnique as jest.Mock;
const mockQrToBuffer = QRCode.toBuffer as jest.Mock;

const USER_ID = "user-1";
const OTHER_ID = "user-2";
const PAGE_ID = "page-1";
const ITEM_ID = "item-1";
const AUTHED = { user: { id: USER_ID } };
const RL_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RL_FAIL = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

function makeReq(url = "http://localhost/api/bio-pages/page-1/analytics") {
  return new NextRequest(url);
}

const now = new Date();
const click1 = { clickedAt: now, deviceType: "desktop" };
const click2 = { clickedAt: now, deviceType: "mobile" };

const BASE_PAGE_WITH_ITEMS = {
  id: PAGE_ID,
  userId: USER_ID,
  slug: "my-page",
  title: "My Links",
  bio: "Test bio",
  isPublished: true,
  items: [
    {
      id: ITEM_ID,
      pageId: PAGE_ID,
      label: "My Website",
      url: "https://example.com",
      order: 0,
      isActive: true,
      clicks: 2,
      clickEvents: [click1, click2],
    },
    {
      id: "item-2",
      pageId: PAGE_ID,
      label: "Blog",
      url: "https://blog.example.com",
      order: 1,
      isActive: true,
      clicks: 1,
      clickEvents: [click1],
    },
  ],
};

describe("GET /api/bio-pages/[id]/analytics", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue(AUTHED);
    mockApiLimiter.mockResolvedValue(RL_OK);
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await getAnalytics(makeReq(), {
      params: Promise.resolve({ id: PAGE_ID }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue(RL_FAIL);
    const res = await getAnalytics(makeReq(), {
      params: Promise.resolve({ id: PAGE_ID }),
    });
    expect(res.status).toBe(429);
  });

  it("returns 404 when page not found", async () => {
    mockPageFindUnique.mockResolvedValue(null);
    const res = await getAnalytics(makeReq(), {
      params: Promise.resolve({ id: PAGE_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 403 when page belongs to another user", async () => {
    mockPageFindUnique.mockResolvedValue({
      ...BASE_PAGE_WITH_ITEMS,
      userId: OTHER_ID,
    });
    const res = await getAnalytics(makeReq(), {
      params: Promise.resolve({ id: PAGE_ID }),
    });
    expect(res.status).toBe(403);
  });

  it("returns analytics with correct shape", async () => {
    mockPageFindUnique.mockResolvedValue(BASE_PAGE_WITH_ITEMS);
    const res = await getAnalytics(makeReq(), {
      params: Promise.resolve({ id: PAGE_ID }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      pageId: string;
      slug: string;
      title: string;
      totalClicks: number;
      items: { itemId: string; label: string; clicks: number; clicksLast7d: number }[];
      dailyClicks: { date: string; count: number }[];
      deviceBreakdown: { device: string; count: number }[];
    };
    expect(data.pageId).toBe(PAGE_ID);
    expect(data.slug).toBe("my-page");
    expect(data.title).toBe("My Links");
    expect(Array.isArray(data.items)).toBe(true);
    expect(Array.isArray(data.dailyClicks)).toBe(true);
    expect(Array.isArray(data.deviceBreakdown)).toBe(true);
  });

  it("aggregates totalClicks from all items", async () => {
    mockPageFindUnique.mockResolvedValue(BASE_PAGE_WITH_ITEMS);
    const res = await getAnalytics(makeReq(), {
      params: Promise.resolve({ id: PAGE_ID }),
    });
    const data = (await res.json()) as { totalClicks: number };
    // item1 has 2 clicks, item2 has 1 click
    expect(data.totalClicks).toBe(3);
  });

  it("returns 30 daily click entries", async () => {
    mockPageFindUnique.mockResolvedValue(BASE_PAGE_WITH_ITEMS);
    const res = await getAnalytics(makeReq(), {
      params: Promise.resolve({ id: PAGE_ID }),
    });
    const data = (await res.json()) as { dailyClicks: unknown[] };
    expect(data.dailyClicks).toHaveLength(30);
  });

  it("includes device breakdown when clicks have device types", async () => {
    mockPageFindUnique.mockResolvedValue(BASE_PAGE_WITH_ITEMS);
    const res = await getAnalytics(makeReq(), {
      params: Promise.resolve({ id: PAGE_ID }),
    });
    const data = (await res.json()) as {
      deviceBreakdown: { device: string; count: number }[];
    };
    expect(data.deviceBreakdown.length).toBeGreaterThan(0);
    const devices = data.deviceBreakdown.map((d) => d.device);
    expect(devices).toContain("desktop");
    expect(devices).toContain("mobile");
  });

  it("returns correct item stats", async () => {
    mockPageFindUnique.mockResolvedValue(BASE_PAGE_WITH_ITEMS);
    const res = await getAnalytics(makeReq(), {
      params: Promise.resolve({ id: PAGE_ID }),
    });
    const data = (await res.json()) as {
      items: { itemId: string; label: string; clicksTotal: number; clicksLast7d: number }[];
    };
    const firstItem = data.items.find((i) => i.itemId === ITEM_ID);
    expect(firstItem).toBeDefined();
    expect(firstItem!.label).toBe("My Website");
    expect(firstItem!.clicksTotal).toBe(2);
  });

  it("handles page with no clicks", async () => {
    mockPageFindUnique.mockResolvedValue({
      ...BASE_PAGE_WITH_ITEMS,
      items: [{ ...BASE_PAGE_WITH_ITEMS.items[0], clickEvents: [], clicks: 0 }],
    });
    const res = await getAnalytics(makeReq(), {
      params: Promise.resolve({ id: PAGE_ID }),
    });
    const data = (await res.json()) as { totalClicks: number };
    expect(data.totalClicks).toBe(0);
  });
});

describe("GET /api/bio-pages/[id]/qr", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue(AUTHED);
    mockApiLimiter.mockResolvedValue(RL_OK);
    mockQrToBuffer.mockResolvedValue(Buffer.from("fake-png"));
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await getQr(makeReq("http://localhost/api/bio-pages/page-1/qr"), {
      params: Promise.resolve({ id: PAGE_ID }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockApiLimiter.mockResolvedValue(RL_FAIL);
    const res = await getQr(makeReq(), {
      params: Promise.resolve({ id: PAGE_ID }),
    });
    expect(res.status).toBe(429);
  });

  it("returns 404 when page not found", async () => {
    mockPageFindUnique.mockResolvedValue(null);
    const res = await getQr(makeReq(), {
      params: Promise.resolve({ id: PAGE_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 403 when page belongs to another user", async () => {
    mockPageFindUnique.mockResolvedValue({
      id: PAGE_ID,
      userId: OTHER_ID,
      slug: "my-page",
    });
    const res = await getQr(makeReq(), {
      params: Promise.resolve({ id: PAGE_ID }),
    });
    expect(res.status).toBe(403);
  });

  it("returns PNG image with correct content-type", async () => {
    mockPageFindUnique.mockResolvedValue({
      id: PAGE_ID,
      userId: USER_ID,
      slug: "my-page",
    });
    const res = await getQr(makeReq(), {
      params: Promise.resolve({ id: PAGE_ID }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
  });

  it("returns content-disposition attachment header", async () => {
    mockPageFindUnique.mockResolvedValue({
      id: PAGE_ID,
      userId: USER_ID,
      slug: "my-page",
    });
    const res = await getQr(makeReq(), {
      params: Promise.resolve({ id: PAGE_ID }),
    });
    const disposition = res.headers.get("content-disposition");
    expect(disposition).toContain("attachment");
    expect(disposition).toContain("my-page");
  });

  it("calls QRCode.toBuffer with bio page URL", async () => {
    mockPageFindUnique.mockResolvedValue({
      id: PAGE_ID,
      userId: USER_ID,
      slug: "my-page",
    });
    await getQr(makeReq(), {
      params: Promise.resolve({ id: PAGE_ID }),
    });
    expect(mockQrToBuffer).toHaveBeenCalledWith(
      expect.stringContaining("/bio/my-page"),
      expect.any(Object)
    );
  });
});
