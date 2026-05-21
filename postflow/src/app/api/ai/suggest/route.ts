import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { handleRouteError } from "@/lib/errors";
import { generateContentVariants } from "@/lib/ai";

const suggestSchema = z.object({
  topic: z.string().min(1).max(500),
  tone: z.string().min(1).max(100).default("professional"),
  platforms: z.array(z.string().min(1)).min(1),
  personaId: z.string().optional().nullable(),
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

    const parsed = suggestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { topic, tone, platforms, personaId } = parsed.data;

    let persona = null;
    if (personaId) {
      const found = await prisma.aiPersona.findFirst({
        where: { id: personaId, userId: session.user.id },
        select: {
          name: true,
          writingStyle: true,
          tone: true,
          audienceDescription: true,
          exampleContent: true,
        },
      });
      if (found) persona = found;
    }

    const variants = await generateContentVariants(topic, tone, platforms, persona);
    return NextResponse.json({ variants });
  } catch (err) {
    return handleRouteError(err);
  }
}
