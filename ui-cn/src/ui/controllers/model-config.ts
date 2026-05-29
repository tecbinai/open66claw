/**
 * 模型配置 Controller
 * 能力优先的模型管理,调用 Gateway 的 capability_matrix.* API
 */

export interface Capability {
  capability: string;
  name: string;
  description: string;
  icon: string;
  /** active = 已配置且可用；unconfigured = 有对应模型但用户未配置；missing = 硬件或依赖不满足 */
  status: "active" | "unconfigured" | "missing";
  currentModel: {
    providerId: string;
    providerName: string;
    modelId: string;
    modelName: string;
    isFree: boolean;
    quality?: number;
    maxContextTokens?: number;
    capabilities?: Record<string, number>;
    strengthTier?: string;
    /** undefined or true = auto-assigned, false = user manually locked */
    auto?: boolean;
  } | null;
  availableModels: number;
}

export interface ModelInfo {
  providerId: string;
  providerName: string;
  providerIcon: string;
  modelId: string;
  modelName: string;
  pricing: {
    type: "free" | "paid";
    details?: string;
  };
  configured: boolean;
  active: boolean;
  /** Capability quality score 1-5, 0 = unknown */
  quality?: number;
  /** Max context window in tokens */
  maxContextTokens?: number;
  /** Full capability scores map */
  capabilities?: Record<string, number>;
  /** Model strength tier: "strong" / "moderate" / "weak" */
  strengthTier?: string;
}

export interface ProviderInfo {
  providerId: string;
  name: string;
  icon: string;
  group: string;
  tagline: string;
  apiKeyUrl: string;
  apiKeyGuide: string[];
  capabilities: string[];
  configured: boolean;
  activeModels: number;
  needsBaseUrl: boolean;
  defaultBaseUrl: string;
  apiKeyOptional: boolean;
}

export interface ProviderGroupInfo {
  id: string;
  name: string;
  description: string;
  icon: string;
  defaultExpanded: boolean;
  order: number;
  expanded: boolean;
}

export type ProviderConfigStep = "guide" | "apikey" | "detecting" | "result";

/** 检测子阶段（用于动画进度反馈） */
export type DetectPhase = "validating" | "scanning" | "saving" | "done";

/** Provider 健康状态信息 */
export interface ProviderHealthInfo {
  status:
    | "normal"
    | "billing_error"
    | "auth_invalid"
    | "rate_limited"
    | "degraded"
    | "down"
    | "unknown";
  message?: string;
  lastCheckedAt: number;
}

/** 单个模型的探测结果状态 */
export interface DetectModelEntry {
  modelId: string;
  modelName: string;
  status: "pending" | "ok" | "failed" | "skipped";
  message?: string;
}

export interface ModelConfigState {
  // 数据加载状态
  modelConfigLoading: boolean;
  modelConfigError: string | null;

  // 能力列表
  capabilities: Capability[];

  // 模型选择器状态
  modelSelectorOpen: boolean;
  modelSelectorCapability: Capability | null;
  modelSelectorModels: ModelInfo[];
  modelSelectorLoading: boolean;
  modelSelectorSwitching: boolean;

  // Provider 配置状态
  providerConfigOpen: boolean;
  providerConfigProvider: ProviderInfo | null;
  providerConfigApiKey: string;
  providerConfigBaseUrl: string;
  providerConfigCustomModel: string;
  /** 火山引擎语音凭证 — App ID */
  providerConfigVolcAppId: string;
  /** 火山引擎语音凭证 — Access Token */
  providerConfigVolcAccessToken: string;
  /** 火山引擎配置 Tab：llm | voice */
  providerConfigVolcTab: "llm" | "voice";
  /** 火山引擎语音凭证保存中 */
  providerConfigVolcSaving: boolean;
  /** 火山引擎已配置凭证的脱敏信息 */
  providerConfigVolcCredsStatus: {
    configured: boolean;
    maskedAppId?: string;
    maskedToken?: string;
  } | null;
  /** TTS 音色选择 */
  providerConfigVolcTtsVoice: string;
  /** TTS 语速 */
  providerConfigVolcTtsSpeed: number;
  /** TTS 情感风格 */
  providerConfigVolcTtsEmotion: string;
  /** TTS 音调 */
  providerConfigVolcTtsPitch: number;
  /** TTS 偏好设置已加载 */
  providerConfigVolcTtsPrefsLoaded: boolean;
  providerConfigTesting: boolean;
  providerConfigTestResult: { success: boolean; message: string } | null;
  providerConfigDetecting: boolean;
  providerConfigStep: ProviderConfigStep;
  providerConfigAutoEnabled: Record<string, string> | null;
  /** 检测子阶段（动画进度） */
  providerConfigDetectPhase: DetectPhase;
  /** 检测耗时秒数（实时更新） */
  providerConfigDetectElapsed: number;
  /** 取消检测的 AbortController */
  providerConfigDetectAbort: AbortController | null;
  /** 检测计时器句柄（用于清理，防止泄漏） */
  _detectElapsedTimer: ReturnType<typeof setInterval> | null;
  _detectTimeoutTimer: ReturnType<typeof setTimeout> | null;
  /** 并发检测：总模型数 */
  providerConfigDetectTotal: number;
  /** 并发检测：已完成数 */
  providerConfigDetectCompleted: number;
  /** 并发检测：逐模型结果列表 */
  providerConfigDetectModels: DetectModelEntry[];

