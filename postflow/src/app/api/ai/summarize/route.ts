import { auth } from "@/auth";
import { apiLimiter } from "@/lib/rate-limit";
import { summarizeContent } from "@/lib/ai";
import { handleRouteError } from "@/lib/errors";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  content: z.string().min(50).max(50000),
  targetLength: z.number().int().min(50).max(2200).optional().default(280),
  style: z.enum(["bullet_points", "narrative", "headline"]).optional(),
  platforms: z.array(z.string()).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const limited = await apiLimiter(req, session.user.id);
    if (limited) return limited;

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "AI features are not configured" },
        { status: 503 }
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { content, targetLength, style, platforms } = parsed.data;

    const result = await summarizeContent(content, targetLength, style, platforms);
    if (!result) {
      return NextResponse.json(
        { error: "AI summarization failed" },
        { status: 500 }
      );
    }

    return NextResponse.json(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
