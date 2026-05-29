/**
 * 火山引擎 Embedding 模型注册
 *
 * 上游已有豆包（volcengine）的 chat 模型，但没有注册 embedding 模型。
 * 本模块通过 registerProvider 补充火山引擎的 embedding 专用 provider。
 *
 * 火山引擎 Embedding API 兼容 OpenAI 格式。
 * API 文档: https://www.volcengine.com/docs/82379/1302008
 */

import type { OpenClawPluginApi, ProviderAuthResult } from "openclaw/plugin-sdk/core";

type ProviderPlugin = Parameters<OpenClawPluginApi["registerProvider"]>[0];

// ============================================================================
// 常量
// ============================================================================

export const VOLCENGINE_EMBEDDING_PROVIDER_ID = "volcengine-embedding";
export const VOLCENGINE_EMBEDDING_LABEL = "火山引擎 Embedding (豆包)";
export const VOLCENGINE_EMBEDDING_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";
export const VOLCENGINE_EMBEDDING_ENV_VAR = "VOLCENGINE_API_KEY";

const ZERO_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

type ModelInput = Array<"text" | "image">;

// ============================================================================
// Embedding 模型列表
// ============================================================================

export const VOLCENGINE_EMBEDDING_MODELS = [
  {
    id: "doubao-embedding-large",
    name: "豆包 Embedding Large",
    reasoning: false,
    input: ["text"] as ModelInput,
    cost: ZERO_COST,
    contextWindow: 4096,
    maxTokens: 0,
  },
  {
    id: "doubao-embedding",
    name: "豆包 Embedding",
    reasoning: false,
    input: ["text"] as ModelInput,
    cost: ZERO_COST,
    contextWindow: 4096,
    maxTokens: 0,
  },
];

// ============================================================================
// Provider 定义
// ============================================================================

/**
 * 构建火山引擎 Embedding ProviderPlugin。
 *
 * 与上游 volcengine (chat) provider 共用同一个 API Key，
 * 但作为独立 provider 注册，避免与 chat 模型混淆。
 */
export function buildVolcengineEmbeddingProvider(): ProviderPlugin {
  return {
    id: VOLCENGINE_EMBEDDING_PROVIDER_ID,
    label: VOLCENGINE_EMBEDDING_LABEL,
    docsPath: "/providers/volcengine",
    aliases: ["doubao-embedding", "豆包embedding"],
    envVars: [VOLCENGINE_EMBEDDING_ENV_VAR],
    models: {
      baseUrl: VOLCENGINE_EMBEDDING_BASE_URL,
      api: "openai-completions",
      models: VOLCENGINE_EMBEDDING_MODELS,
    },
    auth: [
      {
        id: "api-key",
        label: "API Key",
        hint: "使用与豆包 chat 相同的火山引擎 API Key",
        kind: "api_key",
        async run(ctx): Promise<ProviderAuthResult> {
          const apiKey = await ctx.prompter.text({
            message: "请输入火山引擎 API Key（与豆包 chat 共用）",
            validate: (v: string) => (v.trim().length > 0 ? undefined : "API Key 不能为空"),
          });

          return {
            profiles: [
              {
                profileId: `${VOLCENGINE_EMBEDDING_PROVIDER_ID}:api-key`,
                credential: {
                  type: "api_key",
                  provider: VOLCENGINE_EMBEDDING_PROVIDER_ID,
                  key: apiKey.trim(),
                },
              },
            ],
            configPatch: {
              models: {
                providers: {
                  [VOLCENGINE_EMBEDDING_PROVIDER_ID]: {
                    baseUrl: VOLCENGINE_EMBEDDING_BASE_URL,
                    apiKey: apiKey.trim(),
                    api: "openai-completions",
                    models: VOLCENGINE_EMBEDDING_MODELS,
                  },
                },
              },
            } as any,
            notes: [
              "火山引擎 Embedding 已配置，可用于 memory 向量检索。",
              "支持 doubao-embedding-large (4096 tokens) 和 doubao-embedding。",
            ],
          };
        },
      },
    ],
  };
}
