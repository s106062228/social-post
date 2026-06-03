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

export interface AiPersonaContext {
  name: string;
  writingStyle: string;
  tone: string;
  audienceDescription?: string | null;
  exampleContent?: string | null;
}

export async function generateContentVariants(
  topic: string,
  tone: string,
  platforms: string[],
  persona?: AiPersonaContext | null
): Promise<string[]> {
  const client = getClient();
  let userContent = `Topic: ${topic}\nTone: ${tone}\nPlatforms: ${platforms.join(", ")}`;
  if (persona) {
    userContent += `\n\nWriting Persona: ${persona.name}`;
    userContent += `\nWriting Style: ${persona.writingStyle}`;
    if (persona.audienceDescription) {
      userContent += `\nTarget Audience: ${persona.audienceDescription}`;
    }
    if (persona.exampleContent) {
      userContent += `\nExample Content Style:\n${persona.exampleContent}`;
    }
    userContent += `\n\nGenerate 3 post content variants that match this persona's voice and style.`;
  } else {
    userContent += `\n\nGenerate 3 post content variants.`;
  }
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
        content: userContent,
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

// ── Media tag generation ───────────────────────────────────────────────────────

const MEDIA_TAGS_SYSTEM = `You are an expert image tagging assistant. Analyze images and return up to 10 concise, descriptive single-word or short-phrase tags that best describe the image content, subjects, style, mood, and context.
Always respond with valid JSON in this exact format: {"tags": ["tag1", "tag2", "tag3"]}
Tags should be lowercase, specific, and useful for searching.`;

export async function generateMediaTags(imageUrl: string): Promise<string[]> {
  const client = getClient();

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 256,
    system: [
      {
        type: "text",
        text: MEDIA_TAGS_SYSTEM,
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
            text: "Generate up to 10 descriptive tags for this image.",
          },
        ],
      },
    ],
  });

  const block = response.content.find((b) => b.type === "text");
  const text = block && block.type === "text" ? block.text : "{}";
  try {
    const parsed = JSON.parse(text) as { tags?: unknown };
    if (
      Array.isArray(parsed.tags) &&
      parsed.tags.every((t) => typeof t === "string")
    ) {
      return (parsed.tags as string[]).slice(0, 10);
    }
  } catch {
    // fall through
  }
  return [];
}

// ── Content Moderation ─────────────────────────────────────────────────────────

export interface ModerationIssue {
  type: string;
  severity: "low" | "medium" | "high";
  description: string;
}

export interface ModerationResult {
  safe: boolean;
  issues: ModerationIssue[];
  score: number;
  reason?: string;
}

const MODERATION_SYSTEM = `You are a social media content moderation assistant. Analyze post content for policy violations, spam, toxicity, misinformation, and quality issues.

Always respond with valid JSON in this exact format:
{
  "safe": true/false,
  "score": 0-100,
  "issues": [
    {
      "type": "spam|toxicity|misinformation|offensive|low_quality|policy_violation",
      "severity": "low|medium|high",
      "description": "brief explanation"
    }
  ],
  "reason": "brief overall assessment (omit if safe)"
}

score 100 = perfectly safe, score 0 = completely unsafe. Only include issues array when problems exist.`;

export async function moderateContent(
  content: string
): Promise<ModerationResult> {
  const client = getClient();

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 512,
    system: [
      {
        type: "text",
        text: MODERATION_SYSTEM,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `Moderate this social media post content:\n\n${content}`,
      },
    ],
  });

  const block = response.content.find((b) => b.type === "text");
  const text = block && block.type === "text" ? block.text : "{}";
  try {
    const parsed = JSON.parse(text) as {
      safe?: unknown;
      score?: unknown;
      issues?: unknown;
      reason?: unknown;
    };
    const safe = typeof parsed.safe === "boolean" ? parsed.safe : true;
    const score =
      typeof parsed.score === "number"
        ? Math.max(0, Math.min(100, parsed.score))
        : 100;
    const issues: ModerationIssue[] = [];
    if (Array.isArray(parsed.issues)) {
      for (const issue of parsed.issues) {
        if (
          issue &&
          typeof issue.type === "string" &&
          typeof issue.severity === "string" &&
          typeof issue.description === "string"
        ) {
          issues.push({
            type: issue.type,
            severity: issue.severity as ModerationIssue["severity"],
            description: issue.description,
          });
        }
      }
    }
    const reason =
      typeof parsed.reason === "string" ? parsed.reason : undefined;
    return { safe, score, issues, reason };
  } catch {
    // fall through to safe default
  }
  return { safe: true, score: 100, issues: [] };
}

