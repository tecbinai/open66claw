import type { PluginRuntime } from "openclaw/plugin-sdk/core";

let _runtime: PluginRuntime | null = null;

export function setWechatRuntime(runtime: PluginRuntime): void {
  _runtime = runtime;
}

export function getWechatRuntime(): PluginRuntime {
  if (!_runtime) {
    throw new Error("[openclawwechat] Runtime not initialized");
  }
  return _runtime;
}
