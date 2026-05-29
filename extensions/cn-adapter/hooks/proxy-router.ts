import { createCnLogger } from "../utils/index.js";
import type { CnPluginConfig } from "./cn-config.js";

const log = createCnLogger("proxy");

/** CN 域名默认不走代理 */
export const DEFAULT_NO_PROXY = [
  "*.baidu.com",
  "*.aliyuncs.com",
  "*.tencentcloudapi.com",
  "*.volcengineapi.com",
  "*.zhipuai.cn",
  "*.moonshot.cn",
  "*.siliconflow.cn",
  "*.gitee.com",
  "*.npmmirror.com",
];

/**
 * 判断给定域名是否应绕过代理。
 *
 * 支持通配符匹配：`*.example.com` 匹配 `api.example.com`，
 * 精确域名 `example.com` 只匹配 `example.com`。
 */
export function shouldBypassProxy(hostname: string, noProxyList: string[]): boolean {
  const lower = hostname.toLowerCase();
  for (const pattern of noProxyList) {
    const p = pattern.toLowerCase();
    if (p.startsWith("*.")) {
      // 通配符：*.example.com 匹配任何以 .example.com 结尾的域名
      const suffix = p.slice(1); // ".example.com"
      if (lower.endsWith(suffix) || lower === p.slice(2)) {
        return true;
      }
    } else if (lower === p) {
      return true;
    }
  }
  return false;
}

/**
 * 创建代理路由处理函数。
 *
 * 根据 CnPluginConfig.proxy 配置决定是否绕过代理：
 * - proxy.enabled = false → 跳过（不做任何处理）
 * - proxy.noProxy 列表 + DEFAULT_NO_PROXY → shouldBypassProxy 判断
 *
 * 返回一个函数，接受 hostname 返回是否应绕过代理。
 */
export function createProxyRouterHandler(getConfig: () => CnPluginConfig) {
  return (hostname: string): boolean | undefined => {
    const config = getConfig();
    const proxy = config.proxy;

    // 代理未启用，不做路由判断
    if (!proxy?.enabled) {
      return undefined;
    }

    const noProxyList = [...DEFAULT_NO_PROXY, ...(proxy.noProxy ?? [])];

    const bypass = shouldBypassProxy(hostname, noProxyList);
    if (bypass) {
      log.debug(`${hostname} 匹配 noProxy 规则，绕过代理`);
    }

    return bypass;
  };
}
