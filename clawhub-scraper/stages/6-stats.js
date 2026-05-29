#!/usr/bin/env node
/**
 * Stage 6: 状态查询
 * 显示数据库中各阶段的统计信息
 *
 * 用法:  node stages/6-stats.js [--detail STAGE]
 *   --detail scrape    列出爬取失败的 skill
 *   --detail filter    列出被屏蔽的 skill（前 30）
 *   --detail translate 列出翻译状态
 */
import { getDb, stats, closeDb } from '../lib/db.js';

const detailIdx = process.argv.indexOf('--detail');
const detail = detailIdx >= 0 ? process.argv[detailIdx + 1] : null;

function main() {
  console.log('╔══════════════════════════════════════╗');
  console.log('║  Stage 6: Database Stats             ║');
  console.log('╚══════════════════════════════════════╝');

  const s = stats();
  console.log(`\n  Total skills in DB: ${s.total}\n`);

  console.log('  ── Scrape Status ──');
  console.table(s.scrape);

  console.log('  ── Filter Status ──');
  console.table(s.filter);

  console.log('  ── Translate Status ──');
  console.table(s.translate);

  // Detail views
  const db = getDb();

  if (detail === 'scrape') {
    console.log('\n  ── Failed Downloads (first 30) ──');
    const failed = db.prepare(`SELECT slug, scrape_error FROM skills WHERE scrape_status = 'download_failed' LIMIT 30`).all();
    if (failed.length === 0) {
      console.log('    None');
    } else {
      failed.forEach((r) => console.log(`    ${r.slug}: ${r.scrape_error}`));
    }
  }

  if (detail === 'filter') {
    console.log('\n  ── Blocked Skills (first 30) ──');
    const blocked = db.prepare(`SELECT slug, filter_reason FROM skills WHERE china_friendly = 0 LIMIT 30`).all();
    if (blocked.length === 0) {
      console.log('    None');
    } else {
      blocked.forEach((r) => console.log(`    ${r.slug}: ${r.filter_reason}`));
    }

    console.log('\n  ── Block Breakdown ──');
    const breakdown = db.prepare(`
      SELECT json_extract(filter_tags_json, '$[0]') as category, COUNT(*) as cnt
      FROM skills WHERE china_friendly = 0
      GROUP BY category ORDER BY cnt DESC
    `).all();
    console.table(breakdown);
  }

  if (detail === 'translate') {
    console.log('\n  ── Translation Batches ──');
    const batches = db.prepare(`SELECT * FROM translate_batches ORDER BY id`).all();
    if (batches.length === 0) {
      console.log('    No batches yet');
    } else {
      console.table(batches);
    }
  }

  if (!detail) {
    console.log('\n  Use --detail [scrape|filter|translate] for more info');
  }

  closeDb();
}

main();