  // Provider 列表
  providers: ProviderInfo[];

  // Provider 分组
  providerGroups: ProviderGroupInfo[];

  // Provider 管理弹窗状态
  providerManageOpen: boolean;
  providerManageTarget: ProviderInfo | null;
  providerManageApiKey: string;
  providerManageDeleting: boolean;
  providerManageError: string | null;

  // OpenClawCN: Provider 健康状态
  providerHealthMap: Record<string, ProviderHealthInfo>;
  providerHealthLoading: boolean;

  // OpenClawCN: Provider 优先级排序
  providerPriority: string[];
  providerPrioritySaving: boolean;

  // OpenClawCN: 测试连接
  providerTestingId: string | null;
  providerTestResult: {
    providerId: string;
    success: boolean;
    status: string;
    message: string;
  } | null;
}

type ModelConfigHost = ModelConfigState & {
  client: { request: (method: string, params?: unknown) => Promise<unknown> } | null;
  connected: boolean;
};

/**
 * 创建初始状态
 */
export function createInitialModelConfigState(): ModelConfigState {
  return {
    modelConfigLoading: false,
    modelConfigError: null,
    capabilities: [],
    modelSelectorOpen: false,
    modelSelectorCapability: null,
    modelSelectorModels: [],
    modelSelectorLoading: false,
    modelSelectorSwitching: false,
    providerConfigOpen: false,
    providerConfigProvider: null,
    providerConfigApiKey: "",
    providerConfigBaseUrl: "",
    providerConfigCustomModel: "",
    providerConfigVolcAppId: "",
    providerConfigVolcAccessToken: "",
    providerConfigVolcTab: "llm",
    providerConfigVolcSaving: false,
    providerConfigVolcCredsStatus: null,
    providerConfigVolcTtsVoice: "BV405_streaming",
    providerConfigVolcTtsSpeed: 2.0,
    providerConfigVolcTtsEmotion: "happy",
    providerConfigVolcTtsPitch: 1.0,
    providerConfigVolcTtsPrefsLoaded: false,
    providerConfigTesting: false,
    providerConfigTestResult: null,
    providerConfigDetecting: false,
    providerConfigStep: "guide",
    providerConfigAutoEnabled: null,
    providerConfigDetectPhase: "validating",
    providerConfigDetectElapsed: 0,
    providerConfigDetectAbort: null,
    _detectElapsedTimer: null,
    _detectTimeoutTimer: null,
    providerConfigDetectTotal: 0,
    providerConfigDetectCompleted: 0,
    providerConfigDetectModels: [],
    providers: [],
    providerGroups: [],
    providerManageOpen: false,
    providerManageTarget: null,
    providerManageApiKey: "",
    providerManageDeleting: false,
    providerManageError: null,
    // OpenClawCN: Provider 健康状态
    providerHealthMap: {},
    providerHealthLoading: false,
    // OpenClawCN: Provider 优先级排序
    providerPriority: [],
    providerPrioritySaving: false,
    // OpenClawCN: 测试连接
    providerTestingId: null,
    providerTestResult: null,
  };
}

