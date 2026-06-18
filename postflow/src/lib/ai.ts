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

const PARSE_DATE_SYSTEM = `You are a datetime parser. Given a natural language time expression and a reference datetime, output the exact ISO 8601 datetime the user means.
Always respond with valid JSON in this exact format: {"datetime": "2024-01-15T14:00:00Z", "confidence": 0.95, "interpretation": "Next Monday at 2:00 PM UTC"}
- datetime: ISO 8601 format in UTC. Use the reference date to resolve relative expressions.
- confidence: number 0.0-1.0 (1.0 = unambiguous, 0.5 = best guess)
- interpretation: human-readable explanation of what you understood
If the input cannot be parsed as a future datetime, respond with: {"datetime": null, "confidence": 0, "interpretation": "Could not parse as a datetime"}
Do not include any text outside of the JSON object.`;

export interface ParsedDate {
  datetime: string;
  confidence: number;
  interpretation: string;
}

export async function parseNaturalLanguageDate(
  text: string,
  timezone: string,
  referenceDate: Date
): Promise<ParsedDate | null> {
  const client = getClient();
  const refIso = referenceDate.toISOString();
  const userContent = `Reference datetime (current time in UTC): ${refIso}\nUser timezone: ${timezone || "UTC"}\nParse this time expression: "${text}"`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 256,
    system: [
      {
        type: "text",
        text: PARSE_DATE_SYSTEM,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userContent }],
  });

  const block = response.content.find((b) => b.type === "text");
  const raw = block && block.type === "text" ? block.text.trim() : "";
  try {
    const parsed = JSON.parse(raw) as {
      datetime?: unknown;
      confidence?: unknown;
      interpretation?: unknown;
    };
    if (
      parsed.datetime === null ||
      (typeof parsed.datetime === "string" &&
        typeof parsed.confidence === "number" &&
        typeof parsed.interpretation === "string")
    ) {
      if (!parsed.datetime) return null;
      return {
        datetime: parsed.datetime as string,
        confidence: parsed.confidence as number,
        interpretation: parsed.interpretation as string,
      };
    }
  } catch {
    // fall through
  }
  return null;
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

const CONTENT_SERIES_SYSTEM = `You are a social media content strategist specializing in creating cohesive content series. When given a topic, create a multi-part series of interconnected posts that build on each other and tell a complete story or educational journey.

Always respond with valid JSON in this exact format:
{
  "seriesTitle": "Title for the entire series",
  "description": "Brief overview of what this series covers",
  "posts": [
    {
      "postNumber": 1,
      "title": "Short title for this post",
      "content": "The full post content ready to publish",
      "hookLine": "Opening line that grabs attention",
      "schedulingTip": "e.g. 'Kick off the series on Monday morning'",
      "keyTakeaway": "The main point readers should take away"
    }
  ]
}

Each post should:
- Stand alone as a complete post but reference the broader series context
- End with a teaser or CTA pointing to the next post where appropriate
- Be optimized for the specified platforms and character limits
- Match the requested tone
- Build progressively on the previous post's content`;

export interface ContentSeriesPost {
  postNumber: number;
  title: string;
  content: string;
  hookLine: string;
  schedulingTip: string;
  keyTakeaway: string;
}

export interface ContentSeriesResult {
  seriesTitle: string;
  description: string;
  posts: ContentSeriesPost[];
}

export async function generateContentSeries(
  topic: string,
  postCount: number,
  platforms: string[],
  tone?: string | null,
  seriesType?: string | null
): Promise<ContentSeriesResult> {
  const client = getClient();

  const userContent = `Create a ${postCount}-part content series about: "${topic}"
Platforms: ${platforms.join(", ")}
${tone ? `Tone: ${tone}` : ""}
${seriesType ? `Series type: ${seriesType}` : "Series type: educational/informational"}

Generate exactly ${postCount} posts that form a cohesive series.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: [
      {
        type: "text",
        text: CONTENT_SERIES_SYSTEM,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userContent }],
  });

  const block = response.content.find((b) => b.type === "text");
  const raw = block && block.type === "text" ? block.text.trim() : "";

  try {
    const parsed = JSON.parse(raw) as {
      seriesTitle?: unknown;
      description?: unknown;
      posts?: unknown[];
    };

    if (
      typeof parsed.seriesTitle === "string" &&
      typeof parsed.description === "string" &&
      Array.isArray(parsed.posts)
    ) {
      return {
        seriesTitle: parsed.seriesTitle,
        description: parsed.description,
        posts: parsed.posts
          .filter(
            (p): p is Record<string, unknown> =>
              p !== null && typeof p === "object"
          )
          .map((p, idx) => ({
            postNumber: typeof p.postNumber === "number" ? p.postNumber : idx + 1,
            title: typeof p.title === "string" ? p.title : `Post ${idx + 1}`,
            content: typeof p.content === "string" ? p.content : "",
            hookLine: typeof p.hookLine === "string" ? p.hookLine : "",
            schedulingTip:
              typeof p.schedulingTip === "string" ? p.schedulingTip : "",
            keyTakeaway:
              typeof p.keyTakeaway === "string" ? p.keyTakeaway : "",
          })),
      };
    }
  } catch {
    // fall through
  }

  return {
    seriesTitle: topic,
    description: `A ${postCount}-part series about ${topic}`,
    posts: [],
  };
}

// ── Phase 222: Social Bio Generator ──────────────────────────────────────────

export const PLATFORM_BIO_LIMITS: Record<string, number> = {
  FACEBOOK: 255,
  INSTAGRAM: 150,
  TWITTER: 160,
  THREADS: 150,
  LINKEDIN: 220,
  TIKTOK: 80,
  PINTEREST: 160,
  YOUTUBE: 500,
  REDDIT: 200,
  BLUESKY: 300,
  MASTODON: 500,
  TELEGRAM: 255,
  TUMBLR: 200,
  WORDPRESS: 200,
  MEDIUM: 160,
  GHOST: 300,
  DEVTO: 200,
  HASHNODE: 200,
  NOSTR: 200,
  PIXELFED: 500,
  VIMEO: 200,
  BEEHIIV: 200,
  GOOGLE_BUSINESS: 750,
};

export interface SocialBio {
  platform: string;
  bio: string;
  charCount: number;
  charLimit: number;
}

const BIO_SYSTEM = `You are a social media profile optimization expert. Generate engaging, platform-optimized bios/descriptions for social media profiles.
Always respond with valid JSON in this exact format: {"bios": [{"platform": "PLATFORM_NAME", "bio": "bio text here"}]}
Guidelines per platform:
- Twitter/X (160 chars): Short, punchy, personality-driven. Can use emojis. Show what makes you unique.
- Instagram (150 chars): Value-driven, use line breaks if helpful, 1-2 emojis max, clear CTA.
- LinkedIn (220 chars): Professional, achievement-focused, industry keywords.
- TikTok (80 chars): Ultra-brief, energetic, relatable. 1 emoji max.
- Facebook (255 chars): Conversational, community-focused, slightly longer.
- Threads (150 chars): Casual, authentic, conversation-starting.
- Pinterest (160 chars): Inspire-focused, keyword-rich for discovery.
- YouTube (500 chars): Channel description, what viewers will get, posting schedule hint.
- Bluesky (300 chars): Open, tech-friendly tone. Concise and genuine.
- Mastodon (500 chars): Community-focused, mention interests, use #hashtags.
- Other platforms: Adapt to platform culture, stay within the given limit.
Never exceed the stated character limits. Adjust bio length to fit within limits.`;

export async function generateSocialBios(
  name: string,
  description: string,
  platforms: string[],
  niche?: string | null,
  keywords?: string[] | null
): Promise<SocialBio[]> {
  const client = getClient();

  const platformLimits = platforms.map((p) => {
    const limit = PLATFORM_BIO_LIMITS[p.toUpperCase()] ?? 200;
    return `${p}: max ${limit} characters`;
  });

  const userContent = `Generate optimized social media bios for:
Name/Brand: ${name}
Description: ${description}
${niche ? `Niche/Industry: ${niche}` : ""}
${keywords && keywords.length > 0 ? `Key keywords: ${keywords.join(", ")}` : ""}

Platforms with character limits:
${platformLimits.join("\n")}

Generate a platform-optimized bio for each platform listed above. Stay strictly within the character limit for each.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: [
      {
        type: "text",
        text: BIO_SYSTEM,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userContent }],
  });

  const block = response.content.find((b) => b.type === "text");
  const raw = block && block.type === "text" ? block.text.trim() : "";

  try {
    const parsed = JSON.parse(raw) as { bios?: unknown[] };

    if (Array.isArray(parsed.bios)) {
      return parsed.bios
        .filter(
          (b): b is Record<string, unknown> =>
            b !== null && typeof b === "object"
        )
        .map((b) => {
          const platform =
            typeof b.platform === "string" ? b.platform.toUpperCase() : "";
          const limit = PLATFORM_BIO_LIMITS[platform] ?? 200;
          const bio =
            typeof b.bio === "string" ? b.bio.slice(0, limit) : "";
          return { platform, bio, charCount: bio.length, charLimit: limit };
        })
        .filter((b) => b.platform && b.bio);
    }
  } catch {
    // fall through
  }

  return [];
}

