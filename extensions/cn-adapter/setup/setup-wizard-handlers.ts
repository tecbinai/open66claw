/**
 * Setup Wizard - API Handlers (cn-adapter 版)
 * 配置向导的各步骤 API 处理器函数
 *
 * 适配自 clawdbot setup-wizard-handlers.ts（2738行）
 * 主要变更：
 * - 使用 provider-registry.ts 的 PROVIDERS / ProviderMeta 替代 CN_PROVIDERS / CnProviderConfig
 * - 使用 saveProviderConfig / getProviderConfig 替代 setXxxApiKey 系列
 * - 开源版不包含设备绑定流程
 * - discoverSiliconFlowModels / ensureOpenClawCNModelsJson / ensureAuthProfileStore → stub
 * - createSubsystemLogger → createCnLogger
 * - withConfigWriteLock / loadConfig / writeConfigFile → 来自上游 config
 */

import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import os from "node:os";
import path from "node:path";
import { loadConfig, writeConfigFile } from "../../../src/config/config.js";
import { scheduleGatewaySigusr1Restart } from "../../../src/infra/restart.js";
import { PROVIDER_BASE_URLS, getProviderModels } from "../gateway/probe-model.js";
import {
  saveProviderConfig,
  getProviderConfig,
  getConfiguredProviderIds,
} from "../gateway/provider-config-store.js";
import { PROVIDERS, PROVIDER_GROUPS, type ProviderMeta } from "../gateway/provider-registry.js";
import { createCnLogger } from "../utils/index.js";
import { getSetupState, updateSetupState, getChannelStartCallback } from "./setup-wizard-state.js";
import type {
  ValidateApiKeyRequest,
  VerifyApiKeyRequest,
  ConfigureProviderRequest,
  ConfigureWorkspaceRequest,
  ConfigureSecurityRequest,
  ConfigureChannelsRequest,
  FetchModelsRequest,
} from "./setup-wizard-types.js";
import { sendJson, readJsonBody, formatDockerBind } from "./setup-wizard-utils.js";

const log = createCnLogger("setup-wizard");

// ============================================================================
// Stubs — 暂不支持的功能（加 TODO 追踪）
// ============================================================================

/**
 * TODO: 接入实际模型发现逻辑（SiliconFlow API /models 列表）
 * 目前返回空数组，handleFetchModels 会回退到 ProviderMeta 静态列表
 */
async function discoverSiliconFlowModels(
  _apiKey: string | undefined,
): Promise<Array<{ id: string; name: string; reasoning?: boolean }>> {
  return [];
}

/**
 * TODO: 接入后实现 — models.json 刷新
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function ensureOpenClawCNModelsJson(_config: unknown): Promise<void> {
  // no-op stub
}

/**
 * TODO: 接入后实现 — 免费模型提供商
 */
function getAllFreeModelProviders(): never[] {
  return [];
}

/**
 * TODO: 接入后实现 — 免费模型提供商查找
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getFreeModelProvider(_id: string): null {
  return null;
}

/**
 * 中国版：始终返回 true
 */
function detectChinaRegion(): true {
  return true;
}

/**
 * 路径安全边界检查：只允许浏览用户主目录及安全路径
 * 内联实现（避免依赖 setup-wizard.ts 中的 isPathAllowedForBrowse）
 */
function isPathAllowedForBrowse(targetPath: string): boolean {
  const home = os.homedir();
  const normalized = path.resolve(targetPath);

  // 允许：用户主目录及其子目录
  if (normalized === home || normalized.startsWith(home + path.sep)) {
    return true;
  }

  // Windows：允许驱动器根目录（如 C:\）
  if (os.platform() === "win32") {
    const driveRoot = /^[A-Z]:\\$/i.test(normalized);
    if (driveRoot) return true;
  }

  // Linux/macOS：允许 /tmp, /var/tmp
  if (normalized === "/tmp" || normalized.startsWith("/tmp/")) return true;
  if (normalized === "/var/tmp" || normalized.startsWith("/var/tmp/")) return true;

  return false;
}

/**
 * normalizeProviderId: 直接 toLowerCase
 */
function normalizeProviderId(id: string): string {
  return String(id).toLowerCase();
}

// ============================================================================
// 默认安全配置（对应 clawdbot 的 CN_DEFAULT_SECURITY_CONFIG.sandbox）
// ============================================================================

const CN_DEFAULT_SECURITY_SANDBOX = {
  docker: {
    enabled: false,
  },
};

// ============================================================================
// Provider 辅助
// ============================================================================

/** 根据 providerId 查找 ProviderMeta，找不到时返回 undefined */
function findProvider(providerId: string): ProviderMeta | undefined {
  return PROVIDERS.find((p) => p.providerId === providerId);
}

/**
 * 根据 provider 获取测试端点 URL
 * 将 PROVIDER_BASE_URLS 中的 baseUrl 作为测试请求的基础
 */
function getProviderBaseUrl(providerId: string): string {
  return PROVIDER_BASE_URLS[providerId] ?? "";
}

// ============================================================================
// API Handlers
// ============================================================================

/**
 * GET /api/setup/state - 获取向导状态
 */
export async function handleGetState(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  const state = getSetupState();
  sendJson(res, 200, { ok: true, data: state });
}

/**
 * GET /api/setup/providers - 获取可用的 AI 提供商列表
 *
 * 返回格式适配 setup 页面：
 * - providers: ProviderMeta[]（含 group、capabilities 等信息）
 * - groups: ProviderGroupMeta[]（分组元数据）
 * - region: "cn" | "global"
 */
export async function handleGetProviders(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  // 中国版始终返回 cn
  const region = "cn";

  // 读取已配置的 provider 集合
  let configuredIds: Set<string>;
  try {
    configuredIds = await getConfiguredProviderIds();
  } catch {
    configuredIds = new Set<string>();
  }

  // 附加 configured 状态给每个 provider
  const providers = PROVIDERS.map((p) => ({
    ...p,
    configured: configuredIds.has(p.providerId),
  }));

  sendJson(res, 200, {
    ok: true,
    data: {
      providers,
      groups: PROVIDER_GROUPS,
      region,
    },
  });
}

/**
 * POST /api/setup/validate-api-key - 验证 API Key（基本格式检查）
 */
export async function handleValidateApiKey(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const body = await readJsonBody<ValidateApiKeyRequest>(req);
  if (!body || !body.provider || !body.apiKey) {
    sendJson(res, 400, { ok: false, error: "缺少必要参数" });
    return;
  }

  const { provider, apiKey } = body;

  // Ollama 本地服务无需真正的 API Key
  const minLength = provider === "ollama" ? 1 : 10;

  // 基本格式验证
  if (apiKey.trim().length < minLength) {
    sendJson(res, 400, { ok: false, error: "API Key 格式不正确" });
    return;
  }

  sendJson(res, 200, { ok: true, data: { valid: true } });
}