/** v2 capability_matrix.summary 响应中单个能力的形状 */
interface CapMatrixEntry {
  key: string;
  name: string;
  icon: string;
  description: string;
  status: "active" | "unconfigured" | "missing";
  bestModel?: {
    provider: string;
    modelId: string;
    displayName: string;
    quality: number;
    costTier: string;
    region: string;
    maxContextTokens?: number;
    capabilities?: Record<string, number>;
    strengthTier?: string;
    auto?: boolean;
  };
  alternatives?: number;
  recommendation?: unknown;
}

/**
 * 加载能力列表 — 使用 v2 capability_matrix API
 */
export async function loadCapabilities(host: ModelConfigHost): Promise<void> {
  if (!host.client || !host.connected) {
    host.modelConfigError = "未连接到 Gateway";
    host.modelConfigLoading = false;
    return;
  }

  host.modelConfigLoading = true;
  host.modelConfigError = null;

  try {
    const result = await host.client.request("capability_matrix.summary");
    const data = result as { capabilities: CapMatrixEntry[] };
    if (!Array.isArray(data.capabilities)) throw new Error("v2 response invalid");
    host.capabilities = data.capabilities.map((entry) => ({
      capability: entry.key,
      name: entry.name,
      description: entry.description,
      icon: entry.icon,
      // 保留后端三态：active / unconfigured / missing
      // 不能压缩成二态，否则 UI 无法区分「未配置（可引导用户配置）」与「硬件缺失（应灰显禁用）」
      status: (entry.status === "active"
        ? "active"
        : entry.status === "missing"
          ? "missing"
          : "unconfigured") as "active" | "unconfigured" | "missing",
      currentModel: entry.bestModel
        ? {
            providerId: entry.bestModel.provider,
            providerName: entry.bestModel.providerName || entry.bestModel.provider,
            modelId: entry.bestModel.modelId,
            modelName: entry.bestModel.displayName,
            isFree: entry.bestModel.costTier === "free",
            quality: entry.bestModel.quality,
            maxContextTokens: entry.bestModel.maxContextTokens,
            capabilities: entry.bestModel.capabilities,
            strengthTier: entry.bestModel.strengthTier,
            auto: entry.bestModel.auto,
          }
        : null,
      availableModels: entry.alternatives ?? 0,
    }));
  } catch (err) {
    // cn-adapter method — silently degrade when running against upstream gateway
    const msg = String(err);
    if (!msg.includes("unknown method")) {
      host.modelConfigError = `加载失败: ${msg}`;
    }
  } finally {
    host.modelConfigLoading = false;
  }
}

/**
 * 加载 Provider 分组元数据
 */
export async function loadProviderGroups(host: ModelConfigHost): Promise<void> {
  if (!host.client || !host.connected) return;

  try {
    const result = await host.client.request("capability_matrix.providerGroups");
    const data = result as {
      groups: Array<{
        id: string;
        name: string;
        description: string;
        icon: string;
        defaultExpanded: boolean;
        order: number;
      }>;
    };
    host.providerGroups = (data.groups ?? []).map((g) => ({
      ...g,
      expanded: g.defaultExpanded,
    }));
  } catch {
    // cn-adapter method — silently ignore when running against upstream gateway
    host.providerGroups = [];
  }
}

/**
 * 切换 Provider 分组的展开/收起
 */
export function toggleProviderGroup(host: ModelConfigHost, groupId: string): void {
  host.providerGroups = host.providerGroups.map((g) =>
    g.id === groupId ? { ...g, expanded: !g.expanded } : g,
  );
}

/** v2 capability_matrix.query 响应中单个模型的形状 */
interface CapMatrixModel {
  provider: string;
  modelId: string;
  displayName: string;
  quality: number;
  costTier: string;
  costPer1M?: number;
  region?: string;
  modelType?: string;
  configured: boolean;
  health?: string;
  probeStatus?: string;
  tags?: string[];
  languages?: string[];
  requiresDownload?: boolean;
  capabilities?: Record<string, number>;
}

// [CN-PATCH] 防止快速连续点击导致 stale response 覆盖
let _modelSelectorSeq = 0;

/**
 * 打开模型选择器 — 使用 v2 capability_matrix.models API
 */
