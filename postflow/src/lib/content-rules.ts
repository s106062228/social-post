export type RuleType =
  | "REQUIRED_HASHTAG"
  | "FORBIDDEN_WORD"
  | "MIN_LENGTH"
  | "MAX_HASHTAGS"
  | "REQUIRED_CTA"
  | "CUSTOM_REGEX";

export type RuleSeverity = "ERROR" | "WARNING";

export interface ContentRule {
  id: string;
  name: string;
  type: RuleType;
  value: string;
  platforms: string[];
  severity: RuleSeverity;
  isActive: boolean;
}

export interface RuleViolation {
  ruleId: string;
  ruleName: string;
  type: RuleType;
  severity: RuleSeverity;
  message: string;
}

export interface RulesCheckResult {
  violations: RuleViolation[];
  errors: RuleViolation[];
  warnings: RuleViolation[];
  compliant: boolean;
}

const CTA_KEYWORDS = [
  "click",
  "learn more",
  "buy now",
  "sign up",
  "register",
  "download",
  "get started",
  "shop now",
  "visit",
  "follow",
  "subscribe",
  "comment",
  "share",
  "tag",
  "link in bio",
  "dm us",
  "swipe up",
];

export function checkContentRules(
  content: string,
  rules: ContentRule[],
  platform?: string
): RulesCheckResult {
  const violations: RuleViolation[] = [];
  const lowerContent = content.toLowerCase();

  for (const rule of rules) {
    if (!rule.isActive) continue;
    // Skip rules not applicable to this platform (empty means all platforms)
    if (
      platform &&
      rule.platforms.length > 0 &&
      !rule.platforms.includes(platform)
    )
      continue;

    let violation: Omit<
      RuleViolation,
      "ruleId" | "ruleName" | "severity"
    > | null = null;

    switch (rule.type) {
      case "REQUIRED_HASHTAG": {
        const tag = rule.value.startsWith("#")
          ? rule.value.toLowerCase()
          : `#${rule.value.toLowerCase()}`;
        if (!lowerContent.includes(tag)) {
          violation = {
            type: rule.type,
            message: `Must include hashtag ${tag}`,
          };
        }
        break;
      }
      case "FORBIDDEN_WORD": {
        const word = rule.value.toLowerCase();
        if (lowerContent.includes(word)) {
          violation = {
            type: rule.type,
            message: `Contains forbidden word: "${rule.value}"`,
          };
        }
        break;
      }
      case "MIN_LENGTH": {
        const min = parseInt(rule.value, 10);
        if (!isNaN(min) && content.length < min) {
          violation = {
            type: rule.type,
            message: `Content must be at least ${min} characters (currently ${content.length})`,
          };
        }
        break;
      }
      case "MAX_HASHTAGS": {
        const max = parseInt(rule.value, 10);
        const hashtagCount = (content.match(/#\w+/g) ?? []).length;
        if (!isNaN(max) && hashtagCount > max) {
          violation = {
            type: rule.type,
            message: `Too many hashtags: ${hashtagCount} (max ${max})`,
          };
        }
        break;
      }
      case "REQUIRED_CTA": {
        const hasCta = CTA_KEYWORDS.some((kw) => lowerContent.includes(kw));
        if (!hasCta) {
          violation = {
            type: rule.type,
            message: "Content should include a call-to-action",
          };
        }
        break;
      }
      case "CUSTOM_REGEX": {
        try {
          const regex = new RegExp(rule.value, "i");
          if (!regex.test(content)) {
            violation = {
              type: rule.type,
              message: `Content does not match required pattern: ${rule.value}`,
            };
          }
        } catch {
          // Invalid regex — skip
        }
        break;
      }
    }

    if (violation) {
      violations.push({
        ruleId: rule.id,
        ruleName: rule.name,
        severity: rule.severity,
        ...violation,
      });
    }
  }

  const errors = violations.filter((v) => v.severity === "ERROR");
  const warnings = violations.filter((v) => v.severity === "WARNING");

  return {
    violations,
    errors,
    warnings,
    compliant: errors.length === 0,
  };
}
