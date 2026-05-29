/**
 * CN Provider 注册表 — 为 ui-cn 模型设置页提供服务商 + 分组 + 能力卡片数据。
 *
 * 数据来源：clawdbot provider-capability-mapping.ts + capability-registry.ts
 * 后续可改为动态读取配置或远程接口。
 */

// ====== Provider Groups ======

export interface ProviderGroupMeta {
  id: string;
  name: string;
  description: string;
  icon: string;
  defaultExpanded: boolean;
  order: number;
}

export const PROVIDER_GROUPS: ProviderGroupMeta[] = [
  {
    id: "cn-codeplan",
    name: "代码助手 (Coding Plan)",
    description: "代码专用模型，编程体验最佳",
    icon: "🔥",
    defaultExpanded: true,
    order: -1,
  },
  {
    id: "cn-recommended",
    name: "国内主流推荐",
    description: "推荐优先配置，速度快、稳定",
    icon: "⭐",
    defaultExpanded: true,
    order: 0,
  },
  {
    id: "cn-more",
    name: "更多国内服务",
    description: "更多国内大模型平台",
    icon: "🇨🇳",
    defaultExpanded: false,
    order: 1,
  },
  {
    id: "international",
    name: "国际服务",
    description: "需要科学上网",
    icon: "🌐",
    defaultExpanded: false,
    order: 2,
  },
  {
    id: "local-custom",
    name: "本地模型 & 自定义",
    description: "本地运行或自定义端点",
    icon: "🔧",
    defaultExpanded: false,
    order: 3,
  },
];

// ====== Provider Info ======

export interface ProviderModelMeta {
  id: string;
  name: string;
  description?: string;
  recommended?: boolean;
}

export interface ProviderMeta {
  providerId: string;
  name: string;
  icon: string;
  group: string;
  tagline: string;
  apiKeyUrl: string;
  apiKeyGuide: string[];
  capabilities: string[];
  needsBaseUrl: boolean;
  defaultBaseUrl: string;
  apiKeyOptional: boolean;
  models: ProviderModelMeta[];
}

