/**
 * Jaccard similarity between two text strings, computed over unigram word tokens.
 *
 * Score is in [0, 1]: 0 = completely different, 1 = identical token sets.
 */

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "as", "is", "was", "are", "were", "be",
  "been", "being", "have", "has", "had", "do", "does", "did", "will",
  "would", "could", "should", "may", "might", "shall", "can", "it",
  "its", "this", "that", "these", "those", "i", "you", "he", "she",
  "we", "they", "my", "your", "his", "her", "our", "their", "me",
  "him", "us", "them", "not", "no", "so", "if", "then", "than",
  "just", "very", "also", "up", "out", "about", "into", "through",
]);

export function tokenize(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
  return new Set(tokens);
}

export function computeSimilarity(a: string, b: string): number {
  const setA = tokenize(a);
  const setB = tokenize(b);

  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersectionSize = 0;
  for (const token of setA) {
    if (setB.has(token)) intersectionSize++;
  }

  const unionSize = setA.size + setB.size - intersectionSize;
  return intersectionSize / unionSize;
}
