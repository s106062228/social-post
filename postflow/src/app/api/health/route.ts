import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

type HealthStatus = "ok" | "degraded" | "error";

interface ServiceCheck {
  status: HealthStatus;
  latencyMs?: number;
  error?: string;
}

interface HealthResponse {
  status: HealthStatus;
  timestamp: string;
  version: string;
  services: {
    database: ServiceCheck;
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

async function checkDatabase(): Promise<ServiceCheck> {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: "ok", latencyMs: Date.now() - start };
  } catch (err) {
    return {
      status: "error",
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : "Unknown database error",
    };
  }
}

// ── GET /api/health ────────────────────────────────────────────────────────────
// Returns 200 when all critical services are healthy.
// Returns 503 if any critical service is in error state.
// Intended for Docker HEALTHCHECK, load balancer probes, and uptime monitors.

export async function GET(): Promise<NextResponse<HealthResponse>> {
  const [database] = await Promise.all([checkDatabase()]);

  const overallStatus: HealthStatus =
    database.status === "error" ? "error" : "ok";

  const httpStatus = overallStatus === "error" ? 503 : 200;

  return NextResponse.json(
    {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? "0.1.0",
      services: { database },
    },
    { status: httpStatus }
  );
}
