import http from "node:http";
import https from "node:https";
import { createCnLogger } from "../utils/index.js";
/**
 * Provider 探针 — 验证 API Key 并检测可用模型。
 *
 * 策略：对每个 provider 的模型列表，用 POST /chat/completions max_tokens=1 验证。
 * 如果第一个模型 401/403 就快速失败（Key 无效），其余模型并发探测。
 */
import { PROVIDERS, type ProviderMeta } from "./provider-registry.js";

const log = createCnLogger("probe");

// ====== Provider → Base URL 映射 ======

export const PROVIDER_BASE_URLS: Record<string, string> = {
  // cn-codeplan
  "kimi-coding": "https://api.kimi.com/coding/v1",
  "aliyun-codeplan": "https://coding.dashscope.aliyuncs.com/v1",
  "glm-codeplan": "https://open.bigmodel.cn/api/paas/v4",
  "minimax-codeplan": "https://api.minimaxi.com/anthropic",
  "volcengine-plan": "https://ark.cn-beijing.volces.com/api/coding/v3",
  // cn-recommended
  "aliyun-bailian": "https://dashscope.aliyuncs.com/compatible-mode/v1",
  "volcengine-ark": "https://ark.cn-beijing.volces.com/api/v3",
  siliconflow: "https://api.siliconflow.cn/v1",
  "ant-ling": "https://api.tbox.cn/api/llm/v1",
  "meituan-longcat": "https://api.longcat.chat/openai/v1",
  // cn-more
  deepseek: "https://api.deepseek.com/v1",
  glm: "https://open.bigmodel.cn/api/paas/v4",
  moonshot: "https://api.moonshot.cn/v1",
  minimax: "https://api.minimaxi.com/anthropic",
  "tencent-hunyuan": "https://api.hunyuan.cloud.tencent.com/v1",
  // international
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
  google: "https://generativelanguage.googleapis.com/v1beta",
  nvidia: "https://integrate.api.nvidia.com/v1",
  openrouter: "https://openrouter.ai/api/v1",
  // local
  ollama: "http://127.0.0.1:11434/v1",
};

// ====== Provider → 默认测试模型 ======

const PROVIDER_TEST_MODELS: Record<string, string[]> = {
  "kimi-coding": ["kimi-for-coding"],
  "aliyun-codeplan": ["qwen3-coder-plus"],
  "aliyun-bailian": ["qwen-turbo", "qwen-plus", "qwen-max"],
  "glm-codeplan": ["glm-4-flash"],
  glm: ["glm-4-flash", "glm-4", "glm-4v"],
  "minimax-codeplan": ["MiniMax-M2.5"],
  "volcengine-plan": ["ark-code-latest", "doubao-seed-code"],
  minimax: ["MiniMax-Text-01", "abab6.5s-chat"],
  "volcengine-ark": ["doubao-1.5-pro-256k"],
  siliconflow: ["deepseek-ai/DeepSeek-V3", "Qwen/Qwen2.5-7B-Instruct"],
  deepseek: ["deepseek-chat"],
  moonshot: ["moonshot-v1-auto"],
  "ant-ling": ["ling-lite"],
  "meituan-longcat": ["longcat-flash-chat"],
  "tencent-hunyuan": ["hunyuan-lite"],
  openai: ["gpt-4o-mini", "gpt-4o"],
  anthropic: ["claude-haiku-4-5-20251001"],
  google: ["gemini-2.0-flash"],
  nvidia: ["meta/llama-3.1-8b-instruct"],
  openrouter: ["openrouter/auto"],
  ollama: [],
  "openai-compatible": [],
  "anthropic-compatible": [],
};

// ====== 探针结果 ======

export interface ProbeResult {
  ok: boolean;
  fatal?: boolean;
  reason?: "auth_failed" | "model_not_found" | "transient" | "network" | "other";
  message?: string;
}

export interface DetectResult {
  success: boolean;
  error?: string;
  models: Array<{ id: string; name: string }>;
}

// ====== 核心探测 ======

/**
 * 探测单个模型是否可用。
 * 发送 POST /chat/completions { model, messages: [{role:"user",content:"hi"}], max_tokens: 1 }
 */
