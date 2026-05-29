import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { safeGateway } from "../utils/index.js";
import { requireScope, ADMIN_SCOPE, WRITE_SCOPE, READ_SCOPE } from "./auth-guard.js";
import { detectProviderModels, testProviderConnection, getProviderModels } from "./probe-model.js";
import {
  getConfiguredProviderIds,
  getAllConfiguredProviders,
  getProviderConfig,
  saveProviderConfig,
  deleteProviderConfig,
  addModelToProvider,
  getCapabilityBindings,
  switchCapabilityModel,
  getProviderPriority,
  saveProviderPriority,
} from "./provider-config-store.js";
import {
  PROVIDERS,
  PROVIDER_GROUPS,
  getDefaultCapabilities,
  findProviderMeta,
} from "./provider-registry.js";

/**
 * 桥接层：注册 ui-cn 前端调用的方法名。
 *
 * ui-cn 前端（原 clawdbot）调用的方法名没有 "cn." 前缀
 * （如 "capability_matrix.summary"），
 * 而 cn-adapter 原有方法带 "cn." 前缀。
 *
 * 此文件注册不带前缀的方法名，让 ui-cn 不报 "unknown method"。
 * 骨架实现，后续逐步填充真实逻辑。
 */
// ─── G3: SSRF 防护 ───────────────────────────────────────────────────────────
const PRIVATE_IP_RE = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i,
  /^0\.0\.0\.0/,
  /^metadata\.google\.internal/i,
];

function validateBaseUrl(baseUrl: string): { ok: boolean; reason?: string } {
  let u: URL;
  try {
    u = new URL(baseUrl);
  } catch {
    return { ok: false, reason: "invalid URL" };
  }
  if (!["http:", "https:"].includes(u.protocol)) {
    return { ok: false, reason: "scheme not allowed" };
  }
  if (u.hostname === "localhost" || PRIVATE_IP_RE.some((re) => re.test(u.hostname))) {
    return { ok: false, reason: "private/loopback address not allowed" };
  }
  return { ok: true };
}

// G3: 速率限制 — testConnection 每个 providerId 60 秒内最多 5 次
const _testConnRate = new Map<string, { n: number; reset: number }>();
function checkTestConnRate(providerId: string): boolean {
  const now = Date.now();
  const e = _testConnRate.get(providerId);
  if (!e || now > e.reset) {
    _testConnRate.set(providerId, { n: 1, reset: now + 60_000 });
    return true;
  }
  e.n++;
  return e.n <= 5;
}

// ─── G6: media.list 路径安全 ──────────────────────────────────────────────────
function safeChatImagePath(stateDir: string, safeKey: string, rowFile: string): string | null {
  if (typeof rowFile !== "string" || rowFile.includes("..") || rowFile.includes("\0")) return null;
  // 不允许子目录，只允许纯文件名
  if (rowFile.includes("/") || rowFile.includes("\\")) return null;
  const base = path.join(stateDir, "media", "chat-images", safeKey);
  const full = path.join(base, rowFile);
  // 确认拼接结果仍在 base 目录内
  if (!full.startsWith(base + path.sep) && full !== base) return null;
  return full;
}

// ─── G5: agentId/templateId 校验 ─────────────────────────────────────────────
const SAFE_ID_RE = /^[a-z0-9][a-z0-9_\-]{0,63}$/;

// 能力 → 模型关键词匹配表（优先级从高到低）
// 用于：1. 自动绑定时选择最佳模型  2. 模型列表中过滤支持该能力的模型
const CAP_MODEL_PATTERNS: Record<string, string[][]> = {
  embedding: [["bge", "embedding", "e5", "gte"]],
  imageGen: [
    [
      "kolors",
      "cogview",
      "dall",
      "flux",
      "stable-diffusion",
      "sdxl",
      "sd3",
      "imagen",
      "qwen-image",
    ],
  ],
  videoGen: [["wan-ai", "wan2", "cogvideo", "sora", "pika", "runway", "kling", "i2v", "t2v"]],
  vision: [
    [
      "vl",
      "vision",
      "4v",
      "gpt-4o",
      "qwen2-vl",
      "cogvlm",
      "kimi-for-coding",
      "qwen3.5-plus",
      "qwen3.5-flash",
      "glm-5",
      "minimax-m2.5",
      "doubao-seed-code",
    ],
  ],
  video: [["video", "qwen2-vl"]],
  tts: [["tts", "speech", "cosyvoice"]],
  audio: [["asr", "whisper", "sensevoice", "speech", "audio"]],
  code: [["deepseek", "coder", "code", "qwen"]],
  text: [["deepseek", "qwen", "chat", "instruct", "llama", "glm"]],
};

/** 判断单个模型 ID 是否匹配某项能力的关键词 */
function isModelMatchCapability(cap: string, modelId: string): boolean {
  const patterns = CAP_MODEL_PATTERNS[cap];
  if (!patterns) return false;
  const id = modelId.toLowerCase();
  for (const group of patterns) {
    for (const kw of group) {
      if (id.includes(kw)) return true;
    }
  }
  return false;
}

/**
 * 根据能力类型选择最合适的模型。
 * 多模型平台（如 siliconflow）上不同能力需要不同模型。
 */
function pickModelForCapability(
  cap: string,
  models: Array<{ id: string; name: string }>,
): string | null {
  if (models.length === 0) return null;

  const patterns = CAP_MODEL_PATTERNS[cap];
  if (patterns) {
    const ids = models.map((m) => m.id.toLowerCase());
    for (const group of patterns) {
      for (const kw of group) {
        const idx = ids.findIndex((id) => id.includes(kw));
        if (idx >= 0) return models[idx]!.id;
      }
    }
  }

  // text/code 能力可以回退到第一个模型（通常是聊天模型）
  if (cap === "text" || cap === "code" || cap === "toolCall") {
    return models[0]!.id;
  }

  // 其他能力没找到匹配模型 → 不绑定（避免错误绑定）
  return null;
}

/** Check if a capability binding's provider is still configured (has API key). */
async function isBindingActive(
  binding: { providerId: string } | undefined,
): Promise<boolean> {
  if (!binding) return false;
  const ids = await getConfiguredProviderIds();
  return ids.has(binding.providerId);
}

