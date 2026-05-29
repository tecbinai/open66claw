import type { CnPluginConfig } from "./cn-config.js";

export function createSearchFallbackHandler(getConfig: () => CnPluginConfig) {
  return async (event: { toolName: string; params: Record<string, unknown> }) => {
    if (event.toolName !== "web_search") return undefined;

    const config = getConfig();
    if (config.searchApiKey) return undefined;

    const query = typeof event.params.query === "string" ? event.params.query : "";
    const encodedQuery = encodeURIComponent(query);

    return {
      block: true,
      blockReason:
        `[cn-adapter] 未配置搜索 API key，请手动在浏览器中搜索：` +
        `https://www.bing.com/search?q=${encodedQuery}` +
        ` 或 https://www.baidu.com/s?wd=${encodedQuery}`,
    };
  };
}
