export interface SeoCheck {
  id: string;
  label: string;
  passed: boolean;
  hint: string;
}

export interface SeoResult {
  score: number;
  label: "Excellent" | "Good" | "Fair" | "Needs Work";
  checks: SeoCheck[];
}

function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}

function extractHashtags(text: string): RegExpMatchArray | null {
  return text.match(/#[\w]+/g);
}

function hasUrl(text: string): boolean {
  return /https?:\/\/\S+/.test(text);
}

function hasEngagementTrigger(text: string): boolean {
  return (
    text.includes("?") ||
    /\b(sign up|learn more|click here|read more|find out|discover|try|join|get started|share|comment|like|follow|subscribe|check out|see more|visit|download|buy|shop|order|save|book|apply|register)\b/i.test(
      text
    )
  );
}

function avgWordsPerSentence(text: string): number {
  const sentences = text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const words = countWords(text);
  const sentenceCount = Math.max(1, sentences.length);
  return words / sentenceCount;
}

export function analyzeSeo(content: string): SeoResult {
  const trimmed = content.trim();
  const wordCount = countWords(trimmed);
  const hashtags = extractHashtags(trimmed);
  const hashtagCount = hashtags ? hashtags.length : 0;
  const hasLink = hasUrl(trimmed);
  const awps = avgWordsPerSentence(trimmed);
  const hasEngagement = hasEngagementTrigger(trimmed);

  const checks: SeoCheck[] = [
    {
      id: "min_length",
      label: "Content length (≥50 words)",
      passed: wordCount >= 50,
      hint: `Your post has ${wordCount} word${wordCount === 1 ? "" : "s"}. Aim for at least 50 words to improve discoverability.`,
    },
    {
      id: "hashtags_present",
      label: "Hashtags included",
      passed: hashtagCount > 0,
      hint: "Add relevant hashtags to increase reach and searchability.",
    },
    {
      id: "hashtags_not_excessive",
      label: "Hashtag count not excessive (≤10)",
      passed: hashtagCount === 0 || hashtagCount <= 10,
      hint: `${hashtagCount} hashtags detected. More than 10 can appear spammy and reduce engagement.`,
    },
    {
      id: "has_link",
      label: "Contains a link",
      passed: hasLink,
      hint: "Include a URL to drive traffic and provide a clear call-to-action destination.",
    },
    {
      id: "readable_sentences",
      label: "Short readable sentences (≤20 words avg)",
      passed: awps <= 20,
      hint: `Average sentence length is ${Math.round(awps)} words. Keep it under 20 for better engagement.`,
    },
    {
      id: "engagement_trigger",
      label: "Contains engagement trigger (question or CTA)",
      passed: hasEngagement,
      hint: 'End with a question or call-to-action (e.g. "What do you think?" or "Sign up now") to drive engagement.',
    },
  ];

  const passedCount = checks.filter((c) => c.passed).length;
  const score = Math.round((passedCount / checks.length) * 100);

  let label: SeoResult["label"];
  if (score >= 84) label = "Excellent";
  else if (score >= 67) label = "Good";
  else if (score >= 50) label = "Fair";
  else label = "Needs Work";

  return { score, label, checks };
}

export function seoScoreColor(score: number): string {
  if (score >= 84) return "text-green-600";
  if (score >= 67) return "text-yellow-600";
  if (score >= 50) return "text-orange-500";
  return "text-red-600";
}
