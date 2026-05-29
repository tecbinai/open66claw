#!/usr/bin/env node
/**
 * Stage 1: 列表爬取
 * 遍历 ClawHub API 分页接口，把所有 skill 元数据存入 SQLite
 *
 * 用法:  node stages/1-list.js [--resume]
 *   --resume  从上次中断的 cursor 继续
 */
import { config } from '../config.js';
import { fetchRetry } from '../lib/http.js';
import { upsertSkillsBatch, createScrapeRun, getLastScrapeRun, updateScrapeRun, closeDb } from '../lib/db.js';

const RESUME = process.argv.includes('--resume');

async function main() {
  console.log('╔══════════════════════════════════════╗');
  console.log('║  Stage 1: List all ClawHub skills    ║');
  console.log('╚══════════════════════════════════════╝');
  console.log(`  API:    ${config.baseUrl}`);
  console.log(`  Limit:  ${config.listingLimit} per page`);
  console.log(`  Resume: ${RESUME}`);

  let cursor = null;
  let runId;

  // Resume support
  if (RESUME) {
    const last = getLastScrapeRun();
    if (last && last.status !== 'completed' && last.last_cursor) {
      cursor = last.last_cursor;
      runId = last.id;
      console.log(`  Resuming from cursor: ${cursor.slice(0, 20)}...`);
    } else {
      console.log('  No interrupted run found, starting fresh');
    }
  }
  if (!runId) runId = createScrapeRun('listing');

  let page = 0;
  let total = 0;
  let batch = [];
  const startTime = Date.now();

  try {
    do {
      const url = new URL(`${config.baseUrl}/skills`);
      url.searchParams.set('limit', String(config.listingLimit));
      if (cursor) url.searchParams.set('cursor', cursor);

      const res = await fetchRetry(url.toString());
      if (!res || !res.ok) {
        const body = res ? await res.text().catch(() => '') : '';
        throw new Error(`API error ${res?.status}: ${body.slice(0, 200)}`);
      }

      const data = await res.json();
      page++;

      const items = data.items || data.results || data.skills || [];
      if (items.length === 0) break;

      for (const item of items) {
        // Safely stringify any non-primitive fields
        const safeStr = (v) => v == null ? null : typeof v === 'string' ? v : JSON.stringify(v);
        batch.push({
          slug: item.slug || item.name || item._id,
          display_name: item.displayName || item.name || item.slug || '',
          summary: item.summary || item.description || '',
          tags_json: safeStr(item.tags || []),
          stats_json: safeStr(item.stats || { downloads: 0, stars: 0 }),
          metadata_json: safeStr(item.metadata || {}),
          license: item.license || null,
          homepage: item.homepage || null,
          created_at: item.createdAt || item._creationTime || null,
          updated_at: item.updatedAt || item._creationTime || null,
          latest_version: safeStr(item.latestVersion),
        });
        total++;
      }

      // Flush batch
      if (batch.length >= 200) {
        upsertSkillsBatch(batch);
        batch = [];
      }

      // Save cursor for resume
      cursor = data.nextCursor || data.cursor || data.continueCursor || null;
      updateScrapeRun(runId, { last_cursor: cursor || '', total_listed: total });

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      process.stdout.write(`\r  Page ${page}: ${total} skills total (${elapsed}s)`);

      // Small delay between pages
      await new Promise((r) => setTimeout(r, 500));
    } while (cursor);

    // Flush remaining
    if (batch.length > 0) upsertSkillsBatch(batch);

    updateScrapeRun(runId, { status: 'completed', total_listed: total, finished_at: new Date().toISOString() });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n\n  ✅ Done: ${total} skills listed in ${elapsed}s (${page} pages)`);
    console.log('  Next: node stages/2-download.js');
  } catch (err) {
    // Save progress on crash
    updateScrapeRun(runId, { status: 'interrupted', total_listed: total });
    if (batch.length > 0) {
      try { upsertSkillsBatch(batch); } catch {}
    }
    console.error(`\n\n  ❌ Error at page ${page}: ${err.message}`);
    console.error('  Run with --resume to continue from where we left off');
    process.exit(1);
  } finally {
    closeDb();
  }
}

main();
