import path from "node:path";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk/core";

// Static imports — all loaded synchronously so register() runs sync and
// gateway handlers are registered before the gateway snapshots them.
import { safeHook, safeGateway, createCnLogger } from "./utils/index.js";
import {
  createPromptInjectHandler,
  createModelResolveHandler,
  createToolFilterHandler,
  createSearchFallbackHandler,
  createSecurityTierHandler,
  createProfileInjectHandler,
  createCompactionArchiveHandler,
  createSessionSummaryHandler,
  extractCnConfig,
} from "./hooks/index.js";
import { setUpstreamConfigBridge, ensureModelInputCapabilities } from "./gateway/provider-config-store.js";
import { registerGatewayHandlers } from "./gateway/handlers.js";
import { registerInternalHandlers } from "./gateway/internal.js";
import { registerUiBridgeHandlers } from "./gateway/ui-bridge.js";
import { registerCnProviders } from "./cn-providers/index.js";
import { registerVoiceHandlers } from "./voice/handlers.js";
import { registerMediaService } from "./media/service.js";
import { registerMediaHttpRoutes } from "./media/http-routes.js";
import { registerBrandingGateway } from "./oem/index.js";
import { registerCnTools } from "./tools/index.js";
import { registerMcpMarketplace } from "./mcp-marketplace/index.js";
import { handleSetupHttpRequest, shouldShowSetupWizard, hasHistoryConfig } from "./setup/setup-wizard.js";
import { createTelemetryHandler } from "./telemetry/cn-telemetry.js";
import { registerCnCommands } from "./cli/cn-commands.js";
import { registerCnMigrate, detectLegacyInstall } from "./cli/cn-migrate.js";
import { registerCnRule } from "./cli/cn-rule.js";
import { registerCnCompliance } from "./cli/cn-compliance.js";
import { registerCnSetup } from "./cli/cn-setup.js";
import { registerCnUninstall } from "./cli/cn-uninstall.js";
import { autoInstallCliWrapper } from "./utils/install-cli.js";
import {
  runDataMigrations,
  getCurrentConfigVersion as getConfigVersionUnified,
  setConfigVersionInState,
  migrateCnPluginToState,
} from "./cn-defaults/data-migration.js";
import {
  getCurrentConfigVersion as getLegacyConfigVersion,
  migrateConfig,
  separateCnPluginFromConfig,
  MIGRATIONS,
} from "./cn-defaults/migration.js";
import { registerCopilotProxy } from "./copilot-compat/index.js";

const CN_ADAPTER_VERSION = "0.1.0";

// Phase 0 必须验证的 6 个 API 方法
const REQUIRED_API_METHODS = [
  "on",
  "registerGatewayMethod",
  "registerTool",
  "registerHook",
  "registerService",
  "registerCli",
  "registerProvider",
] as const;

/**
 * 检查上游 OpenClaw 版本是否提供了我们需要的所有 API 方法。
 * 如果缺少任何方法，说明上游版本太旧，插件降级为不注册。
 */
function checkApiCompat(api: OpenClawPluginApi): boolean {
  for (const method of REQUIRED_API_METHODS) {
    if (typeof (api as any)[method] !== "function") {
      api.logger.error(
        `[cn-adapter] Missing required API method: ${method}. ` +
          `插件需要 OpenClaw >= 2026.3.2，当前版本不兼容。`,
      );
      return false;
    }
  }
  return true;
}