export interface BulkGeneratedContent {
  topic: string;
  content: string;
  charCount: number;
}

const BULK_GENERATE_SYSTEM = `You are a social media content writer. Generate unique, engaging post content for a list of topics.
Always respond with valid JSON in this exact format: {"results": [{"topic": "topic1", "content": "post content here"}, ...]}
Generate one unique post per topic. Make each post engaging, concise, and appropriate for the specified platforms and tone.
Use relevant hashtags naturally within the content. Keep posts under 500 characters unless the platform allows longer.`;

export async function bulkGenerateContent(
  topics: string[],
  platforms: string[],
  tone?: string | null
): Promise<BulkGeneratedContent[]> {
  const client = getClient();

  const userContent = `Generate social media posts for the following topics:
Platforms: ${platforms.join(", ")}
Tone: ${tone ?? "engaging and conversational"}

Topics (generate one post per topic):
${topics.map((t, i) => `${i + 1}. ${t}`).join("\n")}

Respond with JSON containing a "results" array with one object per topic in order.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: [
      {
        type: "text",
        text: BULK_GENERATE_SYSTEM,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userContent }],
  });

  const block = response.content.find((b) => b.type === "text");
  const raw = block && block.type === "text" ? block.text.trim() : "";

  try {
    const parsed = JSON.parse(raw) as { results?: unknown[] };

    if (Array.isArray(parsed.results)) {
      return parsed.results
        .filter(
          (r): r is Record<string, unknown> =>
            r !== null && typeof r === "object"
        )
        .map((r) => {
          const topic = typeof r.topic === "string" ? r.topic : "";
          const content = typeof r.content === "string" ? r.content : "";
          return { topic, content, charCount: content.length };
        })
        .filter((r) => r.topic && r.content);
    }
  } catch {
    // fall through
  }

  return [];
}

// ── Content Atomization ────────────────────────────────────────────────────

export interface AtomizedPost {
  content: string;
  keyTakeaway: string;
  suggestedPlatforms: string[];
}

export interface AtomizeResult {
  posts: AtomizedPost[];
  summary: string;
  sourceTitle?: string;
}

const ATOMIZE_SYSTEM = `You are a social media content strategist specializing in content atomization.
Your task is to break down long-form content (articles, blog posts, essays) into a series of concise, standalone social media posts that each deliver a single key insight or takeaway.
Always respond with valid JSON in this exact format:
{
  "sourceTitle": "extracted title or null",
  "summary": "1-2 sentence summary of the original content",
  "posts": [
    {
      "content": "ready-to-publish post content with hashtags",
      "keyTakeaway": "one sentence describing the core insight",
      "suggestedPlatforms": ["FACEBOOK", "INSTAGRAM"]
    }
  ]
}
Guidelines:
- Each post should be self-contained and deliver standalone value
- Include relevant hashtags naturally within or at the end of each post
- Vary the format: some posts as stats/facts, some as tips, some as quotes, some as questions
- Ensure posts are adapted for social media (conversational, engaging, concise)
- Suggest appropriate platforms based on content type (educational => LinkedIn, visual => Instagram, etc.)`;

export async function atomizeContent(
  longFormContent: string,
  platforms: string[],
  targetPostCount: number
): Promise<AtomizeResult> {
  const client = getClient();

  const userContent = `Break down the following long-form content into exactly ${targetPostCount} social media posts.
Target platforms: ${platforms.join(", ")}
Adapt content style appropriately for these platforms.

Long-form content to atomize:
---
${longFormContent}
---

Generate ${targetPostCount} posts. Respond with valid JSON only.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8192,
    system: [
      {
        type: "text",
        text: ATOMIZE_SYSTEM,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userContent }],
  });

  const block = response.content.find((b) => b.type === "text");
  const raw = block && block.type === "text" ? block.text.trim() : "";

  try {
    const parsed = JSON.parse(raw) as {
      sourceTitle?: string | null;
      summary?: string;
      posts?: unknown[];
    };

    const posts: AtomizedPost[] = Array.isArray(parsed.posts)
      ? parsed.posts
          .filter(
            (p): p is Record<string, unknown> =>
              p !== null && typeof p === "object"
          )
          .map((p) => ({
            content: typeof p.content === "string" ? p.content : "",
            keyTakeaway:
              typeof p.keyTakeaway === "string" ? p.keyTakeaway : "",
            suggestedPlatforms: Array.isArray(p.suggestedPlatforms)
              ? (p.suggestedPlatforms as unknown[]).filter(
                  (s): s is string => typeof s === "string"
                )
              : [],
          }))
          .filter((p) => p.content)
      : [];

    return {
      posts,
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
      sourceTitle:
        typeof parsed.sourceTitle === "string"
          ? parsed.sourceTitle
          : undefined,
    };
  } catch {
    return { posts: [], summary: "" };
  }
}

export async function generateEventContent(
  title: string,
  platforms: string[],
  description?: string
): Promise<string[]> {
  const client = getClient();
  if (!client) return [];

  const platformList = platforms.join(", ");
  const descText = description ? `\nContext: ${description}` : "";

  try {
    const message = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      system: [
        {
          type: "text",
          text: "You are a social media content expert. Generate engaging post content for social media holidays and events. Keep posts authentic, engaging, and platform-appropriate.",
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Generate 3 different social media post variants for this event:\nEvent: ${title}${descText}\nPlatforms: ${platformList}\n\nReturn JSON with this exact structure:\n{"variants": ["post 1 text", "post 2 text", "post 3 text"]}\n\nMake each variant unique in tone and style. Include relevant hashtags. Keep each under 280 characters if Twitter/X is included in the platforms.`,
        },
      ],
    });

    const text =
      message.content[0].type === "text" ? message.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];
    const parsed = JSON.parse(jsonMatch[0]) as { variants?: string[] };
    return Array.isArray(parsed.variants) ? parsed.variants : [];
  } catch {
    return [];
  }
}

// ── Idea Scoring ──────────────────────────────────────────────────────────────

export interface IdeaScoreDimension {
  name: string;
  score: number; // 0-100
  explanation: string;
}

export interface IdeaScoreResult {
  overallScore: number; // 0-100
  dimensions: IdeaScoreDimension[];
  topStrengths: string[];
  topWeaknesses: string[];
  recommendation: "pursue" | "refine" | "skip";
}

const SCORE_IDEA_SYSTEM = `You are a content strategy expert who evaluates social media content ideas. Assess ideas across 5 dimensions and provide actionable recommendations.

Always respond with valid JSON in this exact format:
{
  "overallScore": 75,
  "dimensions": [
    {"name": "Originality", "score": 80, "explanation": "Brief explanation"},
    {"name": "Brand Fit", "score": 70, "explanation": "Brief explanation"},
    {"name": "Audience Interest", "score": 85, "explanation": "Brief explanation"},
    {"name": "Timeliness", "score": 65, "explanation": "Brief explanation"},
    {"name": "Estimated Engagement", "score": 75, "explanation": "Brief explanation"}
  ],
  "topStrengths": ["strength 1", "strength 2"],
  "topWeaknesses": ["weakness 1", "weakness 2"],
  "recommendation": "pursue"
}

The recommendation must be one of: "pursue" (score ≥70), "refine" (score 40-69), or "skip" (score <40).
Each dimension score is 0-100. The overall score is the weighted average of all dimensions.`;

export async function scoreContentIdea(
  ideaTitle: string,
  platforms: string[],
  ideaDescription?: string,
  existingTopics?: string[]
): Promise<IdeaScoreResult | null> {
  const client = getClient();
  if (!client) return null;

  const platformList = platforms.length > 0 ? platforms.join(", ") : "general social media";
  const descText = ideaDescription ? `\nDescription: ${ideaDescription}` : "";
  const topicsText =
    existingTopics && existingTopics.length > 0
      ? `\n\nExisting content topics for originality comparison:\n${existingTopics.slice(0, 20).join(", ")}`
      : "";

  try {
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: [
        {
          type: "text",
          text: SCORE_IDEA_SYSTEM,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Evaluate this content idea:\n\nTitle: ${ideaTitle}${descText}\nTarget platforms: ${platformList}${topicsText}\n\nScore it across all 5 dimensions and provide your assessment.`,
        },
      ],
    });

    const text =
      message.content[0].type === "text" ? message.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as {
      overallScore?: number;
      dimensions?: { name: string; score: number; explanation: string }[];
      topStrengths?: string[];
      topWeaknesses?: string[];
      recommendation?: string;
    };

    const overallScore =
      typeof parsed.overallScore === "number"
        ? Math.max(0, Math.min(100, Math.round(parsed.overallScore)))
        : 50;

    const dimensions: IdeaScoreDimension[] = Array.isArray(parsed.dimensions)
      ? parsed.dimensions.map((d) => ({
          name: String(d.name || ""),
          score: Math.max(0, Math.min(100, Math.round(Number(d.score) || 0))),
          explanation: String(d.explanation || ""),
        }))
      : [];

    const topStrengths = Array.isArray(parsed.topStrengths)
      ? parsed.topStrengths.map(String)
      : [];
    const topWeaknesses = Array.isArray(parsed.topWeaknesses)
      ? parsed.topWeaknesses.map(String)
      : [];

    const rec = parsed.recommendation;
    const recommendation: "pursue" | "refine" | "skip" =
      rec === "pursue" || rec === "refine" || rec === "skip" ? rec : "refine";

    return { overallScore, dimensions, topStrengths, topWeaknesses, recommendation };
  } catch {
    return null;
  }
}