export const PROVIDERS: ProviderMeta[] = [
  // --- cn-codeplan ---
  {
    providerId: "aliyun-codeplan",
    name: "Aliyun Code",
    icon: "☁️",
    group: "cn-codeplan",
    tagline: "一个 Key 调多款顶级代码模型 · 性价比最高",
    apiKeyUrl: "https://www.aliyun.com/benefit?source=5176.29345612&userCode=xsngby7y",
    apiKeyGuide: [
      "打开阿里云百炼 Coding Plan 页面",
      "获取 Coding Plan 专属 API Key（sk-sp- 开头）",
      "复制粘贴到下方（注意：与普通百炼 Key 不互通）",
    ],
    capabilities: ["text", "code", "vision", "toolCall"],
    needsBaseUrl: false,
    defaultBaseUrl: "",
    apiKeyOptional: false,
    models: [
      { id: "qwen3-coder-plus", name: "Qwen3 Coder Plus", description: "代码推理旗舰", recommended: true },
      { id: "qwen3-coder", name: "Qwen3 Coder", description: "代码生成" },
      { id: "deepseek-v3-sp", name: "DeepSeek V3 (SP)", description: "Coding Plan 专属通道" },
    ],
  },
  {
    providerId: "kimi-coding",
    name: "Kimi Code",
    icon: "💻",
    group: "cn-codeplan",
    tagline: "聊天+编程+图片理解 · 262K 超长上下文 · 极速",
    apiKeyUrl: "https://kimi.com/code/console/api-keys",
    apiKeyGuide: ["打开 Kimi Code 控制台", "创建 API Key（sk-kimi- 开头）", "复制粘贴到下方"],
    capabilities: ["text", "code", "vision"],
    needsBaseUrl: false,
    defaultBaseUrl: "https://api.kimi.com/coding/v1",
    apiKeyOptional: false,
    models: [
      { id: "kimi-for-coding", name: "Kimi for Coding", description: "262K上下文，代码专用旗舰", recommended: true },
      { id: "kimi-k2-0711-preview", name: "Kimi K2 Preview", description: "最新预览版" },
    ],
  },
  {
    providerId: "glm-codeplan",
    name: "GLM Code",
    icon: "🧠",
    group: "cn-codeplan",
    tagline: "GLM-5 · 智谱 Coding Plan",
    apiKeyUrl: "https://www.bigmodel.cn/glm-coding?ic=ZPADWSX0SI",
    apiKeyGuide: [
      "打开智谱开放平台",
      "右上角 → API Keys → 创建",
      "复制粘贴到下方（与智谱GLM共用）",
    ],
    capabilities: ["text", "code", "vision", "toolCall"],
    needsBaseUrl: false,
    defaultBaseUrl: "",
    apiKeyOptional: false,
    models: [
      { id: "glm-4.7", name: "GLM-4.7", description: "Coding Plan 旗舰代码模型", recommended: true },
      { id: "glm-4.5", name: "GLM-4.5", description: "代码通用版" },
    ],
  },
  {
    providerId: "minimax-codeplan",
    name: "MiniMax Code",
    icon: "⚡",
    group: "cn-codeplan",
    tagline: "MiniMax-M2.5 · Coding Plan 订阅",
    apiKeyUrl: "https://platform.minimaxi.com/subscribe/coding-plan?code=I5REQrAnfL&source=link",
    apiKeyGuide: ["打开 MiniMax 开放平台", "用户中心 → 接口密钥", "创建密钥 → 复制粘贴到下方"],
    capabilities: ["text", "code", "vision"],
    needsBaseUrl: false,
    defaultBaseUrl: "",
    apiKeyOptional: false,
    models: [
      { id: "MiniMax-M2.5", name: "MiniMax M2.5", description: "Coding Plan 旗舰", recommended: true },
      { id: "MiniMax-M2.1", name: "MiniMax M2.1", description: "稳定版" },
    ],
  },
  {
    providerId: "volcengine-plan",
    name: "火山 CodePlan",
    icon: "🌋",
    group: "cn-codeplan",
    tagline: "字节出品 · 聚合 Doubao-Seed-Code / DeepSeek / GLM / Kimi 等顶级代码模型",
    apiKeyUrl: "https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey",
    apiKeyGuide: [
      "打开火山引擎方舟控制台",
      "API Key 管理 → 创建 API Key",
      "复制粘贴到下方（与豆包共用同一 Key）",
    ],
    capabilities: ["text", "code", "vision"],
    needsBaseUrl: false,
    defaultBaseUrl: "https://ark.cn-beijing.volces.com/api/coding/v3",
    apiKeyOptional: false,
    models: [
      { id: "doubao-seed-1-8-code-250725", name: "Doubao Seed 1.8 Code", description: "字节代码旗舰", recommended: true },
      { id: "doubao-seed-1-6-code-250623", name: "Doubao Seed 1.6 Code", description: "稳定版" },
      { id: "deepseek-v3-250324-cp", name: "DeepSeek V3 (CP)", description: "Coding Plan 通道" },
    ],
  },

  // --- cn-recommended ---
  {
    providerId: "aliyun-bailian",
    name: "通义千问",
    icon: "☁️",
    group: "cn-recommended",
    tagline: "阿里出品 · 送100万Token · 多模态",
    apiKeyUrl: "https://www.aliyun.com/benefit?source=5176.29345612&userCode=xsngby7y",
    apiKeyGuide: [
      "打开阿里云百炼控制台",
      "点击 API Key 管理 → 创建 API Key",
      "复制 API Key 粘贴到下方",
    ],
    capabilities: ["text", "code", "vision", "imageGen", "tts", "audio", "toolCall"],
    needsBaseUrl: false,
    defaultBaseUrl: "",
    apiKeyOptional: false,
    models: [
      { id: "qwen-plus", name: "Qwen Plus", description: "性价比最高，推荐", recommended: true },
      { id: "qwen-max", name: "Qwen Max", description: "旗舰版" },
      { id: "qwen-turbo", name: "Qwen Turbo", description: "快速版，低成本" },
      { id: "qwen-long", name: "Qwen Long", description: "超长上下文" },
    ],
  },
  {
    providerId: "volcengine-ark",
    name: "豆包",
    icon: "🔥",
    group: "cn-recommended",
    tagline: "字节出品 · 响应极快 · 支持画图/视频/语音",
    apiKeyUrl: "https://console.volcengine.com/ark/",
    apiKeyGuide: ["打开火山引擎 Ark 控制台", "创建 API Key", "复制 Key 粘贴到下方"],
    capabilities: ["text", "code", "vision", "imageGen", "videoGen", "video", "tts", "audio"],
    needsBaseUrl: false,
    defaultBaseUrl: "",
    apiKeyOptional: false,
    models: [
      { id: "doubao-seed-1-8-251228", name: "Doubao Seed 1.8", description: "推荐，需先开通模型", recommended: true },
      { id: "doubao-seed-1-6-250615", name: "Doubao Seed 1.6", description: "稳定版" },
      { id: "doubao-pro-32k", name: "Doubao Pro 32K", description: "通用旗舰" },
      { id: "doubao-lite-32k", name: "Doubao Lite 32K", description: "低成本快速版" },
    ],
  },
  {
    providerId: "siliconflow",
    name: "硅基流动",
    icon: "🔮",
    group: "cn-recommended",
    tagline: "全能平台 · 免费模型多 · 画图/视频/语音/嵌入",
    apiKeyUrl: "https://cloud.siliconflow.cn/i/uXXX7IEi",
    apiKeyGuide: ["打开硅基流动控制台", "左侧菜单 → API 密钥", "新建密钥 → 复制粘贴到下方"],
    capabilities: ["text", "code", "vision", "embedding", "imageGen", "videoGen", "audio"],
    needsBaseUrl: false,
    defaultBaseUrl: "",
    apiKeyOptional: false,
    models: [
      { id: "deepseek-ai/DeepSeek-V3", name: "DeepSeek V3", description: "性能强劲，推荐", recommended: true },
      { id: "deepseek-ai/DeepSeek-R1", name: "DeepSeek R1", description: "推理模型" },
      { id: "Qwen/Qwen3-235B-A22B", name: "Qwen3 235B", description: "超大参数" },
      { id: "Qwen/Qwen3-30B-A3B", name: "Qwen3 30B MoE", description: "免费快速" },
      { id: "THUDM/glm-4-9b-chat", name: "GLM-4 9B", description: "永久免费" },
    ],
  },
  {
    providerId: "ant-ling",
    name: "蚂蚁百灵",
    icon: "🐜",
    group: "cn-recommended",
    tagline: "记忆提取必需 · 每日免费50万Token · 注册即用",
    apiKeyUrl: "https://ling.tbox.cn/open",
    apiKeyGuide: ["打开蚂蚁百灵平台", "注册/登录 → 获取 API Key", "复制粘贴到下方"],
    capabilities: ["text", "vision"],
    needsBaseUrl: false,
    defaultBaseUrl: "",
    apiKeyOptional: false,
    models: [
      { id: "ling-lite", name: "百灵 Lite", description: "每日免费50万Token", recommended: true },
      { id: "ling-plus", name: "百灵 Plus", description: "旗舰版" },
    ],
  },
  {
    providerId: "meituan-longcat",
    name: "美团LongCat",
    icon: "🐱",
    group: "cn-recommended",
    tagline: "记忆提取必需 · 每日免费50万Token · 128K上下文",
    apiKeyUrl: "https://longcat.chat/login",
    apiKeyGuide: ["打开美团 LongCat 平台", "登录后获取 API Key", "复制粘贴到下方"],
    capabilities: ["text"],
    needsBaseUrl: false,
    defaultBaseUrl: "",
    apiKeyOptional: false,
    models: [
      { id: "longcat-8b", name: "LongCat 8B", description: "128K 上下文，每日免费50万Token", recommended: true },
    ],
  },

  // --- cn-more ---
  {
    providerId: "deepseek",
    name: "DeepSeek",
    icon: "🚀",
    group: "cn-more",
    tagline: "性价比之王 · 代码能力强",
    apiKeyUrl: "https://platform.deepseek.com/api_keys",
    apiKeyGuide: ["打开 DeepSeek 开放平台", "点击 API Keys → 创建密钥", "复制粘贴到下方"],
    capabilities: ["text", "code", "toolCall"],
    needsBaseUrl: false,
    defaultBaseUrl: "",
    apiKeyOptional: false,
    models: [
      { id: "deepseek-chat", name: "DeepSeek Chat (V3)", description: "旗舰通用版", recommended: true },
      { id: "deepseek-reasoner", name: "DeepSeek Reasoner (R1)", description: "推理模型" },
    ],
  },
  {
    providerId: "glm",
    name: "智谱GLM",
    icon: "🧠",
    group: "cn-more",
    tagline: "GLM-4 系列 · 永久免费额度",
    apiKeyUrl: "https://www.bigmodel.cn/glm-coding?ic=ZPADWSX0SI",
    apiKeyGuide: ["打开智谱开放平台", "右上角 → API Keys → 创建", "复制粘贴到下方"],
    capabilities: ["text", "code", "vision", "imageGen", "videoGen", "embedding", "toolCall"],
    needsBaseUrl: false,
    defaultBaseUrl: "",
    apiKeyOptional: false,
    models: [
      { id: "glm-4-flash-250414", name: "GLM-4 Flash", description: "永久免费，推荐", recommended: true },
      { id: "glm-4-plus", name: "GLM-4 Plus", description: "旗舰通用" },
      { id: "glm-4-air", name: "GLM-4 Air", description: "高性价比" },
      { id: "glm-4v-plus", name: "GLM-4V Plus", description: "多模态视觉" },
    ],
  },
  {
    providerId: "moonshot",
    name: "Kimi (月之暗面)",
    icon: "🌙",
    group: "cn-more",
    tagline: "长上下文之王 · 最高 128K",
    apiKeyUrl: "https://platform.moonshot.cn/console/api-keys",
    apiKeyGuide: ["打开 Moonshot 开放平台", "点击 API Key 管理 → 新建", "复制粘贴到下方"],
    capabilities: ["text", "code", "vision", "toolCall"],
    needsBaseUrl: false,
    defaultBaseUrl: "",
    apiKeyOptional: false,
    models: [
      { id: "kimi-latest", name: "Kimi Latest", description: "最新版，推荐", recommended: true },
      { id: "moonshot-v1-128k", name: "Moonshot 128K", description: "超长上下文" },
      { id: "moonshot-v1-32k", name: "Moonshot 32K", description: "通用版" },
      { id: "moonshot-v1-8k", name: "Moonshot 8K", description: "轻量快速" },
    ],
  },
  {
    providerId: "minimax",
    name: "MiniMax",
    icon: "⚡",
    group: "cn-more",
    tagline: "多模态 · 文字+图片+视频",
    apiKeyUrl: "https://platform.minimaxi.com/subscribe/coding-plan?code=I5REQrAnfL&source=link",
    apiKeyGuide: ["打开 MiniMax 开放平台", "用户中心 → 接口密钥", "创建密钥 → 复制粘贴到下方"],
    capabilities: ["text", "vision", "video"],
    needsBaseUrl: false,
    defaultBaseUrl: "",
    apiKeyOptional: false,
    models: [
      { id: "MiniMax-M2.1", name: "MiniMax M2.1", description: "旗舰通用，推荐", recommended: true },
      { id: "abab6.5s-chat", name: "ABAB 6.5s", description: "快速版" },
    ],
  },
  {
    providerId: "tencent-hunyuan",
    name: "腾讯混元",
    icon: "💫",
    group: "cn-more",
    tagline: "腾讯大模型 · 多模态能力",
    apiKeyUrl: "https://cloud.tencent.com/product/hunyuan",
    apiKeyGuide: ["打开腾讯云混元控制台", "创建 SecretId / SecretKey", "复制粘贴到下方"],
    capabilities: ["text", "vision"],
    needsBaseUrl: false,
    defaultBaseUrl: "",
    apiKeyOptional: false,
    models: [
      { id: "hunyuan-standard", name: "混元 Standard", description: "通用旗舰", recommended: true },
      { id: "hunyuan-lite", name: "混元 Lite", description: "轻量低成本" },
      { id: "hunyuan-vision", name: "混元 Vision", description: "多模态视觉" },
    ],
  },

  // --- international ---
  {
    providerId: "openai",
    name: "OpenAI",
    icon: "🤖",
    group: "international",
    tagline: "GPT-4o · DALL-E 3 · 全能",
    apiKeyUrl: "https://platform.openai.com/api-keys",
    apiKeyGuide: ["打开 OpenAI Platform", "API Keys → Create new secret key", "复制粘贴到下方"],
    capabilities: ["text", "code", "vision", "imageGen", "tts", "audio", "toolCall"],
    needsBaseUrl: false,
    defaultBaseUrl: "",
    apiKeyOptional: false,
    models: [
      { id: "o4-mini", name: "o4 Mini", description: "推理旗舰，推荐", recommended: true },
      { id: "gpt-4o", name: "GPT-4o", description: "多模态旗舰" },
      { id: "gpt-4o-mini", name: "GPT-4o Mini", description: "低成本" },
      { id: "o3-mini", name: "o3 Mini", description: "推理快速版" },
    ],
  },
  {
    providerId: "anthropic",
    name: "Anthropic Claude",
    icon: "🧬",
    group: "international",
    tagline: "Claude 4 系列 · 编程最强",
    apiKeyUrl: "https://console.anthropic.com/account/keys",
    apiKeyGuide: ["打开 Anthropic Console", "Settings → API Keys → Create Key", "复制粘贴到下方"],
    capabilities: ["text", "code", "vision", "toolCall"],
    needsBaseUrl: false,
    defaultBaseUrl: "",
    apiKeyOptional: false,
    models: [
      { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4", description: "编程最强，推荐", recommended: true },
      { id: "claude-opus-4-20250514", name: "Claude Opus 4", description: "顶级旗舰" },
      { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5", description: "快速轻量" },
    ],
  },
  {
    providerId: "google",
    name: "Google Gemini",
    icon: "🔷",
    group: "international",
    tagline: "Gemini 2.5 / 3 · 免费额度充足",
    apiKeyUrl: "https://aistudio.google.com/apikey",
    apiKeyGuide: ["打开 Google AI Studio", "Get API Key → Create API Key", "复制粘贴到下方"],
    capabilities: ["text", "code", "vision", "audio", "video", "toolCall"],
    needsBaseUrl: false,
    defaultBaseUrl: "",
    apiKeyOptional: false,
    models: [
      { id: "gemini-3-flash-preview", name: "Gemini 3 Flash", description: "免费+极速，推荐", recommended: true },
      { id: "gemini-2.5-pro-preview", name: "Gemini 2.5 Pro", description: "旗舰多模态" },
      { id: "gemini-2.5-flash-preview", name: "Gemini 2.5 Flash", description: "高性价比" },
    ],
  },
  {
    providerId: "nvidia",
    name: "NVIDIA NIM",
    icon: "💚",
    group: "international",
    tagline: "高性能推理 · 有免费额度",
    apiKeyUrl: "https://build.nvidia.com/explore/discover",
    apiKeyGuide: ["打开 NVIDIA Build", "登录后获取 API Key", "复制粘贴到下方"],
    capabilities: ["text", "code"],
    needsBaseUrl: false,
    defaultBaseUrl: "",
    apiKeyOptional: false,
    models: [
      { id: "nvidia/llama-3.3-nemotron-super-49b-v1", name: "Llama 3.3 Nemotron 49B", description: "推荐", recommended: true },
      { id: "meta/llama-3.1-405b-instruct", name: "Llama 3.1 405B", description: "超大参数" },
    ],
  },
  {
    providerId: "openrouter",
    name: "OpenRouter",
    icon: "🔀",
    group: "international",
    tagline: "聚合路由 · 数百模型 · 按量计费",
    apiKeyUrl: "https://openrouter.ai/keys",
    apiKeyGuide: ["打开 OpenRouter", "Keys → Create Key", "复制粘贴到下方"],
    capabilities: ["text", "code", "vision", "toolCall"],
    needsBaseUrl: false,
    defaultBaseUrl: "",
    apiKeyOptional: false,
    models: [
      { id: "openrouter/auto", name: "Auto (最优路由)", description: "自动选择最佳模型", recommended: true },
      { id: "anthropic/claude-sonnet-4", name: "Claude Sonnet 4", description: "via OpenRouter" },
      { id: "openai/gpt-4o", name: "GPT-4o", description: "via OpenRouter" },
    ],
  },

  // --- local-custom ---
  {
    providerId: "ollama",
    name: "Ollama",
    icon: "🦙",
    group: "local-custom",
    tagline: "本地运行 · 完全免费 · 隐私安全",
    apiKeyUrl: "",
    apiKeyGuide: [
      "安装 Ollama: https://ollama.com/download",
      "启动 Ollama 服务",
      "无需 API Key，直接使用",
    ],
    capabilities: ["text", "code", "vision", "embedding"],
    needsBaseUrl: true,
    defaultBaseUrl: "http://127.0.0.1:11434",
    apiKeyOptional: true,
    models: [
      { id: "qwen3:8b", name: "Qwen3 8B", description: "推荐本地模型，ollama pull qwen3:8b", recommended: true },
      { id: "deepseek-r1:7b", name: "DeepSeek R1 7B", description: "本地推理模型" },
      { id: "llama3.2:3b", name: "Llama 3.2 3B", description: "轻量快速" },
    ],
  },
  {
    providerId: "openai-compatible",
    name: "OpenAI 兼容",
    icon: "🔌",
    group: "local-custom",
    tagline: "兼容 OpenAI 格式的任意端点",
    apiKeyUrl: "",
    apiKeyGuide: [
      "填写 Base URL（如 http://localhost:8080/v1）",
      "填写 API Key（如有需要）",
      "填写后自动检测可用模型",
    ],
    capabilities: ["text", "code"],
    needsBaseUrl: true,
    defaultBaseUrl: "",
    apiKeyOptional: false,
    models: [],
  },
  {
    providerId: "anthropic-compatible",
    name: "Anthropic 兼容",
    icon: "🔗",
    group: "local-custom",
    tagline: "兼容 Anthropic Messages 格式的任意端点",
    apiKeyUrl: "",
    apiKeyGuide: ["填写 Base URL", "填写 API Key", "填写后自动检测可用模型"],
    capabilities: ["text", "code"],
    needsBaseUrl: true,
    defaultBaseUrl: "",
    apiKeyOptional: false,
    models: [],
  },
];

// ====== UserCapability card definitions ======
// 这些 key 和 sub 需要与 ui-cn/src/ui/views/model-config.ts 中的 USER_CAPABILITIES 一致

export interface CapSummaryEntry {
  key: string;
  name: string;
  description: string;
  icon: string;
  status: "active" | "unconfigured" | "missing";
  bestModel: null;
  alternatives: number;
}

/**
 * 将 openclaw.json 中未注册的 provider 包装为 ProviderMeta。
 * 未知 provider 不限制能力——让用户的模型在所有能力卡片中可选。
 */
export function wrapUnknownProvider(providerId: string): ProviderMeta {
  return {
    providerId,
    name: providerId,
    icon: "🔌",
    group: "local-custom",
    tagline: "用户自定义服务",
    apiKeyUrl: "",
    apiKeyGuide: [],
    capabilities: [
      "text",
      "code",
      "vision",
      "imageGen",
      "videoGen",
      "video",
      "audio",
      "tts",
      "embedding",
      "toolCall",
    ],
    needsBaseUrl: true,
    defaultBaseUrl: "",
    apiKeyOptional: false,
    models: [],
  };
}

/**
 * 查找 provider 的元数据。如果不在注册表中，返回包装后的默认元数据。
 */
export function findProviderMeta(providerId: string): ProviderMeta {
  return PROVIDERS.find((p) => p.providerId === providerId) ?? wrapUnknownProvider(providerId);
}

/**
 * 返回初始能力卡片列表（全部 unconfigured，无 bestModel）。
 * UI 侧的卡片由 USER_CAPABILITIES 硬编码，这里只要保证 key 对得上。
 */
export function getDefaultCapabilities(): CapSummaryEntry[] {
  return [
    {
      key: "text",
      name: "聊天",
      description: "文本对话",
      icon: "chat",
      status: "unconfigured",
      bestModel: null,
      alternatives: 0,
    },
    {
      key: "code",
      name: "编程",
      description: "代码生成与补全",
      icon: "code",
      status: "unconfigured",
      bestModel: null,
      alternatives: 0,
    },
    {
      key: "vision",
      name: "图片理解",
      description: "图片识别与分析",
      icon: "eye",
      status: "unconfigured",
      bestModel: null,
      alternatives: 0,
    },
    {
      key: "imageGen",
      name: "图片生成",
      description: "AI 绘图",
      icon: "image",
      status: "unconfigured",
      bestModel: null,
      alternatives: 0,
    },
    {
      key: "video",
      name: "视频理解",
      description: "视频分析",
      icon: "video",
      status: "unconfigured",
      bestModel: null,
      alternatives: 0,
    },
    {
      key: "videoGen",
      name: "视频生成",
      description: "AI 视频生成",
      icon: "film",
      status: "unconfigured",
      bestModel: null,
      alternatives: 0,
    },
    {
      key: "audio",
      name: "语音识别",
      description: "语音转文字",
      icon: "mic",
      status: "unconfigured",
      bestModel: null,
      alternatives: 0,
    },
    {
      key: "tts",
      name: "语音合成",
      description: "文字转语音",
      icon: "volume",
      status: "unconfigured",
      bestModel: null,
      alternatives: 0,
    },
    {
      key: "embedding",
      name: "向量嵌入",
      description: "文本向量化",
      icon: "database",
      status: "unconfigured",
      bestModel: null,
      alternatives: 0,
    },
    {
      key: "toolCall",
      name: "工具调用",
      description: "函数调用能力",
      icon: "wrench",
      status: "unconfigured",
      bestModel: null,
      alternatives: 0,
    },
  ];
}