/**
 * POST /api/setup/verify-apikey - 验证 API Key 是否有效（实际调用 API 测试）
 */
export async function handleVerifyApiKey(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJsonBody<VerifyApiKeyRequest>(req);
  if (!body || !body.provider || !body.apiKey) {
    sendJson(res, 400, { ok: false, error: "缺少必要参数" });
    return;
  }

  const { provider, apiKey, model, endpoint: customEndpoint } = body;
  const trimmedKey = apiKey.trim();

  // Ollama 本地服务无需真正的 API Key
  const minKeyLength = provider === "ollama" ? 1 : 10;

  if (trimmedKey.length < minKeyLength) {
    sendJson(res, 200, { ok: true, data: { valid: false, error: "API Key 格式不正确，长度不足" } });
    return;
  }

  try {
    // ---- Anthropic 兼容 API ----
    if (provider === "anthropic-compatible") {
      if (!customEndpoint) {
        sendJson(res, 200, {
          ok: true,
          data: { valid: false, error: "请提供 Anthropic 兼容 API 端点地址" },
        });
        return;
      }
      const testModel = model || "test";
      const baseUrl = customEndpoint.replace(/\/+$/, "");
      const testUrl = baseUrl.endsWith("/messages") ? baseUrl : `${baseUrl}/v1/messages`;
      const testHeaders: Record<string, string> = {
        "x-api-key": trimmedKey,
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
      };
      const testBody = JSON.stringify({
        model: testModel,
        messages: [{ role: "user", content: "Hi" }],
        max_tokens: 5,
      });

      const response = await fetch(testUrl, {
        method: "POST",
        headers: testHeaders,
        body: testBody,
        signal: AbortSignal.timeout(15000),
      });

      if (response.ok) {
        sendJson(res, 200, {
          ok: true,
          data: { valid: true, message: "Anthropic 兼容 API 验证成功" },
        });
      } else {
        const errorText = await response.text();
        let errorMessage = "API Key 无效";
        try {
          const errorJson = JSON.parse(errorText) as {
            error?: { message?: string };
            message?: string;
          };
          errorMessage = errorJson.error?.message ?? errorJson.message ?? errorMessage;
        } catch {
          if (response.status === 401) errorMessage = "API Key 无效或已过期";
          else if (response.status === 403) errorMessage = "API Key 权限不足";
          else if (response.status === 404) errorMessage = "API 端点不存在，请检查地址是否正确";
          else if (response.status === 429) errorMessage = "[E1001] 请求频率超限，请稍后重试";
        }
        sendJson(res, 200, { ok: true, data: { valid: false, error: errorMessage } });
      }
      return;
    }

    // ---- OpenAI 兼容自定义端点 ----
    if (provider === "openai-compatible" || provider === "custom") {
      if (!customEndpoint) {
        sendJson(res, 200, {
          ok: true,
          data: { valid: false, error: "请提供自定义 API 端点地址" },
        });
        return;
      }
      const testModel = model || "test";
      const baseUrl = customEndpoint.replace(/\/+$/, "");
      const testUrl = baseUrl.endsWith("/chat/completions")
        ? baseUrl
        : `${baseUrl}/chat/completions`;
      const testHeaders: Record<string, string> = {
        Authorization: `Bearer ${trimmedKey}`,
        "Content-Type": "application/json",
      };
      const testBody = JSON.stringify({
        model: testModel,
        messages: [{ role: "user", content: "Hi" }],
        max_tokens: 5,
      });

      const response = await fetch(testUrl, {
        method: "POST",
        headers: testHeaders,
        body: testBody,
        signal: AbortSignal.timeout(15000),
      });

      if (response.ok) {
        sendJson(res, 200, { ok: true, data: { valid: true, message: "自定义 API 验证成功" } });
      } else {
        const errorText = await response.text();
        let errorMessage = "API Key 无效";
        try {
          const errorJson = JSON.parse(errorText) as {
            error?: { message?: string };
            message?: string;
          };
          errorMessage = errorJson.error?.message ?? errorJson.message ?? errorMessage;
        } catch {
          if (response.status === 401) errorMessage = "API Key 无效或已过期";
          else if (response.status === 403) errorMessage = "API Key 权限不足";
          else if (response.status === 404) errorMessage = "API 端点不存在，请检查地址是否正确";
          else if (response.status === 429) errorMessage = "[E1001] 请求频率超限，请稍后重试";
        }
        sendJson(res, 200, { ok: true, data: { valid: false, error: errorMessage } });
      }
      return;
    }

    const providerMeta = findProvider(provider);
    if (!providerMeta) {
      sendJson(res, 200, {
        ok: true,
        data: { valid: false, error: `不支持的提供商: ${provider}` },
      });
      return;
    }

    const endpoint = getProviderBaseUrl(provider);
    const testModel = model ?? "";

    // ---- OpenAI 兼容通用验证 ----
    const OPENAI_COMPAT_PROVIDERS = new Set([
      "siliconflow",
      "aliyun-bailian",
      "aliyun-codeplan",
      "deepseek",
      "glm",
      "glm-codeplan",
      "volcengine-ark",
      "volcengine-plan",
      "moonshot",
      "openai",
      "nvidia",
      "openrouter",
      "kimi-coding",
      "ant-ling",
      "meituan-longcat",
    ]);

    let testUrl = endpoint;
    let testHeaders: Record<string, string> = {};
    let testBody = "";

    if (OPENAI_COMPAT_PROVIDERS.has(provider)) {
      // Kimi Code 需要特殊 User-Agent
      const extraHeaders: Record<string, string> =
        provider === "kimi-coding" ? { "User-Agent": "claude-code/1.0" } : {};
      testUrl = `${endpoint}/chat/completions`;
      testHeaders = {
        Authorization: `Bearer ${trimmedKey}`,
        "Content-Type": "application/json",
        ...extraHeaders,
      };
      testBody = JSON.stringify({
        model: testModel,
        messages: [{ role: "user", content: "Hi" }],
        max_tokens: 5,
      });
    } else if (provider === "minimax-codeplan" || provider === "minimax") {
      // MiniMax 使用 Anthropic Messages 兼容 API
      testUrl = `${endpoint}/v1/messages`;
      testHeaders = {
        "x-api-key": trimmedKey,
        Authorization: `Bearer ${trimmedKey}`,
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
      };
      testBody = JSON.stringify({
        model: testModel,
        messages: [{ role: "user", content: "Hi" }],
        max_tokens: 5,
      });
    } else if (provider === "tencent-hunyuan") {
      // 腾讯混元使用不同的认证方式，暂时跳过实际验证
      sendJson(res, 200, { ok: true, data: { valid: true, message: "格式验证通过" } });
      return;
    } else if (provider === "google") {
      // Google Gemini REST API
      testUrl = `${endpoint}/models/${testModel}:generateContent?key=${trimmedKey}`;
      testHeaders = { "Content-Type": "application/json" };
      testBody = JSON.stringify({
        contents: [{ parts: [{ text: "Hi" }] }],
      });
    } else if (provider === "anthropic") {
      // Anthropic Claude Messages API
      testUrl = `${endpoint}/messages`;
      testHeaders = {
        "x-api-key": trimmedKey,
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
      };
      testBody = JSON.stringify({
        model: testModel,
        messages: [{ role: "user", content: "Hi" }],
        max_tokens: 5,
      });
    } else if (provider === "ollama") {
      // Ollama 本地模型
      const ollamaBase = endpoint.replace(/\/v1\/?$/, "");
      try {
        const tagsResponse = await fetch(`${ollamaBase}/api/tags`, {
          signal: AbortSignal.timeout(8000),
        });
        if (!tagsResponse.ok) {
          sendJson(res, 200, {
            ok: true,
            data: {
              valid: false,
              error: `Ollama 服务响应异常 (HTTP ${tagsResponse.status})，请检查 Ollama 是否正常运行`,
            },
          });
          return;
        }
        const tagsData = (await tagsResponse.json()) as { models?: Array<{ name: string }> };
        const localModels = tagsData.models ?? [];

        if (localModels.length === 0) {
          sendJson(res, 200, {
            ok: true,
            data: {
              valid: false,
              error:
                "Ollama 已运行，但未找到任何本地模型。请先运行 ollama pull <模型名> 下载模型（例如: ollama pull qwen3:8b）",
            },
          });
          return;
        }

        const modelNames = localModels.map((m) => m.name).join(", ");
        const modelExists =
          !testModel ||
          localModels.some((m) => m.name === testModel || m.name.startsWith(`${testModel}:`));

        if (!modelExists) {
          sendJson(res, 200, {
            ok: true,
            data: {
              valid: true,
              message: `Ollama 连接成功！已安装模型: ${modelNames}。注意: 当前选择的模型 ${testModel} 未安装，请运行 ollama pull ${testModel}`,
            },
          });
          return;
        }

        try {
          const chatResponse = await fetch(`${ollamaBase}/v1/chat/completions`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${trimmedKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: testModel,
              messages: [{ role: "user", content: "Hi" }],
              max_tokens: 5,
            }),
            signal: AbortSignal.timeout(30000),
          });
          if (chatResponse.ok) {
            sendJson(res, 200, {
              ok: true,
              data: { valid: true, message: `Ollama 验证成功！模型 ${testModel} 可正常使用` },
            });
          } else {
            const errText = await chatResponse.text();
            sendJson(res, 200, {
              ok: true,
              data: {
                valid: true,
                message: `Ollama 连接成功，模型 ${testModel} 已安装，但推理测试返回 ${chatResponse.status}: ${errText.slice(0, 200)}`,
              },
            });
          }
        } catch {
          sendJson(res, 200, {
            ok: true,
            data: {
              valid: true,
              message: `Ollama 连接成功！模型 ${testModel} 已安装（推理测试超时，可能模型正在加载中）`,
            },
          });
        }
        return;
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        if (
          errMsg.includes("fetch failed") ||
          errMsg.includes("ECONNREFUSED") ||
          errMsg.includes("connect")
        ) {
          sendJson(res, 200, {
            ok: true,
            data: {
              valid: false,
              error:
                "无法连接到 Ollama 服务。请确认：\n1. 已安装 Ollama（https://ollama.com）\n2. Ollama 服务正在运行（命令行执行 ollama serve）\n3. 服务地址为 http://localhost:11434",
            },
          });
        } else if (errMsg.includes("timeout") || errMsg.includes("ETIMEDOUT")) {
          sendJson(res, 200, {
            ok: true,
            data: { valid: false, error: "连接 Ollama 服务超时，请检查 Ollama 是否正在运行" },
          });
        } else {
          sendJson(res, 200, {
            ok: true,
            data: { valid: false, error: `Ollama 验证失败: ${errMsg}` },
          });
        }
        return;
      }
    } else {
      // 未知提供商，仅做格式验证
      sendJson(res, 200, { ok: true, data: { valid: true, message: "格式验证通过" } });
      return;
    }

    // 发起测试请求
    const response = await fetch(testUrl, {
      method: "POST",
      headers: testHeaders,
      body: testBody,
      signal: AbortSignal.timeout(15000),
    });

    const pName = providerMeta.name || provider;

    if (response.ok) {
      sendJson(res, 200, {
        ok: true,
        data: { valid: true, message: `${pName}: API Key 验证成功` },
      });
    } else {
      const errorText = await response.text();
      let errorMessage = `${pName}: API Key 无效`;

      try {
        const errorJson = JSON.parse(errorText) as {
          error?: { message?: string };
          message?: string;
        };
        if (errorJson.error?.message) {
          errorMessage = `${pName}: ${errorJson.error.message}`;
        } else if (errorJson.message) {
          errorMessage = `${pName}: ${errorJson.message}`;
        }

        // 火山引擎特殊错误处理
        if (
          (provider === "volcengine-ark" || provider === "volcengine-plan") &&
          (errorMessage.includes("does not exist") ||
            errorMessage.includes("do not have access") ||
            errorMessage.includes("not found") ||
            errorMessage.includes("invalid model"))
        ) {
          errorMessage =
            "豆包: 模型未开通！请先访问火山方舟控制台「开通管理」页面开通该模型：https://console.volcengine.com/ark/region:ark+cn-beijing/openManagement";
        }
      } catch {
        if (response.status === 401) {
          errorMessage = `${pName}: API Key 无效或已过期，请检查密钥配置`;
        } else if (response.status === 403) {
          errorMessage = `${pName}: API Key 权限不足`;
        } else if (response.status === 429) {
          errorMessage = `${pName}: [E1001] 请求频率超限，请稍后重试`;
        } else if (
          (provider === "volcengine-ark" || provider === "volcengine-plan") &&
          (response.status === 404 || response.status === 400)
        ) {
          errorMessage =
            "豆包: 模型未开通！请先访问火山方舟控制台「开通管理」页面开通该模型：https://console.volcengine.com/ark/region:ark+cn-beijing/openManagement";
        } else if (errorText) {
          errorMessage = `${pName}: 验证失败 (HTTP ${response.status}): ${errorText.slice(0, 200)}`;
        }
      }

      sendJson(res, 200, { ok: true, data: { valid: false, error: errorMessage } });
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const pNameFallback = findProvider(provider)?.name ?? provider;
    if (errorMsg.includes("timeout") || errorMsg.includes("ETIMEDOUT")) {
      sendJson(res, 200, {
        ok: true,
        data: { valid: false, error: `${pNameFallback}: 连接超时，请检查网络或稍后重试` },
      });
    } else {
      sendJson(res, 200, {
        ok: true,
        data: { valid: false, error: `${pNameFallback}: 验证失败: ${errorMsg}` },
      });
    }
  }
}

