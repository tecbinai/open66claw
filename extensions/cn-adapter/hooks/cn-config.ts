export type CnPluginConfig = {
  configVersion?: number;
  locale?: string;
  securityTier?: "full" | "balanced" | "safe";
  /** dispatch 工具过滤模式：off=不过滤, intent=按意图过滤 */
  toolFilterMode?: "off" | "intent";
  models?: {
    default?: { provider: string; model: string };
  };
  mirror?: {
    npm?: string;
    pip?: string;
  };
  proxy?: {
    enabled?: boolean;
    noProxy?: string[];
  };
  telemetry?: boolean;
  updateChannel?: "stable" | "beta" | "dev";
  searchApiKey?: string;
  voice?: {
    engine?: "local" | "volcengine" | "openai";
    language?: string;
    kwsEnabled?: boolean;
  };
  /** Copilot 代理兼容层 — 让 IDE Copilot 插件通过 OpenClaw gateway 连接国产模型 */
  copilotProxy?: {
    enabled?: boolean;
    provider?: string;
    baseUrl?: string;
    apiKey?: string;
    model?: string;
  };
  /** OpenTelemetry OTLP HTTP 导出 — 兼容 Jaeger/Grafana Tempo */
  otel?: {
    enabled?: boolean;
    endpoint?: string;
  };
};

/** 从 api.pluginConfig 安全提取 CN 配置 */
export function extractCnConfig(pluginConfig: Record<string, unknown> | undefined): CnPluginConfig {
  const raw = pluginConfig ?? {};
  return {
    configVersion: typeof raw.configVersion === "number" ? raw.configVersion : undefined,
    locale: typeof raw.locale === "string" ? raw.locale : "zh-CN",
    securityTier: isSecurityTier(raw.securityTier) ? raw.securityTier : "full",
    toolFilterMode: isToolFilterMode(raw.toolFilterMode) ? raw.toolFilterMode : undefined,
    models: extractModels(raw.models),
    mirror: extractMirror(raw.mirror),
    proxy: extractProxy(raw.proxy),
    telemetry: typeof raw.telemetry === "boolean" ? raw.telemetry : undefined,
    updateChannel: isUpdateChannel(raw.updateChannel) ? raw.updateChannel : undefined,
    searchApiKey: typeof raw.searchApiKey === "string" ? raw.searchApiKey : undefined,
    voice: extractVoice(raw.voice),
    copilotProxy: extractCopilotProxy(raw.copilotProxy),
    otel: extractOtel(raw.otel),
  };
}

function extractModels(v: unknown): CnPluginConfig["models"] {
  if (typeof v !== "object" || v === null) return undefined;
  const obj = v as Record<string, unknown>;
  const def = obj.default;
  if (def === undefined) return {};
  if (typeof def !== "object" || def === null) return undefined;
  const d = def as Record<string, unknown>;
  if (typeof d.provider !== "string" || typeof d.model !== "string") return undefined;
  return { default: { provider: d.provider, model: d.model } };
}

function extractMirror(v: unknown): CnPluginConfig["mirror"] {
  if (typeof v !== "object" || v === null) return undefined;
  const obj = v as Record<string, unknown>;
  return {
    npm: typeof obj.npm === "string" ? obj.npm : undefined,
    pip: typeof obj.pip === "string" ? obj.pip : undefined,
  };
}

function extractProxy(v: unknown): CnPluginConfig["proxy"] {
  if (typeof v !== "object" || v === null) return undefined;
  const obj = v as Record<string, unknown>;
  return {
    enabled: typeof obj.enabled === "boolean" ? obj.enabled : undefined,
    noProxy: Array.isArray(obj.noProxy)
      ? obj.noProxy.filter((s): s is string => typeof s === "string")
      : undefined,
  };
}

function extractVoice(v: unknown): CnPluginConfig["voice"] {
  if (typeof v !== "object" || v === null) return undefined;
  const obj = v as Record<string, unknown>;
  return {
    engine: isVoiceEngine(obj.engine) ? obj.engine : undefined,
    language: typeof obj.language === "string" ? obj.language : undefined,
    kwsEnabled: typeof obj.kwsEnabled === "boolean" ? obj.kwsEnabled : undefined,
  };
}

function isVoiceEngine(v: unknown): v is "local" | "volcengine" | "openai" {
  return v === "local" || v === "volcengine" || v === "openai";
}

function extractCopilotProxy(v: unknown): CnPluginConfig["copilotProxy"] {
  if (typeof v !== "object" || v === null) return undefined;
  const obj = v as Record<string, unknown>;
  return {
    enabled: typeof obj.enabled === "boolean" ? obj.enabled : undefined,
    provider: typeof obj.provider === "string" ? obj.provider : undefined,
    baseUrl: typeof obj.baseUrl === "string" ? obj.baseUrl : undefined,
    apiKey: typeof obj.apiKey === "string" ? obj.apiKey : undefined,
    model: typeof obj.model === "string" ? obj.model : undefined,
  };
}

function extractOtel(v: unknown): CnPluginConfig["otel"] {
  if (typeof v !== "object" || v === null) return undefined;
  const obj = v as Record<string, unknown>;
  const endpoint = typeof obj.endpoint === "string" ? obj.endpoint : undefined;
  // URL 格式校验
  if (endpoint) {
    try {
      const url = new URL(endpoint);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        return { enabled: false };
      }
    } catch {
      return { enabled: false };
    }
  }
  return {
    enabled: typeof obj.enabled === "boolean" ? obj.enabled : undefined,
    endpoint,
  };
}

function isSecurityTier(v: unknown): v is "full" | "balanced" | "safe" {
  return v === "full" || v === "balanced" || v === "safe";
}

function isToolFilterMode(v: unknown): v is "off" | "intent" {
  return v === "off" || v === "intent";
}

function isUpdateChannel(v: unknown): v is "stable" | "beta" | "dev" {
  return v === "stable" || v === "beta" || v === "dev";
}
