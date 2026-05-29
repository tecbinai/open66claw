/**
 * Skills Marketplace SQLite Database Wrapper
 * CN-ONLY FILE — 不影响上游 OpenClaw
 */

import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { initializeSchema, skillsFtsAvailable } from "./db-schema.js";
import type { SkillMarketplaceItem, SkillSearchOptions, SkillSearchResult } from "./types.js";

export type { SkillSearchOptions } from "./types.js";

// ========== 配置 ==========

const DEFAULT_DB_DIR = (() => {
  const candidates = [
    process.env.OPENCLAWCN_DATA_DIR,
    process.env.APPDATA ? path.join(process.env.APPDATA, "openclawcn", "data") : undefined,
    process.env.HOME ? path.join(process.env.HOME, ".openclawcn", "data") : undefined,
  ].filter(Boolean) as string[];
  return candidates[0] ?? path.join(process.cwd(), "data");
})();

const DEFAULT_DB_PATH = path.join(DEFAULT_DB_DIR, "skills-index.db");

// ========== 数据库连接管理 ==========

let dbInstance: DatabaseSync | null = null;
let currentDbPath: string | null = null;

export function getDatabase(dbPath?: string): DatabaseSync {
  if (!dbPath && dbInstance) {
    return dbInstance;
  }

  const targetPath = dbPath || DEFAULT_DB_PATH;

  if (dbInstance && currentDbPath && currentDbPath !== targetPath) {
    dbInstance.close();
    dbInstance = null;
    currentDbPath = null;
  }

  if (!dbInstance) {
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    dbInstance = new DatabaseSync(targetPath);
    currentDbPath = targetPath;

    dbInstance.exec("PRAGMA journal_mode = WAL");
    dbInstance.exec("PRAGMA synchronous = NORMAL");
    dbInstance.exec("PRAGMA cache_size = -64000");
    dbInstance.exec("PRAGMA temp_store = MEMORY");

    initializeSchema(dbInstance);
    removeLegacyCloudRows(dbInstance);
  }

  return dbInstance;
}

export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    currentDbPath = null;
  }
}

// ========== 工具函数 ==========