/**
 * POST /api/setup/configure-provider - 配置 AI 提供商
 *
 * 核心适配：
 * - 不再依赖 setXxxApiKey / auth.profiles
 * - 直接调用 saveProviderConfig 写入 openclaw.json 的 models.providers
 * - customEndpoint 对应 provider=openai-compatible / anthropic-compatible
 */
export async function handleConfigureProvider(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const body = await readJsonBody<ConfigureProviderRequest>(req);
  if (!body || !body.provider || !body.apiKey) {
    sendJson(res, 400, { ok: false, error: "缺少必要参数" });
    return;
  }

  const { provider, apiKey, model, endpoint: customEndpoint } = body;

  try {
    const trimmedKey = apiKey.trim();
    const normalizedProvider = normalizeProviderId(provider);

    // ---- Anthropic 兼容端点 ----
    if (provider === "anthropic-compatible") {
      if (!customEndpoint) {
        sendJson(res, 400, { ok: false, error: "Anthropic 兼容 API 需要提供端点地址" });
        return;
      }
      const baseUrl = customEndpoint.replace(/\/+$/, "");
      const defaultModel = model || "custom-model";
      const modelRef = `anthropic-compatible/${defaultModel}`;

      await saveProviderConfig("anthropic-compatible", trimmedKey, baseUrl, [
        { id: defaultModel, name: defaultModel },
      ]);

      // 同步更新 agents.defaults.model
      const config = loadConfig();
      await writeConfigFile({
        ...config,
        agents: {
          ...config.agents,
          defaults: {
            ...(config.agents as any)?.defaults,
            model: modelRef,
          },
        },
      } as any);

      updateSetupState({
        step: 2,
        provider: "anthropic-compatible",
        apiKeyConfigured: true,
      });

      sendJson(res, 200, { ok: true, data: { configured: true, model: modelRef } });
      return;
    }

    // ---- OpenAI 兼容自定义端点 ----
    if (provider === "openai-compatible" || provider === "custom") {
      if (!customEndpoint) {
        sendJson(res, 400, { ok: false, error: "自定义 API 需要提供端点地址" });
        return;
      }
      const baseUrl = customEndpoint.replace(/\/+$/, "");
      const defaultModel = model || "custom-model";
      const modelRef = `openai-compatible/${defaultModel}`;

      await saveProviderConfig("openai-compatible", trimmedKey, baseUrl, [
        { id: defaultModel, name: defaultModel },
      ]);

      const config = loadConfig();
      await writeConfigFile({
        ...config,
        agents: {
          ...config.agents,
          defaults: {
            ...(config.agents as any)?.defaults,
            model: modelRef,
          },
        },
      } as any);

      updateSetupState({
        step: 2,
        provider: "openai-compatible",
        apiKeyConfigured: true,
      });

      sendJson(res, 200, { ok: true, data: { configured: true, model: modelRef } });
      return;
    }

    // ---- 标准 Provider（使用 ProviderMeta 的 defaultBaseUrl） ----
    const providerMeta = findProvider(normalizedProvider);
    const baseUrl =
      (body as any).baseUrl ||
      providerMeta?.defaultBaseUrl ||
      PROVIDER_BASE_URLS[normalizedProvider] ||
      "";

    // 构建初始模型列表（从 probe-model 的预定义列表获取，确保 models 非空）
    const initialModels = getProviderModels(normalizedProvider);
    await saveProviderConfig(normalizedProvider, trimmedKey, baseUrl || undefined, initialModels);

    // 确定主模型 ref
    const defaultModel = model;
    const modelRef = defaultModel
      ? defaultModel.startsWith(`${normalizedProvider}/`)
        ? defaultModel
        : `${normalizedProvider}/${defaultModel}`
      : undefined;

    // 如果有 modelRef，更新 agents.defaults.model（saveProviderConfig 已处理无 model 时的自动设置）
    if (modelRef) {
      const config = loadConfig();
      const currentModel = (config.agents as any)?.defaults?.model;
      if (!currentModel) {
        await writeConfigFile({
          ...config,
          agents: {
            ...config.agents,
            defaults: {
              ...(config.agents as any)?.defaults,
              model: modelRef,
            },
          },
        } as any);
      }
    }

    // TODO: 完成后刷新 models.json（stub）
    try {
      await ensureOpenClawCNModelsJson(loadConfig());
      log.info(`models.json refreshed after setup provider: ${provider}`);
    } catch (mjErr) {
      log.warn(`models.json refresh after setup failed (non-critical): ${mjErr}`);
    }

    updateSetupState({
      step: 2,
      provider,
      apiKeyConfigured: true,
    });

    sendJson(res, 200, { ok: true, data: { configured: true, model: modelRef } });
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      error: `配置失败: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

/**
 * POST /api/setup/validate-path - 验证路径是否存在且可访问
 */
export async function handleValidatePath(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJsonBody<{ path: string }>(req);
  if (!body || !body.path) {
    sendJson(res, 400, { ok: false, error: "缺少路径参数" });
    return;
  }

  const targetPath = body.path.trim();

  try {
    const stats = fs.statSync(targetPath);
    if (!stats.isDirectory()) {
      sendJson(res, 200, {
        ok: true,
        data: {
          valid: false,
          exists: true,
          isDirectory: false,
          error: "指定的路径不是目录",
        },
      });
      return;
    }

    try {
      fs.accessSync(targetPath, fs.constants.R_OK);
    } catch {
      sendJson(res, 200, {
        ok: true,
        data: {
          valid: false,
          exists: true,
          isDirectory: true,
          readable: false,
          error: "目录无读取权限",
        },
      });
      return;
    }

    sendJson(res, 200, {
      ok: true,
      data: {
        valid: true,
        exists: true,
        isDirectory: true,
        readable: true,
        path: targetPath,
      },
    });
  } catch {
    sendJson(res, 200, {
      ok: true,
      data: {
        valid: false,
        exists: false,
        error: "路径不存在或无法访问",
      },
    });
  }
}

/**
 * GET /api/setup/browse-directory - 列出目录内容用于 Web 文件浏览器
 * 查询参数: path - 要列出的目录路径（可选，默认为用户主目录）
 */
export async function handleBrowseDirectory(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    const requestedPath = url.searchParams.get("path");

    let targetPath: string;
    if (requestedPath) {
      targetPath = requestedPath;
    } else {
      targetPath = os.homedir();
    }

    // 规范化路径（防止路径遍历）
    targetPath = path.resolve(targetPath);

    // 路径安全边界检查
    if (!isPathAllowedForBrowse(targetPath)) {
      sendJson(res, 403, { ok: false, error: "不允许浏览该路径" });
      return;
    }

    let stats: fs.Stats;
    try {
      stats = fs.statSync(targetPath);
      if (!stats.isDirectory()) {
        sendJson(res, 400, { ok: false, error: "指定的路径不是目录" });
        return;
      }
    } catch {
      sendJson(res, 400, { ok: false, error: "路径不存在或无法访问" });
      return;
    }

    const entries = fs.readdirSync(targetPath, { withFileTypes: true });

    const directories: Array<{ name: string; path: string }> = [];
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith(".")) {
        directories.push({
          name: entry.name,
          path: path.join(targetPath, entry.name),
        });
      }
    }

    directories.sort((a, b) => a.name.localeCompare(b.name));

    const parentPath = path.dirname(targetPath);
    const hasParent = parentPath !== targetPath;

    // Windows 驱动器列表
    let drives: string[] = [];
    if (os.platform() === "win32") {
      for (const letter of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
        const drivePath = `${letter}:\\`;
        try {
          fs.accessSync(drivePath);
          drives.push(drivePath);
        } catch {
          // 驱动器不存在或不可访问
        }
      }
    }

    sendJson(res, 200, {
      ok: true,
      data: {
        currentPath: targetPath,
        parentPath: hasParent ? parentPath : null,
        directories,
        drives,
        separator: path.sep,
      },
    });
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      error: `读取目录失败: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

/**
 * POST /api/setup/configure-workspace - 配置工作目录
 */
export async function handleConfigureWorkspace(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const body = await readJsonBody<ConfigureWorkspaceRequest>(req);
  if (!body || !body.workspace) {
    sendJson(res, 400, { ok: false, error: "缺少工作目录" });
    return;
  }

  const { workspace, additionalDirs } = body;

  try {
    if (!fs.existsSync(workspace)) {
      fs.mkdirSync(workspace, { recursive: true });
    }

    const config = loadConfig();
    const nextConfig = {
      ...config,
      agents: {
        ...config.agents,
        defaults: {
          ...(config.agents as any)?.defaults,
          workspace,
        },
      },
    };

    // 如果有额外的授权目录
    if (additionalDirs && additionalDirs.length > 0) {
      // TODO: 实现目录授权配置
    }

    await writeConfigFile(nextConfig as any);

    updateSetupState({
      step: 3,
      workspaceConfigured: true,
    });

    sendJson(res, 200, { ok: true, data: { workspace } });
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      error: `配置失败: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

/**
 * POST /api/setup/configure-security - 配置安全设置
 */
export async function handleConfigureSecurity(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const body = await readJsonBody<ConfigureSecurityRequest>(req);
  if (!body || !body.mode) {
    sendJson(res, 400, { ok: false, error: "缺少安全模式" });
    return;
  }

  const { mode, trustedDirs } = body;

  try {
    const config = loadConfig();
    let nextConfig: any = { ...config };

    if (mode === "standard") {
      const binds =
        trustedDirs && trustedDirs.length > 0
          ? trustedDirs.map((dir) => formatDockerBind(dir))
          : undefined;

      // 中国版：full + off（最大能力释放，小白无需确认）
      const isCn = detectChinaRegion();
      const execSecurity = isCn ? ("full" as const) : ("allowlist" as const);
      const execAsk = isCn ? ("off" as const) : ("on-miss" as const);

      // 预置常用命令白名单
      const safeBins = [
        // Windows 常用
        "notepad",
        "explorer",
        "calc",
        "mspaint",
        "code",
        "start",
        "where",
        "dir",
        "type",
        "echo",
        "set",
        "cd",
        "mkdir",
        "copy",
        // 开发工具 - 通用
        "python",
        "python3",
        "pip",
        "pip3",
        "node",
        "npm",
        "pnpm",
        "yarn",
        "bun",
        "git",
        "curl",
        "wget",
        // 开发工具 - Java
        "java",
        "javac",
        "mvn",
        "gradle",
        // 开发工具 - 其他
        "go",
        "cargo",
        "dotnet",
        // 压缩工具
        "tar",
        "zip",
        "unzip",
        // Linux 基础
        "ls",
        "cat",
        "grep",
        "find",
        "head",
        "tail",
        "wc",
        "sort",
        "uniq",
        "jq",
        "cp",
        "mv",
        "touch",
        "chmod",
        "pwd",
        "which",
        "env",
        // 浏览器
        "chrome",
        "msedge",
        "firefox",
      ];

      nextConfig = {
        ...nextConfig,
        agents: {
          ...nextConfig.agents,
          defaults: {
            ...nextConfig.agents?.defaults,
            sandbox: {
              ...CN_DEFAULT_SECURITY_SANDBOX,
              docker: binds
                ? {
                    ...nextConfig.agents?.defaults?.sandbox?.docker,
                    binds,
                  }
                : nextConfig.agents?.defaults?.sandbox?.docker,
            },
          },
        },
        tools: {
          ...nextConfig.tools,
          exec: {
            ...nextConfig.tools?.exec,
            security: execSecurity,
            ask: execAsk,
            safeBins,
          },
        },
      };
    }
    // mode === "trust" 时不添加额外限制

    await writeConfigFile(nextConfig);

    updateSetupState({
      step: 4,
      securityConfigured: true,
    });

    sendJson(res, 200, { ok: true, data: { mode, trustedDirs } });
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      error: `配置失败: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

// ============================================================================
// 渠道凭证验证函数
// ============================================================================

/**
 * 验证钉钉 AppKey 和 AppSecret
 */
async function verifyDingtalkCredentials(
  appKey: string,
  appSecret: string,
): Promise<{ valid: boolean; error?: string }> {
  try {
    const url = `https://oapi.dingtalk.com/gettoken?appkey=${encodeURIComponent(appKey)}&appsecret=${encodeURIComponent(appSecret)}`;
    const response = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(10000),
    });

    const data = (await response.json()) as {
      errcode: number;
      errmsg: string;
      access_token?: string;
    };

    if (data.errcode === 0 && data.access_token) {
      return { valid: true };
    } else {
      let errorMsg = data.errmsg || "验证失败";
      if (data.errcode === 40089) {
        errorMsg =
          "AppKey 不存在或无效。请检查：1) AppKey 是否复制完整（无多余空格）；2) 应用是否已在「版本管理与发布」中发布上线";
      } else if (data.errcode === 40091) {
        errorMsg =
          "AppSecret 不正确。请到钉钉开放平台「凭证与基础信息」页面点击「重置」生成新的 Secret";
      } else if (data.errcode === 40014) {
        errorMsg = "应用凭证无效。请检查 AppKey 和 AppSecret 是否匹配同一个应用";
      } else if (data.errcode === 400013) {
        errorMsg = "应用未启用。请在钉钉开放平台「版本管理与发布」中发布应用";
      }
      return { valid: false, error: errorMsg };
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("timeout")) {
      return { valid: false, error: "连接钉钉服务超时，请检查网络连接" };
    }
    return { valid: false, error: `验证失败: ${msg}` };
  }
}

/**
 * 验证飞书 App ID 和 App Secret
 */
async function verifyFeishuCredentials(
  appId: string,
  appSecret: string,
): Promise<{ valid: boolean; error?: string }> {
  try {
    const url = "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal";
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
      signal: AbortSignal.timeout(10000),
    });

    const data = (await response.json()) as {
      code: number;
      msg: string;
      tenant_access_token?: string;
    };

    if (data.code === 0 && data.tenant_access_token) {
      return { valid: true };
    } else {
      let errorMsg = data.msg || "验证失败";
      if (data.code === 10003) errorMsg = "App ID 不存在";
      else if (data.code === 10014) errorMsg = "App Secret 不正确";
      else if (data.code === 10015) errorMsg = "应用凭证已过期";
      return { valid: false, error: errorMsg };
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("timeout")) {
      return { valid: false, error: "连接飞书服务超时，请检查网络" };
    }
    return { valid: false, error: `验证失败: ${msg}` };
  }
}