async function probeModel(
  providerId: string,
  modelId: string,
  apiKey: string,
  baseUrl: string,
): Promise<ProbeResult> {
  // Anthropic 用不同的 API 格式
  if (providerId === "anthropic" || providerId === "anthropic-compatible") {
    return probeAnthropic(modelId, apiKey, baseUrl);
  }

  // Google 用不同的认证方式
  if (providerId === "google") {
    return probeGoogle(modelId, apiKey);
  }

  // Ollama 不需要 API Key，检查服务是否在线
  if (providerId === "ollama") {
    return probeOllama(baseUrl);
  }

  // Kimi Code API 需要特殊 User-Agent，Node.js fetch 无法设置 → 用 https 模块
  if (providerId === "kimi-coding") {
    return probeWithUserAgent(modelId, apiKey, baseUrl, "claude-code/1.0");
  }

  // MiniMax (含 Coding Plan) 使用 Anthropic Messages 兼容 API
  if (providerId === "minimax-codeplan" || providerId === "minimax") {
    return probeMinimax(modelId, apiKey, baseUrl);
  }

  const url = `${baseUrl}/chat/completions`;
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 1,
      }),
      signal: AbortSignal.timeout(12000),
    });

    return parseProbeStatus(resp.status, modelId);
  } catch (err) {
    return probeNetworkError(err);
  }
}

