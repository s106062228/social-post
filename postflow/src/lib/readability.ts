/**
 * Flesch-Kincaid readability analysis for social media post content.
 *
 * FK Reading Ease: 206.835 - 1.015*(words/sentences) - 84.6*(syllables/words)
 * Higher score = easier to read. Range: 0–100.
 *
 * FK Grade Level: 0.39*(words/sentences) + 11.8*(syllables/words) - 15.59
 */

export interface ReadabilityResult {
  fleschKincaid: number;
  gradeLevel: number;
  wordCount: number;
  sentenceCount: number;
  avgWordsPerSentence: number;
  readingTimeSeconds: number;
  label: "very-easy" | "easy" | "medium" | "hard" | "very-hard";
}

function countSyllables(word: string): number {
  const cleaned = word.toLowerCase().replace(/[^a-z]/g, "");
  if (cleaned.length === 0) return 0;
  if (cleaned.length <= 3) return 1;

  // Remove silent trailing e
  const noTrailingE = cleaned.replace(/e$/, "");
  // Count vowel groups
  const matches = noTrailingE.match(/[aeiouy]+/g);
  const count = matches ? matches.length : 0;
  return Math.max(1, count);
}

function splitSentences(text: string): string[] {
  // Split on sentence-ending punctuation followed by whitespace or end of string
  const sentences = text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return sentences.length > 0 ? sentences : [text];
}

function splitWords(text: string): string[] {
  return text
    .replace(/[^\w\s'-]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 0);
}

export function analyzeReadability(content: string): ReadabilityResult {
  const trimmed = content.trim();

  if (trimmed.length === 0) {
    return {
      fleschKincaid: 100,
      gradeLevel: 0,
      wordCount: 0,
      sentenceCount: 0,
      avgWordsPerSentence: 0,
      readingTimeSeconds: 0,
      label: "very-easy",
    };
  }

  const sentences = splitSentences(trimmed);
  const words = splitWords(trimmed);

  const sentenceCount = Math.max(1, sentences.length);
  const wordCount = words.length;

  if (wordCount === 0) {
    return {
      fleschKincaid: 100,
      gradeLevel: 0,
      wordCount: 0,
      sentenceCount,
      avgWordsPerSentence: 0,
      readingTimeSeconds: 0,
      label: "very-easy",
    };
  }

  const syllableCount = words.reduce((sum, w) => sum + countSyllables(w), 0);

  const avgWordsPerSentence = wordCount / sentenceCount;
  const avgSyllablesPerWord = syllableCount / wordCount;

  const fk = 206.835 - 1.015 * avgWordsPerSentence - 84.6 * avgSyllablesPerWord;
  const fleschKincaid = Math.min(100, Math.max(0, Math.round(fk * 10) / 10));

  const gl = 0.39 * avgWordsPerSentence + 11.8 * avgSyllablesPerWord - 15.59;
  const gradeLevel = Math.max(0, Math.round(gl * 10) / 10);

  // Average adult reads ~200 wpm on social media (slower than books)
  const readingTimeSeconds = Math.max(1, Math.round((wordCount / 200) * 60));

  return {
    fleschKincaid,
    gradeLevel,
    wordCount,
    sentenceCount,
    avgWordsPerSentence: Math.round(avgWordsPerSentence * 10) / 10,
    readingTimeSeconds,
    label: readabilityLabel(fleschKincaid),
  };
}

export function readabilityLabel(
  score: number
): "very-easy" | "easy" | "medium" | "hard" | "very-hard" {
  if (score >= 70) return "very-easy";
  if (score >= 55) return "easy";
  if (score >= 40) return "medium";
  if (score >= 25) return "hard";
  return "very-hard";
}