/**
 * 验证企业微信 CorpID 和 AgentSecret
 */
async function verifyWecomCredentials(
  corpId: string,
  agentSecret: string,
): Promise<{ valid: boolean; error?: string }> {
  try {
    const url = `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${encodeURIComponent(corpId)}&corpsecret=${encodeURIComponent(agentSecret)}`;
    const response = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(10000),
    });

    const data = (await response.json()) as {
      errcode: number;
      errmsg: string;
      access_token?: string;
      expires_in?: number;
    };

    if (data.errcode === 0 && data.access_token) {
      return { valid: true };
    } else {
      let errorMsg = data.errmsg || "验证失败";
      if (data.errcode === 40013) errorMsg = "企业 ID (CorpID) 无效";
      else if (data.errcode === 40001) errorMsg = "应用 Secret 不正确";
      else if (data.errcode === 40056) errorMsg = "应用 Secret 不正确或已过期";
      else if (data.errcode === 42001) errorMsg = "应用凭证已过期，请重新获取";
      else if (data.errcode === 40091) errorMsg = "Secret 不合法";
      else if (data.errcode === -1) errorMsg = "系统繁忙，请稍后再试";
      return { valid: false, error: errorMsg };
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("timeout")) {
      return { valid: false, error: "连接企业微信服务超时，请检查网络" };
    }
    return { valid: false, error: `验证失败: ${msg}` };
  }
}

