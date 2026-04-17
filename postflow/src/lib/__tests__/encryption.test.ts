import { encryptToken, decryptToken } from "../encryption";

const VALID_KEY = "a".repeat(64); // 32 bytes as 64 hex chars

describe("encryptToken", () => {
  beforeEach(() => {
    process.env.TOKEN_ENCRYPTION_KEY = VALID_KEY;
  });

  afterEach(() => {
    delete process.env.TOKEN_ENCRYPTION_KEY;
  });

  it("produces a colon-separated hex string with 3 parts", () => {
    const result = encryptToken("hello");
    const parts = result.split(":");
    expect(parts).toHaveLength(3);
    expect(parts[0]).toMatch(/^[0-9a-f]+$/);
    expect(parts[1]).toMatch(/^[0-9a-f]+$/);
    expect(parts[2]).toMatch(/^[0-9a-f]+$/);
  });

  it("generates a unique IV on every call (different ciphertext each time)", () => {
    const enc1 = encryptToken("same-plaintext");
    const enc2 = encryptToken("same-plaintext");
    expect(enc1).not.toBe(enc2);
  });

  it("throws when TOKEN_ENCRYPTION_KEY is missing", () => {
    delete process.env.TOKEN_ENCRYPTION_KEY;
    expect(() => encryptToken("test")).toThrow(
      "TOKEN_ENCRYPTION_KEY environment variable is not set"
    );
  });

  it("throws when TOKEN_ENCRYPTION_KEY is wrong length", () => {
    process.env.TOKEN_ENCRYPTION_KEY = "deadbeef"; // only 4 bytes
    expect(() => encryptToken("test")).toThrow(
      "TOKEN_ENCRYPTION_KEY must be a 32-byte hex string"
    );
  });
});

describe("decryptToken", () => {
  beforeEach(() => {
    process.env.TOKEN_ENCRYPTION_KEY = VALID_KEY;
  });

  afterEach(() => {
    delete process.env.TOKEN_ENCRYPTION_KEY;
  });

  it("round-trips a plaintext string", () => {
    const plaintext = "super-secret-access-token-xyz";
    expect(decryptToken(encryptToken(plaintext))).toBe(plaintext);
  });

  it("round-trips an empty string", () => {
    expect(decryptToken(encryptToken(""))).toBe("");
  });

  it("round-trips unicode content", () => {
    const plaintext = "日本語テスト 🔐";
    expect(decryptToken(encryptToken(plaintext))).toBe(plaintext);
  });

  it("throws on invalid format (not 3 parts)", () => {
    expect(() => decryptToken("only-two:parts")).toThrow(
      "Invalid encrypted token format"
    );
    expect(() => decryptToken("one")).toThrow("Invalid encrypted token format");
  });

  it("throws when the auth tag is tampered (GCM integrity check)", () => {
    const encrypted = encryptToken("sensitive-data");
    const [iv, , ciphertext] = encrypted.split(":");
    const tampered = `${iv}:deadbeefdeadbeef:${ciphertext}`;
    expect(() => decryptToken(tampered)).toThrow();
  });

  it("throws when the ciphertext is tampered", () => {
    const encrypted = encryptToken("sensitive-data");
    const [iv, authTag] = encrypted.split(":");
    const tampered = `${iv}:${authTag}:deadbeef`;
    expect(() => decryptToken(tampered)).toThrow();
  });
});
