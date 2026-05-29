/**
 * cn-adapter integration smoke test
 *
 * Validates that plugin.register() correctly orchestrates all 19+ modules
 * without throwing. Uses vi.mock() for I/O-heavy deep dependencies while
 * letting the real registration logic run.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock I/O-heavy deep dependencies BEFORE importing the plugin
// ---------------------------------------------------------------------------

// media — SQLite + fs
vi.mock("../media/media-db.js", () => ({
  runMediaDbMaintenance: vi.fn(() => ({ expired: 0, capped: 0 })),
  closeMediaDb: vi.fn(),
}));
vi.mock("../media/chat-image-store.js", () => ({
  cleanExpiredChatImages: vi.fn(async () => 0),
}));
vi.mock("../media/chat-video-store.js", () => ({
  cleanExpiredChatVideos: vi.fn(async () => 0),
}));

// voice — hardware detect + fs
vi.mock("../voice/hardware-detect.js", () => ({
  getHardwareSnapshot: vi.fn(() => null),
  refreshHardwareSnapshot: vi.fn(async () => ({})),
}));
vi.mock("../voice/voice-router.js", () => ({
  unifiedTranscribe: vi.fn(async () => ({ text: "" })),
  unifiedSynthesize: vi.fn(async () => ({ audioBase64: "" })),
  getVoiceSystemStatus: vi.fn(async () => ({ available: false })),
}));
vi.mock("../voice/voice-prefs.js", () => ({
  loadVoicePrefs: vi.fn(async () => ({})),
  setVoicePrefs: vi.fn(async () => ({})),
  getVoicePrefsSync: vi.fn(() => ({})),
  isApiAsrProvider: vi.fn(() => false),
  isApiTtsProvider: vi.fn(() => false),
}));

// oem — fs
vi.mock("../oem/loader.js", () => ({
  loadBrand: vi.fn(() => ({
    brand: {
      id: "default",
      name: "OpenClawCN",
      displayName: "OpenClawCN",
      version: "1.0.0",
      description: "Default brand",
      identity: { logo: "", copyright: "" },
      defaults: {},
      ui: {},
    },
  })),
  resolveCustomBrandsDir: vi.fn(() => "/tmp/oem"),
}));

// cn-defaults/data-migration — fs
vi.mock("../cn-defaults/data-migration.js", () => ({
  runDataMigrations: vi.fn(async () => {}),
  getCurrentConfigVersion: vi.fn(() => 9),
  getConfigVersionFromState: vi.fn(() => 9),
  setConfigVersionInState: vi.fn(),
  migrateCnPluginToState: vi.fn((config: Record<string, unknown>) => config),
}));

// copilot-compat/proxy — conditional, should not be called with default config
vi.mock("../copilot-compat/proxy.js", () => ({
  registerCopilotProxy: vi.fn(),
  createCopilotRouteHandler: vi.fn(),
  extractProxyConfig: vi.fn(() => ({})),
}));

// dispatch modules — tool-filter may import these
vi.mock("../dispatch/tool-discovery.js", () => ({
  discoverTools: vi.fn(() => []),
}));
vi.mock("../dispatch/tool-filter-rules.js", () => ({
  applyFilterRules: vi.fn((_tools: unknown[], _intent: unknown) => []),
}));

// ---------------------------------------------------------------------------
// Import the plugin (after mocks are set up)
// ---------------------------------------------------------------------------

import plugin from "../index.js";

// ---------------------------------------------------------------------------
// Mock API factory
// ---------------------------------------------------------------------------

function createMockApi(configOverrides?: Record<string, unknown>) {
  return {
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    pluginConfig: {
      cnPlugin: {
        configVersion: 3,
        locale: "zh-CN",
        securityTier: "full",
        telemetry: false,
        ...configOverrides,
      },
    },
    on: vi.fn(),
    registerGatewayMethod: vi.fn(),
    registerTool: vi.fn(),
    registerHook: vi.fn(),
    registerService: vi.fn(),
    registerCli: vi.fn(),
    registerProvider: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("cn-adapter integration smoke test", () => {
  let mockApi: ReturnType<typeof createMockApi>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockApi = createMockApi();
  });

  // ── 1. register() 不抛异常 ──────────────────────────────────────────

  it("should register without throwing", () => {
    expect(() => plugin.register(mockApi as any)).not.toThrow();
  });

  // ── 2. Gateway methods 注册数量 ─────────────────────────────────────

  it("should register expected gateway methods", () => {
    plugin.register(mockApi as any);

    const names = mockApi.registerGatewayMethod.mock.calls.map((c: any[]) => c[0]);

    // index.ts inline: 2
    expect(names).toContain("cn.status");
    expect(names).toContain("cn.config.get");

    expect(names).toContain("cn.support.qrcode");

    // internal.ts: 3
    expect(names).toContain("cn.internal.adapter.version");
    expect(names).toContain("cn.internal.adapter.health");
    expect(names).toContain("cn.internal.config.snapshot");

    // voice/handlers.ts: 5
    expect(names).toContain("cn.voice.transcribe");
    expect(names).toContain("cn.voice.synthesize");
    expect(names).toContain("cn.voice.status");
    expect(names).toContain("cn.voice.prefs.get");
    expect(names).toContain("cn.voice.prefs.set");

    // oem/branding.ts: 2
    expect(names).toContain("cn.branding.get");
    expect(names).toContain("cn.branding.identity");

    // 总数动态增长（ui-bridge 80+, mcp-marketplace 14 等），只验证关键方法已注册
    expect(mockApi.registerGatewayMethod.mock.calls.length).toBeGreaterThanOrEqual(20);
  });

  // ── 3. Hook 注册数量 ──────────────────────────────────────────────

  it("should register expected hooks (11 api.on calls)", () => {
    plugin.register(mockApi as any);

    const events = mockApi.on.mock.calls.map((c: any[]) => c[0]);

    // before_prompt_build x2
    expect(events.filter((e: string) => e === "before_prompt_build").length).toBe(2);
    // before_model_resolve x1
    expect(events.filter((e: string) => e === "before_model_resolve").length).toBe(1);
    // before_tool_call x3 (security-tier, tool-filter, search-fallback)
    expect(events.filter((e: string) => e === "before_tool_call").length).toBe(3);
    // before_compaction x1
    expect(events.filter((e: string) => e === "before_compaction").length).toBe(1);
    // agent_end x2
    expect(events.filter((e: string) => e === "agent_end").length).toBe(2);
    // before_agent_start x1 (E3: MCP tool whitelist guard)
    expect(events.filter((e: string) => e === "before_agent_start").length).toBe(1);

    expect(mockApi.on.mock.calls.length).toBe(10);
  });

  // ── 4. CLI 命令注册 ─────────────────────────────────────────────

  it("should register 6 CLI command groups", () => {
    plugin.register(mockApi as any);

    expect(mockApi.registerCli.mock.calls.length).toBe(6);

    // Verify command names
    const allCommands = mockApi.registerCli.mock.calls.flatMap((c: any[]) => c[1]?.commands ?? []);
    expect(allCommands).toContain("cn-setup");
    expect(allCommands).toContain("cn-migrate");
    expect(allCommands).toContain("cn-uninstall");
    expect(allCommands).toContain("cn-rule");
    expect(allCommands).toContain("cn-help");
    expect(allCommands).toContain("cn-status");
    expect(allCommands).toContain("cn-config");
    expect(allCommands).toContain("cn-upgrade");
  });

  // ── 5. Provider 注册 ────────────────────────────────────────────

  it("should register 2 CN providers", () => {
    plugin.register(mockApi as any);

    expect(mockApi.registerProvider).toHaveBeenCalledTimes(2);

    const ids = mockApi.registerProvider.mock.calls.map((c: any[]) => c[0]?.id);
    expect(ids).toContain("siliconflow");
    expect(ids).toContain("volcengine-embedding");
  });

  // ── 6. Service 注册 ─────────────────────────────────────────────

  it("should register media cleanup service", () => {
    plugin.register(mockApi as any);

    expect(mockApi.registerService).toHaveBeenCalledTimes(1);

    const serviceIds = mockApi.registerService.mock.calls.map((c: any[]) => c[0]?.id);
    expect(serviceIds).toContain("cn-media-cleanup");
  });

  // ── 7. API 兼容性检测 — 缺方法时静默降级 ────────────────────────

  it("should not register when required API method is missing", () => {
    const incompleteApi = createMockApi();
    (incompleteApi as any).registerProvider = undefined;

    expect(() => plugin.register(incompleteApi as any)).not.toThrow();

    // logger.error should be called with incompatibility message
    expect(incompleteApi.logger.error).toHaveBeenCalledWith(
      expect.stringContaining("registerProvider"),
    );

    // No subsequent registrations should have happened
    expect(incompleteApi.registerGatewayMethod).not.toHaveBeenCalled();
    expect(incompleteApi.on).not.toHaveBeenCalled();
    expect(incompleteApi.registerCli).not.toHaveBeenCalled();
  });

  // ── 8. cn.status gateway 正确返回 ───────────────────────────────

  it("should respond with status ok via cn.status gateway", async () => {
    plugin.register(mockApi as any);

    const statusCall = mockApi.registerGatewayMethod.mock.calls.find(
      (c: any[]) => c[0] === "cn.status",
    );
    expect(statusCall).toBeDefined();

    const handler = statusCall![1];
    const respond = vi.fn();
    await handler({ respond });

    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        status: "ok",
        pluginId: "cn-adapter",
      }),
    );
  });

  // ── 9. Hook 优先级正确 ──────────────────────────────────────────

  it("should register security-tier with lowest priority (50)", () => {
    plugin.register(mockApi as any);

    // Find the hook registered with priority 50
    const securityCall = mockApi.on.mock.calls.find((c: any[]) => c[2]?.priority === 50);
    expect(securityCall).toBeDefined();
    expect(securityCall![0]).toBe("before_tool_call");
  });

  it("should register prompt-inject with highest priority (100)", () => {
    plugin.register(mockApi as any);

    const p100Hooks = mockApi.on.mock.calls.filter((c: any[]) => c[2]?.priority === 100);

    // before_prompt_build(100), before_model_resolve(100), before_tool_call(100)
    expect(p100Hooks.length).toBe(3);

    const events = p100Hooks.map((c: any[]) => c[0]);
    expect(events).toContain("before_prompt_build");
    expect(events).toContain("before_model_resolve");
    expect(events).toContain("before_tool_call");
  });

  // ── 10. Copilot proxy 默认不注册 ────────────────────────────────

  it("should not register copilot proxy when not enabled", async () => {
    const { registerCopilotProxy } = await import("../copilot-compat/proxy.js");

    plugin.register(mockApi as any);

    expect(registerCopilotProxy).not.toHaveBeenCalled();
  });

  // ── 11. cn.config.get gateway 返回配置 ──────────────────────────

  it("should respond with config via cn.config.get gateway", async () => {
    plugin.register(mockApi as any);

    const configCall = mockApi.registerGatewayMethod.mock.calls.find(
      (c: any[]) => c[0] === "cn.config.get",
    );
    expect(configCall).toBeDefined();

    const handler = configCall![1];
    const respond = vi.fn();
    await handler({ respond });

    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        locale: "zh-CN",
      }),
    );
  });

  // ── 12. Plugin metadata 正确 ────────────────────────────────────

  it("should expose correct plugin metadata", () => {
    expect(plugin.id).toBe("cn-adapter");
    expect(plugin.name).toBe("CN Adapter");
    expect(plugin.configSchema).toBeDefined();
  });
});