/**
 * 验证 QQ 机器人凭证
 */
async function verifyQqbotCredentials(
  appId: string,
  appSecret: string,
  sandbox?: boolean,
): Promise<{ valid: boolean; error?: string }> {
  try {
    const tokenUrl = "https://bots.qq.com/app/getAppAccessToken";
    const tokenResp = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appId, clientSecret: appSecret }),
      signal: AbortSignal.timeout(10000),
    });

    if (!tokenResp.ok) {
      return { valid: false, error: `Token 请求失败: HTTP ${tokenResp.status}` };
    }

    const tokenData = (await tokenResp.json()) as {
      access_token?: string;
      expires_in?: number;
      code?: number;
      message?: string;
    };

    if (!tokenData.access_token) {
      const errMsg = tokenData.message || "获取 Token 失败";
      return { valid: false, error: `AppID 或 AppSecret 不正确: ${errMsg}` };
    }

    const baseUrl = sandbox ? "https://sandbox.api.sgroup.qq.com" : "https://api.sgroup.qq.com";
    const meResp = await fetch(`${baseUrl}/users/@me`, {
      headers: { Authorization: `QQBot ${tokenData.access_token}` },
      signal: AbortSignal.timeout(10000),
    });

    if (!meResp.ok) {
      return { valid: false, error: `凭证验证失败: API 返回 ${meResp.status}` };
    }

    return { valid: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("timeout") || msg.includes("Timeout")) {
      return { valid: false, error: "连接 QQ 开放平台超时，请检查网络" };
    }
    return { valid: false, error: `验证失败: ${msg}` };
  }
}

