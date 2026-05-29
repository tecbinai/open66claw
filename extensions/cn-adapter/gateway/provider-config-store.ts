/**
 * Provider Config Store — 管理 provider 配置。
 *
 * 设计原则：
 * - openclaw.json 是唯一真相，所有 provider 配置遵循上游 schema
 * - 写入时合并而非覆盖，保留用户手动添加的字段（contextWindow、reasoning 等）
 * - cn-adapter.json 只存能力路由表，不存 provider 配置
 *
 * 两个文件：
 * - ~/.openclaw/openclaw.json → models.providers + agents.defaults.model
 *   （上游共用，config schema 严格校验，不允许未知字段）
 * - ~/.openclaw/cn-adapter.json → cn-adapter 扩展数据
 *   （能力绑定 cnModelCapability、provider 优先级 cnProviderPriority）
 */
import { readFileSync, existsSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { resolveDefaultConfigPath } from "../utils/config-path.js";
import { createCnLogger } from "../utils/index.js";
import { PROVIDER_BASE_URLS, getProviderModels } from "./probe-model.js";
import { PROVIDERS } from "./provider-registry.js";

const log = createCnLogger("provider-store");

// ====== Upstream Config Bridge ======
// cn-adapter 直接通过 fs 写文件会绕过上游的 runtimeConfigSnapshot，
// 导致 loadConfig() 返回旧配置。通过插件 API 注入上游的 loadConfig + writeConfigFile，
// 确保：
// 1. readConfig() 基于运行时快照（而非磁盘），避免 merge-patch 因结构差异产生错误 diff
// 2. writeConfigFile() 写入后运行时快照被正确刷新
type UpstreamConfigWriter = (
  cfg: any,
  options?: {
    allowConfigSizeDrop?: boolean;
    skipPluginValidation?: boolean;
    skipRuntimeSnapshotRefresh?: boolean;
    skipOutputLogs?: boolean;
  },
) => Promise<void>;
type UpstreamConfigLoader = () => any;
let _upstreamWriteConfigFile: UpstreamConfigWriter | null = null;
let _upstreamLoadConfig: UpstreamConfigLoader | null = null;

/** 由 cn-adapter index.ts 在 register 阶段调用，注入上游配置读写函数 */
export function setUpstreamConfigBridge(
  loadConfig: UpstreamConfigLoader,
  writeConfigFile: UpstreamConfigWriter,
): void {
  _upstreamLoadConfig = loadConfig;
  _upstreamWriteConfigFile = writeConfigFile;
}

// ====== Types ======

/** 上游 ModelDefinitionConfig 的宽松版——保留用户手写的所有字段 */
interface ModelEntry {
  id: string;
  name: string;
  [key: string]: unknown; // reasoning, contextWindow, maxTokens, cost, compat, ...
}

interface ProviderEntry {
  apiKey: string;
  baseUrl?: string;
  api?: string;
  headers?: Record<string, string>;
  models?: ModelEntry[];
  [key: string]: unknown; // auth, authHeader, injectNumCtxForOpenAICompat, ...
}

interface CapabilityBinding {
  providerId: string;
  modelId: string;
  auto: boolean;
}

/** 上游 openclaw.json（只读写 models + agents 段） */
interface OpenClawConfig {
  models?: {
    providers?: Record<string, ProviderEntry>;
  };
  agents?: {
    defaults?: {
      model?: string;
    };
  };
  [key: string]: unknown;
}

/** cn-adapter 扩展数据（独立文件，不受上游 schema 校验） */
interface CnAdapterData {
  cnModelCapability?: {
    capabilities?: Record<string, CapabilityBinding>;
  };
  cnProviderPriority?: string[];
}

// ====== openclaw.json Read / Write ======

let _configCache: OpenClawConfig | null = null;
let _configMtime = 0;

async function readConfig(): Promise<OpenClawConfig> {
  // 优先从上游运行时快照读取，确保：
  // 1. 与 runtimeConfigSnapshot 结构一致，writeConfigFile 的 merge-patch 只含实际变更
  // 2. 避免磁盘读取与运行时快照之间的字段差异导致 merge-patch 产生意外删除
  if (_upstreamLoadConfig) {
    try {
      // 深拷贝防止就地修改污染共享的运行时快照
      return structuredClone(_upstreamLoadConfig()) as OpenClawConfig;
    } catch {
      // 回退到磁盘读取
    }
  }

  const path = resolveDefaultConfigPath();
  try {
    const { mtimeMs } = await import("node:fs").then((fs) => fs.statSync(path));
    if (_configCache && mtimeMs === _configMtime) return _configCache;
    const raw = await readFile(path, "utf-8");
    _configCache = JSON.parse(raw) as OpenClawConfig;
    _configMtime = mtimeMs;
    return _configCache;
  } catch {
    return {};
  }
}

async function writeConfig(
  config: OpenClawConfig,
  options: {
    allowConfigSizeDrop?: boolean;
    skipPluginValidation?: boolean;
    skipRuntimeSnapshotRefresh?: boolean;
    skipOutputLogs?: boolean;
  } = {},
): Promise<void> {
  // 写入前剔除 cn-adapter 扩展字段（防止上游 schema 校验失败）
  const clean = { ...config };
  delete clean["cnModelCapability"];
  delete clean["cnProviderPriority"];

  // The upstream writeConfigFile refreshes the full runtime snapshot after the
  // file write. In the desktop setup flow that can block the UI for 20s+ while
  // provider auth and plugin state are rebuilt. Provider setup only needs the
  // source config persisted; the gateway watcher reloads it asynchronously.
  const directPath = resolveDefaultConfigPath();
  await mkdir(dirname(directPath), { recursive: true });
  const json = JSON.stringify(clean, null, 2) + "\n";
  await writeFile(directPath, json, "utf-8");
  log.info("config written directly; runtime reload will happen asynchronously");

  _configCache = clean;
  try {
    const { statSync } = await import("node:fs");
    _configMtime = statSync(directPath).mtimeMs;
  } catch {
    /* ignore */
  }
  return;
}

/*

  if (_upstreamWriteConfigFile) {
    // 优先使用上游 writeConfigFile：正确刷新 runtimeConfigSnapshot，
    // 避免后续 loadConfig() 返回旧配置导致 API Key 不生效
    await _upstreamWriteConfigFile(clean, {
      skipPluginValidation: true,
      skipRuntimeSnapshotRefresh: true,
      skipOutputLogs: true,
      ...options,
    });
    log.info("config written via upstream writeConfigFile (runtime snapshot refreshed)");
  } else {
    // 回退：直接写文件（开发/测试场景，上游可能未注入）
    const path = resolveDefaultConfigPath();
    await mkdir(dirname(path), { recursive: true });
    const json = JSON.stringify(clean, null, 2) + "\n";
    await writeFile(path, json, "utf-8");
  }

  // 更新本地缓存
  _configCache = clean;
  try {
    const { statSync } = await import("node:fs");
    const path = resolveDefaultConfigPath();
    _configMtime = statSync(path).mtimeMs;
  } catch {
    ignore
  }
}

*/
function invalidateCache(): void {
  _configCache = null;
  _configMtime = 0;
  _cnCache = null;
}

// ====== cn-adapter.json Read / Write ======

let _cnCache: CnAdapterData | null = null;

function getCnAdapterPath(): string {
  const configPath = resolveDefaultConfigPath();
  return join(dirname(configPath), "cn-adapter.json");
}

async function readCnData(): Promise<CnAdapterData> {
  const path = getCnAdapterPath();
  try {
    const raw = await readFile(path, "utf-8");
    _cnCache = JSON.parse(raw) as CnAdapterData;
    return _cnCache;
  } catch {
    return {};
  }
}

async function writeCnData(data: CnAdapterData): Promise<void> {
  const path = getCnAdapterPath();
  await mkdir(dirname(path), { recursive: true });
  const json = JSON.stringify(data, null, 2) + "\n";
  await writeFile(path, json, "utf-8");
  _cnCache = data;
}

// ====== Provider CRUD ======

/** 获取所有已配置 provider 的 ID 集合（从 openclaw.json 读取） */
export async function getConfiguredProviderIds(): Promise<Set<string>> {
  const config = await readConfig();
  const providers = config.models?.providers ?? {};
  return new Set(
    Object.entries(providers)
      .filter(([, v]) => v.apiKey && v.apiKey.length > 0)
      .map(([k]) => k),
  );
}

/** 获取 openclaw.json 中所有已配置 provider 的原始条目 */
export async function getAllConfiguredProviders(): Promise<Record<string, ProviderEntry>> {
  const config = await readConfig();
  const providers = config.models?.providers ?? {};
  const result: Record<string, ProviderEntry> = {};
  for (const [id, entry] of Object.entries(providers)) {
    if (entry.apiKey && entry.apiKey.length > 0) {
      result[id] = entry;
    }
  }
  return result;
}

/** 读取单个 provider 的配置（保留所有字段） */
export async function getProviderConfig(providerId: string): Promise<{
  configured: boolean;
  maskedApiKey: string;
  baseUrl: string;
  models: ModelEntry[];
}> {
  const config = await readConfig();
  const entry = config.models?.providers?.[providerId];
  if (!entry?.apiKey) {
    return { configured: false, maskedApiKey: "", baseUrl: "", models: [] };
  }
  const key = entry.apiKey;
  const masked =
    key.length > 10
      ? `${key.slice(0, 4)}${"*".repeat(Math.min(key.length - 8, 20))}${key.slice(-4)}`
      : "*".repeat(key.length);
  return {
    configured: true,
    maskedApiKey: masked,
    baseUrl: entry.baseUrl ?? "",
    models: entry.models ?? [],
  };
}

/**
 * 保存 provider 的 API Key + 模型列表到 openclaw.json。
 *
 * 合并策略：
 * - apiKey / baseUrl / api / headers：用新值覆盖
 * - models：按 id 合并，新检测到的模型补入，用户手动添加的模型保留
 * - 用户手写的其他字段（auth, contextWindow 等）：全部保留
 */
export async function saveProviderConfig(
  providerId: string,
  apiKey: string,
  baseUrl: string | undefined,
  detectedModels: ModelEntry[],
): Promise<void> {
  invalidateCache();
  const config = await readConfig();

  if (!config.models) config.models = {};
  if (!config.models.providers) config.models.providers = {};

  const apiType = getApiType(providerId);
  const providerHeaders = getProviderHeaders(providerId);
  // 上游 ModelProviderSchema 要求 baseUrl 必填，从 PROVIDER_BASE_URLS 回退
  const resolvedBaseUrl = baseUrl || PROVIDER_BASE_URLS[providerId] || "";

  const existing = config.models.providers[providerId];

  // 为模型注入 input 能力（vision 等），确保上游 model resolution 正确识别图片支持
  const modelInput = getProviderModelInput(providerId);
  const enrichedModels = detectedModels.map((m) => ({
    ...m,
    // 保留模型自带的 input，否则根据 provider capabilities 推断
    input: (m as any).input ?? modelInput,
  }));

  // 合并模型列表：保留用户手写的额外字段，补入新检测到的模型
  const mergedModels = mergeModelLists(existing?.models ?? [], enrichedModels);

  config.models.providers[providerId] = {
    // 先展开已有配置（保留用户手写的 auth, injectNumCtxForOpenAICompat 等）
    ...existing,
    // 再覆盖核心字段
    apiKey,
    baseUrl: resolvedBaseUrl,
    ...(apiType ? { api: apiType } : {}),
    ...(providerHeaders ? { headers: providerHeaders } : {}),
    models: mergedModels,
  };

  // 如果是第一个配置的 text provider 且 agents.defaults.model 没设置，自动设为主模型
  if (!config.agents?.defaults?.model && mergedModels.length > 0) {
    const textModel = mergedModels[0];
    if (textModel) {
      if (!config.agents) config.agents = {};
      if (!config.agents.defaults) config.agents.defaults = {};
      config.agents.defaults.model = `${providerId}/${textModel.id}`;
      log.info(`自动设置主模型: ${providerId}/${textModel.id}`);
    }
  }

  await writeConfig(config);
  log.info(`已保存 ${providerId} 配置 (${mergedModels.length} 个模型)`);
}

/** 删除 provider 配置 */
export async function deleteProviderConfig(providerId: string): Promise<void> {
  invalidateCache();
  const config = await readConfig();
  if (config.models?.providers?.[providerId]) {
    delete config.models.providers[providerId];
    await writeConfig(config, { allowConfigSizeDrop: true });
    // 清除能力绑定中引用此 provider 的条目
    const cnData = await readCnData();
    const caps = cnData.cnModelCapability?.capabilities;
    if (caps) {
      let changed = false;
      for (const [key, binding] of Object.entries(caps)) {
        if (binding.providerId === providerId) {
          delete caps[key];
          changed = true;
        }
      }
      if (changed) await writeCnData(cnData);
    }
    log.info(`已删除 ${providerId} 配置`);
  }
}

/** 获取 provider 的原始配置（含明文 API key），仅供 tool 内部使用 */
export async function getProviderRawConfig(providerId: string): Promise<{
  apiKey: string;
  baseUrl: string;
  models: ModelEntry[];
} | null> {
  const config = await readConfig();
  const entry = config.models?.providers?.[providerId];
  if (!entry?.apiKey) return null;
  return {
    apiKey: entry.apiKey,
    baseUrl: entry.baseUrl ?? "",
    models: entry.models ?? [],
  };
}

/** 追加单个模型到已配置的 provider */
export async function addModelToProvider(
  providerId: string,
  modelId: string,
  modelName: string,
): Promise<void> {
  invalidateCache();
  const config = await readConfig();
  const entry = config.models?.providers?.[providerId];
  if (!entry) return;
  if (!entry.models) entry.models = [];
  // 避免重复
  if (!entry.models.some((m) => m.id === modelId)) {
    entry.models.push({ id: modelId, name: modelName });
    await writeConfig(config);
    log.info(`追加模型 ${modelId} 到 ${providerId}`);
  }
}

// ====== Capability Binding（存在 cn-adapter.json） ======

/** 读取能力绑定 */
export async function getCapabilityBindings(): Promise<Record<string, CapabilityBinding>> {
  const cnData = await readCnData();
  return cnData.cnModelCapability?.capabilities ?? {};
}

/** 切换能力绑定 */
export async function switchCapabilityModel(
  capability: string,
  providerId: string,
  modelId: string,
): Promise<void> {
  invalidateCache();

  // 写入 cn-adapter.json
  const cnData = await readCnData();
  if (!cnData.cnModelCapability) cnData.cnModelCapability = {};
  if (!cnData.cnModelCapability.capabilities) cnData.cnModelCapability.capabilities = {};
  cnData.cnModelCapability.capabilities[capability] = {
    providerId,
    modelId,
    auto: false,
  };
  await writeCnData(cnData);

  // text 能力同步到 openclaw.json 的 agents.defaults.model
  if (capability === "text") {
    const config = await readConfig();
    if (!config.agents) config.agents = {};
    if (!config.agents.defaults) config.agents.defaults = {};
    config.agents.defaults.model = `${providerId}/${modelId}`;
    await writeConfig(config);
  }

  // vision 能力同步到 openclaw.json 的 agents.defaults.imageModel
  // 上游 image tool 的 resolveImageModelConfigForTool() 会优先读取此配置
  if (capability === "vision") {
    const imageModelValue = `${providerId}/${modelId}`;
    const config = await readConfig();
    if (!config.agents) config.agents = {};
    if (!config.agents.defaults) config.agents.defaults = {};
    (config.agents.defaults as Record<string, unknown>).imageModel = imageModelValue;
    await writeConfig(config);
    // 磁盘双写确保 merge-patch 不丢字段
    try {
      const diskPath = resolveDefaultConfigPath();
      const diskConfig = JSON.parse(readFileSync(diskPath, "utf-8"));
      if (!diskConfig.agents) diskConfig.agents = {};
      if (!diskConfig.agents.defaults) diskConfig.agents.defaults = {};
      diskConfig.agents.defaults.imageModel = imageModelValue;
      const { writeFileSync } = await import("node:fs");
      writeFileSync(diskPath, JSON.stringify(diskConfig, null, 2) + "\n", "utf-8");
    } catch {
      /* 非致命 */
    }
  }

  log.info(`切换 ${capability} → ${providerId}/${modelId}`);
}

// ====== Provider Priority（存在 cn-adapter.json） ======

export async function getProviderPriority(): Promise<string[]> {
  const cnData = await readCnData();
  return cnData.cnProviderPriority ?? [];
}

export async function saveProviderPriority(priority: string[]): Promise<void> {
  invalidateCache();
  const cnData = await readCnData();
  cnData.cnProviderPriority = priority;
  await writeCnData(cnData);
}

// ====== Helpers ======

/**
 * 合并模型列表：按 id 去重，保留已有模型的用户手写字段。
 * - 已有模型：保留所有字段，用新检测的 name 覆盖（如果有）
 * - 新检测到的模型：直接追加
 */
function mergeModelLists(existing: ModelEntry[], detected: ModelEntry[]): ModelEntry[] {
  const byId = new Map<string, ModelEntry>();

  // 先放已有的（保留用户手写的 contextWindow、reasoning 等）
  for (const m of existing) {
    byId.set(m.id, { ...m });
  }

  // 合并新检测到的
  for (const m of detected) {
    const prev = byId.get(m.id);
    if (prev) {
      // 已存在：更新 name，补充 input（不覆盖用户手写值）
      prev.name = m.name;
      if (!prev.input && (m as any).input) {
        (prev as any).input = (m as any).input;
      }
    } else {
      // 新模型：直接加入
      byId.set(m.id, { ...m });
    }
  }

  return Array.from(byId.values());
}

/** 根据 providerId 推断 API 类型（必须是上游 config schema 允许的值） */
function getApiType(providerId: string): string | undefined {
  switch (providerId) {
    case "anthropic":
    case "anthropic-compatible":
      return "anthropic-messages";
    case "kimi-coding":
    case "minimax-codeplan":
    case "minimax":
      // Kimi Code 和 MiniMax 使用 Anthropic Messages 兼容 API
      return "anthropic-messages";
    case "google":
      return "google-generative-ai";
    case "ollama":
      return "ollama";
    default:
      return "openai-completions"; // 大多数 CN provider 兼容 OpenAI 格式
  }
}

/**
 * 根据 provider-registry 中声明的 capabilities 推断模型的 input 能力。
 * 支持 vision 的 provider 返回 ["text", "image"]，否则返回 ["text"]。
 */
export function getProviderModelInput(providerId: string, _modelId?: string): Array<"text" | "image"> {
  const meta = PROVIDERS.find((p) => p.providerId === providerId);
  if (meta?.capabilities?.includes("vision")) {
    return ["text", "image"];
  }
  return ["text"];
}

/**
 * 某些 provider 需要特殊的 HTTP headers 才能正常工作。
 * 这些 headers 写入 openclaw.json 后，上游的 model resolution 会自动传递到 API 请求中。
 */
function getProviderHeaders(providerId: string): Record<string, string> | undefined {
  switch (providerId) {
    case "kimi-coding":
      // Kimi Code API 验证 User-Agent，必须包含 Coding Agent 标识
      return { "User-Agent": "claude-code/1.0" };
    default:
      return undefined;
  }
}

/**
 * 启动时确保所有 CN provider 的模型在 openclaw.json 中有完整定义。
 *
 * 解决的关键问题：
 * 1. cn-adapter 的 probe-model 定义的模型 ID（如 kimi-for-coding）可能
 *    不在上游 models.generated.js 中，导致 resolveModelWithRegistry 走
 *    fallback 路径，创建 input:["text"] 的模型对象 → 图片被过滤
 * 2. openclaw.json 可能缺少 models.providers 段（被重置或首次启动）
 *
 * 策略：
 * - 从 models.json（pi-ai discovery 文件）检测已认证的 CN provider
 * - 确保这些 provider 在 openclaw.json 的 models.providers 中有定义
 * - 确保 probe-model 定义的所有模型都在 provider 的 models 列表中
 * - 确保每个模型有正确的 input（vision 支持）和 api 字段
 *
 * 此函数应在 cn-adapter 启动时调用一次。
 */
export async function ensureModelInputCapabilities(): Promise<void> {
  log.warn(`[CN-IMG-TRACE] ensureModelInputCapabilities: START`);
  const config = await readConfig();
  if (!config.models) config.models = {};
  if (!config.models.providers) config.models.providers = {};
  const providers = config.models.providers;

  // 从 models.json 读取已认证的 provider API keys
  const modelsJsonProviders = readModelsJsonProviders();
  log.warn(`[CN-IMG-TRACE] ensureModelInputCapabilities: modelsJsonProviders=${JSON.stringify(Object.keys(modelsJsonProviders))} configProviders=${JSON.stringify(Object.keys(providers))}`);

  let changed = false;

  // 遍历 models.json 中有 API key 的 CN provider
  for (const [providerId, mjEntry] of Object.entries(modelsJsonProviders)) {
    // 只处理 cn-adapter 知道的 provider（在 PROVIDERS 注册表中）
    if (!PROVIDERS.find((p) => p.providerId === providerId)) {
      log.warn(`[CN-IMG-TRACE] ensureModelInputCapabilities: skip unknown provider ${providerId}`);
      continue;
    }

    const expectedInput = getProviderModelInput(providerId);
    log.warn(`[CN-IMG-TRACE] ensureModelInputCapabilities: provider=${providerId} expectedInput=${JSON.stringify(expectedInput)}`);
    const apiType = getApiType(providerId);
    const baseUrl = mjEntry.baseUrl || PROVIDER_BASE_URLS[providerId] || "";
    const providerHeaders = getProviderHeaders(providerId);

    // 获取 cn-adapter probe-model 定义的模型列表
    const cnModels = getProviderModels(providerId);

    // 确保 provider 在 openclaw.json 中存在
    if (!providers[providerId]) {
      providers[providerId] = {
        apiKey: mjEntry.apiKey,
        baseUrl,
        ...(apiType ? { api: apiType } : {}),
        ...(providerHeaders ? { headers: providerHeaders } : {}),
        models: [],
      };
      changed = true;
    }
    const provEntry = providers[providerId];
    if (!provEntry.models) provEntry.models = [];

    // 补充 provider 级别的必要 headers（如 kimi-coding 需要 User-Agent）
    // 即使 provider 已存在，也要确保 headers 是最新的
    if (providerHeaders && !provEntry.headers) {
      provEntry.headers = providerHeaders;
      changed = true;
    }

    // 确保 probe-model 定义的每个模型都在 models 列表中
    // 优先使用模型级别的 input（精确），回退到 provider 级别的 expectedInput（宽泛）
    for (const cnModel of cnModels) {
      const modelInput = (cnModel as any).input ?? expectedInput;
      const existing = provEntry.models.find((m) => m.id === cnModel.id);
      if (!existing) {
        provEntry.models.push({
          id: cnModel.id,
          name: cnModel.name,
          input: modelInput,
        } as ModelEntry);
        changed = true;
      } else {
        // 用精确的模型级别 input 覆盖（确保与实际能力一致）
        const cur = (existing as any).input as string[] | undefined;
        if (!cur || JSON.stringify(cur) !== JSON.stringify(modelInput)) {
          (existing as any).input = modelInput;
          changed = true;
        }
      }
    }

    // 对于 probe-model 未定义的已有模型（来自用户手动添加等），仅补充缺失的 input
    const cnModelIds = new Set(cnModels.map((m) => m.id));
    for (const model of provEntry.models) {
      if (cnModelIds.has((model as any).id)) continue; // 已在上面处理
      const cur = (model as any).input as string[] | undefined;
      if (!cur) {
        (model as any).input = expectedInput;
        changed = true;
      }
    }
  }

  // 补充 openclaw.json 中已有但完全没有 input 字段的模型（不强制覆盖已有值）
  for (const [providerId, entry] of Object.entries(providers)) {
    if (!entry?.models || !Array.isArray(entry.models)) continue;
    const providerInput = getProviderModelInput(providerId);
    for (const model of entry.models) {
      const cur = (model as any).input as string[] | undefined;
      if (!cur) {
        // 尝试从 probe-model 获取精确的模型级别 input
        const cnModels = getProviderModels(providerId);
        const cnModel = cnModels.find((m) => m.id === (model as any).id);
        (model as any).input = (cnModel as any)?.input ?? providerInput;
        changed = true;
      }
    }
  }

  log.warn(`[CN-IMG-TRACE] ensureModelInputCapabilities: changed=${changed}`);
  if (changed) {
    // 打印所有 provider 的模型 input 最终值
    for (const [pid, entry] of Object.entries(providers)) {
      if (entry?.models && Array.isArray(entry.models)) {
        for (const m of entry.models) {
          log.warn(`[CN-IMG-TRACE] final model: ${pid}/${(m as any).id} input=${JSON.stringify((m as any).input)}`);
        }
      }
    }
    await writeConfig(config);
    // 双写：直接写磁盘确保 input 字段持久化
    // writeConfig 通过 merge-patch 时可能无法正确处理数组元素内的新字段
    try {
      const diskPath = resolveDefaultConfigPath();
      const { readFileSync, writeFileSync } = await import("node:fs");
      const diskConfig = JSON.parse(readFileSync(diskPath, "utf-8")) as OpenClawConfig;
      if (diskConfig.models?.providers) {
        for (const [pid, entry] of Object.entries(diskConfig.models.providers)) {
          if (!entry?.models || !Array.isArray(entry.models)) continue;
          const providerInput = getProviderModelInput(pid);
          const cnModels = getProviderModels(pid);
          for (const m of entry.models) {
            const cur = (m as any).input as string[] | undefined;
            if (!cur) {
              // 优先用模型级别 input，回退到 provider 级别
              const cnModel = cnModels.find((cm) => cm.id === (m as any).id);
              (m as any).input = (cnModel as any)?.input ?? providerInput;
            }
          }
        }
        writeFileSync(diskPath, JSON.stringify(diskConfig, null, 2) + "\n", "utf-8");
      }
    } catch (diskErr) {
      log.debug(`磁盘双写 input 字段失败（非致命）: ${diskErr instanceof Error ? diskErr.message : String(diskErr)}`);
    }
    log.info("已确保 CN provider 模型定义完整（含 input 能力标记）");
  }

  // 自动绑定 agents.defaults.imageModel（确保上游 image tool 可用 CN 视觉模型）
  await autoBindImageModel(config, providers);
}

/**
 * 自动绑定 agents.defaults.imageModel。
 * 如果用户未手动设置，从已配置的 vision provider 中自动发现第一个视觉模型。
 * 这样上游 image tool 的 resolveImageModelConfigForTool() 可以直接使用 CN 视觉模型。
 */
async function autoBindImageModel(
  config: OpenClawConfig,
  providers: Record<string, any>,
): Promise<void> {
  // 先检查磁盘上的配置是否已有 imageModel（避免依赖 runtime snapshot 可能的时序问题）
  try {
    const diskPath = resolveDefaultConfigPath();
    const diskConfig = JSON.parse(readFileSync(diskPath, "utf-8"));
    if (diskConfig?.agents?.defaults?.imageModel) {
      log.debug("imageModel 已在磁盘配置中设置，跳过自动绑定");
      return;
    }
  } catch {
    /* 读磁盘失败继续尝试绑定 */
  }

  let imageModelValue: string | undefined;

  // 优先从 cn-adapter.json 的 vision binding 读取
  try {
    const cnData = await readCnData();
    const visionBinding = cnData.cnModelCapability?.capabilities?.vision;
    if (visionBinding?.providerId && visionBinding?.modelId) {
      imageModelValue = `${visionBinding.providerId}/${visionBinding.modelId}`;
      log.info(`自动绑定 imageModel → ${imageModelValue}（来自 vision binding）`);
    }
  } catch {
    // readCnData 失败时继续往下走 auto-discover
  }

  // 从已配置 provider 中发现第一个 vision 模型
  if (!imageModelValue) {
    for (const [pid, entry] of Object.entries(providers)) {
      if (!entry?.models || !Array.isArray(entry.models)) continue;
      for (const m of entry.models) {
        const input = (m as any).input as string[] | undefined;
        if (input?.includes("image")) {
          imageModelValue = `${pid}/${(m as any).id}`;
          log.info(`自动绑定 imageModel → ${imageModelValue}（auto-discover）`);
          break;
        }
      }
      if (imageModelValue) break;
    }
  }

  if (!imageModelValue) return;

  // 写入 config 对象 + 通过上游 writeConfig 写入
  if (!config.agents) (config as any).agents = {};
  if (!(config as any).agents.defaults) (config as any).agents.defaults = {};
  (config as any).agents.defaults.imageModel = imageModelValue;
  try {
    await writeConfig(config);
  } catch (err) {
    log.debug(`writeConfig imageModel 失败: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 磁盘双写：确保 merge-patch 未丢失 imageModel
  try {
    const diskPath = resolveDefaultConfigPath();
    const diskConfig = JSON.parse(readFileSync(diskPath, "utf-8"));
    if (!diskConfig.agents) diskConfig.agents = {};
    if (!diskConfig.agents.defaults) diskConfig.agents.defaults = {};
    if (!diskConfig.agents.defaults.imageModel) {
      diskConfig.agents.defaults.imageModel = imageModelValue;
      const { writeFileSync } = await import("node:fs");
      writeFileSync(diskPath, JSON.stringify(diskConfig, null, 2) + "\n", "utf-8");
      log.info(`imageModel 磁盘双写成功: ${imageModelValue}`);
    }
  } catch (diskErr) {
    log.debug(
      `imageModel 磁盘双写失败（非致命）: ${diskErr instanceof Error ? diskErr.message : String(diskErr)}`,
    );
  }
}

/**
 * 从 models.json（pi-ai discovery 文件）读取 provider 信息。
 * 这是一个同步读取，因为 models.json 在启动时已经被确保存在。
 */
function readModelsJsonProviders(): Record<string, { apiKey: string; baseUrl?: string }> {
  try {
    // models.json 的路径：~/.openclaw/agents/main/agent/models.json
    const modelsJsonPath = join(homedir(), ".openclaw", "agents", "main", "agent", "models.json");
    if (!existsSync(modelsJsonPath)) return {};

    const raw = readFileSync(modelsJsonPath, "utf-8");
    const data = JSON.parse(raw) as {
      providers?: Record<string, { apiKey?: string; baseUrl?: string }>;
    };

    const result: Record<string, { apiKey: string; baseUrl?: string }> = {};
    for (const [id, entry] of Object.entries(data.providers ?? {})) {
      if (entry.apiKey && entry.apiKey.length > 0) {
        result[id] = { apiKey: entry.apiKey, baseUrl: entry.baseUrl };
      }
    }
    return result;
  } catch {
    return {};
  }
}
