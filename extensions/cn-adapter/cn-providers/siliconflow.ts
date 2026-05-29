/**
 * 硅基流动 (SiliconFlow) Provider 注册
 *
 * 上游 extra-params.ts 已识别 "siliconflow" 作为 provider ID 并做了 thinking 兼容处理，
 * 但未注册完整的 Provider 配置和模型列表。本模块补充注册。
 *
 * SiliconFlow API 兼容 OpenAI 格式。
 * API 文档: https://docs.siliconflow.cn/cn/api-reference
 */

import type { OpenClawPluginApi, ProviderAuthResult } from "openclaw/plugin-sdk/core";

type ProviderPlugin = Parameters<OpenClawPluginApi["registerProvider"]>[0];

// ============================================================================
// 常量
// ============================================================================

export const SILICONFLOW_PROVIDER_ID = "siliconflow";
export const SILICONFLOW_LABEL = "SiliconFlow (硅基流动)";
export const SILICONFLOW_BASE_URL = "https://api.siliconflow.cn/v1";
export const SILICONFLOW_ENV_VAR = "SILICONFLOW_API_KEY";

const DEFAULT_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

type ModelInput = Array<"text" | "image">;

// ============================================================================
// 模型列表（静态推荐，无需在线发现）
// ============================================================================

export const SILICONFLOW_MODELS = [
  // ── DeepSeek 系列 ──
  {
    id: "deepseek-ai/DeepSeek-V3",
    name: "DeepSeek V3",
    reasoning: false,
    input: ["text"] as ModelInput,
    cost: DEFAULT_COST,
    contextWindow: 64000,
    maxTokens: 8192,
  },
  {
    id: "Pro/deepseek-ai/DeepSeek-R1",
    name: "DeepSeek R1 (Pro)",
    reasoning: true,
    input: ["text"] as ModelInput,
    cost: DEFAULT_COST,
    contextWindow: 64000,
    maxTokens: 8192,
  },
  {
    id: "deepseek-ai/DeepSeek-R1",
    name: "DeepSeek R1",
    reasoning: true,
    input: ["text"] as ModelInput,
    cost: DEFAULT_COST,
    contextWindow: 64000,
    maxTokens: 8192,
  },
  {
    id: "deepseek-ai/DeepSeek-V2.5",
    name: "DeepSeek V2.5",
    reasoning: false,
    input: ["text"] as ModelInput,
    cost: DEFAULT_COST,
    contextWindow: 64000,
    maxTokens: 8192,
  },
  // ── Kimi ──
  {
    id: "Pro/moonshotai/Kimi-K2.5",
    name: "Kimi K2.5 (Pro)",
    reasoning: false,
    input: ["text"] as ModelInput,
    cost: DEFAULT_COST,
    contextWindow: 131072,
    maxTokens: 8192,
  },
  // ── Qwen 系列 ──
  {
    id: "Qwen/Qwen2.5-72B-Instruct",
    name: "Qwen 2.5 72B",
    reasoning: false,
    input: ["text"] as ModelInput,
    cost: DEFAULT_COST,
    contextWindow: 131072,
    maxTokens: 8192,
  },
  {
    id: "Qwen/Qwen2.5-32B-Instruct",
    name: "Qwen 2.5 32B",
    reasoning: false,
    input: ["text"] as ModelInput,
    cost: DEFAULT_COST,
    contextWindow: 131072,
    maxTokens: 8192,
  },
  {
    id: "Qwen/Qwen2.5-Coder-32B-Instruct",
    name: "Qwen 2.5 Coder 32B",
    reasoning: false,
    input: ["text"] as ModelInput,
    cost: DEFAULT_COST,
    contextWindow: 131072,
    maxTokens: 8192,
  },
  {
    id: "Qwen/Qwen2.5-14B-Instruct",
    name: "Qwen 2.5 14B",
    reasoning: false,
    input: ["text"] as ModelInput,
    cost: DEFAULT_COST,
    contextWindow: 131072,
    maxTokens: 8192,
  },
  {
    id: "Qwen/Qwen2.5-7B-Instruct",
    name: "Qwen 2.5 7B (免费)",
    reasoning: false,
    input: ["text"] as ModelInput,
    cost: DEFAULT_COST,
    contextWindow: 131072,
    maxTokens: 8192,
  },
  {
    id: "Qwen/QVQ-72B-Preview",
    name: "Qwen QVQ 72B (视觉推理)",
    reasoning: true,
    input: ["text", "image"] as ModelInput,
    cost: DEFAULT_COST,
    contextWindow: 32000,
    maxTokens: 8192,
  },
  // ── GLM ──
  {
    id: "THUDM/GLM-4-9B-0414",
    name: "GLM-4 9B",
    reasoning: false,
    input: ["text"] as ModelInput,
    cost: DEFAULT_COST,
    contextWindow: 128000,
    maxTokens: 4096,
  },
  // ── InternLM ──
  {
    id: "internlm/internlm2_5-20b-chat",
    name: "InternLM 2.5 20B",
    reasoning: false,
    input: ["text"] as ModelInput,
    cost: DEFAULT_COST,
    contextWindow: 32000,
    maxTokens: 4096,
  },
  // ── Yi ──
  {
    id: "01-ai/Yi-1.5-34B-Chat-16K",
    name: "Yi 1.5 34B",
    reasoning: false,
    input: ["text"] as ModelInput,
    cost: DEFAULT_COST,
    contextWindow: 16000,
    maxTokens: 4096,
  },
  // ── 图像编辑模型 ──
  {
    id: "Qwen/Qwen-Image-Edit-2509",
    name: "Qwen-Image-Edit-2509 (图像编辑)",
    reasoning: false,
    input: ["text", "image"] as ModelInput,
    cost: DEFAULT_COST,
    contextWindow: 4096,
    maxTokens: 1024,
  },
  {
    id: "Qwen/Qwen-Image-Edit",
    name: "Qwen-Image-Edit (图像编辑)",
    reasoning: false,
    input: ["text", "image"] as ModelInput,
    cost: DEFAULT_COST,
    contextWindow: 4096,
    maxTokens: 1024,
  },
  // ── 文生图模型 ──
  {
    id: "Qwen/Qwen-Image",
    name: "Qwen-Image (通义生图)",
    reasoning: false,
    input: ["text"] as ModelInput,
    cost: DEFAULT_COST,
    contextWindow: 4096,
    maxTokens: 1024,
  },
  {
    id: "Kwai-Kolors/Kolors",
    name: "Kolors (可图)",
    reasoning: false,
    input: ["text"] as ModelInput,
    cost: DEFAULT_COST,
    contextWindow: 4096,
    maxTokens: 1024,
  },
  {
    id: "black-forest-labs/FLUX.1-schnell",
    name: "FLUX.1 Schnell",
    reasoning: false,
    input: ["text"] as ModelInput,
    cost: DEFAULT_COST,
    contextWindow: 4096,
    maxTokens: 1024,
  },
  {
    id: "stabilityai/stable-diffusion-xl-base-1.0",
    name: "Stable Diffusion XL",
    reasoning: false,
    input: ["text"] as ModelInput,
    cost: DEFAULT_COST,
    contextWindow: 4096,
    maxTokens: 1024,
  },
  // ── 文生视频模型 ──
  {
    id: "Pro/Wan-AI/Wan2.1-T2V-14B",
    name: "Wan2.1 T2V 14B (Pro)",
    reasoning: false,
    input: ["text"] as ModelInput,
    cost: DEFAULT_COST,
    contextWindow: 4096,
    maxTokens: 1024,
  },
  {
    id: "Wan-AI/Wan2.1-T2V-14B",
    name: "Wan2.1 T2V 14B",
    reasoning: false,
    input: ["text"] as ModelInput,
    cost: DEFAULT_COST,
    contextWindow: 4096,
    maxTokens: 1024,
  },
  // ── 嵌入模型 ──
  {
    id: "BAAI/bge-large-zh-v1.5",
    name: "BGE Large ZH v1.5 (嵌入)",
    reasoning: false,
    input: ["text"] as ModelInput,
    cost: DEFAULT_COST,
    contextWindow: 512,
    maxTokens: 0,
  },
  {
    id: "BAAI/bge-m3",
    name: "BGE M3 (嵌入)",
    reasoning: false,
    input: ["text"] as ModelInput,
    cost: DEFAULT_COST,
    contextWindow: 8192,
    maxTokens: 0,
  },
  // ── 语音模型 ──
  {
    id: "FunAudioLLM/SenseVoiceSmall",
    name: "SenseVoice Small (语音识别)",
    reasoning: false,
    input: ["text"] as ModelInput,
    cost: DEFAULT_COST,
    contextWindow: 0,
    maxTokens: 0,
  },
  {
    id: "openai/whisper-large-v3",
    name: "Whisper Large V3 (语音识别)",
    reasoning: false,
    input: ["text"] as ModelInput,
    cost: DEFAULT_COST,
    contextWindow: 0,
    maxTokens: 0,
  },
];

