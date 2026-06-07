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
    customField: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      delete: jest.fn(),
    },
    post: {
      findUnique: jest.fn(),
    },
    postCustomFieldValue: {
      findMany: jest.fn(),
      upsert: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

import { NextRequest } from "next/server";
import { GET as listFields, POST as createField } from "@/app/api/custom-fields/route";
import {
  PATCH as updateField,
  DELETE as deleteField,
} from "@/app/api/custom-fields/[id]/route";
import {
  GET as getPostFields,
  PUT as putPostFields,
} from "@/app/api/posts/[id]/custom-fields/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";

const mockAuth = auth as jest.Mock;
const mockApiLimiter = apiLimiter as jest.Mock;
const mockFieldFindMany = prisma.customField.findMany as jest.Mock;
const mockFieldFindUnique = prisma.customField.findUnique as jest.Mock;
const mockFieldCreate = prisma.customField.create as jest.Mock;
const mockFieldUpdate = prisma.customField.update as jest.Mock;
const mockFieldCount = prisma.customField.count as jest.Mock;
const mockFieldDelete = prisma.customField.delete as jest.Mock;
const mockPostFindUnique = prisma.post.findUnique as jest.Mock;
const mockValueFindMany = prisma.postCustomFieldValue.findMany as jest.Mock;
const mockTransaction = prisma.$transaction as jest.Mock;

const MOCK_USER_ID = "clh3ck8zp0000qr5hyvxckahk";
const OTHER_USER_ID = "clh3ck8zp9999qr5hyvxckahk";
const VALID_FIELD_ID = "clh3ck8zp0001qr5hyvxckahk";
const VALID_POST_ID = "clh3ck8zp0002qr5hyvxckahk";
const AUTHED_SESSION = { user: { id: MOCK_USER_ID, email: "user@example.com" } };
const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, resetAt: new Date() };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, resetAt: new Date() };

const BASE_FIELD = {
  id: VALID_FIELD_ID,
  userId: MOCK_USER_ID,
  key: "campaign_code",
  label: "Campaign Code",
  fieldType: "text",
  options: [],
  defaultValue: null,
  isRequired: false,
  isActive: true,
  order: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const BASE_POST = {
  id: VALID_POST_ID,
  userId: MOCK_USER_ID,
  content: "Test post",
};

function makeGetRequest(url = "http://localhost:3000/api/custom-fields"): NextRequest {
  return new NextRequest(url, { method: "GET" });
}

function makePostRequest(body: unknown, url = "http://localhost:3000/api/custom-fields"): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makePatchRequest(id: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000/api/custom-fields/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeDeleteRequest(id: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/custom-fields/${id}`, {
    method: "DELETE",
  });
}

function makePutRequest(postId: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000/api/posts/${postId}/custom-fields`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── GET /api/custom-fields ────────────────────────────────────────────────────

describe("GET /api/custom-fields", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await listFields();
    expect(res.status).toBe(401);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await listFields();
    expect(res.status).toBe(429);
  });

  it("returns empty fields array when none exist", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFieldFindMany.mockResolvedValueOnce([]);

    const res = await listFields();
    expect(res.status).toBe(200);
    const data = (await res.json()) as { fields: unknown[] };
    expect(Array.isArray(data.fields)).toBe(true);
    expect(data.fields).toHaveLength(0);
  });

  it("returns fields with correct shape", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFieldFindMany.mockResolvedValueOnce([BASE_FIELD]);

    const res = await listFields();
    expect(res.status).toBe(200);
    const data = (await res.json()) as { fields: typeof BASE_FIELD[] };
    expect(data.fields).toHaveLength(1);
    expect(data.fields[0].key).toBe("campaign_code");
    expect(data.fields[0].label).toBe("Campaign Code");
    expect(data.fields[0].fieldType).toBe("text");
  });
});

// ── POST /api/custom-fields ───────────────────────────────────────────────────

