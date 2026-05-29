/**
 * 模型选择 Controller
 * 处理模型提供商列表获取和模型切换
 *
 * [FIX] 原来调用的 models.providers / models.setPrimary / models.setAuth
 * 后端从未注册，导致所有调用直接报错。
 * 现在全部重映射到已有的 capability_matrix.* 接口：
 *   - loadModelsProviders  → capability_matrix.summary (读 text 能力当前模型)
 *   - setModelPrimary      → capability_matrix.switchModel (capability="text")
 *   - setProviderAuth      → capability_matrix.provider.detect (异步检测+保存)
 */

import type { GatewayBrowserClient } from "../gateway";

/**
 * 模型信息
 */
export interface ModelInfo {
  id: string;
  name: string;
  description?: string;
  recommended?: boolean;
  pricing?: string;
}

/**
 * 认证字段类型
 */
export type AuthFieldType = "apiKey" | "secretId" | "accessToken";

/**
 * 提供商认证配置
 */
export interface ProviderAuthConfig {
  /** 认证字段类型 */
  authField: AuthFieldType;
  /** 输入提示（格式说明） */
  authHint?: string;
  /** 特殊说明（如需要科学上网） */
  authNote?: string;
  /** 环境变量名 */
  envVar: string;
  /** API Key 获取链接 */
  docsUrl: string;
  /** API 端点 */
  apiEndpoint: string;
}

/**
 * 提供商信息（包含认证配置）
 */
export interface ProviderInfo {
  id: string;
  name: string;
  description: string;
  models: ModelInfo[];
  /** 认证配置 */
  auth: ProviderAuthConfig;
  /** 是否已配置认证 */
  authConfigured: boolean;
  /** @deprecated 使用 auth.authNote */
  authNote?: string;
}

/**
 * 当前模型信息
 */
export interface CurrentModelInfo {
  provider: string;
  model: string;
  ref: string;
}

/**
 * 模型提供商响应（兼容旧接口形状）
 */
export interface ModelsProvidersResponse {
  providers: ProviderInfo[];
  defaults: Record<string, string>;
  current: CurrentModelInfo | null;
}

/**
 * API Key 验证结果
 */
export interface ApiKeyVerifyResult {
  valid: boolean;
  error?: string;
  message?: string;
}

/**
 * 模型状态
 */
export interface ModelsState {
  client: GatewayBrowserClient | null;
  connected: boolean;
  modelsLoading: boolean;
  modelsProviders: ProviderInfo[];
  modelsDefaults: Record<string, string>;
  modelsCurrent: CurrentModelInfo | null;
  modelsSaving: boolean;
  modelsError: string | null;
  /** 当前正在配置的提供商 ID */
  modelsConfiguringProvider: string | null;
  /** API Key 保存中 */
  modelsAuthSaving: boolean;
  /** API Key 验证中 */
  modelsAuthVerifying: boolean;
  /** API Key 验证结果 */
  modelsAuthVerifyResult: ApiKeyVerifyResult | null;
}

/**
 * capability_matrix.summary 的 capability 条目（部分字段）
 */
interface CapSummaryEntry {
  key: string;
  status: "active" | "unconfigured" | "missing";
  bestModel?: {
    provider: string;
    modelId: string;
    displayName: string;
  };
}

/**
 * 加载当前 text 能力模型作为「主模型」。
 *
 * 通过 capability_matrix.summary 获取 text 能力的当前绑定模型，
 * 并构造兼容旧接口的数据形状供上层使用。
 */
export async function loadModelsProviders(state: ModelsState): Promise<void> {
  if (!state.client || !state.connected) return;

  state.modelsLoading = true;
  state.modelsError = null;

  try {
    const res = (await state.client.request("capability_matrix.summary", {})) as {
      capabilities?: CapSummaryEntry[];
    };

    const textCap = (res.capabilities ?? []).find((c) => c.key === "text");
    if (textCap?.status === "active" && textCap.bestModel) {
      const { provider, modelId, displayName } = textCap.bestModel;
      state.modelsCurrent = { provider, model: modelId, ref: `${provider}/${modelId}` };
      // 构造最小 ProviderInfo，保持上层读取 modelsProviders 时不出错
      state.modelsProviders = [
        {
          id: provider,
          name: provider,
          description: "",
          models: [{ id: modelId, name: displayName, recommended: true }],
          auth: { authField: "apiKey", envVar: "", docsUrl: "", apiEndpoint: "" },
          authConfigured: true,
        },
      ];
    } else {
      state.modelsCurrent = null;
      state.modelsProviders = [];
    }
    state.modelsDefaults = {};
  } catch (err) {
    state.modelsError = String(err);
  } finally {
    state.modelsLoading = false;
  }
}

/**
 * 设置主模型（切换 text 能力绑定）。
 *
 * 通过 capability_matrix.switchModel 将 text 能力切换到指定 provider/model。
 */
export async function setModelPrimary(
  state: ModelsState,
  provider: string,
  model: string,
): Promise<boolean> {
  if (!state.client || !state.connected) return false;

  state.modelsSaving = true;
  state.modelsError = null;

  try {
    const res = (await state.client.request("capability_matrix.switchModel", {
      capability: "text",
      providerId: provider,
      modelId: model,
    })) as { success: boolean; error?: string; requiresRebuild?: boolean };

    if (res.success) {
      state.modelsCurrent = { provider, model, ref: `${provider}/${model}` };
      return true;
    }
    // requiresRebuild 说明 embedding 维度不匹配，提示用户但不视为致命错误
    state.modelsError = res.error ?? (res.requiresRebuild ? "需要重建向量库后生效" : "切换失败");
    return false;
  } catch (err) {
    state.modelsError = String(err);
    return false;
  } finally {
    state.modelsSaving = false;
  }
}

