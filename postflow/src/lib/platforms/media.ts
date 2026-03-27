import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomBytes } from "crypto";
import { extname } from "path";

// ── R2 client factory ─────────────────────────────────────────────────────────

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} environment variable is not set`);
  return value;
}

function createR2Client(): S3Client {
  const accountId = getRequiredEnv("R2_ACCOUNT_ID");
  const accessKeyId = getRequiredEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = getRequiredEnv("R2_SECRET_ACCESS_KEY");

  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

// ── Public helpers ────────────────────────────────────────────────────────────

export interface UploadResult {
  /** Key within the R2 bucket */
  key: string;
  /** Publicly accessible URL */
  publicUrl: string;
}

/**
 * Upload a file buffer to Cloudflare R2.
 * Returns the public URL that can be used in platform API calls.
 *
 * @param buffer    File contents
 * @param filename  Original filename (used to derive the extension)
 * @param mimeType  MIME type of the file (e.g. "image/jpeg", "video/mp4")
 * @param folder    Optional folder prefix inside the bucket (e.g. "posts")
 */
export async function uploadMedia(
  buffer: Buffer,
  filename: string,
  mimeType: string,
  folder = "posts"
): Promise<UploadResult> {
  const client = createR2Client();
  const bucket = getRequiredEnv("R2_BUCKET_NAME");
  const publicUrl = getRequiredEnv("R2_PUBLIC_URL");

  const ext = extname(filename) || mimeTypeToExt(mimeType);
  const key = `${folder}/${randomBytes(16).toString("hex")}${ext}`;

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: mimeType,
    // Allow public read — R2 bucket must have public access enabled
    ACL: "public-read",
  });

  await client.send(command);

  return {
    key,
    publicUrl: `${publicUrl.replace(/\/$/, "")}/${key}`,
  };
}

/**
 * Delete a previously uploaded file from R2 by its key.
 */
export async function deleteMedia(key: string): Promise<void> {
  const client = createR2Client();
  const bucket = getRequiredEnv("R2_BUCKET_NAME");

  const command = new DeleteObjectCommand({ Bucket: bucket, Key: key });
  await client.send(command);
}

/**
 * Generate a short-lived pre-signed PUT URL for direct client uploads.
 * The client uploads directly to R2; the server only stores the resulting key.
 *
 * @param filename  Desired filename (extension is preserved)
 * @param mimeType  MIME type that the client will use for the PUT request
 * @param folder    Optional folder prefix inside the bucket
 * @param expiresIn Seconds until the URL expires (default 300 = 5 min)
 */
export async function createPresignedUploadUrl(
  filename: string,
  mimeType: string,
  folder = "uploads",
  expiresIn = 300
): Promise<{ key: string; uploadUrl: string; publicUrl: string }> {
  const client = createR2Client();
  const bucket = getRequiredEnv("R2_BUCKET_NAME");
  const publicBaseUrl = getRequiredEnv("R2_PUBLIC_URL");

  const ext = extname(filename) || mimeTypeToExt(mimeType);
  const key = `${folder}/${randomBytes(16).toString("hex")}${ext}`;

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: mimeType,
  });

  const uploadUrl = await getSignedUrl(client, command, { expiresIn });

  return {
    key,
    uploadUrl,
    publicUrl: `${publicBaseUrl.replace(/\/$/, "")}/${key}`,
  };
}

// ── Utilities ─────────────────────────────────────────────────────────────────

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "video/webm": ".webm",
};

function mimeTypeToExt(mimeType: string): string {
  return MIME_TO_EXT[mimeType] ?? "";
}

/**
 * Returns true if the MIME type is a supported image format.
 */
export function isImageMimeType(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}

/**
 * Returns true if the MIME type is a supported video format.
 */
export function isVideoMimeType(mimeType: string): boolean {
  return mimeType.startsWith("video/");
}