describe("POST /api/custom-fields", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await createField(makePostRequest({ key: "code", label: "Code", fieldType: "text" }));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    const res = await createField(makePostRequest({ key: "code", label: "Code", fieldType: "text" }));
    expect(res.status).toBe(429);
  });

  it("returns 422 when max field limit reached", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFieldCount.mockResolvedValueOnce(20);

    const res = await createField(makePostRequest({ key: "code", label: "Code", fieldType: "text" }));
    expect(res.status).toBe(422);
    const data = (await res.json()) as { error: string };
    expect(data.error).toMatch(/Maximum/);
  });

  it("returns 400 for invalid field type", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFieldCount.mockResolvedValueOnce(0);

    const res = await createField(makePostRequest({ key: "code", label: "Code", fieldType: "checkbox" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid key with special chars", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFieldCount.mockResolvedValueOnce(0);

    const res = await createField(makePostRequest({ key: "my-key!", label: "Code", fieldType: "text" }));
    expect(res.status).toBe(400);
  });

  it("returns 409 when key already exists", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFieldCount.mockResolvedValueOnce(0);
    mockFieldFindUnique.mockResolvedValueOnce(BASE_FIELD); // existing field with same key

    const res = await createField(makePostRequest({ key: "campaign_code", label: "Campaign", fieldType: "text" }));
    expect(res.status).toBe(409);
  });

  it("creates field and returns 201", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFieldCount.mockResolvedValueOnce(0);
    mockFieldFindUnique.mockResolvedValueOnce(null);
    mockFieldCreate.mockResolvedValueOnce(BASE_FIELD);

    const res = await createField(
      makePostRequest({ key: "campaign_code", label: "Campaign Code", fieldType: "text" })
    );
    expect(res.status).toBe(201);
    const data = (await res.json()) as { field: typeof BASE_FIELD };
    expect(data.field.key).toBe("campaign_code");
  });
});

// ── PATCH /api/custom-fields/[id] ────────────────────────────────────────────

