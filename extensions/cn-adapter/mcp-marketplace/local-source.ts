/**
 * Local DataSource — 读本地预生成的分页 JSON 文件
 * CN-ONLY FILE — 不影响上游 OpenClaw
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { McpDataSource } from "./source.js";
import type { McpMarketplaceItem, CatalogMeta, SearchIndexEntry } from "./types.js";

export class LocalSource implements McpDataSource {
  readonly id = "local";
  private dataDir: string;
  private metaCache: CatalogMeta | null = null;
  private searchIndexCache: SearchIndexEntry[] | null = null;
  private pageCache = new Map<string, McpMarketplaceItem[]>();

  constructor(dataDir?: string) {
    this.dataDir = dataDir ?? path.join(path.dirname(fileURLToPath(import.meta.url)), "data");
  }

  async loadMeta(): Promise<CatalogMeta> {
    if (this.metaCache) return this.metaCache;
    const filePath = path.join(this.dataDir, "meta.json");
    const raw = fs.readFileSync(filePath, "utf-8");
    this.metaCache = JSON.parse(raw) as CatalogMeta;
    return this.metaCache;
  }

  async loadPage(category: string, page: number): Promise<McpMarketplaceItem[]> {
    const key = `${category}/${page}`;
    const cached = this.pageCache.get(key);
    if (cached) return cached;

    const filePath = path.join(this.dataDir, category, `${page}.json`);
    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const items = JSON.parse(raw) as McpMarketplaceItem[];
      // Keep cache bounded: max 5 pages in memory (~500KB)
      if (this.pageCache.size >= 5) {
        const firstKey = this.pageCache.keys().next().value;
        if (firstKey !== undefined) this.pageCache.delete(firstKey);
      }
      this.pageCache.set(key, items);
      return items;
    } catch {
      return [];
    }
  }

  async loadSearchIndex(): Promise<SearchIndexEntry[]> {
    if (this.searchIndexCache) return this.searchIndexCache;
    const filePath = path.join(this.dataDir, "search-index.json");
    const raw = fs.readFileSync(filePath, "utf-8");
    this.searchIndexCache = JSON.parse(raw) as SearchIndexEntry[];
    return this.searchIndexCache;
  }

  async getById(serverId: string): Promise<McpMarketplaceItem | null> {
    // Search through cached pages first
    for (const items of this.pageCache.values()) {
      const found = items.find((item) => item.serverId === serverId);
      if (found) return found;
    }

    // If not in cache, search through all pages
    const meta = await this.loadMeta();
    for (const [cat, info] of Object.entries(meta.categories)) {
      for (let p = 1; p <= info.pages; p++) {
        const items = await this.loadPage(cat, p);
        const found = items.find((item) => item.serverId === serverId);
        if (found) return found;
      }
    }
    return null;
  }

  /** Clear all caches (used by mcp.sync) */
  clearCache(): void {
    this.metaCache = null;
    this.searchIndexCache = null;
    this.pageCache.clear();
  }
}
