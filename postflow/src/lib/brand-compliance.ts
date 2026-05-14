export type ViolationType = "forbidden" | "missing_do" | "too_short";

export interface ComplianceViolation {
  type: ViolationType;
  message: string;
  keyword?: string;
}

export interface ComplianceResult {
  violations: ComplianceViolation[];
  compliant: boolean;
  score: number;
}

interface BrandKitInput {
  doKeywords: string[];
  dontKeywords: string[];
}

const MIN_CONTENT_LENGTH = 10;

export function checkBrandCompliance(
  content: string,
  brandKit: BrandKitInput
): ComplianceResult {
  const violations: ComplianceViolation[] = [];
  const lower = content.toLowerCase();

  // Check forbidden (don't) keywords
  for (const kw of brandKit.dontKeywords) {
    if (lower.includes(kw.toLowerCase())) {
      violations.push({
        type: "forbidden",
        message: `Contains forbidden term: "${kw}"`,
        keyword: kw,
      });
    }
  }

  // Check required (do) keywords — warn if none appear
  if (brandKit.doKeywords.length > 0) {
    const hasAny = brandKit.doKeywords.some((kw) => lower.includes(kw.toLowerCase()));
    if (!hasAny) {
      violations.push({
        type: "missing_do",
        message: `None of the preferred terms are used (e.g. "${brandKit.doKeywords[0]}")`,
      });
    }
  }

  // Check content length
  if (content.trim().length < MIN_CONTENT_LENGTH) {
    violations.push({
      type: "too_short",
      message: `Content is too short (minimum ${MIN_CONTENT_LENGTH} characters)`,
    });
  }

  const totalChecks =
    brandKit.dontKeywords.length +
    (brandKit.doKeywords.length > 0 ? 1 : 0) +
    1; // +1 for length check

  const passedChecks = totalChecks - violations.length;
  const score = totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) : 100;

  return {
    violations,
    compliant: violations.length === 0,
    score: Math.max(0, score),
  };
}
