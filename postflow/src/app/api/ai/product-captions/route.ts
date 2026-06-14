import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { handleRouteError } from "@/lib/errors";
import { generateProductCaptions } from "@/lib/ai";

const productCaptionSchema = z.object({
  productName: z.string().min(1).max(200),
  productDescription: z.string().min(10).max(2000),
  platforms: z.array(z.string().min(1)).min(1).max(10),
  promotionType: z.enum(["launch", "sale", "awareness", "review", "general"]).default("general"),
  targetAudience: z.string().max(300).optional(),
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

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "AI features are not configured" },
        { status: 503 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = productCaptionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { productName, productDescription, platforms, promotionType, targetAudience } =
      parsed.data;

    const result = await generateProductCaptions(
      productName,
      productDescription,
      platforms,
      promotionType,
      targetAudience
    );

    if (!result) {
      return NextResponse.json(
        { error: "Failed to generate captions" },
        { status: 500 }
      );
    }

    return NextResponse.json(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