// ── Daily Briefing ─────────────────────────────────────────────────────────────

export interface DailyBriefingData {
  todayScheduled: number;
  weekScheduled: number;
  yesterdayStats: {
    published: number;
    totalEngagement: number;
    topPlatform: string | null;
  };
  contentGaps: string[]; // YYYY-MM-DD dates with no scheduled content
  topHashtags: { tag: string; count: number }[];
}

export interface DailyBriefingResult {
  summary: string;
  recommendations: string[];
}

const BRIEFING_SYSTEM = `You are a social media manager assistant generating a concise morning briefing.
Always respond with valid JSON in this exact format:
{
  "summary": "2-3 sentence overview of the day ahead and recent performance",
  "recommendations": ["actionable tip 1", "actionable tip 2", "actionable tip 3"]
}
Be specific, actionable, and encouraging. Keep each recommendation under 100 characters.`;

export async function generateDailyBriefing(
  data: DailyBriefingData
): Promise<DailyBriefingResult | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;

  const client = getClient();

  const gapsText =
    data.contentGaps.length > 0
      ? `Content gaps detected on: ${data.contentGaps.join(", ")}.`
      : "No content gaps in the next 7 days.";

  const hashtagsText =
    data.topHashtags.length > 0
      ? `Top hashtags used: ${data.topHashtags.map((h) => `${h.tag} (${h.count}x)`).join(", ")}.`
      : "No hashtag data available.";

  const prompt = `Morning briefing data:
- Posts scheduled today: ${data.todayScheduled}
- Posts scheduled this week: ${data.weekScheduled}
- Yesterday: ${data.yesterdayStats.published} posts published, ${data.yesterdayStats.totalEngagement} total engagements${data.yesterdayStats.topPlatform ? `, top platform: ${data.yesterdayStats.topPlatform}` : ""}
- ${gapsText}
- ${hashtagsText}

Generate a morning briefing summary and 3 actionable recommendations for today.`;

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 400,
      system: [
        {
          type: "text",
          text: BRIEFING_SYSTEM,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: prompt }],
    });

    const text =
      response.content[0]?.type === "text" ? response.content[0].text : "";
    const parsed = JSON.parse(text) as Partial<DailyBriefingResult>;

    return {
      summary:
        typeof parsed.summary === "string"
          ? parsed.summary
          : "Ready for a productive social media day!",
      recommendations: Array.isArray(parsed.recommendations)
        ? parsed.recommendations.slice(0, 3).map(String)
        : [],
    };
  } catch {
    return null;
  }
}

export interface HookOption {
  hook: string;
  style:
    | "question"
    | "statistic"
    | "story"
    | "controversy"
    | "curiosity"
    | "list";
  explanation: string;
}

const HOOKS_SYSTEM = `You are an expert social media copywriter specialising in attention-grabbing opening lines.
Given post content and target platforms, generate compelling hook / opening-line variations in different styles.
Always respond with valid JSON in this exact format:
{"hooks": [{"hook": "...", "style": "question|statistic|story|controversy|curiosity|list", "explanation": "..."}]}
Generate exactly the requested number of hooks. Each hook should be a standalone opening line (not the full post).
Styles:
- question: starts with or implies a question to draw readers in
- statistic: opens with a surprising fact or number
- story: begins mid-action or with a personal/narrative hook
- controversy: challenges conventional wisdom or makes a bold statement
- curiosity: creates an information gap that makes readers want to continue
- list: "X things/ways/reasons" opener`;

export async function generateHooks(
  content: string,
  platforms: string[],
  count: number = 5
): Promise<HookOption[]> {
  const client = getClient();

  const prompt = `Post content:
${content.trim()}

Target platforms: ${platforms.join(", ")}

Generate ${count} compelling opening hooks for this post. Each hook should be a punchy first line that would stop a reader from scrolling.`;

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 800,
      system: [
        {
          type: "text",
          text: HOOKS_SYSTEM,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: prompt }],
    });

    const text =
      response.content[0]?.type === "text" ? response.content[0].text : "";
    const parsed = JSON.parse(text) as Partial<{ hooks: HookOption[] }>;
    if (!Array.isArray(parsed.hooks)) return [];

    const validStyles = ["question", "statistic", "story", "controversy", "curiosity", "list"] as const;
    type HookStyle = (typeof validStyles)[number];

    return parsed.hooks.slice(0, count).map((h) => ({
      hook: typeof h.hook === "string" ? h.hook : "",
      style: validStyles.includes(h.style as HookStyle) ? (h.style as HookStyle) : "curiosity",
      explanation: typeof h.explanation === "string" ? h.explanation : "",
    }));
  } catch {
    return [];
  }
}

const COMPETITOR_ANALYSIS_SYSTEM = `You are a social media strategy expert. Analyze competitor post content and provide strategic insights.
Always respond with valid JSON in this exact format:
{
  "contentStrategy": "brief description of their content strategy",
  "strengths": ["strength1", "strength2", "strength3"],
  "weaknesses": ["weakness1", "weakness2"],
  "keyTechniques": ["technique1", "technique2", "technique3"],
  "toneStyle": "description of their tone and writing style",
  "targetAudience": "who this content appears to target",
  "estimatedEngagementScore": 75,
  "actionableInsights": ["insight1", "insight2", "insight3"]
}
estimatedEngagementScore should be 0-100 based on content quality and engagement potential.`;

export interface CompetitorAnalysisResult {
  contentStrategy: string;
  strengths: string[];
  weaknesses: string[];
  keyTechniques: string[];
  toneStyle: string;
  targetAudience: string;
  estimatedEngagementScore: number;
  actionableInsights: string[];
}

export async function analyzeCompetitorContent(
  content: string,
  platform?: string | null,
  brandKitContext?: string | null
): Promise<CompetitorAnalysisResult | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const client = getClient();

  let userContent = `Competitor Post Content:\n${content}`;
  if (platform) userContent += `\nPlatform: ${platform}`;
  if (brandKitContext) userContent += `\nMy Brand Context (for comparison):\n${brandKitContext}`;
  userContent += `\n\nAnalyze this competitor content.`;

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: [
        {
          type: "text",
          text: COMPETITOR_ANALYSIS_SYSTEM,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: userContent }],
    });

    const block = response.content.find((b) => b.type === "text");
    const text = block && block.type === "text" ? block.text : "{}";
    const parsed = JSON.parse(text) as CompetitorAnalysisResult;
    if (parsed.contentStrategy && Array.isArray(parsed.strengths)) {
      return {
        contentStrategy: parsed.contentStrategy,
        strengths: parsed.strengths,
        weaknesses: Array.isArray(parsed.weaknesses) ? parsed.weaknesses : [],
        keyTechniques: Array.isArray(parsed.keyTechniques) ? parsed.keyTechniques : [],
        toneStyle: parsed.toneStyle ?? "",
        targetAudience: parsed.targetAudience ?? "",
        estimatedEngagementScore:
          typeof parsed.estimatedEngagementScore === "number"
            ? Math.max(0, Math.min(100, parsed.estimatedEngagementScore))
            : 50,
        actionableInsights: Array.isArray(parsed.actionableInsights) ? parsed.actionableInsights : [],
      };
    }
  } catch {
    // fall through
  }
  return null;
}

const COMMENT_SENTIMENT_SYSTEM = `You are a social media sentiment analyst. Classify a comment as POSITIVE, NEUTRAL, or NEGATIVE and provide a confidence score.

Respond with JSON only:
{
  "sentiment": "POSITIVE" | "NEUTRAL" | "NEGATIVE",
  "score": <number 0.0-1.0>
}

Guidelines:
- POSITIVE: praise, support, gratitude, enthusiasm, agreement, constructive engagement
- NEGATIVE: complaints, insults, spam, hostility, strong criticism, threats
- NEUTRAL: questions, factual statements, mild observations, ambiguous
- score: confidence in the classification (0.5 = uncertain, 1.0 = very certain)`;

export async function analyzeCommentSentiment(
  content: string
): Promise<{ sentiment: string; score: number } | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const client = getClient();

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 128,
      system: [
        {
          type: "text",
          text: COMMENT_SENTIMENT_SYSTEM,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: `Comment: ${content.slice(0, 500)}` }],
    });

    const block = response.content.find((b) => b.type === "text");
    const text = block && block.type === "text" ? block.text : "{}";
    const parsed = JSON.parse(text) as { sentiment?: string; score?: number };
    const validSentiments = ["POSITIVE", "NEUTRAL", "NEGATIVE"];
    if (parsed.sentiment && validSentiments.includes(parsed.sentiment)) {
      return {
        sentiment: parsed.sentiment,
        score: typeof parsed.score === "number" ? Math.max(0, Math.min(1, parsed.score)) : 0.5,
      };
    }
  } catch {
    // fall through
  }
  return null;
}

export interface PerformanceExplanationResult {
  explanation: string;
  keyFactors: { factor: string; impact: "positive" | "negative" | "neutral"; description: string }[];
  actionItems: string[];
}

