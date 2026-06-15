import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { handleRouteError } from "@/lib/errors";
import { checkLegalCompliance } from "@/lib/ai";

const INDUSTRIES = [
  "general",
  "healthcare",
  "finance",
  "food_beverage",
  "beauty_cosmetics",
  "fitness_wellness",
  "legal_services",
  "real_estate",
  "education",
  "retail_ecommerce",
  "travel_hospitality",
  "technology",
  "entertainment",
  "non_profit",
] as const;

const legalComplianceSchema = z.object({
  content: z.string().min(10).max(10000),
  platforms: z.array(z.string().min(1)).min(1),
  industry: z.enum(INDUSTRIES).default("general"),
  country: z.string().max(100).optional(),
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

    const parsed = legalComplianceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { content, platforms, industry, country } = parsed.data;

    const result = await checkLegalCompliance(content, industry, platforms, country);

    if (!result) {
      return NextResponse.json(
        { error: "Failed to check compliance" },
        { status: 500 }
      );
    }

    return NextResponse.json(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