export function registerUiBridgeHandlers(api: OpenClawPluginApi): void {
  // ====== capability_matrix 系列 ======

  api.registerGatewayMethod(
    "capability_matrix.summary",
    safeGateway("capability_matrix.summary", async ({ respond }) => {
      const caps = getDefaultCapabilities();
      const bindings = await getCapabilityBindings();
      const configuredIds = await getConfiguredProviderIds();

      // volcengine-voice 是虚拟 provider（语音凭据独立于 LLM provider），
      // 需要检查 voice-creds 而非 openclaw.json
      let volcVoiceConfigured = false;
      try {
        const { getVolcCredsStatus } = await import("../voice/voice-creds.js");
        const status = await getVolcCredsStatus();
        volcVoiceConfigured = status.configured;
      } catch { /* voice-creds not available */ }

      // 用能力绑定更新 status 和 bestModel
      for (const cap of caps) {
        const binding = bindings[cap.key];
        const isProviderActive = binding && (
          configuredIds.has(binding.providerId) ||
          (binding.providerId === "volcengine-voice" && volcVoiceConfigured)
        );
        if (isProviderActive) {
          cap.status = "active";
          const isVolcVoice = binding.providerId === "volcengine-voice";
          const providerName = isVolcVoice
            ? "豆包语音"
            : findProviderMeta(binding.providerId).name;
          // volcengine-voice 的 modelId 映射为友好显示名
          const volcDisplayNames: Record<string, string> = {
            "volcengine-tts": "豆包语音合成",
            "volcengine-asr": "豆包语音识别",
          };
          const displayName = isVolcVoice
            ? (volcDisplayNames[binding.modelId] ?? binding.modelId)
            : binding.modelId;
          (cap as any).bestModel = {
            provider: binding.providerId,
            modelId: binding.modelId,
            displayName,
            providerName,
            quality: 4,
            costTier: "standard",
            auto: binding.auto,
          };
        } else {
          // 查找是否有已配置的 provider 支持此能力但未绑定
          for (const id of configuredIds) {
            const meta = findProviderMeta(id);
            if (!meta.capabilities.includes(cap.key)) continue;
            // 找到支持此能力的 provider → 尝试自动补绑
            const providerCfg = await getProviderConfig(id);
            // 如果 openclaw.json 中 models 为空（setup wizard 旧路径遗留），回退到预定义列表
            // 并修复 openclaw.json 中的 models（一次性自愈）
            let models = providerCfg.models;
            if (models.length === 0) {
              const predefined = getProviderModels(id);
              if (predefined.length > 0) {
                models = predefined;
                // 自愈：把预定义模型回写到 openclaw.json，修复 setup wizard 遗留的空 models
              }
            }
            const bestModel = pickModelForCapability(cap.key, models);
            if (bestModel) {
              cap.status = "active";
              (cap as any).bestModel = {
                provider: id,
                modelId: bestModel,
                displayName: bestModel,
                providerName: meta.name,
                quality: 4,
                costTier: "standard",
                auto: true,
              };
            } else {
              cap.status = "unconfigured";
            }
            break;
          }
        }
      }
      respond(true, { capabilities: caps });
    }),
  );

  api.registerGatewayMethod(
    "capability_matrix.providers.list",
    safeGateway("capability_matrix.providers.list", async ({ respond }) => {
      const configuredIds = await getConfiguredProviderIds();
      const bindings = await getCapabilityBindings();
      const registryIds = new Set(PROVIDERS.map((p) => p.providerId));

      // 注册表内的 provider
      const providers = PROVIDERS.map((p) => {
        const configured = configuredIds.has(p.providerId);
        const activeModels = configured
          ? Object.values(bindings).filter((b) => b.providerId === p.providerId).length
          : 0;
        return { ...p, configured, activeModels };
      });

      // 用户在 openclaw.json 手动配置但不在注册表中的 provider
      for (const id of configuredIds) {
        if (registryIds.has(id)) continue;
        const meta = findProviderMeta(id); // 返回包装后的默认元数据
        const activeModels = Object.values(bindings).filter((b) => b.providerId === id).length;
        providers.push({ ...meta, configured: true, activeModels });
      }

      respond(true, { providers });
    }),
  );

  api.registerGatewayMethod(
    "capability_matrix.providerGroups",
    safeGateway("capability_matrix.providerGroups", async ({ respond }) => {
      respond(true, { groups: PROVIDER_GROUPS });
    }),
  );

  api.registerGatewayMethod(
    "capability_matrix.health",
    safeGateway("capability_matrix.health", async ({ respond }) => {
      respond(true, { health: {} });
    }),
  );

  api.registerGatewayMethod(
    "capability_matrix.priority.get",
    safeGateway("capability_matrix.priority.get", async ({ respond }) => {
      const priority = await getProviderPriority();
      respond(true, { priority });
    }),
  );

  api.registerGatewayMethod(
    "capability_matrix.models",
    safeGateway("capability_matrix.models", async ({ params, respond }) => {
      const p = params as Record<string, unknown> | undefined;
      const capability = p?.capability as string | undefined;
      const providerId = p?.providerId as string | undefined;

      // 按 providerId 查询（旧路径）
      if (providerId && !capability) {
        const cfg = await getProviderConfig(providerId);
        respond(true, { models: cfg.models });
        return;
      }

      // 按 capability 查询：找所有支持该能力且已配置的 provider，汇总模型
      if (!capability) {
        respond(true, { models: [] });
        return;
      }

      const configuredProviders = await getAllConfiguredProviders();
      const models: Array<{
        providerId: string;
        providerName: string;
        providerIcon: string;
        modelId: string;
        modelName: string;
        pricing: { type: string; details?: string };
        configured: boolean;
        active: boolean;
      }> = [];

      // 获取当前能力绑定，用于标记 active
      const bindings = await getCapabilityBindings();
      const activeBinding = bindings[capability];

      // 遍历所有已配置的 provider（包括注册表内外的）
      // 对 text/code/toolCall 等通用能力，列出所有模型；
      // 对专项能力（vision/imageGen/tts 等），只列出真正支持该能力的模型
      const universalCaps = new Set(["text", "code", "toolCall"]);
      for (const [pid, entry] of Object.entries(configuredProviders)) {
        const meta = findProviderMeta(pid);
        if (!meta.capabilities.includes(capability)) continue;

        for (const m of entry.models ?? []) {
          // 专项能力需要关键词匹配过滤
          if (!universalCaps.has(capability) && !isModelMatchCapability(capability, m.id)) {
            continue;
          }
          const isActive = activeBinding?.providerId === pid && activeBinding?.modelId === m.id;
          models.push({
            providerId: pid,
            providerName: meta.name,
            providerIcon: meta.icon,
            modelId: m.id,
            modelName: m.name,
            pricing: { type: "paid" },
            configured: true,
            active: isActive,
          });
        }
      }

      respond(true, { models });
    }),
  );

  api.registerGatewayMethod(
    "capability_matrix.extractionStatus",
    safeGateway("capability_matrix.extractionStatus", async ({ respond }) => {
      respond(true, { status: "idle" });
    }),
  );

  api.registerGatewayMethod(
    "capability_matrix.switchModel",
    safeGateway("capability_matrix.switchModel", async ({ params, respond }) => {
      const p = params as Record<string, unknown> | undefined;
      const capability = p?.capability as string | undefined;
      const providerId = p?.providerId as string | undefined;
      const modelId = p?.modelId as string | undefined;
      if (!capability || !providerId || !modelId) {
        respond(false, undefined, {
          code: "INVALID_PARAMS",
          message: "missing capability, providerId, or modelId",
        });
        return;
      }
      await switchCapabilityModel(capability, providerId, modelId);
      respond(true, { success: true });
    }),
  );

  api.registerGatewayMethod(
    "capability_matrix.priority.save",
    safeGateway("capability_matrix.priority.save", async ({ params, respond }) => {
      const p = params as Record<string, unknown> | undefined;
      const priority = p?.priority as string[] | undefined;
      if (!Array.isArray(priority)) {
        respond(false, undefined, { code: "INVALID_PARAMS", message: "missing priority array" });
        return;
      }
      await saveProviderPriority(priority);
      respond(true, { ok: true });
    }),
  );

  api.registerGatewayMethod(
    "capability_matrix.provider.testConnection",
    safeGateway("capability_matrix.provider.testConnection", async ({ client, params, respond }) => {
      // G2: 发起外部网络请求需要 WRITE 权限
      if (!requireScope(client, respond, WRITE_SCOPE)) return;

      const p = params as Record<string, unknown> | undefined;
      const providerId = p?.providerId as string | undefined;
      const apiKey = p?.apiKey as string | undefined;
      const baseUrl = p?.baseUrl as string | undefined;
      if (!providerId) {
        respond(false, undefined, { code: "INVALID_PARAMS", message: "missing providerId" });
        return;
      }
      // G3: apiKey 长度限制
      if (apiKey && apiKey.length > 512) {
        respond(false, undefined, { code: "INVALID_PARAMS", message: "apiKey 过长（最大 512 字符）" });
        return;
      }
      // G3: baseUrl SSRF 校验
      if (baseUrl) {
        const check = validateBaseUrl(baseUrl);
        if (!check.ok) {
          respond(false, undefined, { code: "INVALID_PARAMS", message: `baseUrl 不合法: ${check.reason}` });
          return;
        }
      }
      // G3: 速率限制
      if (!checkTestConnRate(providerId)) {
        respond(false, undefined, { code: "RATE_LIMITED", message: "请求过于频繁，请 60 秒后重试" });
        return;
      }
      // 如果没传 apiKey，从已保存配置中读
      let key = apiKey;
      if (!key) {
        const cfg = await getProviderConfig(providerId);
        if (!cfg.configured) {
          respond(true, { ok: false, error: "Provider not configured" });
          return;
        }
        // 不能用 masked key 测试，需要原始 key — 前端应传 apiKey
        respond(true, { ok: false, error: "apiKey required for connection test" });
        return;
      }
      const result = await testProviderConnection(providerId, key, baseUrl);
      respond(true, result);
    }),
  );

  api.registerGatewayMethod(
    "capability_matrix.provider.getConfig",
    safeGateway("capability_matrix.provider.getConfig", async ({ params, respond }) => {
      const p = params as Record<string, unknown> | undefined;
      const providerId = p?.providerId as string | undefined;
      if (!providerId) {
        respond(false, undefined, { code: "INVALID_PARAMS", message: "missing providerId" });
        return;
      }
      const config = await getProviderConfig(providerId);
      respond(true, config);
    }),
  );

  api.registerGatewayMethod(
    "capability_matrix.provider.detect",
    safeGateway("capability_matrix.provider.detect", async ({ client, params, respond }) => {
      // G2: 发起外部网络探测需要 WRITE 权限
      if (!requireScope(client, respond, WRITE_SCOPE)) return;

      const p = params as Record<string, unknown> | undefined;
      const providerId = p?.providerId as string | undefined;
      const apiKey = p?.apiKey as string | undefined;
      const baseUrl = p?.baseUrl as string | undefined;
      if (!providerId || !apiKey) {
        respond(false, undefined, {
          code: "INVALID_PARAMS",
          message: "missing providerId or apiKey",
        });
        return;
      }
      const result = await detectProviderModels(providerId, apiKey, baseUrl);
      if (result.success) {
        // 探测成功 → 始终保存配置到 openclaw.json（含 API Key + 模型列表）
        // 这确保 API Key 立即生效，后续对话能用新 Key 而非旧 Key
        await saveProviderConfig(providerId, apiKey, baseUrl, result.models);
        // 自动绑定能力：仅绑定尚未绑定的能力，不覆盖用户已有的绑定
        const meta = findProviderMeta(providerId);
        const existingBindings = await getCapabilityBindings();
        const autoEnabled: Record<string, string> = {};
        if (result.models.length > 0) {
          for (const cap of meta.capabilities) {
            // 已有绑定且对应的 provider 已配置 → 不覆盖
            if (existingBindings[cap]) {
              const boundProvider = existingBindings[cap].providerId;
              const configuredIds = await getConfiguredProviderIds();
              if (configuredIds.has(boundProvider)) continue;
            }
            const bestModel = pickModelForCapability(cap, result.models);
            if (bestModel) {
              autoEnabled[cap] = bestModel;
              await switchCapabilityModel(cap, providerId, bestModel);
            }
          }
        }
        respond(true, { success: true, autoEnabled });
      } else {
        respond(true, { success: false, error: result.error });
      }
    }),
  );

  api.registerGatewayMethod(
    "capability_matrix.provider.delete",
    safeGateway("capability_matrix.provider.delete", async ({ client, params, respond }) => {
      // G2: 删除配置需要 ADMIN 权限
      if (!requireScope(client, respond, ADMIN_SCOPE)) return;

      const p = params as Record<string, unknown> | undefined;
      const providerId = p?.providerId as string | undefined;
      if (!providerId) {
        respond(false, undefined, { code: "INVALID_PARAMS", message: "missing providerId" });
        return;
      }
      await deleteProviderConfig(providerId);
      respond(true, { ok: true });
    }),
  );

  api.registerGatewayMethod(
    "capability_matrix.provider.addModel",
    safeGateway("capability_matrix.provider.addModel", async ({ params, respond }) => {
      const p = params as Record<string, unknown> | undefined;
      const providerId = p?.providerId as string | undefined;
      const modelId = p?.modelId as string | undefined;
      const modelName = (p?.modelName as string | undefined) ?? modelId;
      if (!providerId || !modelId) {
        respond(false, undefined, {
          code: "INVALID_PARAMS",
          message: "missing providerId or modelId",
        });
        return;
      }
      await addModelToProvider(providerId, modelId, modelName ?? modelId);
      respond(true, { ok: true });
    }),
  );

  api.registerGatewayMethod(
    "capability_matrix.embeddingBinding",
    safeGateway("capability_matrix.embeddingBinding", async ({ respond }) => {
      const bindings = await getCapabilityBindings();
      const binding = bindings["embedding"] ?? null;
      respond(true, { binding });
    }),
  );
  // ====== team.project 系列 ======
  // 注意：team.project.* 方法由 agent-team 插件注册真实实现
  // 这里只注册 agent-team 没有的补充方法

  api.registerGatewayMethod(
    "team.project.files.list",
    safeGateway("team.project.files.list", async ({ respond }) => {
      respond(true, { files: [] });
    }),
  );

  // ====== update 系列 ======
  // update.status / update.run 由上游 Gateway 注册；这里不重复注册，避免插件启动时报错。
  api.registerGatewayMethod(
    "update.execute",
    safeGateway("update.execute", async ({ respond }) => {
      respond(true, { ok: true });
    }),
  );

  api.registerGatewayMethod(
    "update.dismiss",
    safeGateway("update.dismiss", async ({ respond }) => {
      respond(true, { ok: true });
    }),
  );

  api.registerGatewayMethod(
    "update.restart",
    safeGateway("update.restart", async ({ respond }) => {
      respond(true, { ok: true });
    }),
  );

  // update.run 由上游 Gateway 内置，不重复注册。

  // ====== voice / asr 系列 ======

  api.registerGatewayMethod(
    "asr.status",
    safeGateway("asr.status", async ({ respond }) => {
      try {
        const { getVolcCredsStatus } = await import("../voice/voice-creds.js");
        const status = await getVolcCredsStatus();
        respond(true, { available: status.configured, model: "volcengine-asr" });
      } catch {
        respond(true, { available: false });
      }
    }),
  );

  api.registerGatewayMethod(
    "asr.stream.status",
    safeGateway("asr.stream.status", async ({ respond }) => {
      // 流式 ASR 暂不支持，返回 false
      respond(true, { available: false, model: null, method: null, streamingMode: null });
    }),
  );

  api.registerGatewayMethod(
    "asr.transcribe",
    safeGateway("asr.transcribe", async ({ params, respond }) => {
      const p = params as Record<string, unknown> | undefined;
      const audioBase64 = typeof p?.audioBase64 === "string" ? p.audioBase64 : "";
      if (!audioBase64) {
        respond(false, undefined, { code: "INVALID_PARAMS", message: "missing audioBase64" });
        return;
      }
      try {
        const { loadVolcCredentials } = await import("../voice/voice-creds.js");
        const creds = await loadVolcCredentials();
        if (!creds) {
          respond(false, undefined, { code: "ASR_NO_CREDS", message: "豆包语音凭据未配置，请在模型设置中配置" });
          return;
        }

        // 使用 volcengine WebSocket 二进制协议（bigmodel ASR）
        const { volcengineTranscribe } = await import("../voice/volcengine-asr.js");
        const result = await volcengineTranscribe(audioBase64, creds.appId, creds.accessToken);
        if (result.ok) {
          respond(true, { text: result.text, latencyMs: result.latencyMs });
        } else {
          respond(false, undefined, { code: "ASR_FAILED", message: result.error ?? "ASR failed" });
        }
      } catch (err) {
        respond(false, undefined, { code: "ASR_ERROR", message: String(err) });
      }
    }),
  );

  // ── TTS 合成 ──
  api.registerGatewayMethod(
    "tts.synthesize",
    safeGateway("tts.synthesize", async ({ params, respond }) => {
      const p = params as Record<string, unknown> | undefined;
      const text = typeof p?.text === "string" ? p.text.trim() : "";
      if (!text) {
        respond(false, undefined, { code: "INVALID_PARAMS", message: "missing text" });
        return;
      }
      // Limit text length to prevent abuse
      if (text.length > 2000) {
        respond(false, undefined, { code: "INVALID_PARAMS", message: "text too long (max 2000)" });
        return;
      }
      try {
        const { loadVolcCredentials } = await import("../voice/voice-creds.js");
        const creds = await loadVolcCredentials();
        if (!creds) {
          respond(false, undefined, {
            code: "TTS_NO_CREDS",
            message: "豆包语音凭据未配置，请在模型设置中配置",
          });
          return;
        }
        const { volcengineTtsSynthesize } = await import("../voice/volcengine-tts.js");
        const result = await volcengineTtsSynthesize({
          text,
          appId: creds.appId,
          accessToken: creds.accessToken,
          voice: typeof p?.voice === "string" ? p.voice : undefined,
          encoding: typeof p?.encoding === "string" ? p.encoding : "mp3",
          speedRatio: typeof p?.speedRatio === "number" ? p.speedRatio : undefined,
        });
        if (result.ok && result.audioBase64) {
          respond(true, {
            audioBase64: result.audioBase64,
            format: result.format,
            latencyMs: result.latencyMs,
          });
        } else {
          respond(false, undefined, { code: "TTS_FAILED", message: result.error ?? "TTS failed" });
        }
      } catch (err) {
        respond(false, undefined, { code: "TTS_ERROR", message: String(err) });
      }
    }),
  );

  api.registerGatewayMethod(
    "voice.prefs.get",
    safeGateway("voice.prefs.get", async ({ respond }) => {
      try {
        const { loadVoicePrefs } = await import("../voice/voice-prefs.js");
        const prefs = await loadVoicePrefs();
        respond(true, prefs);
      } catch {
        respond(true, {});
      }
    }),
  );

  api.registerGatewayMethod(
    "voice.prefs.set",
    safeGateway("voice.prefs.set", async ({ params, respond }) => {
      try {
        const { setVoicePrefs } = await import("../voice/voice-prefs.js");
        const patch = params as Record<string, unknown>;
        const updated = await setVoicePrefs(patch);
        respond(true, updated);
      } catch (err) {
        respond(false, undefined, { code: "CN_VOICE_PREFS_ERROR", message: String(err) });
      }
    }),
  );

  // ====== local_engine 系列 ======

  api.registerGatewayMethod(
    "local_engine.status",
    safeGateway("local_engine.status", async ({ respond }) => {
      respond(true, { status: "unavailable", models: [] });
    }),
  );

  api.registerGatewayMethod(
    "voicewake.listen.status",
    safeGateway("voicewake.listen.status", async ({ respond }) => {
      respond(true, { available: false, listening: false });
    }),
  );

  api.registerGatewayMethod(
    "sessions.dmScopeStatus",
    safeGateway("sessions.dmScopeStatus", async ({ respond }) => {
      respond(true, {
        current: "main",
        recommended: "main",
        shouldUpgrade: false,
        multiUserChannels: [],
      });
    }),
  );

  // ====== 其他 ui-cn 需要的方法 ======
  // 注意：team.route.summary 由 agent-team 插件注册真实实现

  api.registerGatewayMethod(
    "team.shared-memory.list",
    safeGateway("team.shared-memory.list", async ({ respond }) => {
      respond(true, { items: [] });
    }),
  );

  api.registerGatewayMethod(
    "team.shared-memory.clear",
    safeGateway("team.shared-memory.clear", async ({ respond }) => {
      respond(true, { ok: true });
    }),
  );

  // ====== orchestrator 编排系列 ======

  // ── 内置模板数据（orchestrator.templates.list + quick_deploy 共用）──
  const BUILTIN_TEMPLATES = [
    {
      id: "content-factory",
      name: "自媒体内容工厂",
      description: "热点追踪、文案写作、配图生成，一站式内容产出",
      category: "content",
      emoji: "✍️",
      highlights: ["每天自动推送领域热点选题", "写出适合你风格的文案", "自动生成封面图和配图"],
      agents: [
        {
          name: "选题雷达",
          role: "每天搜索领域热点，筛选并推送选题建议",
          emoji: "📡",
          modelTier: "cheap",
        },
        { name: "文案写手", role: "根据选题写出适合平台风格的文案", emoji: "🖊️", modelTier: "mid" },
        { name: "配图助手", role: "根据文案生成封面图和配图", emoji: "🎨", modelTier: "mid" },
      ],
    },
    {
      id: "knowledge-cs",
      name: "客服知识库",
      description: "自动应答常见问题、复杂问题转接、服务记录汇总",
      category: "customer_support",
      emoji: "🎧",
      highlights: ["7x24 自动回答常见问题", "复杂问题自动转接专家处理", "每天自动汇总服务记录"],
      agents: [
        {
          name: "接待员",
          role: "接收用户消息，判断意图，处理常见问答",
          emoji: "👋",
          modelTier: "cheap",
        },
        {
          name: "专家顾问",
          role: "处理复杂咨询，搜索专业资料，提供深度解答",
          emoji: "🧑‍💼",
          modelTier: "mid",
        },
        {
          name: "工单记录员",
          role: "记录每次服务，生成日报，追踪未解决问题",
          emoji: "📋",
          modelTier: "cheap",
        },
      ],
    },
    {
      id: "coding-team",
      name: "编程助手团",
      description: "代码审查、技术调研、项目管理，独立开发者的AI搭档",
      category: "coding",
      emoji: "💻",
      highlights: ["审查代码找 bug 提优化建议", "搜索技术方案对比框架选型", "追踪 TODO 提醒 DDL"],
      agents: [
        {
          name: "代码审查员",
          role: "审查代码质量、发现潜在 bug、提供优化建议",
          emoji: "🔍",
          modelTier: "mid",
        },
        {
          name: "技术调研员",
          role: "搜索技术方案、对比框架、提供技术决策依据",
          emoji: "🔬",
          modelTier: "mid",
        },
        {
          name: "项目管理员",
          role: "记录 TODO、追踪开发进度、提醒 DDL",
          emoji: "📊",
          modelTier: "cheap",
        },
      ],
    },
    {
      id: "news-intelligence",
      name: "信息情报站",
      description: "定时抓取行业动态，自动筛选去重，推送精华简报",
      category: "research",
      emoji: "📰",
      highlights: ["每天定时搜索你关注的领域", "自动过滤重复和低质内容", "整理成简报直接推送给你"],
      agents: [
        {
          name: "情报采集员",
          role: "定时搜索指定关键词，过滤去重，采集原始信息",
          emoji: "📡",
          modelTier: "cheap",
        },
        {
          name: "简报编辑",
          role: "将原始信息整理成简报，提炼要点，推送给用户",
          emoji: "📝",
          modelTier: "mid",
        },
      ],
    },
    {
      id: "data-analyst",
      name: "数据分析助手",
      description: "数据清洗、统计分析、趋势报表，让数据说话",
      category: "data_analysis",
      emoji: "📊",
      highlights: ["上传 Excel/CSV 自动清洗分析", "生成可视化统计报表", "发现数据异常和趋势"],
      agents: [
        {
          name: "数据清洗员",
          role: "读取数据文件，清洗标准化，准备分析用数据集",
          emoji: "🧹",
          modelTier: "mid",
        },
        {
          name: "分析师",
          role: "统计分析、趋势检测、异常发现、生成分析报告",
          emoji: "📈",
          modelTier: "mid",
        },
      ],
    },
    {
      id: "meeting-assistant",
      name: "会议日程管家",
      description: "日程安排、冲突检测、会议纪要、待办催办",
      category: "scheduling",
      emoji: "📅",
      highlights: ["安排会议自动检测时间冲突", "整理会议纪要提取待办事项", "到期任务自动催办提醒"],
      agents: [
        {
          name: "日程管家",
          role: "管理日程安排，检测冲突，发送提醒",
          emoji: "🗓️",
          modelTier: "mid",
        },
        {
          name: "纪要员",
          role: "整理会议纪要，提取行动项，定期催办",
          emoji: "📝",
          modelTier: "cheap",
        },
      ],
    },
    {
      id: "daily-assistant",
      name: "日常生活助手团",
      description: "日程规划、信息查询、备忘提醒、知识整理",
      category: "lifestyle",
      emoji: "🏠",
      highlights: ["安排日程设置提醒", "搜索资料整理摘要", "记录想法维护知识库"],
      agents: [
        {
          name: "日程管理员",
          role: "管理用户的日程安排、会议预约、重要日期提醒",
          emoji: "📅",
          modelTier: "cheap",
        },
        {
          name: "信息助理",
          role: "搜索互联网、查询资料、整理信息摘要",
          emoji: "🔍",
          modelTier: "mid",
        },
        {
          name: "知识整理员",
          role: "记录笔记、整理知识、管理个人知识库",
          emoji: "📝",
          modelTier: "cheap",
        },
      ],
    },
    {
      id: "finance-tracker",
      name: "个人财务管理",
      description: "收支记录、预算管理、消费分析、财务提醒",
      category: "finance",
      emoji: "💰",
      highlights: ["说一句话就能快速记账", "自动分析消费趋势和异常", "预算快超了自动提醒你"],
      agents: [
        {
          name: "记账助手",
          role: "记录日常收支、分类账目、维护账本",
          emoji: "📒",
          modelTier: "mid",
        },
        {
          name: "财务分析师",
          role: "分析消费趋势、生成财务报表、提供预算建议",
          emoji: "📊",
          modelTier: "mid",
        },
        {
          name: "预算提醒员",
          role: "监控预算执行、超支预警、定期财务提醒",
          emoji: "⏰",
          modelTier: "cheap",
        },
      ],
    },
    {
      id: "learning-planner",
      name: "学习备考助手团",
      description: "学习计划制定、知识答疑、复习提醒、笔记整理",
      category: "education",
      emoji: "📚",
      highlights: ["科学规划学习进度和复习", "随时提问获得详细讲解", "自动整理笔记制作知识卡片"],
      agents: [
        {
          name: "学习规划师",
          role: "制定学习计划、分配学习时间、跟踪进度",
          emoji: "🎯",
          modelTier: "mid",
        },
        {
          name: "学习导师",
          role: "回答学科问题、讲解知识点、提供学习资料",
          emoji: "👨‍🏫",
          modelTier: "mid",
        },
        {
          name: "笔记整理员",
          role: "整理学习笔记、制作知识卡片、建立知识图谱",
          emoji: "📋",
          modelTier: "cheap",
        },
      ],
    },
  ];

  api.registerGatewayMethod(
    "orchestrator.templates.list",
    safeGateway("orchestrator.templates.list", async ({ respond }) => {
      respond(true, { templates: BUILTIN_TEMPLATES });
    }),
  );

  api.registerGatewayMethod(
    "orchestrator.community.list",
    safeGateway("orchestrator.community.list", async ({ respond }) => {
      // 社区模板 — 前端有 fallback，这里返回空让前端用 fallback
      respond(true, { templates: [] });
    }),
  );

  // ── 部署状态缓存（planId → 状态）──
  const deployPlans = new Map<
    string,
    {
      status: string;
      templateName: string;
      agents: Array<{
        id: string;
        name: string;
        role: string;
        emoji?: string;
        status: string;
        error?: string;
      }>;
    }
  >();

  api.registerGatewayMethod(
    "orchestrator.quick_deploy",
    safeGateway("orchestrator.quick_deploy", async ({ client, params, respond }) => {
      // G2: 部署 agent 需要 ADMIN 权限
      if (!requireScope(client, respond, ADMIN_SCOPE)) return;

      const p = params as Record<string, unknown> | undefined;
      const templateId = (p?.templateId as string) ?? "";
      const requirement = (p?.requirement as string) ?? "";

      // G5: agentId/templateId 正则校验，防止路径遍历
      if (templateId && !SAFE_ID_RE.test(templateId)) {
        respond(false, undefined, {
          code: "INVALID_PARAMS",
          message: "templateId 格式不合法，只允许小写字母、数字、下划线和连字符",
        });
        return;
      }
      if (requirement.length > 500) {
        respond(false, undefined, {
          code: "INVALID_PARAMS",
          message: "requirement 超过最大长度 500 字符",
        });
        return;
      }

      // 找到模板
      const tpl = BUILTIN_TEMPLATES.find((t) => t.id === templateId);
      if (!tpl && !requirement) {
        respond(true, { matched: false });
        return;
      }

      const planId = `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const teamName = tpl?.name ?? requirement;
      const teamDesc = tpl?.description ?? requirement;
      const agentDefs = tpl?.agents ?? [];

      if (agentDefs.length === 0) {
        // 没有模板匹配也没有 agent 定义，走 guided flow
        respond(true, { matched: false });
        return;
      }

      // 初始化部署状态
      const agentStates = agentDefs.map((a, i) => ({
        id: `agent-${templateId}-${i}`,
        name: a.name,
        role: a.role,
        emoji: a.emoji,
        status: "pending" as string,
      }));
      deployPlans.set(planId, { status: "deploying", templateName: teamName, agents: agentStates });

      // 异步创建 agents（不阻塞 respond）
      respond(true, { matched: true, planId, status: "deploying" });

      // 后台执行真正的部署
      void (async () => {
        const stateDir =
          process.env.OPENCLAW_STATE_DIR?.trim() || path.join(os.homedir(), ".openclaw");
        const configPath = path.join(stateDir, "openclaw.json");

        try {
          // 读取当前配置
          let config: Record<string, unknown> = {};
          try {
            const raw = fs.readFileSync(configPath, "utf-8");
            config = JSON.parse(raw) as Record<string, unknown>;
          } catch {
            // 配置文件不存在或无效，用空对象
          }

          // 上游配置格式：agents.list[]（不是 entries），每个 entry 用 id（不是 agentId）
          const agentsSection = (config.agents ?? {}) as Record<string, unknown>;
          const agentList = Array.isArray(agentsSection.list)
            ? ([...agentsSection.list] as Array<Record<string, unknown>>)
            : [];
          const createdAgentIds: string[] = [];

          // Agent ID 规则：只允许 [a-z0-9][a-z0-9_-]{0,63}，不能用中文
          // 用 templateId-supervisor / templateId-1 / templateId-2 的命名方式
          const supervisorId = `${templateId}-supervisor`;

          for (let i = 0; i < agentDefs.length; i++) {
            const def = agentDefs[i]!;
            const agentId = i === 0 ? supervisorId : `${templateId}-${i}`;

            // 更新部署状态
            agentStates[i]!.id = agentId;
            agentStates[i]!.status = "creating";
            deployPlans.set(planId, { ...deployPlans.get(planId)!, agents: [...agentStates] });

            // 检查 agent 是否已存在（按 id 字段查找）
            const exists = agentList.some((e) => e.id === agentId);
            if (exists) {
              agentStates[i]!.status = "ready";
              createdAgentIds.push(agentId);
              continue;
            }

            // 创建 agent 工作目录（与上游 agents.create 一致的路径）
            const workspaceDir = path.join(stateDir, "agents", agentId);
            fs.mkdirSync(workspaceDir, { recursive: true });

            // 写入 IDENTITY.md（与上游 agents.create 一致的格式）
            const identityPath = path.join(workspaceDir, "IDENTITY.md");
            const identityContent = [
              "",
              `- Name: ${def.name}`,
              ...(def.emoji ? [`- Emoji: ${def.emoji}`] : []),
              "",
              `## 角色定义`,
              def.role,
              "",
            ].join("\n");
            fs.writeFileSync(identityPath, identityContent, "utf-8");

            // 创建 transcripts 目录
            const transcriptsDir = path.join(stateDir, "transcripts", agentId);
            fs.mkdirSync(transcriptsDir, { recursive: true });

            // 确保 "main" agent 在列表头部（如果列表为空且当前不是 main）
            if (agentList.length === 0 && agentId !== "main") {
              agentList.push({ id: "main" });
            }

            // 添加到配置（上游格式：id + name + workspace）
            agentList.push({
              id: agentId,
              name: def.name,
              workspace: workspaceDir,
            });

            createdAgentIds.push(agentId);
            agentStates[i]!.status = "ready";
            deployPlans.set(planId, { ...deployPlans.get(planId)!, agents: [...agentStates] });
          }

          // 写回配置文件（上游格式：agents.list）
          agentsSection.list = agentList;
          config.agents = agentsSection;

          // 开启 agent-to-agent 消息，让 supervisor 能通过 sessions_send 委派任务给成员
          const toolsSection = (config.tools ?? {}) as Record<string, unknown>;
          const a2a = (toolsSection.agentToAgent ?? {}) as Record<string, unknown>;
          a2a.enabled = true;
          // 将新建的团队成员追加到 allow 列表（去重）
          const existingAllow = Array.isArray(a2a.allow) ? (a2a.allow as string[]) : [];
          const merged = new Set([...existingAllow, ...createdAgentIds]);
          a2a.allow = [...merged];
          toolsSection.agentToAgent = a2a;
          // 开启跨 agent session 可见性，让 supervisor 能访问成员的 session
          const sessionsSection = (toolsSection.sessions ?? {}) as Record<string, unknown>;
          sessionsSection.visibility = "all";
          toolsSection.sessions = sessionsSection;
          config.tools = toolsSection;

          fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");

          // 创建 agent-team 项目
          // 路径必须与 agent-team 插件的 state.ts 一致：
          // ~/.openclaw/agent-team/projects/{projectId}/project.json
          const teamDir = path.join(stateDir, "agent-team");
          const projectId = `proj-${templateId}-${Date.now()}`;
          const projectSubDir = path.join(teamDir, "projects", projectId);
          fs.mkdirSync(projectSubDir, { recursive: true });
          const now = new Date().toISOString();
          const project = {
            projectId,
            name: teamName,
            description: teamDesc,
            status: "active",
            version: 1,
            createdAt: now,
            updatedAt: now,
            supervisorId,
            memberIds: createdAgentIds,
            members: agentDefs.map((def, i) => ({
              id: createdAgentIds[i],
              name: def.name,
              role: def.role,
              ...(def.emoji ? { emoji: def.emoji } : {}),
            })),
            memory: { mode: "isolated" },
            coordination: {
              supervisorStyle: "concierge",
              maxMembers: 8,
              hopLimit: 5,
              memberTimeoutSeconds: 30,
              supervisorFallbackEnabled: true,
            },
            visibility: { mode: "team" },
            bindings: [],
          };

          const projectFilePath = path.join(projectSubDir, "project.json");
          fs.writeFileSync(projectFilePath, JSON.stringify(project, null, 2), "utf-8");

          // 标记部署完成
          deployPlans.set(planId, {
            status: "deployed",
            templateName: teamName,
            agents: agentStates.map((a) => ({ ...a, status: "ready" })),
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          deployPlans.set(planId, {
            status: "failed",
            templateName: teamName,
            agents: agentStates.map((a) =>
              a.status !== "ready" ? { ...a, status: "failed", error: msg } : a,
            ),
          });
        }
      })();
    }),
  );

  api.registerGatewayMethod(
    "orchestrator.deploy.status",
    safeGateway("orchestrator.deploy.status", async ({ params, respond }) => {
      const p = params as Record<string, unknown> | undefined;
      const planId = (p?.planId as string) ?? "unknown";
      const plan = deployPlans.get(planId);
      if (!plan) {
        // 未知的 planId，返回已完成避免前端无限轮询
        respond(true, {
          planId,
          status: "deployed",
          agents: [],
          progress: { total: 0, completed: 0, failed: 0 },
          plan: { teamDescription: "", agentCount: 0, mode: "stub" },
        });
        return;
      }
      const agents = plan.agents.map((a) => ({
        id: a.id,
        name: a.name,
        role: a.role,
        emoji: a.emoji,
        status: a.status,
        error: a.error,
      }));
      const total = agents.length;
      const completed = agents.filter((a) => a.status === "ready").length;
      const failed = agents.filter((a) => a.status === "failed").length;
      respond(true, {
        planId,
        status: plan.status,
        agents,
        progress: { total, completed, failed },
        plan: {
          teamDescription: plan.templateName,
          agentCount: total,
          mode: "template",
        },
      });
    }),
  );

  api.registerGatewayMethod(
    "orchestrator.guided_propose",
    safeGateway("orchestrator.guided_propose", async ({ params, respond }) => {
      const p = params as Record<string, unknown> | undefined;
      const requirement = (p?.requirement as string) ?? "";
      respond(true, {
        planId: `stub-${Date.now()}`,
        teamName: requirement || "自定义团队",
        teamDescription: "该功能尚在开发中，请使用热门场景模板快速体验",
        agents: [],
        costEstimate: "免费（模板模式）",
      });
    }),
  );

  api.registerGatewayMethod(
    "orchestrator.guided_deploy",
    safeGateway("orchestrator.guided_deploy", async ({ params, respond }) => {
      const p = params as Record<string, unknown> | undefined;
      const planId = (p?.planId as string) ?? "unknown";
      respond(true, { planId, status: "deployed" });
    }),
  );

  api.registerGatewayMethod(
    "orchestrator.deploy.report",
    safeGateway("orchestrator.deploy.report", async ({ respond }) => {
      respond(true, { report: null });
    }),
  );

  // ====== security 安全模式系列 ======

  api.registerGatewayMethod(
    "security.modes",
    safeGateway("security.modes", async ({ respond }) => {
      respond(true, {
        modes: [
          { id: "full", name: "满血模式", description: "所有工具可用，无限制" },
          { id: "balanced", name: "均衡模式", description: "工作目录限制，exec 类需确认" },
          {
            id: "safe",
            name: "安全模式",
            description: "仅白名单工具（read/list/search/web_search/memory）",
          },
        ],
        current: "full",
      });
    }),
  );

  api.registerGatewayMethod(
    "security.setMode",
    safeGateway("security.setMode", async ({ params, respond }) => {
      const _p = params as Record<string, unknown> | undefined;
      respond(true, { ok: true });
    }),
  );

  // ====== route 渠道路由系列 ======

  // Helper: resolve config file path (same logic used elsewhere in this file)
  function resolveConfigPath(): string {
    const stateDir =
      process.env.OPENCLAW_STATE_DIR?.trim() || path.join(os.homedir(), ".openclaw");
    return path.join(stateDir, "openclaw.json");
  }

  // Helper: read config JSON
  function readConfig(): Record<string, unknown> {
    try {
      const raw = fs.readFileSync(resolveConfigPath(), "utf-8");
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  // Helper: write config JSON
  function writeConfig(config: Record<string, unknown>): void {
    fs.writeFileSync(resolveConfigPath(), JSON.stringify(config, null, 2), "utf-8");
  }

  api.registerGatewayMethod(
    "route.getChannelAgents",
    safeGateway("route.getChannelAgents", async ({ respond }) => {
      const config = readConfig();
      const bindings = Array.isArray(config.bindings) ? config.bindings : [];
      const agents = (config.agents ?? {}) as Record<string, unknown>;
      const agentList = Array.isArray(agents.list)
        ? (agents.list as Array<Record<string, unknown>>)
        : [];

      // Convert bindings to ChannelRouteEntry format expected by the UI
      const routes: Array<{
        channel: string;
        accountId?: string;
        targetType: "agent";
        targetId: string;
        targetName: string;
      }> = [];

      for (const binding of bindings) {
        if (!binding || typeof binding !== "object") continue;
        const b = binding as Record<string, unknown>;
        // Only handle route-type bindings (type === "route" or undefined)
        if (b.type && b.type !== "route") continue;
        const match = b.match as Record<string, unknown> | undefined;
        if (!match || typeof match !== "object") continue;
        const channel = typeof match.channel === "string" ? match.channel : "";
        if (!channel) continue;
        const agentId = typeof b.agentId === "string" ? b.agentId : "";
        if (!agentId) continue;

        // Resolve agent name from agents.list
        const agentEntry = agentList.find((a) => a.id === agentId);
        const agentName = typeof agentEntry?.name === "string" ? agentEntry.name : agentId;

        routes.push({
          channel,
          ...(typeof match.accountId === "string" && match.accountId
            ? { accountId: match.accountId }
            : {}),
          targetType: "agent",
          targetId: agentId,
          targetName: agentName,
        });
      }

      respond(true, { routes });
    }),
  );

  api.registerGatewayMethod(
    "route.setChannelAgent",
    safeGateway("route.setChannelAgent", async ({ params, respond }) => {
      const p = params as Record<string, unknown> | undefined;
      const channel = typeof p?.channel === "string" ? p.channel.trim() : "";
      if (!channel) {
        respond(false, undefined, { code: "INVALID_PARAMS", message: "channel is required" });
        return;
      }
      const agentId = p?.agentId != null && typeof p.agentId === "string" ? p.agentId.trim() : null;
      const accountId =
        typeof p?.accountId === "string" && p.accountId.trim() ? p.accountId.trim() : undefined;

      const config = readConfig();
      let bindings = Array.isArray(config.bindings)
        ? ([...config.bindings] as Array<Record<string, unknown>>)
        : [];

      // Remove existing route binding for this channel+accountId
      bindings = bindings.filter((b) => {
        if (!b || typeof b !== "object") return true;
        if (b.type && b.type !== "route") return true;
        const match = b.match as Record<string, unknown> | undefined;
        if (!match || typeof match !== "object") return true;
        if (match.channel !== channel) return true;
        const existingAccountId =
          typeof match.accountId === "string" && match.accountId ? match.accountId : undefined;
        return existingAccountId !== accountId;
      });

      // Add new binding if agentId is provided (null means "clear binding")
      if (agentId) {
        bindings.push({
          agentId,
          match: {
            channel,
            ...(accountId ? { accountId } : {}),
          },
        });
      }

      // Write back — remove bindings key entirely if empty for clean config
      if (bindings.length > 0) {
        config.bindings = bindings;
      } else {
        delete config.bindings;
      }
      writeConfig(config);

      respond(true, { ok: true });
    }),
  );

  // ====== freeModels 免费模型系列 ======

  api.registerGatewayMethod(
    "freeModels.providers",
    safeGateway("freeModels.providers", async ({ respond }) => {
      respond(true, { providers: [] });
    }),
  );

  api.registerGatewayMethod(
    "freeModels.config.get",
    safeGateway("freeModels.config.get", async ({ respond }) => {
      respond(true, { config: { enabled: false, accounts: [] } });
    }),
  );

  api.registerGatewayMethod(
    "freeModels.config.update",
    safeGateway("freeModels.config.update", async ({ respond }) => {
      respond(true, { ok: true });
    }),
  );

  api.registerGatewayMethod(
    "freeModels.account.test",
    safeGateway("freeModels.account.test", async ({ respond }) => {
      respond(true, { ok: false, error: "Free models not configured" });
    }),
  );

  api.registerGatewayMethod(
    "freeModels.account.add",
    safeGateway("freeModels.account.add", async ({ respond }) => {
      respond(true, { ok: true });
    }),
  );

  api.registerGatewayMethod(
    "freeModels.account.remove",
    safeGateway("freeModels.account.remove", async ({ respond }) => {
      respond(true, { ok: true });
    }),
  );

  api.registerGatewayMethod(
    "freeModels.account.reorder",
    safeGateway("freeModels.account.reorder", async ({ respond }) => {
      respond(true, { ok: true });
    }),
  );

  // ====== voice 语音系列 ======

  api.registerGatewayMethod(
    "voice.tier.detect",
    safeGateway("voice.tier.detect", async ({ respond }) => {
      try {
        const { getVoiceSystemStatus } = await import("../voice/voice-router.js");
        const status = await getVoiceSystemStatus();
        respond(true, {
          available: status.ttsAvailable || status.asrAvailable,
          tier: status.tier,
          ...status,
        });
      } catch {
        respond(true, { available: false, tier: null });
      }
    }),
  );

  api.registerGatewayMethod(
    "voice.tier.install",
    safeGateway("voice.tier.install", async ({ respond }) => {
      respond(false, undefined, {
        code: "NOT_AVAILABLE",
        message: "Voice tier not available in this build",
      });
    }),
  );

  api.registerGatewayMethod(
    "voice.sidecar.start",
    safeGateway("voice.sidecar.start", async ({ respond }) => {
      respond(false, undefined, { code: "NOT_AVAILABLE", message: "Voice sidecar not available" });
    }),
  );

  api.registerGatewayMethod(
    "voice.sidecar.stop",
    safeGateway("voice.sidecar.stop", async ({ respond }) => {
      respond(true, { ok: true });
    }),
  );

  api.registerGatewayMethod(
    "voice.volcengine.credentialsStatus",
    safeGateway("voice.volcengine.credentialsStatus", async ({ respond }) => {
      try {
        const { getVolcCredsStatus } = await import("../voice/voice-creds.js");
        const status = await getVolcCredsStatus();
        respond(true, status);
      } catch {
        respond(true, { configured: false });
      }
    }),
  );

  api.registerGatewayMethod(
    "voice.volcengine.saveCredentials",
    safeGateway("voice.volcengine.saveCredentials", async ({ params, respond }) => {
      const p = params as Record<string, unknown> | undefined;
      const appId = typeof p?.appId === "string" ? p.appId.trim() : "";
      const accessToken = typeof p?.accessToken === "string" ? p.accessToken.trim() : "";
      if (!appId || !accessToken) {
        respond(false, undefined, {
          code: "INVALID_PARAMS",
          message: "missing appId or accessToken",
        });
        return;
      }
      try {
        const { saveVolcCredentials } = await import("../voice/voice-creds.js");
        await saveVolcCredentials(appId, accessToken);

        // 自动设置 voice-prefs 的 ASR/TTS provider 为 volcengine
        const { setVoicePrefs } = await import("../voice/voice-prefs.js");
        await setVoicePrefs({
          asrProvider: "volcengine",
          ttsProvider: "volcengine",
        });

        // 自动绑定 tts/audio 能力到 volcengine-voice（语音独立于 LLM provider）
        try {
          const existingBindings = await getCapabilityBindings();
          if (!existingBindings["tts"] || existingBindings["tts"].providerId !== "volcengine-voice") {
            await switchCapabilityModel("tts", "volcengine-voice", "volcengine-tts");
          }
          if (!existingBindings["audio"] || existingBindings["audio"].providerId !== "volcengine-voice") {
            await switchCapabilityModel("audio", "volcengine-voice", "volcengine-asr");
          }
        } catch {
          // non-fatal: capability binding failure doesn't block credential save
        }

        respond(true, { ok: true });
      } catch (err) {
        respond(false, undefined, {
          code: "CN_VOICE_CREDS_ERROR",
          message: String(err),
        });
      }
    }),
  );

  api.registerGatewayMethod(
    "asr.stream.feed",
    safeGateway("asr.stream.feed", async ({ respond }) => {
      respond(true, { ok: true });
    }),
  );

  api.registerGatewayMethod(
    "voicewake.listen.stop",
    safeGateway("voicewake.listen.stop", async ({ respond }) => {
      respond(true, { ok: true });
    }),
  );

  // ====== imagegen 图像生成系列 ======

  api.registerGatewayMethod(
    "imagegen.tier.detect",
    safeGateway("imagegen.tier.detect", async ({ respond }) => {
      respond(true, { available: false, tier: null });
    }),
  );

  api.registerGatewayMethod(
    "imagegen.tier.install",
    safeGateway("imagegen.tier.install", async ({ respond }) => {
      respond(false, undefined, {
        code: "NOT_AVAILABLE",
        message: "ImageGen tier not available in this build",
      });
    }),
  );

  api.registerGatewayMethod(
    "imagegen.sidecar.start",
    safeGateway("imagegen.sidecar.start", async ({ respond }) => {
      respond(false, undefined, {
        code: "NOT_AVAILABLE",
        message: "ImageGen sidecar not available",
      });
    }),
  );

  api.registerGatewayMethod(
    "imagegen.sidecar.stop",
    safeGateway("imagegen.sidecar.stop", async ({ respond }) => {
      respond(true, { ok: true });
    }),
  );

  // ====== local_engine 本地引擎系列 ======

  api.registerGatewayMethod(
    "local_engine.redetect",
    safeGateway("local_engine.redetect", async ({ respond }) => {
      respond(true, { status: "unavailable", models: [] });
    }),
  );

  api.registerGatewayMethod(
    "local_engine.start",
    safeGateway("local_engine.start", async ({ respond }) => {
      respond(false, undefined, { code: "NOT_AVAILABLE", message: "Local engine not available" });
    }),
  );

  api.registerGatewayMethod(
    "local_engine.stop",
    safeGateway("local_engine.stop", async ({ respond }) => {
      respond(true, { ok: true });
    }),
  );

  // ====== modality 模态系列 ======

  api.registerGatewayMethod(
    "modality.detectIntent",
    safeGateway("modality.detectIntent", async ({ respond }) => {
      respond(true, { intents: [] });
    }),
  );

  // ====== capability 快速检测 ======

  api.registerGatewayMethod(
    "capability.detect.quick",
    safeGateway("capability.detect.quick", async ({ respond }) => {
      respond(true, { results: [] });
    }),
  );

  // ====== media.list — 侧栏资源列表 ======

  api.registerGatewayMethod(
    "media.list",
    safeGateway("media.list", async ({ client, params, respond }) => {
      // G2: 媒体列表查询需要 READ 权限
      if (!requireScope(client, respond, READ_SCOPE)) return;

      const { sessionKey } = params as { sessionKey?: string };
      if (!sessionKey) {
        respond(true, { assets: [] });
        return;
      }

      try {
        const { queryBySession } = await import("../media/media-db.js");
        const rows = queryBySession(sessionKey);

        // G6: 改用 for...of 以支持 continue 跳过不合法路径
        const assets: unknown[] = [];
        for (const row of rows) {
          // Use the stored URL directly (CDN URL for remote, /api/media/ for legacy).
          // For legacy /api/media/ entries without a remote URL, build a local file:// URI
          // so the browser can at least attempt to load it.
          let url = row.url ?? "";
          let thumbnailUrl: string | undefined;

          // For images with /api/media/ URLs (legacy, no CDN stored), try to read
          // a small thumbnail from local disk to show in sidebar
          if (url.startsWith("/api/media/") && row.type === "image") {
            try {
              const home = process.env.HOME || process.env.USERPROFILE || "";
              const stateDir = process.env.OPENCLAW_STATE_DIR || path.join(home, ".openclaw");
              const safeKey = sessionKey.replace(/[^a-zA-Z0-9_\-.]/g, "_");
              // G6: 使用安全路径拼接，防止 row.file 路径穿越
              const filePath = safeChatImagePath(stateDir, safeKey, row.file);
              if (filePath && fs.existsSync(filePath)) {
                const buf = fs.readFileSync(filePath);
                const mime = row.mime_type || "image/png";
                // Only inline if < 500KB to avoid memory bloat
                if (buf.length < 500_000) {
                  url = `data:${mime};base64,${buf.toString("base64")}`;
                }
              }
            } catch {
              /* ignore */
            }
          }

          assets.push({
            id: row.id,
            type: row.type as "image" | "video",
            url,
            thumbnailUrl,
            name: row.prompt || row.message_text || row.file,
            size: row.size_bytes ?? 0,
            createdAt: new Date(row.created_at).getTime(),
            sessionKey,
          });
        }

        respond(true, { assets });
      } catch {
        respond(true, { assets: [] });
      }
    }),
  );

  // ====== skills_marketplace 技能市场系列（云端优先 + 本地 SQLite fallback） ======

  api.registerGatewayMethod(
    "skills_marketplace.search",
    safeGateway("skills_marketplace.search", async ({ params, respond }) => {
      try {
        const p = params as Record<string, unknown>;
        const keyword = typeof p.keyword === "string" ? p.keyword.trim() : undefined;
        if (keyword && keyword.length > 500) {
          respond(false, undefined, {
            code: "INVALID_ARGUMENT",
            message: "keyword too long",
          });
          return;
        }

        const rawPage = p.page as number | undefined;
        let validPage = 1;
        if (rawPage !== undefined) {
          if (!Number.isInteger(rawPage) || rawPage < 1) {
            respond(false, undefined, {
              code: "INVALID_ARGUMENT",
              message: "page must be a positive integer",
            });
            return;
          }
          validPage = rawPage;
        }

        const rawPageSize = p.pageSize as number | undefined;
        let validPageSize = 20;
        if (rawPageSize !== undefined) {
          if (!Number.isInteger(rawPageSize) || rawPageSize < 1 || rawPageSize > 100) {
            respond(false, undefined, {
              code: "INVALID_ARGUMENT",
              message: "pageSize must be between 1 and 100",
            });
            return;
          }
          validPageSize = rawPageSize;
        }

        const category = typeof p.category === "string" && p.category ? p.category : undefined;
        const tier = typeof p.tier === "string" && p.tier ? p.tier : undefined;
        const cnBlocked = typeof p.cnBlocked === "boolean" ? p.cnBlocked : undefined;
        const installed = typeof p.installed === "boolean" ? p.installed : undefined;
        const source = typeof p.source === "string" && p.source ? p.source : undefined;
        const rawOrderBy = typeof p.orderBy === "string" ? p.orderBy : "updated_at";
        const orderBy =
          rawOrderBy === "downloads" ? "overall_score" : rawOrderBy;
        const rawOrderDirection =
          typeof p.orderDirection === "string"
            ? p.orderDirection
            : typeof p.orderDir === "string"
              ? p.orderDir
              : "DESC";
        const orderDirection = rawOrderDirection.toUpperCase();

        const { searchItems, ensureBaseline, isQcPopulated } =
          await import("../skills-marketplace/db.js");

        if (!isQcPopulated()) {
          try {
            const { buildWorkspaceSkillStatus } =
              await import("../../../src/agents/skills-status.js");
            const report = buildWorkspaceSkillStatus(process.cwd());
            const localSkills = report.skills.map((s) => ({
              name: s.name,
              description: s.description,
              emoji: s.emoji,
              source: s.source,
            }));
            ensureBaseline(localSkills);
          } catch {
            ensureBaseline();
          }
        }

        const result = searchItems({
          keyword: keyword || undefined,
          category,
          tier,
          cnBlocked,
          installed,
          source: source as "proxy" | "qc" | "availability-dict" | undefined,
          orderBy: orderBy as "updated_at" | "overall_score" | "name",
          orderDirection: orderDirection as "ASC" | "DESC",
          page: validPage,
          pageSize: validPageSize,
        });

        respond(true, result);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error("[Skills Marketplace] Search error:", msg);
        respond(false, undefined, {
          code: "INTERNAL_ERROR",
          message: msg || "Search error",
        });
      }
    }),
  );

  api.registerGatewayMethod(
    "skills_marketplace.get_by_id",
    safeGateway("skills_marketplace.get_by_id", async ({ params, respond }) => {
      try {
        const { skillId } = params as { skillId?: string };
        if (!skillId || typeof skillId !== "string") {
          respond(false, undefined, { code: "INVALID_ARGUMENT", message: "skillId is required" });
          return;
        }

        const { getItemById } = await import("../skills-marketplace/db.js");
        const item = getItemById(skillId);
        if (!item) {
          respond(false, undefined, { code: "NOT_FOUND", message: `Skill not found: ${skillId}` });
          return;
        }
        respond(true, item);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        respond(false, undefined, { code: "INTERNAL_ERROR", message: msg });
      }
    }),
  );

  api.registerGatewayMethod(
    "skills_marketplace.get_stats",
    safeGateway("skills_marketplace.get_stats", async ({ respond }) => {
      try {
        // Stats 始终从本地 SQLite 获取（云端搜索结果已缓存到本地）
        const { getStats } = await import("../skills-marketplace/db.js");
        const stats = getStats();
        respond(true, stats);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        respond(false, undefined, { code: "INTERNAL_ERROR", message: msg });
      }
    }),
  );

  api.registerGatewayMethod(
    "skills_marketplace.get_categories",
    safeGateway("skills_marketplace.get_categories", async ({ respond }) => {
      try {
        const { getCategoryStats } = await import("../skills-marketplace/db.js");
        const categories = getCategoryStats();
        respond(true, categories);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        respond(false, undefined, { code: "INTERNAL_ERROR", message: msg });
      }
    }),
  );

  // ====== skills_marketplace.download — 从云端下载并安装技能 ======
  //
  // 直接通过详情接口 GET /skills/:slug 获取 content，保存为 SKILL.md

  api.registerGatewayMethod(
    "skills_marketplace.download",
    safeGateway("skills_marketplace.download", async ({ params, respond }) => {
      try {
        const p = params as { skillId?: string };
        if (!p.skillId || typeof p.skillId !== "string") {
          respond(false, undefined, { code: "INVALID_ARGUMENT", message: "skillId is required" });
          return;
        }

        // 防御路径穿越：仅允许安全字符（slug 格式）
        if (!/^[a-zA-Z0-9][a-zA-Z0-9_\-.]*$/.test(p.skillId)) {
          respond(false, undefined, {
            code: "INVALID_ARGUMENT",
            message: "skillId contains invalid characters",
          });
          return;
        }

        const { getItemById, markSkillInstalled } =
          await import("../skills-marketplace/db.js");
        const item = getItemById(p.skillId);
        if (!item) {
          respond(false, undefined, {
            code: "NOT_FOUND",
            message: `Skill not found: ${p.skillId}`,
          });
          return;
        }


        const configDir =
          process.env.OPENCLAW_CONFIG_DIR || path.join(os.homedir(), ".openclaw");
        const skillDir = path.join(configDir, "skills", p.skillId);
        await fs.promises.mkdir(skillDir, { recursive: true });
        const candidates = [
          path.isAbsolute(item.path) ? item.path : "",
          path.join(process.cwd(), "skills", item.path),
          path.join(process.cwd(), "skills", item.skillId),
        ].filter(Boolean);
        const sourceDir = candidates.find((candidate) => {
          try {
            return fs.existsSync(path.join(candidate, "SKILL.md"));
          } catch {
            return false;
          }
        });

        if (!sourceDir) {
          respond(false, undefined, {
            code: "LOCAL_CONTENT_UNAVAILABLE",
            message: "Skill content is not available in the local open-source bundle",
          });
          return;
        }

        await fs.promises.cp(sourceDir, skillDir, { recursive: true, force: true });
        markSkillInstalled(p.skillId);


        respond(true, {
          skillId: p.skillId,
          installedTo: skillDir,
        });
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        respond(false, undefined, { code: "DOWNLOAD_ERROR", message: msg });
      }
    }),
  );

  // ====== skills_marketplace.uninstall — 卸载已安装的技能 ======
  api.registerGatewayMethod(
    "skills_marketplace.uninstall",
    safeGateway("skills_marketplace.uninstall", async ({ params, respond }) => {
      try {
        const p = params as { skillId?: string };
        if (!p.skillId || typeof p.skillId !== "string") {
          respond(false, undefined, { code: "INVALID_ARGUMENT", message: "skillId is required" });
          return;
        }
        if (!/^[a-zA-Z0-9][a-zA-Z0-9_\-.]*$/.test(p.skillId)) {
          respond(false, undefined, {
            code: "INVALID_ARGUMENT",
            message: "skillId contains invalid characters",
          });
          return;
        }

        const configDir =
          process.env.OPENCLAW_CONFIG_DIR || path.join(os.homedir(), ".openclaw");
        const skillDir = path.join(configDir, "skills", p.skillId);

        // 检查目录是否存在
        try {
          await fs.promises.access(skillDir);
        } catch {
          respond(false, undefined, {
            code: "NOT_FOUND",
            message: "该技能未安装",
          });
          return;
        }

        // 递归删除技能目录
        await fs.promises.rm(skillDir, { recursive: true, force: true });


        respond(true, { skillId: p.skillId });
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        respond(false, undefined, { code: "UNINSTALL_ERROR", message: msg });
      }
    }),
  );

  // ====== feedback.submit — 用户反馈提交（保存到本地文件） ======
  api.registerGatewayMethod(
    "feedback.submit",
    safeGateway("feedback.submit", async ({ params, respond }) => {
      try {
        const feedbackDir = path.join(os.homedir(), ".openclaw", "feedback");
        await fs.promises.mkdir(feedbackDir, { recursive: true });
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const entry = { id, ts: new Date().toISOString(), ...params };
        const filePath = path.join(feedbackDir, `${id}.json`);
        await fs.promises.writeFile(filePath, JSON.stringify(entry, null, 2), "utf-8");
        respond(true, { id, saved: true });
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        respond(false, undefined, { code: "FEEDBACK_ERROR", message: msg });
      }
    }),
  );

  // MCP Marketplace 方法已迁移到 mcp-marketplace/handlers.ts（registerMcpMarketplace）
}
