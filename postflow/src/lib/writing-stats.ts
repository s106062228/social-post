// Regex constants — compiled once
const HASHTAG_RE = /#\w+/g;
const URL_RE = /https?:\/\/\S+/g;
const SENTENCE_SPLIT_RE = /[.!?]+\s+|\n+/g;
// Matches Unicode emoji characters (requires ES2018+ engine)
const EMOJI_RE = /\p{Emoji_Presentation}|\p{Extended_Pictographic}/gu;

export interface EmojiCount {
  emoji: string;
  count: number;
}

export interface DayCount {
  day: string;
  count: number;
}

export interface HourCount {
  hour: number;
  count: number;
}

export interface WritingStats {
  totalPosts: number;
  avgWordCount: number;
  avgCharCount: number;
  avgHashtagCount: number;
  avgSentenceCount: number;
  postsWithLinksPercent: number;
  postsWithEmojisPercent: number;
  topEmojis: EmojiCount[];
  postingDayDistribution: DayCount[];
  postingHourDistribution: HourCount[];
}

export interface PostForStats {
  content: string;
  updatedAt: Date;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function emptyStats(): WritingStats {
  return {
    totalPosts: 0,
    avgWordCount: 0,
    avgCharCount: 0,
    avgHashtagCount: 0,
    avgSentenceCount: 0,
    postsWithLinksPercent: 0,
    postsWithEmojisPercent: 0,
    topEmojis: [],
    postingDayDistribution: DAY_NAMES.map((day) => ({ day, count: 0 })),
    postingHourDistribution: Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      count: 0,
    })),
  };
}

export function analyzeWritingStats(posts: PostForStats[]): WritingStats {
  if (posts.length === 0) return emptyStats();

  let totalWords = 0;
  let totalChars = 0;
  let totalHashtags = 0;
  let totalSentences = 0;
  let postsWithLinks = 0;
  let postsWithEmojis = 0;

  const emojiFreq = new Map<string, number>();
  const dayDist = new Array<number>(7).fill(0);
  const hourDist = new Array<number>(24).fill(0);

  for (const post of posts) {
    const { content, updatedAt } = post;

    // Word count — strip URLs and hashtags first
    const strippedForWords = content
      .replace(URL_RE, " ")
      .replace(HASHTAG_RE, " ");
    URL_RE.lastIndex = 0;
    HASHTAG_RE.lastIndex = 0;
    const words = strippedForWords.trim().split(/\s+/).filter((w) => w.length > 0);
    totalWords += words.length;

    // Char count (raw)
    totalChars += content.length;

    // Hashtag count
    const hashtags = content.match(HASHTAG_RE) ?? [];
    HASHTAG_RE.lastIndex = 0;
    totalHashtags += hashtags.length;

    // Sentence count — split by sentence-ending punctuation or newlines
    const sentences = content
      .split(SENTENCE_SPLIT_RE)
      .filter((s) => s.trim().length > 0);
    totalSentences += Math.max(1, sentences.length);

    // Link presence
    if (URL_RE.test(content)) postsWithLinks++;
    URL_RE.lastIndex = 0;

    // Emoji presence & frequency
    const emojis = content.match(EMOJI_RE) ?? [];
    EMOJI_RE.lastIndex = 0;
    if (emojis.length > 0) postsWithEmojis++;
    for (const emoji of emojis) {
      emojiFreq.set(emoji, (emojiFreq.get(emoji) ?? 0) + 1);
    }

    // Day & hour distribution from updatedAt
    const d = updatedAt.getDay(); // 0 = Sunday
    const h = updatedAt.getHours();
    dayDist[d] = (dayDist[d] ?? 0) + 1;
    hourDist[h] = (hourDist[h] ?? 0) + 1;
  }

  const n = posts.length;
  const round1 = (v: number) => Math.round(v * 10) / 10;

  const topEmojis = Array.from(emojiFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([emoji, count]) => ({ emoji, count }));

  const postingDayDistribution: DayCount[] = DAY_NAMES.map((day, i) => ({
    day,
    count: dayDist[i] ?? 0,
  }));

  const postingHourDistribution: HourCount[] = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    count: hourDist[h] ?? 0,
  }));

  return {
    totalPosts: n,
    avgWordCount: Math.round(totalWords / n),
    avgCharCount: Math.round(totalChars / n),
    avgHashtagCount: round1(totalHashtags / n),
    avgSentenceCount: round1(totalSentences / n),
    postsWithLinksPercent: Math.round((postsWithLinks / n) * 100),
    postsWithEmojisPercent: Math.round((postsWithEmojis / n) * 100),
    topEmojis,
    postingDayDistribution,
    postingHourDistribution,
  };
}