// ── Grammar Check ──────────────────────────────────────────────────────────────

export interface GrammarSuggestion {
  original: string;
  replacement: string;
  explanation: string;
}

export interface GrammarCheckResult {
  correctedContent: string;
  suggestions: GrammarSuggestion[];
  issueCount: number;
}

const GRAMMAR_SYSTEM = `You are a professional editor specializing in social media content. Check the provided post content for spelling mistakes, grammatical errors, and awkward phrasing.
Always respond with valid JSON in this exact format:
{"correctedContent": "full corrected text", "suggestions": [{"original": "original phrase", "replacement": "corrected phrase", "explanation": "brief reason"}]}
Rules:
- correctedContent must be the full content with ALL corrections applied
- suggestions lists individual changes (not more than 10)
- If the content is already correct, return suggestions as an empty array and correctedContent as the original
- Preserve all hashtags, mentions, URLs, and emojis exactly as-is
- Do not change meaning or tone; only fix errors`;

export async function checkGrammar(
  content: string
): Promise<GrammarCheckResult> {
  const client = getClient();

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: [
      {
        type: "text",
        text: GRAMMAR_SYSTEM,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `Check grammar and spelling in this social media post:\n\n${content}`,
      },
    ],
  });

  const block = response.content.find((b) => b.type === "text");
  const text = block && block.type === "text" ? block.text : "{}";
  try {
    const parsed = JSON.parse(text) as {
      correctedContent?: unknown;
      suggestions?: unknown;
    };
    const correctedContent =
      typeof parsed.correctedContent === "string"
        ? parsed.correctedContent
        : content;
    const suggestions: GrammarSuggestion[] = [];
    if (Array.isArray(parsed.suggestions)) {
      for (const s of parsed.suggestions) {
        if (
          s &&
          typeof s.original === "string" &&
          typeof s.replacement === "string" &&
          typeof s.explanation === "string"
        ) {
          suggestions.push({
            original: s.original,
            replacement: s.replacement,
            explanation: s.explanation,
          });
        }
      }
    }
    return { correctedContent, suggestions, issueCount: suggestions.length };
  } catch {
    // fall through
  }
  return { correctedContent: content, suggestions: [], issueCount: 0 };
}

export interface HashtagResearchResult {
  tag: string;
  category: "niche" | "medium" | "popular";
  estimatedReach: "low" | "medium" | "high";
  relevanceScore: number;
}

const RESEARCH_HASHTAGS_SYSTEM = `You are a social media hashtag research expert. Research and suggest relevant hashtags for a given topic and platforms.
Always respond with valid JSON in this exact format: {"hashtags": [{"tag": "#hashtag", "category": "popular|medium|niche", "estimatedReach": "high|medium|low", "relevanceScore": 0.95}]}
Categories: popular = >1M posts, medium = 100K–1M posts, niche = <100K posts.
Reach: high = broad audience, medium = moderate, low = targeted.
relevanceScore: 0.0–1.0 measuring how relevant the hashtag is to the topic.
Always include the # prefix. Return exactly the requested count of hashtags. Mix categories for a balanced strategy.`;