export async function openModelSelector(
  host: ModelConfigHost,
  capability: Capability,
): Promise<void> {
  if (!host.client || !host.connected) return;

  const seq = ++_modelSelectorSeq;
  host.modelSelectorOpen = true;
  host.modelSelectorCapability = capability;
  host.modelSelectorModels = [];
  host.modelSelectorLoading = true;

  try {
    const result = await host.client.request("capability_matrix.models", {
      capability: capability.capability,
    });
    // 如果在 await 期间又发起了新请求，丢弃旧响应
    if (seq !== _modelSelectorSeq) return;
    const data = result as { models: ModelInfo[] };
    host.modelSelectorModels = data.models ?? [];
  } catch (err) {
    if (seq !== _modelSelectorSeq) return;
    const msg = String(err);
    if (!msg.includes("unknown method")) {
      host.modelConfigError = `加载模型列表失败: ${msg}`;
    }
    closeModelSelector(host);
  } finally {
    host.modelSelectorLoading = false;
  }
}

/**
 * 关闭模型选择器
 */
export function closeModelSelector(host: ModelConfigHost): void {
  host.modelSelectorOpen = false;
  host.modelSelectorCapability = null;
  host.modelSelectorModels = [];
  host.modelSelectorLoading = false;
  host.modelSelectorSwitching = false;
}

/**
 * 加载 Provider 列表
 */
export async function loadProviders(host: ModelConfigHost): Promise<void> {
  if (!host.client || !host.connected) return;

  try {
    const result = await host.client.request("capability_matrix.providers.list");
    const data = result as { providers: ProviderInfo[] };
    host.providers = data.providers ?? [];
  } catch (err) {
    // cn-adapter method — silently degrade when running against upstream gateway
    const msg = String(err);
    if (!msg.includes("unknown method")) {
      host.modelConfigError = `加载 Provider 列表失败: ${msg}`;
    }
    host.providers = [];
  }
}

/**
 * 打开 Provider 配置弹窗
 */
export function openProviderConfig(host: ModelConfigHost, provider: ProviderInfo): void {
  host.providerConfigOpen = true;
  host.providerConfigProvider = provider;
  host.providerConfigApiKey = "";
  host.providerConfigBaseUrl = provider.defaultBaseUrl ?? "";
  host.providerConfigTesting = false;
  host.providerConfigTestResult = null;
  host.providerConfigDetecting = false;
  host.providerConfigAutoEnabled = null;
  host.providerConfigVolcAppId = "";
  host.providerConfigVolcAccessToken = "";
  host.providerConfigVolcTab = "llm";
  host.providerConfigVolcSaving = false;
  host.providerConfigVolcCredsStatus = null;
  host.providerConfigVolcTtsVoice = "BV405_streaming";
  host.providerConfigVolcTtsSpeed = 2.0;
  host.providerConfigVolcTtsEmotion = "happy";
  host.providerConfigVolcTtsPitch = 1.0;
  host.providerConfigVolcTtsPrefsLoaded = false;
  // 有引导步骤则先显示引导,否则直接到 API Key 输入
  host.providerConfigStep =
    provider.apiKeyGuide && provider.apiKeyGuide.length > 0 ? "guide" : "apikey";
}

/**
 * 关闭 Provider 配置弹窗
 */
export function closeProviderConfig(host: ModelConfigHost): void {
  host.providerConfigOpen = false;
  host.providerConfigProvider = null;
  host.providerConfigApiKey = "";
  host.providerConfigBaseUrl = "";
  host.providerConfigCustomModel = "";
  host.providerConfigVolcAppId = "";
  host.providerConfigVolcAccessToken = "";
  host.providerConfigVolcTab = "llm";
  host.providerConfigVolcSaving = false;
  host.providerConfigVolcCredsStatus = null;
  host.providerConfigVolcTtsPrefsLoaded = false;
  host.providerConfigTesting = false;
  host.providerConfigTestResult = null;
  host.providerConfigDetecting = false;
  host.providerConfigStep = "guide";
  host.providerConfigAutoEnabled = null;
  host.providerConfigDetectTotal = 0;
  host.providerConfigDetectCompleted = 0;
  host.providerConfigDetectModels = [];
}

/**
 * 更新 API Key
 */
export function updateProviderApiKey(host: ModelConfigHost, apiKey: string): void {
  host.providerConfigApiKey = apiKey;
  host.providerConfigTestResult = null;
}

/**
 * 更新 Base URL
 */
export function updateProviderBaseUrl(host: ModelConfigHost, baseUrl: string): void {
  host.providerConfigBaseUrl = baseUrl;
  host.providerConfigTestResult = null;
}

/**
 * 更新自定义模型名
 */
