import { loadRepoEnv } from "../config/load-env.js";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
}

export interface LlmRuntimeConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export const loadLlmRuntimeConfig = (repoRoot: string): LlmRuntimeConfig | null => {
  const env = loadRepoEnv(repoRoot);
  const baseUrl = env.OPENAI_BASE_URL?.trim();
  const apiKey = env.OPENAI_API_KEY?.trim();
  const model = env.OPENAI_MODEL?.trim();

  if (!baseUrl || !apiKey || !model) {
    return null;
  }

  return { baseUrl, apiKey, model };
};

const extractTextContent = (content: string | Array<{ type?: string; text?: string }> | undefined): string => {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => item.text ?? "")
      .join("\n")
      .trim();
  }

  return "";
};

const extractJsonObject = (raw: string): string => {
  const fencedMatch = raw.match(/```json\s*([\s\S]*?)```/i);
  if (fencedMatch) {
    return fencedMatch[1].trim();
  }

  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return raw.slice(start, end + 1);
  }

  return raw.trim();
};

export const createChatCompletion = async (
  config: LlmRuntimeConfig,
  messages: ChatMessage[],
  signal?: AbortSignal
): Promise<string> => {
  const endpoint = `${config.baseUrl.replace(/\/$/, "")}/chat/completions`;

  const callApi = async (useJsonMode: boolean) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
          model: config.model,
          temperature: 0.1,
          ...(useJsonMode
            ? {
                response_format: {
                  type: "json_object"
                }
              }
            : {}),
          messages
        }),
        signal: signal ?? controller.signal
      });
      return response;
    } finally {
      clearTimeout(timeout);
    }
  };

  let response = await callApi(true);

  if (response.status === 400) {
    response = await callApi(false);
  }

  if (!response.ok) {
    throw new Error(`llm_request_failed:${response.status}`);
  }

  const payload = (await response.json()) as ChatCompletionResponse;
  const content = payload.choices?.[0]?.message?.content;
  const text = extractTextContent(content);

  if (!text) {
    throw new Error("llm_empty_response");
  }

  return extractJsonObject(text);
};