export async function researchHashtags(
  topic: string,
  platforms: string[],
  count: number = 20
): Promise<HashtagResearchResult[]> {
  const client = getClient();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: [
      {
        type: "text",
        text: RESEARCH_HASHTAGS_SYSTEM,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `Topic: ${topic}\nPlatforms: ${platforms.join(", ")}\nRequested count: ${count}\n\nResearch and suggest ${count} relevant hashtags for this topic.`,
      },
    ],
  });

  const block = response.content.find((b) => b.type === "text");
  const text = block && block.type === "text" ? block.text : "{}";
  try {
    const parsed = JSON.parse(text) as { hashtags?: unknown };
    const hashtags = parsed.hashtags;
    if (
      Array.isArray(hashtags) &&
      hashtags.every(
        (h) =>
          typeof h === "object" &&
          h !== null &&
          typeof (h as Record<string, unknown>).tag === "string" &&
          ["niche", "medium", "popular"].includes(
            (h as Record<string, unknown>).category as string
          ) &&
          ["low", "medium", "high"].includes(
            (h as Record<string, unknown>).estimatedReach as string
          ) &&
          typeof (h as Record<string, unknown>).relevanceScore === "number"
      )
    ) {
      return hashtags as HashtagResearchResult[];
    }
  } catch {
    // fall through
  }
  return [];
}

// ─── Content Gap Analysis ──────────────────────────────────────────────────

const CONTENT_GAPS_SYSTEM = `You are a social media content strategist. Analyze the topics a user has already covered and suggest underexplored content areas that would complement their existing strategy.
Always respond with valid JSON in this exact format:
{"suggestions": [{"topic": "Topic Name", "reason": "Why this fills a gap", "priority": "high|medium|low", "contentIdea": "A specific post idea for this topic"}]}
Provide 5 suggestions. Prioritize gaps that would generate high engagement and align with the user's existing content style.`;

export interface ContentGapSuggestion {
  topic: string;
  reason: string;
  priority: "high" | "medium" | "low";
  contentIdea: string;
}

