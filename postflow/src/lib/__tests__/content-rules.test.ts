import { checkContentRules } from "../content-rules";
import type { ContentRule } from "../content-rules";

describe("checkContentRules", () => {
  function baseRule(overrides: Partial<ContentRule> = {}): ContentRule {
    return {
      id: "r1",
      name: "Test Rule",
      type: "REQUIRED_HASHTAG",
      value: "#brand",
      platforms: [],
      severity: "WARNING",
      isActive: true,
      ...overrides,
    };
  }

  it("passes when no rules", () => {
    const result = checkContentRules("hello world", []);
    expect(result.compliant).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("detects missing required hashtag", () => {
    const result = checkContentRules("no hashtags here", [baseRule()]);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].type).toBe("REQUIRED_HASHTAG");
  });

  it("passes when required hashtag present", () => {
    const result = checkContentRules("check out #brand today", [baseRule()]);
    expect(result.violations).toHaveLength(0);
  });

  it("normalises hashtag without # prefix in rule value", () => {
    const result = checkContentRules("no hashtags", [baseRule({ value: "brand" })]);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].message).toContain("#brand");
  });

  it("detects forbidden word", () => {
    const result = checkContentRules("buy competitor products", [
      baseRule({ type: "FORBIDDEN_WORD", value: "competitor" }),
    ]);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].type).toBe("FORBIDDEN_WORD");
  });

  it("passes when forbidden word absent", () => {
    const result = checkContentRules("buy our products", [
      baseRule({ type: "FORBIDDEN_WORD", value: "competitor" }),
    ]);
    expect(result.violations).toHaveLength(0);
  });

  it("detects min length violation", () => {
    const result = checkContentRules("short", [
      baseRule({ type: "MIN_LENGTH", value: "50" }),
    ]);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].type).toBe("MIN_LENGTH");
  });

  it("passes when content meets min length", () => {
    const long = "a".repeat(50);
    const result = checkContentRules(long, [
      baseRule({ type: "MIN_LENGTH", value: "50" }),
    ]);
    expect(result.violations).toHaveLength(0);
  });

  it("detects too many hashtags", () => {
    const content = "#a #b #c #d #e #f";
    const result = checkContentRules(content, [
      baseRule({ type: "MAX_HASHTAGS", value: "3" }),
    ]);
    expect(result.violations).toHaveLength(1);
  });

  it("passes when hashtag count within limit", () => {
    const content = "#a #b";
    const result = checkContentRules(content, [
      baseRule({ type: "MAX_HASHTAGS", value: "3" }),
    ]);
    expect(result.violations).toHaveLength(0);
  });

  it("detects missing CTA", () => {
    const result = checkContentRules("hello world", [
      baseRule({ type: "REQUIRED_CTA", value: "" }),
    ]);
    expect(result.violations).toHaveLength(1);
  });

  it("passes when CTA keyword present", () => {
    const result = checkContentRules("click here to learn more", [
      baseRule({ type: "REQUIRED_CTA", value: "" }),
    ]);
    expect(result.violations).toHaveLength(0);
  });

  it("detects custom regex violation", () => {
    const result = checkContentRules("hello world", [
      baseRule({ type: "CUSTOM_REGEX", value: "^must start" }),
    ]);
    expect(result.violations).toHaveLength(1);
  });

  it("passes custom regex", () => {
    const result = checkContentRules("must start with this", [
      baseRule({ type: "CUSTOM_REGEX", value: "^must start" }),
    ]);
    expect(result.violations).toHaveLength(0);
  });

  it("skips invalid regex silently", () => {
    const result = checkContentRules("hello world", [
      baseRule({ type: "CUSTOM_REGEX", value: "[invalid" }),
    ]);
    // Invalid regex is skipped — no violation
    expect(result.violations).toHaveLength(0);
  });

  it("skips inactive rules", () => {
    const result = checkContentRules("hello", [baseRule({ isActive: false })]);
    expect(result.violations).toHaveLength(0);
  });

  it("skips rules for other platform when platform specified", () => {
    const result = checkContentRules(
      "hello",
      [baseRule({ platforms: ["INSTAGRAM"] })],
      "FACEBOOK"
    );
    expect(result.violations).toHaveLength(0);
  });

  it("applies rules when platform matches", () => {
    const result = checkContentRules(
      "hello",
      [baseRule({ platforms: ["FACEBOOK"] })],
      "FACEBOOK"
    );
    expect(result.violations).toHaveLength(1);
  });

  it("applies rules for all platforms when platforms array is empty", () => {
    const result = checkContentRules(
      "hello",
      [baseRule({ platforms: [] })],
      "TWITTER"
    );
    expect(result.violations).toHaveLength(1);
  });

  it("separates errors from warnings", () => {
    const rules: ContentRule[] = [
      baseRule({ id: "r1", severity: "ERROR" }),
      baseRule({ id: "r2", name: "Rule 2", value: "#other", severity: "WARNING" }),
    ];
    const result = checkContentRules("no hashtags", rules);
    expect(result.errors).toHaveLength(2);
    expect(result.warnings).toHaveLength(0);
    expect(result.compliant).toBe(false);
  });

  it("compliant is true when there are only warnings (no errors)", () => {
    const result = checkContentRules("hello", [baseRule({ severity: "WARNING" })]);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
    // compliant means no ERRORS
    expect(result.compliant).toBe(true);
  });

  it("compliant is false when there are errors", () => {
    const result = checkContentRules("hello", [baseRule({ severity: "ERROR" })]);
    expect(result.errors).toHaveLength(1);
    expect(result.compliant).toBe(false);
  });
});
