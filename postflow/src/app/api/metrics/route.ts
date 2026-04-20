import { NextResponse } from "next/server";
import { getPrometheusMetrics } from "@/lib/metrics";

export async function GET(): Promise<Response> {
  try {
    const body = await getPrometheusMetrics();
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to collect metrics" }, { status: 500 });
  }
}