export async function suggestContentGaps(
  coveredTopics: string[],
  platforms: string[],
  brandKitContext?: string
): Promise<ContentGapSuggestion[]> {
  const client = getClient();
  let userContent = `Covered topics (${coveredTopics.length} total): ${coveredTopics.slice(0, 30).join(", ") || "none yet"}\n`;
  userContent += `Target platforms: ${platforms.join(", ") || "general"}\n`;
  if (brandKitContext) {
    userContent += `Brand context: ${brandKitContext}\n`;
  }
  userContent += `\nSuggest 5 content topics this creator hasn't covered yet that would complement their strategy.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: [
      {
        type: "text",
        text: CONTENT_GAPS_SYSTEM,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userContent }],
  });

  const block = response.content.find((b) => b.type === "text");
  const text = block && block.type === "text" ? block.text : "{}";
  try {
    const parsed = JSON.parse(text) as { suggestions?: unknown };
    const suggestions = parsed.suggestions;
    if (
      Array.isArray(suggestions) &&
      suggestions.every(
        (s) =>
          typeof s === "object" &&
          s !== null &&
          typeof (s as Record<string, unknown>).topic === "string" &&
          typeof (s as Record<string, unknown>).reason === "string" &&
          ["high", "medium", "low"].includes(
            (s as Record<string, unknown>).priority as string
          ) &&
          typeof (s as Record<string, unknown>).contentIdea === "string"
      )
    ) {
      return suggestions as ContentGapSuggestion[];
    }
  } catch {
    // fall through
  }
  return [];
}

// ── Tone Analysis ─────────────────────────────────────────────────────────────

export type ToneType =
  | "professional"
  | "casual"
  | "humorous"
  | "inspirational"
  | "educational"
  | "urgent"
  | "friendly"
  | "authoritative";

export interface ToneResult {
  tone: ToneType;
  confidence: number;
  traits: string[];
}

const TONE_SYSTEM = `You are a social media content tone analyzer.
Classify the tone of the given post content as one of: professional, casual, humorous, inspirational, educational, urgent, friendly, authoritative.
Also provide a confidence score from 0.0 to 1.0 and up to 4 key tone traits (short descriptive words or phrases).
Always respond with valid JSON in this exact format:
{"tone": "professional", "confidence": 0.88, "traits": ["formal", "data-driven", "concise"]}
Tone definitions:
- professional: formal, business-oriented, polished
- casual: relaxed, conversational, informal, everyday language
- humorous: funny, playful, witty, light-hearted
- inspirational: uplifting, motivational, encouraging
- educational: informative, teaches something, explains concepts
- urgent: calls to immediate action, time-sensitive
- friendly: warm, approachable, personal, relationship-building
- authoritative: expert, commanding, decisive`;

export async function analyzeTone(content: string): Promise<ToneResult> {
  const client = getClient();

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 256,
    system: [
      {
        type: "text",
        text: TONE_SYSTEM,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `Analyze the tone of this social media post:\n\n${content}`,
      },
    ],
  });

  const block = response.content.find((b) => b.type === "text");
  const text = block && block.type === "text" ? block.text : "{}";

  const validTones: ToneType[] = [
    "professional",
    "casual",
    "humorous",
    "inspirational",
    "educational",
    "urgent",
    "friendly",
    "authoritative",
  ];

  try {
    const parsed = JSON.parse(text) as {
      tone?: unknown;
      confidence?: unknown;
      traits?: unknown;
    };
    const tone = parsed.tone;
    const confidence = parsed.confidence;
    const traits = parsed.traits;

    if (
      typeof tone === "string" &&
      (validTones as string[]).includes(tone) &&
      typeof confidence === "number" &&
      confidence >= 0 &&
      confidence <= 1 &&
      Array.isArray(traits) &&
      traits.every((t) => typeof t === "string")
    ) {
      return {
        tone: tone as ToneType,
        confidence,
        traits: traits.slice(0, 4) as string[],
      };
    }
  } catch {
    // fall through to default
  }

  return { tone: "professional", confidence: 0.5, traits: [] };
}

// ── Auto-Tag Suggestions ──────────────────────────────────────────────────────

export interface TagSuggestion {
  tagId?: string;
  name: string;
  reason: string;
  isNew: boolean;
}

const AUTO_TAG_SYSTEM = `You are a social media content tagger. Analyze post content and suggest the most relevant tags.
Given a list of existing tags, match the content to those tags. If no existing tags match well, suggest new concise tag names.
Always respond with valid JSON in this exact format:
{"suggestions": [{"tagId": "id_or_null", "name": "tag name", "reason": "brief reason", "isNew": false}]}
Return up to 5 suggestions. Prefer existing tags over creating new ones. New tag names must be short (1-3 words).`;

export async function suggestTagsForContent(
  content: string,
  existingTags: { id: string; name: string }[]
): Promise<TagSuggestion[]> {
  if (!process.env.ANTHROPIC_API_KEY) return [];

  const client = getClient();
  const tagList =
    existingTags.length > 0
      ? existingTags.map((t) => `${t.id}: ${t.name}`).join("\n")
      : "No existing tags.";

  const prompt = `Post content:\n${content.slice(0, 1000)}\n\nExisting tags (id: name):\n${tagList}\n\nSuggest up to 5 relevant tags for this post. For existing tag matches, use the exact id and name. For new tags, set isNew to true and tagId to null.`;

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 512,
      system: [
        {
          type: "text",
          text: AUTO_TAG_SYSTEM,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: prompt }],
    });

    const text =
      response.content[0]?.type === "text" ? response.content[0].text : "";
    const parsed = JSON.parse(text) as { suggestions?: unknown };
    const suggestions = parsed?.suggestions;
    if (!Array.isArray(suggestions)) return [];

    return suggestions
      .filter(
        (s): s is TagSuggestion =>
          typeof s === "object" &&
          s !== null &&
          typeof (s as Record<string, unknown>).name === "string" &&
          typeof (s as Record<string, unknown>).reason === "string" &&
          typeof (s as Record<string, unknown>).isNew === "boolean"
      )
      .slice(0, 5)
      .map((s) => ({
        tagId: s.isNew ? undefined : (s.tagId ?? undefined),
        name: s.name,
        reason: s.reason,
        isNew: s.isNew,
      }));
  } catch {
    return [];
  }
}

// ── Performance Coaching ──────────────────────────────────────────────────────

export interface PerformanceCoachingResult {
  summary: string;
  highlights: string[];
  improvements: string[];
  nextWeekFocus: string;
  overallScore: number;
}

export interface CoachingMetrics {
  postsPublished: number;
  avgEngagementScore: number;
  topPost: { content: string; score: number } | null;
  bottomPost: { content: string; score: number } | null;
}

export interface CoachingGoal {
  name: string;
  period: string;
  targetCount: number;
  publishedCount: number;
  onTrack: boolean;
}

const COACHING_SYSTEM = `You are a social media performance coach. Analyze a user's weekly posting metrics and goals to provide actionable coaching insights.
Always respond with valid JSON in this exact format:
{"summary": "brief overall assessment", "highlights": ["positive1", "positive2"], "improvements": ["improvement1", "improvement2"], "nextWeekFocus": "one specific focus for next week", "overallScore": 75}
The overallScore should be 0-100. Highlights and improvements should each have 2-4 items. Be specific, actionable, and encouraging.`;

export async function generatePerformanceCoaching(
  metrics: CoachingMetrics,
  goals: CoachingGoal[],
  recentInsights: { platform: string; likes: number; comments: number; shares: number; reach: number }[]
): Promise<PerformanceCoachingResult | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;

  const client = getClient();

  const goalsText =
    goals.length > 0
      ? goals
          .map(
            (g) =>
              `- ${g.name} (${g.period}): ${g.publishedCount}/${g.targetCount} — ${g.onTrack ? "on track" : "behind"}`
          )
          .join("\n")
      : "No active goals.";

  const insightsSummary =
    recentInsights.length > 0
      ? recentInsights
          .map(
            (i) =>
              `${i.platform}: likes=${i.likes} comments=${i.comments} shares=${i.shares} reach=${i.reach}`
          )
          .join("\n")
      : "No engagement data available.";

  const prompt = `Weekly performance summary:
- Posts published this week: ${metrics.postsPublished}
- Average engagement score: ${metrics.avgEngagementScore.toFixed(1)}
- Best post: ${metrics.topPost ? `"${metrics.topPost.content.slice(0, 100)}" (score: ${metrics.topPost.score})` : "none"}
- Worst post: ${metrics.bottomPost ? `"${metrics.bottomPost.content.slice(0, 100)}" (score: ${metrics.bottomPost.score})` : "none"}

Active goals:
${goalsText}

Recent platform engagement:
${insightsSummary}

Provide personalized coaching insights for this week's performance.`;

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 600,
      system: [
        {
          type: "text",
          text: COACHING_SYSTEM,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: prompt }],
    });

    const text =
      response.content[0]?.type === "text" ? response.content[0].text : "";
    const parsed = JSON.parse(text) as Partial<PerformanceCoachingResult>;

    return {
      summary: typeof parsed.summary === "string" ? parsed.summary : "Performance review complete.",
      highlights: Array.isArray(parsed.highlights) ? parsed.highlights.slice(0, 4) : [],
      improvements: Array.isArray(parsed.improvements) ? parsed.improvements.slice(0, 4) : [],
      nextWeekFocus: typeof parsed.nextWeekFocus === "string" ? parsed.nextWeekFocus : "Continue posting consistently.",
      overallScore:
        typeof parsed.overallScore === "number"
          ? Math.max(0, Math.min(100, Math.round(parsed.overallScore)))
          : 50,
    };
  } catch {
    return null;
  }
}

