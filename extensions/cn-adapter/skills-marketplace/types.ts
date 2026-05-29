/**
 * Skills Marketplace Types
 * CN-ONLY FILE — SQLite 存储层类型定义
 */

// ============================================================================
// Core Item Type
// ============================================================================

/** Skills marketplace 条目（SQLite 行的 TS 映射） */
export interface SkillMarketplaceItem {
  /** 技能唯一标识 */
  skillId: string;
  /** 英文名称 */
  name: string;
  /** 中文名称 */
  nameCn?: string;
  /** 英文描述 */
  description: string;
  /** 中文描述 */
  descriptionCn?: string;
  /** 分类 */
  category?: string;
  /** 标签列表 */
  tags?: string[];
  /** Emoji 图标 */
  emoji?: string;
  /** 作者 */
  author?: string;
  /** 版本号 */
  version?: string;
  /** 下载路径 */
  path: string;

  // QC 质控字段
  /** 质量分级: "S" | "A" | "B" | "C" */
  tier?: string;
  /** QC 评分 0-10 */
  overallScore?: number;
  /** 是否在中国被封锁 */
  cnBlocked?: boolean;
  /** CN 替代方案 */
  cnAlternative?: string;
  /** 是否有中文翻译 */
  hasTranslation?: boolean;

  // 安装状态
  /** 是否已安装到本地 */
  installed?: boolean;

  // 元数据
  /** 数据来源: 'proxy' | 'bundled' | 'qc' | 'availability-dict' */
  source?: string;
  /** ProxySkillMeta.version（用于增量同步） */
  proxyVersion?: number;
  /** 文件 SHA256 hash */
  sha256?: string;
  /** 文件大小（字节） */
  sizeBytes?: number;
}

// ============================================================================
// Search Types
// ============================================================================

/** 搜索选项 */
export interface SkillSearchOptions {
  /** 关键词（FTS5 全文搜索） */
  keyword?: string;
  /** 分类精确匹配 */
  category?: string;
  /** 质量分级过滤 */
  tier?: string;
  /** 是否在中国被封锁 */
  cnBlocked?: boolean;
  /** 是否已安装 */
  installed?: boolean;
  /** 数据来源过滤 */
  source?: "proxy" | "qc" | "availability-dict" | "local";
  /** 排序字段 */
  orderBy?: "updated_at" | "overall_score" | "name" | "downloads";
  /** 排序方向 */
  orderDirection?: "ASC" | "DESC";
  /** 分页：页码（从 1 开始） */
  page?: number;
  /** 分页：每页数量（1-100） */
  pageSize?: number;
}

/** 搜索结果（分页） */
export interface SkillSearchResult {
  items: SkillMarketplaceItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ============================================================================
// QC Types
// ============================================================================

/** QC 质控索引中的单个 skill 条目 */
export interface QcSkillEntry {
  name: string;
  description?: string;
  descriptionZh?: string;
  path: string;
  tier: string;
  overallScore: number;
  category: string;
  tags?: string[];
  cnBlocked: boolean;
  cnAlternative: string;
  hasTranslation: boolean;
}

/** QC 质控索引文件结构 */
export interface QcSkillsIndex {
  schemaVersion: number;
  generatedAt: string;
  pipelineVersion: string;
  stats: {
    totalScanned: number;
    finalAccepted: number;
    tierDistribution: Record<string, number>;
  };
  skills: QcSkillEntry[];
}
