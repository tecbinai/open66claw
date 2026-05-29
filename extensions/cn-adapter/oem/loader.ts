import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createCnLogger } from "../utils/index.js";
import type { OemBrandConfig, BrandLoadResult } from "./types.js";
import { validateBrandConfig } from "./types.js";

const log = createCnLogger("oem");

/** 当前文件所在目录 — 用于定位内置 brands/ */
const OEM_DIR = dirname(fileURLToPath(import.meta.url));

/** 内置品牌目录 */
const BUILTIN_BRANDS_DIR = join(OEM_DIR, "brands");

/**
 * 解析用户自定义品牌目录。
 * 优先级：环境变量 > 默认路径 (~/.openclawcn/oem/)
 */
export function resolveCustomBrandsDir(): string {
  if (process.env.OPENCLAW_OEM_DIR) {
    return process.env.OPENCLAW_OEM_DIR;
  }
  const home = process.env.HOME || process.env.USERPROFILE || "";
  return join(home, ".openclawcn", "oem");
}

/**
 * 加载品牌配置。
 *
 * 查找顺序：
 * 1. 用户自定义目录 (~/.openclawcn/oem/<brandId>.json)
 * 2. 插件内置目录 (oem/brands/<brandId>.json)
 *
 * @param brandId - 品牌 ID，默认 "default"
 * @returns 加载结果（含品牌配置、来源、路径）
 */
export function loadBrand(brandId = "default"): BrandLoadResult {
  // 安全检查: brandId 只允许字母、数字、连字符、下划线
  if (!/^[a-zA-Z0-9_-]+$/.test(brandId)) {
    throw new Error(
      `Invalid brand ID: "${brandId}" (only alphanumeric, hyphen, underscore allowed)`,
    );
  }

  const fileName = `${brandId}.json`;

  // 1. 尝试用户自定义目录
  const customDir = resolveCustomBrandsDir();
  const customPath = join(customDir, fileName);
  if (existsSync(customPath)) {
    const brand = loadBrandFile(customPath);
    log.info(`已加载自定义品牌: ${brand.name} (${customPath})`);
    return { brand, source: "custom", path: customPath };
  }

  // 2. 回退到内置目录
  const builtinPath = join(BUILTIN_BRANDS_DIR, fileName);
  if (existsSync(builtinPath)) {
    const brand = loadBrandFile(builtinPath);
    log.info(`已加载内置品牌: ${brand.name}`);
    return { brand, source: "builtin", path: builtinPath };
  }

  // 3. 都没有 → 加载 default.json 作为 fallback
  if (brandId !== "default") {
    log.warn(`品牌 "${brandId}" 未找到，回退到 default`);
    return loadBrand("default");
  }

  throw new Error("内置默认品牌 default.json 缺失，插件安装可能不完整");
}

/**
 * 从文件加载并校验品牌配置。
 */
function loadBrandFile(filePath: string): OemBrandConfig {
  const raw = JSON.parse(readFileSync(filePath, "utf-8"));

  if (!validateBrandConfig(raw)) {
    throw new Error(`品牌配置校验失败: ${filePath} (缺少必须字段: id, name, displayName, version)`);
  }

  // 补全可选字段的默认值
  return applyDefaults(raw);
}

/** 补全可选字段 */
function applyDefaults(brand: OemBrandConfig): OemBrandConfig {
  return {
    ...brand,
    identity: {
      oemId: brand.id,
      identifier: "",
      apiBaseUrl: "",
      ...brand.identity,
    },
    defaults: {
      locale: "zh-CN",
      mirror: {},
      ...brand.defaults,
    },
    ui: {
      primaryColor: "#1677ff",
      ...brand.ui,
    },
  };
}
