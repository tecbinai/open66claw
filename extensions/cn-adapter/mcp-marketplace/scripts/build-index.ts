/**
 * Build Index — 从老版 v5 数据生成分页 JSON 文件
 * CN-ONLY FILE — 构建时运行，不影响上游 OpenClaw
 *
 * 用法: npx tsx extensions/cn-adapter/mcp-marketplace/scripts/build-index.ts
 * 输入: 老版 mcp-index-enhanced-v5.json
 * 输出: extensions/cn-adapter/mcp-marketplace/data/
 */

import * as fs from "node:fs";
import * as path from "node:path";

// ============================================================================
// Configuration
// ============================================================================

const INPUT_FILE = path.resolve(
  process.env.MCP_MARKETPLACE_SOURCE ??
    "extensions/cn-adapter/mcp-marketplace/source/mcp-index-enhanced-v5.json",
);
const OUTPUT_DIR = path.resolve("extensions/cn-adapter/mcp-marketplace/data");
const PAGE_SIZE = 50;
const MIN_CN_SCORE = 50;
const SEARCH_DESC_MAX_LEN = 80;

// UI 硬编码的 11 个分类
const VALID_CATEGORIES = [
  "all",
  "filesystem",
  "database",
  "search",
  "productivity",
  "development",
  "network",
  "smarthome",
  "ai",
  "social",
  "other",
] as const;

type Category = (typeof VALID_CATEGORIES)[number];

// ============================================================================
// Types (mirrors v5 data structure)
// ============================================================================

interface V5Entry {
  serverId: string;
  friendlyName: string;
  friendlyNameEn?: string;
  friendlyNameCn?: string;
  description: string;
  descriptionEn?: string;
  descriptionCn?: string;
  category: string;
  tags?: string[];
  tagsCn?: string[];
  version?: string;
  requiresApiKey?: boolean;
  platforms?: string[];
  isOfficial?: boolean;
  isNew?: boolean;
  toolCount?: number;
  source?: string;
  sourceUrl?: string;
  viewCount?: number;
  isHosted?: boolean;
  isVerified?: boolean;
  npmPackage?: string;
  pypiPackage?: string;
  installCommand?: string;
  installArgs?: string[];
  installTransport?: string;
  availability?: {
    requiresVPN?: boolean;
    chinaFriendlyScore?: number;
    chinaBlockReasons?: string[];
  };
  requirements?: {
    runtimeDeps?: string[];
    platformNotes?: string;
    systemDeps?: string[];
  };
  serverConfig?: {
    command?: string;
    args?: string[];
    env?: Record<string, string>;
  };
  envSchema?: Record<string, { description?: string; type?: string }>;
  envRequired?: string[];
  categoryEnhanced?: Array<{ category: string; confidence: number }>;
  aiEnhancement?: {
    enhancedAt?: string;
    model?: string;
    version?: number;
    recommendationScore?: {
      beginnerFriendly?: number;
      enterpriseReady?: number;
      communityActivity?: number;
    };
    useCaseKeywords?: string[];
  };
}

interface McpMarketplaceItem {
  serverId: string;
  friendlyName: string;
  friendlyNameEn: string;
  description: string;
  descriptionEn: string;
  category: string;
  tags: string[];
  version: string;
  npmPackage: string;
  securityScore: number;
  requiresApiKey: boolean;
  apiKeyName?: string;
  apiKeyGuideUrl?: string;
  platforms: string[];
  isOfficial: boolean;
  isNew: boolean;
  toolCount: number;
  installStatus: "not_installed";
  installable?: boolean;
  installMethod?: "npm" | "pypi" | "sse" | "none";
  sourceUrl?: string;
  source?: string;
  configHint?: string;
  envSchema?: Record<string, { description?: string; type?: string; placeholder?: string }>;
  envRequired?: string[];
  sseUrl?: string;
  isVerified?: boolean;
  isHosted?: boolean;
  capabilities?: string[];
  examplePrompts?: string[];
  toolNames?: string[];
}

interface SearchIndexEntry {
  id: string;
  n: string;
  d: string;
  t: string[];
  c: string;
  m: string;
}

interface CatalogMeta {
  totalItems: number;
  categories: Record<string, { count: number; pages: number }>;
  generatedAt: string;
  sourceVersion: string;
}

// ============================================================================
// Category Mapping
// ============================================================================

function mapCategory(entry: V5Entry): Category {
  const cat = entry.category?.toLowerCase();
  if (cat && VALID_CATEGORIES.includes(cat as Category) && cat !== "all") {
    return cat as Category;
  }

  // Try categoryEnhanced
  if (entry.categoryEnhanced?.length) {
    const best = entry.categoryEnhanced
      .filter((c) => VALID_CATEGORIES.includes(c.category.toLowerCase() as Category))
      .sort((a, b) => b.confidence - a.confidence)[0];
    if (best) return best.category.toLowerCase() as Category;
  }

  return "other";
}

// ============================================================================
// Install Method Detection
// ============================================================================

function detectInstallMethod(entry: V5Entry): "npm" | "pypi" | "sse" | "none" {
  if (entry.installTransport === "sse") return "sse";
  if (entry.npmPackage || entry.installCommand === "npx") return "npm";
  if (entry.pypiPackage || entry.installCommand === "uvx" || entry.installCommand === "pip")
    return "pypi";
  if (entry.serverConfig?.command === "npx") return "npm";
  if (entry.serverConfig?.command === "uvx") return "pypi";
  return "none";
}

// ============================================================================
// Security Score Calculation
// ============================================================================

