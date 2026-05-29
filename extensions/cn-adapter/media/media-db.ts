/**
 * Media Metadata SQLite Store — CN-only media asset index
 *
 * Manages cn_media_assets table in an independent media-metadata.sqlite file.
 * Uses node:sqlite DatabaseSync (same as upstream memory system).
 *
 * Design:
 *   - Singleton DB connection per process
 *   - Independent file — does not touch memory.sqlite or any upstream DB
 *   - Only stores metadata (path/URL/prompt etc.), not binary blobs
 *   - Table prefixed with cn_ to avoid any future upstream collision
 */

import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { createCnLogger } from "../utils/logger.js";
import type { MediaAssetRow } from "./types.js";
import { MAX_MEDIA_ROWS } from "./types.js";

const log = createCnLogger("media-db");

const DB_FILENAME = "media-metadata.sqlite";
const TABLE = "cn_media_assets";

// ---------------------------------------------------------------------------
// Module state (singleton per process)
// ---------------------------------------------------------------------------

let _db: DatabaseSync | null = null;
let _dbPath: string | null = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const esmRequire = createRequire(import.meta.url);

function requireSqlite(): typeof import("node:sqlite") {
  // Suppress node:sqlite ExperimentalWarning (same as upstream src/memory/sqlite.ts)
  const originalEmit = process.emitWarning;
  process.emitWarning = ((...args: unknown[]) => {
    const msg = args[0];
    if (typeof msg === "string" && msg.includes("SQLite is an experimental feature")) {
      return;
    }
    if (msg instanceof Error && msg.message?.includes("SQLite is an experimental feature")) {
      return;
    }
    return Reflect.apply(originalEmit, process, args);
  }) as typeof process.emitWarning;

  try {
    return esmRequire("node:sqlite") as typeof import("node:sqlite");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`SQLite support is unavailable (missing node:sqlite). ${message}`, {
      cause: err,
    });
  } finally {
    process.emitWarning = originalEmit;
  }
}

/**
 * Resolve the data directory for CN media.
 * Uses OPENCLAW_STATE_DIR or ~/.openclaw/
 */
function resolveDataDir(): string {
  const home = process.env.HOME || process.env.USERPROFILE || "";
  const stateDir = process.env.OPENCLAW_STATE_DIR || join(home, ".openclaw");
  return join(stateDir, "data");
}

