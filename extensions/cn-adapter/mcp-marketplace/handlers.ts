/**
 * Handlers — 14 个 RPC 路由（薄层，只解析参数 → 调用 → 返回）
 * CN-ONLY FILE — 不影响上游 OpenClaw
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { safeGateway } from "../utils/index.js";
import type { Catalog } from "./catalog.js";
import type { Marketplace } from "./marketplace.js";
import * as mcpConfig from "./mcp-config.js";

interface GatewayContext {
  respond: (ok: boolean, payload?: unknown, error?: { code?: string; message?: string }) => void;
  params: Record<string, unknown>;
}

// ============================================================================
// Probe Result Cache — 内存缓存探测结果，10 分钟 TTL
// ============================================================================

interface ProbeResult {
  status: "running" | "stopped" | "error";
  toolCount: number;
  error?: string;
  probedAt: number;
}

const statusCache = new Map<string, ProbeResult>();
const CACHE_TTL_MS = 10 * 60 * 1000;

function getCachedStatus(serverId: string): ProbeResult | null {
  const entry = statusCache.get(serverId);
  if (!entry) return null;
  if (Date.now() - entry.probedAt > CACHE_TTL_MS) {
    statusCache.delete(serverId);
    return null;
  }
  return entry;
}

export function registerMarketplaceHandlers(
  api: OpenClawPluginApi,
  catalog: Catalog,
  marketplace: Marketplace,
): void {
  // ========================================================================
  // Lifecycle Methods (5)
  // ========================================================================

  // mcp.status — 页面初始化
  api.registerGatewayMethod(
    "mcp.status",
    safeGateway("mcp.status", async ({ respond }: GatewayContext) => {
      const servers = mcpConfig.listServers();
      const installedCount = Object.keys(servers).length;

      // 批量查 catalog 获取中文名
      const serverIds = Object.keys(servers);
      const catalogItems = new Map<string, { friendlyName: string; description?: string; capabilities?: string[] }>();
      for (const id of serverIds) {
        const item = await catalog.getById(id);
        if (item) {
          catalogItems.set(id, {
            friendlyName: item.friendlyName ?? id,
            description: item.description,
            capabilities: item.capabilities,
          });
        }
      }

      // capabilities = 真实安装的 MCP servers（从 .mcp.json 读取）
      // 内置能力（filesystem, sqlite 等）由 UI 端 BUILTIN_CAPABILITIES 管理，不在此返回
      const capabilities = Object.entries(servers).map(([id, config]) => {
        const cached = getCachedStatus(id);
        const catalogInfo = catalogItems.get(id);
        return {
          id,
          name: catalogInfo?.friendlyName ?? id,
          status: config.disabled ? "paused" as const : (cached?.status === "running" ? "ready" as const : "unavailable" as const),
          isNew: true,
          friendlyName: catalogInfo?.friendlyName ?? id,
          description: catalogInfo?.description,
          capabilities: catalogInfo?.capabilities,
          toolCount: cached?.toolCount ?? 0,
        };
      });

      respond(true, {
        capabilities,
        processes: Object.entries(servers).map(([id, config]) => {
          // 状态优先级：disabled → 缓存探测结果 → 默认 stopped
          let status: "running" | "stopped" | "error" = "stopped";
          let toolCount = 0;
          let error: string | undefined;

          if (config.disabled) {
            status = "stopped";
          } else {
            const cached = getCachedStatus(id);
            if (cached) {
              status = cached.status;
              toolCount = cached.toolCount;
              error = cached.error;
            }
          }

          const catalogInfo = catalogItems.get(id);
          return {
            id,
            name: catalogInfo?.friendlyName ?? id,
            status,
            toolCount,
            command: config.command,
            ...(error ? { error } : {}),
          };
        }),
        installedCount,
      });
    }),
  );

  // mcp.restart — 重启 = 移除 disabled + 重新探测
  api.registerGatewayMethod(
    "mcp.restart",
    safeGateway("mcp.restart", async ({ respond, params }: GatewayContext) => {
      const serverId = params.id as string;
      if (serverId) {
        // 重启时自动启用
        mcpConfig.enableServer(serverId);

        const result = await marketplace.testConnection(serverId);

        // 写入缓存
        statusCache.set(serverId, {
          status: result.success ? "running" : "error",
          toolCount: result.toolCount ?? 0,
          error: result.error,
          probedAt: Date.now(),
        });

        respond(true, {
          ok: result.success,
          toolCount: result.toolCount,
          error: result.error,
        });
      } else {
        respond(true, { ok: true });
      }
    }),
  );

  // mcp.disable — 停用 server：标记 disabled + 清缓存
  api.registerGatewayMethod(
    "mcp.disable",
    safeGateway("mcp.disable", async ({ respond, params }: GatewayContext) => {
      const serverId = params.id as string;
      if (!serverId) {
        respond(false, undefined, { message: "缺少 serverId" });
        return;
      }

      const ok = mcpConfig.disableServer(serverId);
      if (!ok) {
        respond(false, undefined, { message: "该 MCP 未安装" });
        return;
      }

      statusCache.delete(serverId);
      respond(true, { ok: true });
    }),
  );

  // mcp.enable — 启用 server：移除 disabled 标记 + 探测验证
  api.registerGatewayMethod(
    "mcp.enable",
    safeGateway("mcp.enable", async ({ respond, params }: GatewayContext) => {
      const serverId = params.id as string;
      if (!serverId) {
        respond(false, undefined, { message: "缺少 serverId" });
        return;
      }

      const config = mcpConfig.getServer(serverId);
      if (!config) {
        respond(false, undefined, { message: "该 MCP 未安装" });
        return;
      }

      // 移除 disabled 标记
      mcpConfig.enableServer(serverId);

      // 探测验证
      const result = await marketplace.testConnection(serverId);

      // 写入缓存
      statusCache.set(serverId, {
        status: result.success ? "running" : "error",
        toolCount: result.toolCount ?? 0,
        error: result.error,
        probedAt: Date.now(),
      });

      respond(true, {
        ok: result.success,
        toolCount: result.toolCount,
        error: result.error,
      });
    }),
  );

  // mcp.sync — 清缓存重读
  api.registerGatewayMethod(
    "mcp.sync",
    safeGateway("mcp.sync", async ({ respond }: GatewayContext) => {
      catalog.clearCache();
      respond(true, { ok: true });
    }),
  );

  // ========================================================================
  // Marketplace Methods (7)
  // ========================================================================

  // mcp.marketplace.list — 列表/翻页/搜索/分类
  api.registerGatewayMethod(
    "mcp.marketplace.list",
    safeGateway("mcp.marketplace.list", async ({ respond, params }: GatewayContext) => {
      const result = await catalog.list({
        page: (params.page as number) ?? 1,
        pageSize: (params.pageSize as number) ?? 50,
        search: params.search as string | undefined,
        category: params.category as string | undefined,
      });
      respond(true, result);
    }),
  );

  // mcp.marketplace.detail — 详情
  api.registerGatewayMethod(
    "mcp.marketplace.detail",
    safeGateway("mcp.marketplace.detail", async ({ respond, params }: GatewayContext) => {
      const serverId = params.serverId as string;
      if (!serverId) {
        respond(false, undefined, { message: "缺少 serverId" });
        return;
      }
      const item = await catalog.getById(serverId);
      if (!item) {
        respond(false, undefined, { message: "未找到该 MCP" });
        return;
      }
      respond(true, item);
    }),
  );

  // mcp.marketplace.recommend — 推荐
  api.registerGatewayMethod(
    "mcp.marketplace.recommend",
    safeGateway("mcp.marketplace.recommend", async ({ respond }: GatewayContext) => {
      const items = await catalog.recommend(10);
      respond(true, { items });
    }),
  );

  // mcp.marketplace.install — 安装
  api.registerGatewayMethod(
    "mcp.marketplace.install",
    safeGateway("mcp.marketplace.install", async ({ respond, params }: GatewayContext) => {
      const serverId = params.serverId as string;
      const result = await marketplace.install({
        serverId,
        env: params.env as Record<string, string> | undefined,
        overrideSseUrl: params.overrideSseUrl as string | undefined,
        overrideNpmPackage: params.overrideNpmPackage as string | undefined,
        overridePypiPackage: params.overridePypiPackage as string | undefined,
      });

      // 安装后缓存探测结果
      if (result.success && serverId) {
        statusCache.set(serverId, {
          status: result.toolCount != null ? "running" : "error",
          toolCount: result.toolCount ?? 0,
          probedAt: Date.now(),
        });
      }

      if (result.success) {
        respond(true, result);
      } else {
        respond(false, result, { message: result.error ?? "安装失败" });
      }
    }),
  );

  // mcp.marketplace.uninstall — 卸载
  api.registerGatewayMethod(
    "mcp.marketplace.uninstall",
    safeGateway("mcp.marketplace.uninstall", async ({ respond, params }: GatewayContext) => {
      const serverId = params.serverId as string;
      if (!serverId) {
        respond(false, undefined, { message: "缺少 serverId" });
        return;
      }
      statusCache.delete(serverId);
      const result = await marketplace.uninstall(serverId);
      if (result.success) {
        respond(true, result);
      } else {
        respond(false, result, { message: result.error ?? "卸载失败" });
      }
    }),
  );

  // mcp.marketplace.update — 更新
  api.registerGatewayMethod(
    "mcp.marketplace.update",
    safeGateway("mcp.marketplace.update", async ({ respond, params }: GatewayContext) => {
      const serverId = params.serverId as string;
      if (!serverId) {
        respond(false, undefined, { message: "缺少 serverId" });
        return;
      }
      const result = await marketplace.update(serverId);
      if (result.success) {
        respond(true, result);
      } else {
        respond(false, result, { message: result.error ?? "更新失败" });
      }
    }),
  );

  // mcp.marketplace.testConnection — 测试连接
  api.registerGatewayMethod(
    "mcp.marketplace.testConnection",
    safeGateway("mcp.marketplace.testConnection", async ({ respond, params }: GatewayContext) => {
      const serverId = params.serverId as string;
      if (!serverId) {
        respond(false, undefined, { message: "缺少 serverId" });
        return;
      }
      const result = await marketplace.testConnection(
        serverId,
        params.env as Record<string, string> | undefined,
      );
      if (result.success) {
        respond(true, result);
      } else {
        respond(false, result, { message: result.error ?? "连接失败" });
      }
    }),
  );

  // ========================================================================
  // Server Management Methods (2)
  // ========================================================================

  // mcp.servers.list — 列出所有已配置的 server（含 env 状态）
  api.registerGatewayMethod(
    "mcp.servers.list",
    safeGateway("mcp.servers.list", async ({ respond }: GatewayContext) => {
      const servers = mcpConfig.listServers();
      const result = Object.entries(servers).map(([id, config]) => ({
        id,
        command: config.command,
        args: config.args,
        envConfigured: Object.fromEntries(
          Object.entries(config.env ?? {}).map(([key, val]) => [key, !!val && val.length > 0]),
        ),
      }));
      respond(true, { servers: result });
    }),
  );

  // mcp.servers.batchUpdateEnv — 批量更新 env
  api.registerGatewayMethod(
    "mcp.servers.batchUpdateEnv",
    safeGateway("mcp.servers.batchUpdateEnv", async ({ respond, params }: GatewayContext) => {
      const updates = params.updates as Array<{ id: string; env: Record<string, string> }>;
      if (!Array.isArray(updates)) {
        respond(false, undefined, { message: "缺少 updates 数组" });
        return;
      }
      const result = mcpConfig.batchUpdateEnv(updates);
      respond(true, result);
    }),
  );
}
