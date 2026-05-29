/**
 * 免费模型管理 Controller
 * 调用 Gateway 的 freeModels.* API
 */

import type {
  FreeModelProvider,
  FreeModelAccount,
  FreeModelsStats,
  FreeModelSwitchRecord,
} from "../views/free-models";

export interface FreeModelsConfig {
  enabled: boolean;
  accounts: FreeModelAccount[];
  scheduling: {
    strategy: "priority" | "round_robin";
    showNotification: boolean;
    preCheck: boolean;
  };
  stats: FreeModelsStats;
  switchHistory: FreeModelSwitchRecord[];
}

export interface FreeModelsState {
  freeModelsLoading: boolean;
  freeModelsEnabled: boolean;
  freeModelsProviders: FreeModelProvider[];
  freeModelsAccounts: FreeModelAccount[];
  freeModelsStats: FreeModelsStats;
  freeModelsSwitchHistory: FreeModelSwitchRecord[];
  freeModelsError: string | null;
  // 配置弹窗状态
  freeModelsConfigModalOpen: boolean;
  freeModelsConfigModalProvider: FreeModelProvider | null;
  freeModelsConfigModalApiKey: string;
  freeModelsConfigModalTesting: boolean;
  freeModelsConfigModalTestResult: { success: boolean; message: string } | null;
  freeModelsConfigModalSaving: boolean;
  // 删除弹窗状态
  freeModelsDeleteModalOpen: boolean;
  freeModelsDeleteModalProvider: FreeModelProvider | null;
  freeModelsDeleteModalDeleting: boolean;
}

type FreeModelsHost = FreeModelsState & {
  client: { request: (method: string, params?: unknown) => Promise<unknown> } | null;
  connected: boolean;
};

/**
 * 创建初始状态
 */
export function createInitialFreeModelsState(): FreeModelsState {
  return {
    freeModelsLoading: false,
    freeModelsEnabled: false,
    freeModelsProviders: [],
    freeModelsAccounts: [],
    freeModelsStats: {
      todaySavings: 0,
      totalSavings: 0,
      todayFreeRequests: 0,
      lastResetDate: new Date().toISOString().split("T")[0],
    },
    freeModelsSwitchHistory: [],
    freeModelsError: null,
    freeModelsConfigModalOpen: false,
    freeModelsConfigModalProvider: null,
    freeModelsConfigModalApiKey: "",
    freeModelsConfigModalTesting: false,
    freeModelsConfigModalTestResult: null,
    freeModelsConfigModalSaving: false,
    freeModelsDeleteModalOpen: false,
    freeModelsDeleteModalProvider: null,
    freeModelsDeleteModalDeleting: false,
  };
}

/**
 * 加载免费模型数据
 */
export async function loadFreeModels(host: FreeModelsHost): Promise<void> {
  if (!host.client || !host.connected) {
    host.freeModelsError = "未连接到 Gateway";
    host.freeModelsLoading = false; // 确保未连接时不显示加载状态
    return;
  }

  host.freeModelsLoading = true;
  host.freeModelsError = null;

  try {
    // 并行加载 providers 和 config
    const [providersResult, configResult] = await Promise.all([
      host.client.request("freeModels.providers"),
      host.client.request("freeModels.config.get"),
    ]);

    const providers = providersResult as { providers: FreeModelProvider[] };
    const config = configResult as {
      configured: boolean;
      config: FreeModelsConfig;
    };

    host.freeModelsProviders = providers.providers ?? [];

    if (config.configured && config.config) {
      host.freeModelsEnabled = config.config.enabled;
      host.freeModelsAccounts = config.config.accounts ?? [];
      host.freeModelsStats = config.config.stats ?? createInitialFreeModelsState().freeModelsStats;
      host.freeModelsSwitchHistory = config.config.switchHistory ?? [];
    }
  } catch (err) {
    host.freeModelsError = `加载失败: ${String(err)}`;
  } finally {
    host.freeModelsLoading = false;
  }
}

/**
 * 切换启用状态
 */
