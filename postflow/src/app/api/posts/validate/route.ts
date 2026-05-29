import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { MediaType, Platform } from "@prisma/client";
import { auth } from "@/auth";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { validateForAllPlatforms } from "@/lib/content-validator";

const bodySchema = z.object({
  content: z.string().max(200000).default(""),
  platforms: z.array(z.nativeEnum(Platform)).min(0).max(30),
  mediaType: z.nativeEnum(MediaType).default("NONE"),
  mediaUrls: z.array(z.string()).max(30).default([]),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = await apiLimiter(session.user.id);
    if (!rl.success) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: rateLimitHeaders(rl) }
      );
    }

    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { content, platforms, mediaType, mediaUrls } = parsed.data;

    if (platforms.length === 0) {
      return NextResponse.json({ results: [], overallValid: true });
    }

    const results = validateForAllPlatforms(content, mediaType, platforms, mediaUrls);
    const overallValid = results.every((r) => r.valid);

    return NextResponse.json({ results, overallValid });
  } catch (err) {
    return handleRouteError(err);
  }
}
