import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { createPresignedUploadUrl, deleteMedia } from "@/lib/platforms/media";
import { handleRouteError } from "@/lib/errors";
import { checkRateLimit, rateLimitExceededResponse, RATE_LIMITS } from "@/lib/rate-limit";

// ── Validation ────────────────────────────────────────────────────────────────

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "video/mp4",
  "video/quicktime",
  "video/webm",
] as const;

const requestPresignedUrlSchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.enum(ALLOWED_MIME_TYPES),
});

const deleteMediaSchema = z.object({
  key: z.string().min(1),
});

// ── POST /api/media/upload ─────────────────────────────────────────────────────
// Returns a pre-signed PUT URL so the browser can upload directly to R2.
// The server never touches the file bytes — only metadata.

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Rate limiting: 30 presigned URL requests per minute per user
    const rl = await checkRateLimit(`ratelimit:mediaUpload:${session.user.id}`, RATE_LIMITS.mediaUpload);
    if (!rl.success) {
      return rateLimitExceededResponse(rl);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = requestPresignedUrlSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { filename, mimeType } = parsed.data;

    // Use user-scoped folder to keep uploads organised
    const folder = `uploads/${session.user.id}`;
    const result = await createPresignedUploadUrl(filename, mimeType, folder);

    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── DELETE /api/media/upload ───────────────────────────────────────────────────
// Removes a previously uploaded file from R2 (e.g. when user removes a media
// item from the composer before saving the post).

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = deleteMediaSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    // Ensure the key belongs to this user to prevent unauthorised deletions
    const { key } = parsed.data;
    if (!key.startsWith(`uploads/${session.user.id}/`)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await deleteMedia(key);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return handleRouteError(err);
  }
}
