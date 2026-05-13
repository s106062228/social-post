import { NextResponse } from "next/server";
import { getVapidPublicKey } from "@/lib/web-push";

// ── GET /api/push/vapid-key ───────────────────────────────────────────────────
// Public endpoint — returns the VAPID public key so the client can subscribe.

export function GET(): NextResponse {
  const key = getVapidPublicKey();
  if (!key) {
    return NextResponse.json({ enabled: false, publicKey: null });
  }
  return NextResponse.json({ enabled: true, publicKey: key });
}