const REPLY_SYSTEM = `You are a social media community manager. Generate 3 thoughtful, engaging reply suggestions for a comment on a social media post.
Always respond with valid JSON in this exact format: {"replies": ["reply1", "reply2", "reply3"]}
Keep replies concise (under 150 chars each), friendly, and authentic. Match the tone of the original post content. Never be defensive or negative.`;

export async function generateReplySuggestions(
  postContent: string,
  comment: string,
  tone?: string
): Promise<string[]> {
  const client = getClient();
  const userContent = `Post content: ${postContent}\n\nComment to reply to: ${comment}${tone ? `\n\nTone: ${tone}` : ""}`;
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 512,
    system: [
      { type: "text", text: REPLY_SYSTEM, cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: userContent }],
  });
  const block = response.content.find((b) => b.type === "text");
  const text = block && block.type === "text" ? block.text : "{}";
  try {
    const parsed = JSON.parse(text) as { replies?: unknown };
    const replies = parsed.replies;
    if (Array.isArray(replies) && replies.every((r) => typeof r === "string")) {
      return replies as string[];
    }
  } catch { /* fall through */ }
  return [];
}

export interface ContentRefreshSuggestion {
  type: "hashtag_update" | "stat_refresh" | "tone_modernize" | "add_cta" | "platform_optimize";
  original?: string;
  updated: string;
  reason: string;
}

