#!/usr/bin/env node
/**
 * Stage 3: 中国友好过滤
 * 对所有已下载的 skill 进行分类，标记 china_friendly
 *
 * 用法:  node stages/3-filter.js [--reset]
 *   --reset  重新评估所有已过滤的 skill
 */
import { getDownloadedUnfiltered, updateFilter, resetFilter, closeDb, stats } from '../lib/db.js';
import { classify } from '../lib/filter-rules.js';

const RESET = process.argv.includes('--reset');

function main() {
  console.log('╔══════════════════════════════════════╗');
  console.log('║  Stage 3: China-friendly filter      ║');
  console.log('╚══════════════════════════════════════╝');

  if (RESET) {
    const r = resetFilter();
    console.log(`  Reset ${r.changes} previously filtered skills`);
  }

  const skills = getDownloadedUnfiltered();
  console.log(`  Skills to evaluate: ${skills.length}`);

  if (skills.length === 0) {
    console.log('\n  Nothing to filter. Run stage 2 first or use --reset.');
    closeDb();
    return;
  }

  let friendly = 0;
  let blocked = 0;
  const blockBreakdown = {};

  for (const skill of skills) {
    const result = classify(skill);
    updateFilter(skill.slug, result.china_friendly, result.reason, JSON.stringify(result.tags));

    if (result.china_friendly) {
      friendly++;
    } else {
      blocked++;
      for (const tag of result.tags) {
        blockBreakdown[tag] = (blockBreakdown[tag] || 0) + 1;
      }
    }
  }

  const rate = ((friendly / (friendly + blocked)) * 100).toFixed(1);
  console.log(`\n  Results:`);
  console.log(`    ✅ Friendly: ${friendly}`);
  console.log(`    ❌ Blocked:  ${blocked}`);
  console.log(`    📊 Pass rate: ${rate}%`);

  if (Object.keys(blockBreakdown).length > 0) {
    console.log(`\n  Block breakdown:`);
    Object.entries(blockBreakdown)
      .sort((a, b) => b[1] - a[1])
      .forEach(([cat, cnt]) => console.log(`    ${cat}: ${cnt}`));
  }

  // Show overall stats
  const s = stats();
  console.log(`\n  Overall DB stats:`);
  console.log(`    Total skills: ${s.total}`);
  console.table(s.filter);

  console.log('\n  Next: node stages/4-prepare.js');
  closeDb();
}

main();
