/**
 * 错误分类和友好提示（聊天 + 通用场景）
 * 根据错误信息分类并返回用户友好的中文提示
 */

export type ErrorCategory =
  | "billing" // 余额不足
  | "auth" // 认证失败
  | "rate_limit" // 频率限制
  | "timeout" // 超时
  | "overloaded" // 服务过载
  | "network" // 网络问题
  | "config" // 配置错误
  | "internal" // 内部错误
  | "unknown"; // 未知错误

/** 错误解决建议 */
export type ErrorSuggestion = {
  icon: string;
  title: string;
  desc: string;
};

/** 格式化后的错误信息 */
export type FormattedError = {
  category: ErrorCategory;
  friendlyMessage: string;
  rawError: string;
  suggestions: ErrorSuggestion[];
  canRetry: boolean;
  showConfigLink: boolean;
  /** 出错的服务商（如 "硅基流动"） */
  provider?: string;
  /** 出错的模型（如 "BAAI/bge-m3"） */
  model?: string;
};

/** 网关返回的结构化错误（ErrorShape 的 UI 侧子集） */
export type ErrorShapeHint = {
  userMessage?: string;
  category?: string;
  retryable?: boolean;
};

type ErrorPattern = RegExp | string;

const ERROR_PATTERNS: Record<ErrorCategory, ErrorPattern[]> = {
  billing: [
    /\b402\b/,
    "payment required",
    "insufficient credits",
    "insufficient credit",
    "credit balance",
    "plans & billing",
    "quota exceeded",
    "exceeded your current quota",
    "BILLING_EXCEEDED",
    "余额不足",
    "额度不足",
    "账户欠费",
  ],
  auth: [
    /invalid[_ ]?api[_ ]?key/i,
    "incorrect api key",
    "invalid token",
    "authentication",
    "re-authenticate",
    "oauth token refresh failed",
    "unauthorized",
    "forbidden",
    "access denied",
    "expired",
    "token has expired",
    /\b401\b/,
    /\b403\b/,
    "no credentials found",
    "no api key found",
    "AUTH_FAILED",
    "api key 无效",
    "密钥错误",
    "认证失败",
  ],
  rate_limit: [
    /rate[_ ]limit/i,
    "too many requests",
    /\b429\b/,
    "resource has been exhausted",
    "resource_exhausted",
    "usage limit",
    "RATE_LIMITED",
    "请求过于频繁",
    "请求频率",
  ],
  timeout: [
    "timeout",
    "timed out",
    "deadline exceeded",
    "context deadline exceeded",
    "ETIMEDOUT",
    "ECONNRESET",
    "ECONNREFUSED",
    "AGENT_TIMEOUT",
    "超时",
    "no response",
    "暂未收到响应",
  ],
  overloaded: [
    /overloaded_error/i,
    "overloaded",
    "server is busy",
    "service unavailable",
    /\b503\b/,
    "PROVIDER_OVERLOADED",
    "服务繁忙",
    "服务不可用",
  ],
  network: [
    "network error",
    "fetch failed",
    "connection refused",
    "ENOTFOUND",
    "getaddrinfo",
    "NETWORK_ERROR",
    "网络错误",
    "连接失败",
    "连接断开",
    "disconnected",
    /\b1006\b/, // WebSocket abnormal closure
  ],
  config: [
    "INVALID_CONFIG",
    "invalid config",
    "CONFIG_ERROR",
    /missing.*config/i,
    "schema validation",
    "配置错误",
    "配置有误",
  ],
  internal: [
    "INTERNAL_ERROR",
    "internal error",
    "内部错误",
    "stack overflow",
    "heap out of memory",
  ],
  unknown: [],
};

const FRIENDLY_MESSAGES: Record<ErrorCategory, string> = {
  billing: "[E1003] 账户余额不足，请充值后重试",
  auth: "[E1004] API Key 无效或已过期，请检查模型配置",
  rate_limit: "[E1001] 请求频率超限，请稍后重试",
  timeout: "[E1005] 请求超时，请检查以下可能原因",
  overloaded: "[E1002] 模型服务繁忙，请稍后重试",
  network: "[E1006] 网络连接失败，请检查网络设置",
  config: "[E1007] 配置有误，请检查相关设置项",
  internal: "[E1008] 内部错误，请重试。如反复出现请查看日志或反馈",
  unknown: "[E1009] 请求失败，请稍后重试",
};