export interface ContentRefreshResult {
  suggestions: ContentRefreshSuggestion[];
  refreshedContent: string;
}

const REFRESH_SYSTEM = `You are a social media content strategist. Your job is to refresh older social media posts to make them current and engaging again.
Analyze the original post content and suggest specific improvements. Always respond with valid JSON in this exact format:
{"suggestions": [{"type": "hashtag_update|stat_refresh|tone_modernize|add_cta|platform_optimize", "original": "old text if replacing specific part", "updated": "new or replacement text", "reason": "why this improves the post"}], "refreshedContent": "the complete refreshed post content"}
Provide 2-4 actionable suggestions. Types:
- hashtag_update: update or add relevant hashtags
- stat_refresh: update statistics or numbers that may be outdated
- tone_modernize: modernize the language and tone
- add_cta: add or improve a call-to-action
- platform_optimize: optimize for the target platform's current best practices
Keep refreshedContent under platform character limits when specified.`;

export async function suggestContentRefresh(
  originalContent: string,
  originalDate: string,
  platforms: string[]
): Promise<ContentRefreshResult> {
  const client = getClient();
  const userContent = `Original post content:\n${originalContent}\n\nOriginal publish date: ${originalDate}\n\nTarget platforms: ${platforms.join(", ")}\n\nSuggest how to refresh this content to make it more current and engaging.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: [
      { type: "text", text: REFRESH_SYSTEM, cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: userContent }],
  });

  const block = response.content.find((b) => b.type === "text");
  const text = block && block.type === "text" ? block.text : "{}";
  try {
    const parsed = JSON.parse(text) as { suggestions?: unknown; refreshedContent?: unknown };
    const suggestions = parsed.suggestions;
    const refreshedContent = parsed.refreshedContent;
    if (
      Array.isArray(suggestions) &&
      suggestions.every(
        (s) =>
          typeof s === "object" &&
          s !== null &&
          typeof (s as Record<string, unknown>).type === "string" &&
          typeof (s as Record<string, unknown>).updated === "string" &&
          typeof (s as Record<string, unknown>).reason === "string"
      ) &&
      typeof refreshedContent === "string"
    ) {
      return {
        suggestions: suggestions as ContentRefreshSuggestion[],
        refreshedContent,
      };
    }
  } catch {
    // fall through
  }
  return { suggestions: [], refreshedContent: originalContent };
}

const HEADLINE_SYSTEM = `You are a professional copywriter and headline expert. Generate compelling headlines/titles for social media posts and long-form content.
Always respond with valid JSON in this exact format: {"headlines": ["headline1", "headline2", "headline3", "headline4", "headline5"]}
Generate exactly the requested number of headlines. Each headline should be distinct, compelling, and appropriate for the specified platforms. Keep headlines concise, engaging, and action-oriented when suitable.`;

export async function generateHeadlines(
  content: string,
  platforms: string[],
  count: number = 5
): Promise<string[]> {
  const client = getClient();
  const userContent = `Post content:\n${content}\n\nTarget platforms: ${platforms.join(", ")}\n\nGenerate ${count} compelling headline/title options for this content.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 512,
    system: [
      { type: "text", text: HEADLINE_SYSTEM, cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: userContent }],
  });

  const block = response.content.find((b) => b.type === "text");
  const text = block && block.type === "text" ? block.text : "{}";
  try {
    const parsed = JSON.parse(text) as { headlines?: unknown };
    const headlines = parsed.headlines;
    if (Array.isArray(headlines) && headlines.every((h) => typeof h === "string")) {
      return headlines as string[];
    }
  } catch {
    // fall through
  }
  return [];
}

