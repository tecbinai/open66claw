/**
 * MCP Marketplace — 注册入口
 * CN-ONLY FILE — 不影响上游 OpenClaw
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { Catalog } from "./catalog.js";
import { registerMarketplaceHandlers } from "./handlers.js";
import { LocalSource } from "./local-source.js";
import { Marketplace } from "./marketplace.js";

/**
 * 注册 MCP 市场到 cn-adapter 插件。
 * 在 cn-adapter/index.ts 中调用：registerMcpMarketplace(api)
 */
export function registerMcpMarketplace(api: OpenClawPluginApi): void {
  const source = new LocalSource();
  const catalog = new Catalog(source);
  const marketplace = new Marketplace(catalog);

  registerMarketplaceHandlers(api, catalog, marketplace);
}
