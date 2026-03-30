import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createRedisConnection } from "@/lib/queue/connection";

type CheckResult = { status: "ok" | "error"; latencyMs?: number; error?: string };

// ── GET /api/health ────────────────────────────────────────────────────────────
// Returns DB + Redis connectivity status. Responds 200 when healthy, 503 when
// any dependency is unreachable. Safe to expose publicly — no sensitive data.

export async function GET(): Promise<NextResponse> {
  const checks: Record<string, CheckResult> = {};

  // ── Database ─────────────────────────────────────────────────────────────────
  const dbStart = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = { status: "ok", latencyMs: Date.now() - dbStart };
  } catch (err) {
    checks.database = {
      status: "error",
      latencyMs: Date.now() - dbStart,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }

  // ── Redis ─────────────────────────────────────────────────────────────────────
  const redisStart = Date.now();
  const redis = createRedisConnection();
  try {
    await redis.ping();
    checks.redis = { status: "ok", latencyMs: Date.now() - redisStart };
  } catch (err) {
    checks.redis = {
      status: "error",
      latencyMs: Date.now() - redisStart,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  } finally {
    redis.disconnect();
  }

  const allOk = Object.values(checks).every((c) => c.status === "ok");

  return NextResponse.json(
    {
      status: allOk ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      checks,
    },
    { status: allOk ? 200 : 503 }
  );
}
