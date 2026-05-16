export interface CaptionVar {
  key: string;
  value: string;
}

/**
 * Replaces all {{key}} placeholders in content with the corresponding values.
 * Unknown placeholders are left as-is.
 */
export function substituteVariables(
  content: string,
  vars: CaptionVar[]
): string {
  let result = content;
  for (const v of vars) {
    result = result.replaceAll(`{{${v.key}}}`, v.value);
  }
  return result;
}

/**
 * Returns all {{key}} placeholder names found in the given content.
 */
export function extractPlaceholders(content: string): string[] {
  const matches = content.matchAll(/\{\{([a-zA-Z0-9_]+)\}\}/g);
  const keys = new Set<string>();
  for (const match of matches) {
    keys.add(match[1]);
  }
  return Array.from(keys);
}
