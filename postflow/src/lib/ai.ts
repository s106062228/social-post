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

export interface PlatformPrediction {
  platform: string;
  predictedEngagement: "HIGH" | "MEDIUM" | "LOW";
  confidence: number;
  reasoning: string;
  suggestedImprovements: string[];
}

const PREDICT_PERFORMANCE_SYSTEM = `You are a social media analytics expert. Analyze post content and historical performance data to predict engagement levels.
Always respond with valid JSON in this exact format:
{"predictions": [{"platform": "PLATFORM_NAME", "predictedEngagement": "HIGH|MEDIUM|LOW", "confidence": 0.0-1.0, "reasoning": "brief explanation", "suggestedImprovements": ["improvement1", "improvement2"]}]}
Guidelines:
- predictedEngagement: HIGH = top 25% of posts, MEDIUM = average, LOW = below average
- confidence: 0.0 = no basis, 1.0 = very confident; typical range 0.4–0.8 due to inherent uncertainty
- reasoning: 1–2 sentences based on content quality, length, hooks, hashtags, platform fit
- suggestedImprovements: 0–2 specific, actionable suggestions; empty array if content is already strong
- Base predictions on the content itself and any provided historical context
- Only include the platforms requested`;

export async function predictPostPerformance(
  content: string,
  platforms: string[],
  historicalSummary: string
): Promise<PlatformPrediction[]> {
  const client = getClient();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: [
      {
        type: "text",
        text: PREDICT_PERFORMANCE_SYSTEM,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `Post content:\n${content}\n\nTarget platforms: ${platforms.join(", ")}\n\n${historicalSummary ? `Historical performance context:\n${historicalSummary}` : "No historical data available — base prediction on content quality alone."}\n\nPredict engagement for each platform.`,
      },
    ],
  });

  const block = response.content.find((b) => b.type === "text");
  const text = block && block.type === "text" ? block.text : "{}";
  try {
    const parsed = JSON.parse(text) as { predictions?: unknown };
    const predictions = parsed.predictions;
    if (
      Array.isArray(predictions) &&
      predictions.every(
        (p) =>
          typeof p === "object" &&
          p !== null &&
          typeof (p as Record<string, unknown>).platform === "string" &&
          ["HIGH", "MEDIUM", "LOW"].includes((p as Record<string, unknown>).predictedEngagement as string) &&
          typeof (p as Record<string, unknown>).confidence === "number" &&
          typeof (p as Record<string, unknown>).reasoning === "string" &&
          Array.isArray((p as Record<string, unknown>).suggestedImprovements)
      )
    ) {
      return predictions as PlatformPrediction[];
    }
  } catch {
    // fall through
  }
  return [];
}

const INSPIRE_SYSTEM = `You are a social media content writer. Given a URL title, description, and optional notes, create an engaging social media post inspired by that content.
Always respond with valid JSON in this exact format: {"content": "the post content here"}
The post should be original, engaging, and ready to publish. Do not copy the source text verbatim — write fresh content inspired by it.`;

/**
 * Generate a social media post inspired by a saved URL/inspiration item.
 */
export interface ContentBrief {
  title: string;
  keyMessages: string[];
  tone: string;
  contentStructure: string[];
  hashtagSuggestions: string[];
  callToAction: string;
  estimatedLength: string;
}

const CONTENT_BRIEF_SYSTEM = `You are a social media content strategist. Generate a structured content brief for a social media post based on the given topic, target audience, goals, and platforms.
Always respond with valid JSON in this exact format:
{"title": "catchy title for the content", "keyMessages": ["message 1", "message 2", "message 3"], "tone": "recommended tone", "contentStructure": ["section 1", "section 2", "section 3"], "hashtagSuggestions": ["#tag1", "#tag2", "#tag3"], "callToAction": "what action you want the audience to take", "estimatedLength": "e.g. 150-200 words or 280 characters"}
Guidelines:
- title: A clear, compelling title or hook for the content
- keyMessages: 3–5 core points to convey; concise bullet-point style
- tone: One or two adjectives that describe the recommended writing style
- contentStructure: 3–5 steps or sections outlining how to write the post (e.g. "Open with a question", "Present the problem", "Share the solution")
- hashtagSuggestions: 5–8 relevant hashtags always starting with #
- callToAction: A specific, actionable CTA (e.g. "Click the link in bio to learn more")
- estimatedLength: Platform-appropriate length estimate based on platforms requested`;

