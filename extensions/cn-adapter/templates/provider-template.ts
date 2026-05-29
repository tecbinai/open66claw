/**
 * Provider 模板 — 替换 "my-provider" 为你的提供商名称
 *
 * 使用方法：
 * 1. 复制此文件到 cn-providers/my-provider.ts
 * 2. 替换所有 "my-provider" / "MyProvider" 标记
 * 3. 在 cn-providers/index.ts 中注册：
 *
 *   import { buildMyProvider } from "./my-provider.js";
 *   export function registerCnProviders(api: OpenClawPluginApi): void {
 *     api.registerProvider(buildMyProvider());
 *   }
 */

import type { OpenClawPluginApi, ProviderAuthResult } from "openclaw/plugin-sdk/core";

type ProviderPlugin = Parameters<OpenClawPluginApi["registerProvider"]>[0];

// ============================================================================
// 常量 — 替换为你的提供商信息
// ============================================================================

export const MY_PROVIDER_ID = "my-provider"; // ← 替换
export const MY_PROVIDER_LABEL = "My Provider (我的提供商)"; // ← 替换
export const MY_PROVIDER_BASE_URL = "https://api.my-provider.com/v1"; // ← 替换
export const MY_PROVIDER_ENV_VAR = "MY_PROVIDER_API_KEY"; // ← 替换

const DEFAULT_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

type ModelInput = Array<"text" | "image">;

// ============================================================================
// 模型列表 — 替换为你的提供商支持的模型
// ============================================================================

export const MY_PROVIDER_MODELS = [
  {
    id: "my-model-large", // ← 替换
    name: "My Model Large", // ← 替换
    reasoning: false,
    input: ["text"] as ModelInput,
    cost: DEFAULT_COST,
    contextWindow: 128000, // ← 替换
    maxTokens: 8192, // ← 替换
  },
  {
    id: "my-model-small", // ← 替换
    name: "My Model Small (免费)", // ← 替换
    reasoning: false,
    input: ["text"] as ModelInput,
    cost: DEFAULT_COST,
    contextWindow: 32000,
    maxTokens: 4096,
  },
];

// ============================================================================
// Provider 定义
// ============================================================================

/**
 * 构建 ProviderPlugin。
 *
 * api 字段说明：
 * - "openai-completions" — OpenAI 兼容格式（大多数国产提供商）
 * - "anthropic"          — Anthropic 格式
 * - "google"             — Google Gemini 格式
 */
export function buildMyProvider(): ProviderPlugin {
  return {
    id: MY_PROVIDER_ID,
    label: MY_PROVIDER_LABEL,
    docsPath: `/providers/${MY_PROVIDER_ID}`, // ← 文档路径
    aliases: ["mp", "我的提供商"], // ← 替换别名
    envVars: [MY_PROVIDER_ENV_VAR],
    models: {
      baseUrl: MY_PROVIDER_BASE_URL,
      api: "openai-completions", // ← 替换为实际 API 格式
      models: MY_PROVIDER_MODELS,
    },
    auth: [
      {
        id: "api-key",
        label: "API Key",
        hint: `从 ${MY_PROVIDER_BASE_URL.replace("/v1", "")} 获取 API Key`, // ← 替换
        kind: "api_key",
        async run(ctx): Promise<ProviderAuthResult> {
          const apiKey = await ctx.prompter.text({
            message: `请输入 ${MY_PROVIDER_LABEL} API Key`, // ← 替换
            validate: (v: string) => (v.trim().length > 0 ? undefined : "API Key 不能为空"),
          });

          return {
            profiles: [
              {
                profileId: `${MY_PROVIDER_ID}:api-key`,
                credential: {
                  type: "api_key",
                  provider: MY_PROVIDER_ID,
                  key: apiKey.trim(),
                },
              },
            ],
            configPatch: {
              models: {
                providers: {
                  [MY_PROVIDER_ID]: {
                    baseUrl: MY_PROVIDER_BASE_URL,
                    apiKey: apiKey.trim(),
                    api: "openai-completions",
                    models: MY_PROVIDER_MODELS,
                  },
                },
              },
            } as any,
            defaultModel: `${MY_PROVIDER_ID}/${MY_PROVIDER_MODELS[0]!.id}`,
            notes: [
              `${MY_PROVIDER_LABEL} 已配置完成。`,
              `如需更换 API Key，请修改环境变量 ${MY_PROVIDER_ENV_VAR} 或重新运行 onboarding。`,
            ],
          };
        },
      },
    ],
  };
}
