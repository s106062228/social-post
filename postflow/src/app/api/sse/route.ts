import { type NextRequest, NextResponse } from "next/server";
import Redis from "ioredis";
import { auth } from "@/auth";
import { apiLimiter } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest): Promise<Response> {
  // Auth check
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit check
  const rl = await apiLimiter(session.user.id);
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  // Guard: REDIS_URL must be set
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    return NextResponse.json(
      { error: "SSE not available: REDIS_URL not configured" },
      { status: 503 }
    );
  }

  const userId = session.user.id;
  const channel = `sse:notifications:${userId}`;

  // Create a dedicated ioredis subscriber connection (never reuse publisher)
  const subscriber = new Redis(redisUrl, {
    lazyConnect: true,
    enableReadyCheck: false,
    maxRetriesPerRequest: null,
  });

  subscriber.on("error", () => {
    // Silently absorb connection errors
  });

  // Subscribe to the user's notification channel
  subscriber.subscribe(channel).catch(() => {
    // Ignore subscription errors
  });

  let keepaliveInterval: ReturnType<typeof setInterval> | null = null;
  let streamController: ReadableStreamDefaultController<string> | null = null;

  const stream = new ReadableStream<string>({
    start(controller) {
      streamController = controller;

      // Send keepalive ping every 25 seconds
      keepaliveInterval = setInterval(() => {
        try {
          controller.enqueue(": ping\n\n");
        } catch {
          // Stream may have been closed already
        }
      }, 25_000);

      subscriber.on("message", (_chan: string, message: string) => {
        try {
          controller.enqueue(`data: ${message}\n\n`);
        } catch {
          // Stream may have been closed
        }
      });
    },
    cancel() {
      // Cleanup on stream cancel
      if (keepaliveInterval) {
        clearInterval(keepaliveInterval);
        keepaliveInterval = null;
      }
      void subscriber.unsubscribe(channel).finally(() => {
        void subscriber.quit();
      });
      streamController = null;
    },
  });

  // Suppress unused variable warning
  void streamController;

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      "Connection": "keep-alive",
    },
  });
}
