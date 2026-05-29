export const MOONSHOT_DEFAULT_ID = "kimi-latest";
export const MOONSHOT_DEFAULT_CONTEXT_WINDOW = 128000;
export const MOONSHOT_DEFAULT_MAX_TOKENS = 8192;
export const MOONSHOT_INPUT = ["text", "image"] as const;
export const MOONSHOT_COST = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
} as const;

// Moonshot 模型列表 - 基于官方文档 https://platform.moonshot.cn/docs/pricing/chat
export const MOONSHOT_MODELS = [
  // kimi-latest - 最新推荐，自动选择上下文长度计费
  {
    id: "kimi-latest",
    name: "Kimi Latest (推荐)",
    alias: "Kimi",
    reasoning: false,
    contextWindow: 128000,
    supportsVision: true,
  },
  // kimi-k2 系列 - 超强代码和 Agent 能力
  {
    id: "kimi-k2-turbo-preview",
    name: "Kimi K2 Turbo (推荐)",
    alias: "K2 Turbo",
    reasoning: false,
    contextWindow: 262144,
    supportsVision: false,
  },
  {
    id: "kimi-k2-0905-preview",
    name: "Kimi K2 0905",
    alias: "K2",
    reasoning: false,
    contextWindow: 262144,
    supportsVision: false,
  },
  {
    id: "kimi-k2-0711-preview",
    name: "Kimi K2 0711",
    alias: "K2 0711",
    reasoning: false,
    contextWindow: 131072,
    supportsVision: false,
  },
  {
    id: "kimi-k2-thinking",
    name: "Kimi K2 Thinking (深度推理)",
    alias: "K2 Thinking",
    reasoning: true,
    contextWindow: 262144,
    supportsVision: false,
  },
  {
    id: "kimi-k2-thinking-turbo",
    name: "Kimi K2 Thinking Turbo",
    alias: "K2 Thinking Turbo",
    reasoning: true,
    contextWindow: 262144,
    supportsVision: false,
  },
  // moonshot-v1 系列 - 经典稳定版本
  {
    id: "moonshot-v1-8k",
    name: "Moonshot V1 8K",
    alias: "Moonshot 8K",
    reasoning: false,
    contextWindow: 8000,
    supportsVision: false,
  },
  {
    id: "moonshot-v1-32k",
    name: "Moonshot V1 32K",
    alias: "Moonshot 32K",
    reasoning: false,
    contextWindow: 32000,
    supportsVision: false,
  },
  {
    id: "moonshot-v1-128k",
    name: "Moonshot V1 128K",
    alias: "Moonshot 128K",
    reasoning: false,
    contextWindow: 128000,
    supportsVision: false,
  },
] as const;

// 保留旧的导出名称以保持兼容性
export const MOONSHOT_V1_MODELS = MOONSHOT_MODELS;
export const MOONSHOT_KIMI_K2_MODELS = MOONSHOT_MODELS.filter((m) => m.id.includes("k2"));

export type MoonshotKimiK2Model = (typeof MOONSHOT_KIMI_K2_MODELS)[number];
