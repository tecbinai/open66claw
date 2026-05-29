/**
 * Skills Marketplace SQLite Database Schema
 * CN-ONLY FILE — 不影响上游 OpenClaw
 */

import type { DatabaseSync } from "node:sqlite";

export const SKILLS_DB_SCHEMA = {
  items: `
    CREATE TABLE IF NOT EXISTS skills (
      skill_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      name_cn TEXT,
      description TEXT,
      description_cn TEXT,
      category TEXT,
      tags TEXT,
      emoji TEXT,
      author TEXT,
      version TEXT,
      path TEXT,

      -- QC 质控字段
      tier TEXT,
      overall_score REAL,
      cn_blocked INTEGER DEFAULT 0,
      cn_alternative TEXT,
      has_translation INTEGER DEFAULT 0,

      -- 安装状态
      installed INTEGER DEFAULT 0,

      -- 元数据
      source TEXT DEFAULT 'proxy',
      proxy_version INTEGER,
      sha256 TEXT,
      size_bytes INTEGER,

      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `,

  syncMeta: `
    CREATE TABLE IF NOT EXISTS sync_meta (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `,

  searchIndex: `
    CREATE VIRTUAL TABLE IF NOT EXISTS skills_search USING fts5(
      skill_id,
      name_cn,
      description_cn,
      tags,
      category,
      tokenize='unicode61 remove_diacritics 2'
    )
  `,

  searchTriggers: [
    `
    CREATE TRIGGER IF NOT EXISTS skills_search_insert AFTER INSERT ON skills BEGIN
      INSERT INTO skills_search(skill_id, name_cn, description_cn, tags, category)
      VALUES (new.skill_id, new.name_cn, new.description_cn, new.tags, new.category);
    END
    `,
    `
    CREATE TRIGGER IF NOT EXISTS skills_search_update AFTER UPDATE ON skills BEGIN
      DELETE FROM skills_search WHERE skill_id = old.skill_id;
      INSERT INTO skills_search(skill_id, name_cn, description_cn, tags, category)
      VALUES (new.skill_id, new.name_cn, new.description_cn, new.tags, new.category);
    END
    `,
    `
    CREATE TRIGGER IF NOT EXISTS skills_search_delete AFTER DELETE ON skills BEGIN
      DELETE FROM skills_search WHERE skill_id = old.skill_id;
    END
    `,
  ],

  indexes: [
    `CREATE INDEX IF NOT EXISTS idx_skills_category ON skills(category)`,
    `CREATE INDEX IF NOT EXISTS idx_skills_tier ON skills(tier)`,
    `CREATE INDEX IF NOT EXISTS idx_skills_cn_blocked ON skills(cn_blocked)`,
    `CREATE INDEX IF NOT EXISTS idx_skills_installed ON skills(installed)`,
    `CREATE INDEX IF NOT EXISTS idx_skills_overall_score ON skills(overall_score DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_skills_updated_at ON skills(updated_at DESC)`,
  ],
};

/** Whether FTS5 search index was successfully created */
export let skillsFtsAvailable = false;

/**
 * 初始化数据库 schema（内联迁移，无外部依赖）
 *
 * 使用 PRAGMA user_version 跟踪已应用的迁移版本。
 */
export function initializeSchema(db: DatabaseSync): void {
  const row = db.prepare("PRAGMA user_version").get() as { user_version: number } | undefined;
  const currentVersion = row?.user_version ?? 0;

  if (currentVersion >= 1) {
    // Schema already initialized — just detect FTS5 availability
    try {
      db.prepare("SELECT count(*) FROM skills_search").get();
      skillsFtsAvailable = true;
    } catch {
      skillsFtsAvailable = false;
    }
    return;
  }

  // Version 0 → 1: Create all tables + indexes + FTS5
  db.exec(SKILLS_DB_SCHEMA.items);
  db.exec(SKILLS_DB_SCHEMA.syncMeta);
  for (const index of SKILLS_DB_SCHEMA.indexes) {
    db.exec(index);
  }

  // FTS5 (may not be available in all SQLite builds)
  try {
    db.exec(SKILLS_DB_SCHEMA.searchIndex);
    for (const trigger of SKILLS_DB_SCHEMA.searchTriggers) {
      db.exec(trigger);
    }
    skillsFtsAvailable = true;
  } catch {
    skillsFtsAvailable = false;
    try {
      db.exec("DROP TRIGGER IF EXISTS skills_search_insert");
      db.exec("DROP TRIGGER IF EXISTS skills_search_update");
      db.exec("DROP TRIGGER IF EXISTS skills_search_delete");
      db.exec("DROP TABLE IF EXISTS skills_search");
    } catch {
      // best-effort cleanup
    }
  }

  db.exec("PRAGMA user_version = 1");
}
