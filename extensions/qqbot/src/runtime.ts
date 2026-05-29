import type { PluginRuntime } from "openclaw/plugin-sdk/core";

let _runtime: PluginRuntime | null = null;

export function setQqbotRuntime(runtime: PluginRuntime): void {
  _runtime = runtime;
}

export function getQqbotRuntime(): PluginRuntime {
  if (!_runtime) {
    throw new Error("[qqbot] Runtime not initialized");
  }
  return _runtime;
}
