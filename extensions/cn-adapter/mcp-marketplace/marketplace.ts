/**
 * Marketplace — 业务编排中心
 * CN-ONLY FILE — 不影响上游 OpenClaw
 *
 * install / uninstall / update / testConnection 完整流程。
 */

import type { Catalog } from "./catalog.js";
import { getBestMirror, getNpmMirrorEnv, getPypiMirrorEnv } from "./cn-mirrors.js";
import { installUv, prefetchNpmPackage, prefetchPypiPackage } from "./dep-installer.js";
import * as mcpConfig from "./mcp-config.js";
import { testMcpServer } from "./mcp-launcher.js";
import { checkRuntime } from "./runtime-check.js";
import type { McpMarketplaceItem, McpServerConfig, InstallParams, InstallResult } from "./types.js";

export class Marketplace {
  private catalog: Catalog;

  constructor(catalog: Catalog) {
    this.catalog = catalog;
  }

  /**
   * 安装 MCP server。
   * 1. 查 catalog 获取安装信息
   * 2. 检测运行时，缺 uvx 时自动安装 uv
   * 3. 写入 .mcp.json
   * 4. 可选：spawn 验证连通性
   */
  async install(params: InstallParams): Promise<InstallResult> {
    const item = await this.catalog.getById(params.serverId);
    if (!item) {
      return { success: false, serverId: params.serverId, error: "未找到该 MCP" };
    }

    // 构建 server config
    const config = this.buildServerConfig(item, params);
    if (!config) {
      return {
        success: false,
        serverId: params.serverId,
        error: "无法构建安装配置：缺少 command 信息",
      };
    }

    // 检测运行时
    const method = item.installMethod ?? "none";
    if (method === "npm" || method === "pypi") {
      const runtime = checkRuntime(method);
      if (!runtime.ready) {
        // pypi 类尝试自动安装 uv
        if (method === "pypi") {
          const uvResult = await installUv();
          if (!uvResult.success) {
            return {
              success: false,
              serverId: params.serverId,
              error: `缺少运行时: ${runtime.missing.join(", ")}。${uvResult.error ?? ""}`,
            };
          }
        } else {
          return {
            success: false,
            serverId: params.serverId,
            error: `缺少运行时: ${runtime.missing.join(", ")}`,
          };
        }
      }
    }

    // 注入 CN 镜像 env + npx --registry 参数
    if (method === "npm") {
      config.env = { ...getNpmMirrorEnv(), ...config.env };
      this.injectNpxRegistry(config);
    } else if (method === "pypi") {
      config.env = { ...getPypiMirrorEnv(), ...config.env };
    }

    // 合并用户提供的 env
    if (params.env) {
      config.env = { ...config.env, ...params.env };
    }

    // 预拉取包到本地缓存 — 确保 npx/uvx 后续能秒启
    if (method === "npm") {
      const pkg = params.overrideNpmPackage || item.npmPackage;
      if (pkg) {
        const prefetch = await prefetchNpmPackage(pkg, config.env);
        if (!prefetch.success) {
          return {
            success: false,
            serverId: params.serverId,
            error: prefetch.error ?? "npm 包下载失败",
          };
        }
      }
    } else if (method === "pypi") {
      const pkg = params.overridePypiPackage || item.serverId;
      const prefetch = await prefetchPypiPackage(pkg, config.env);
      if (!prefetch.success) {
        return {
          success: false,
          serverId: params.serverId,
          error: prefetch.error ?? "pypi 包下载失败",
        };
      }
    }

    // 写入 .mcp.json
    try {
      mcpConfig.upsertServer(params.serverId, config);
    } catch (err) {
      return {
        success: false,
        serverId: params.serverId,
        error: `写入配置失败: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    // 验证连通性 — 探测失败则回滚配置，视为安装失败
    try {
      const launchResult = await testMcpServer(config);
      if (!launchResult.success) {
        mcpConfig.removeServer(params.serverId);
        return {
          success: false,
          serverId: params.serverId,
          error: launchResult.error ?? "MCP server 连接失败",
        };
      }
      return { success: true, serverId: params.serverId, toolCount: launchResult.toolCount };
    } catch (err) {
      mcpConfig.removeServer(params.serverId);
      return {
        success: false,
        serverId: params.serverId,
        error: `连接验证异常: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  /**
   * 卸载 MCP server — 从 .mcp.json 删除条目。
   */
  async uninstall(serverId: string): Promise<{ success: boolean; error?: string }> {
    const removed = mcpConfig.removeServer(serverId);
    if (!removed) {
      return { success: false, error: "该 MCP 未安装" };
    }
    return { success: true };
  }

  /**
   * 更新 MCP server — 重新写入最新配置。
   */
  async update(serverId: string): Promise<InstallResult> {
    // 获取最新数据
    const item = await this.catalog.getById(serverId);
    if (!item) {
      return { success: false, serverId, error: "未找到该 MCP" };
    }

    // 保留现有 env 配置
    const existingConfig = mcpConfig.getServer(serverId);
    const existingEnv = existingConfig?.env ?? {};

    // 重新安装
    return this.install({
      serverId,
      env: existingEnv,
    });
  }

  /**
   * 测试连接 — spawn + handshake。
   */
  async testConnection(
    serverId: string,
    env?: Record<string, string>,
  ): Promise<{ success: boolean; error?: string; toolCount?: number }> {
    const item = await this.catalog.getById(serverId);
    if (!item) {
      return { success: false, error: "未找到该 MCP" };
    }

    const config = this.buildServerConfig(item, { serverId, env });
    if (!config) {
      return { success: false, error: "无法构建测试配置" };
    }

    // 注入 CN 镜像 + npx --registry
    const method = item.installMethod ?? "none";
    if (method === "npm") {
      config.env = { ...getNpmMirrorEnv(), ...config.env };
      this.injectNpxRegistry(config);
    } else if (method === "pypi") {
      config.env = { ...getPypiMirrorEnv(), ...config.env };
    }
    if (env) {
      config.env = { ...config.env, ...env };
    }

    // 测试连接前也 prefetch — 确保包已下载（用户点"重试"时需要）
    if (method === "npm") {
      const pkg = item.npmPackage;
      if (pkg) {
        await prefetchNpmPackage(pkg, config.env);
        // prefetch 失败不阻塞测试，testMcpServer 会报更具体的错误
      }
    } else if (method === "pypi") {
      await prefetchPypiPackage(item.serverId, config.env);
    }

    const result = await testMcpServer(config);
    return { success: result.success, error: result.error, toolCount: result.toolCount };
  }

  /**
   * 给 npx 命令注入 --registry 参数，确保使用 CN 镜像下载。
   * 比 npm_config_registry env 更可靠（部分 npx 版本不读 env）。
   */
  private injectNpxRegistry(config: McpServerConfig): void {
    if (config.command !== "npx") return;
    const registry = getBestMirror("npm");
    const args = config.args ?? [];
    // 避免重复注入
    if (args.some((a) => a.startsWith("--registry"))) return;
    // 插入到 -y 之后、包名之前
    const yIdx = args.indexOf("-y");
    if (yIdx >= 0) {
      args.splice(yIdx + 1, 0, `--registry=${registry}`);
    } else {
      args.unshift(`--registry=${registry}`);
    }
    config.args = args;
  }

  /**
   * 构建 McpServerConfig。
   */
  private buildServerConfig(
    item: McpMarketplaceItem,
    params: InstallParams,
  ): McpServerConfig | null {
    const method = item.installMethod ?? "none";

    // SSE override
    if (params.overrideSseUrl) {
      return {
        command: "npx",
        args: ["-y", "@anthropic-ai/mcp-proxy@latest", params.overrideSseUrl],
      };
    }

    // npm override
    if (params.overrideNpmPackage) {
      return {
        command: "npx",
        args: ["-y", params.overrideNpmPackage],
      };
    }

    // pypi override
    if (params.overridePypiPackage) {
      return {
        command: "uvx",
        args: [params.overridePypiPackage],
      };
    }

    // From item data
    if (method === "npm" && item.npmPackage) {
      return {
        command: "npx",
        args: ["-y", item.npmPackage],
      };
    }

    if (method === "pypi" && item.source) {
      return {
        command: "uvx",
        args: [item.serverId],
      };
    }

    if (method === "sse") {
      if (item.sseUrl) {
        return {
          command: "npx",
          args: ["-y", "@anthropic-ai/mcp-proxy@latest", item.sseUrl],
        };
      }
      return null;
    }

    // Fallback: try to use serverId as npm package
    if (item.npmPackage) {
      return {
        command: "npx",
        args: ["-y", item.npmPackage],
      };
    }

    return null;
  }
}
