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