const plugin = {
  id: "cn-adapter",
  name: "CN Adapter",
  description: "OpenClawCN 中国区适配插件",
  configSchema: emptyPluginConfigSchema(),

  register(api: OpenClawPluginApi) {
    // Step 1: API 兼容性检测
    if (!checkApiCompat(api)) return;

    const log = createCnLogger("core");
    const getConfig = () => extractCnConfig(api.pluginConfig);

    // 注入上游 loadConfig + writeConfigFile
    if (api.runtime?.config?.loadConfig && api.runtime.config.writeConfigFile) {
      setUpstreamConfigBridge(api.runtime.config.loadConfig, api.runtime.config.writeConfigFile);
    }

    log.info(`v${CN_ADAPTER_VERSION} 正在注册...`);

    // Step 1b: 修补已配置模型的 input 能力标记（vision 等）
    ensureModelInputCapabilities().catch((err) =>
      log.warn(`模型能力修补异常: ${err instanceof Error ? err.message : String(err)}`),
    );

    // Step 2: Gateway methods
    api.registerGatewayMethod(
      "cn.status",
      safeGateway("cn.status", async ({ respond }) => {
        respond(true, {
          version: CN_ADAPTER_VERSION,
          pluginId: "cn-adapter",
          status: "ok",
          configVersion: getConfigVersionUnified(api.config as Record<string, unknown>),
        });
      }),
    );

    api.registerGatewayMethod(
      "cn.config.get",
      safeGateway("cn.config.get", async ({ respond }) => {
        respond(true, getConfig());
      }),
    );

    // Step 2b: 业务 + 内部 gateway methods
    registerGatewayHandlers(api);
    registerInternalHandlers(api, CN_ADAPTER_VERSION);

    // Step 2c: CN 提供商注册（上游缺失的 SiliconFlow + 火山引擎 Embedding）
    registerCnProviders(api);

    // Step 2e: Voice gateway methods
    registerVoiceHandlers(api);

    // Step 2f: Copilot proxy (if enabled)
    const config = getConfig();
    if (config.copilotProxy?.enabled) {
      if (typeof (api as any).registerHttpRoute === "function") {
        registerCopilotProxy(api, getConfig);
      } else {
        log.warn("copilotProxy 已启用但 registerHttpRoute 不可用，跳过");
      }
    }

    // Step 2g: Media cleanup service + HTTP routes
    registerMediaService(api);
    registerMediaHttpRoutes(api);

    // Step 2h: OEM branding gateway methods
    registerBrandingGateway(api);

    // Step 2i: UI bridge — 注册 ui-cn 前端调用的方法名（不带 cn. 前缀）
    registerUiBridgeHandlers(api);

    // Step 2j: CN Tools — 生图/生视频工具（通过 registerTool 注册，不侵入上游）
    registerCnTools(api);

    // Step 2j.5: MCP Marketplace — 7000+ MCP 市场（分页 JSON + 14 个 RPC）
    registerMcpMarketplace(api);

    // Step 2k: Setup Wizard — 首次配置向导（通过 registerHttpRoute 插件化，不修改上游）
    if (typeof (api as any).registerHttpRoute === "function") {
      (api as any).registerHttpRoute({
        path: "/",
        match: "prefix",
        auth: "plugin",
        handler: async (req: any, res: any) => {
          const pathname = new URL(req.url ?? "/", "http://localhost").pathname;

          // setup 相关路径，直接处理
          if (
            pathname === "/setup" ||
            pathname.startsWith("/setup/") ||
            pathname.startsWith("/api/setup/")
          ) {
            return handleSetupHttpRequest(req, res);
          }

          // 健康探针
          const HEALTH_PATHS = new Set(["/health", "/healthz"]);
          if (HEALTH_PATHS.has(pathname)) {
            const needsSetup = shouldShowSetupWizard();
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.setHeader("Cache-Control", "no-store");
            res.end(JSON.stringify({ ok: true, status: "live", needsSetup }));
            return true;
          }

          // /ready、/readyz 不拦截
          if (pathname === "/ready" || pathname === "/readyz") {
            return false;
          }

          // 首次配置检测
          const isExempt =
            pathname.startsWith("/api/") ||
            pathname.startsWith("/assets/") ||
            pathname.startsWith("/hooks/") ||
            /\.\w{1,5}$/.test(pathname);

          if (!isExempt && shouldShowSetupWizard()) {
            const location = hasHistoryConfig() ? "/setup?hasHistory=1" : "/setup";
            res.statusCode = 302;
            res.setHeader("Location", location);
            res.end();
            return true;
          }

          return false; // 交给上游处理
        },
      });
    }

    // Step 3: Hook 注册
    api.on(
      "before_prompt_build",
      safeHook("before_prompt_build", createPromptInjectHandler(getConfig)),
      { priority: 100 },
    );

    api.on(
      "before_model_resolve",
      safeHook("before_model_resolve", createModelResolveHandler(getConfig)),
      { priority: 100 },
    );

    api.on(
      "before_tool_call",
      safeHook("before_tool_call:security-tier", createSecurityTierHandler(getConfig)),
      { priority: 50 },
    );

    api.on("before_tool_call", safeHook("before_tool_call", createToolFilterHandler(getConfig)), {
      priority: 100,
    });

    api.on(
      "before_tool_call",
      safeHook("before_tool_call:search-fallback", createSearchFallbackHandler(getConfig)),
      { priority: 90 },
    );

    // Step 3b: Memory hooks
    api.on(
      "before_prompt_build",
      safeHook("before_prompt_build:memory", createProfileInjectHandler(getConfig)),
      { priority: 80 },
    );

    api.on(
      "before_compaction",
      safeHook("before_compaction:memory", createCompactionArchiveHandler()),
    );

    api.on("agent_end", safeHook("agent_end:memory", createSessionSummaryHandler()));

    // Step 3c: agent_end — 匿名遥测收集（fire-and-forget）
    api.on("agent_end", safeHook("agent_end:telemetry", createTelemetryHandler(getConfig)));

    // E3: MCP 注入工具白名单过滤
    const SAFE_TOOL_NAME_RE = /^[a-zA-Z0-9_\-]{1,64}$/;
    const BLOCKED_TOOL_NAME_RE = /^(eval|exec|shell|spawn|system|cmd|bash|python|node)/i;
    api.on(
      "before_agent_start",
      safeHook("before_agent_start:mcp-tool-guard", async (event: Record<string, unknown>) => {
        const tools = event.additionalTools;
        if (!Array.isArray(tools) || tools.length === 0) return undefined;
        const filtered = tools.filter(
          (t: unknown) =>
            t !== null &&
            typeof t === "object" &&
            typeof (t as Record<string, unknown>).name === "string" &&
            SAFE_TOOL_NAME_RE.test((t as Record<string, unknown>).name as string) &&
            !BLOCKED_TOOL_NAME_RE.test((t as Record<string, unknown>).name as string),
        );
        if (filtered.length !== tools.length) {
          log.warn(`E3: 过滤了 ${tools.length - filtered.length} 个危险或不合规 MCP 工具名`);
        }
        return { additionalTools: filtered };
      }),
      { priority: 85 },
    );
    // Step 4: CLI
    api.registerCli(({ program }) => registerCnSetup(program), { commands: ["cn-setup"] });
    api.registerCli(({ program }) => registerCnMigrate(program), { commands: ["cn-migrate"] });
    api.registerCli(({ program }) => registerCnUninstall(program), { commands: ["cn-uninstall"] });
    api.registerCli(({ program }) => registerCnCommands(program), {
      commands: ["帮助", "状态", "配置", "升级"],
    });
    api.registerCli(({ program }) => registerCnRule(program), { commands: ["cn-rule"] });
    api.registerCli(({ program }) => registerCnCompliance(program), { commands: ["cn-compliance"] });

    // Step 5: 配置自动迁移（出厂体验核心）
    // configVersion 优先从 cn-adapter-state.json 读，回退 openclaw.json 的 cnPlugin
    const fullConfig = api.config as Record<string, unknown>;
    const configVersion = getConfigVersionUnified(fullConfig);
    const latestVersion = Math.max(0, ...MIGRATIONS.map((m) => m.version));
    log.info(`配置迁移检查: configVersion=${configVersion}, latestVersion=${latestVersion}, hasWriteConfig=${!!api.runtime?.config?.writeConfigFile}`);
    if (configVersion < latestVersion) {
      void (async () => {
        try {
          // 读取当前配置
          let currentConfig: Record<string, unknown>;
          if (api.runtime?.config?.loadConfig) {
            currentConfig = (await api.runtime.config.loadConfig()) as Record<string, unknown>;
          } else {
            const os = await import("node:os");
            const fs = await import("node:fs/promises");
            const cfgPath = path.join(os.default.homedir(), ".openclaw", "openclaw.json");
            const raw = await fs.readFile(cfgPath, "utf-8");
            currentConfig = JSON.parse(raw);
          }

          // 如果老用户有 cnPlugin，先迁移到 state 文件并清除
          if (currentConfig.cnPlugin) {
            currentConfig = migrateCnPluginToState(currentConfig);
            log.info("老用户 cnPlugin 已迁移到 cn-adapter-state.json");
          }

          // 执行迁移（migrateConfig 仍会产生 cnPlugin.* 变更）
          const { config: migrated, applied } = migrateConfig(currentConfig);
          if (applied.length > 0) {
            // 分离：cnPlugin.* → state 文件，其余 → openclaw.json
            const { upstreamConfig, configVersion: newVersion } = separateCnPluginFromConfig(migrated);

            // 写入上游配置（不含 cnPlugin，schema 校验通过）
            if (api.runtime?.config?.writeConfigFile) {
              await api.runtime.config.writeConfigFile(upstreamConfig as any);
            } else {
              const os = await import("node:os");
              const fs = await import("node:fs/promises");
              const cfgPath = path.join(os.default.homedir(), ".openclaw", "openclaw.json");
              await fs.writeFile(cfgPath, JSON.stringify(upstreamConfig, null, 2) + "\n", "utf-8");
            }

            // 写入 configVersion 到 cn-adapter-state.json
            setConfigVersionInState(newVersion);

            log.info(
              `配置自动迁移完成: v${configVersion} → v${newVersion}，` +
                `应用了 ${applied.length} 个版本 [${applied.join(",")}]`,
            );
          }
        } catch (err) {
          log.warn(`配置自动迁移失败: ${err instanceof Error ? err.message : String(err)}`);
        }
      })();
    } else if (configVersion === 0) {
      log.info("未检测到 CN 配置，建议运行 openclaw cn-setup");
    }

    // Step 6: 数据迁移 + 旧用户检测（fire-and-forget, non-critical）
    runDataMigrations().catch((err) =>
      log.warn(`数据迁移异常: ${err instanceof Error ? err.message : String(err)}`),
    );

    if (configVersion === 0) {
      detectLegacyInstall(log);
    }

    // [CN-PERF] Warm the model catalog after first paint. Loading the full
    // catalog competes with initial Control UI websocket requests on Windows.
    const modelCatalogWarmTimer = setTimeout(() => {
      void import("../../src/agents/model-catalog.js")
        .then(({ loadModelCatalog }) => loadModelCatalog())
        .then((catalog) => log.info(`Model catalog pre-warmed: ${catalog.length} entries`))
        .catch(() => {
          /* best-effort */
        });
    }, 45_000);
    modelCatalogWarmTimer.unref?.();

    // Step 7: macOS/Linux CLI 自动注册（fire-and-forget，不影响启动）
    void autoInstallCliWrapper();

    log.info(`v${CN_ADAPTER_VERSION} 注册完成`);
  },
};

export default plugin;