export interface InsightsSummary {
  impressions: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
}

const EXPLAIN_PERFORMANCE_SYSTEM = `You are a social media performance analyst. Given a post's content and engagement metrics, explain why it performed the way it did in plain language.

Respond with JSON only:
{
  "explanation": "<2-3 sentence plain English explanation of why the post performed the way it did>",
  "keyFactors": [
    {"factor": "<factor name>", "impact": "positive" | "negative" | "neutral", "description": "<one sentence explanation>"}
  ],
  "actionItems": ["<actionable improvement 1>", "<actionable improvement 2>", "<actionable improvement 3>"]
}

Rules:
- explanation: 2-3 sentences, conversational, specific to the data provided
- keyFactors: 3-5 factors that drove performance (timing, content type, hashtags, media, engagement hooks, brevity, emotional appeal, platform-fit, etc.)
- actionItems: 2-4 concrete next steps to improve or replicate this performance
- Compare metrics to historical averages when provided to give context
- Be honest: if performance was poor, explain why clearly; if great, explain what worked`;

export async function explainPostPerformance(
  content: string,
  insights: InsightsSummary,
  historicalAvg?: Partial<InsightsSummary> | null,
  platform?: string | null
): Promise<PerformanceExplanationResult | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const client = getClient();

  let userMsg = `Post Content:\n${content.slice(0, 1000)}\n\nEngagement Metrics:\n`;
  userMsg += `- Impressions: ${insights.impressions}\n`;
  userMsg += `- Reach: ${insights.reach}\n`;
  userMsg += `- Likes: ${insights.likes}\n`;
  userMsg += `- Comments: ${insights.comments}\n`;
  userMsg += `- Shares: ${insights.shares}\n`;

  if (historicalAvg) {
    userMsg += `\nHistorical Average (last 30 posts):\n`;
    if (historicalAvg.impressions != null) userMsg += `- Avg Impressions: ${Math.round(historicalAvg.impressions)}\n`;
    if (historicalAvg.reach != null) userMsg += `- Avg Reach: ${Math.round(historicalAvg.reach)}\n`;
    if (historicalAvg.likes != null) userMsg += `- Avg Likes: ${Math.round(historicalAvg.likes)}\n`;
    if (historicalAvg.comments != null) userMsg += `- Avg Comments: ${Math.round(historicalAvg.comments)}\n`;
    if (historicalAvg.shares != null) userMsg += `- Avg Shares: ${Math.round(historicalAvg.shares)}\n`;
  }

  if (platform) userMsg += `\nPlatform: ${platform}`;
  userMsg += `\n\nAnalyze this post's performance.`;

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: [
        {
          type: "text",
          text: EXPLAIN_PERFORMANCE_SYSTEM,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: userMsg }],
    });

    const block = response.content.find((b) => b.type === "text");
    const text = block && block.type === "text" ? block.text : "{}";
    const parsed = JSON.parse(text) as Partial<PerformanceExplanationResult>;

    if (typeof parsed.explanation === "string" && Array.isArray(parsed.keyFactors)) {
      return {
        explanation: parsed.explanation,
        keyFactors: (parsed.keyFactors as { factor?: string; impact?: string; description?: string }[])
          .filter((f) => typeof f.factor === "string")
          .map((f) => ({
            factor: f.factor ?? "",
            impact: (["positive", "negative", "neutral"].includes(f.impact ?? "")
              ? f.impact
              : "neutral") as "positive" | "negative" | "neutral",
            description: f.description ?? "",
          })),
        actionItems: Array.isArray(parsed.actionItems)
          ? (parsed.actionItems as unknown[]).filter((i): i is string => typeof i === "string")
          : [],
      };
    }
  } catch {
    // fall through
  }
  return null;
}

// ─── Phase 252: Trending Topic Discovery ─────────────────────────────────────

export interface TrendingTopic {
  topic: string;
  category: string;
  urgency: "now" | "this_week" | "this_month";
  reasoning: string;
  contentIdea: string;
  estimatedEngagement: "high" | "medium" | "low";
}

export interface TrendingTopicsResult {
  topics: TrendingTopic[];
  generalInsights: string;
}

const TRENDING_TOPICS_SYSTEM = `You are a social media content strategist expert in identifying trending topics and content opportunities. You help creators discover what topics are gaining momentum so they can create timely, engaging content. Always respond with valid JSON.`;

export async function discoverTrendingTopics(
  niche: string,
  existingTopics: string[],
  platforms: string[]
): Promise<TrendingTopicsResult | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const client = getClient();

  const covered =
    existingTopics.length > 0
      ? `Topics they've already covered recently: ${existingTopics.slice(0, 20).join("; ")}`
      : "";

  const userMsg = `Identify trending content opportunities for a social media creator in the "${niche || "general"}" niche posting on: ${platforms.join(", ") || "social media"}.

${covered}

Generate 8 trending topic suggestions. For each topic provide:
- topic: the trending topic or theme (concise, 3-8 words)
- category: topic category (e.g. "Industry News", "Lifestyle", "Tips & Tutorials", "Viral Trends", "Seasonal", "Educational")
- urgency: "now" (trending right now - post within days), "this_week" (gaining momentum), or "this_month" (emerging trend)
- reasoning: why this topic is trending or timely (1-2 sentences)
- contentIdea: a specific content idea for this topic tailored to the niche (1-2 sentences)
- estimatedEngagement: "high", "medium", or "low"

Also provide a generalInsights field: 2-3 sentences of overall content strategy advice based on current trends.

Respond with valid JSON:
{"topics":[{"topic":"...","category":"...","urgency":"now","reasoning":"...","contentIdea":"...","estimatedEngagement":"high"}],"generalInsights":"..."}`;

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: [
        {
          type: "text",
          text: TRENDING_TOPICS_SYSTEM,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: userMsg }],
    });

    const block = response.content.find((b) => b.type === "text");
    const text = block && block.type === "text" ? block.text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]) as Partial<TrendingTopicsResult>;
    if (!Array.isArray(parsed.topics)) return null;
    return {
      topics: parsed.topics as TrendingTopic[],
      generalInsights: parsed.generalInsights ?? "",
    };
  } catch {
    return null;
  }
}

// ─── Phase 254: Product Caption Generator ────────────────────────────────────

export interface ProductCaption {
  platform: string;
  caption: string;
  tone: string;
  charCount: number;
}

export interface ProductCaptionsResult {
  captions: ProductCaption[];
  keyMessages: string[];
}

const PRODUCT_CAPTION_SYSTEM = `You are an expert social media copywriter specializing in product and service promotions.
Generate compelling, platform-optimized captions for products/services that drive engagement and conversions.
Always respond with valid JSON in this exact format:
{
  "captions": [
    {"platform": "FACEBOOK", "caption": "...", "tone": "..."},
    {"platform": "INSTAGRAM", "caption": "...", "tone": "..."},
    {"platform": "TWITTER", "caption": "...", "tone": "..."},
    {"platform": "LINKEDIN", "caption": "...", "tone": "..."}
  ],
  "keyMessages": ["message1", "message2", "message3"]
}
Adapt caption length, tone, and style to each platform. Include relevant hashtags for Instagram and Twitter.
keyMessages should be 2-4 core selling points extracted from the product description.`;

export async function generateProductCaptions(
  productName: string,
  productDescription: string,
  platforms: string[],
  promotionType: "launch" | "sale" | "awareness" | "review" | "general",
  targetAudience?: string
): Promise<ProductCaptionsResult | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const client = getClient();

  const userMsg = `Product/Service: ${productName}
Description: ${productDescription}
Promotion Type: ${promotionType}
Target Platforms: ${platforms.join(", ")}${targetAudience ? `\nTarget Audience: ${targetAudience}` : ""}

Generate platform-optimized captions for each of these platforms: ${platforms.join(", ")}.
Make the captions compelling and appropriate for the ${promotionType} promotion type.`;

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: [
        {
          type: "text",
          text: PRODUCT_CAPTION_SYSTEM,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: userMsg }],
    });

    const block = response.content.find((b) => b.type === "text");
    const text = block && block.type === "text" ? block.text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]) as Partial<ProductCaptionsResult & { captions: Array<{platform: string; caption: string; tone: string}> }>;
    if (!Array.isArray(parsed.captions)) return null;

    const captions: ProductCaption[] = parsed.captions
      .filter((c) => platforms.includes(c.platform))
      .map((c) => ({
        platform: c.platform,
        caption: c.caption ?? "",
        tone: c.tone ?? "professional",
        charCount: [...(c.caption ?? "")].length,
      }));

    return {
      captions,
      keyMessages: Array.isArray(parsed.keyMessages) ? parsed.keyMessages : [],
    };
  } catch {
    return null;
  }
}

// ─── Phase 255: Audience Q&A Post Generator ──────────────────────────────────

export interface AudienceQuestion {
  question: string;
  answer: string;
  suggestedPost: string;
  category: "how-to" | "why" | "what" | "comparison" | "misconception" | "tip";
}

export interface AudienceQuestionsResult {
  questions: AudienceQuestion[];
  topic: string;
}

