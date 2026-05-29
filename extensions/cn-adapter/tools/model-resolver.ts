/**
 * Model Resolver — 从 cn-adapter 配置中解析生图/生视频模型 + API key。
 *
 * 解析优先级：
 * 1. cn-adapter.json 能力绑定（imageGen / videoGen capability）
 * 2. openclaw.json 全部 provider，按模型 ID 关键词自动发现
 *
 * 不侵入上游代码，仅读取配置文件。
 */

import {
  getAllConfiguredProviders,
  getCapabilityBindings,
  getProviderRawConfig,
} from "../gateway/provider-config-store.js";
import { createCnLogger } from "../utils/index.js";

const log = createCnLogger("tools:model-resolver");

export interface ResolvedModel {
  providerId: string;
  modelId: string;
  apiKey: string;
  baseUrl: string;
}

// ---------------------------------------------------------------------------
// Image Generation Model ID Patterns
// ---------------------------------------------------------------------------

const IMAGE_GEN_MODEL_PATTERNS = [
  "dall-e",
  "gpt-image",
  "wanx",
  "wan-x",
  "stable-diffusion",
  "sdxl",
  "sd3",
  "flux",
  "kolors",
  "qwen-image",
  "qwen/qwen-image",
  "cogview",
  "seedream",
  "imagen",
  "midjourney",
  "playground",
];

function isImageGenModelId(id: string): boolean {
  const lower = id.toLowerCase();
  return IMAGE_GEN_MODEL_PATTERNS.some((p) => lower.includes(p));
}

// ---------------------------------------------------------------------------
// Video Generation Model ID Patterns
// ---------------------------------------------------------------------------

const VIDEO_GEN_MODEL_PATTERNS = [
  "cogvideo",
  "seedance",
  "wan-ai",
  "wan2",
  "wan-2",
  "wan2.1",
  "t2v",
  "kling",
  "video-gen",
];

function isVideoGenModelId(id: string): boolean {
  const lower = id.toLowerCase();
  return VIDEO_GEN_MODEL_PATTERNS.some((p) => lower.includes(p));
}

// ---------------------------------------------------------------------------
// Resolve from Capability Binding
// ---------------------------------------------------------------------------

async function resolveFromBinding(capabilityKey: string): Promise<ResolvedModel | null> {
  const bindings = await getCapabilityBindings();
  const binding = bindings[capabilityKey];
  if (!binding) return null;

  const raw = await getProviderRawConfig(binding.providerId);
  if (!raw) return null;

  return {
    providerId: binding.providerId,
    modelId: binding.modelId,
    apiKey: raw.apiKey,
    baseUrl: raw.baseUrl,
  };
}

// ---------------------------------------------------------------------------
// Auto-discover from all configured providers
// ---------------------------------------------------------------------------

