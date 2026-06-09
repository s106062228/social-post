import { Platform } from "@prisma/client";
import { PLATFORM_CHAR_LIMITS } from "./character-limits";
import { prisma } from "./db";

export interface SyndicationTransformations {
  truncate?: boolean;
  stripLinks?: boolean;
  appendHashtags?: string;
  customSuffix?: string;
}

export function applyTransformations(
  content: string,
  transformations: SyndicationTransformations,
  targetPlatform: Platform
): string {
  let result = content;

  if (transformations.stripLinks) {
    result = result.replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim();
  }

  if (transformations.appendHashtags) {
    const tags = transformations.appendHashtags
      .split(/[\s,]+/)
      .filter(Boolean)
      .map((t) => (t.startsWith("#") ? t : `#${t}`))
      .join(" ");
    if (tags) result = `${result}\n\n${tags}`;
  }

  if (transformations.customSuffix) {
    result = `${result}\n\n${transformations.customSuffix}`;
  }

  if (transformations.truncate !== false) {
    const limit = PLATFORM_CHAR_LIMITS[targetPlatform] ?? 2200;
    if (result.length > limit) {
      result = result.slice(0, limit - 1) + "…";
    }
  }

  return result;
}

export async function getSyndicationRulesForPlatform(
  userId: string,
  platform: Platform
) {
  return prisma.syndicationRule.findMany({
    where: { userId, sourcePlatform: platform, isActive: true },
  });
}