const AUDIENCE_QA_SYSTEM = `You are a social media content strategist expert at generating audience questions and educational content.
Given a topic, generate the most common questions your target audience would ask, along with informative answers formatted as social media posts.
Always respond with valid JSON in this exact format:
{
  "questions": [
    {
      "question": "...",
      "answer": "...",
      "suggestedPost": "...",
      "category": "how-to"
    }
  ]
}
Category must be one of: "how-to", "why", "what", "comparison", "misconception", "tip".
suggestedPost should be a complete, ready-to-publish social media post that answers the question in an engaging way.
Include relevant hashtags in the suggestedPost. Keep suggestedPost under 280 chars for broad platform compatibility unless the platform allows more.`;

export async function generateAudienceQuestions(
  topic: string,
  platforms: string[],
  count: number = 5,
  context?: string
): Promise<AudienceQuestionsResult | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const client = getClient();

  const userMsg = `Topic: ${topic}
Target Platforms: ${platforms.join(", ")}
Number of Questions: ${count}${context ? `\nAdditional Context: ${context}` : ""}

Generate ${count} common audience questions about this topic with complete social media post answers.
Focus on questions that would get high engagement and educate the audience.`;

  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 2048,
    system: [
      {
        type: "text",
        text: AUDIENCE_QA_SYSTEM,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userMsg }],
  });

  try {
    const block = response.content.find((b) => b.type === "text");
    const text = block && block.type === "text" ? block.text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]) as Partial<AudienceQuestionsResult>;
    if (!Array.isArray(parsed.questions)) return null;

    const validCategories = new Set(["how-to", "why", "what", "comparison", "misconception", "tip"]);
    const questions: AudienceQuestion[] = parsed.questions.map((q) => ({
      question: q.question ?? "",
      answer: q.answer ?? "",
      suggestedPost: q.suggestedPost ?? "",
      category: validCategories.has(q.category ?? "") ? q.category! : "what",
    }));

    return { questions, topic };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Phase 259: AI Caption Style Transfer
// ---------------------------------------------------------------------------

export type StyleTransferStyle =
  | "casual"
  | "professional"
  | "concise"
  | "engaging"
  | "humorous"
  | "inspirational"
  | "educational";

export interface StyleTransferResult {
  styledContent: string;
  changes: string[];
  styleName: string;
}

const STYLE_DESCRIPTIONS: Record<StyleTransferStyle, string> = {
  casual: "Casual & Conversational — relaxed language, contractions, approachable tone",
  professional: "Professional & Formal — polished, authoritative, business-appropriate",
  concise: "Short & Punchy — trimmed to essentials, high impact, no fluff",
  engaging: "High-Engagement — strong hooks, calls-to-action, questions to prompt interaction",
  humorous: "Humorous & Light-hearted — wit, wordplay, relatable humor",
  inspirational: "Inspirational & Motivational — uplifting tone, empowering language",
  educational: "Educational & Informative — clear explanations, teach the audience something",
};

const STYLE_TRANSFER_SYSTEM = `You are an expert social media copywriter specializing in adapting content to different tones and styles.
Rewrite the provided social media post in the requested style while:
- Preserving the core message and key information
- Keeping all hashtags intact (you may reposition them)
- Keeping @mentions intact
- Respecting platform character limits when mentioned
- Making the style change authentic and natural

Always respond with valid JSON in this exact format:
{
  "styledContent": "the rewritten post content",
  "changes": ["change 1 description", "change 2 description"],
  "styleName": "human readable style name"
}

The "changes" array should list 2-4 specific things you changed (e.g. "Replaced formal language with contractions", "Added a CTA at the end").`;

export async function styleTransferContent(
  content: string,
  targetStyle: StyleTransferStyle,
  platforms: string[]
): Promise<StyleTransferResult | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const client = getClient();

  const styleDesc = STYLE_DESCRIPTIONS[targetStyle];
  const userMsg = `Target Style: ${styleDesc}
Platforms: ${platforms.join(", ")}

Original Post:
${content}

Rewrite this post in the requested style. Preserve hashtags and mentions. Return valid JSON.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: [
      {
        type: "text",
        text: STYLE_TRANSFER_SYSTEM,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userMsg }],
  });

  try {
    const block = response.content.find((b) => b.type === "text");
    const text = block && block.type === "text" ? block.text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]) as Partial<StyleTransferResult>;
    if (!parsed.styledContent) return null;
    return {
      styledContent: parsed.styledContent,
      changes: Array.isArray(parsed.changes) ? parsed.changes : [],
      styleName: parsed.styleName ?? targetStyle,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Phase 260: AI-Powered Engagement CTA & Hook Generator
// ---------------------------------------------------------------------------

export interface EngagementCTA {
  text: string;
  type: string;
  platform?: string;
  engagementBoost: "low" | "medium" | "high";
  explanation: string;
}

export interface EngagementCTAResult {
  ctas: EngagementCTA[];
  hook: string;
}

const ENGAGEMENT_CTA_SYSTEM = `You are an expert social media engagement strategist. Your role is to generate compelling calls-to-action (CTAs) and engagement hooks for social media posts.

For each CTA you generate:
- Make it natural and conversational, not salesy
- Tailor it to the platform(s) and content
- Focus on driving genuine engagement (comments, shares, saves, follows)
- Keep CTAs concise — 1-2 sentences max

For the hook:
- Create a compelling opening line that grabs attention immediately
- Use proven hook formats: bold statements, surprising facts, relatable scenarios, or provocative questions

Always respond with valid JSON in this exact format:
{
  "ctas": [
    {
      "text": "the CTA text to append",
      "type": "question|challenge|poll|share|comment|save|follow|link|general",
      "platform": "optional: INSTAGRAM|TWITTER|FACEBOOK|etc or omit for all",
      "engagementBoost": "low|medium|high",
      "explanation": "why this CTA works"
    }
  ],
  "hook": "a single compelling opening line to prepend to the post"
}

Generate exactly 5 CTAs.`;

export async function generateEngagementCTAs(
  content: string,
  platforms: string[],
  ctaType?: string
): Promise<EngagementCTAResult | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const client = getClient();

  const typeInstruction = ctaType && ctaType !== "general"
    ? `Focus specifically on "${ctaType}" type CTAs.`
    : "Mix different CTA types for variety.";

  const userMsg = `Platforms: ${platforms.join(", ")}
${typeInstruction}

Post Content:
${content}

Generate 5 engagement CTAs and 1 hook for this post. Return valid JSON.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: [
      {
        type: "text",
        text: ENGAGEMENT_CTA_SYSTEM,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userMsg }],
  });

  try {
    const block = response.content.find((b) => b.type === "text");
    const text = block && block.type === "text" ? block.text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]) as Partial<EngagementCTAResult>;
    if (!Array.isArray(parsed.ctas)) return null;

    const validBoosts = new Set<string>(["low", "medium", "high"]);
    const ctas: EngagementCTA[] = parsed.ctas.map((c) => ({
      text: c.text ?? "",
      type: c.type ?? "general",
      platform: c.platform,
      engagementBoost: validBoosts.has(c.engagementBoost ?? "")
        ? (c.engagementBoost as "low" | "medium" | "high")
        : "medium",
      explanation: c.explanation ?? "",
    }));

    return {
      ctas,
      hook: parsed.hook ?? "",
    };
  } catch {
    return null;
  }
}

// ─── Legal & Regulatory Compliance Checker ────────────────────────────────────

export type LegalIssueSeverity = "low" | "medium" | "high";

export interface LegalIssue {
  type: string;
  severity: LegalIssueSeverity;
  regulation: string;
  description: string;
  suggestion: string;
}

export interface LegalComplianceResult {
  compliant: boolean;
  issues: LegalIssue[];
  overallRisk: "low" | "medium" | "high";
  summary: string;
}

const LEGAL_COMPLIANCE_SYSTEM = `You are a legal and regulatory compliance expert specialising in social media marketing. Your role is to analyze social media post content for potential legal and regulatory compliance issues.

You check for:
1. FTC disclosure requirements (paid partnerships, sponsored content, affiliate links, endorsements)
2. Medical/health claims (unverified health claims, miracle cures, FDA-regulated statements)
3. Financial advice issues (investment advice without disclaimers, promises of returns)
4. Privacy & GDPR concerns (collecting personal data, tracking mentions)
5. Intellectual property risks (copyright infringement, trademark issues)
6. Contest & sweepstakes rules (must include official rules, no purchase necessary)
7. Age-restricted content (alcohol, gambling, adult content) missing age gates/disclaimers
8. Environmental/greenwashing claims (unsubstantiated eco-friendly claims)
9. Platform policy violations (platform-specific advertising policies)
10. Competitor disparagement (false claims about competitors)

Severity levels:
- "low": minor concern, good to fix but not urgent
- "medium": regulatory risk, should address before publishing
- "high": significant legal exposure, must address before publishing

Overall risk:
- "low": no issues or only low-severity issues
- "medium": at least one medium-severity issue
- "high": at least one high-severity issue

Always respond with valid JSON in this exact format:
{
  "compliant": true/false,
  "issues": [
    {
      "type": "ftc_disclosure|health_claim|financial_advice|privacy|copyright|contest_rules|age_restriction|greenwashing|platform_policy|competitor_claim",
      "severity": "low|medium|high",
      "regulation": "Name of relevant regulation or guideline",
      "description": "What the specific issue is",
      "suggestion": "How to fix it"
    }
  ],
  "overallRisk": "low|medium|high",
  "summary": "A 1-2 sentence overall assessment"
}

If there are no issues, return compliant: true, empty issues array, overallRisk: "low", and a positive summary.`;