export function updateProviderCustomModel(host: ModelConfigHost, customModel: string): void {
  host.providerConfigCustomModel = customModel;
  host.providerConfigTestResult = null;
}

/**
 * 更新火山引擎语音 App ID
 */
export function updateProviderVolcAppId(host: ModelConfigHost, volcAppId: string): void {
  host.providerConfigVolcAppId = volcAppId;
  host.providerConfigTestResult = null;
}

/**
 * 更新火山引擎语音 Access Token
 */
export function updateProviderVolcAccessToken(
  host: ModelConfigHost,
  volcAccessToken: string,
): void {
  host.providerConfigVolcAccessToken = volcAccessToken;
  host.providerConfigTestResult = null;
}

/**
 * 切换火山引擎配置 Tab（llm / voice）
 */
export function switchProviderVolcTab(host: ModelConfigHost, tab: "llm" | "voice"): void {
  host.providerConfigVolcTab = tab;
}

/**
 * Provider 配置向导：进入下一步
 */
export function providerConfigNextStep(host: ModelConfigHost): void {
  if (host.providerConfigStep === "guide") {
    host.providerConfigStep = "apikey";
  }
}

/**
 * Provider 配置向导：返回上一步
 */
export function providerConfigPrevStep(host: ModelConfigHost): void {
  if (host.providerConfigStep === "apikey") {
    host.providerConfigStep = "guide";
  }
}

/**
 * 从模型选择器跳转到 Provider 配置
 */
export function navigateToProviderConfig(host: ModelConfigHost, providerId: string): void {
  const provider = host.providers.find((p) => p.providerId === providerId);
  if (!provider) return;

  closeModelSelector(host);
  openProviderConfig(host, provider);
}

/**
 * 自动检测并配置 Provider
 *
 * 采用 respond-immediately + broadcast 进度模式：
 *   1. RPC 立即返回 { started, total }
 *   2. 后端并发探测每个模型，逐个 broadcast progress 事件
 *   3. 全部完成后 broadcast complete 事件
 *   UI 通过 handleDetectProgressEvent / handleDetectCompleteEvent 处理进度
 */
const DETECT_TIMEOUT_MS = 60_000;

export async function detectAndConfigureProvider(host: ModelConfigHost): Promise<void> {
  if (!host.client || !host.connected) return;
  if (!host.providerConfigProvider) return;

  // 初始化检测状态
  const abort = new AbortController();
  host.providerConfigDetecting = true;
  host.providerConfigTestResult = null;
  host.providerConfigStep = "detecting";
  host.providerConfigDetectPhase = "validating";
  host.providerConfigDetectElapsed = 0;
  host.providerConfigDetectAbort = abort;
  host.providerConfigDetectTotal = 0;
  host.providerConfigDetectCompleted = 0;
  host.providerConfigDetectModels = [];

  // 耗时计时器 — 每秒更新（存到 host 上，防止 broadcast 路径泄漏）
  const startTime = Date.now();
  const elapsedTimer = setInterval(() => {
    host.providerConfigDetectElapsed = Math.floor((Date.now() - startTime) / 1000);
  }, 1000);
  host._detectElapsedTimer = elapsedTimer;

  // 超时保护（同样存到 host 上）
  const timeoutTimer = setTimeout(() => {
    if (host.providerConfigDetecting) {
      _finishDetection(host, {
        success: false,
        message: "检测超时，请检查网络后重试",
      });
    }
  }, DETECT_TIMEOUT_MS);
  host._detectTimeoutTimer = timeoutTimer;

  // 取消监听
  abort.signal.addEventListener("abort", () => {
    _finishDetection(host, null); // null = 用户取消
  });

  try {
    const result = await host.client.request("capability_matrix.provider.detect", {
      providerId: host.providerConfigProvider.providerId,
      apiKey: host.providerConfigApiKey,
      autoSave: true,
      ...(host.providerConfigBaseUrl ? { baseUrl: host.providerConfigBaseUrl.trim() } : {}),
      ...(host.providerConfigCustomModel
        ? { customModel: host.providerConfigCustomModel.trim() }
        : {}),
      ...(host.providerConfigVolcAppId ? { volcAppId: host.providerConfigVolcAppId.trim() } : {}),
      ...(host.providerConfigVolcAccessToken
        ? { volcAccessToken: host.providerConfigVolcAccessToken.trim() }
        : {}),
    });

    const data = result as { started?: boolean; total?: number };

    if (data.started) {
      // RPC 返回 started — 进度通过 broadcast 事件到达
      host.providerConfigDetectPhase = "scanning";
      host.providerConfigDetectTotal = data.total ?? 0;
      // 初始化 pending 模型列表（真实列表会随 progress 事件更新）
      // 此时不知道模型名，留空 — progress 事件会填充
    } else {
      // 兼容旧版 Gateway（直接返回完整结果）
      const legacyData = result as {
        success: boolean;
        error?: string;
        autoEnabled?: Record<string, string>;
      };
      if (legacyData.success) {
        const enabledCount = Object.keys(legacyData.autoEnabled ?? {}).length;
        _finishDetection(host, {
          success: true,
          message: `配置完成！已自动启用 ${enabledCount} 个能力`,
          autoEnabled: legacyData.autoEnabled as Record<string, string>,
        });
      } else {
        _finishDetection(host, {
          success: false,
          message: translateProviderError(legacyData.error ?? "配置失败"),
        });
      }
    }
  } catch (err) {
    const errStr = String(err);
    const isTimeout = errStr.includes("DETECT_TIMEOUT") || errStr.includes("timeout");
    _finishDetection(host, {
      success: false,
      message: isTimeout ? "检测超时，请检查网络后重试" : `配置失败: ${errStr}`,
    });
  }
}