/** 每种错误类型的解决建议 */
const ERROR_SUGGESTIONS: Record<ErrorCategory, ErrorSuggestion[]> = {
  timeout: [
    { icon: "💳", title: "检查账户余额", desc: "确认模型服务商账户有足够余额或免费额度" },
    { icon: "🔑", title: "验证 API Key", desc: "检查密钥是否正确配置，是否已过期" },
    { icon: "✅", title: "完成实名认证", desc: "部分国内服务商（如阿里、百度）要求完成实名认证" },
    { icon: "🌐", title: "检查网络连接", desc: "确认网络正常，如有代理请检查代理设置" },
  ],
  billing: [
    { icon: "💳", title: "充值账户", desc: "前往模型服务商官网充值或购买套餐" },
    { icon: "🎁", title: "使用免费模型", desc: "可在「免费模型」页面配置每日免费额度" },
    { icon: "🔄", title: "切换服务商", desc: "可切换到其他有余额的模型服务商" },
  ],
  auth: [
    { icon: "🔑", title: "检查 API Key", desc: "确认密钥复制完整，没有多余空格" },
    { icon: "🔄", title: "重新获取密钥", desc: "前往服务商控制台重新生成 API Key" },
    { icon: "✅", title: "检查权限", desc: "确认 API Key 具有所需的接口调用权限" },
  ],
  rate_limit: [
    { icon: "⏳", title: "稍后重试", desc: "等待 1-2 分钟后再发送消息" },
    { icon: "🔄", title: "切换模型", desc: "可切换到其他模型或服务商" },
    { icon: "⬆️", title: "升级套餐", desc: "升级服务商套餐以获得更高调用限额" },
  ],
  overloaded: [
    { icon: "⏳", title: "稍后重试", desc: "服务商服务器繁忙，请稍后再试" },
    { icon: "🔄", title: "切换模型", desc: "可尝试切换到其他可用模型" },
    { icon: "🌐", title: "检查服务状态", desc: "访问服务商官网查看服务状态" },
  ],
  network: [
    { icon: "🌐", title: "检查网络", desc: "确认设备网络连接正常" },
    { icon: "🔧", title: "检查代理", desc: "如使用代理，请确认代理配置正确" },
    { icon: "🔄", title: "重启网关", desc: "尝试重启 Clawdbot 网关服务" },
  ],
  config: [
    { icon: "🔧", title: "检查配置", desc: "前往「设置」页面检查相关配置项" },
    { icon: "🔄", title: "重置配置", desc: "如无法定位问题，可尝试重置为默认值" },
    { icon: "📋", title: "查看日志", desc: "前往「调试」页面查看详细错误信息" },
  ],
  internal: [
    { icon: "🔄", title: "重试", desc: "点击重试按钮再次发送" },
    { icon: "📋", title: "查看日志", desc: "前往「调试」页面查看详细错误信息" },
    { icon: "💬", title: "反馈问题", desc: "如持续出现，请通过意见反馈告知我们" },
  ],
  unknown: [
    { icon: "🔄", title: "重试", desc: "点击重试按钮再次发送" },
    { icon: "📋", title: "查看日志", desc: "前往「调试」页面查看详细错误信息" },
    { icon: "💬", title: "反馈问题", desc: "如持续出现，请通过意见反馈告知我们" },
  ],
};

/** 是否可以重试 */
const CAN_RETRY: Record<ErrorCategory, boolean> = {
  timeout: true,
  billing: false,
  auth: false,
  rate_limit: true,
  overloaded: true,
  network: true,
  config: false,
  internal: true,
  unknown: true,
};

/** 是否显示配置链接 */
const SHOW_CONFIG_LINK: Record<ErrorCategory, boolean> = {
  timeout: true,
  billing: true,
  auth: true,
  rate_limit: false,
  overloaded: false,
  network: false,
  config: true,
  internal: false,
  unknown: false,
};

function matchesPatterns(raw: string, patterns: ErrorPattern[]): boolean {
  if (!raw) return false;
  const value = raw.toLowerCase();
  return patterns.some((pattern) =>
    pattern instanceof RegExp ? pattern.test(value) : value.includes(pattern.toLowerCase()),
  );
}

function isValidCategory(cat: string | undefined | null): cat is ErrorCategory {
  if (!cat) return false;
  return cat in FRIENDLY_MESSAGES;
}

/**
 * 分类错误信息
 */
export function classifyError(errorMessage: string | null | undefined): ErrorCategory {
  if (!errorMessage) return "unknown";

  const categories: ErrorCategory[] = [
    "billing",
    "auth",
    "rate_limit",
    "timeout",
    "overloaded",
    "network",
    "config",
    "internal",
  ];

  for (const category of categories) {
    if (matchesPatterns(errorMessage, ERROR_PATTERNS[category])) {
      return category;
    }
  }

  return "unknown";
}