export async function checkLegalCompliance(
  content: string,
  industry: string,
  platforms: string[],
  country?: string
): Promise<LegalComplianceResult | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const client = getClient();

  const countryCtx = country ? `Country/region: ${country}` : "Country/region: United States (default)";

  const userMsg = `Analyze the following social media post for legal and regulatory compliance issues.

Industry: ${industry}
Platforms: ${platforms.join(", ")}
${countryCtx}

Post Content:
${content}

Check for all relevant legal and regulatory compliance issues and return valid JSON.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: [
      {
        type: "text",
        text: LEGAL_COMPLIANCE_SYSTEM,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userMsg }],
  });

  try {
    const block = response.content.find((b) => b.type === "text");
    const text = block && block.type === "text" ? block.text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]) as Partial<LegalComplianceResult>;

    const validSeverities = new Set<string>(["low", "medium", "high"]);
    const validRisks = new Set<string>(["low", "medium", "high"]);

    const issues: LegalIssue[] = Array.isArray(parsed.issues)
      ? parsed.issues.map((i) => ({
          type: (i as LegalIssue).type ?? "unknown",
          severity: validSeverities.has((i as LegalIssue).severity ?? "")
            ? ((i as LegalIssue).severity as LegalIssueSeverity)
            : "medium",
          regulation: (i as LegalIssue).regulation ?? "",
          description: (i as LegalIssue).description ?? "",
          suggestion: (i as LegalIssue).suggestion ?? "",
        }))
      : [];

    return {
      compliant: typeof parsed.compliant === "boolean" ? parsed.compliant : issues.length === 0,
      issues,
      overallRisk: validRisks.has(parsed.overallRisk ?? "")
        ? (parsed.overallRisk as "low" | "medium" | "high")
        : "low",
      summary: parsed.summary ?? "",
    };
  } catch {
    return null;
  }
}

// ── Writing Coach ───────────────────────────────────────────────────────────────

export type WritingCoachCategory =
  | "clarity"
  | "engagement"
  | "platform"
  | "tone"
  | "cta";

export type WritingCoachImpact = "high" | "medium" | "low";

export interface WritingCoachImprovement {
  category: WritingCoachCategory;
  suggestion: string;
  impact: WritingCoachImpact;
}

export interface WritingCoachFeedback {
  score: number;
  summary: string;
  improvements: WritingCoachImprovement[];
}

const WRITING_COACH_SYSTEM = `You are an expert social media writing coach. Analyze post content and provide actionable improvement suggestions to maximize engagement, clarity, and platform fit.

Always respond with valid JSON in this exact format:
{
  "score": 75,
  "summary": "Brief overall assessment in 1-2 sentences.",
  "improvements": [
    {
      "category": "clarity",
      "suggestion": "Specific actionable suggestion",
      "impact": "high"
    }
  ]
}

Score (0-100): Rate the overall writing quality and engagement potential.
Categories: "clarity" (readability), "engagement" (hooks, emotion, interaction), "platform" (platform-specific optimization), "tone" (voice consistency), "cta" (call-to-action effectiveness).
Impact: "high" (must fix), "medium" (should fix), "low" (nice to have).
Provide 2-5 improvements maximum. Sort by impact descending.`;

export async function getWritingCoachFeedback(
  content: string,
  platforms: string[],
  tone?: string
): Promise<WritingCoachFeedback | null> {
  const client = getClient();

  const platformList = platforms.join(", ");
  const toneHint = tone ? `\nTarget tone: ${tone}` : "";

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 512,
    system: [
      {
        type: "text",
        text: WRITING_COACH_SYSTEM,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `Analyze this social media post for platforms: ${platformList}${toneHint}\n\nPost content:\n${content}`,
      },
    ],
  });

  try {
    const block = response.content.find((b) => b.type === "text");
    const text = block && block.type === "text" ? block.text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as {
      score?: unknown;
      summary?: unknown;
      improvements?: unknown[];
    };

    const validCategories = new Set<string>([
      "clarity",
      "engagement",
      "platform",
      "tone",
      "cta",
    ]);
    const validImpacts = new Set<string>(["high", "medium", "low"]);

    const score =
      typeof parsed.score === "number"
        ? Math.max(0, Math.min(100, Math.round(parsed.score)))
        : 50;
    const summary =
      typeof parsed.summary === "string" ? parsed.summary : "";
    const improvements: WritingCoachImprovement[] = Array.isArray(
      parsed.improvements
    )
      ? parsed.improvements
          .filter(
            (i): i is Record<string, unknown> =>
              i !== null && typeof i === "object"
          )
          .map((i) => ({
            category: validCategories.has(String(i.category))
              ? (i.category as WritingCoachCategory)
              : "clarity",
            suggestion: typeof i.suggestion === "string" ? i.suggestion : "",
            impact: validImpacts.has(String(i.impact))
              ? (i.impact as WritingCoachImpact)
              : "medium",
          }))
          .filter((i) => i.suggestion.length > 0)
      : [];

    return { score, summary, improvements };
  } catch {
    return null;
  }
}

// ── Image Prompt Generator ────────────────────────────────────────────────────

export interface ImagePromptResult {
  platform: string;
  prompt: string;
  negativePrompt: string;
  aspectRatio: string;
  style: string;
  keyElements: string[];
  colorPalette: string[];
  mood: string;
}

const IMAGE_PROMPT_SYSTEM = `You are a creative director and AI image generation expert. Generate detailed, platform-optimized image creation prompts for social media posts.
Always respond with valid JSON in this exact format:
{"prompts": [{"platform": "PLATFORM_NAME", "prompt": "detailed prompt for AI image generation", "negativePrompt": "what to avoid", "aspectRatio": "1:1", "style": "photorealistic", "keyElements": ["element1", "element2"], "colorPalette": ["#color1", "#color2"], "mood": "professional"}]}

Platform aspect ratios:
- INSTAGRAM: 1:1 or 4:5
- FACEBOOK: 1.91:1
- TWITTER: 16:9
- LINKEDIN: 1.91:1
- PINTEREST: 2:3
- TIKTOK: 9:16
- THREADS: 1:1
- BLUESKY: 1:1
- MASTODON: 1:1
- default: 1:1

Generate compelling, specific image prompts that work well with AI image generators like Midjourney or DALL-E 3.
Include photographic or artistic style details, lighting, composition, and mood descriptors.
Keep prompts under 300 words each. Make prompts vivid and specific.
colorPalette should be 2-4 hex color codes that fit the brand/mood.
keyElements should be 3-5 key visual subjects/objects to include.`;

export async function generateImagePrompts(
  content: string,
  platforms: string[],
  style?: string | null,
  mood?: string | null
): Promise<ImagePromptResult[]> {
  const client = getClient();
  let userMessage = `Post content:\n${content}\n\nTarget platforms: ${platforms.join(", ")}`;
  if (style) userMessage += `\nPreferred style: ${style}`;
  if (mood) userMessage += `\nPreferred mood: ${mood}`;
  userMessage += `\n\nGenerate image prompts optimized for each platform.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: [
      {
        type: "text",
        text: IMAGE_PROMPT_SYSTEM,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userMessage }],
  });

  const block = response.content.find((b) => b.type === "text");
  const text = block && block.type === "text" ? block.text : "{}";
  try {
    const parsed = JSON.parse(text) as { prompts?: unknown };
    const prompts = parsed.prompts;
    if (
      Array.isArray(prompts) &&
      prompts.every(
        (p) =>
          typeof p === "object" &&
          p !== null &&
          typeof (p as Record<string, unknown>).platform === "string" &&
          typeof (p as Record<string, unknown>).prompt === "string"
      )
    ) {
      return prompts as ImagePromptResult[];
    }
  } catch {
    // fall through
  }
  return [];
}

export interface CarouselSlide {
  slideNumber: number;
  headline: string;
  bodyText: string;
  visualDescription: string;
  keyTakeaway: string;
}

export interface CarouselContent {
  title: string;
  coverSlide: { headline: string; subtitle: string };
  slides: CarouselSlide[];
  closingSlide: { cta: string; hashtags: string[] };
}

const CAROUSEL_SYSTEM = `You are a social media carousel content strategist. Generate structured, engaging carousel/slide-deck content for social media platforms.
Always respond with valid JSON in this exact format:
{
  "title": "Overall carousel title",
  "coverSlide": { "headline": "Attention-grabbing headline", "subtitle": "Brief subtitle or hook" },
  "slides": [
    {
      "slideNumber": 1,
      "headline": "Slide headline (max 10 words)",
      "bodyText": "Main content for this slide (2-4 sentences)",
      "visualDescription": "Description of ideal image/graphic for this slide",
      "keyTakeaway": "One-line takeaway for this slide"
    }
  ],
  "closingSlide": { "cta": "Call-to-action text", "hashtags": ["#hashtag1", "#hashtag2"] }
}
Make each slide self-contained but part of a cohesive narrative. Keep headlines punchy, body text informative, and visual descriptions specific.`;

