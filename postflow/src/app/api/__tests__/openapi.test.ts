jest.mock("@/lib/env", () => ({
  env: {
    NEXTAUTH_URL: "http://localhost:3000",
  },
}));

import { GET } from "@/app/api/openapi.json/route";

describe("GET /api/openapi.json", () => {
  it("returns 200 with correct Content-Type", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  it("returns openapi field with value 3.0.3", async () => {
    const res = await GET();
    const body = await res.json() as { openapi: string };
    expect(body.openapi).toBe("3.0.3");
  });

  it("returns info object with title and version", async () => {
    const res = await GET();
    const body = await res.json() as { info: { title: string; version: string } };
    expect(body.info.title).toBe("PostFlow API");
    expect(typeof body.info.version).toBe("string");
  });

  it("returns paths object with at least 10 endpoints", async () => {
    const res = await GET();
    const body = await res.json() as { paths: Record<string, unknown> };
    expect(typeof body.paths).toBe("object");
    expect(Object.keys(body.paths).length).toBeGreaterThanOrEqual(10);
  });

  it("returns tags array", async () => {
    const res = await GET();
    const body = await res.json() as { tags: { name: string; description: string }[] };
    expect(Array.isArray(body.tags)).toBe(true);
    expect(body.tags.length).toBeGreaterThan(0);
    expect(body.tags[0]).toHaveProperty("name");
    expect(body.tags[0]).toHaveProperty("description");
  });

  it("includes Cache-Control and CORS headers", async () => {
    const res = await GET();
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=3600");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});
