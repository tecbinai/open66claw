/**
 * 轻量 OTLP HTTP JSON Exporter
 *
 * 不引入 @opentelemetry/ npm 包，自己实现最小必要的 OTLP HTTP JSON 协议。
 * 兼容 Jaeger / Grafana Tempo / 任何 OTLP HTTP 接收端。
 *
 * 参考：https://opentelemetry.io/docs/specs/otlp/#otlphttp
 */

import { randomBytes } from "node:crypto";
import { createCnLogger } from "../utils/index.js";
import type { TelemetryRecord } from "./cn-telemetry.js";

const log = createCnLogger("otel-exporter");

// ============================================================================
// OTLP JSON 类型（最小子集）
// ============================================================================

export interface OtlpSpan {
  traceId: string;
  spanId: string;
  name: string;
  kind: number; // 1=INTERNAL
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes: OtlpAttribute[];
  status: { code: number }; // 0=UNSET, 1=OK, 2=ERROR
}

export interface OtlpAttribute {
  key: string;
  value: { stringValue?: string; intValue?: string; boolValue?: boolean };
}

export interface OtlpExportRequest {
  resourceSpans: Array<{
    resource: { attributes: OtlpAttribute[] };
    scopeSpans: Array<{
      scope: { name: string; version: string };
      spans: OtlpSpan[];
    }>;
  }>;
}

// ============================================================================
// Conversion helpers
// ============================================================================

function generateTraceId(): string {
  return randomBytes(16).toString("hex");
}

function generateSpanId(): string {
  return randomBytes(8).toString("hex");
}

function strAttr(key: string, value: string | undefined): OtlpAttribute | null {
  if (value === undefined) return null;
  return { key, value: { stringValue: value } };
}

function intAttr(key: string, value: number | undefined): OtlpAttribute | null {
  if (value === undefined) return null;
  return { key, value: { intValue: String(value) } };
}

function boolAttr(key: string, value: boolean | undefined): OtlpAttribute | null {
  if (value === undefined) return null;
  return { key, value: { boolValue: value } };
}

/**
 * 将 TelemetryRecord 转换为 OTLP Span
 */
export function toOtlpSpan(record: TelemetryRecord): OtlpSpan {
  const startMs = new Date(record.timestamp).getTime();
  const durationMs = record.duration ?? 0;
  const endMs = startMs + durationMs;

  // nanoseconds as string (OTLP uses uint64 → string in JSON)
  const startNano = `${startMs}000000`;
  const endNano = `${endMs}000000`;

  const attrs: OtlpAttribute[] = [
    strAttr("cn.agent_id", record.agentId),
    strAttr("cn.session_id", record.sessionId),
    strAttr("cn.channel_id", record.channelId),
    strAttr("cn.security_tier", record.securityTier),
    strAttr("cn.version", record.version),
    strAttr("cn.provider", record.provider),
    boolAttr("cn.success", record.success),
    intAttr("cn.duration_ms", record.duration),
    strAttr("cn.error", record.error),
  ].filter((a): a is OtlpAttribute => a !== null);

  return {
    traceId: generateTraceId(),
    spanId: generateSpanId(),
    name: "cn-adapter.agent_end",
    kind: 1, // SPAN_KIND_INTERNAL
    startTimeUnixNano: startNano,
    endTimeUnixNano: endNano,
    attributes: attrs,
    status: { code: record.success ? 1 : 2 },
  };
}

/**
 * 构建完整的 OTLP Export 请求体
 */
export function buildExportRequest(spans: OtlpSpan[]): OtlpExportRequest {
  return {
    resourceSpans: [
      {
        resource: {
          attributes: [
            { key: "service.name", value: { stringValue: "openclawcn" } },
            { key: "service.version", value: { stringValue: "0.1.0" } },
          ],
        },
        scopeSpans: [
          {
            scope: { name: "cn-adapter", version: "0.1.0" },
            spans,
          },
        ],
      },
    ],
  };
}

/**
 * 校验 OTel endpoint URL 格式
 */
export function isValidOtelEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * 发送 spans 到 OTLP HTTP endpoint（fire-and-forget）
 *
 * POST {endpoint}/v1/traces
 * Content-Type: application/json
 *
 * 发送失败静默忽略（不影响主流程）
 */
export async function exportSpans(endpoint: string, spans: OtlpSpan[]): Promise<boolean> {
  if (spans.length === 0) return true;

  if (!isValidOtelEndpoint(endpoint)) {
    log.warn(`无效的 OTel endpoint: ${endpoint}`);
    return false;
  }

  const url = `${endpoint.replace(/\/+$/, "")}/v1/traces`;
  const body = buildExportRequest(spans);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      log.debug(`OTel export failed: HTTP ${response.status}`);
      return false;
    }

    return true;
  } catch (err) {
    // 静默忽略网络错误
    log.debug(`OTel export error: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

/**
 * 将单条 TelemetryRecord 导出到 OTel（fire-and-forget）
 *
 * 不 await、不 throw，完全不影响主流程。
 */
export function exportRecordToOtel(record: TelemetryRecord, endpoint: string): void {
  try {
    const span = toOtlpSpan(record);
    // fire-and-forget
    exportSpans(endpoint, [span]).catch(() => {
      // 已在 exportSpans 内部 log.debug
    });
  } catch {
    // toOtlpSpan 同步异常（如 randomBytes 失败），静默忽略
  }
}
