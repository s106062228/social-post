import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { z } from "zod";
import { chatWithAssistant, ChatMessage } from "@/lib/ai";

const MAX_HISTORY = 50;
const CONTEXT_WINDOW = 10;

const postSchema = z.object({
  message: z.string().min(1).max(2000),
});

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await rateLimit(req, { limit: 60, windowMs: 60_000 });
  if (!rl.success) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  const messages = await prisma.aiChatMessage.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: MAX_HISTORY,
    select: { id: true, role: true, content: true, createdAt: true },
  });

  return NextResponse.json({ messages: messages.reverse() });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await rateLimit(req, { limit: 20, windowMs: 60_000 });
  if (!rl.success) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "AI not configured" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { message } = parsed.data;
  const userId = session.user.id;

  // Load recent history for context
  const history = await prisma.aiChatMessage.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: CONTEXT_WINDOW,
    select: { role: true, content: true },
  });
  const contextMessages: ChatMessage[] = history
    .reverse()
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
  contextMessages.push({ role: "user", content: message });

  // Build brief context summary from DB
  const [postCount, accountCount] = await Promise.all([
    prisma.post.count({
      where: {
        userId,
        createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
    }),
    prisma.socialAccount.count({ where: { userId, isActive: true } }),
  ]);
  const contextSummary = `Connected accounts: ${accountCount}. Posts in last 30 days: ${postCount}.`;

  let reply: string;
  try {
    reply = await chatWithAssistant(contextMessages, contextSummary);
  } catch {
    return NextResponse.json({ error: "AI service error" }, { status: 500 });
  }

  // Store user message + assistant reply
  await prisma.$transaction([
    prisma.aiChatMessage.create({ data: { userId, role: "user", content: message } }),
    prisma.aiChatMessage.create({ data: { userId, role: "assistant", content: reply } }),
  ]);

  // Prune old messages (keep last MAX_HISTORY)
  const total = await prisma.aiChatMessage.count({ where: { userId } });
  if (total > MAX_HISTORY) {
    const oldest = await prisma.aiChatMessage.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      take: total - MAX_HISTORY,
      select: { id: true },
    });
    await prisma.aiChatMessage.deleteMany({
      where: { id: { in: oldest.map((m) => m.id) } },
    });
  }

  return NextResponse.json({ reply });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await rateLimit(req, { limit: 10, windowMs: 60_000 });
  if (!rl.success) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  const result = await prisma.aiChatMessage.deleteMany({
    where: { userId: session.user.id },
  });

  return NextResponse.json({ deleted: result.count });
}
