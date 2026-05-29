import type { GatewayRequestHandlerOptions } from "openclaw/plugin-sdk/core";

// ============================================================
// safeHook — Hook handler 防崩溃包装器
// ============================================================

export type SafeHookOptions = {
  /** true = 记录错误后重新抛出（安全关键 hook）; false = 吞掉错误返回 undefined（默认） */
  critical?: boolean;
};

/**
 * 包装 hook handler，捕获内部错误。
 *
 * @param hookName - hook 名称，用于错误日志
 * @param handler - 原始 hook handler
 * @param options - { critical?: boolean }
 * @returns 包装后的 handler（签名不变）
 *
 * @example
 * api.on("before_prompt_build", safeHook("before_prompt_build", async (event) => {
 *   return { prependSystemContext: "..." };
 * }));
 */
export function safeHook<THandler extends (...args: any[]) => any>(
  hookName: string,
  handler: THandler,
  options?: SafeHookOptions,
): THandler {
  const wrapped = async (
    ...args: Parameters<THandler>
  ): Promise<ReturnType<THandler> | undefined> => {
    try {
      return await handler(...args);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[cn-adapter:hook] ${hookName} failed: ${msg}`);
      if (options?.critical) {
        throw err;
      }
      return undefined;
    }
  };
  return wrapped as unknown as THandler;
}

// ============================================================
// safeGateway — Gateway method handler 防崩溃包装器
// ============================================================

export type SafeGatewayOptions = {
  /** true = 记录错误后重新抛出; false = 返回 JSON-RPC 错误（默认） */
  critical?: boolean;
};

/**
 * 包装 gateway method handler，捕获内部错误，返回标准化错误响应。
 *
 * 上游 RespondFn 签名: (ok: boolean, payload?: unknown, error?: ErrorShape, meta?) => void
 * ErrorShape: { code: string, message: string, ...opts }
 *
 * @param methodName - gateway method 名称
 * @param handler - 原始 handler
 * @param options - { critical?: boolean }
 *
 * @example
 * api.registerGatewayMethod("cn.config", safeGateway("cn.config", async ({ params, respond }) => {
 *   const config = loadConfig();
 *   respond(true, { config });
 * }));
 */
export function safeGateway(
  methodName: string,
  handler: (opts: GatewayRequestHandlerOptions) => Promise<void> | void,
  options?: SafeGatewayOptions,
): (opts: GatewayRequestHandlerOptions) => Promise<void> {
  return async (opts: GatewayRequestHandlerOptions): Promise<void> => {
    try {
      await handler(opts);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[cn-adapter:gateway] ${methodName} failed: ${msg}`);
      try {
        opts.respond(false, undefined, {
          code: "CN_INTERNAL_ERROR",
          message: `[cn-adapter] ${methodName}: ${msg}`,
        });
      } catch {
        // respond itself failed, nothing we can do
      }
      if (options?.critical) {
        throw err;
      }
    }
  };
}
