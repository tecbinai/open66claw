/**
 * Copilot Proxy — HTTP 路由注册
 *
 * 注册 /v1/ 前缀路由，模拟 GitHub Copilot API 端点，
 * 将请求转换后转发到已配置的 LLM provider。
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import type { CnPluginConfig } from "../hooks/cn-config.js";
import { createCnLogger } from "../utils/index.js";
import {
  transformCompletionRequest,
  transformChatRequest,
  transformCompletionResponse,
  transformChatResponse,
  transformChatStreamChunk,
  formatSseData,
  formatSseDone,
  type CopilotCompletionRequest,
  type CopilotChatRequest,
  type ProviderCompletionResponse,
  type ProviderChatResponse,
} from "./transform.js";

const log = createCnLogger("copilot-proxy");

export interface CopilotProxyConfig {
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}

/**
 * 从 CnPluginConfig 提取 copilot proxy 配置
 */
export function extractProxyConfig(config: CnPluginConfig): CopilotProxyConfig | null {
  const cp = config.copilotProxy;
  if (!cp?.enabled) return null;
  if (!cp.baseUrl || !cp.model) {
    log.warn("copilotProxy 已启用但缺少 baseUrl 或 model 配置");
    return null;
  }
  // URL 格式 + 协议校验（防 SSRF）
  try {
    const parsed = new URL(cp.baseUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      log.warn("copilotProxy baseUrl 必须使用 http 或 https 协议");
      return null;
    }
  } catch {
    log.warn("copilotProxy baseUrl 格式无效");
    return null;
  }
  return {
    provider: cp.provider ?? "custom",
    baseUrl: cp.baseUrl.replace(/\/+$/, ""),
    apiKey: cp.apiKey ?? "",
    model: cp.model,
  };
}

const MAX_BODY_SIZE = 10 * 1024 * 1024; // 10 MB
const READ_TIMEOUT_MS = 30_000;

/**
 * 读取请求 body（JSON），带大小限制和超时保护
 */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalSize = 0;
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        req.destroy();
        reject(new Error("Request body read timeout"));
      }
    }, READ_TIMEOUT_MS);

    req.on("data", (chunk: Buffer) => {
      totalSize += chunk.length;
      if (totalSize > MAX_BODY_SIZE) {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          req.destroy();
          reject(new Error("Request body too large"));
        }
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(Buffer.concat(chunks).toString("utf-8"));
      }
    });
    req.on("error", (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(err);
      }
    });
  });
}

/**
 * 发送 JSON 错误响应
 */
function sendError(res: ServerResponse, status: number, message: string): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: { message, type: "proxy_error" } }));
}

/**
 * 转发请求到 provider 并处理响应
 */
async function forwardToProvider(
  url: string,
  body: string,
  apiKey: string,
  stream: boolean,
  res: ServerResponse,
  transformFn: (data: unknown, model: string) => unknown,
  model: string,
): Promise<void> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body,
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "unknown error");
    log.warn(`Provider returned HTTP ${response.status}: ${errText.slice(0, 500)}`);
    sendError(res, response.status, "Upstream provider request failed");
    return;
  }

  if (stream && response.body) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim();
            if (data === "[DONE]") {
              res.write(formatSseDone());
            } else {
              try {
                const parsed = JSON.parse(data);
                const transformed = transformFn(parsed, model);
                res.write(formatSseData(transformed));
              } catch {
                // Pass through unparseable lines as-is
                res.write(line + "\n\n");
              }
            }
          }
        }
      }

      // Flush remaining buffer (handle both [DONE] and data events)
      const remainder = buffer.trim();
      if (remainder.startsWith("data: ")) {
        const data = remainder.slice(6).trim();
        if (data === "[DONE]") {
          res.write(formatSseDone());
        } else {
          try {
            const parsed = JSON.parse(data);
            const transformed = transformFn(parsed, model);
            res.write(formatSseData(transformed));
          } catch {
            res.write(remainder + "\n\n");
          }
        }
      }

      res.end();
    } catch (err) {
      log.warn(`SSE stream error: ${err instanceof Error ? err.message : String(err)}`);
      res.end();
    }
  } else {
    const text = await response.text();
    try {
      const parsed = JSON.parse(text);
      const transformed = transformFn(parsed, model);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(transformed));
    } catch {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(text);
    }
  }
}

/**
 * 创建 /v1/ 前缀路由 handler
 */
export function createCopilotRouteHandler(getConfig: () => CnPluginConfig) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    const rawUrl = req.url ?? "";
    const method = req.method ?? "";

    // 剥离 query string，只匹配 pathname
    const pathname = rawUrl.split("?")[0];

    if (method !== "POST") {
      sendError(res, 405, "Method not allowed");
      return true;
    }

    const proxyConfig = extractProxyConfig(getConfig());
    if (!proxyConfig) {
      sendError(res, 503, "Copilot proxy not configured");
      return true;
    }

    try {
      const rawBody = await readBody(req);
      const body = JSON.parse(rawBody) as Record<string, unknown>;

      // /v1/engines/*/completions — 补全请求
      if (/^\/v1\/engines\/[^/]+\/completions\/?$/.test(pathname)) {
        const copilotReq = body as unknown as CopilotCompletionRequest;
        const providerReq = transformCompletionRequest(copilotReq, proxyConfig.model);
        const stream = providerReq.stream ?? false;

        const providerUrl = `${proxyConfig.baseUrl}/v1/completions`;
        await forwardToProvider(
          providerUrl,
          JSON.stringify(providerReq),
          proxyConfig.apiKey,
          stream,
          res,
          (data, model) => transformCompletionResponse(data as ProviderCompletionResponse, model),
          proxyConfig.model,
        );
        return true;
      }

      // /v1/chat/completions — Chat 请求
      if (/^\/v1\/chat\/completions\/?$/.test(pathname)) {
        const copilotReq = body as unknown as CopilotChatRequest;
        const providerReq = transformChatRequest(copilotReq, proxyConfig.model);
        const stream = providerReq.stream ?? false;

        const providerUrl = `${proxyConfig.baseUrl}/v1/chat/completions`;
        // 流式使用 chunk transform（delta + chat.completion.chunk），非流式使用完整 transform
        const chatTransformFn = stream
          ? (data: unknown, m: string) => transformChatStreamChunk(data as ProviderChatResponse, m)
          : (data: unknown, m: string) => transformChatResponse(data as ProviderChatResponse, m);
        await forwardToProvider(
          providerUrl,
          JSON.stringify(providerReq),
          proxyConfig.apiKey,
          stream,
          res,
          chatTransformFn,
          proxyConfig.model,
        );
        return true;
      }

      // 其他 /v1/ 路径 — 不处理，返回 false 让上游处理
      return false;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn(`Copilot proxy error: ${msg}`);
      sendError(res, 500, "Internal proxy error");
      return true;
    }
  };
}

/**
 * 注册 copilot proxy HTTP 路由
 */
export function registerCopilotProxy(
  api: OpenClawPluginApi,
  getConfig: () => CnPluginConfig,
): void {
  // 检查 registerHttpRoute 是否可用
  if (typeof (api as any).registerHttpRoute !== "function") {
    log.warn("registerHttpRoute 不可用，跳过 copilot proxy 注册");
    return;
  }

  api.registerHttpRoute({
    path: "/v1/",
    handler: createCopilotRouteHandler(getConfig),
    auth: "plugin",
    match: "prefix",
  });

  log.info("Copilot proxy 已注册 (/v1/ prefix)");
}
