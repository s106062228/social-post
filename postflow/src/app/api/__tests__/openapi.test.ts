import { GET } from "../docs/openapi.json/route";

describe("GET /api/docs/openapi.json", () => {
  it("returns 200", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
  });

  it("has correct OpenAPI version", async () => {
    const res = await GET();
    const body = await res.json();
    expect(body.openapi).toBe("3.0.3");
  });

  it("has required info fields", async () => {
    const res = await GET();
    const body = await res.json();
    expect(body.info.title).toBe("PostFlow API");
    expect(body.info.version).toBeDefined();
    expect(body.info.description).toBeDefined();
  });

  it("has servers array", async () => {
    const res = await GET();
    const body = await res.json();
    expect(Array.isArray(body.servers)).toBe(true);
    expect(body.servers.length).toBeGreaterThan(0);
    expect(body.servers[0].url).toBeDefined();
  });

  it("has paths object with key endpoints", async () => {
    const res = await GET();
    const body = await res.json();
    expect(typeof body.paths).toBe("object");
    expect(body.paths["/api/posts"]).toBeDefined();
    expect(body.paths["/api/health"]).toBeDefined();
    expect(body.paths["/api/docs/openapi.json"]).toBeDefined();
  });

  it("has components with schemas", async () => {
    const res = await GET();
    const body = await res.json();
    expect(body.components).toBeDefined();
    expect(body.components.schemas).toBeDefined();
    expect(body.components.schemas.Post).toBeDefined();
    expect(body.components.schemas.Error).toBeDefined();
  });

  it("has security schemes defined", async () => {
    const res = await GET();
    const body = await res.json();
    expect(body.components.securitySchemes).toBeDefined();
    expect(body.components.securitySchemes.sessionCookie).toBeDefined();
    expect(body.components.securitySchemes.apiKey).toBeDefined();
  });

  it("includes CORS header", async () => {
    const res = await GET();
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});
