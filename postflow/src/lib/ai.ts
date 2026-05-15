import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-haiku-4-5";

function getClient(): Anthropic {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

const SUGGEST_SYSTEM = `You are a social media content writer. Generate engaging post content variants for the requested topic, tone, and platforms.
Always respond with valid JSON in this exact format: {"variants": ["variant1", "variant2", "variant3"]}
Generate exactly 3 distinct variants. Keep each variant concise, engaging, and platform-appropriate.`;

const HASHTAG_SYSTEM = `You are a social media hashtag expert. Suggest relevant, trending hashtags for given content and platforms.
Always respond with valid JSON in this exact format: {"hashtags": ["#tag1", "#tag2", "#tag3"]}
Suggest 5–10 relevant hashtags. Always include the # prefix. Avoid overly generic tags.`;

export async function generateContentVariants(
  topic: string,
  tone: string,
  platforms: string[]
): Promise<string[]> {
  const client = getClient();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: [
      {
        type: "text",
        text: SUGGEST_SYSTEM,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `Topic: ${topic}\nTone: ${tone}\nPlatforms: ${platforms.join(", ")}\n\nGenerate 3 post content variants.`,
      },
    ],
  });

  const block = response.content.find((b) => b.type === "text");
  const text = block && block.type === "text" ? block.text : "{}";
  try {
    const parsed = JSON.parse(text) as { variants?: unknown };
    const variants = parsed.variants;
    if (Array.isArray(variants) && variants.every((v) => typeof v === "string")) {
      return variants as string[];
    }
  } catch {
    // fall through
  }
  return [];
}

const REPURPOSE_SYSTEM = `You are a social media content expert. Rewrite the provided post for different social media platforms, adapting style and length to each platform's constraints and audience expectations.
Always respond with valid JSON in this exact format: {"variants": [{"platform": "PLATFORM_NAME", "content": "adapted content"}]}
Platform guidelines:
- FACEBOOK (max 63,206 chars): Conversational, storytelling-friendly, supports rich text and emojis, longer is fine
- INSTAGRAM (max 2,200 chars): Visual-focused, engaging caption, hashtag-friendly, punchy hook
- THREADS (max 500 chars): Short, punchy, Twitter-like brevity, no hashtags needed
Only include the platforms requested. Keep the core message but adapt the style.`;

export async function repurposeContent(
  content: string,
  targetPlatforms: string[]
): Promise<{ platform: string; content: string }[]> {
  const client = getClient();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: [
      {
        type: "text",
        text: REPURPOSE_SYSTEM,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `Original content:\n${content}\n\nRepurpose for these platforms: ${targetPlatforms.join(", ")}`,
      },
    ],
  });

  const block = response.content.find((b) => b.type === "text");
  const text = block && block.type === "text" ? block.text : "{}";
  try {
    const parsed = JSON.parse(text) as { variants?: unknown };
    const variants = parsed.variants;
    if (
      Array.isArray(variants) &&
      variants.every(
        (v) =>
          typeof v === "object" &&
          v !== null &&
          typeof (v as Record<string, unknown>).platform === "string" &&
          typeof (v as Record<string, unknown>).content === "string"
      )
    ) {
      return variants as { platform: string; content: string }[];
    }
  } catch {
    // fall through
  }
  return [];
}

export interface ScheduleRecommendation {
  insight: string;
  action: string;
  priority: "high" | "medium" | "low";
}

const SCHEDULE_ADVISOR_SYSTEM = `You are a social media scheduling expert. Analyze posting history and engagement data to provide actionable scheduling recommendations.
Always respond with valid JSON in this exact format: {"recommendations": [{"insight": "observation", "action": "specific action to take", "priority": "high|medium|low"}]}
Provide 3–5 distinct, actionable recommendations. Priorities: high = immediate impact, medium = helpful improvement, low = nice to have.
Base recommendations on the provided data. If data is sparse, suggest data collection strategies.`;

