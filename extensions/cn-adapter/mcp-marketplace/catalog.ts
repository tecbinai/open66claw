/**
 * Catalog — 数据查询 list/search/getById/recommend
 * CN-ONLY FILE — 不影响上游 OpenClaw
 *
 * 从 DataSource 读取分页数据，合并 .mcp.json 安装状态。
 */

import { getInstalledIds, getServer } from "./mcp-config.js";
import type { McpDataSource } from "./source.js";
import type {
  McpMarketplaceItem,
  MarketplaceListParams,
  MarketplaceListResult,
  CatalogMeta,
} from "./types.js";

export class Catalog {
  private source: McpDataSource;

  constructor(source: McpDataSource) {
    this.source = source;
  }

  /**
   * 列表/翻页/分类 — 直接读分页文件。
   * 搜索 — 读 search-index 匹配后从对应分页文件取完整数据。
   */
  async list(params: MarketplaceListParams): Promise<MarketplaceListResult> {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 50));
    const category = params.category && params.category !== "all" ? params.category : "all";

    // 搜索走索引
    if (params.search?.trim()) {
      return this.search(params.search.trim(), category, page, pageSize);
    }

    // 分类分页
    const meta = await this.source.loadMeta();
    const catMeta = meta.categories[category];
    if (!catMeta) {
      return { items: [], total: 0, page, pageSize, totalPages: 0 };
    }

    const items = await this.source.loadPage(category, page);
    const merged = this.mergeInstallStatus(items);

    return {
      items: merged,
      total: catMeta.count,
      page,
      pageSize,
      totalPages: catMeta.pages,
    };
  }

  /**
   * 搜索 — 加载搜索索引，内存过滤，再从分页文件取完整数据。
   */
  private async search(
    keyword: string,
    category: string,
    page: number,
    pageSize: number,
  ): Promise<MarketplaceListResult> {
    const index = await this.source.loadSearchIndex();
    const lower = keyword.toLowerCase();

    // 过滤
    let matched = index.filter((entry) => {
      const nameMatch = entry.n.toLowerCase().includes(lower);
      const descMatch = entry.d.toLowerCase().includes(lower);
      const tagMatch = entry.t.some((t) => t.toLowerCase().includes(lower));
      const idMatch = entry.id.toLowerCase().includes(lower);
      return nameMatch || descMatch || tagMatch || idMatch;
    });

    // 分类过滤
    if (category !== "all") {
      matched = matched.filter((entry) => entry.c === category);
    }

    const total = matched.length;
    const totalPages = Math.ceil(total / pageSize);
    const start = (page - 1) * pageSize;
    const pageIds = matched.slice(start, start + pageSize).map((e) => e.id);

    // 从分页文件获取完整数据
    const items: McpMarketplaceItem[] = [];
    for (const id of pageIds) {
      const item = await this.source.getById(id);
      if (item) items.push(item);
    }

    return {
      items: this.mergeInstallStatus(items),
      total,
      page,
      pageSize,
      totalPages,
    };
  }

  /**
   * 按 serverId 获取单条完整数据。
   */
  async getById(serverId: string): Promise<McpMarketplaceItem | null> {
    const item = await this.source.getById(serverId);
    if (!item) return null;
    return this.mergeInstallStatus([item])[0];
  }

  /**
   * 推荐 — 按 securityScore 排序取 top N。
   */
  async recommend(count = 10): Promise<McpMarketplaceItem[]> {
    const firstPage = await this.source.loadPage("all", 1);
    // 数据已按 chinaFriendlyScore 排序，直接取前 N 条
    const items = firstPage.slice(0, count);
    return this.mergeInstallStatus(items);
  }

  /**
   * 获取分类元数据。
   */
  async getMeta(): Promise<CatalogMeta> {
    return this.source.loadMeta();
  }

  /**
   * 清缓存（mcp.sync 时调用）。
   */
  clearCache(): void {
    if ("clearCache" in this.source && typeof this.source.clearCache === "function") {
      (this.source as { clearCache: () => void }).clearCache();
    }
  }

  /**
   * 合并 .mcp.json 中的安装状态。
   */
  private mergeInstallStatus(items: McpMarketplaceItem[]): McpMarketplaceItem[] {
    const installed = getInstalledIds();
    return items.map((item) => {
      if (installed.has(item.serverId)) {
        const config = getServer(item.serverId);
        return {
          ...item,
          installStatus: "installed" as const,
          installedVersion: item.version,
          hasUpdate: false,
        };
      }
      return { ...item, installStatus: "not_installed" as const };
    });
  }
}
