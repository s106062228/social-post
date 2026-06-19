import { auth } from "@/auth";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { generatePostFromUrl } from "@/lib/ai";
import { extractWebContent } from "@/lib/web-content";
import { handleRouteError } from "@/lib/errors";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  url: z.string().url(),
  platforms: z.array(z.string()).min(1),
});

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = await apiLimiter(session.user.id);
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

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

    const { url, platforms } = parsed.data;

    const webContent = await extractWebContent(url);
    if (!webContent) {
      return NextResponse.json(
        { error: "Could not extract content from the provided URL" },
        { status: 422 }
      );
    }

    const result = await generatePostFromUrl(webContent.title, webContent.content, platforms);
    if (!result) {
      return NextResponse.json(
        { error: "AI post generation failed" },
        { status: 500 }
      );
    }

    const headers = rateLimitHeaders(rl);
    return NextResponse.json(result, { headers });
  } catch (err) {
    return handleRouteError(err);
  }
}