/**
 * 通过完整引用设置主模型（"provider/model" 格式）。
 */
export async function setModelPrimaryByRef(state: ModelsState, ref: string): Promise<boolean> {
  const slash = ref.indexOf("/");
  if (slash === -1) {
    state.modelsError = `无效的模型引用格式: ${ref}，期望 "provider/model"`;
    return false;
  }
  const provider = ref.slice(0, slash).trim();
  const model = ref.slice(slash + 1).trim();
  if (!provider || !model) {
    state.modelsError = `无效的模型引用格式: ${ref}`;
    return false;
  }
  return setModelPrimary(state, provider, model);
}

/**
 * 获取提供商显示名称
 */
export function getProviderDisplayName(state: ModelsState, providerId: string): string {
  const provider = state.modelsProviders.find((p) => p.id === providerId);
  return provider?.name ?? providerId;
}

/**
 * 获取模型显示名称
 */
export function getModelDisplayName(
  state: ModelsState,
  providerId: string,
  modelId: string,
): string {
  const provider = state.modelsProviders.find((p) => p.id === providerId);
  if (!provider) return modelId;
  const model = provider.models.find((m) => m.id === modelId);
  return model?.name ?? modelId;
}

/**
 * 获取当前模型的友好显示名称
 */
export function getCurrentModelDisplayName(state: ModelsState): string {
  if (!state.modelsCurrent) return "未配置";
  const { provider, model } = state.modelsCurrent;
  return getModelDisplayName(state, provider, model);
}

/**
 * 获取当前提供商的友好显示名称
 */
export function getCurrentProviderDisplayName(state: ModelsState): string {
  if (!state.modelsCurrent) return "";
  return getProviderDisplayName(state, state.modelsCurrent.provider);
}

/**
 * 设置提供商的认证信息（触发 provider detect 流程）。
 *
 * 通过 capability_matrix.provider.detect 提交 API Key 并异步检测。
 * detect 会立即返回 {started: true}，后续检测结果通过 broadcast 事件通知，
 * 此函数等待启动成功即视为认证配置已提交。
 */
export async function setProviderAuth(
  state: ModelsState,
  provider: string,
  auth: { apiKey?: string; secretId?: string; secretKey?: string },
): Promise<boolean> {
  if (!state.client || !state.connected) return false;

  state.modelsAuthSaving = true;
  state.modelsError = null;

  const apiKey = auth.apiKey ?? auth.secretId ?? auth.secretKey ?? "";
  if (!apiKey.trim()) {
    state.modelsError = "API Key 不能为空";
    state.modelsAuthSaving = false;
    return false;
  }

  try {
    const res = (await state.client.request("capability_matrix.provider.detect", {
      providerId: provider,
      apiKey: apiKey.trim(),
      autoSave: true,
    })) as { started?: boolean; success?: boolean; error?: string };

    if (res.started || res.success) {
      // 乐观更新：标记 provider 已配置
      const providerData = state.modelsProviders.find((p) => p.id === provider);
      if (providerData) {
        providerData.authConfigured = true;
      }
      return true;
    }
    state.modelsError = res.error ?? "配置失败";
    return false;
  } catch (err) {
    state.modelsError = String(err);
    return false;
  } finally {
    state.modelsAuthSaving = false;
  }
}

/**
 * 获取提供商信息
 */
export function getProviderById(state: ModelsState, providerId: string): ProviderInfo | undefined {
  return state.modelsProviders.find((p) => p.id === providerId);
}

/**
 * 验证 API Key（调用 setup-wizard 的验证端点）
 */
export async function verifyProviderApiKey(
  state: ModelsState,
  provider: string,
  apiKey: string,
  model?: string,
): Promise<ApiKeyVerifyResult> {
  state.modelsAuthVerifying = true;
  state.modelsAuthVerifyResult = null;

  try {
    const response = await fetch("/api/setup/verify-apikey", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, apiKey, model }),
    });

    if (!response.ok) {
      const result: ApiKeyVerifyResult = { valid: false, error: `HTTP ${response.status}` };
      state.modelsAuthVerifyResult = result;
      return result;
    }

    const json = (await response.json()) as {
      ok: boolean;
      data?: ApiKeyVerifyResult;
      error?: string;
    };

    if (!json.ok) {
      const result: ApiKeyVerifyResult = { valid: false, error: json.error ?? "验证请求失败" };
      state.modelsAuthVerifyResult = result;
      return result;
    }

    const result = json.data ?? { valid: false, error: "无效响应" };
    state.modelsAuthVerifyResult = result;
    return result;
  } catch (err) {
    const result: ApiKeyVerifyResult = { valid: false, error: String(err) };
    state.modelsAuthVerifyResult = result;
    return result;
  } finally {
    state.modelsAuthVerifying = false;
  }
}

/**
 * 清除验证结果
 */
export function clearVerifyResult(state: ModelsState): void {
  state.modelsAuthVerifyResult = null;
}
