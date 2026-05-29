import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { safeGateway } from "../utils/index.js";
import { createCnLogger } from "../utils/index.js";
import { loadBrand } from "./loader.js";
import type { OemBrandConfig } from "./types.js";

const log = createCnLogger("oem");

/** 全局品牌缓存（进程生命周期内不变） */
let cachedBrand: OemBrandConfig | null = null;

/** _dist/oem.json runtime 数据（stage-dist.sh 写入） */
interface OemRuntime { oemId: string; displayName: string }

/**
 * 读取 _dist/oem.json runtime 配置。
 * stage-dist.sh 在 OEM 构建时写入此文件，包含 oemId / displayName。
 */
function loadOemRuntime(): Partial<OemRuntime> {
  const candidates = [
    join(process.cwd(), "oem.json"),             // Tauri sidecar CWD = _dist/
    join(process.cwd(), "_dist", "oem.json"),     // dev 模式下 CWD = 项目根
  ];
  for (const p of candidates) {
    try {
      if (existsSync(p)) {
        const data = JSON.parse(readFileSync(p, "utf-8"));
        if (data.oemId) {
          log.info(`从 ${p} 读取 OEM runtime: oemId=${data.oemId}, displayName=${data.displayName}`);
          return data;
        }
      }
    } catch { /* ignore */ }
  }
  return {};
}

/**
 * 获取当前品牌配置（带缓存）。
 * 品牌在进程启动时加载一次，之后不再重读文件。
 *
 * 优先级：环境变量 OEM_ID > _dist/oem.json > "default"
 * 如果 _dist/oem.json 存在（OEM 构建产物），用其 displayName 覆盖 brand 配置。
 */
export function getCurrentBrand(): OemBrandConfig {
  if (!cachedBrand) {
    const runtimeOem = loadOemRuntime();
    const brandId = process.env.OEM_ID || runtimeOem.oemId || "default";
    const result = loadBrand(brandId);
    cachedBrand = result.brand;

    // OEM runtime 覆盖：displayName / oemId 以 oem.json 为准
    if (runtimeOem.displayName) {
      cachedBrand = { ...cachedBrand, displayName: runtimeOem.displayName };
    }
    if (runtimeOem.oemId) {
      cachedBrand = {
        ...cachedBrand,
        identity: { ...cachedBrand.identity, oemId: runtimeOem.oemId },
      };
    }
  }
  return cachedBrand;
}

/** 仅用于测试：重置品牌缓存 */
export function _resetBrandCache(): void {
  cachedBrand = null;
}

/**
 * 注册品牌相关的 gateway methods。
 *
 * - cn.branding.get — 返回当前品牌完整配置
 * - cn.branding.identity — 返回基础标识信息
 *
 * 在 index.ts 的 register() 中直接调用（不需要 hook）。
 */
export function registerBrandingGateway(api: OpenClawPluginApi): void {
  const brand = getCurrentBrand();

  api.registerGatewayMethod(
    "cn.branding.get",
    safeGateway("cn.branding.get", async ({ respond }) => {
      respond(true, {
        id: brand.id,
        name: brand.name,
        displayName: brand.displayName,
        version: brand.version,
        description: brand.description,
        identity: brand.identity,
        defaults: brand.defaults,
        ui: brand.ui,
      });
    }),
  );

  api.registerGatewayMethod(
    "cn.branding.identity",
    safeGateway("cn.branding.identity", async ({ respond }) => {
      respond(true, brand.identity);
    }),
  );

  log.info(`品牌已加载: ${brand.displayName} (${brand.id})`);
}