// ============================================================================
// Provider 定义
// ============================================================================

/**
 * 构建 SiliconFlow ProviderPlugin。
 *
 * auth 使用 api_key kind：onboarding 向导会自动提示用户输入 API Key，
 * 然后写入 config 的 models.providers.siliconflow 配置。
 */
export function buildSiliconFlowProvider(): ProviderPlugin {
  return {
    id: SILICONFLOW_PROVIDER_ID,
    label: SILICONFLOW_LABEL,
    docsPath: "/providers/siliconflow",
    aliases: ["sf", "硅基流动", "硅基"],
    envVars: [SILICONFLOW_ENV_VAR],
    models: {
      baseUrl: SILICONFLOW_BASE_URL,
      api: "openai-completions",
      models: SILICONFLOW_MODELS,
    },
    auth: [
      {
        id: "api-key",
        label: "API Key",
        hint: "从 https://cloud.siliconflow.cn 获取 API Key",
        kind: "api_key",
        async run(ctx): Promise<ProviderAuthResult> {
          const apiKey = await ctx.prompter.text({
            message: "请输入 SiliconFlow API Key",
            validate: (v: string) => (v.trim().length > 0 ? undefined : "API Key 不能为空"),
          });

          return {
            profiles: [
              {
                profileId: `${SILICONFLOW_PROVIDER_ID}:api-key`,
                credential: {
                  type: "api_key",
                  provider: SILICONFLOW_PROVIDER_ID,
                  key: apiKey.trim(),
                },
              },
            ],
            configPatch: {
              models: {
                providers: {
                  [SILICONFLOW_PROVIDER_ID]: {
                    baseUrl: SILICONFLOW_BASE_URL,
                    apiKey: apiKey.trim(),
                    api: "openai-completions",
                    models: SILICONFLOW_MODELS,
                  },
                },
              },
            } as any,
            defaultModel: `${SILICONFLOW_PROVIDER_ID}/deepseek-ai/DeepSeek-V3`,
            notes: [
              "SiliconFlow 已配置完成，默认模型为 DeepSeek V3。",
              "部分模型（如 Qwen 2.5 7B）免费可用。",
              `如需更换 API Key，请修改环境变量 ${SILICONFLOW_ENV_VAR} 或重新运行 onboarding。`,
            ],
          };
        },
      },
    ],
  };
}
