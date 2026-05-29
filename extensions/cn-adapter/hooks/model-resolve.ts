import type { CnPluginConfig } from "./cn-config.js";

export function createModelResolveHandler(getConfig: () => CnPluginConfig) {
  return async (_event: { prompt: string }) => {
    const config = getConfig();
    const modelConfig = config.models;
    if (!modelConfig?.default) {
      return undefined;
    }
    return {
      modelOverride: modelConfig.default.model,
      providerOverride: modelConfig.default.provider,
    };
  };
}
