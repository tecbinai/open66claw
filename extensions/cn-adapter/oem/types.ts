/**
 * OEM 品牌配置类型定义。
 *
 * 参考 clawdbot config/oem/oem-template.json 的基础标识 + defaults 部分。
 * UI 相关字段（31 个）留待 Phase C7 UI 系统搭建后补充。
 */

/** 基础标识 — OEM 追溯 */
export interface OemIdentity {
  /** OEM 标识符（纯字母数字连字符，如 "openclawcn"） */
  oemId: string;
  /** Tauri bundle identifier（如 "com.openclawcn.desktop"） */
  identifier: string;
  /** API 基础地址 */
  apiBaseUrl: string;
}

/** 默认值配置 */
export interface OemDefaults {
  /** 默认语言 */
  locale: string;
  /** 镜像源 */
  mirror: {
    npm?: string;
    pip?: string;
  };
}

/** UI 品牌配置（预留，Phase C7 填充） */
export interface OemUi {
  /** 主题色 */
  primaryColor?: string;
  /** Logo 路径（相对于 assets/） */
  logoPath?: string;
  /** 产品名 */
  productName?: string;
  /** 窗口标题 */
  windowTitle?: string;
}

/** 完整的 OEM 品牌配置 */
export interface OemBrandConfig {
  /** OEM 基础标识 */
  id: string;
  name: string;
  displayName: string;
  version: string;
  description: string;

  /** 基础标识 — OEM 追溯 */
  identity: OemIdentity;

  /** 默认配置 */
  defaults: OemDefaults;

  /** UI 品牌（预留） */
  ui: OemUi;
}

/** 品牌加载结果 */
export interface BrandLoadResult {
  brand: OemBrandConfig;
  /** 加载来源: "custom" = 用户目录, "builtin" = 插件内置 */
  source: "custom" | "builtin";
  /** 品牌配置文件路径 */
  path: string;
}

/**
 * 校验 OEM 品牌配置 JSON 的最小字段要求。
 * 不使用 zod 等库，保持零依赖。
 */
export function validateBrandConfig(raw: unknown): raw is OemBrandConfig {
  if (raw == null || typeof raw !== "object") return false;
  const obj = raw as Record<string, unknown>;

  // 必须字段
  if (typeof obj.id !== "string" || obj.id.length === 0) return false;
  if (typeof obj.name !== "string" || obj.name.length === 0) return false;
  if (typeof obj.displayName !== "string") return false;
  if (typeof obj.version !== "string") return false;

  // identity
  if (obj.identity != null && typeof obj.identity !== "object") return false;

  // defaults
  if (obj.defaults != null && typeof obj.defaults !== "object") return false;

  return true;
}
