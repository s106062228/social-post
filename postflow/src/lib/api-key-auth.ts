import crypto from "crypto";
import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export interface ApiKeyAuthResult {
  userId: string;
}

/**
 * Validates the `x-api-key` header against hashed ApiKey records.
 * Returns the userId on success, or a NextResponse error on failure.
 * Also updates lastUsedAt for the matched key.
 */
export async function validateApiKey(
  request: NextRequest
): Promise<ApiKeyAuthResult | NextResponse> {
  const raw = request.headers.get("x-api-key");
  if (!raw) {
    return NextResponse.json({ error: "Missing x-api-key header" }, { status: 401 });
  }

  const keyHash = crypto.createHash("sha256").update(raw).digest("hex");

  const apiKey = await prisma.apiKey.findUnique({
    where: { keyHash },
    select: { id: true, userId: true, expiresAt: true },
  });

  if (!apiKey) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
  }

  if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
    return NextResponse.json({ error: "API key has expired" }, { status: 401 });
  }

  // Fire-and-forget lastUsedAt update
  prisma.apiKey
    .update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } })
    .catch(() => undefined);

  return { userId: apiKey.userId };
}

export function isApiKeyError(result: ApiKeyAuthResult | NextResponse): result is NextResponse {
  return result instanceof NextResponse;
}