export async function generateCarouselContent(
  topic: string,
  slideCount: number,
  platforms: string[],
  tone?: string | null,
  audience?: string | null
): Promise<CarouselContent | null> {
  const client = getClient();
  let userMessage = `Topic: ${topic}\nNumber of content slides: ${slideCount}\nPlatforms: ${platforms.join(", ")}`;
  if (tone) userMessage += `\nTone: ${tone}`;
  if (audience) userMessage += `\nTarget audience: ${audience}`;
  userMessage += `\n\nGenerate a complete carousel with ${slideCount} content slides (plus cover and closing slides).`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 3000,
    system: [
      {
        type: "text",
        text: CAROUSEL_SYSTEM,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userMessage }],
  });

  const block = response.content.find((b) => b.type === "text");
  const text = block && block.type === "text" ? block.text : "{}";
  try {
    const parsed = JSON.parse(text) as CarouselContent;
    if (
      typeof parsed.title === "string" &&
      parsed.coverSlide &&
      Array.isArray(parsed.slides) &&
      parsed.slides.length > 0 &&
      parsed.closingSlide
    ) {
      return parsed;
    }
  } catch {
    // fall through
  }
  return null;
}

// ── Newsletter Draft ──────────────────────────────────────────────────────────

export interface NewsletterSection {
  headline: string;
  excerpt: string;
  platform: string;
  content: string;
}

export interface NewsletterDraft {
  subject: string;
  intro: string;
  sections: NewsletterSection[];
  keyTakeaways: string[];
  conclusion: string;
  estimatedReadTime: number;
}

const NEWSLETTER_SYSTEM = `You are an expert email newsletter writer. You compile social media posts into a cohesive, engaging email newsletter.
Always respond with valid JSON matching this exact structure:
{
  "subject": "Compelling email subject line",
  "intro": "Opening paragraph introducing this edition of the newsletter",
  "sections": [
    {
      "headline": "Section headline",
      "excerpt": "Brief 1-2 sentence summary of the post",
      "platform": "Platform name",
      "content": "Expanded version of the post content suitable for email"
    }
  ],
  "keyTakeaways": ["Key insight 1", "Key insight 2", "Key insight 3"],
  "conclusion": "Closing paragraph with a call to action",
  "estimatedReadTime": 3
}
Each section should feature one social media post. The keyTakeaways should synthesize the main insights across all posts.
The estimatedReadTime should be a number in minutes.`;

export async function generateNewsletterDraft(
  posts: { content: string; platform: string; publishedAt?: string }[],
  periodLabel: string,
  tone?: string | null,
  customIntro?: string | null
): Promise<NewsletterDraft | null> {
  const client = getClient();

  const postSummaries = posts
    .slice(0, 20)
    .map(
      (p, i) =>
        `Post ${i + 1} (${p.platform}${p.publishedAt ? `, ${p.publishedAt}` : ""}):\n${p.content}`
    )
    .join("\n\n---\n\n");

  let userMessage = `Create a newsletter for the period: ${periodLabel}\n\n`;
  if (tone) userMessage += `Tone: ${tone}\n`;
  if (customIntro) userMessage += `Custom intro context: ${customIntro}\n`;
  userMessage += `\nSocial media posts to compile:\n\n${postSummaries}`;
  userMessage += `\n\nGenerate a cohesive newsletter that highlights the key content from these posts.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 3000,
    system: [
      {
        type: "text",
        text: NEWSLETTER_SYSTEM,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userMessage }],
  });

  const block = response.content.find((b) => b.type === "text");
  const rawText = block && block.type === "text" ? block.text : "{}";
  try {
    const parsed = JSON.parse(rawText) as NewsletterDraft;
    if (
      typeof parsed.subject === "string" &&
      typeof parsed.intro === "string" &&
      Array.isArray(parsed.sections) &&
      Array.isArray(parsed.keyTakeaways) &&
      typeof parsed.conclusion === "string"
    ) {
      return {
        ...parsed,
        estimatedReadTime:
          typeof parsed.estimatedReadTime === "number"
            ? parsed.estimatedReadTime
            : Math.max(1, Math.ceil(posts.length * 0.5)),
      };
    }
  } catch {
    // fall through
  }
  return null;
}

// ── Ad Copy Generator ─────────────────────────────────────────────────────────

export interface AdCopyVariant {
  platform: string;
  headline: string;
  primaryText: string;
  callToAction: string;
  targetingNotes: string;
  charCounts: { headline: number; primaryText: number };
}

export interface AdCopyResult {
  variants: AdCopyVariant[];
  guidelines: string[];
}

const AD_COPY_SYSTEM = `You are an expert social media advertising copywriter. Generate platform-optimized paid ad copy variants for the given content and campaign objective.

Always respond with valid JSON matching this exact structure:
{
  "variants": [
    {
      "platform": "PLATFORM_NAME",
      "headline": "Short compelling headline",
      "primaryText": "Main ad body text",
      "callToAction": "Single CTA phrase like 'Shop Now', 'Learn More', 'Sign Up', 'Get Started'",
      "targetingNotes": "Brief audience targeting suggestion for this platform"
    }
  ],
  "guidelines": ["Guideline 1 for optimizing these ads", "Guideline 2"]
}

Platform character limits:
- FACEBOOK: headline 40 chars, primaryText 125 chars
- INSTAGRAM: headline 40 chars, primaryText 125 chars
- LINKEDIN: headline 70 chars, primaryText 200 chars
- TWITTER: headline 50 chars, primaryText 280 chars
- TIKTOK: headline 40 chars, primaryText 150 chars
- PINTEREST: headline 100 chars, primaryText 500 chars

Generate one variant per requested platform. Guidelines should give 2-3 actionable optimization tips.`;

export async function generateAdCopy(
  content: string,
  platforms: string[],
  objective: string,
  targetAudience?: string | null,
  budget?: string | null
): Promise<AdCopyResult | null> {
  const client = getClient();

  let userMessage = `Original content to adapt for ads:\n${content}\n\nCampaign objective: ${objective}\nTarget platforms: ${platforms.join(", ")}`;
  if (targetAudience) userMessage += `\nTarget audience: ${targetAudience}`;
  if (budget) userMessage += `\nBudget level: ${budget}`;
  userMessage += `\n\nGenerate compelling ad copy variants optimized for paid advertising on each requested platform.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: [
      {
        type: "text",
        text: AD_COPY_SYSTEM,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userMessage }],
  });

  const block = response.content.find((b) => b.type === "text");
  const rawText = block && block.type === "text" ? block.text : "{}";
  try {
    const parsed = JSON.parse(rawText) as { variants?: unknown; guidelines?: unknown };
    if (
      Array.isArray(parsed.variants) &&
      Array.isArray(parsed.guidelines)
    ) {
      const variants = (parsed.variants as AdCopyVariant[]).map((v) => ({
        ...v,
        charCounts: {
          headline: v.headline?.length ?? 0,
          primaryText: v.primaryText?.length ?? 0,
        },
      }));
      return {
        variants,
        guidelines: parsed.guidelines as string[],
      };
    }
  } catch {
    // fall through
  }
  return null;
}

// ─── AI Platform Suggestion ──────────────────────────────────────────────────

const SUGGEST_PLATFORMS_SYSTEM = `You are a social media distribution strategist. Given post content, media type, and a list of platforms the user is connected to, you recommend which platforms to publish on for maximum impact.

Analyze the content tone, length, media type, and subject matter to score each platform 0-100 and explain why it's a good or poor fit.

Always respond with valid JSON matching exactly this schema:
{
  "suggestions": [
    {
      "platform": "<PLATFORM_NAME>",
      "score": <0-100 integer>,
      "reasoning": "<why this platform fits or doesn't fit>",
      "bestForAudience": "<description of who would see/engage with this on that platform>",
      "tips": ["<platform-specific tip>", ...]
    }
  ],
  "overallStrategy": "<brief overall distribution strategy advice>"
}

Include ALL platforms from the user's list in suggestions, sorted by score descending.`;

export interface PlatformSuggestion {
  platform: string;
  score: number;
  reasoning: string;
  bestForAudience: string;
  tips: string[];
}

export interface SuggestOptimalPlatformsResult {
  suggestions: PlatformSuggestion[];
  overallStrategy: string;
}