/** 内部：结束检测流程 — 统一清理 timers，防止泄漏 */
function _finishDetection(
  host: ModelConfigState,
  outcome: { success: boolean; message: string; autoEnabled?: Record<string, string> } | null,
): void {
  // 清理所有检测相关的 timers
  if (host._detectElapsedTimer) {
    clearInterval(host._detectElapsedTimer);
    host._detectElapsedTimer = null;
  }
  if (host._detectTimeoutTimer) {
    clearTimeout(host._detectTimeoutTimer);
    host._detectTimeoutTimer = null;
  }
  host.providerConfigDetecting = false;
  host.providerConfigDetectAbort = null;

  if (outcome === null) {
    // 用户取消
    host.providerConfigStep = "apikey";
    host.providerConfigTestResult = null;
  } else if (outcome.success) {
    host.providerConfigDetectPhase = "done";
    host.providerConfigTestResult = { success: true, message: outcome.message };
    host.providerConfigAutoEnabled = outcome.autoEnabled ?? null;
    host.providerConfigStep = "result";
  } else {
    host.providerConfigTestResult = { success: false, message: outcome.message };
    host.providerConfigStep = "apikey";
  }
}

/**
 * 处理 modelConfig.detect.progress broadcast 事件
 */
export function handleDetectProgressEvent(
  host: ModelConfigState,
  payload: {
    modelId: string;
    modelName: string;
    status: "ok" | "failed" | "skipped";
    message?: string;
    completed: number;
    total: number;
  },
): void {
  if (!host.providerConfigDetecting) return;

  host.providerConfigDetectCompleted = payload.completed;
  host.providerConfigDetectTotal = payload.total;

  // 更新或添加模型条目 — 用新数组替换，确保触发 Lit re-render
  const existing = host.providerConfigDetectModels.find((m) => m.modelId === payload.modelId);
  if (existing) {
    host.providerConfigDetectModels = host.providerConfigDetectModels.map((m) =>
      m.modelId === payload.modelId
        ? { ...m, status: payload.status, message: payload.message }
        : m,
    );
  } else {
    host.providerConfigDetectModels = [
      ...host.providerConfigDetectModels,
      {
        modelId: payload.modelId,
        modelName: payload.modelName,
        status: payload.status,
        message: payload.message,
      },
    ];
  }
}

/**
 * 处理 modelConfig.detect.complete broadcast 事件
 */
export function handleDetectCompleteEvent(
  host: ModelConfigState & { providerConfigDetectAbort: AbortController | null },
  payload: {
    success: boolean;
    models: Array<{ modelId: string; modelName: string; status: string; message?: string }>;
    autoEnabled: Record<string, string>;
    availableCount: number;
    failedCount: number;
    error?: string;
  },
): void {
  if (!host.providerConfigDetecting) return;

  // 更新最终的模型列表
  host.providerConfigDetectModels = payload.models.map((m) => ({
    modelId: m.modelId,
    modelName: m.modelName,
    status: m.status as DetectModelEntry["status"],
    message: m.message,
  }));
  host.providerConfigDetectCompleted = payload.models.length;

  if (payload.success) {
    const enabledCount = Object.keys(payload.autoEnabled).length;
    _finishDetection(host, {
      success: true,
      message: `配置完成！${payload.availableCount} 个模型可用${payload.failedCount > 0 ? `，${payload.failedCount} 个不可用` : ""}，已自动启用 ${enabledCount} 个能力`,
      autoEnabled: payload.autoEnabled,
    });
  } else {
    _finishDetection(host, {
      success: false,
      message: translateProviderError(payload.error ?? "配置失败"),
    });
  }
}