async function autoDiscover(matchFn: (id: string) => boolean): Promise<ResolvedModel | null> {
  const providers = await getAllConfiguredProviders();

  for (const [providerId, entry] of Object.entries(providers)) {
    if (!entry.apiKey || !entry.models) continue;
    for (const model of entry.models) {
      if (matchFn(model.id)) {
        return {
          providerId,
          modelId: model.id,
          apiKey: entry.apiKey,
          baseUrl: entry.baseUrl ?? "",
        };
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Well-known Fallbacks (provider has key but no matching model in models[])
// ---------------------------------------------------------------------------

const IMAGE_GEN_FALLBACKS: Array<{
  providerId: string;
  modelId: string;
}> = [
  { providerId: "siliconflow", modelId: "Qwen/Qwen-Image" },
  { providerId: "openai", modelId: "dall-e-3" },
  { providerId: "dashscope", modelId: "wanx-v1" },
];

const VIDEO_GEN_FALLBACKS: Array<{
  providerId: string;
  modelId: string;
}> = [
  { providerId: "siliconflow", modelId: "Pro/Wan-AI/Wan2.1-T2V-14B" },
  { providerId: "siliconflow", modelId: "Wan-AI/Wan2.1-T2V-14B" },
  { providerId: "volcengine-ark", modelId: "doubao-seedance-1-0-pro-fast-251015" },
  { providerId: "zhipu", modelId: "cogvideox-flash" },
];

async function tryFallback(fallbacks: typeof IMAGE_GEN_FALLBACKS): Promise<ResolvedModel | null> {
  for (const fb of fallbacks) {
    const raw = await getProviderRawConfig(fb.providerId);
    if (raw) {
      return {
        providerId: fb.providerId,
        modelId: fb.modelId,
        apiKey: raw.apiKey,
        baseUrl: raw.baseUrl,
      };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * 解析生图模型：能力绑定 → 模型发现 → 知名回退。
 *
 * 特殊处理：如果绑定的是 Qwen-Image-Edit（编辑模型），自动降级为 Qwen-Image（生成模型）。
 */
export async function resolveImageGenModel(): Promise<ResolvedModel | null> {
  // 1. 能力绑定
  let model = await resolveFromBinding("imageGen");
  if (model) {
    // 编辑模型不能用于生成
    if (/qwen[/-]image-edit/i.test(model.modelId)) {
      log.info(`Remapped edit model ${model.modelId} → Qwen/Qwen-Image`);
      model.modelId = "Qwen/Qwen-Image";
    }
    log.info(`imageGen from binding: ${model.providerId}/${model.modelId}`);
    return model;
  }

  // 2. 自动发现
  model = await autoDiscover(isImageGenModelId);
  if (model) {
    log.info(`imageGen auto-discovered: ${model.providerId}/${model.modelId}`);
    return model;
  }

  // 3. 知名回退
  model = await tryFallback(IMAGE_GEN_FALLBACKS);
  if (model) {
    log.info(`imageGen fallback: ${model.providerId}/${model.modelId}`);
    return model;
  }

  return null;
}

/**
 * 解析生视频模型：能力绑定 → 模型发现 → 知名回退。
 */
export async function resolveVideoGenModel(hasImageInput = false): Promise<ResolvedModel | null> {
  // 1. 能力绑定
  let model = await resolveFromBinding("videoGen");
  if (model) {
    // I2V（图转视频）模型不能用于纯文本请求，自动替换为 T2V
    if (!hasImageInput && /i2v/i.test(model.modelId)) {
      const t2vId = model.modelId.replace(/I2V/gi, "T2V");
      log.info(`Remapped I2V model ${model.modelId} → ${t2vId} (no image input)`);
      model.modelId = t2vId;
    }
    log.info(`videoGen from binding: ${model.providerId}/${model.modelId}`);
    return model;
  }

  // 2. 自动发现
  model = await autoDiscover(isVideoGenModelId);
  if (model) {
    log.info(`videoGen auto-discovered: ${model.providerId}/${model.modelId}`);
    return model;
  }

  // 3. 知名回退
  model = await tryFallback(VIDEO_GEN_FALLBACKS);
  if (model) {
    log.info(`videoGen fallback: ${model.providerId}/${model.modelId}`);
    return model;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Video Understanding Model ID Patterns
// ---------------------------------------------------------------------------

const VIDEO_UNDERSTAND_MODEL_PATTERNS = [
  "qwen-vl",
  "qwen2-vl",
  "qwen2.5-vl",
  "glm-4v",
  "glm-5",
  "doubao-seed",
  "doubao-1.5",
  "minimax-vl",
  "gpt-4o",
  "gemini",
  "cogvlm",
  "internvl",
];

function isVideoUnderstandModelId(id: string): boolean {
  const lower = id.toLowerCase();
  return VIDEO_UNDERSTAND_MODEL_PATTERNS.some((p) => lower.includes(p));
}

const VIDEO_UNDERSTAND_FALLBACKS: Array<{
  providerId: string;
  modelId: string;
}> = [
  { providerId: "volcengine-ark", modelId: "doubao-1.5-pro-256k" },
  { providerId: "aliyun-bailian", modelId: "qwen-vl-max" },
  { providerId: "minimax", modelId: "MiniMax-VL-01" },
  { providerId: "glm", modelId: "glm-4v" },
];

/**
 * 解析视频理解模型：能力绑定 → 模型发现 → 知名回退。
 * 需要支持视频输入的多模态模型（如 qwen-vl-max、doubao-1.5-pro 等）。
 */
export async function resolveVideoUnderstandModel(): Promise<ResolvedModel | null> {
  // 1. 能力绑定
  let model = await resolveFromBinding("video");
  if (model) {
    log.info(`video understand from binding: ${model.providerId}/${model.modelId}`);
    return model;
  }

  // 2. 自动发现
  model = await autoDiscover(isVideoUnderstandModelId);
  if (model) {
    log.info(`video understand auto-discovered: ${model.providerId}/${model.modelId}`);
    return model;
  }

  // 3. 知名回退
  model = await tryFallback(VIDEO_UNDERSTAND_FALLBACKS);
  if (model) {
    log.info(`video understand fallback: ${model.providerId}/${model.modelId}`);
    return model;
  }

  return null;
}
