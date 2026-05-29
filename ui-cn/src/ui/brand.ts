/**
 * OEM Brand Configuration
 *
 * 所有 UI 层的品牌标识集中在此文件。
 * 构建时通过 VITE_EDITION 环境变量选择品牌配置：
 *   - "cn"       → CN 品牌（66Claw）
 *   - "overseas"  → OEM 白牌（通用 AI 助手）
 *
 * OEM 客户可以直接修改 overseas 配置实现自定义品牌。
 */

export interface BrandConfig {
  /** 产品名称（显示在顶栏 logo 旁） */
  productName: string;
  /** 产品短名 */
  productShortName: string;
  /** 欢迎页标题 */
  welcomeTitle: string;
  /** 窗口标题 */
  windowTitle: string;
  /** meta description */
  metaDescription: string;
  /** 品牌标语（logo 旁副标题） */
  tagline: string;

  /** 品牌推广链接 URL（顶栏 & 侧栏底部），空字符串表示不显示 */
  promoUrl: string;
  /** 品牌推广名称 */
  promoName: string;
  /** 品牌推广描述 */
  promoDesc: string;

  /** 是否显示购买/续费入口（闲鱼等） */
  showPurchaseEntry: boolean;
  /** 是否显示技术支持二维码 */
  showSupportQrcode: boolean;
  /** 是否显示 adaptation notice（Windows 快速迭代提示） */
  showAdaptationNotice: boolean;

  /** logo 图片路径 */
  logoPath: string;
  /** logo alt 文本 */
  logoAlt: string;
  /**
   * 横版 banner 图路径（OEM用）
   * 有值时：顶栏 brand 区块直接渲染此图，忽略 logoPath + productName + tagline
   * 空字符串：走默认 logo+文字 布局
   */
  bannerPath: string;
  /** CLI 命令名 */
  cliName: string;
  /** 配置文件名 */
  configFileName: string;

  /** 自定义事件前缀（如 "openclawcn:" → "app:"） */
  eventPrefix: string;
  /** localStorage key 前缀 */
  storagePrefix: string;

  /** 技能安装镜像提示 */
  skillMirrorHint: string;
  /** 技能安装专属功能标题 */
  skillExclusiveTitle: string;
  /** 免费模型标签 */
  freeModelsEyebrow: string;
  /** 批量安装加速标签 */
  batchMirrorBadge: string;
}

/** CN 品牌（小圆claw，默认） */
const xiaoyuanBrand: BrandConfig = {
  productName: "小圆claw",
  productShortName: "66claw",
  welcomeTitle: "Hi  有什么我可以帮到你的吗?",
  windowTitle: "66claw",
  metaDescription: "66claw - 智能 AI 助手",
  tagline: "",

  promoUrl: "",
  promoName: "",
  promoDesc: "",

  showPurchaseEntry: true,
  showSupportQrcode: true,
  showAdaptationNotice: true,

  logoPath: "/oem/xiaoyuan/logo_main.png",
  logoAlt: "小圆claw",
  bannerPath: "",
  cliName: "66claw",
  configFileName: "66claw.json",

  eventPrefix: "openclawcn:",
  storagePrefix: "openclawcn.",

  skillMirrorHint: "需要国内技能镜像？请按 SkillHub 安装指南配置：https://skillhub.cn/install/skillhub.md",
  skillExclusiveTitle: "SkillHub 中国镜像服务",
  freeModelsEyebrow: "本地配置",
  batchMirrorBadge: "SkillHub 镜像",
};

/** WoClaw 品牌 */
const woclawBrand: BrandConfig = {
  productName: "WoClaw",
  productShortName: "woclaw",
  welcomeTitle: "Hi  有什么我可以帮到你的吗?",
  windowTitle: "WoClaw",
  metaDescription: "WoClaw - 智能 AI 助手",
  tagline: "",

  promoUrl: "",
  promoName: "",
  promoDesc: "",

  showPurchaseEntry: true,
  showSupportQrcode: true,
  showAdaptationNotice: true,

  logoPath: "/oem/woclaw/logo_main.png",
  logoAlt: "WoClaw",
  bannerPath: "",
  cliName: "woclaw",
  configFileName: "woclaw.json",

  eventPrefix: "openclawcn:",
  storagePrefix: "openclawcn.",

  skillMirrorHint: "需要国内技能镜像？请按 SkillHub 安装指南配置：https://skillhub.cn/install/skillhub.md",
  skillExclusiveTitle: "SkillHub 中国镜像服务",
  freeModelsEyebrow: "本地配置",
  batchMirrorBadge: "SkillHub 镜像",
};

/** 66Claw 标准品牌（默认，无 OEM_ID 时使用） */
const sixtysixtclawBrand: BrandConfig = {
  productName: "66Claw",
  productShortName: "66claw",
  welcomeTitle: "Hi  有什么我可以帮到你的吗?",
  windowTitle: "66Claw",
  metaDescription: "66Claw - 智能 AI 助手",
  tagline: "",

  promoUrl: "",
  promoName: "",
  promoDesc: "",

  showPurchaseEntry: false,
  showSupportQrcode: true,
  showAdaptationNotice: true,

  logoPath: "/logo_66_main.png",
  logoAlt: "66Claw",
  bannerPath: "",
  cliName: "66claw",
  configFileName: "66claw.json",

  eventPrefix: "openclawcn:",
  storagePrefix: "openclawcn.",

  skillMirrorHint: "需要国内技能镜像？请按 SkillHub 安装指南配置：https://skillhub.cn/install/skillhub.md",
  skillExclusiveTitle: "SkillHub 中国镜像服务",
  freeModelsEyebrow: "本地配置",
  batchMirrorBadge: "SkillHub 镜像",
};

