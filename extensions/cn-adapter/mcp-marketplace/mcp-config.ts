/**
 * MCP Config — 读写上游 .mcp.json
 * CN-ONLY FILE — 不影响上游 OpenClaw
 *
 * 直接操作项目根目录的 .mcp.json，格式：
 * { "mcpServers": { "serverId": { "command": "...", "args": [...], "env": {...} } } }
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { McpServerConfig } from "./types.js";

// ============================================================================
// File Path
// ============================================================================

function getMcpJsonPath(): string {
  return path.join(process.cwd(), ".mcp.json");
}

// ============================================================================
// Read / Write
// ============================================================================

export interface McpJsonFile {
  mcpServers: Record<string, McpServerConfig>;
}

export function readMcpJson(): McpJsonFile {
  try {
    const raw = fs.readFileSync(getMcpJsonPath(), "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed.mcpServers || typeof parsed.mcpServers !== "object") {
      return { mcpServers: {} };
    }
    return parsed as McpJsonFile;
  } catch {
    return { mcpServers: {} };
  }
}

function writeMcpJson(data: McpJsonFile): void {
  fs.writeFileSync(getMcpJsonPath(), JSON.stringify(data, null, 2) + "\n");
}

// ============================================================================
// CRUD Operations
// ============================================================================

/** 添加或更新一个 MCP server 配置 */
export function upsertServer(serverId: string, config: McpServerConfig): void {
  const data = readMcpJson();
  data.mcpServers[serverId] = config;
  writeMcpJson(data);
}

/** 删除一个 MCP server 配置 */
export function removeServer(serverId: string): boolean {
  const data = readMcpJson();
  if (!(serverId in data.mcpServers)) return false;
  delete data.mcpServers[serverId];
  writeMcpJson(data);
  return true;
}

/** 获取单个 server 配置 */
export function getServer(serverId: string): McpServerConfig | null {
  const data = readMcpJson();
  return data.mcpServers[serverId] ?? null;
}

/** 列出所有已配置的 server */
export function listServers(): Record<string, McpServerConfig> {
  return readMcpJson().mcpServers;
}

/** 检查某个 server 是否已安装 */
export function isInstalled(serverId: string): boolean {
  return serverId in readMcpJson().mcpServers;
}

/** 获取所有已安装的 server ID 集合 */
export function getInstalledIds(): Set<string> {
  return new Set(Object.keys(readMcpJson().mcpServers));
}

/** 更新某个 server 的 env */
export function updateServerEnv(serverId: string, env: Record<string, string>): boolean {
  const data = readMcpJson();
  const server = data.mcpServers[serverId];
  if (!server) return false;
  server.env = { ...server.env, ...env };
  writeMcpJson(data);
  return true;
}

/** 停用一个 MCP server */
export function disableServer(serverId: string): boolean {
  const data = readMcpJson();
  const server = data.mcpServers[serverId];
  if (!server) return false;
  server.disabled = true;
  writeMcpJson(data);
  return true;
}

/** 启用一个已停用的 MCP server（移除 disabled 标记） */
export function enableServer(serverId: string): boolean {
  const data = readMcpJson();
  const server = data.mcpServers[serverId];
  if (!server) return false;
  delete server.disabled;
  writeMcpJson(data);
  return true;
}

/** 批量更新多个 server 的 env */
export function batchUpdateEnv(updates: Array<{ id: string; env: Record<string, string> }>): {
  success: number;
  failed: number;
} {
  const data = readMcpJson();
  let success = 0;
  let failed = 0;
  for (const { id, env } of updates) {
    const server = data.mcpServers[id];
    if (server) {
      server.env = { ...server.env, ...env };
      success++;
    } else {
      failed++;
    }
  }
  writeMcpJson(data);
  return { success, failed };
}
