const STOP_WORDS = new Set([
  "a", "about", "above", "after", "again", "against", "all", "am", "an",
  "and", "any", "are", "aren't", "as", "at", "be", "because", "been",
  "before", "being", "below", "between", "both", "but", "by", "can't",
  "cannot", "could", "couldn't", "did", "didn't", "do", "does", "doesn't",
  "doing", "don't", "down", "during", "each", "few", "for", "from",
  "further", "get", "got", "had", "hadn't", "has", "hasn't", "have",
  "haven't", "having", "he", "he'd", "he'll", "he's", "her", "here",
  "here's", "hers", "herself", "him", "himself", "his", "how", "how's",
  "i", "i'd", "i'll", "i'm", "i've", "if", "in", "into", "is", "isn't",
  "it", "it's", "its", "itself", "let's", "me", "more", "most", "mustn't",
  "my", "myself", "no", "nor", "not", "of", "off", "on", "once", "only",
  "or", "other", "ought", "our", "ours", "ourselves", "out", "over", "own",
  "same", "shan't", "she", "she'd", "she'll", "she's", "should",
  "shouldn't", "so", "some", "such", "than", "that", "that's", "the",
  "their", "theirs", "them", "themselves", "then", "there", "there's",
  "these", "they", "they'd", "they'll", "they're", "they've", "this",
  "those", "through", "to", "too", "under", "until", "up", "very", "was",
  "wasn't", "we", "we'd", "we'll", "we're", "we've", "were", "weren't",
  "what", "what's", "when", "when's", "where", "where's", "which", "while",
  "who", "who's", "whom", "why", "why's", "will", "with", "won't",
  "would", "wouldn't", "you", "you'd", "you'll", "you're", "you've",
  "your", "yours", "yourself", "yourselves",
  // Common social-media filler
  "just", "like", "now", "new", "one", "time", "day", "get", "see",
  "via", "the", "re", "s", "t", "ll", "ve", "d",
]);

export interface WordCount {
  text: string;
  count: number;
}

/**
 * Tokenise content, filter stop words, and return sorted word frequencies.
 * @param texts  Array of raw post content strings
 * @param limit  Maximum number of words to return (default 50)
 */
export function computeWordFrequency(texts: string[], limit = 50): WordCount[] {
  const freq = new Map<string, number>();

  for (const text of texts) {
    // Strip URLs, mentions, hashtag symbols, punctuation; keep hashtag text
    const cleaned = text
      .replace(/https?:\/\/\S+/g, " ")
      .replace(/@\w+/g, " ")
      .replace(/[^a-zA-Z0-9#'\-\s]/g, " ")
      .replace(/#/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();

    const tokens = cleaned.split(/\s+/);
    for (const raw of tokens) {
      // Strip leading/trailing hyphens and apostrophes
      const word = raw.replace(/^[-']+|[-']+$/g, "");
      if (word.length < 2) continue;
      if (STOP_WORDS.has(word)) continue;
      // Skip pure numbers
      if (/^\d+$/.test(word)) continue;
      freq.set(word, (freq.get(word) ?? 0) + 1);
    }
  }

  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([text, count]) => ({ text, count }));
}
