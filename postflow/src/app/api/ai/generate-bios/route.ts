import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { handleRouteError } from "@/lib/errors";
import { generateSocialBios } from "@/lib/ai";

const generateBiosSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(500),
  platforms: z.array(z.string().min(1)).min(1),
  niche: z.string().max(100).optional(),
  keywords: z.array(z.string().max(50)).max(10).optional(),
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

    const parsed = generateBiosSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          issues: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { name, description, platforms, niche, keywords } = parsed.data;
    const bios = await generateSocialBios(
      name,
      description,
      platforms,
      niche,
      keywords
    );

    return NextResponse.json({ bios });
  } catch (err) {
    return handleRouteError(err);
  }
}
