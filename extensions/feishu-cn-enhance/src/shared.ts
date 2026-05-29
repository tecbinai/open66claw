/**
 * Shared utilities for feishu-cn-enhance.
 *
 * DESIGN: We intentionally inline minimal account resolution and client
 * creation logic here instead of cross-plugin relative imports like
 * `../../feishu/src/accounts.js`. This makes the plugin resilient to:
 *   - upstream feishu plugin directory restructuring
 *   - Lark SDK instance isolation (separate node_modules)
 *   - plugin loading order changes
 *
 * The trade-off is a small amount of duplicated logic, but it eliminates
 * a fragile coupling that could break silently on upstream upgrades.
 */

import * as Lark from "@larksuiteoapi/node-sdk";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";

// ── Types ──────────────────────────────────────────────────

type FeishuDomain = "feishu" | "lark" | (string & {});

type FeishuAccountLike = {
  accountId: string;
  appId?: string;
  appSecret?: string;
  domain: FeishuDomain;
};

// ── Client cache (per-account, same approach as upstream) ──

const clientCache = new Map<string, { client: Lark.Client; key: string }>();

function resolveDomain(domain: FeishuDomain | undefined): Lark.Domain | string {
  if (domain === "lark") return Lark.Domain.Lark;
  if (domain === "feishu" || !domain) return Lark.Domain.Feishu;
  return domain.replace(/\/+$/, "");
}

function buildClient(account: FeishuAccountLike): Lark.Client {
  const { accountId, appId, appSecret, domain } = account;
  if (!appId || !appSecret) {
    throw new Error(`Feishu credentials not configured for account "${accountId}"`);
  }
  const key = `${appId}:${appSecret}:${domain}`;
  const cached = clientCache.get(accountId);
  if (cached && cached.key === key) return cached.client;

  const client = new Lark.Client({
    appId,
    appSecret,
    appType: Lark.AppType.SelfBuild,
    domain: resolveDomain(domain),
  });
  clientCache.set(accountId, { client, key });
  return client;
}

// ── Account resolution (read from OpenClaw config) ─────────

function resolveAccount(cfg: Record<string, any>, accountId?: string): FeishuAccountLike {
  const feishuCfg = cfg?.channels?.feishu ?? {};
  const id = accountId ?? feishuCfg.defaultAccount ?? "default";

  // Try named account first, fall back to top-level fields
  const accountCfg = feishuCfg.accounts?.[id] ?? {};
  const appId = String(accountCfg.appId ?? feishuCfg.appId ?? "").trim() || undefined;
  const appSecret = String(accountCfg.appSecret ?? feishuCfg.appSecret ?? "").trim() || undefined;
  const domain: FeishuDomain = accountCfg.domain ?? feishuCfg.domain ?? "feishu";

  return { accountId: id, appId, appSecret, domain };
}

function listEnabledAccounts(cfg: Record<string, any>): FeishuAccountLike[] {
  const feishuCfg = cfg?.channels?.feishu;
  if (!feishuCfg || feishuCfg.enabled === false) return [];

  const accountIds = feishuCfg.accounts ? Object.keys(feishuCfg.accounts) : ["default"];

  return accountIds.map((id) => resolveAccount(cfg, id)).filter((a) => a.appId && a.appSecret);
}

// ── Public API ─────────────────────────────────────────────

/**
 * Resolve account + build client in one step (for tool execute functions).
 */
export function getToolClient(
  api: Pick<OpenClawPluginApi, "config">,
  accountId?: string,
): Lark.Client {
  if (!api.config) throw new Error("Config unavailable");
  const account = resolveAccount(api.config as any, accountId);
  return buildClient(account);
}

/**
 * Check whether at least one feishu account is enabled & configured.
 */
export function hasEnabledFeishuAccounts(
  api: Pick<OpenClawPluginApi, "config" | "logger">,
): boolean {
  if (!api.config) return false;
  return listEnabledAccounts(api.config as any).length > 0;
}

/** JSON tool-result helper. */
export function json(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    details: data,
  };
}
