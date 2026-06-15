import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { handleRouteError } from "@/lib/errors";
import { styleTransferContent, type StyleTransferStyle } from "@/lib/ai";

const VALID_STYLES = [
  "casual",
  "professional",
  "concise",
  "engaging",
  "humorous",
  "inspirational",
  "educational",
] as const;

const styleTransferSchema = z.object({
  content: z.string().min(10, "Content must be at least 10 characters").max(10000),
  targetStyle: z.enum(VALID_STYLES),
  platforms: z.array(z.string().min(1)).min(1, "At least one platform required"),
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

    const parsed = styleTransferSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { content, targetStyle, platforms } = parsed.data;

    const result = await styleTransferContent(
      content,
      targetStyle as StyleTransferStyle,
      platforms
    );

    if (!result) {
      return NextResponse.json(
        { error: "Failed to transfer style" },
        { status: 500 }
      );
    }

    return NextResponse.json(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
