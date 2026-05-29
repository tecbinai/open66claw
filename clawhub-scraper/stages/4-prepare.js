#!/usr/bin/env node
/**
 * Stage 4: 生成翻译批次
 * 把通过过滤的 skill 打包成 JSONL 批次文件，供 Kimi API 翻译
 *
 * 用法:  node stages/4-prepare.js [--batch-size N]
 */
import { writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { config } from '../config.js';
import { getChinaFriendlyPending, markTranslateQueued, createTranslateBatch, closeDb } from '../lib/db.js';

const bsIdx = process.argv.indexOf('--batch-size');
const batchSize = bsIdx >= 0 ? parseInt(process.argv[bsIdx + 1], 10) : config.batchSize;

const SYSTEM_PROMPT = `You are a professional translator for developer tools documentation.
Translate the following OpenClaw SKILL.md from English to Simplified Chinese.

RULES:
1. TRANSLATE: title (# heading), description in YAML frontmatter, section headings, narrative text
2. KEEP ENGLISH: code blocks (\`\`\`), inline code (\`...\`), URLs, commands, variable names, file paths, JSON keys, CLI flags, tool names
3. KEEP UNCHANGED: metadata JSON in frontmatter, emoji, YAML --- delimiters
4. Frontmatter "name" field: keep original slug
5. Frontmatter "description": translate to Chinese
6. Output ONLY the translated SKILL.md, no explanation
7. Maintain exact Markdown formatting
8. Use natural fluent Chinese`;

function main() {
  console.log('╔══════════════════════════════════════╗');
  console.log('║  Stage 4: Prepare translation batch  ║');
  console.log('╚══════════════════════════════════════╝');
  console.log(`  Batch size: ${batchSize}`);

  const skills = getChinaFriendlyPending();
  console.log(`  Skills pending translation: ${skills.length}`);

  if (skills.length === 0) {
    console.log('\n  Nothing to prepare. Run stage 3 first.');
    closeDb();
    return;
  }

  const batchDir = resolve(config.outputDir, 'kimi-batches');
  mkdirSync(batchDir, { recursive: true });

  let batchNum = 0;
  let totalQueued = 0;

  for (let i = 0; i < skills.length; i += batchSize) {
    batchNum++;
    const chunk = skills.slice(i, i + batchSize);
    const batchFile = `batch-${String(batchNum).padStart(3, '0')}.jsonl`;
    const batchPath = resolve(batchDir, batchFile);

    const lines = chunk.map((s) =>
      JSON.stringify({
        custom_id: s.slug,
        method: 'POST',
        url: '/v1/chat/completions',
        body: {
          model: 'moonshot-v1-128k',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: s.skill_md_raw },
          ],
          temperature: 0.3,
        },
      })
    );

    writeFileSync(batchPath, lines.join('\n') + '\n', 'utf8');
    markTranslateQueued(chunk.map((s) => s.slug), batchFile);
    createTranslateBatch(batchFile, chunk.length);
    totalQueued += chunk.length;

    console.log(`  ${batchFile}: ${chunk.length} skills`);
  }

  console.log(`\n  ✅ Created ${batchNum} batch files, ${totalQueued} skills queued`);
  console.log(`  Output: ${batchDir}`);
  console.log('\n  Next steps:');
  console.log('    1. Upload batch files to Kimi API');
  console.log('    2. Place results as *-results.jsonl in the same dir');
  console.log('    3. Run: node stages/5-assemble.js');
  closeDb();
}

main();
