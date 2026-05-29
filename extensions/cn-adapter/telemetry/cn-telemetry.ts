import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { CnPluginConfig } from "../hooks/cn-config.js";
import { createCnLogger } from "../utils/index.js";
import { exportRecordToOtel, isValidOtelEndpoint } from "./otel-exporter.js";

const CN_ADAPTER_VERSION = "0.1.0";

export type TelemetryRecord = {
  timestamp: string;
  duration?: number;
  success: boolean;
  error?: string;
  agentId?: string;
  sessionId?: string;
  channelId?: string;
  securityTier: string;
  version: string;
  provider?: string;
};

/**
 * 从错误信息中提取类名（只保留第一行，不含完整 stack）。
 */
function sanitizeError(error: string | undefined): string | undefined {
  if (!error) return undefined;
  const firstLine = error.split("\n")[0]!.trim();
  // 截断过长的错误信息
  return firstLine.length > 200 ? firstLine.slice(0, 200) + "..." : firstLine;
}

/**
 * 获取遥测文件路径：~/.openclaw/cn-telemetry.jsonl
 */
export function getTelemetryFilePath(): string {
  return path.join(os.homedir(), ".openclaw", "cn-telemetry.jsonl");
}

export type AgentEndEvent = {
  messages: unknown[];
  success: boolean;
  error?: string;
  durationMs?: number;
};

export type AgentEndContext = {
  agentId?: string;
  sessionKey?: string;
  sessionId?: string;
  workspaceDir?: string;
  messageProvider?: string;
  trigger?: string;
  channelId?: string;
};

/**
 * 创建 agent_end hook handler，用于收集匿名遥测数据。
 *
 * - telemetry=false（默认/未配置）：不执行任何操作
 * - telemetry=true：将匿名记录 append 到 ~/.openclaw/cn-telemetry.jsonl
 * - 不收集：用户消息、文件内容、API key、IP
 * - 不发送到远程服务器，仅本地记录
 */
export function createTelemetryHandler(getConfig: () => CnPluginConfig) {
  const log = createCnLogger("telemetry");

  return async (event: AgentEndEvent, ctx: AgentEndContext): Promise<void> => {
    const config = getConfig();
    if (!config.telemetry) return;

    const record: TelemetryRecord = {
      timestamp: new Date().toISOString(),
      duration: event.durationMs,
      success: event.success,
      error: sanitizeError(event.error),
      agentId: ctx.agentId,
      sessionId: ctx.sessionId,
      channelId: ctx.channelId,
      securityTier: config.securityTier ?? "full",
      version: CN_ADAPTER_VERSION,
      provider: ctx.messageProvider ?? undefined,
    };

    const filePath = getTelemetryFilePath();
    const dir = path.dirname(filePath);

    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(filePath, JSON.stringify(record) + "\n", "utf-8");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn(`写入遥测文件失败: ${msg}`);
    }

    // OTel export (fire-and-forget)
    const otelEndpoint = config.otel?.enabled ? config.otel.endpoint : undefined;
    if (otelEndpoint && isValidOtelEndpoint(otelEndpoint)) {
      exportRecordToOtel(record, otelEndpoint);
    }
  };
}
