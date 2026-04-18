jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
  dbLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  apiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), child: jest.fn().mockReturnThis() },
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    $queryRaw: jest.fn(),
  },
}));

import { GET } from "@/app/api/health/route";
import { prisma } from "@/lib/db";

const mockQueryRaw = prisma.$queryRaw as jest.Mock;

describe("GET /api/health", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 200 with status ok when database is healthy", async () => {
    mockQueryRaw.mockResolvedValueOnce([{ "?column?": 1 }]);

    const response = await GET();
    const data = (await response.json()) as {
      status: string;
      timestamp: string;
      version: string;
      services: { database: { status: string; latencyMs: number } };
    };

    expect(response.status).toBe(200);
    expect(data.status).toBe("ok");
    expect(data.services.database.status).toBe("ok");
    expect(typeof data.services.database.latencyMs).toBe("number");
    expect(data.timestamp).toBeDefined();
    expect(data.version).toBeDefined();
  });

  it("returns 503 with status error when database is unavailable", async () => {
    mockQueryRaw.mockRejectedValueOnce(new Error("Connection refused"));

    const response = await GET();
    const data = (await response.json()) as {
      status: string;
      services: { database: { status: string; error: string } };
    };

    expect(response.status).toBe(503);
    expect(data.status).toBe("error");
    expect(data.services.database.status).toBe("error");
    expect(data.services.database.error).toBe("Connection refused");
  });

  it("returns 503 for unknown database errors", async () => {
    mockQueryRaw.mockRejectedValueOnce("non-error object");

    const response = await GET();
    const data = (await response.json()) as {
      status: string;
      services: { database: { status: string; error: string } };
    };

    expect(response.status).toBe(503);
    expect(data.services.database.error).toBe("Unknown database error");
  });
});