function resolveDbPath(): string {
  return join(resolveDataDir(), DB_FILENAME);
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

function ensureSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${TABLE} (
      id            TEXT PRIMARY KEY,
      session_key   TEXT NOT NULL,
      type          TEXT NOT NULL,
      file          TEXT NOT NULL,
      url           TEXT NOT NULL,
      mime_type     TEXT,
      size_bytes    INTEGER,
      source        TEXT DEFAULT 'generated',
      prompt        TEXT,
      revised_prompt TEXT,
      model         TEXT,
      provider      TEXT,
      image_size    TEXT,
      style         TEXT,
      seed          INTEGER,
      duration_ms   INTEGER,
      duration_secs REAL,
      cover_url     TEXT,
      message_text  TEXT,
      created_at    TEXT NOT NULL,
      expires_at    TEXT
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_cn_media_session ON ${TABLE}(session_key);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_cn_media_created ON ${TABLE}(created_at);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_cn_media_type    ON ${TABLE}(type);`);
}

// ---------------------------------------------------------------------------
// DB Lifecycle
// ---------------------------------------------------------------------------

/**
 * Open (or return cached) media-metadata.sqlite connection.
 */
export function openMediaDb(): DatabaseSync {
  // If an in-memory DB is active (testing), always return it
  if (_db && _dbPath === ":memory:") {
    return _db;
  }

  const newDbPath = resolveDbPath();

  // Path changed → close old connection
  if (_db && _dbPath && _dbPath !== newDbPath) {
    try {
      _db.close();
    } catch {
      /* ignore */
    }
    _db = null;
    _dbPath = null;
  }

  if (_db && _dbPath === newDbPath) {
    return _db;
  }

  const dataDir = dirname(newDbPath);
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  const sqlite = requireSqlite();
  _db = new sqlite.DatabaseSync(newDbPath);
  _dbPath = newDbPath;

  // PRAGMAs — auto_vacuum must come before journal_mode on new DBs
  _db.exec("PRAGMA auto_vacuum=INCREMENTAL");
  _db.exec("PRAGMA journal_mode=WAL");
  _db.exec("PRAGMA synchronous=NORMAL");
  _db.exec("PRAGMA busy_timeout=3000");

  ensureSchema(_db);

  // Integrity check on startup
  try {
    const result = _db.prepare("PRAGMA quick_check").get() as {
      quick_check?: string;
    } | null;
    const status = result?.quick_check ?? "unknown";
    if (status !== "ok") {
      log.warn(`SQLite integrity check failed: ${status}. Media database may be corrupted.`);
    }
  } catch (err) {
    log.warn(`integrity check error: ${String(err).slice(0, 200)}`);
  }

  return _db;
}

/**
 * Close DB connection. WAL checkpoint before close to ensure durability.
 */
export function closeMediaDb(): void {
  if (_db) {
    try {
      _db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    } catch {
      // checkpoint failure is non-fatal
    }
    try {
      _db.close();
    } catch {
      /* ignore */
    }
    _db = null;
    _dbPath = null;
  }
}

/**
 * Open an in-memory DB for testing. Replaces the singleton.
 */
export function openMediaDbMemory(): DatabaseSync {
  closeMediaDb();
  const sqlite = requireSqlite();
  _db = new sqlite.DatabaseSync(":memory:");
  _dbPath = ":memory:";
  ensureSchema(_db);
  return _db;
}

// ---------------------------------------------------------------------------
// Write operations
// ---------------------------------------------------------------------------

/**
 * Insert a single media asset. Skips if id already exists (INSERT OR IGNORE).
 */
export function insertMediaAsset(row: MediaAssetRow): void {
  const db = openMediaDb();
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO ${TABLE} (
      id, session_key, type, file, url, mime_type, size_bytes, source,
      prompt, revised_prompt, model, provider, image_size, style, seed,
      duration_ms, duration_secs, cover_url, message_text, created_at, expires_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?
    )
  `);
  stmt.run(
    row.id,
    row.session_key,
    row.type,
    row.file,
    row.url,
    row.mime_type ?? null,
    row.size_bytes ?? null,
    row.source,
    row.prompt ?? null,
    row.revised_prompt ?? null,
    row.model ?? null,
    row.provider ?? null,
    row.image_size ?? null,
    row.style ?? null,
    row.seed ?? null,
    row.duration_ms ?? null,
    row.duration_secs ?? null,
    row.cover_url ?? null,
    row.message_text ?? null,
    row.created_at,
    row.expires_at ?? null,
  );
}

/**
 * Batch insert (wrapped in transaction for performance).
 */
