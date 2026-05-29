#!/usr/bin/env node
/**
 * Stage 2: 下载 SKILL.md
 * 使用 /file 端点直接获取 SKILL.md（快速，轻量）
 *
 * 用法:  node stages/2-download.js [--retry] [--limit N] [--concurrency N]
 */
import { config } from '../config.js';
import { pool } from '../lib/http.js';
import { getPendingDownloads, getFailedDownloads, resetFailed, markDownloaded, markDownloadFailed, closeDb } from '../lib/db.js';

const RETRY = process.argv.includes('--retry');
const limitIdx = process.argv.indexOf('--limit');
const LIMIT = limitIdx >= 0 ? parseInt(process.argv[limitIdx + 1], 10) : 0;
const concIdx = process.argv.indexOf('--concurrency');
const CONCURRENCY = concIdx >= 0 ? parseInt(process.argv[concIdx + 1], 10) : config.concurrency;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function downloadOne(slug) {
  const url = `${config.baseUrl}/skills/${encodeURIComponent(slug)}/file?path=SKILL.md`;

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });

      if (res.status === 429) {
        // 快速重试，不切换端点
        await sleep(500 + attempt * 300);
        continue;
      }

      if (res.status === 404) {
        throw new Error('404 not found');
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const content = await res.text();
      if (!content || content.length < 5) {
        throw new Error('empty response');
      }

      markDownloaded(slug, content, '["SKILL.md"]');
      return;
    } catch (err) {
      if (err.message === '404 not found') throw err;
      if (attempt === 4) throw err;
      await sleep(300 + attempt * 200);
    }
  }
}

async function main() {
  console.log('╔══════════════════════════════════════╗');
  console.log('║  Stage 2: Download SKILL.md (fast)   ║');
  console.log('╚══════════════════════════════════════╝');
  console.log(`  Concurrency: ${CONCURRENCY}`);
  console.log(`  Endpoint:    /file (direct, fast)`);

  if (RETRY) {
    const failed = getFailedDownloads();
    console.log(`  Retrying ${failed.length} previously failed downloads`);
    resetFailed();
  }

  const pending = getPendingDownloads(LIMIT);
  console.log(`  Pending: ${pending.length} skills`);

  if (pending.length === 0) {
    console.log('\n  Nothing to download.');
    closeDb();
    return;
  }

  const startTime = Date.now();
  const slugs = pending.map((r) => r.slug);

  const { done, errors } = await pool(
    slugs,
    CONCURRENCY,
    50,  // 50ms 间隔，最大化吞吐
    async (slug) => {
      try {
        await downloadOne(slug);
      } catch (err) {
        markDownloadFailed(slug, err.message);
        throw err;
      }
    },
    (completed, total, errCount) => {
      if (completed % 200 === 0 || completed === total) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        const rate = (completed / (Date.now() - startTime) * 1000).toFixed(1);
        process.stdout.write(`\r  ${completed}/${total} (${errCount} err) ${elapsed}s [${rate}/s]    `);
      }
    }
  );

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const ok = done - errors.length;
  console.log(`\n\n  Done: ${ok} ok, ${errors.length} failed in ${elapsed}s`);

  if (errors.length > 0 && errors.length <= 20) {
    errors.forEach(({ item, err }) => console.log(`    - ${item}: ${err.message}`));
  } else if (errors.length > 20) {
    errors.slice(0, 10).forEach(({ item, err }) => console.log(`    - ${item}: ${err.message}`));
    console.log(`    ... +${errors.length - 10} more. Use --retry to re-attempt`);
  }

  console.log('  Next: node stages/3-filter.js');
  closeDb();
}

main();