// ─── CN OEM 品牌映射（构建时通过 VITE_OEM_ID 选择） ────────────────────────
declare const __VITE_OEM_ID__: string | undefined;
const _oemId = typeof __VITE_OEM_ID__ !== "undefined" ? __VITE_OEM_ID__ : "";
const cnOemBrands: Record<string, BrandConfig> = {
  xiaoyuan: xiaoyuanBrand,
  woclaw: woclawBrand,
};
const cnBrand: BrandConfig = cnOemBrands[_oemId] || sixtysixtclawBrand;

// ─── OEM define constants (injected by vite.config.ts for VITE_EDITION=overseas) ──────────
// These are replaced at build time. Fallback values are used in dev / cn builds.
declare const __OEM_BRAND_PRODUCTNAME__: string | undefined;
declare const __OEM_BRAND_PRODUCTSHORTNAME__: string | undefined;
declare const __OEM_BRAND_WELCOMETITLE__: string | undefined;
declare const __OEM_BRAND_WINDOWTITLE__: string | undefined;
declare const __OEM_BRAND_METADESCRIPTION__: string | undefined;
declare const __OEM_BRAND_TAGLINE__: string | undefined;
declare const __OEM_BRAND_PROMOURL__: string | undefined;
declare const __OEM_BRAND_PROMONAME__: string | undefined;
declare const __OEM_BRAND_PROMODESC__: string | undefined;
declare const __OEM_BRAND_SHOWPURCHASEENTRY__: boolean | undefined;
declare const __OEM_BRAND_SHOWSUPPORTQRCODE__: boolean | undefined;
declare const __OEM_BRAND_SHOWADAPTATIONNOTICE__: boolean | undefined;
declare const __OEM_BRAND_LOGOPATH__: string | undefined;
declare const __OEM_BRAND_BANNERPATH__: string | undefined;
declare const __OEM_BRAND_SKILLMIRRORHINT__: string | undefined;
declare const __OEM_BRAND_SKILLEXCLUSIVETITLE__: string | undefined;
declare const __OEM_BRAND_FREEMODELSEYEBROW__: string | undefined;
declare const __OEM_BRAND_BATCHMIRRORBADGE__: string | undefined;

function oemStr(val: string | undefined, fallback: string): string {
  return typeof val !== "undefined" ? val : fallback;
}
function oemBool(val: boolean | undefined, fallback: boolean): boolean {
  return typeof val !== "undefined" ? val : fallback;
}

/** OEM 白牌（字段值由 config/oem/<OEM_ID>.json 注入，通过 Vite define 在构建时替换） */
const overseasBrand: BrandConfig = {
  productName: oemStr(__OEM_BRAND_PRODUCTNAME__, "66Claw"),
  productShortName: oemStr(__OEM_BRAND_PRODUCTSHORTNAME__, "66Claw"),
  welcomeTitle: oemStr(__OEM_BRAND_WELCOMETITLE__, "Welcome to 66Claw"),
  windowTitle: oemStr(__OEM_BRAND_WINDOWTITLE__, "66Claw"),
  metaDescription: oemStr(__OEM_BRAND_METADESCRIPTION__, "66Claw - AI Assistant"),
  tagline: oemStr(__OEM_BRAND_TAGLINE__, ""),

  promoUrl: oemStr(__OEM_BRAND_PROMOURL__, ""),
  promoName: oemStr(__OEM_BRAND_PROMONAME__, ""),
  promoDesc: oemStr(__OEM_BRAND_PROMODESC__, ""),

  showPurchaseEntry: oemBool(__OEM_BRAND_SHOWPURCHASEENTRY__, false),
  showSupportQrcode: oemBool(__OEM_BRAND_SHOWSUPPORTQRCODE__, false),
  showAdaptationNotice: oemBool(__OEM_BRAND_SHOWADAPTATIONNOTICE__, false),

  logoPath: oemStr(__OEM_BRAND_LOGOPATH__, "/logo.png"),
  logoAlt: "66Claw",
  bannerPath: oemStr(__OEM_BRAND_BANNERPATH__, "/oem-banner.png"),
  cliName: "openclawcn",
  configFileName: "openclawcn.json",
  eventPrefix: "openclawcn:",
  storagePrefix: "openclawcn.",

  skillMirrorHint: oemStr(__OEM_BRAND_SKILLMIRRORHINT__, ""),
  skillExclusiveTitle: oemStr(__OEM_BRAND_SKILLEXCLUSIVETITLE__, ""),
  freeModelsEyebrow: oemStr(__OEM_BRAND_FREEMODELSEYEBROW__, ""),
  batchMirrorBadge: oemStr(__OEM_BRAND_BATCHMIRRORBADGE__, ""),
};

// ─── Runtime selection ────────────────────────────────────────────────────────

import { EDITION, isOverseas } from "./edition";

/** 当前构建使用的品牌配置 */
export const brand: BrandConfig = EDITION === "overseas" ? overseasBrand : cnBrand;

// OEM 模式：初始化时设置 HTML 文档标题和 meta
if (isOverseas && typeof document !== "undefined") {
  document.title = brand.windowTitle;
  const meta = document.querySelector('meta[name="description"]');
  if (meta) {meta.setAttribute("content", brand.metaDescription);}
}