export async function generateScheduleAdvice(
  historySummary: string,
  insightsSummary: string
): Promise<ScheduleRecommendation[]> {
  const client = getClient();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: [
      {
        type: "text",
        text: SCHEDULE_ADVISOR_SYSTEM,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `Posting History:\n${historySummary}\n\nEngagement Insights:\n${insightsSummary}\n\nProvide scheduling recommendations.`,
      },
    ],
  });

  const block = response.content.find((b) => b.type === "text");
  const text = block && block.type === "text" ? block.text : "{}";
  try {
    const parsed = JSON.parse(text) as { recommendations?: unknown };
    const recs = parsed.recommendations;
    if (
      Array.isArray(recs) &&
      recs.every(
        (r) =>
          typeof r === "object" &&
          r !== null &&
          typeof (r as Record<string, unknown>).insight === "string" &&
          typeof (r as Record<string, unknown>).action === "string" &&
          ["high", "medium", "low"].includes((r as Record<string, unknown>).priority as string)
      )
    ) {
      return recs as ScheduleRecommendation[];
    }
  } catch {
    // fall through
  }
  return [];
}

const TRANSLATE_SYSTEM = `You are a professional translator and social media expert. Translate the provided post content into the requested languages.
Preserve all hashtags (words starting with #), mentions (words starting with @), URLs, and emojis exactly as they appear.
Only translate the natural language text portions. Adapt the tone to be natural for social media in each target language.
Always respond with valid JSON in this exact format: {"translations": [{"language": "ISO-639-1-code", "content": "translated content"}]}
Include exactly one entry per requested language.`;

export async function translateContent(
  content: string,
  targetLanguages: string[]
): Promise<{ language: string; content: string }[]> {
  const client = getClient();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: [
      {
        type: "text",
        text: TRANSLATE_SYSTEM,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `Original content:\n${content}\n\nTranslate into these languages (ISO 639-1 codes): ${targetLanguages.join(", ")}`,
      },
    ],
  });

  const block = response.content.find((b) => b.type === "text");
  const text = block && block.type === "text" ? block.text : "{}";
  try {
    const parsed = JSON.parse(text) as { translations?: unknown };
    const translations = parsed.translations;
    if (
      Array.isArray(translations) &&
      translations.every(
        (t) =>
          typeof t === "object" &&
          t !== null &&
          typeof (t as Record<string, unknown>).language === "string" &&
          typeof (t as Record<string, unknown>).content === "string"
      )
    ) {
      return translations as { language: string; content: string }[];
    }
  } catch {
    // fall through
  }
  return [];
}

const CAPTION_SYSTEM = `You are a social media content writer specializing in image captions. Analyze the provided image and generate platform-optimized captions.
Always respond with valid JSON in this exact format: {"captions": [{"platform": "PLATFORM_NAME", "content": "caption text"}]}
Platform guidelines:
- FACEBOOK (max 63,206 chars): Descriptive, engaging, storytelling-friendly, can be longer
- INSTAGRAM (max 2,200 chars): Visual-focused, punchy hook, emoji-friendly, hashtag-ready
- THREADS (max 500 chars): Short, witty, conversational
- TWITTER (max 280 chars): Concise, punchy, with relevant hashtags
- LINKEDIN (max 3,000 chars): Professional tone, contextual description
Only include the platforms requested. Each caption should feel native to that platform.`;

export async function generateCaptionsFromImageUrl(
  imageUrl: string,
  platforms: string[]
): Promise<{ platform: string; content: string }[]> {
  const client = getClient();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: [
      {
        type: "text",
        text: CAPTION_SYSTEM,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "url",
              url: imageUrl,
            },
          },
          {
            type: "text",
            text: `Generate captions for this image optimized for: ${platforms.join(", ")}`,
          },
        ],
      },
    ],
  });

  const block = response.content.find((b) => b.type === "text");
  const text = block && block.type === "text" ? block.text : "{}";
  try {
    const parsed = JSON.parse(text) as { captions?: unknown };
    const captions = parsed.captions;
    if (
      Array.isArray(captions) &&
      captions.every(
        (c) =>
          typeof c === "object" &&
          c !== null &&
          typeof (c as Record<string, unknown>).platform === "string" &&
          typeof (c as Record<string, unknown>).content === "string"
      )
    ) {
      return captions as { platform: string; content: string }[];
    }
  } catch {
    // fall through
  }
  return [];
}

