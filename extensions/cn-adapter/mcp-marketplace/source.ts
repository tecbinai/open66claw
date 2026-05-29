/**
 * DataSource Interface — 可插拔数据源
 * CN-ONLY FILE — 不影响上游 OpenClaw
 */

import type { McpMarketplaceItem, CatalogMeta, SearchIndexEntry } from "./types.js";

/**
 * 可插拔数据源接口。
 * 当前实现：LocalSource（读本地分页 JSON）
 * 未来扩展：RemoteSource（接国内镜像站 API）
 */
export interface McpDataSource {
  /** 数据源标识 */
  readonly id: string;

  /** 加载分类元数据 */
  loadMeta(): Promise<CatalogMeta>;

  /** 加载指定分类的指定页 */
  loadPage(category: string, page: number): Promise<McpMarketplaceItem[]>;

  /** 加载搜索索引（懒加载，首次调用后缓存） */
  loadSearchIndex(): Promise<SearchIndexEntry[]>;

  /** 按 serverId 获取单条 */
  getById(serverId: string): Promise<McpMarketplaceItem | null>;
}
