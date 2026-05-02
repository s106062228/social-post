import Anthropic from "@anthropic-ai/sdk";

export type Sentiment = "POSITIVE" | "NEUTRAL" | "NEGATIVE";

export interface SentimentResult {
  sentiment: Sentiment;
  score: number;
}

const MODEL = "claude-haiku-4-5";

const SYSTEM_PROMPT = `You are a social media content sentiment analyzer.
Classify the sentiment of the given post content as POSITIVE, NEUTRAL, or NEGATIVE.
Also provide a confidence score from 0.0 to 1.0.
Always respond with valid JSON in this exact format: {"sentiment": "POSITIVE", "score": 0.92}
- POSITIVE: upbeat, encouraging, celebratory, happy, promotional with positive framing
- NEGATIVE: complaints, criticism, frustration, anger, sadness
- NEUTRAL: factual, informational, ambiguous, mixed feelings`;

function getClient(): Anthropic {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

export async function analyzeSentiment(content: string): Promise<SentimentResult> {
  const client = getClient();

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 128,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `Analyze the sentiment of this social media post:\n\n${content}`,
      },
    ],
  });

  const block = response.content.find((b) => b.type === "text");
  const text = block && block.type === "text" ? block.text : "{}";

  try {
    const parsed = JSON.parse(text) as { sentiment?: unknown; score?: unknown };
    const sentiment = parsed.sentiment;
    const score = parsed.score;

    if (
      (sentiment === "POSITIVE" || sentiment === "NEUTRAL" || sentiment === "NEGATIVE") &&
      typeof score === "number" &&
      score >= 0 &&
      score <= 1
    ) {
      return { sentiment, score };
    }
  } catch {
    // fall through to default
  }

  return { sentiment: "NEUTRAL", score: 0.5 };
}
