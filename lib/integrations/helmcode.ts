import "server-only";

import { z } from "zod";

/**
 * Cliente mínimo para la API de Helmcode (OpenAI-compatible, EU).
 * Docs: https://helmcode.com/docs/integrations · https://helmcode.com/docs/models
 *
 * La key solo vive en `process.env.HELMCODE_API_KEY` (servidor). Este módulo
 * importa `server-only`, así que fallará en build si alguien lo importa desde
 * un Client Component.
 */

const DEFAULT_BASE_URL = "https://api.helmcode.com/v1";
const DEFAULT_MODEL = "deepseek-v4-flash";

export const HELMCODE_MODELS = {
  deepseekV4Flash: "deepseek-v4-flash",
  glm53: "glm5.3",
  qwen36: "qwen3.6",
  gemma4: "gemma4",
  embedding: "qwen3-embedding",
} as const;

export type HelmcodeModel = (typeof HELMCODE_MODELS)[keyof typeof HELMCODE_MODELS];

export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatOptions {
  model?: HelmcodeModel | (string & {});
  temperature?: number;
  maxTokens?: number;
  /** glm5.3: low|medium|high|max · qwen3.6/gemma4: none|minimal|low|medium|high|max · deepseek: ignorado */
  reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high" | "max";
  /** Fuerza salida JSON (`response_format: json_object`). Pide el JSON también en el prompt. */
  json?: boolean;
  signal?: AbortSignal;
}

export class HelmcodeError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "HelmcodeError";
  }
}

interface HelmcodeConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

function getConfig(): HelmcodeConfig {
  const apiKey = process.env.HELMCODE_API_KEY;
  if (!apiKey || !apiKey.startsWith("sk-")) {
    throw new HelmcodeError(
      "Falta HELMCODE_API_KEY en .env (copia .env.example y pega la key del sponsor).",
      0,
      "missing_api_key",
    );
  }
  return {
    apiKey,
    baseUrl: (process.env.HELMCODE_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, ""),
    model: process.env.HELMCODE_MODEL ?? DEFAULT_MODEL,
  };
}

export function isHelmcodeConfigured(): boolean {
  return Boolean(process.env.HELMCODE_API_KEY?.startsWith("sk-"));
}

const errorBodySchema = z.object({
  error: z.object({ message: z.string(), code: z.union([z.string(), z.number()]).optional() }),
});

async function helmcodeFetch<T>(
  path: string,
  schema: z.ZodType<T>,
  init: { method?: "GET" | "POST"; body?: object; signal?: AbortSignal } = {},
): Promise<T> {
  const config = getConfig();
  const response = await fetch(`${config.baseUrl}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: init.signal,
    cache: "no-store",
  });

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const parsed = errorBodySchema.safeParse(payload);
    const message = parsed.success ? parsed.data.error.message : response.statusText;
    const code = parsed.success ? String(parsed.data.error.code ?? "") : undefined;
    throw new HelmcodeError(`Helmcode ${response.status}: ${message}`, response.status, code);
  }

  return schema.parse(payload);
}

const modelsSchema = z.object({ data: z.array(z.object({ id: z.string() })) });

export async function listHelmcodeModels(signal?: AbortSignal): Promise<string[]> {
  const result = await helmcodeFetch("/models", modelsSchema, { signal });
  return result.data.map((model) => model.id).sort();
}

const chatSchema = z.object({
  model: z.string(),
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string().nullable(),
          reasoning_content: z.string().nullable().optional(),
        }),
        finish_reason: z.string().nullable().optional(),
      }),
    )
    .min(1),
  usage: z
    .object({
      prompt_tokens: z.number(),
      completion_tokens: z.number(),
      total_tokens: z.number(),
    })
    .optional(),
});

export interface ChatResult {
  content: string;
  reasoning?: string;
  model: string;
  finishReason?: string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}

export async function chat(
  messages: ChatMessage[],
  options: ChatOptions = {},
): Promise<ChatResult> {
  const config = getConfig();
  const result = await helmcodeFetch("/chat/completions", chatSchema, {
    method: "POST",
    signal: options.signal,
    body: {
      model: options.model ?? config.model,
      messages,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      reasoning_effort: options.reasoningEffort,
      response_format: options.json ? { type: "json_object" } : undefined,
    },
  });

  const [choice] = result.choices;
  return {
    content: choice.message.content ?? "",
    reasoning: choice.message.reasoning_content ?? undefined,
    model: result.model,
    finishReason: choice.finish_reason ?? undefined,
    usage: result.usage
      ? {
          promptTokens: result.usage.prompt_tokens,
          completionTokens: result.usage.completion_tokens,
          totalTokens: result.usage.total_tokens,
        }
      : undefined,
  };
}

/** Atajo para el caso más común: un system prompt + un mensaje de usuario. */
export function ask(prompt: string, system?: string, options?: ChatOptions): Promise<ChatResult> {
  const messages: ChatMessage[] = system
    ? [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ]
    : [{ role: "user", content: prompt }];
  return chat(messages, options);
}