/**
 * POST /api/setup/verify-channel - 验证渠道凭证
 */
export async function handleVerifyChannel(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const body = await readJsonBody<{ channel: string; credentials: Record<string, string> }>(req);
  if (!body || !body.channel || !body.credentials) {
    sendJson(res, 400, { ok: false, error: "缺少必要参数" });
    return;
  }

  const { channel, credentials } = body;

  try {
    let result: { valid: boolean; error?: string };

    if (channel === "dingtalk") {
      if (!credentials.appKey || !credentials.appSecret) {
        sendJson(res, 200, {
          ok: true,
          data: { valid: false, error: "请填写 App Key 和 App Secret" },
        });
        return;
      }
      result = await verifyDingtalkCredentials(credentials.appKey, credentials.appSecret);
    } else if (channel === "feishu") {
      if (!credentials.appId || !credentials.appSecret) {
        sendJson(res, 200, {
          ok: true,
          data: { valid: false, error: "请填写 App ID 和 App Secret" },
        });
        return;
      }
      result = await verifyFeishuCredentials(credentials.appId, credentials.appSecret);
    } else if (channel === "wecom") {
      if (!credentials.corpId || !credentials.agentSecret) {
        sendJson(res, 200, {
          ok: true,
          data: { valid: false, error: "请填写企业 ID 和应用 Secret" },
        });
        return;
      }
      result = await verifyWecomCredentials(credentials.corpId, credentials.agentSecret);
    } else if (channel === "qqbot") {
      if (!credentials.appId || !credentials.appSecret) {
        sendJson(res, 200, {
          ok: true,
          data: { valid: false, error: "请填写 AppID 和 AppSecret" },
        });
        return;
      }
      result = await verifyQqbotCredentials(
        credentials.appId,
        credentials.appSecret,
        credentials.sandbox === "true",
      );
    } else {
      sendJson(res, 200, { ok: true, data: { valid: true, message: "该渠道暂不支持在线验证" } });
      return;
    }

    sendJson(res, 200, { ok: true, data: result });
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      error: `验证失败: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

/**
 * POST /api/setup/configure-channels - 配置聊天渠道
 */
export async function handleConfigureChannels(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const body = await readJsonBody<ConfigureChannelsRequest>(req);

  try {
    const config = loadConfig();
    const configuredChannels: string[] = [];
    const verificationResults: Record<string, { valid: boolean; error?: string }> = {};

    const channelsConfig: Record<string, unknown> = {
      ...((config as any).channels ?? {}),
    };

    // 处理钉钉配置
    if (body?.dingtalk?.appKey && body?.dingtalk?.appSecret) {
      const dingtalkResult = await verifyDingtalkCredentials(
        body.dingtalk.appKey,
        body.dingtalk.appSecret,
      );
      verificationResults.dingtalk = dingtalkResult;

      if (!dingtalkResult.valid) {
        sendJson(res, 200, {
          ok: false,
          error: `钉钉凭证验证失败: ${dingtalkResult.error}`,
          data: { verificationResults },
        });
        return;
      }

      channelsConfig.dingtalk = {
        enabled: true,
        app: {
          appKey: body.dingtalk.appKey,
          appSecret: body.dingtalk.appSecret,
          ...(body.dingtalk.robotToken ? { robotCode: body.dingtalk.robotToken } : {}),
        },
      };
      configuredChannels.push("dingtalk");
    }

    // 处理飞书配置
    if (body?.feishu?.appId && body?.feishu?.appSecret) {
      const feishuResult = await verifyFeishuCredentials(body.feishu.appId, body.feishu.appSecret);
      verificationResults.feishu = feishuResult;

      if (!feishuResult.valid) {
        sendJson(res, 200, {
          ok: false,
          error: `飞书凭证验证失败: ${feishuResult.error}`,
          data: { verificationResults },
        });
        return;
      }

      channelsConfig.feishu = {
        enabled: true,
        appId: body.feishu.appId,
        appSecret: body.feishu.appSecret,
        connectionMode: "websocket",
        ...(body.feishu.encryptKey ? { encryptKey: body.feishu.encryptKey } : {}),
        ...(body.feishu.verificationToken
          ? { verificationToken: body.feishu.verificationToken }
          : {}),
      };
      configuredChannels.push("feishu");
    }

    // 处理企业微信配置
    if (body?.wecom?.corpId && body?.wecom?.agentId && body?.wecom?.agentSecret) {
      const wecomResult = await verifyWecomCredentials(body.wecom.corpId, body.wecom.agentSecret);
      verificationResults.wecom = wecomResult;

      if (!wecomResult.valid) {
        sendJson(res, 200, {
          ok: false,
          error: `企业微信凭证验证失败: ${wecomResult.error}`,
          data: { verificationResults },
        });
        return;
      }

      channelsConfig.wecom = {
        enabled: true,
        app: {
          corpId: body.wecom.corpId,
          agentId: body.wecom.agentId,
          agentSecret: body.wecom.agentSecret,
          ...(body.wecom.token ? { token: body.wecom.token } : {}),
          ...(body.wecom.encodingAESKey ? { encodingAESKey: body.wecom.encodingAESKey } : {}),
        },
      };
      configuredChannels.push("wecom");
    }

    // 处理 QQ 机器人配置
    if (body?.qqbot?.appId && body?.qqbot?.appSecret) {
      const qqbotResult = await verifyQqbotCredentials(
        body.qqbot.appId,
        body.qqbot.appSecret,
        body.qqbot.sandbox,
      );
      verificationResults.qqbot = qqbotResult;

      if (!qqbotResult.valid) {
        sendJson(res, 200, {
          ok: false,
          error: `QQ 机器人凭证验证失败: ${qqbotResult.error}`,
          data: { verificationResults },
        });
        return;
      }

      channelsConfig.qqbot = {
        enabled: true,
        sandbox: body.qqbot.sandbox ?? false,
        app: {
          appId: body.qqbot.appId,
          appSecret: body.qqbot.appSecret,
          ...(body.qqbot.token ? { token: body.qqbot.token } : {}),
        },
      };
      configuredChannels.push("qqbot");
    }

    // 处理简单的渠道列表（兼容旧接口）
    if (body?.channels) {
      for (const channelId of body.channels) {
        if (!channelsConfig[channelId]) {
          channelsConfig[channelId] = { enabled: true };
        }
        if (!configuredChannels.includes(channelId)) {
          configuredChannels.push(channelId);
        }
      }
    }

    // 写入配置
    const freshConfig = loadConfig();
    const nextConfig = {
      ...freshConfig,
      channels: channelsConfig,
    };
    await writeConfigFile(nextConfig as any);

    // 热更新：立即启动配置的渠道
    const startedChannels: string[] = [];
    const channelStartCallback = getChannelStartCallback();
    if (channelStartCallback) {
      for (const channelId of configuredChannels) {
        try {
          await channelStartCallback(channelId);
          startedChannels.push(channelId);
        } catch (err) {
          log.error(
            `Failed to start channel ${channelId}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    } else if (configuredChannels.length > 0) {
      log.warn(
        `channelStartCallback not registered; channels [${configuredChannels.join(", ")}] saved but not started (will start on next gateway restart)`,
      );
    }

    updateSetupState({
      step: 5,
      channelsConfigured: configuredChannels,
    });

    sendJson(res, 200, {
      ok: true,
      data: { channels: configuredChannels, verificationResults, startedChannels },
    });
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      error: `配置失败: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

/**
 * POST /api/setup/complete - 完成配置
 *
 * 将 completedAt 写入 setup 状态文件（不经过上游 schema 校验）
 * 上游 writeConfigFile 做严格 schema 验证，不允许写入未知字段 "setup"
 */
export async function handleComplete(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    updateSetupState({ completed: true });

    try {
      await ensureOpenClawCNModelsJson(null);
      log.info("models.json refreshed on setup completion");
    } catch (mjErr) {
      log.warn(`models.json refresh on setup completion failed (non-critical): ${mjErr}`);
    }

    sendJson(res, 200, { ok: true, data: { completed: true, openSource: true } });
  } catch (error) {
    sendJson(res, 500, { ok: false, error: `Setup completion failed: ${error instanceof Error ? error.message : String(error)}` });
  }
}

/**
 * POST /api/setup/restart - 重启 Gateway 以应用配置
 *
 * - Unix: 发送 SIGUSR1 信号触发热重启
 * - Windows: SIGUSR1 不支持，延迟 process.exit(0) 由外部进程管理器重启
 */
export async function handleRestart(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const result = scheduleGatewaySigusr1Restart({
      delayMs: 1000,
      reason: "setup-wizard-complete",
    });

    const restarted = (result as any)?.ok === true && !(result as any)?.coalesced;

    // Windows 下 SIGUSR1 静默失败，回退到 process.exit 让进程管理器重启
    if (process.platform === "win32" && restarted) {
      sendJson(res, 200, {
        ok: true,
        data: { restarting: true, delayMs: 2000, message: "Gateway 将在 2 秒后重启（Windows 模式）" },
      });
      setTimeout(() => process.exit(0), 2000);
      return;
    }

    sendJson(res, 200, {
      ok: true,
      data: {
        restarting: true,
        delayMs: (result as any)?.delayMs ?? 1000,
        message: "Gateway 将在 1 秒后重启",
      },
    });
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      error: `重启失败: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

/**
 * POST /api/setup/fetch-models - 获取提供商的模型列表
 *
 * 对于 siliconflow：调用 discoverSiliconFlowModels（当前为 stub，返回空数组，回退到静态列表）
 * 对于其他 provider：返回 ProviderMeta 中定义的 capabilities 信息
 */
export async function handleFetchModels(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJsonBody<FetchModelsRequest>(req);
  if (!body || !body.provider) {
    sendJson(res, 400, { ok: false, error: "缺少提供商参数" });
    return;
  }

  const { provider, apiKey } = body;

  try {
    let models: Array<{ id: string; name: string; description?: string }> = [];

    if (provider === "siliconflow") {
      // TODO: discoverSiliconFlowModels 当前为 stub，返回空数组
      // 当接入真实 SiliconFlow API 后，将在此获取动态模型列表
      const siliconflowModels = await discoverSiliconFlowModels(apiKey);
      if (siliconflowModels.length > 0) {
        models = siliconflowModels.map((m) => ({
          id: m.id,
          name: m.name,
          description: m.reasoning ? "推理模型" : undefined,
        }));
      } else {
        // 回退：从 provider 已保存配置中读取模型列表
        try {
          const savedConfig = await getProviderConfig("siliconflow");
          if (savedConfig.configured && savedConfig.models.length > 0) {
            models = savedConfig.models.map((m) => ({
              id: m.id,
              name: m.name,
            }));
          }
        } catch {
          // ignore
        }
      }
    } else {
      // 从已保存的配置中读取模型列表
      try {
        const savedConfig = await getProviderConfig(provider);
        if (savedConfig.configured && savedConfig.models.length > 0) {
          models = savedConfig.models.map((m) => ({ id: m.id, name: m.name }));
        }
      } catch {
        // ignore
      }
    }

    sendJson(res, 200, { ok: true, data: { models } });
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      error: `获取模型列表失败: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

/**
 * GET /api/setup/dev-reset - 开发调试用：重置 Setup 向导状态
 *
 * 清空 setup 状态，使 setup 向导可以重新走一遍。
 * 仅在 NODE_ENV=development 或 loopback 访问时可用。
 */
export async function handleDevReset(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const isDev = process.env.NODE_ENV === "development" || process.env.OPENCLAW_DEV === "1";
  const remoteIp = req.socket?.remoteAddress ?? "";
  const isLoopback = remoteIp === "127.0.0.1" || remoteIp === "::1" || remoteIp === "::ffff:127.0.0.1";

  if (!isDev && !isLoopback) {
    sendJson(res, 403, { ok: false, error: "Only development mode or loopback access is allowed" });
    return;
  }

  updateSetupState({ step: 1, completed: false });
  log.warn("[DEV] Setup wizard state reset via /api/setup/dev-reset");
  sendJson(res, 200, { ok: true, message: "Setup state reset" });
}

/**
 * GET /api/setup/qrcode - 获取体验群二维码（stub）
 *
 * 开源版不再接入云端二维码模块。
 */
export async function handleGetQrcode(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  // TODO: 接入 getSetupQrcode()
  sendJson(res, 200, { ok: true, data: { qrcode: null } });
}

/**
 * GET /api/setup/affiliate-links - 推广链接（stub）
 *
 * TODO: 接入真实推广链接数据
 */
export async function handleGetAffiliateLinks(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  // TODO: 接入推广链接数据
  sendJson(res, 200, { ok: true, data: [] });
}

/**
 * GET /api/setup/free-models/providers - 免费模型提供商（stub）
 *
 * TODO: 接入 free-model-providers 模块
 */
export async function handleGetFreeModelProviders(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  // TODO: 接入 getAllFreeModelProviders()
  const providers = getAllFreeModelProviders();
  sendJson(res, 200, { ok: true, data: { providers } });
}

/**
 * POST /api/setup/free-models/test - 测试免费模型 API Key（stub）
 *
 * TODO: 接入 free-model-providers 模块
 */
export async function handleTestFreeModelApiKey(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const body = await readJsonBody<{ providerId: string; apiKey: string }>(req);
  if (!body || !body.providerId || !body.apiKey) {
    sendJson(res, 400, { ok: false, error: "缺少必要参数" });
    return;
  }

  // TODO: 接入 getFreeModelProvider + 实际测试
  const provider = getFreeModelProvider(body.providerId);
  if (!provider) {
    sendJson(res, 400, { ok: false, error: "未知的模型提供商" });
    return;
  }

  sendJson(res, 200, { ok: true, data: { valid: false, error: "暂不支持免费模型配置" } });
}

/**
 * POST /api/setup/free-models/configure - 配置免费模型（stub）
 *
 * TODO: 接入 free-model-providers 模块
 */
export async function handleConfigureFreeModels(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  // TODO: 接入免费模型配置
  sendJson(res, 200, { ok: false, error: "暂不支持免费模型配置" });
}

/**
 * GET /api/setup/free-models/config - 获取免费模型配置（stub）
 *
 * TODO: 接入 free-model-providers 模块
 */
export async function handleGetFreeModelsConfig(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  // TODO: 接入免费模型配置
  sendJson(res, 200, { ok: true, data: { configured: false, config: null } });
}
