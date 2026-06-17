import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { handleRouteError } from "@/lib/errors";
import { generateAdCopy } from "@/lib/ai";

const OBJECTIVES = ["awareness", "traffic", "engagement", "leads", "sales", "app_installs", "general"] as const;
const BUDGETS = ["small", "medium", "large"] as const;

const schema = z.object({
  content: z.string().min(10, "Content must be at least 10 characters").max(10000),
  platforms: z.array(z.string()).min(1, "At least one platform required"),
  objective: z.enum(OBJECTIVES).default("general"),
  targetAudience: z.string().max(300).optional(),
  budget: z.enum(BUDGETS).optional(),
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

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { content, platforms, objective, targetAudience, budget } = parsed.data;

    const result = await generateAdCopy(
      content,
      platforms,
      objective,
      targetAudience ?? null,
      budget ?? null
    );

    if (!result) {
      return NextResponse.json(
        { error: "Failed to generate ad copy" },
        { status: 500 }
      );
    }

    return NextResponse.json(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