export async function suggestOptimalPlatforms(
  content: string,
  mediaType: string,
  userPlatforms: string[],
  historicalContext?: string | null
): Promise<SuggestOptimalPlatformsResult | null> {
  const client = getClient();
  if (!client) return null;

  const userMessage = `Analyze this post and recommend which platforms to publish on.

Post content:
${content}

Media type: ${mediaType}

Connected platforms: ${userPlatforms.join(", ")}
${historicalContext ? `\nHistorical context:\n${historicalContext}` : ""}

Return JSON with scores and reasoning for each platform.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: [
      {
        type: "text",
        text: SUGGEST_PLATFORMS_SYSTEM,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userMessage }],
  });

  const block = response.content.find((b) => b.type === "text");
  const rawText = block && block.type === "text" ? block.text : "{}";
  try {
    const parsed = JSON.parse(rawText) as {
      suggestions?: unknown;
      overallStrategy?: unknown;
    };
    if (
      Array.isArray(parsed.suggestions) &&
      typeof parsed.overallStrategy === "string"
    ) {
      return {
        suggestions: parsed.suggestions as PlatformSuggestion[],
        overallStrategy: parsed.overallStrategy,
      };
    }
  } catch {
    // fall through
  }
  return null;
}

// ─── Phase 278: Content Accessibility & Inclusive Language ───────────────────

export interface AccessibilityIssue {
  type:
    | "readability"
    | "inclusive_language"
    | "emoji"
    | "hashtag_casing"
    | "alt_text"
    | "sentence_length";
  severity: "low" | "medium" | "high";
  text?: string;
  suggestion: string;
  explanation: string;
}

export interface AccessibilityCheckResult {
  score: number;
  passesStandards: boolean;
  issues: AccessibilityIssue[];
  recommendations: string[];
  summary: string;
}

const ACCESSIBILITY_SYSTEM = `You are a social media content accessibility and inclusive language expert. Analyze post content for the following accessibility and inclusivity concerns:

1. **Readability**: Complex vocabulary, jargon, or sentence structure that may be difficult for people with cognitive disabilities or non-native speakers
2. **Inclusive Language**: Gender-exclusive terms, ableist language, racial/ethnic biases, or exclusionary phrasing
3. **Emoji Usage**: Emoji placed mid-sentence that disrupt screen reader flow; excessive emoji stacking; emoji without semantic context
4. **Hashtag Casing**: Hashtags written in all-lowercase that are hard to read for screen readers (e.g., #blackhistorymonth vs #BlackHistoryMonth)
5. **Alt Text**: Missing or inadequate description of visual content when images are referenced in text
6. **Sentence Length**: Very long sentences (>30 words) that may be difficult to process

Return a JSON object with exactly this structure:
{
  "score": <integer 0-100, 100 means fully accessible>,
  "passesStandards": <boolean, true if score >= 70>,
  "issues": [
    {
      "type": "<one of: readability|inclusive_language|emoji|hashtag_casing|alt_text|sentence_length>",
      "severity": "<one of: low|medium|high>",
      "text": "<the specific problematic text, if applicable>",
      "suggestion": "<the corrected or improved text>",
      "explanation": "<brief explanation of why this is an issue>"
    }
  ],
  "recommendations": ["<actionable recommendation 1>", ...],
  "summary": "<1-2 sentence overall accessibility assessment>"
}

Be concise and actionable. Focus on real issues, not nitpicks.`;

export async function checkContentAccessibility(
  content: string,
  altTexts?: string[],
  platform?: string
): Promise<AccessibilityCheckResult | null> {
  const client = getClient();
  if (!client) return null;

  const userMsg = [
    `Platform: ${platform ?? "general"}`,
    `Content:\n${content}`,
    altTexts && altTexts.length > 0
      ? `Alt texts provided:\n${altTexts.map((t, i) => `[${i + 1}] ${t}`).join("\n")}`
      : "No alt texts provided.",
  ].join("\n\n");

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      system: [
        {
          type: "text",
          text: ACCESSIBILITY_SYSTEM,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: userMsg }],
    });

    const text =
      response.content[0]?.type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as Partial<AccessibilityCheckResult>;
    if (
      typeof parsed.score === "number" &&
      typeof parsed.passesStandards === "boolean" &&
      Array.isArray(parsed.issues) &&
      Array.isArray(parsed.recommendations) &&
      typeof parsed.summary === "string"
    ) {
      return {
        score: Math.max(0, Math.min(100, Math.round(parsed.score))),
        passesStandards: parsed.passesStandards,
        issues: parsed.issues as AccessibilityIssue[],
        recommendations: parsed.recommendations,
        summary: parsed.summary,
      };
    }
  } catch {
    // fall through
  }
  return null;
}

// ---------------------------------------------------------------------------
// Phase 279 — Content Summarizer
// ---------------------------------------------------------------------------

const SUMMARIZE_SYSTEM = `You are an expert social media content strategist. Your task is to summarize long-form content into concise, platform-optimized social media posts.

When summarizing:
- Preserve all hashtags from the original content
- Keep @mentions that are important to the message
- Match the requested style: "narrative" (flowing prose), "bullet_points" (key facts as short bullets), or "headline" (single punchy title line)
- Hit the target character count as closely as possible without exceeding it
- Extract 3-5 key points from the original content

Return ONLY valid JSON in this exact shape:
{
  "summary": "<the summarized content>",
  "keyPoints": ["<point 1>", "<point 2>", "<point 3>"],
  "title": "<optional punchy headline, omit if style is not 'headline'>",
  "charCount": <integer character count of the summary>
}`;

export interface SummarizeResult {
  summary: string;
  keyPoints: string[];
  title?: string;
  charCount: number;
}

export async function summarizeContent(
  content: string,
  targetLength: number,
  style?: "bullet_points" | "narrative" | "headline",
  platforms?: string[]
): Promise<SummarizeResult | null> {
  const client = getClient();
  if (!client) return null;

  const effectiveStyle = style ?? "narrative";
  const platformCtx =
    platforms && platforms.length > 0
      ? `Target platforms: ${platforms.join(", ")}`
      : "";

  const userMsg = [
    `Style: ${effectiveStyle}`,
    `Target character count: ${targetLength}`,
    platformCtx,
    `Original content:\n${content}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      system: [
        {
          type: "text",
          text: SUMMARIZE_SYSTEM,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: userMsg }],
    });

    const text =
      response.content[0]?.type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as Partial<SummarizeResult>;
    if (
      typeof parsed.summary === "string" &&
      Array.isArray(parsed.keyPoints) &&
      typeof parsed.charCount === "number"
    ) {
      return {
        summary: parsed.summary,
        keyPoints: parsed.keyPoints as string[],
        title: typeof parsed.title === "string" ? parsed.title : undefined,
        charCount: parsed.charCount,
      };
    }
  } catch {
    // fall through
  }
  return null;
}

// ---------------------------------------------------------------------------
// Phase 280 — Growth Strategy Generator
// ---------------------------------------------------------------------------

const GROWTH_STRATEGY_SYSTEM = `You are an expert social media growth consultant. Analyze the provided account metrics and generate a personalized, actionable growth strategy.

Return ONLY valid JSON in this exact shape:
{
  "weeks": [
    {
      "week": 1,
      "focus": "<theme for this week>",
      "tactics": ["<tactic 1>", "<tactic 2>", "<tactic 3>"],
      "kpis": ["<kpi 1>", "<kpi 2>"]
    }
  ],
  "platformSpecific": [
    {
      "platform": "<platform name>",
      "tips": ["<tip 1>", "<tip 2>", "<tip 3>"]
    }
  ],
  "overallApproach": "<concise strategic overview>",
  "estimatedGrowth": "<realistic growth estimate e.g. +15-25% followers>"
}

For a 30-day timeframe provide 4 weekly entries. For 90-day provide 4 entries covering phases of the strategy. Keep tactics specific and actionable.`;

export interface GrowthStrategyWeek {
  week: number;
  focus: string;
  tactics: string[];
  kpis: string[];
}

export interface GrowthStrategyResult {
  weeks: GrowthStrategyWeek[];
  platformSpecific: { platform: string; tips: string[] }[];
  overallApproach: string;
  estimatedGrowth: string;
}

export interface GrowthStrategyMetrics {
  platforms: string[];
  followerCounts: { platform: string; followers: number }[];
  avgEngagementRate: number;
  postsPerWeek: number;
  topCategories: string[];
  goals?: string;
  timeframe: "30d" | "90d";
}

export async function generateGrowthStrategy(
  metrics: GrowthStrategyMetrics
): Promise<GrowthStrategyResult | null> {
  const client = getClient();
  if (!client) return null;

  const timeframeLabel = metrics.timeframe === "30d" ? "30 days" : "90 days";
  const followerSummary = metrics.followerCounts
    .map((f) => `${f.platform}: ${f.followers.toLocaleString()} followers`)
    .join(", ");

  const userMsg = [
    `Timeframe: ${timeframeLabel}`,
    `Platforms: ${metrics.platforms.join(", ")}`,
    followerSummary ? `Current follower counts: ${followerSummary}` : "",
    `Average engagement rate: ${metrics.avgEngagementRate.toFixed(2)}%`,
    `Current posting frequency: ~${metrics.postsPerWeek.toFixed(1)} posts/week`,
    metrics.topCategories.length > 0
      ? `Top content categories: ${metrics.topCategories.join(", ")}`
      : "",
    metrics.goals ? `Growth goals: ${metrics.goals}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: [
        {
          type: "text",
          text: GROWTH_STRATEGY_SYSTEM,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: userMsg }],
    });

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as {
      weeks?: unknown[];
      platformSpecific?: unknown[];
      overallApproach?: unknown;
      estimatedGrowth?: unknown;
    };

    if (
      !Array.isArray(parsed.weeks) ||
      !Array.isArray(parsed.platformSpecific) ||
      typeof parsed.overallApproach !== "string" ||
      typeof parsed.estimatedGrowth !== "string"
    ) {
      return null;
    }

    return {
      weeks: parsed.weeks as GrowthStrategyWeek[],
      platformSpecific: parsed.platformSpecific as {
        platform: string;
        tips: string[];
      }[],
      overallApproach: parsed.overallApproach,
      estimatedGrowth: parsed.estimatedGrowth,
    };
  } catch {
    return null;
  }
}
