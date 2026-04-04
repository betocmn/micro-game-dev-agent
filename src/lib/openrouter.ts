/**
 * Thin wrapper around OpenRouter's chat completions API.
 *
 * OpenRouter provides a unified API that's compatible with OpenAI's format
 * but routes to many models (Claude, GPT, Llama, etc). We use it instead
 * of calling Anthropic directly so we can swap models easily.
 *
 * The API shape is: POST https://openrouter.ai/api/v1/chat/completions
 * with the same request/response format as OpenAI's API.
 */

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_MODEL = "anthropic/claude-sonnet-4";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatCompletionOptions {
  model?: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
}

interface ChatCompletionResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

export async function chatCompletion(
  apiKey: string,
  options: ChatCompletionOptions
): Promise<string> {
  const { model = DEFAULT_MODEL, messages, temperature = 0.7, maxTokens = 4096 } = options;

  const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://3words.game",
      "X-Title": "3 Words to Game",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API error (${response.status}): ${errorText}`);
  }

  const data: ChatCompletionResponse = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("No content in OpenRouter response");
  }

  return content;
}

/**
 * Helper to extract JSON from LLM responses that may include markdown fences.
 * LLMs often wrap JSON in ```json ... ``` blocks.
 */
export function extractJSON(text: string): string {
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) return fenceMatch[1].trim();
  return text.trim();
}
