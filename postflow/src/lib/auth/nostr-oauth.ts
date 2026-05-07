import { getPublicKey } from "nostr-tools/pure";
import { decode } from "nostr-tools/nip19";

// ── Public types ──────────────────────────────────────────────────────────────

export interface NostrTokenData {
  privateKey: string; // hex-encoded 32-byte private key
  publicKey: string;  // hex-encoded public key (derived)
  relayUrls: string[]; // wss:// relay endpoints
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function hexToBytes(hex: string): Uint8Array {
  if (hex.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error("Private key must be a 64-character hex string");
  }
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Validates a Nostr private key (hex or nsec format) and derives the public key.
 * Returns {privateKey (hex), publicKey (hex)}.
 */
export function verifyNostrPrivateKey(
  privateKeyInput: string
): { privateKey: string; publicKey: string } {
  let privateKeyBytes: Uint8Array;

  const trimmed = privateKeyInput.trim();

  if (trimmed.startsWith("nsec1")) {
    const decoded = decode(trimmed);
    if (decoded.type !== "nsec") {
      throw new Error("Invalid nsec key");
    }
    privateKeyBytes = decoded.data;
  } else {
    // Expect hex format
    privateKeyBytes = hexToBytes(trimmed);
  }

  const publicKey = getPublicKey(privateKeyBytes);
  const privateKeyHex = bytesToHex(privateKeyBytes);

  return { privateKey: privateKeyHex, publicKey };
}

/**
 * Converts a stored hex private key back to Uint8Array for signing.
 */
export function hexPrivateKeyToBytes(hexKey: string): Uint8Array {
  return hexToBytes(hexKey);
}

/**
 * Serializes Nostr token data to a JSON string for encrypted storage.
 */
export function serializeNostrToken(data: NostrTokenData): string {
  return JSON.stringify(data);
}

/**
 * Parses a stored Nostr token JSON string.
 */
export function parseNostrToken(token: string): NostrTokenData {
  const parsed = JSON.parse(token) as NostrTokenData;
  if (!parsed.privateKey || !parsed.publicKey || !Array.isArray(parsed.relayUrls)) {
    throw new Error("Invalid Nostr token data");
  }
  return parsed;
}
