import { NextResponse } from "next/server";
import { generateOpenApiSpec } from "@/lib/openapi";

export const dynamic = "force-dynamic";

export function GET() {
  const spec = generateOpenApiSpec();
  return NextResponse.json(spec, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
