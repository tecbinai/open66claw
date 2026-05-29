import type { PluginRuntime } from "openclaw/plugin-sdk/core";

let _runtime: PluginRuntime | null = null;

export function setDingtalkRuntime(runtime: PluginRuntime): void {
  _runtime = runtime;
}

export function getDingtalkRuntime(): PluginRuntime {
  if (!_runtime) {
    throw new Error("[dingtalk] Runtime not initialized");
  }
  return _runtime;
}
