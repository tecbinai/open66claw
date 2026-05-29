/**
 * Copilot ↔ OpenClaw Provider 请求/响应格式转换
 *
 * 将 GitHub Copilot 插件发送的请求格式转成标准 OpenAI 兼容格式，
 * 然后直接 HTTP 转发到已配置的 LLM provider endpoint。
 */

import { randomBytes } from "node:crypto";

// ============================================================================
// Request types (Copilot → Provider)
// ============================================================================

/** Copilot completions 请求格式 */
export interface CopilotCompletionRequest {
  prompt: string;
  suffix?: string;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  n?: number;
  stop?: string[];
  stream?: boolean;
}

/** Copilot chat 请求格式 */
export interface CopilotChatRequest {
  messages: Array<{ role: string; content: string }>;
  model?: string;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  stream?: boolean;
  stop?: string[];
}

/** 标准 OpenAI 兼容 completions 请求 */
export interface ProviderCompletionRequest {
  model: string;
  prompt: string;
  suffix?: string;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  n?: number;
  stop?: string[];
  stream?: boolean;
}

/** 标准 OpenAI 兼容 chat 请求 */
export interface ProviderChatRequest {
  model: string;
  messages: Array<{ role: string; content: string }>;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  stream?: boolean;
  stop?: string[];
}

// ============================================================================
// Response types (Provider → Copilot)
// ============================================================================

/** Provider completions 响应 */
export interface ProviderCompletionResponse {
  id?: string;
  choices: Array<{
    text?: string;
    index?: number;
    finish_reason?: string | null;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

/** Copilot completions 响应格式 */
export interface CopilotCompletionResponse {
  id: string;
  object: "text_completion";
  created: number;
  model: string;
  choices: Array<{
    text: string;
    index: number;
    finish_reason: string | null;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

/** Provider chat 响应 */
export interface ProviderChatResponse {
  id?: string;
  choices: Array<{
    message?: { role?: string; content?: string };
    delta?: { role?: string; content?: string };
    index?: number;
    finish_reason?: string | null;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

/** Copilot chat 响应格式（非流式） */
export interface CopilotChatResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: Array<{
    message: { role: string; content: string };
    index: number;
    finish_reason: string | null;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

/** Copilot chat 流式 chunk 响应格式 */
export interface CopilotChatChunkResponse {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: Array<{
    delta: { role?: string; content?: string };
    index: number;
    finish_reason: string | null;
  }>;
}

// ============================================================================
// Transform functions
// ============================================================================

/**
 * Copilot completions 请求 → Provider completions 请求
 */
export function transformCompletionRequest(
  copilotReq: CopilotCompletionRequest,
  model: string,
): ProviderCompletionRequest {
  return {
    model,
    prompt: copilotReq.prompt,
    suffix: copilotReq.suffix,
    max_tokens: copilotReq.max_tokens ?? 500,
    temperature: copilotReq.temperature ?? 0.2,
    top_p: copilotReq.top_p,
    n: copilotReq.n ?? 1,
    stop: copilotReq.stop,
    stream: copilotReq.stream ?? false,
  };
}

/**
 * Copilot chat 请求 → Provider chat 请求
 */
export function transformChatRequest(
  copilotReq: CopilotChatRequest,
  model: string,
): ProviderChatRequest {
  return {
    model,
    messages: copilotReq.messages,
    max_tokens: copilotReq.max_tokens ?? 4096,
    temperature: copilotReq.temperature ?? 0.2,
    top_p: copilotReq.top_p,
    stream: copilotReq.stream ?? false,
    stop: copilotReq.stop,
  };
}

function generateId(): string {
  return "cmpl-" + randomBytes(12).toString("hex");
}

/**
 * Provider completions 响应 → Copilot completions 响应
 */
export function transformCompletionResponse(
  providerRes: ProviderCompletionResponse,
  model: string,
): CopilotCompletionResponse {
  return {
    id: providerRes.id ?? generateId(),
    object: "text_completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: providerRes.choices.map((c, i) => ({
      text: c.text ?? "",
      index: c.index ?? i,
      finish_reason: c.finish_reason ?? null,
    })),
    usage: providerRes.usage,
  };
}

/**
 * Provider chat 响应 → Copilot chat 响应（非流式）
 */
export function transformChatResponse(
  providerRes: ProviderChatResponse,
  model: string,
): CopilotChatResponse {
  return {
    id: providerRes.id ?? generateId(),
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: providerRes.choices.map((c, i) => {
      const msg = c.message ?? c.delta;
      return {
        message: {
          role: msg?.role ?? "assistant",
          content: msg?.content ?? "",
        },
        index: c.index ?? i,
        finish_reason: c.finish_reason ?? null,
      };
    }),
    usage: providerRes.usage,
  };
}

/**
 * Provider chat streaming chunk → Copilot chat chunk 响应
 *
 * 流式响应中 provider 使用 delta 字段，object 为 "chat.completion.chunk"。
 */
export function transformChatStreamChunk(
  providerRes: ProviderChatResponse,
  model: string,
): CopilotChatChunkResponse {
  return {
    id: providerRes.id ?? generateId(),
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: providerRes.choices.map((c, i) => ({
      delta: {
        role: c.delta?.role ?? c.message?.role,
        content: c.delta?.content ?? c.message?.content ?? "",
      },
      index: c.index ?? i,
      finish_reason: c.finish_reason ?? null,
    })),
  };
}

/**
 * 解析 SSE data 行，提取 JSON 对象
 */
export function parseSseData(line: string): unknown | null {
  if (!line.startsWith("data: ")) return null;
  const data = line.slice(6).trim();
  if (data === "[DONE]") return null;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

/**
 * 将对象格式化为 SSE data 行
 */
export function formatSseData(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

/**
 * SSE 结束标记
 */
export function formatSseDone(): string {
  return "data: [DONE]\n\n";
}
