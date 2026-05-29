/**
 * model-config Controller 单元测试
 *
 * 测试所有 Controller 函数的状态管理逻辑
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  createInitialModelConfigState,
  loadCapabilities,
  loadProviders,
  loadProviderGroups,
  toggleProviderGroup,
  openModelSelector,
  closeModelSelector,
  openProviderConfig,
  closeProviderConfig,
  updateProviderApiKey,
  providerConfigNextStep,
  providerConfigPrevStep,
  navigateToProviderConfig,
  detectAndConfigureProvider,
  openProviderManage,
  closeProviderManage,
  deleteProviderConfig,
  type Capability,
  type ProviderInfo,
  type ModelConfigState,
} from "./model-config.js";

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/** 创建 mock client */
function mockClient(responses?: Record<string, unknown>) {
  return {
    request: vi.fn(async (method: string, _params?: unknown) => {
      if (responses && method in responses) {
        const val = responses[method];
        if (val instanceof Error) throw val;
        return val;
      }
      // 默认返回空结构
      return {};
    }),
  };
}

/** 创建连接的 host */
function connectedHost(
  overrides?: Partial<ModelConfigState>,
  clientResponses?: Record<string, unknown>,
) {
  return {
    ...createInitialModelConfigState(),
    client: mockClient(clientResponses),
    connected: true,
    ...overrides,
  };
}

/** 创建断开连接的 host */
function disconnectedHost(overrides?: Partial<ModelConfigState>) {
  return {
    ...createInitialModelConfigState(),
    client: null,
    connected: false,
    ...overrides,
  };
}

/** 创建一个测试 Capability (controller 输出格式) */
function makeCap(id: string, status: "active" | "unconfigured" = "unconfigured"): Capability {
  return {
    capability: id,
    name: `${id} name`,
    description: `${id} description`,
    icon: "📦",
    status,
    currentModel:
      status === "active"
        ? {
            providerId: "openai",
            providerName: "openai",
            modelId: "gpt-4o",
            modelName: "GPT-4o",
            isFree: false,
            quality: 5,
            maxContextTokens: 128000,
            capabilities: { text: 5 },
            strengthTier: "strong",
          }
        : null,
    availableModels: 3,
  };
}

/** 创建 v2 capability_matrix.summary 响应中的 entry */
function makeCapEntry(id: string, status: "active" | "unconfigured" | "missing" = "unconfigured") {
  return {
    key: id,
    name: `${id} name`,
    description: `${id} description`,
    icon: "📦",
    status,
    ...(status === "active"
      ? {
          bestModel: {
            provider: "openai",
            modelId: "gpt-4o",
            displayName: "GPT-4o",
            quality: 5,
            costTier: "standard",
            region: "international",
            maxContextTokens: 128000,
            capabilities: { text: 5 },
            strengthTier: "strong",
          },
          alternatives: 3,
        }
      : {}),
  };
}

/** 创建一个测试 ProviderInfo */
function makeProvider(id: string, opts?: Partial<ProviderInfo>): ProviderInfo {
  return {
    providerId: id,
    name: `${id} Provider`,
    icon: "🔧",
    group: "cn-recommended",
    tagline: "test tagline",
    apiKeyUrl: "https://example.com",
    apiKeyGuide: ["步骤一", "步骤二"],
    capabilities: ["text"],
    configured: false,
    activeModels: 0,
    needsBaseUrl: false,
    defaultBaseUrl: "",
    apiKeyOptional: false,
    ...opts,
  };
}

// ─────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────

