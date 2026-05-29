/** 构建时注入的版本标识。"cn" = 内销（默认），"overseas" = 外销去标 */
export const EDITION: "cn" | "overseas" =
  (import.meta.env.VITE_EDITION as string) === "overseas" ? "overseas" : "cn";

export const isCN = EDITION === "cn";
export const isOverseas = EDITION === "overseas";

// ============================================================================
// Edition Section Visibility — 构建时 UI 区域门控
// ============================================================================

/**
 * 版本级 UI 区域可见性 key。
 * 控制不同版本包中哪些 UI 区域可见。
 *
 * 新增门控区域：在此 union 中加一个 key，然后加到对应的 SECTIONS set 即可。
 */
export type EditionSection =
  | "channels.domestic" // 渠道页-国内渠道组
  | "channels.international" // 渠道页-国际渠道组
  | "providers.cn" // 模型设置-国内服务商组
  | "providers.intl" // model provider group
;

/** 国内包可见的 UI 区域（不含国际渠道/服务商，合规要求） */
const CN_SECTIONS = new Set<EditionSection>([
  "channels.domestic",
  "providers.cn",
]);

/** 国际包可见的 UI 区域（全开） */
const OVERSEAS_SECTIONS = new Set<EditionSection>([
  "channels.domestic",
  "channels.international",
  "providers.cn",
  "providers.intl",
]);

/** 当前构建版本的可见区域集合 */
export const editionSections: ReadonlySet<EditionSection> =
  EDITION === "overseas" ? OVERSEAS_SECTIONS : CN_SECTIONS;

/** 检查某 UI 区域在当前构建版本是否可见 */
export function editionVisible(section: EditionSection): boolean {
  return editionSections.has(section);
}