export async function generateContentBrief(
  topic: string,
  audience: string,
  goals: string,
  platforms: string[]
): Promise<ContentBrief | null> {
  const client = getClient();

  const contextParts = [
    `Topic: ${topic}`,
    audience ? `Target audience: ${audience}` : null,
    goals ? `Goals: ${goals}` : null,
    `Platforms: ${platforms.join(", ")}`,
  ]
    .filter(Boolean)
    .join("\n");

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: [
      {
        type: "text",
        text: CONTENT_BRIEF_SYSTEM,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `Generate a content brief:\n${contextParts}`,
      },
    ],
  });

  const block = response.content.find((b) => b.type === "text");
  const text = block && block.type === "text" ? block.text : "{}";
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (
      typeof parsed.title === "string" &&
      Array.isArray(parsed.keyMessages) &&
      parsed.keyMessages.every((m) => typeof m === "string") &&
      typeof parsed.tone === "string" &&
      Array.isArray(parsed.contentStructure) &&
      parsed.contentStructure.every((s) => typeof s === "string") &&
      Array.isArray(parsed.hashtagSuggestions) &&
      parsed.hashtagSuggestions.every((h) => typeof h === "string") &&
      typeof parsed.callToAction === "string" &&
      typeof parsed.estimatedLength === "string"
    ) {
      return parsed as unknown as ContentBrief;
    }
  } catch {
    // fall through
  }
  return null;
}

const ALT_TEXT_SYSTEM = `You are an accessibility expert who writes descriptive alt text for images used on social media.
Generate a single concise, descriptive alt text for the provided image. The alt text should:
- Describe the visual content accurately and objectively
- Be meaningful to a screen reader user who cannot see the image
- Be under 125 words (ideally 1–2 sentences)
- Not start with "Image of" or "Photo of" (screen readers already announce "image")
- Include relevant details like colors, actions, expressions, setting, and any text visible in the image
Always respond with valid JSON in this exact format: {"altText": "the descriptive alt text here"}`;

export async function generateImageAltText(
  imageUrl: string,
  context?: string
): Promise<string> {
  const client = getClient();
  const userMessage = context
    ? `Generate alt text for this image. Context: ${context}`
    : "Generate descriptive alt text for this image.";

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 256,
    system: [
      {
        type: "text",
        text: ALT_TEXT_SYSTEM,
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
            text: userMessage,
          },
        ],
      },
    ],
  });

  const block = response.content.find((b) => b.type === "text");
  const text = block && block.type === "text" ? block.text : "{}";
  try {
    const parsed = JSON.parse(text) as { altText?: unknown };
    if (typeof parsed.altText === "string" && parsed.altText.length > 0) {
      return parsed.altText;
    }
  } catch {
    // fall through
  }
  return "";
}

export async function generateInspiredContent(
  title: string,
  description: string,
  notes: string,
  platforms: string[]
): Promise<string> {
  const client = getClient();
  const contextParts = [
    `Title: ${title}`,
    description ? `Description: ${description}` : null,
    notes ? `Notes: ${notes}` : null,
    platforms.length > 0 ? `Target platforms: ${platforms.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: [
      {
        type: "text",
        text: INSPIRE_SYSTEM,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `Create a social media post inspired by:\n${contextParts}`,
      },
    ],
  });

  const block = response.content.find((b) => b.type === "text");
  const text = block && block.type === "text" ? block.text : "{}";
  try {
    const parsed = JSON.parse(text) as { content?: unknown };
    if (typeof parsed.content === "string" && parsed.content.length > 0) {
      return parsed.content;
    }
  } catch {
    // fall through
  }
  return title;
}
