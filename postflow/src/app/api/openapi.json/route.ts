import { NextResponse } from "next/server";
import { buildOpenAPISpec } from "@/lib/openapi";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  const baseUrl = env.NEXTAUTH_URL ?? "http://localhost:3000";
  const spec = buildOpenAPISpec(baseUrl);
  return NextResponse.json(spec, {
    headers: {
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