function parseJsonSafe<T>(str: string | null | undefined, fallback: T): T {
  if (!str) return fallback;
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

function removeLegacyCloudRows(db: DatabaseSync): void {
  try {
    db.prepare("DELETE FROM skills WHERE source = 'cloud'").run();
  } catch {
    // Older or partially-created databases may not have the skills table yet.
  }
}

// ========== 类型转换 ==========

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbRow = Record<string, any>;

function itemToRow(item: SkillMarketplaceItem): DbRow {
  return {
    skill_id: item.skillId,
    name: item.name,
    name_cn: item.nameCn || null,
    description: item.description || null,
    description_cn: item.descriptionCn || null,
    category: item.category || null,
    tags: item.tags ? JSON.stringify(item.tags) : null,
    emoji: item.emoji || null,
    author: item.author || null,
    version: item.version || null,
    path: item.path || null,
    tier: item.tier || null,
    overall_score: item.overallScore ?? null,
    cn_blocked: item.cnBlocked ? 1 : 0,
    cn_alternative: item.cnAlternative || null,
    has_translation: item.hasTranslation ? 1 : 0,
    installed: item.installed ? 1 : 0,
    source: item.source || "proxy",
    proxy_version: item.proxyVersion ?? null,
    sha256: item.sha256 || null,
    size_bytes: item.sizeBytes ?? null,
  };
}

function rowToItem(row: DbRow): SkillMarketplaceItem {
  const item: SkillMarketplaceItem = {
    skillId: row.skill_id as string,
    name: row.name as string,
    description: (row.description as string) || "",
    path: (row.path as string) || "",
  };

  if (row.name_cn) item.nameCn = row.name_cn as string;
  if (row.description_cn) item.descriptionCn = row.description_cn as string;
  if (row.category) item.category = row.category as string;
  if (row.tags) item.tags = parseJsonSafe(row.tags as string, undefined);
  if (row.emoji) item.emoji = row.emoji as string;
  if (row.author) item.author = row.author as string;
  if (row.version) item.version = row.version as string;

  if (row.tier) item.tier = row.tier as string;
  if (row.overall_score !== null && row.overall_score !== undefined) {
    item.overallScore = row.overall_score as number;
  }
  item.cnBlocked = Boolean(row.cn_blocked);
  if (row.cn_alternative) item.cnAlternative = row.cn_alternative as string;
  item.hasTranslation = Boolean(row.has_translation);
  item.installed = Boolean(row.installed);

  if (row.source) item.source = row.source as string;
  if (row.proxy_version !== null && row.proxy_version !== undefined) {
    item.proxyVersion = row.proxy_version as number;
  }
  if (row.sha256) item.sha256 = row.sha256 as string;
  if (row.size_bytes !== null && row.size_bytes !== undefined) {
    item.sizeBytes = row.size_bytes as number;
  }

  return item;
}

// ========== CRUD 操作 ==========

export function insertItem(item: SkillMarketplaceItem): void {
  const db = getDatabase();
  const row = itemToRow(item);
  const columns = Object.keys(row).join(", ");
  const placeholders = Object.keys(row)
    .map(() => "?")
    .join(", ");
  const stmt = db.prepare(`INSERT OR REPLACE INTO skills (${columns}) VALUES (${placeholders})`);
  stmt.run(...Object.values(row));
}

export function insertItems(items: SkillMarketplaceItem[]): void {
  if (items.length === 0) return;
  const db = getDatabase();

  // 保留已有 installed 状态
  const existingInstalled = new Set<string>();
  const BATCH = 500;
  const allIds = items.map((i) => i.skillId);
  for (let i = 0; i < allIds.length; i += BATCH) {
    const batch = allIds.slice(i, i + BATCH);
    const placeholders = batch.map(() => "?").join(",");
    const rows = db
      .prepare(`SELECT skill_id FROM skills WHERE skill_id IN (${placeholders}) AND installed = 1`)
      .all(...batch) as Array<{ skill_id: string }>;
    for (const row of rows) {
      existingInstalled.add(row.skill_id);
    }
  }

  const sampleRow = itemToRow(items[0]!);
  const columns = Object.keys(sampleRow).join(", ");
  const placeholders = Object.keys(sampleRow)
    .map(() => "?")
    .join(", ");
  const stmt = db.prepare(`INSERT OR REPLACE INTO skills (${columns}) VALUES (${placeholders})`);

  db.exec("BEGIN TRANSACTION");
  try {
    for (const item of items) {
      const preserveInstalled = existingInstalled.has(item.skillId);
      const effectiveItem =
        preserveInstalled && !item.installed ? { ...item, installed: true } : item;
      const row = itemToRow(effectiveItem);
      stmt.run(...Object.values(row));
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function getItemById(skillId: string): SkillMarketplaceItem | null {
  const db = getDatabase();
  const stmt = db.prepare("SELECT * FROM skills WHERE skill_id = ?");
  const row = stmt.get(skillId) as DbRow | undefined;
  return row ? rowToItem(row) : null;
}

export function getItemsByIds(
  skillIds: string[],
  options?: { page?: number; pageSize?: number },
): SkillSearchResult {
  if (skillIds.length === 0) {
    return { items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 };
  }

  const db = getDatabase();
  const page = Math.max(1, options?.page ?? 1);
  const pageSize = Math.max(1, Math.min(options?.pageSize ?? 20, 1000));

  const BATCH_SIZE = 500;
  const rowMap = new Map<string, DbRow>();
  const uniqueIds = [...new Set(skillIds)];

  for (let i = 0; i < uniqueIds.length; i += BATCH_SIZE) {
    const batch = uniqueIds.slice(i, i + BATCH_SIZE);
    const placeholders = batch.map(() => "?").join(",");
    const rows = db
      .prepare(`SELECT * FROM skills WHERE skill_id IN (${placeholders})`)
      .all(...batch) as DbRow[];
    for (const row of rows) {
      rowMap.set(row.skill_id as string, row);
    }
  }

  const ordered: SkillMarketplaceItem[] = [];
  for (const id of skillIds) {
    const row = rowMap.get(id);
    if (row) {
      ordered.push(rowToItem(row));
    }
  }

  const total = ordered.length;
  const offset = (page - 1) * pageSize;
  const pagedItems = ordered.slice(offset, offset + pageSize);

  return {
    items: pagedItems,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

// ========== 查询 API ==========

const ALLOWED_ORDER_BY = ["updated_at", "overall_score", "name", "downloads"] as const;
const ALLOWED_ORDER_DIR = ["ASC", "DESC"] as const;

export function searchItems(options: SkillSearchOptions = {}): SkillSearchResult {
  const db = getDatabase();

  const {
    keyword,
    category,
    tier,
    cnBlocked,
    installed,
    source,
    orderBy = "updated_at",
    orderDirection = "DESC",
    page = 1,
    pageSize = 20,
  } = options;

  const validPage = Math.max(1, Math.min(page, 1000000));
  const validPageSize = Math.max(1, Math.min(pageSize, 100));

  const normalizedOrderBy = orderBy === "downloads" ? "overall_score" : orderBy;
  const normalizedOrderDirection = String(orderDirection).toUpperCase();

  if (!ALLOWED_ORDER_BY.includes(orderBy as (typeof ALLOWED_ORDER_BY)[number])) {
    throw new Error(`Invalid orderBy: ${orderBy}`);
  }
  if (!ALLOWED_ORDER_DIR.includes(normalizedOrderDirection as (typeof ALLOWED_ORDER_DIR)[number])) {
    throw new Error(`Invalid orderDirection: ${orderDirection}`);
  }

  const conditions: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const params: any[] = [];

  if (keyword) {
    const sanitized = keyword
      .replace(/["*(){}[\]:!+\-]/g, " ")
      .replace(/\b(AND|OR|NOT|NEAR)\b/gi, " ")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (sanitized && sanitized.length > 500) {
      throw new Error("Keyword too long (max 500 chars)");
    } else if (sanitized && skillsFtsAvailable) {
      conditions.push(`skill_id IN (
        SELECT skill_id FROM skills_search
        WHERE skills_search MATCH ?
      )`);
      params.push(sanitized);
    } else if (sanitized) {
      const likeTerm = `%${sanitized}%`;
      conditions.push(`(name_cn LIKE ? OR description_cn LIKE ? OR tags LIKE ?)`);
      params.push(likeTerm, likeTerm, likeTerm);
    }
  }

  if (category) {
    conditions.push("category = ?");
    params.push(category);
  }
  if (tier) {
    conditions.push("tier = ?");
    params.push(tier);
  }
  if (cnBlocked !== undefined) {
    conditions.push("cn_blocked = ?");
    params.push(cnBlocked ? 1 : 0);
  }
  if (installed !== undefined) {
    conditions.push("installed = ?");
    params.push(installed ? 1 : 0);
  }
  if (source) {
    conditions.push("source = ?");
    params.push(source);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const countStmt = db.prepare(`SELECT COUNT(*) as count FROM skills ${whereClause}`);
  const countRow = countStmt.get(...params) as { count: number };
  const total = countRow.count;

  const offset = (validPage - 1) * validPageSize;
  const queryStmt = db.prepare(`
    SELECT * FROM skills
    ${whereClause}
    ORDER BY ${normalizedOrderBy} ${normalizedOrderDirection}
    LIMIT ? OFFSET ?
  `);

  const rows = queryStmt.all(...params, validPageSize, offset) as DbRow[];
  const items = rows.map(rowToItem);

  return {
    items,
    total,
    page: validPage,
    pageSize: validPageSize,
    totalPages: Math.ceil(total / validPageSize),
  };
}

export function getCategoryStats(): Record<string, number> {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT category, COUNT(*) as count
    FROM skills
    WHERE category IS NOT NULL AND category != ''
    GROUP BY category
    ORDER BY count DESC
  `);
  const rows = stmt.all() as Array<{ category: string; count: number }>;
  return Object.fromEntries(rows.map((r) => [r.category, r.count]));
}

export function getStats() {
  const db = getDatabase();

  const total = (
    db.prepare("SELECT COUNT(*) as count FROM skills").get() as {
      count: number;
    }
  ).count;
  const installedCount = (
    db.prepare("SELECT COUNT(*) as count FROM skills WHERE installed = 1").get() as {
      count: number;
    }
  ).count;
  const cnBlockedCount = (
    db.prepare("SELECT COUNT(*) as count FROM skills WHERE cn_blocked = 1").get() as {
      count: number;
    }
  ).count;
  const tierA = (
    db.prepare("SELECT COUNT(*) as count FROM skills WHERE tier = 'A'").get() as { count: number }
  ).count;
  const tierB = (
    db.prepare("SELECT COUNT(*) as count FROM skills WHERE tier = 'B'").get() as { count: number }
  ).count;

  return {
    total,
    installed: installedCount,
    cnBlocked: cnBlockedCount,
    tierDistribution: { A: tierA, B: tierB },
    categories: getCategoryStats(),
  };
}

// ========== 增量同步 ==========

export function getLastSyncedAt(): string | null {
  const db = getDatabase();
  const stmt = db.prepare("SELECT value FROM sync_meta WHERE key = 'last_synced_at'");
  const row = stmt.get() as { value: string } | undefined;
  return row?.value ?? null;
}

export function setLastSyncedAt(timestamp: string): void {
  const db = getDatabase();
  db.prepare("INSERT OR REPLACE INTO sync_meta (key, value) VALUES ('last_synced_at', ?)").run(
    timestamp,
  );
}

// ========== 安装状态管理 ==========

export function updateInstalledStatus(installedNames: string[]): void {
  const db = getDatabase();
  const nameSet = new Set(installedNames);

  db.exec("BEGIN TRANSACTION");
  try {
    db.prepare("UPDATE skills SET installed = 0").run();
    if (nameSet.size > 0) {
      const markStmt = db.prepare("UPDATE skills SET installed = 1 WHERE skill_id = ?");
      for (const name of nameSet) {
        markStmt.run(name);
      }
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function markSkillInstalled(skillId: string): void {
  const db = getDatabase();
  db.prepare("UPDATE skills SET installed = 1 WHERE skill_id = ?").run(skillId);
}

// ========== QC 基线导入 ==========

export function isQcPopulated(): boolean {
  const db = getDatabase();
  const stmt = db.prepare("SELECT value FROM sync_meta WHERE key = 'qc_populated'");
  const row = stmt.get() as { value: string } | undefined;
  if (row?.value !== "1") return false;
  const countRow = db.prepare("SELECT COUNT(*) as count FROM skills").get() as { count: number };
  return countRow.count > 0;
}

function markQcPopulated(): void {
  const db = getDatabase();
  db.prepare("INSERT OR REPLACE INTO sync_meta (key, value) VALUES ('qc_populated', '1')").run();
}

/**
 * 从本地已安装的技能列表填充 SQLite（作为基线数据源）。
 * 当没有 QC 索引文件时，使用 skills.status 返回的本地技能生成市场数据。
 */
export function populateFromLocalSkills(
  localSkills: Array<{
    name: string;
    description: string;
    nameZh?: string;
    descriptionZh?: string;
    emoji?: string;
    source?: string;
  }>,
): number {
  if (localSkills.length === 0) return 0;

  const items: SkillMarketplaceItem[] = localSkills.map((skill) => ({
    skillId: skill.name,
    name: skill.name,
    nameCn: skill.nameZh,
    description: skill.description,
    descriptionCn: skill.descriptionZh,
    emoji: skill.emoji,
    path: skill.name,
    installed: true,
    source: "local",
  }));

  insertItems(items);
  setLastSyncedAt(new Date().toISOString());
  return items.length;
}

// 内置默认技能列表，当 workspace 和 bundled skills 都不可用时使用
const DEFAULT_SKILLS: Array<{
  name: string;
  description: string;
  nameZh?: string;
  descriptionZh?: string;
  emoji?: string;
  source?: string;
}> = [
  {
    name: "commit",
    description: "Generate commit messages from staged changes",
    nameZh: "提交助手",
    descriptionZh: "根据暂存的更改生成提交信息",
    emoji: "📝",
    source: "bundled",
  },
  {
    name: "review-pr",
    description: "Review a pull request with detailed feedback",
    nameZh: "PR 审查",
    descriptionZh: "对拉取请求进行详细的代码审查",
    emoji: "🔍",
    source: "bundled",
  },
  {
    name: "simplify",
    description: "Review changed code for reuse, quality, and efficiency",
    nameZh: "代码简化",
    descriptionZh: "检查代码的复用性、质量和效率",
    emoji: "✨",
    source: "bundled",
  },
  {
    name: "pdf",
    description: "Read and analyze PDF documents",
    nameZh: "PDF 阅读",
    descriptionZh: "阅读和分析 PDF 文档",
    emoji: "📄",
    source: "bundled",
  },
  {
    name: "loop",
    description: "Run a command on a recurring interval",
    nameZh: "循环执行",
    descriptionZh: "按固定时间间隔重复执行命令",
    emoji: "🔁",
    source: "bundled",
  },
];

/**
 * 确保基线数据已导入（幂等）
 * 当无 localSkills 参数时，使用内置默认技能列表填充
 */
export function ensureBaseline(
  localSkills?: Array<{
    name: string;
    description: string;
    nameZh?: string;
    descriptionZh?: string;
    emoji?: string;
    source?: string;
  }>,
): number {
  if (isQcPopulated()) return 0;

  const skills = localSkills && localSkills.length > 0 ? localSkills : DEFAULT_SKILLS;
  const count = populateFromLocalSkills(skills);
  if (count > 0) {
    markQcPopulated();
  }
  return count;
}