/**
 * 取消正在进行的检测
 */
export function cancelDetection(host: ModelConfigHost): void {
  host.providerConfigDetectAbort?.abort();
}

/**
 * 打开 Provider 管理弹窗
 */
export async function openProviderManage(
  host: ModelConfigHost,
  provider: ProviderInfo,
): Promise<void> {
  host.providerManageOpen = true;
  host.providerManageTarget = provider;
  host.providerManageApiKey = "";
  host.providerManageDeleting = false;
  host.providerManageError = null;

  // 加载脱敏 Key
  if (host.client && host.connected) {
    try {
      const result = await host.client.request("capability_matrix.provider.getConfig", {
        providerId: provider.providerId,
      });
      // stale check: 弹窗可能已被关闭或切换到其他 provider
      if (host.providerManageTarget?.providerId !== provider.providerId) return;
      const data = result as { configured: boolean; maskedApiKey: string };
      host.providerManageApiKey = data.maskedApiKey ?? "";
    } catch {
      if (host.providerManageTarget?.providerId !== provider.providerId) return;
      host.providerManageApiKey = "(加载失败)";
    }
  }
}

/**
 * 关闭 Provider 管理弹窗
 */
export function closeProviderManage(host: ModelConfigHost): void {
  host.providerManageOpen = false;
  host.providerManageTarget = null;
  host.providerManageApiKey = "";
  host.providerManageDeleting = false;
  host.providerManageError = null;
}

/**
 * 删除 Provider 配置
 */
export async function deleteProviderConfig(
  host: ModelConfigHost,
  providerId: string,
): Promise<void> {
  if (!host.client || !host.connected) return;

  host.providerManageDeleting = true;
  try {
    await host.client.request("capability_matrix.provider.delete", { providerId });
    closeProviderManage(host);
    // 刷新数据（含 health 和 priority，清理已删除服务商的残留状态）
    await Promise.all([
      loadCapabilities(host),
      loadProviders(host),
      loadProviderHealth(host),
      loadProviderPriority(host),
    ]);
  } catch (err) {
    host.providerManageDeleting = false;
    host.providerManageError = `删除失败: ${String(err)}`;
  }
}

/**
 * 翻译 Provider 错误信息
 */
function translateProviderError(error: string): string {
  const errorMap: Record<string, string> = {
    "Invalid API key": "API 密钥无效,请检查格式",
    Unauthorized: "未授权,请检查 API 密钥",
    "Authentication failed": "认证失败,请重新获取 API 密钥",
    "fetch failed": "网络请求失败,请检查网络连接",
    ECONNREFUSED: "无法连接到服务器,请稍后重试",
    ETIMEDOUT: "连接超时,请稍后重试",
    未知的服务商: "不支持的模型提供商",
    该服务商没有可用模型: "该服务商没有可用模型",
  };

  for (const [key, value] of Object.entries(errorMap)) {
    if (error.toLowerCase().includes(key.toLowerCase())) {
      return value;
    }
  }

  return `配置失败: ${error}`;
}

// ============================================================================
// OpenClawCN: Provider 健康状态
// ============================================================================

const HEALTH_STATUS_MAP: Record<string, string> = {
  normal: "正常",
  billing_error: "余额不足",
  auth_invalid: "密钥无效",
  rate_limited: "频率限制",
  degraded: "不稳定",
  down: "不可用",
  unknown: "未知",
};

export function getHealthStatusText(status: string): string {
  return HEALTH_STATUS_MAP[status] ?? status;
}

export function getHealthStatusColor(status: string): string {
  switch (status) {
    case "normal":
      return "#22c55e";
    case "degraded":
      return "#f59e0b";
    case "billing_error":
    case "auth_invalid":
    case "rate_limited":
    case "down":
      return "#ef4444";
    default:
      return "#9ca3af";
  }
}