/**
 * 获取友好的错误提示
 */
export function getFriendlyErrorMessage(category: ErrorCategory): string {
  return FRIENDLY_MESSAGES[category];
}

/**
 * 清理原始错误信息，使其更易读
 * 移除冗余前缀，截断过长内容
 */
export function cleanRawError(errorMessage: string | null | undefined): string {
  if (!errorMessage) return "";

  let cleaned = errorMessage.trim();

  // 移除常见的冗余前缀
  const prefixPatterns = [
    /^Error:\s*/i,
    /^API Error:\s*/i,
    /^OpenAI Error:\s*/i,
    /^Anthropic Error:\s*/i,
    /^Gateway Error:\s*/i,
    /^Request failed:\s*/i,
    /^LLM request rejected:\s*/i,
  ];

  for (const pattern of prefixPatterns) {
    cleaned = cleaned.replace(pattern, "");
  }

  // 截断过长的错误信息（保留前 200 字符）
  const maxLength = 200;
  if (cleaned.length > maxLength) {
    cleaned = cleaned.slice(0, maxLength) + "...";
  }

  return cleaned;
}

/**
 * 格式化错误提示，包含友好提示和原始错误
 * @deprecated 使用 formatErrorHintFull 获取完整信息
 */
export function formatErrorHint(errorMessage: string | null | undefined): {
  category: ErrorCategory;
  friendlyMessage: string;
  rawError: string;
} {
  const category = classifyError(errorMessage);
  return {
    category,
    friendlyMessage: getFriendlyErrorMessage(category),
    rawError: cleanRawError(errorMessage),
  };
}

/** 错误上下文：出错的服务商和模型 */
export type ErrorSourceContext = {
  provider?: string;
  model?: string;
};

/**
 * 格式化错误提示（完整版）
 * 包含友好提示、原始错误、解决建议等
 *
 * 优先使用网关返回的结构化 ErrorShape（含 userMessage/category），
 * 降级为 regex 分类。
 *
 * @param context 可选的服务商/模型上下文，会附加到结果中供 UI 展示。
 */
export function formatErrorHintFull(
  errorMessage: string | null | undefined,
  errorShape?: ErrorShapeHint | null,
  context?: ErrorSourceContext | null,
): FormattedError {
  // 优先使用网关返回的结构化信息
  if (errorShape?.userMessage) {
    const cat: ErrorCategory = isValidCategory(errorShape.category)
      ? errorShape.category
      : classifyError(errorMessage);
    return {
      category: cat,
      friendlyMessage: errorShape.userMessage,
      rawError: cleanRawError(errorMessage),
      suggestions: ERROR_SUGGESTIONS[cat] || ERROR_SUGGESTIONS.unknown,
      canRetry: errorShape.retryable ?? CAN_RETRY[cat] ?? true,
      showConfigLink: SHOW_CONFIG_LINK[cat] ?? false,
      provider: context?.provider,
      model: context?.model,
    };
  }

  // 降级：走 regex 分类逻辑
  const category = classifyError(errorMessage);
  return {
    category,
    friendlyMessage: getFriendlyErrorMessage(category),
    rawError: cleanRawError(errorMessage),
    suggestions: ERROR_SUGGESTIONS[category] || ERROR_SUGGESTIONS.unknown,
    canRetry: CAN_RETRY[category] ?? true,
    showConfigLink: SHOW_CONFIG_LINK[category] ?? false,
    provider: context?.provider,
    model: context?.model,
  };
}

/**
 * 获取错误解决建议
 */
export function getErrorSuggestions(category: ErrorCategory): ErrorSuggestion[] {
  return ERROR_SUGGESTIONS[category] || ERROR_SUGGESTIONS.unknown;
}

// ─── 通用错误提示（非聊天场景） ─────────────────────────

/** 通用格式化错误（MCP 安装、技能操作、配置保存、频道连接等） */
export function formatGeneralError(
  errorMessage: string | null | undefined,
  context?: string,
): { title: string; detail: string; canRetry: boolean } {
  const category = classifyError(errorMessage);
  const friendly = FRIENDLY_MESSAGES[category];
  const raw = cleanRawError(errorMessage);
  return {
    title: context ? `${context}失败` : "操作失败",
    detail: friendly + (raw ? `\n详细信息：${raw}` : ""),
    canRetry: CAN_RETRY[category] ?? true,
  };
}
