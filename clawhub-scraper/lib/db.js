import Database from 'better-sqlite3';
import { readFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
let _db = null;

export function getDb() {
  if (!_db) {
    mkdirSync(dirname(config.dbPath), { recursive: true });
    _db = new Database(config.dbPath);
    _db.pragma('journal_mode = WAL');
    _db.pragma('busy_timeout = 10000');
    _db.pragma('synchronous = NORMAL');
    // Auto-init schema
    const schema = readFileSync(resolve(__dirname, 'schema.sql'), 'utf8');
    _db.exec(schema);
  }
  return _db;
}

export function closeDb() {
  if (_db) { _db.close(); _db = null; }
}

// ─── Skills CRUD ───

export function upsertSkillsBatch(skills) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO skills (slug, display_name, summary, tags_json, stats_json, metadata_json, license, homepage, created_at, updated_at, latest_version, scrape_status)
    VALUES (@slug, @display_name, @summary, @tags_json, @stats_json, @metadata_json, @license, @homepage, @created_at, @updated_at, @latest_version, 'listing_done')
    ON CONFLICT(slug) DO UPDATE SET
      display_name = @display_name, summary = @summary, tags_json = @tags_json,
      stats_json = @stats_json, metadata_json = @metadata_json, license = @license,
      homepage = @homepage, updated_at = @updated_at, latest_version = @latest_version,
      row_updated_at = datetime('now')
  `);
  const tx = db.transaction((items) => { for (const s of items) stmt.run(s); });
  tx(skills);
}

export function markDownloaded(slug, skillMdRaw, filesJson) {
  getDb().prepare(`
    UPDATE skills SET skill_md_raw = ?, skill_files_json = ?, scrape_status = 'downloaded',
    scraped_at = datetime('now'), row_updated_at = datetime('now') WHERE slug = ?
  `).run(skillMdRaw, filesJson, slug);
}

export function markDownloadFailed(slug, error) {
  getDb().prepare(`
    UPDATE skills SET scrape_status = 'download_failed', scrape_error = ?,
    scraped_at = datetime('now'), row_updated_at = datetime('now') WHERE slug = ?
  `).run(String(error).slice(0, 500), slug);
}

export function getPendingDownloads(limit = 0) {
  const sql = `SELECT slug FROM skills WHERE scrape_status = 'listing_done' ORDER BY updated_at DESC`
    + (limit > 0 ? ` LIMIT ${limit}` : '');
  return getDb().prepare(sql).all();
}

export function getFailedDownloads() {
  return getDb().prepare(`SELECT slug, scrape_error FROM skills WHERE scrape_status = 'download_failed'`).all();
}

export function resetFailed() {
  return getDb().prepare(`UPDATE skills SET scrape_status = 'listing_done', scrape_error = NULL WHERE scrape_status = 'download_failed'`).run();
}

export function getDownloadedUnfiltered() {
  return getDb().prepare(`SELECT * FROM skills WHERE scrape_status = 'downloaded' AND china_friendly IS NULL`).all();
}

export function updateFilter(slug, chinaFriendly, reason, tagsJson) {
  getDb().prepare(`
    UPDATE skills SET china_friendly = ?, filter_reason = ?, filter_tags_json = ?,
    filtered_at = datetime('now'), row_updated_at = datetime('now') WHERE slug = ?
  `).run(chinaFriendly ? 1 : 0, reason, tagsJson, slug);
}

export function resetFilter() {
  return getDb().prepare(`UPDATE skills SET china_friendly = NULL, filter_reason = NULL, filter_tags_json = NULL, filtered_at = NULL WHERE china_friendly IS NOT NULL`).run();
}

export function getChinaFriendlyPending() {
  return getDb().prepare(`
    SELECT slug, skill_md_raw FROM skills
    WHERE china_friendly = 1 AND translate_status = 'pending' AND skill_md_raw IS NOT NULL
    ORDER BY json_extract(stats_json, '$.downloads') DESC
  `).all();
}

export function markTranslateQueued(slugs, batchFile) {
  const stmt = getDb().prepare(`UPDATE skills SET translate_status = 'queued', translate_batch = ?, row_updated_at = datetime('now') WHERE slug = ?`);
  const tx = getDb().transaction((items) => { for (const s of items) stmt.run(batchFile, s); });
  tx(slugs);
}

export function markTranslated(slug, skillMdCn) {
  getDb().prepare(`
    UPDATE skills SET skill_md_cn = ?, translate_status = 'translated',
    translated_at = datetime('now'), row_updated_at = datetime('now') WHERE slug = ?
  `).run(skillMdCn, slug);
}

export function markTranslateError(slug, error) {
  getDb().prepare(`
    UPDATE skills SET translate_status = 'pending', translate_error = ?,
    row_updated_at = datetime('now') WHERE slug = ?
  `).run(String(error).slice(0, 500), slug);
}

// ─── Scrape Runs ───

export function createScrapeRun(phase) {
  return getDb().prepare(`INSERT INTO scrape_runs (status, last_cursor) VALUES (?, NULL)`).run(phase || 'running').lastInsertRowid;
}

export function getLastScrapeRun() {
  return getDb().prepare(`SELECT * FROM scrape_runs ORDER BY id DESC LIMIT 1`).get();
}

export function updateScrapeRun(id, data) {
  const keys = Object.keys(data);
  const sets = keys.map(k => `${k} = ?`).join(', ');
  getDb().prepare(`UPDATE scrape_runs SET ${sets} WHERE id = ?`).run(...keys.map(k => data[k]), id);
}

// ─── Translate Batches ───

export function createTranslateBatch(batchFile, skillCount) {
  return getDb().prepare(`INSERT INTO translate_batches (batch_file, skill_count) VALUES (?, ?)`).run(batchFile, skillCount);
}

// ─── Stats ───

export function stats() {
  const db = getDb();
  return {
    total: db.prepare(`SELECT COUNT(*) as cnt FROM skills`).get().cnt,
    scrape: db.prepare(`SELECT scrape_status, COUNT(*) as cnt FROM skills GROUP BY scrape_status`).all(),
    filter: db.prepare(`SELECT CASE WHEN china_friendly = 1 THEN 'friendly' WHEN china_friendly = 0 THEN 'blocked' ELSE 'uneval' END as status, COUNT(*) as cnt FROM skills GROUP BY china_friendly`).all(),
    translate: db.prepare(`SELECT translate_status, COUNT(*) as cnt FROM skills WHERE china_friendly = 1 GROUP BY translate_status`).all(),
  };
}