/**
 * 加载所有已配置 Provider 的健康状态
 */
export async function loadProviderHealth(host: ModelConfigHost): Promise<void> {
  if (!host.client || !host.connected) return;

  host.providerHealthLoading = true;
  try {
    const result = await host.client.request("capability_matrix.health");
    const data = result as { health: Record<string, ProviderHealthInfo> };
    host.providerHealthMap = data.health ?? {};
  } catch {
    // 非关键功能，静默失败
  } finally {
    host.providerHealthLoading = false;
  }
}

/**
 * 测试单个 Provider 的连接状态
 */
export async function testProviderConnection(
  host: ModelConfigHost,
  providerId: string,
): Promise<void> {
  if (!host.client || !host.connected) return;

  host.providerTestingId = providerId;
  host.providerTestResult = null;

  try {
    const result = await host.client.request("capability_matrix.provider.testConnection", {
      providerId,
    });
    const data = result as { success: boolean; status: string; message: string };
    host.providerTestResult = {
      providerId,
      success: data.success,
      status: data.status,
      message: data.message,
    };
    // 更新健康状态 map
    if (data.status) {
      host.providerHealthMap = {
        ...host.providerHealthMap,
        [providerId]: {
          status: data.status as ProviderHealthInfo["status"],
          message: data.message,
          lastCheckedAt: Date.now(),
        },
      };
    }
  } catch (err) {
    host.providerTestResult = {
      providerId,
      success: false,
      status: "unknown",
      message: `测试失败: ${String(err)}`,
    };
  } finally {
    host.providerTestingId = null;
  }
}

// ============================================================================
// OpenClawCN: Provider 优先级排序
// ============================================================================

/**
 * 加载 Provider 优先级排序
 */
export async function loadProviderPriority(host: ModelConfigHost): Promise<void> {
  if (!host.client || !host.connected) return;

  try {
    const result = await host.client.request("capability_matrix.priority.get");
    const data = result as { priority: string[] };
    host.providerPriority = data.priority ?? [];
  } catch {
    // 非关键功能，静默失败
  }
}

/**
 * 保存 Provider 优先级排序
 */
export async function saveProviderPriority(
  host: ModelConfigHost,
  priority: string[],
): Promise<void> {
  if (!host.client || !host.connected) return;

  // 记住当前 text 模型，用于判断是否需要 /new
  const oldTextModel = host.capabilities.find((c) => c.capability === "text")?.currentModel;
  const oldTextKey = oldTextModel ? `${oldTextModel.providerId}/${oldTextModel.modelId}` : "";

  host.providerPrioritySaving = true;
  try {
    await host.client.request("capability_matrix.priority.save", { priority });
    host.providerPriority = priority;
    // 优先级变更会联动 modelCapability，刷新 UI 显示（失败不影响主流程）
    try {
      await loadCapabilities(host);
    } catch {
      /* UI 刷新失败非关键 */
    }

    // text 模型变了则中止当前请求，保留聊天记录，下一条消息使用新模型
    const newTextModel = host.capabilities.find((c) => c.capability === "text")?.currentModel;
    const newTextKey = newTextModel ? `${newTextModel.providerId}/${newTextModel.modelId}` : "";
    if (newTextKey && newTextKey !== oldTextKey) {
      globalThis.dispatchEvent?.(new CustomEvent("openclawcn:model-switched"));
    }
  } catch (err) {
    host.modelConfigError = `保存优先级失败: ${String(err)}`;
  } finally {
    host.providerPrioritySaving = false;
  }
}

/**
 * 重新排序 Providers（拖拽后调用）
 */
export async function reorderProviders(
  host: ModelConfigHost,
  fromIndex: number,
  toIndex: number,
): Promise<void> {
  const configured = host.providers
    .filter((p) => p.configured)
    .sort((a, b) => {
      const ai = host.providerPriority.indexOf(a.providerId);
      const bi = host.providerPriority.indexOf(b.providerId);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });

  if (fromIndex < 0 || fromIndex >= configured.length) return;
  if (toIndex < 0 || toIndex >= configured.length) return;

  const newOrder = [...configured];
  const [moved] = newOrder.splice(fromIndex, 1);
  newOrder.splice(toIndex, 0, moved);

  const priority = newOrder.map((p) => p.providerId);
  await saveProviderPriority(host, priority);
}
