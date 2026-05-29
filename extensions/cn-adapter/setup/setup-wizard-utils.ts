/**
 * Setup Wizard - Utility Functions
 * 配置向导的辅助工具函数
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import type { SetupApiResponse } from "./setup-wizard-types.js";

// ============================================================================
// 常量
// ============================================================================

export const SETUP_API_PREFIX = "/api/setup";
export const SETUP_UI_PATH = "/setup";

// ============================================================================
// 辅助函数
// ============================================================================

export function sendJson(res: ServerResponse, status: number, body: SetupApiResponse): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.end(JSON.stringify(body));
}

export async function readJsonBody<T>(req: IncomingMessage): Promise<T | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const body = Buffer.concat(chunks).toString("utf8");
        resolve(JSON.parse(body) as T);
      } catch {
        resolve(null);
      }
    });
    req.on("error", () => resolve(null));
  });
}

/**
 * 将目录路径转换为 Docker bind 格式
 */
export function formatDockerBind(hostPath: string): string {
  const dirName = path.basename(hostPath);
  const containerPath = `/trusted/${dirName}`;
  return `${hostPath}:${containerPath}:rw`;
}