export async function toggleFreeModelsEnabled(
  host: FreeModelsHost,
  enabled: boolean,
): Promise<void> {
  if (!host.client || !host.connected) return;

  // 前端预校验：开启时必须有已配置的账号
  if (enabled && host.freeModelsAccounts.length === 0) {
    host.freeModelsError = "请先配置至少 1 个免费模型提供商，再开启此功能";
    return;
  }

  // 记录调用前的原始状态，失败时用于精确恢复（而非依赖 !enabled 推断）
  const originalEnabled = host.freeModelsEnabled;

  try {
    const result = (await host.client.request("freeModels.config.update", { enabled })) as {
      success: boolean;
      error?: string;
      message?: string;
    };

    if (result && result.success === false) {
      // 后端拒绝（例如 NO_ACCOUNTS）：原始状态未变，只显示错误
      host.freeModelsError = result.message ?? "开启失败";
      return;
    }

    host.freeModelsEnabled = enabled;
    host.freeModelsError = null;
  } catch (err) {
    host.freeModelsError = `更新失败: ${String(err)}`;
    // 恢复调用前的原始状态，而非用 !enabled 推断（推断在重复调用时会出错）
    host.freeModelsEnabled = originalEnabled;
  }
}

/**
 * 打开配置弹窗
 * 如果该 provider 已配置，自动回填 API Key
 */
export function openConfigModal(host: FreeModelsHost, provider: FreeModelProvider): void {
  host.freeModelsConfigModalOpen = true;
  host.freeModelsConfigModalProvider = provider;
  // 检查是否已有该 provider 的配置，回填 API Key
  const existingAccount = host.freeModelsAccounts.find((acc) => acc.providerId === provider.id);
  host.freeModelsConfigModalApiKey = existingAccount?.apiKey ?? "";
  host.freeModelsConfigModalTesting = false;
  host.freeModelsConfigModalTestResult = null;
  host.freeModelsConfigModalSaving = false;
}

/**
 * 关闭配置弹窗
 */
export function closeConfigModal(host: FreeModelsHost): void {
  host.freeModelsConfigModalOpen = false;
  host.freeModelsConfigModalProvider = null;
  host.freeModelsConfigModalApiKey = "";
  host.freeModelsConfigModalTesting = false;
  host.freeModelsConfigModalTestResult = null;
  host.freeModelsConfigModalSaving = false;
}

/**
 * 更新 API Key 输入
 */
export function updateApiKey(host: FreeModelsHost, apiKey: string): void {
  host.freeModelsConfigModalApiKey = apiKey;
  // 清除之前的测试结果
  host.freeModelsConfigModalTestResult = null;
}

/**
 * 测试连接
 */
export async function testConnection(host: FreeModelsHost): Promise<void> {
  if (!host.client || !host.connected) return;
  if (!host.freeModelsConfigModalProvider) return;

  host.freeModelsConfigModalTesting = true;
  host.freeModelsConfigModalTestResult = null;

  try {
    const result = await host.client.request("freeModels.account.test", {
      providerId: host.freeModelsConfigModalProvider.id,
      apiKey: host.freeModelsConfigModalApiKey,
    });

    // 后端返回 { valid: boolean; error?: string }
    const testResult = result as { valid: boolean; error?: string };
    host.freeModelsConfigModalTestResult = {
      success: testResult.valid,
      message: testResult.valid
        ? "✅ 连接成功，可以使用免费额度"
        : translateApiError(testResult.error ?? "连接失败"),
    };
  } catch (err) {
    host.freeModelsConfigModalTestResult = {
      success: false,
      message: `测试失败: ${String(err)}`,
    };
  } finally {
    host.freeModelsConfigModalTesting = false;
  }
}

/**
 * 保存配置（自动验证）
 */
export async function saveConfig(host: FreeModelsHost): Promise<void> {
  if (!host.client || !host.connected) return;
  if (!host.freeModelsConfigModalProvider) return;

  host.freeModelsConfigModalSaving = true;
  host.freeModelsConfigModalTestResult = null;

  try {
    const result = await host.client.request("freeModels.account.add", {
      providerId: host.freeModelsConfigModalProvider.id,
      apiKey: host.freeModelsConfigModalApiKey,
    });

    const addResult = result as { success: boolean; error?: string };

    if (addResult.success) {
      // 先刷新数据，成功后再关闭弹窗
      // 顺序很重要：若先关弹窗再刷新，刷新失败的错误会写入 freeModelsError
      // 但用户已看不到弹窗内的错误提示区域
      await loadFreeModels(host);
      if (!host.freeModelsError) {
        closeConfigModal(host);
      } else {
        // 刷新失败：保持弹窗开启，让用户看到错误
        host.freeModelsConfigModalTestResult = {
          success: false,
          message: `保存成功，但刷新列表失败: ${host.freeModelsError}`,
        };
        host.freeModelsError = null;
      }
    } else {
      // 验证失败，显示错误信息（汉化）
      const errorMsg = translateApiError(addResult.error ?? "未知错误");
      host.freeModelsConfigModalTestResult = {
        success: false,
        message: errorMsg,
      };
    }
  } catch (err) {
    // 网络或其他错误
    const errorMsg = translateApiError(String(err));
    host.freeModelsConfigModalTestResult = {
      success: false,
      message: errorMsg,
    };
  } finally {
    host.freeModelsConfigModalSaving = false;
  }
}