describe("PATCH /api/custom-fields/[id]", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await updateField(makePatchRequest(VALID_FIELD_ID, { label: "Updated" }), {
      params: Promise.resolve({ id: VALID_FIELD_ID }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 when field belongs to another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFieldFindUnique.mockResolvedValueOnce({ ...BASE_FIELD, userId: OTHER_USER_ID });

    const res = await updateField(makePatchRequest(VALID_FIELD_ID, { label: "Updated" }), {
      params: Promise.resolve({ id: VALID_FIELD_ID }),
    });
    expect(res.status).toBe(403);
  });

  it("updates field label and returns 200", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFieldFindUnique.mockResolvedValueOnce(BASE_FIELD);
    mockFieldUpdate.mockResolvedValueOnce({ ...BASE_FIELD, label: "Product SKU" });

    const res = await updateField(makePatchRequest(VALID_FIELD_ID, { label: "Product SKU" }), {
      params: Promise.resolve({ id: VALID_FIELD_ID }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { field: typeof BASE_FIELD };
    expect(data.field.label).toBe("Product SKU");
  });
});

// ── DELETE /api/custom-fields/[id] ───────────────────────────────────────────

describe("DELETE /api/custom-fields/[id]", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await deleteField(makeDeleteRequest(VALID_FIELD_ID), {
      params: Promise.resolve({ id: VALID_FIELD_ID }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 when field belongs to another user", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFieldFindUnique.mockResolvedValueOnce({ ...BASE_FIELD, userId: OTHER_USER_ID });

    const res = await deleteField(makeDeleteRequest(VALID_FIELD_ID), {
      params: Promise.resolve({ id: VALID_FIELD_ID }),
    });
    expect(res.status).toBe(403);
  });

  it("deletes field (cascade removes values) and returns 204", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockFieldFindUnique.mockResolvedValueOnce(BASE_FIELD);
    mockFieldDelete.mockResolvedValueOnce(BASE_FIELD);

    const res = await deleteField(makeDeleteRequest(VALID_FIELD_ID), {
      params: Promise.resolve({ id: VALID_FIELD_ID }),
    });
    expect(res.status).toBe(204);
    expect(mockFieldDelete).toHaveBeenCalledWith({ where: { id: VALID_FIELD_ID } });
  });
});

// ── GET /api/posts/[id]/custom-fields ────────────────────────────────────────

describe("GET /api/posts/[id]/custom-fields", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await getPostFields(makeGetRequest(), {
      params: Promise.resolve({ id: VALID_POST_ID }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 for non-owned post", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockPostFindUnique.mockResolvedValueOnce({ ...BASE_POST, userId: OTHER_USER_ID });

    const res = await getPostFields(makeGetRequest(), {
      params: Promise.resolve({ id: VALID_POST_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("returns values with correct shape", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockPostFindUnique.mockResolvedValueOnce(BASE_POST);
    mockValueFindMany.mockResolvedValueOnce([
      {
        id: "val1",
        fieldId: VALID_FIELD_ID,
        value: "SUMMER2025",
        field: {
          key: "campaign_code",
          label: "Campaign Code",
          fieldType: "text",
          options: [],
          isRequired: false,
        },
      },
    ]);

    const res = await getPostFields(makeGetRequest(), {
      params: Promise.resolve({ id: VALID_POST_ID }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { values: Array<{ key: string; value: string }> };
    expect(data.values).toHaveLength(1);
    expect(data.values[0].key).toBe("campaign_code");
    expect(data.values[0].value).toBe("SUMMER2025");
  });
});

// ── PUT /api/posts/[id]/custom-fields ────────────────────────────────────────

describe("PUT /api/posts/[id]/custom-fields", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await putPostFields(makePutRequest(VALID_POST_ID, { values: [] }), {
      params: Promise.resolve({ id: VALID_POST_ID }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 400 when fieldId not found", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockPostFindUnique.mockResolvedValueOnce(BASE_POST);
    mockFieldFindMany.mockResolvedValueOnce([BASE_FIELD]); // user has fields

    const res = await putPostFields(
      makePutRequest(VALID_POST_ID, {
        values: [{ fieldId: "unknown_field_id_xyz", value: "test" }],
      }),
      { params: Promise.resolve({ id: VALID_POST_ID }) }
    );
    expect(res.status).toBe(400);
  });

  it("returns 422 when required field is missing", async () => {
    const requiredField = { ...BASE_FIELD, isRequired: true };
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockPostFindUnique.mockResolvedValueOnce(BASE_POST);
    mockFieldFindMany.mockResolvedValueOnce([requiredField]);

    const res = await putPostFields(
      makePutRequest(VALID_POST_ID, { values: [] }), // not providing the required field
      { params: Promise.resolve({ id: VALID_POST_ID }) }
    );
    expect(res.status).toBe(422);
    const data = (await res.json()) as { error: string };
    expect(data.error).toMatch(/Required field/);
  });

  it("upserts field values and returns updated values", async () => {
    mockAuth.mockResolvedValueOnce(AUTHED_SESSION);
    mockApiLimiter.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockPostFindUnique.mockResolvedValueOnce(BASE_POST);
    mockFieldFindMany.mockResolvedValueOnce([BASE_FIELD]);
    mockTransaction.mockResolvedValueOnce([]);
    mockValueFindMany.mockResolvedValueOnce([
      {
        id: "val1",
        fieldId: VALID_FIELD_ID,
        value: "SUMMER2025",
        field: {
          key: "campaign_code",
          label: "Campaign Code",
          fieldType: "text",
          options: [],
          isRequired: false,
        },
      },
    ]);

    const res = await putPostFields(
      makePutRequest(VALID_POST_ID, {
        values: [{ fieldId: VALID_FIELD_ID, value: "SUMMER2025" }],
      }),
      { params: Promise.resolve({ id: VALID_POST_ID }) }
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { values: Array<{ value: string }> };
    expect(data.values[0].value).toBe("SUMMER2025");
  });
});
