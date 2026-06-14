import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { processText, type TextStyle } from "@/lib/text-formatter";

const formatTextSchema = z.object({
  text: z.string().min(1).max(10000),
  style: z.enum(["bold", "italic", "bold-italic", "strikethrough", "monospace", "none"]),
  convertEmojis: z.boolean().optional().default(false),
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

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = formatTextSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { text, style, convertEmojis } = parsed.data;
    const result = processText(text, style as TextStyle, convertEmojis);

    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