export function insertMediaAssets(rows: MediaAssetRow[]): void {
  if (rows.length === 0) return;
  const db = openMediaDb();
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO ${TABLE} (
      id, session_key, type, file, url, mime_type, size_bytes, source,
      prompt, revised_prompt, model, provider, image_size, style, seed,
      duration_ms, duration_secs, cover_url, message_text, created_at, expires_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?
    )
  `);
  db.exec("BEGIN");
  try {
    for (const row of rows) {
      stmt.run(
        row.id,
        row.session_key,
        row.type,
        row.file,
        row.url,
        row.mime_type ?? null,
        row.size_bytes ?? null,
        row.source,
        row.prompt ?? null,
        row.revised_prompt ?? null,
        row.model ?? null,
        row.provider ?? null,
        row.image_size ?? null,
        row.style ?? null,
        row.seed ?? null,
        row.duration_ms ?? null,
        row.duration_secs ?? null,
        row.cover_url ?? null,
        row.message_text ?? null,
        row.created_at,
        row.expires_at ?? null,
      );
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Read operations
// ---------------------------------------------------------------------------

/**
 * Query all media for a session, ordered by created_at DESC.
 */
export function queryBySession(sessionKey: string): MediaAssetRow[] {
  const db = openMediaDb();
  const stmt = db.prepare(`SELECT * FROM ${TABLE} WHERE session_key = ? ORDER BY created_at DESC`);
  return stmt.all(sessionKey) as unknown as MediaAssetRow[];
}

/**
 * Query a single record by ID.
 */
export function queryById(id: string): MediaAssetRow | null {
  const db = openMediaDb();
  const stmt = db.prepare(`SELECT * FROM ${TABLE} WHERE id = ?`);
  return (stmt.get(id) as unknown as MediaAssetRow | undefined) ?? null;
}

/**
 * Batch query by ID array. Splits into batches of 400 to stay under
 * SQLite's SQLITE_MAX_VARIABLE_NUMBER limit (same pattern as upstream).
 */
export function queryByIds(ids: string[]): MediaAssetRow[] {
  if (ids.length === 0) return [];
  const db = openMediaDb();
  const BATCH = 400;
  const results: MediaAssetRow[] = [];
  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = ids.slice(i, i + BATCH);
    const placeholders = batch.map(() => "?").join(",");
    const stmt = db.prepare(
      `SELECT * FROM ${TABLE} WHERE id IN (${placeholders}) ORDER BY created_at DESC`,
    );
    const rows = stmt.all(...batch) as unknown as MediaAssetRow[];
    results.push(...rows);
  }
  // Re-sort merged batches by created_at DESC
  if (ids.length > BATCH) {
    results.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  return results;
}

// ---------------------------------------------------------------------------
// Delete operations
// ---------------------------------------------------------------------------

/**
 * Delete all media for a session.
 */
export function deleteBySession(sessionKey: string): number {
  const db = openMediaDb();
  const stmt = db.prepare(`DELETE FROM ${TABLE} WHERE session_key = ?`);
  const result = stmt.run(sessionKey);
  return Number(result.changes);
}

/**
 * Delete all expired records (expires_at < now).
 */
export function deleteExpired(): number {
  const db = openMediaDb();
  const stmt = db.prepare(`DELETE FROM ${TABLE} WHERE expires_at IS NOT NULL AND expires_at < ?`);
  const result = stmt.run(new Date().toISOString());
  return Number(result.changes);
}

/**
 * Get total row count (for diagnostics).
 */
export function countAll(): number {
  const db = openMediaDb();
  const stmt = db.prepare(`SELECT COUNT(*) as cnt FROM ${TABLE}`);
  const row = stmt.get() as { cnt: number } | undefined;
  return row?.cnt ?? 0;
}

/**
 * Enforce row cap: delete oldest rows when exceeding maxRows.
 */
export function capMediaRows(maxRows = MAX_MEDIA_ROWS): number {
  const total = countAll();
  if (total <= maxRows) return 0;
  const excess = total - maxRows;
  const db = openMediaDb();
  const stmt = db.prepare(
    `DELETE FROM ${TABLE} WHERE id IN (
       SELECT id FROM ${TABLE} ORDER BY created_at ASC LIMIT ?
     )`,
  );
  const result = stmt.run(excess);
  return Number(result.changes);
}

/**
 * Full maintenance: delete expired + enforce cap + vacuum.
 * Called by media-cleanup service.
 */
export function runMediaDbMaintenance(): { expired: number; capped: number } {
  try {
    const expired = deleteExpired();
    const capped = capMediaRows();
    if (expired > 0 || capped > 0) {
      try {
        const db = openMediaDb();
        db.exec("PRAGMA incremental_vacuum");
      } catch {
        // non-fatal
      }
    }
    return { expired, capped };
  } catch {
    return { expired: 0, capped: 0 };
  }
}