async function probeAnthropic(
  modelId: string,
  apiKey: string,
  baseUrl: string,
): Promise<ProbeResult> {
  const url = `${baseUrl}/messages`;
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 1,
      }),
      signal: AbortSignal.timeout(12000),
    });
    if (resp.ok) return { ok: true };
    if (resp.status === 401 || resp.status === 403) {
      return { ok: false, fatal: true, reason: "auth_failed", message: "API Key 无效" };
    }
    return { ok: true }; // 非 auth 错误认为 key 有效
  } catch (err) {
    return {
      ok: false,
      reason: "network",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * MiniMax (含 Coding Plan) 使用 Anthropic Messages 兼容 API。
 * baseUrl 为 https://api.minimaxi.com/anthropic 或 https://api.minimax.io/anthropic
 * 探测路径: ${baseUrl}/v1/messages（与 clawdbot 一致）
 * 认证: 同时发 x-api-key 和 Authorization: Bearer（MiniMax 要求双头）
 */
async function probeMinimax(
  modelId: string,
  apiKey: string,
  baseUrl: string,
): Promise<ProbeResult> {
  const url = `${baseUrl}/v1/messages`;
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        Authorization: `Bearer ${apiKey}`,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 1,
      }),
      signal: AbortSignal.timeout(12000),
    });
    if (resp.ok) return { ok: true };
    if (resp.status === 401 || resp.status === 403) {
      return { ok: false, fatal: true, reason: "auth_failed", message: "API Key 无效" };
    }
    return { ok: true }; // 非 auth 错误认为 key 有效
  } catch (err) {
    return {
      ok: false,
      reason: "network",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

async function probeGoogle(modelId: string, apiKey: string): Promise<ProbeResult> {
  // G4: API Key 从 URL 参数改为 Header，防止 Key 被代理日志记录
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`;
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "hi" }] }],
        generationConfig: { maxOutputTokens: 1 },
      }),
      signal: AbortSignal.timeout(12000),
    });
    if (resp.ok) return { ok: true };
    if (resp.status === 400 || resp.status === 403) {
      const body = await resp.text().catch(() => "");
      if (body.includes("API_KEY_INVALID") || body.includes("PERMISSION_DENIED")) {
        return { ok: false, fatal: true, reason: "auth_failed", message: "API Key 无效" };
      }
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      reason: "network",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

async function probeOllama(baseUrl: string): Promise<ProbeResult> {
  try {
    const ollamaBase = baseUrl.replace(/\/v1\/?$/, "");
    const resp = await fetch(`${ollamaBase}/api/tags`, { signal: AbortSignal.timeout(5000) });
    if (resp.ok) return { ok: true };
    return { ok: false, reason: "network", message: "Ollama 服务未运行" };
  } catch {
    return { ok: false, reason: "network", message: "Ollama 服务未运行，请先启动 Ollama" };
  }
}

// ====== 通用辅助 ======

/** 解析 HTTP 状态码为 ProbeResult */
function parseProbeStatus(status: number, modelId: string): ProbeResult {
  if (status >= 200 && status < 300) return { ok: true };
  if (status === 401 || status === 403) {
    return { ok: false, fatal: true, reason: "auth_failed", message: "API Key 无效或已过期" };
  }
  if (status === 404) {
    return { ok: false, reason: "model_not_found", message: `模型 ${modelId} 不可用` };
  }
  if (status === 429) {
    return { ok: false, reason: "transient", message: "请求过于频繁" };
  }
  if (status === 402) {
    return { ok: false, reason: "transient", message: "余额不足" };
  }
  // 其他非 auth 错误 → 认为 key 有效
  return { ok: true };
}

/** 处理网络异常 */
function probeNetworkError(err: unknown): ProbeResult {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("timeout") || msg.includes("abort")) {
    return { ok: false, reason: "network", message: "连接超时" };
  }
  return { ok: false, reason: "network", message: `网络错误: ${msg}` };
}

/**
 * 使用 Node.js https 模块发送探测请求（支持自定义 User-Agent）。
 * Node.js 的 fetch (undici) 会过滤 User-Agent 头，某些 API（如 Kimi Code）
 * 需要特定 User-Agent 才能通过。
 */
function probeWithUserAgent(
  modelId: string,
  apiKey: string,
  baseUrl: string,
  userAgent: string,
): Promise<ProbeResult> {
  return new Promise((resolve) => {
    const urlObj = new URL(`${baseUrl}/chat/completions`);
    const data = JSON.stringify({
      model: modelId,
      messages: [{ role: "user", content: "hi" }],
      max_tokens: 1,
    });
    const transport = urlObj.protocol === "https:" ? https : http;
    const req = transport.request(
      {
        hostname: urlObj.hostname,
        port: urlObj.port || (urlObj.protocol === "https:" ? 443 : 80),
        path: urlObj.pathname,
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
          "User-Agent": userAgent,
        },
        timeout: 12000,
      },
      (res) => {
        // 消费 body 防止内存泄漏
        res.on("data", () => {});
        res.on("end", () => {
          resolve(parseProbeStatus(res.statusCode ?? 500, modelId));
        });
      },
    );
    req.on("error", (err) => resolve(probeNetworkError(err)));
    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false, reason: "network", message: "连接超时" });
    });
    req.write(data);
    req.end();
  });
}

// ====== 完整检测流程 ======

/**
 * 检测 provider：验证 API Key + 返回可用模型列表。
 *
 * 流程：
 * 1. 用第一个测试模型快速验证 Key（auth_failed → 直接失败）
 * 2. Key 有效 → 返回该 provider 的预定义模型列表
 */
export async function detectProviderModels(
  providerId: string,
  apiKey: string,
  baseUrl?: string,
): Promise<DetectResult> {
  const resolvedBaseUrl = baseUrl || PROVIDER_BASE_URLS[providerId] || "";
  if (!resolvedBaseUrl && providerId !== "ollama") {
    return { success: false, error: "未知的 Provider，请提供 Base URL", models: [] };
  }

  const testModels = PROVIDER_TEST_MODELS[providerId] ?? [];

  // Ollama 特殊处理：从 /api/tags 获取模型列表
  if (providerId === "ollama") {
    return detectOllamaModels(resolvedBaseUrl);
  }

  // 无预定义测试模型（openai-compatible 等）→ 尝试 GET /models
  if (testModels.length === 0) {
    return detectViaModelsList(providerId, apiKey, resolvedBaseUrl);
  }

  // Phase 1: 快速验证 Key
  const firstModel = testModels[0]!;
  log.info(`[${providerId}] 验证 API Key (${firstModel})...`);
  const firstProbe = await probeModel(providerId, firstModel, apiKey, resolvedBaseUrl);

  if (!firstProbe.ok && firstProbe.fatal) {
    return { success: false, error: firstProbe.message ?? "API Key 验证失败", models: [] };
  }

  if (!firstProbe.ok && firstProbe.reason === "network") {
    return { success: false, error: firstProbe.message ?? "网络错误", models: [] };
  }

  // Phase 2: Key 有效，返回预定义模型列表
  // （简化版：不逐个探测，直接返回注册表中的模型）
  log.info(`[${providerId}] Key 有效，加载模型列表`);
  const models = getProviderModels(providerId);
  return { success: true, models };
}

/** Ollama：GET /api/tags 获取本地模型 */
async function detectOllamaModels(baseUrl: string): Promise<DetectResult> {
  try {
    const ollamaBase = baseUrl.replace(/\/v1\/?$/, "");
    const resp = await fetch(`${ollamaBase}/api/tags`, { signal: AbortSignal.timeout(5000) });
    if (!resp.ok) return { success: false, error: "Ollama 服务未响应", models: [] };
    const data = (await resp.json()) as { models?: Array<{ name: string }> };
    const models = (data.models ?? []).map((m) => ({ id: m.name, name: m.name }));
    return { success: true, models };
  } catch {
    return { success: false, error: "无法连接 Ollama，请确认服务已启动", models: [] };
  }
}

/** 通用：GET /models 获取模型列表（用于 openai-compatible 等） */
async function detectViaModelsList(
  providerId: string,
  apiKey: string,
  baseUrl: string,
): Promise<DetectResult> {
  try {
    const resp = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10000),
    });
    if (resp.status === 401 || resp.status === 403) {
      return { success: false, error: "API Key 无效", models: [] };
    }
    if (!resp.ok) return { success: false, error: `请求失败 (${resp.status})`, models: [] };
    const data = (await resp.json()) as { data?: Array<{ id: string }> };
    const models = (data.data ?? []).map((m) => ({ id: m.id, name: m.id }));
    return { success: true, models };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err), models: [] };
  }
}

// ====== 预定义模型列表 ======

/** 返回 provider 的预定义模型列表（从 clawdbot 的 PROVIDER_CAPABILITY_MAPPINGS 简化） */
export function getProviderModels(
  providerId: string,
): Array<{ id: string; name: string; input?: Array<"text" | "image"> }> {
  const mapping: Record<
    string,
    Array<{ id: string; name: string; input?: Array<"text" | "image"> }>
  > = {
    "kimi-coding": [{ id: "kimi-for-coding", name: "Kimi for Coding", input: ["text", "image"] }],
    "aliyun-codeplan": [
      // 纯代码模型——不支持图片
      { id: "qwen3-coder-plus", name: "Qwen3 Coder Plus", input: ["text"] },
      { id: "qwen3-coder-next", name: "Qwen3 Coder Next", input: ["text"] },
      // 多模态模型——支持图片
      { id: "qwen3.5-plus", name: "Qwen 3.5 Plus", input: ["text", "image"] },
      { id: "qwen3-max", name: "Qwen3 Max", input: ["text", "image"] },
      { id: "glm-5", name: "GLM-5", input: ["text", "image"] },
      { id: "glm-4.7", name: "GLM 4.7", input: ["text", "image"] },
      { id: "kimi-k2.5", name: "Kimi K2.5", input: ["text", "image"] },
      { id: "MiniMax-M2.5", name: "MiniMax M2.5", input: ["text", "image"] },
    ],
    "glm-codeplan": [
      { id: "glm-4-flash", name: "GLM-4 Flash" },
      { id: "glm-5", name: "GLM-5" },
    ],
    "minimax-codeplan": [{ id: "MiniMax-M2.5", name: "MiniMax M2.5" }],
    "volcengine-plan": [
      { id: "ark-code-latest", name: "Ark Code (推荐)", input: ["text"] },
      { id: "doubao-seed-code", name: "Doubao Seed Code", input: ["text"] },
      { id: "glm-4.7", name: "GLM 4.7 Coding", input: ["text", "image"] },
      { id: "kimi-k2-thinking", name: "Kimi K2 Thinking", input: ["text"] },
      { id: "kimi-k2.5", name: "Kimi K2.5 Coding", input: ["text", "image"] },
    ],
    "aliyun-bailian": [
      { id: "qwen-turbo", name: "Qwen Turbo" },
      { id: "qwen-plus", name: "Qwen Plus" },
      { id: "qwen-max", name: "Qwen Max" },
      { id: "qwen3.5-plus", name: "Qwen 3.5 Plus" },
      { id: "qwen3.5-flash", name: "Qwen 3.5 Flash" },
      { id: "qwen-vl-max", name: "Qwen VL Max" },
    ],
    "volcengine-ark": [
      { id: "doubao-1.5-pro-256k", name: "豆包 1.5 Pro" },
      { id: "doubao-seed-2-0-pro-260215", name: "豆包 Seed 2.0 Pro" },
    ],
    siliconflow: [
      { id: "deepseek-ai/DeepSeek-V3", name: "DeepSeek V3" },
      { id: "Qwen/Qwen2.5-7B-Instruct", name: "Qwen 2.5 7B" },
      { id: "Qwen/Qwen2-VL-72B-Instruct", name: "Qwen2 VL 72B" },
      { id: "BAAI/bge-m3", name: "BGE-M3 Embedding" },
      { id: "Kwai-Kolors/Kolors", name: "Kolors 图片生成" },
      { id: "Wan-AI/Wan2.2-I2V-A14B", name: "Wan 2.2 视频生成" },
    ],
    deepseek: [
      { id: "deepseek-chat", name: "DeepSeek V3" },
      { id: "deepseek-reasoner", name: "DeepSeek R1" },
    ],
    glm: [
      { id: "glm-4-flash", name: "GLM-4 Flash (免费)" },
      { id: "glm-5", name: "GLM-5" },
      { id: "glm-4v-plus", name: "GLM-4V Plus" },
      { id: "cogview-4-plus", name: "CogView 4 Plus" },
      { id: "embedding-3", name: "Embedding-3" },
    ],
    moonshot: [
      { id: "moonshot-v1-auto", name: "Moonshot Auto" },
      { id: "kimi-k2.5", name: "Kimi K2.5" },
    ],
    minimax: [
      { id: "MiniMax-Text-01", name: "MiniMax Text 01" },
      { id: "MiniMax-M2.5", name: "MiniMax M2.5" },
    ],
    "tencent-hunyuan": [
      { id: "hunyuan-lite", name: "混元 Lite" },
      { id: "hunyuan-pro", name: "混元 Pro" },
    ],
    "ant-ling": [
      { id: "ling-lite", name: "百灵 Lite (免费)" },
      { id: "ling-1t", name: "百灵 1T (免费)" },
    ],
    "meituan-longcat": [{ id: "longcat-flash-chat", name: "LongCat Flash (免费)" }],
    openai: [
      { id: "gpt-4o-mini", name: "GPT-4o Mini" },
      { id: "gpt-4o", name: "GPT-4o" },
      { id: "gpt-4.1", name: "GPT-4.1" },
      { id: "o4-mini", name: "o4-mini" },
    ],
    anthropic: [
      { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5" },
      { id: "claude-sonnet-4-6-20250514", name: "Claude Sonnet 4.6" },
      { id: "claude-opus-4-6-20250514", name: "Claude Opus 4.6" },
    ],
    google: [
      { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash" },
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" },
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
    ],
    nvidia: [
      { id: "meta/llama-3.1-8b-instruct", name: "Llama 3.1 8B" },
      { id: "meta/llama-3.1-70b-instruct", name: "Llama 3.1 70B" },
    ],
    openrouter: [
      { id: "openrouter/auto", name: "Auto (自动选择)" },
      { id: "anthropic/claude-sonnet-4-6", name: "Claude Sonnet 4.6" },
      { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash" },
    ],
  };
  return mapping[providerId] ?? [];
}

// ====== 连接测试 ======

export async function testProviderConnection(
  providerId: string,
  apiKey: string,
  baseUrl?: string,
): Promise<{ success: boolean; status: string; message?: string }> {
  const resolvedBaseUrl = baseUrl || PROVIDER_BASE_URLS[providerId] || "";
  const testModels = PROVIDER_TEST_MODELS[providerId] ?? [];

  if (providerId === "ollama") {
    const result = await probeOllama(resolvedBaseUrl);
    return { success: result.ok, status: result.ok ? "normal" : "down", message: result.message };
  }

  if (testModels.length === 0) {
    // GET /models
    try {
      const resp = await fetch(`${resolvedBaseUrl}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(8000),
      });
      if (resp.ok) return { success: true, status: "normal" };
      if (resp.status === 401 || resp.status === 403)
        return { success: false, status: "auth_invalid" };
      return { success: false, status: "down" };
    } catch {
      return { success: false, status: "down", message: "连接超时" };
    }
  }

  const result = await probeModel(providerId, testModels[0]!, apiKey, resolvedBaseUrl);
  if (result.ok) return { success: true, status: "normal" };
  if (result.reason === "auth_failed") return { success: false, status: "auth_invalid" };
  return { success: false, status: "down", message: result.message };
}