describe("model-config Controller", () => {
  // ==============================
  // createInitialModelConfigState
  // ==============================
  describe("createInitialModelConfigState", () => {
    it("应该返回所有字段的初始值", () => {
      const state = createInitialModelConfigState();

      expect(state.modelConfigLoading).toBe(false);
      expect(state.modelConfigError).toBeNull();
      expect(state.capabilities).toEqual([]);
      expect(state.modelSelectorOpen).toBe(false);
      expect(state.modelSelectorCapability).toBeNull();
      expect(state.modelSelectorModels).toEqual([]);
      expect(state.modelSelectorLoading).toBe(false);
      expect(state.modelSelectorSwitching).toBe(false);
      expect(state.providerConfigOpen).toBe(false);
      expect(state.providerConfigProvider).toBeNull();
      expect(state.providerConfigApiKey).toBe("");
      expect(state.providerConfigTesting).toBe(false);
      expect(state.providerConfigTestResult).toBeNull();
      expect(state.providerConfigDetecting).toBe(false);
      expect(state.providerConfigStep).toBe("guide");
      expect(state.providerConfigAutoEnabled).toBeNull();
      expect(state.providers).toEqual([]);
      expect(state.providerGroups).toEqual([]);
      expect(state.providerManageOpen).toBe(false);
      expect(state.providerManageTarget).toBeNull();
      expect(state.providerManageApiKey).toBe("");
      expect(state.providerManageDeleting).toBe(false);
    });

    it("每次调用应该返回新实例", () => {
      const a = createInitialModelConfigState();
      const b = createInitialModelConfigState();
      expect(a).not.toBe(b);
      expect(a).toEqual(b);
    });
  });

  // ==============================
  // loadCapabilities
  // ==============================
  describe("loadCapabilities", () => {
    it("断开连接时应设置错误", async () => {
      const host = disconnectedHost();
      await loadCapabilities(host);

      expect(host.modelConfigError).toBe("未连接到 Gateway");
      expect(host.modelConfigLoading).toBe(false);
    });

    it("client 为 null 时应设置错误", async () => {
      const host = { ...createInitialModelConfigState(), client: null, connected: true };
      await loadCapabilities(host);

      expect(host.modelConfigError).toBe("未连接到 Gateway");
    });

    it("成功加载时应设置 capabilities", async () => {
      const entries = [makeCapEntry("text", "active"), makeCapEntry("video")];
      const host = connectedHost(
        {},
        {
          "capability_matrix.summary": { capabilities: entries },
        },
      );

      await loadCapabilities(host);

      expect(host.capabilities).toHaveLength(2);
      expect(host.capabilities[0].capability).toBe("text");
      expect(host.capabilities[0].status).toBe("active");
      expect(host.capabilities[0].currentModel?.modelId).toBe("gpt-4o");
      expect(host.capabilities[1].capability).toBe("video");
      expect(host.capabilities[1].status).toBe("unconfigured"); // 后端返回 unconfigured，不应压缩为 inactive
      expect(host.modelConfigLoading).toBe(false);
      expect(host.modelConfigError).toBeNull();
    });

    it("加载过程中应设置 loading 状态", async () => {
      let capturedLoading = false;
      const host = connectedHost(
        {},
        {
          "capability_matrix.summary": { capabilities: [] },
        },
      );

      // 拦截 request 检查中间状态
      const origRequest = host.client!.request;
      host.client!.request = vi.fn(async (...args) => {
        capturedLoading = host.modelConfigLoading;
        return origRequest(...args);
      });

      await loadCapabilities(host);
      expect(capturedLoading).toBe(true);
      expect(host.modelConfigLoading).toBe(false); // 完成后恢复
    });

    it("请求失败时应设置错误", async () => {
      const host = connectedHost(
        {},
        {
          "capability_matrix.summary": new Error("network error"),
        },
      );

      await loadCapabilities(host);

      expect(host.modelConfigError).toContain("加载失败");
      expect(host.modelConfigError).toContain("network error");
      expect(host.modelConfigLoading).toBe(false);
    });

    it("返回无效响应时应设置错误", async () => {
      const host = connectedHost(
        {},
        {
          "capability_matrix.summary": { capabilities: null },
        },
      );

      await loadCapabilities(host);
      // v2 controller 校验 Array.isArray → 抛错 → 设置 modelConfigError
      expect(host.modelConfigError).toContain("加载失败");
    });
  });

  // ==============================
  // loadProviders
  // ==============================
  describe("loadProviders", () => {
    it("断开连接时应直接返回", async () => {
      const host = disconnectedHost();
      await loadProviders(host);
      expect(host.providers).toEqual([]);
    });

    it("成功加载时应设置 providers", async () => {
      const providers = [makeProvider("openai"), makeProvider("deepseek")];
      const host = connectedHost(
        {},
        {
          "capability_matrix.providers.list": { providers },
        },
      );

      await loadProviders(host);
      expect(host.providers).toEqual(providers);
    });

    it("请求失败时应设置错误", async () => {
      const host = connectedHost(
        {},
        {
          "capability_matrix.providers.list": new Error("timeout"),
        },
      );

      await loadProviders(host);
      expect(host.modelConfigError).toContain("加载 Provider 列表失败");
    });
  });

  // ==============================
  // loadProviderGroups
  // ==============================
  describe("loadProviderGroups", () => {
    it("断开连接时应直接返回", async () => {
      const host = disconnectedHost();
      await loadProviderGroups(host);
      expect(host.providerGroups).toEqual([]);
    });

    it("成功加载时应设置 providerGroups 并初始化 expanded", async () => {
      const groups = [
        { id: "cn", name: "国内", description: "", icon: "🇨🇳", defaultExpanded: true, order: 1 },
        { id: "intl", name: "国际", description: "", icon: "🌍", defaultExpanded: false, order: 2 },
      ];
      const host = connectedHost(
        {},
        {
          "capability_matrix.providerGroups": { groups },
        },
      );

      await loadProviderGroups(host);

      expect(host.providerGroups).toHaveLength(2);
      expect(host.providerGroups[0].expanded).toBe(true); // defaultExpanded: true
      expect(host.providerGroups[1].expanded).toBe(false); // defaultExpanded: false
    });

    it("请求失败时应设置错误", async () => {
      const host = connectedHost(
        {},
        {
          "capability_matrix.providerGroups": new Error("fail"),
        },
      );

      await loadProviderGroups(host);
      expect(host.modelConfigError).toContain("加载分组失败");
    });
  });

  // ==============================
  // toggleProviderGroup
  // ==============================
  describe("toggleProviderGroup", () => {
    it("应该切换指定分组的展开状态", () => {
      const host = connectedHost({
        providerGroups: [
          {
            id: "cn",
            name: "国内",
            description: "",
            icon: "🇨🇳",
            defaultExpanded: true,
            order: 1,
            expanded: true,
          },
          {
            id: "intl",
            name: "国际",
            description: "",
            icon: "🌍",
            defaultExpanded: false,
            order: 2,
            expanded: false,
          },
        ],
      });

      toggleProviderGroup(host, "cn");

      expect(host.providerGroups[0].expanded).toBe(false);
      expect(host.providerGroups[1].expanded).toBe(false); // 不受影响
    });

    it("不匹配的 groupId 不应改变任何状态", () => {
      const host = connectedHost({
        providerGroups: [
          {
            id: "cn",
            name: "国内",
            description: "",
            icon: "🇨🇳",
            defaultExpanded: true,
            order: 1,
            expanded: true,
          },
        ],
      });

      toggleProviderGroup(host, "nonexistent");
      expect(host.providerGroups[0].expanded).toBe(true);
    });
  });

  // ==============================
  // openModelSelector / closeModelSelector
  // ==============================
  describe("openModelSelector", () => {
    it("断开连接时应直接返回", async () => {
      const host = disconnectedHost();
      await openModelSelector(host, makeCap("text"));
      expect(host.modelSelectorOpen).toBe(false);
    });

    it("成功打开时应设置 loading 并加载模型", async () => {
      const models = [
        {
          providerId: "openai",
          providerName: "OpenAI",
          providerIcon: "",
          modelId: "gpt-4o",
          modelName: "GPT-4o",
          pricing: { type: "paid" as const },
          configured: true,
          active: true,
        },
      ];
      const host = connectedHost(
        {},
        {
          "capability_matrix.models": { models },
        },
      );

      await openModelSelector(host, makeCap("text"));

      expect(host.modelSelectorOpen).toBe(true);
      expect(host.modelSelectorCapability?.capability).toBe("text");
      expect(host.modelSelectorModels).toEqual(models);
      expect(host.modelSelectorLoading).toBe(false);
    });

    it("请求失败时应关闭选择器并设置错误", async () => {
      const host = connectedHost(
        {},
        {
          "capability_matrix.models": new Error("load failed"),
        },
      );

      await openModelSelector(host, makeCap("text"));

      expect(host.modelSelectorOpen).toBe(false);
      expect(host.modelConfigError).toContain("加载模型列表失败");
    });
  });

  describe("closeModelSelector", () => {
    it("应该重置所有模型选择器状态", () => {
      const host = connectedHost({
        modelSelectorOpen: true,
        modelSelectorCapability: makeCap("text"),
        modelSelectorModels: [
          {
            providerId: "openai",
            providerName: "OpenAI",
            providerIcon: "",
            modelId: "gpt-4o",
            modelName: "GPT-4o",
            pricing: { type: "paid" as const },
            configured: true,
            active: true,
          },
        ],
        modelSelectorLoading: true,
        modelSelectorSwitching: true,
      });

      closeModelSelector(host);

      expect(host.modelSelectorOpen).toBe(false);
      expect(host.modelSelectorCapability).toBeNull();
      expect(host.modelSelectorModels).toEqual([]);
      expect(host.modelSelectorLoading).toBe(false);
      expect(host.modelSelectorSwitching).toBe(false);
    });
  });

  // ==============================
  // switchModel — 已移至 View 层 (_doSwitchModel)，controller 不再导出
  // ==============================

  // ==============================
  // openProviderConfig / closeProviderConfig
  // ==============================
  describe("openProviderConfig", () => {
    it("有引导步骤时应从 guide 开始", () => {
      const host = connectedHost();
      const provider = makeProvider("openai", { apiKeyGuide: ["步骤一", "步骤二"] });

      openProviderConfig(host, provider);

      expect(host.providerConfigOpen).toBe(true);
      expect(host.providerConfigProvider).toBe(provider);
      expect(host.providerConfigStep).toBe("guide");
      expect(host.providerConfigApiKey).toBe("");
      expect(host.providerConfigTesting).toBe(false);
      expect(host.providerConfigTestResult).toBeNull();
      expect(host.providerConfigDetecting).toBe(false);
      expect(host.providerConfigAutoEnabled).toBeNull();
    });

    it("无引导步骤时应直接跳到 apikey", () => {
      const host = connectedHost();
      const provider = makeProvider("openai", { apiKeyGuide: [] });

      openProviderConfig(host, provider);
      expect(host.providerConfigStep).toBe("apikey");
    });
  });

  describe("closeProviderConfig", () => {
    it("应该重置所有配置弹窗状态", () => {
      const host = connectedHost({
        providerConfigOpen: true,
        providerConfigProvider: makeProvider("openai"),
        providerConfigApiKey: "sk-test",
        providerConfigTesting: true,
        providerConfigTestResult: { success: true, message: "ok" },
        providerConfigDetecting: true,
        providerConfigStep: "result",
        providerConfigAutoEnabled: { text: "gpt-4o" },
      });

      closeProviderConfig(host);

      expect(host.providerConfigOpen).toBe(false);
      expect(host.providerConfigProvider).toBeNull();
      expect(host.providerConfigApiKey).toBe("");
      expect(host.providerConfigTesting).toBe(false);
      expect(host.providerConfigTestResult).toBeNull();
      expect(host.providerConfigDetecting).toBe(false);
      expect(host.providerConfigStep).toBe("guide");
      expect(host.providerConfigAutoEnabled).toBeNull();
    });
  });

  // ==============================
  // updateProviderApiKey
  // ==============================
  describe("updateProviderApiKey", () => {
    it("应该更新 apiKey 并清除测试结果", () => {
      const host = connectedHost({
        providerConfigApiKey: "old",
        providerConfigTestResult: { success: false, message: "旧错误" },
      });

      updateProviderApiKey(host, "new-key");

      expect(host.providerConfigApiKey).toBe("new-key");
      expect(host.providerConfigTestResult).toBeNull();
    });
  });

  // ==============================
  // providerConfigNextStep / providerConfigPrevStep
  // ==============================
  describe("providerConfigNextStep", () => {
    it("从 guide 应前进到 apikey", () => {
      const host = connectedHost({ providerConfigStep: "guide" });
      providerConfigNextStep(host);
      expect(host.providerConfigStep).toBe("apikey");
    });

    it("在 apikey 步骤应保持不变", () => {
      const host = connectedHost({ providerConfigStep: "apikey" });
      providerConfigNextStep(host);
      expect(host.providerConfigStep).toBe("apikey");
    });

    it("在 detecting 步骤应保持不变", () => {
      const host = connectedHost({ providerConfigStep: "detecting" });
      providerConfigNextStep(host);
      expect(host.providerConfigStep).toBe("detecting");
    });
  });

  describe("providerConfigPrevStep", () => {
    it("从 apikey 应后退到 guide", () => {
      const host = connectedHost({ providerConfigStep: "apikey" });
      providerConfigPrevStep(host);
      expect(host.providerConfigStep).toBe("guide");
    });

    it("在 guide 步骤应保持不变", () => {
      const host = connectedHost({ providerConfigStep: "guide" });
      providerConfigPrevStep(host);
      expect(host.providerConfigStep).toBe("guide");
    });
  });

  // ==============================
  // navigateToProviderConfig
  // ==============================
  describe("navigateToProviderConfig", () => {
    it("应关闭模型选择器并打开 Provider 配置", () => {
      const provider = makeProvider("openai");
      const host = connectedHost({
        modelSelectorOpen: true,
        modelSelectorCapability: makeCap("text"),
        providers: [provider],
      });

      navigateToProviderConfig(host, "openai");

      // 模型选择器应关闭
      expect(host.modelSelectorOpen).toBe(false);
      // Provider 配置应打开
      expect(host.providerConfigOpen).toBe(true);
      expect(host.providerConfigProvider?.providerId).toBe("openai");
    });

    it("找不到 Provider 时应不做任何操作", () => {
      const host = connectedHost({
        modelSelectorOpen: true,
        providers: [],
      });

      navigateToProviderConfig(host, "nonexistent");
      expect(host.modelSelectorOpen).toBe(true); // 不变
      expect(host.providerConfigOpen).toBe(false); // 不变
    });
  });

  // ==============================
  // detectAndConfigureProvider
  // ==============================
  describe("detectAndConfigureProvider", () => {
    it("断开连接时应直接返回", async () => {
      const host = disconnectedHost();
      await detectAndConfigureProvider(host);
      expect(host.providerConfigDetecting).toBe(false);
    });

    it("无 providerConfigProvider 时应直接返回", async () => {
      const host = connectedHost({ providerConfigProvider: null });
      await detectAndConfigureProvider(host);
      expect(host.providerConfigDetecting).toBe(false);
    });

    it("检测成功时应设置结果并跳到 result 步骤", async () => {
      const host = connectedHost(
        {
          providerConfigProvider: makeProvider("openai"),
          providerConfigApiKey: "sk-test-1234567890",
        },
        {
          "capability_matrix.provider.detect": {
            success: true,
            models: [
              { modelId: "gpt-4o", modelName: "GPT-4o", capabilities: ["text"], available: true },
            ],
            autoEnabled: { text: "gpt-4o" },
          },
        },
      );

      await detectAndConfigureProvider(host);

      expect(host.providerConfigStep).toBe("result");
      expect(host.providerConfigTestResult?.success).toBe(true);
      expect(host.providerConfigTestResult?.message).toContain("配置完成");
      expect(host.providerConfigAutoEnabled).toEqual({ text: "gpt-4o" });
      expect(host.providerConfigDetecting).toBe(false);
    });

    it("检测失败时应回到 apikey 步骤", async () => {
      const host = connectedHost(
        {
          providerConfigProvider: makeProvider("openai"),
          providerConfigApiKey: "bad-key",
        },
        {
          "capability_matrix.provider.detect": {
            success: false,
            error: "Invalid API key",
          },
        },
      );

      await detectAndConfigureProvider(host);

      expect(host.providerConfigStep).toBe("apikey");
      expect(host.providerConfigTestResult?.success).toBe(false);
      // 应翻译错误信息
      expect(host.providerConfigTestResult?.message).toContain("API 密钥无效");
      expect(host.providerConfigDetecting).toBe(false);
    });

    it("请求异常时应回到 apikey 步骤", async () => {
      const host = connectedHost(
        {
          providerConfigProvider: makeProvider("openai"),
          providerConfigApiKey: "sk-test",
        },
        {
          "capability_matrix.provider.detect": new Error("connection refused"),
        },
      );

      await detectAndConfigureProvider(host);

      expect(host.providerConfigStep).toBe("apikey");
      expect(host.providerConfigTestResult?.success).toBe(false);
      expect(host.providerConfigTestResult?.message).toContain("配置失败");
      expect(host.providerConfigDetecting).toBe(false);
    });

    it("超时时应显示超时错误", async () => {
      const host = connectedHost({
        providerConfigProvider: makeProvider("openai"),
        providerConfigApiKey: "sk-test",
      });

      // 让 request 返回一个永远不 resolve 的 Promise
      host.client!.request = vi.fn(() => new Promise(() => {}));

      // 替换 DETECT_TIMEOUT_MS 会很麻烦，直接模拟超时
      // 但这里实际上 Promise.race 会等 30 秒，改为 mock
      // 更简单的方式：直接抛出包含 DETECT_TIMEOUT 的错误
      host.client!.request = vi.fn(async () => {
        throw new Error("DETECT_TIMEOUT");
      });

      await detectAndConfigureProvider(host);

      expect(host.providerConfigStep).toBe("apikey");
      expect(host.providerConfigTestResult?.success).toBe(false);
      expect(host.providerConfigTestResult?.message).toContain("检测超时");
    });

    it("检测过程中应设置 detecting 和 step 状态", async () => {
      let capturedDetecting = false;
      let capturedStep = "";

      const host = connectedHost({
        providerConfigProvider: makeProvider("openai"),
        providerConfigApiKey: "sk-test",
      });

      host.client!.request = vi.fn(async () => {
        capturedDetecting = host.providerConfigDetecting;
        capturedStep = host.providerConfigStep;
        return { success: true, autoEnabled: {} };
      });

      await detectAndConfigureProvider(host);

      expect(capturedDetecting).toBe(true);
      expect(capturedStep).toBe("detecting");
    });
  });

  // ==============================
  // openProviderManage / closeProviderManage
  // ==============================
  describe("openProviderManage", () => {
    it("应该打开管理弹窗并加载脱敏 Key", async () => {
      const provider = makeProvider("openai", { configured: true });
      const host = connectedHost(
        {},
        {
          "capability_matrix.provider.getConfig": {
            configured: true,
            maskedApiKey: "sk-t****cdef",
          },
        },
      );

      await openProviderManage(host, provider);

      expect(host.providerManageOpen).toBe(true);
      expect(host.providerManageTarget).toBe(provider);
      expect(host.providerManageApiKey).toBe("sk-t****cdef");
      expect(host.providerManageDeleting).toBe(false);
    });

    it("加载 Key 失败时应显示错误文本", async () => {
      const provider = makeProvider("openai");
      const host = connectedHost(
        {},
        {
          "capability_matrix.provider.getConfig": new Error("load failed"),
        },
      );

      await openProviderManage(host, provider);

      expect(host.providerManageOpen).toBe(true);
      expect(host.providerManageApiKey).toBe("(加载失败)");
    });

    it("断开连接时应打开弹窗但不加载 Key", async () => {
      const provider = makeProvider("openai");
      const host = disconnectedHost();

      await openProviderManage(host, provider);

      expect(host.providerManageOpen).toBe(true);
      expect(host.providerManageTarget).toBe(provider);
      expect(host.providerManageApiKey).toBe(""); // 未加载
    });
  });

  describe("closeProviderManage", () => {
    it("应该重置所有管理弹窗状态", () => {
      const host = connectedHost({
        providerManageOpen: true,
        providerManageTarget: makeProvider("openai"),
        providerManageApiKey: "sk-****",
        providerManageDeleting: true,
      });

      closeProviderManage(host);

      expect(host.providerManageOpen).toBe(false);
      expect(host.providerManageTarget).toBeNull();
      expect(host.providerManageApiKey).toBe("");
      expect(host.providerManageDeleting).toBe(false);
    });
  });

  // ==============================
  // deleteProviderConfig
  // ==============================
  describe("deleteProviderConfig", () => {
    it("断开连接时应直接返回", async () => {
      const host = disconnectedHost();
      await deleteProviderConfig(host, "openai");
      expect(host.providerManageDeleting).toBe(false);
    });

    it("删除成功时应关闭弹窗并刷新数据", async () => {
      const entries = [makeCapEntry("text")];
      const providers = [makeProvider("openai")];
      const host = connectedHost(
        {
          providerManageOpen: true,
          providerManageTarget: makeProvider("openai"),
        },
        {
          "capability_matrix.provider.delete": { success: true },
          "capability_matrix.summary": { capabilities: entries },
          "capability_matrix.providers.list": { providers },
        },
      );

      await deleteProviderConfig(host, "openai");

      expect(host.providerManageOpen).toBe(false);
      expect(host.providerManageTarget).toBeNull();
      expect(host.capabilities).toHaveLength(1);
      expect(host.capabilities[0].capability).toBe("text");
      expect(host.providers).toEqual(providers);
      expect(host.providerManageDeleting).toBe(false);
    });

    it("删除失败时应设置错误", async () => {
      const host = connectedHost(
        {
          providerManageOpen: true,
          providerManageTarget: makeProvider("openai"),
        },
        {
          "capability_matrix.provider.delete": new Error("permission denied"),
        },
      );

      await deleteProviderConfig(host, "openai");

      expect(host.providerManageError).toContain("删除失败");
      expect(host.providerManageDeleting).toBe(false);
    });

    it("删除过程中应设置 deleting 状态", async () => {
      let capturedDeleting = false;

      const host = connectedHost({ providerManageOpen: true });

      host.client!.request = vi.fn(async (method) => {
        if (method === "capability_matrix.provider.delete") {
          capturedDeleting = host.providerManageDeleting;
          return { success: true };
        }
        if (method === "capability_matrix.summary") {
          return { capabilities: [] };
        }
        return {};
      });

      await deleteProviderConfig(host, "openai");
      expect(capturedDeleting).toBe(true);
    });
  });
});