/**
 * 翻译 API 错误信息为中文
 */
function translateApiError(error: string): string {
  const errorMap: Record<string, string> = {
    // 认证错误
    "API 密钥无效或已过期": "API 密钥无效或已过期，请检查是否复制正确",
    "Invalid API key": "API 密钥无效，请检查格式是否正确",
    Unauthorized: "未授权，请检查 API 密钥",
    "Authentication failed": "认证失败，请重新获取 API 密钥",
    // 网络错误
    网络错误: "网络连接失败，请检查网络后重试",
    "fetch failed": "网络请求失败，请检查网络连接",
    ECONNREFUSED: "无法连接到服务器，请稍后重试",
    ETIMEDOUT: "连接超时，请稍后重试",
    // 配额错误
    quota_exceeded: "今日免费额度已用完",
    daily_limit_exceeded: "今日请求次数已达上限",
    rate_limit: "请求过于频繁，请稍后重试",
    // 其他
    该模型已配置: "该模型已配置，无需重复添加",
    "未知的 Provider": "不支持的模型提供商",
  };

  // 检查是否有完全匹配
  if (errorMap[error]) {
    return errorMap[error];
  }

  // 检查是否包含关键词
  for (const [key, value] of Object.entries(errorMap)) {
    if (error.toLowerCase().includes(key.toLowerCase())) {
      return value;
    }
  }

  // 如果是 HTTP 状态码错误
  if (error.includes("HTTP 4") || error.includes("HTTP 5")) {
    return `服务器返回错误: ${error}`;
  }

  // 默认返回原始错误
  return `配置失败: ${error}`;
}

/**
 * 打开删除弹窗
 */
export function openDeleteModal(host: FreeModelsHost, provider: FreeModelProvider): void {
  host.freeModelsDeleteModalOpen = true;
  host.freeModelsDeleteModalProvider = provider;
  host.freeModelsDeleteModalDeleting = false;
}

/**
 * 关闭删除弹窗
 */
export function closeDeleteModal(host: FreeModelsHost): void {
  host.freeModelsDeleteModalOpen = false;
  host.freeModelsDeleteModalProvider = null;
  host.freeModelsDeleteModalDeleting = false;
}

/**
 * 确认删除
 */
export async function confirmDelete(host: FreeModelsHost): Promise<void> {
  if (!host.client || !host.connected) return;
  if (!host.freeModelsDeleteModalProvider) return;

  host.freeModelsDeleteModalDeleting = true;

  try {
    await host.client.request("freeModels.account.remove", {
      providerId: host.freeModelsDeleteModalProvider.id,
    });

    // 删除成功，关闭弹窗并刷新数据
    closeDeleteModal(host);
    await loadFreeModels(host);
  } catch (err) {
    host.freeModelsError = `删除失败: ${String(err)}`;
  } finally {
    host.freeModelsDeleteModalDeleting = false;
  }
}

/**
 * 设为首选
 */
export async function setPreferred(host: FreeModelsHost, providerId: string): Promise<void> {
  if (!host.client || !host.connected) return;

  try {
    // 重新排序，将选中的放到第一位
    const currentOrder = host.freeModelsAccounts.map((a) => a.providerId);
    const newOrder = [providerId, ...currentOrder.filter((id) => id !== providerId)];

    await host.client.request("freeModels.account.reorder", {
      order: newOrder,
    });

    // 刷新数据
    await loadFreeModels(host);
  } catch (err) {
    host.freeModelsError = `设置失败: ${String(err)}`;
  }
}

/**
 * 刷新数据
 */
export async function refreshFreeModels(host: FreeModelsHost): Promise<void> {
  await loadFreeModels(host);
}