function calcSecurityScore(entry: V5Entry): number {
  let score = 50;
  if (entry.isOfficial) score += 20;
  if (entry.isVerified) score += 15;
  const cnScore = entry.availability?.chinaFriendlyScore ?? 50;
  score += Math.round(cnScore / 10);
  if (entry.requiresApiKey) score -= 5;
  if (entry.availability?.requiresVPN) score -= 10;
  return Math.max(0, Math.min(100, score));
}

// ============================================================================
// Field Mapping: V5 → McpMarketplaceItem
// ============================================================================

function mapEntry(entry: V5Entry): McpMarketplaceItem {
  const method = detectInstallMethod(entry);
  const category = mapCategory(entry);

  return {
    serverId: entry.serverId,
    friendlyName: entry.friendlyNameCn || entry.friendlyName,
    friendlyNameEn: entry.friendlyNameEn || entry.friendlyName,
    description: entry.descriptionCn || entry.description,
    descriptionEn: entry.descriptionEn || entry.description,
    category,
    tags: entry.tagsCn?.length ? entry.tagsCn : (entry.tags ?? []),
    version: entry.version ?? "0.0.0",
    npmPackage: entry.npmPackage ?? entry.serverId,
    securityScore: calcSecurityScore(entry),
    requiresApiKey: entry.requiresApiKey ?? false,
    platforms: entry.platforms ?? ["linux", "macos", "windows"],
    isOfficial: entry.isOfficial ?? false,
    isNew: entry.isNew ?? false,
    toolCount: entry.toolCount ?? 0,
    installStatus: "not_installed",
    installable: method !== "none",
    installMethod: method,
    sourceUrl: entry.sourceUrl,
    source: entry.source,
    configHint: entry.requirements?.platformNotes,
    envSchema: entry.envSchema
      ? Object.fromEntries(
          Object.entries(entry.envSchema).map(([k, v]) => [
            k,
            { description: v.description, type: v.type },
          ]),
        )
      : undefined,
    envRequired: entry.envRequired,
    sseUrl: entry.installTransport === "sse" && entry.sourceUrl ? entry.sourceUrl : undefined,
    isVerified: entry.isVerified ?? false,
    isHosted: entry.isHosted ?? false,
    capabilities: entry.aiEnhancement?.useCaseKeywords,
    examplePrompts: undefined,
    toolNames: undefined,
  };
}

// ============================================================================
// Main Build
// ============================================================================

function main(): void {
  console.log("Reading v5 data...");
  const raw = fs.readFileSync(INPUT_FILE, "utf-8");
  const v5Data = JSON.parse(raw) as { version: number; items: V5Entry[] };
  console.log(`Total entries: ${v5Data.items.length}`);

  // Filter CN-friendly
  const filtered = v5Data.items.filter(
    (e) => (e.availability?.chinaFriendlyScore ?? 0) >= MIN_CN_SCORE,
  );
  console.log(`CN-friendly (score >= ${MIN_CN_SCORE}): ${filtered.length}`);

  // Map to marketplace items
  const items = filtered.map(mapEntry);

  // Sort by securityScore DESC
  items.sort((a, b) => b.securityScore - a.securityScore);

  // Group by category
  const byCategory = new Map<string, McpMarketplaceItem[]>();
  byCategory.set("all", items);
  for (const cat of VALID_CATEGORIES) {
    if (cat === "all") continue;
    byCategory.set(
      cat,
      items.filter((i) => i.category === cat),
    );
  }

  // Ensure output directory
  fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Generate paginated files
  const meta: CatalogMeta = {
    totalItems: items.length,
    categories: {},
    generatedAt: new Date().toISOString(),
    sourceVersion: `v${v5Data.version}`,
  };

  for (const [cat, catItems] of byCategory) {
    const pages = Math.ceil(catItems.length / PAGE_SIZE) || 1;
    meta.categories[cat] = { count: catItems.length, pages };

    const catDir = path.join(OUTPUT_DIR, cat);
    fs.mkdirSync(catDir, { recursive: true });

    for (let p = 1; p <= pages; p++) {
      const start = (p - 1) * PAGE_SIZE;
      const pageItems = catItems.slice(start, start + PAGE_SIZE);
      fs.writeFileSync(path.join(catDir, `${p}.json`), JSON.stringify(pageItems));
    }

    console.log(`  ${cat}: ${catItems.length} items, ${pages} pages`);
  }

  // Write meta.json
  fs.writeFileSync(path.join(OUTPUT_DIR, "meta.json"), JSON.stringify(meta, null, 2));

  // Generate search index
  const searchIndex: SearchIndexEntry[] = items.map((item) => ({
    id: item.serverId,
    n: item.friendlyName,
    d: item.description.slice(0, SEARCH_DESC_MAX_LEN),
    t: item.tags.slice(0, 5),
    c: item.category,
    m: item.installMethod ?? "none",
  }));

  fs.writeFileSync(path.join(OUTPUT_DIR, "search-index.json"), JSON.stringify(searchIndex));

  // Summary
  const metaSize = Buffer.byteLength(JSON.stringify(meta, null, 2));
  const searchSize = Buffer.byteLength(JSON.stringify(searchIndex));
  console.log(`\nDone!`);
  console.log(`  meta.json: ${(metaSize / 1024).toFixed(1)} KB`);
  console.log(`  search-index.json: ${(searchSize / 1024).toFixed(1)} KB`);
  console.log(`  Total items: ${items.length}`);
  console.log(`  Output: ${OUTPUT_DIR}`);
}

main();