const VIDEO_SCRIPT_SYSTEM = `You are an expert video content creator and scriptwriter specializing in social media videos. Generate structured video scripts optimized for the specified platforms and duration.
Always respond with valid JSON in this exact format: {"hook": "opening hook text", "body": "main body content", "callToAction": "CTA text", "captions": [{"platform": "PLATFORM_NAME", "content": "caption text"}], "estimatedDuration": 60}
Guidelines:
- hook: Attention-grabbing opening (first 3-5 seconds). Must be punchy and compelling.
- body: Main content, talking points, or visual descriptions. Adjust detail to match the duration.
- callToAction: Clear, specific CTA for the end of the video.
- captions: Per-platform post captions to accompany the video. Include only the platforms requested.
- estimatedDuration: Number of seconds the script would take to deliver (based on average speaking pace of ~130 words/min).
Platform caption guidelines:
- YOUTUBE (max 5000 chars): SEO-optimized description with timestamps if long, chapters, tags section
- TIKTOK (max 2200 chars): Short, trendy caption with viral hashtags
- INSTAGRAM (max 2200 chars): Engaging caption with call to action and hashtags
- FACEBOOK (max 63206 chars): Descriptive post with context and engagement question
- TWITTER (max 280 chars): Concise teaser with a link placeholder
- LINKEDIN (max 3000 chars): Professional context and key takeaways`;

export interface VideoScript {
  hook: string;
  body: string;
  callToAction: string;
  captions: { platform: string; content: string }[];
  estimatedDuration: number;
}

export async function generateVideoScript(
  topic: string,
  duration: number,
  platforms: string[],
  tone?: string
): Promise<VideoScript> {
  const client = getClient();
  const toneText = tone ? ` Tone: ${tone}.` : "";
  const userContent = `Video topic: ${topic}\nTarget duration: ${duration} seconds${toneText}\nPlatforms: ${platforms.join(", ")}\n\nGenerate a complete video script with hook, body, CTA, and per-platform captions.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: [
      {
        type: "text",
        text: VIDEO_SCRIPT_SYSTEM,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userContent }],
  });

  const block = response.content.find((b) => b.type === "text");
  const text = block && block.type === "text" ? block.text : "{}";
  try {
    const parsed = JSON.parse(text) as {
      hook?: unknown;
      body?: unknown;
      callToAction?: unknown;
      captions?: unknown;
      estimatedDuration?: unknown;
    };
    if (
      typeof parsed.hook === "string" &&
      typeof parsed.body === "string" &&
      typeof parsed.callToAction === "string" &&
      Array.isArray(parsed.captions) &&
      parsed.captions.every(
        (c) =>
          typeof c === "object" &&
          c !== null &&
          typeof (c as Record<string, unknown>).platform === "string" &&
          typeof (c as Record<string, unknown>).content === "string"
      ) &&
      typeof parsed.estimatedDuration === "number"
    ) {
      return {
        hook: parsed.hook,
        body: parsed.body,
        callToAction: parsed.callToAction,
        captions: parsed.captions as { platform: string; content: string }[],
        estimatedDuration: parsed.estimatedDuration,
      };
    }
  } catch {
    // fall through
  }
  return {
    hook: "",
    body: "",
    callToAction: "",
    captions: [],
    estimatedDuration: duration,
  };
}

const CHAT_SYSTEM = `You are PostFlow's AI content strategy assistant. You help social media managers with content strategy, post ideas, understanding analytics, scheduling optimization, and improving social media performance.
Be helpful, concise, and actionable. Give specific, practical advice. When the user asks for content ideas, generate examples. Keep responses focused and under 300 words unless more detail is requested.`;

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function chatWithAssistant(
  messages: ChatMessage[],
  contextSummary?: string | null
): Promise<string> {
  const client = getClient();

  const systemText = contextSummary
    ? `${CHAT_SYSTEM}\n\nUser account context:\n${contextSummary}`
    : CHAT_SYSTEM;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: [
      { type: "text", text: systemText, cache_control: { type: "ephemeral" } },
    ],
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });

  const block = response.content.find((b) => b.type === "text");
  return block && block.type === "text" ? block.text : "Sorry, I could not generate a response. Please try again.";
}