export async function suggestHashtags(
  content: string,
  platforms: string[]
): Promise<string[]> {
  const client = getClient();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 512,
    system: [
      {
        type: "text",
        text: HASHTAG_SYSTEM,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `Content: ${content}\nPlatforms: ${platforms.join(", ")}\n\nSuggest relevant hashtags.`,
      },
    ],
  });

  const block = response.content.find((b) => b.type === "text");
  const text = block && block.type === "text" ? block.text : "{}";
  try {
    const parsed = JSON.parse(text) as { hashtags?: unknown };
    const hashtags = parsed.hashtags;
    if (Array.isArray(hashtags) && hashtags.every((h) => typeof h === "string")) {
      return hashtags as string[];
    }
  } catch {
    // fall through
  }
  return [];
}

export interface ContentCalendarSuggestion {
  platform: string;
  contentType: string;
  draft: string;
  reasoning: string;
}

export interface ContentCalendarDay {
  date: string;
  suggestions: ContentCalendarSuggestion[];
}

export interface ContentCalendarOptions {
  startDate: string;
  endDate: string;
  postsPerWeek: number;
  platforms: string[];
  tone?: string;
  brandContext?: string;
  bestTimesContext?: string;
}

const CONTENT_CALENDAR_SYSTEM = `You are a social media content strategist. Generate a structured content calendar plan for the requested date range.
Always respond with valid JSON in this exact format:
{"days": [{"date": "YYYY-MM-DD", "suggestions": [{"platform": "PLATFORM_NAME", "contentType": "TEXT|IMAGE|VIDEO", "draft": "draft content text", "reasoning": "why this content for this day/platform"}]}]}
Guidelines:
- Spread posts evenly across the date range based on postsPerWeek
- Vary platforms across days to keep the schedule balanced
- Vary content types (TEXT, IMAGE, VIDEO) to keep the feed diverse
- Draft content should be ready-to-post, engaging, and platform-appropriate
- Keep drafts concise and within platform character limits
- Reasoning should be 1-2 sentences explaining the strategic rationale
- Only include days that have suggestions (skip days with no posts)
- Total suggestions across all days should approximately match postsPerWeek * number_of_weeks`;

export async function generateContentCalendar(
  options: ContentCalendarOptions
): Promise<ContentCalendarDay[]> {
  const client = getClient();

  const contextParts = [
    `Date range: ${options.startDate} to ${options.endDate}`,
    `Posts per week: ${options.postsPerWeek}`,
    `Target platforms: ${options.platforms.join(", ")}`,
    options.tone ? `Tone: ${options.tone}` : null,
    options.brandContext ? `Brand context: ${options.brandContext}` : null,
    options.bestTimesContext ? `Best posting times insight: ${options.bestTimesContext}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: [
      {
        type: "text",
        text: CONTENT_CALENDAR_SYSTEM,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `Generate a content calendar plan:\n${contextParts}`,
      },
    ],
  });

  const block = response.content.find((b) => b.type === "text");
  const text = block && block.type === "text" ? block.text : "{}";
  try {
    const parsed = JSON.parse(text) as { days?: unknown };
    const days = parsed.days;
    if (
      Array.isArray(days) &&
      days.every(
        (d) =>
          typeof d === "object" &&
          d !== null &&
          typeof (d as Record<string, unknown>).date === "string" &&
          Array.isArray((d as Record<string, unknown>).suggestions)
      )
    ) {
      return days as ContentCalendarDay[];
    }
  } catch {
    // fall through
  }
  return [];
}
