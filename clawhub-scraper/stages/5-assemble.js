#!/usr/bin/env node
/**
 * Stage 5: 组装翻译结果
 * 读取 Kimi 翻译结果 JSONL，验证格式，写入 output/skills-cn/
 *
 * 用法:  node stages/5-assemble.js [results-dir]
 *   默认从 output/kimi-batches/ 读取 *-results.jsonl
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { resolve, join } from 'path';
import { config } from '../config.js';
import { markTranslated, markTranslateError, closeDb } from '../lib/db.js';

const resultsDir = process.argv[2] || resolve(config.outputDir, 'kimi-batches');

function validateSkillMd(slug, content) {
  const errors = [];
  if (!content || typeof content !== 'string') return { valid: false, errors: ['empty content'] };

  // Check frontmatter
  const trimmed = content.trimStart();
  if (!trimmed.startsWith('---')) errors.push('no frontmatter ---');

  const fmMatch = trimmed.match(/^---\s*\n([\s\S]*?)\n---/);
  if (fmMatch) {
    if (!fmMatch[1].includes('name:')) errors.push('missing name field');
    const descMatch = fmMatch[1].match(/description:\s*["']?(.+)/);
    if (descMatch && !/[\u4e00-\u9fff]/.test(descMatch[1])) errors.push('description not in Chinese');
  }

  // Check body has Chinese
  const bodyIdx = trimmed.indexOf('---', 4);
  if (bodyIdx > 0) {
    const body = trimmed.slice(bodyIdx + 3);
    if (!/[\u4e00-\u9fff]/.test(body)) errors.push('body has no Chinese');
  }

  return { valid: errors.length === 0, errors };
}

function main() {
  console.log('╔══════════════════════════════════════╗');
  console.log('║  Stage 5: Assemble translations      ║');
  console.log('╚══════════════════════════════════════╝');
  console.log(`  Results dir: ${resultsDir}`);

  let files;
  try {
    files = readdirSync(resultsDir).filter((f) => f.endsWith('-results.jsonl'));
  } catch (err) {
    console.error(`  ❌ Cannot read dir: ${err.message}`);
    process.exit(1);
  }

  if (files.length === 0) {
    console.log('  No *-results.jsonl files found.');
    console.log('  Upload batch files to Kimi, save results as batch-001-results.jsonl etc.');
    closeDb();
    return;
  }

  const outputDir = resolve(config.outputDir, 'skills-cn');
  mkdirSync(outputDir, { recursive: true });

  let assembled = 0;
  let warned = 0;
  let errored = 0;

  for (const file of files) {
    console.log(`\n  Processing: ${file}`);
    const raw = readFileSync(join(resultsDir, file), 'utf8');
    const lines = raw.trim().split('\n').filter(Boolean);

    for (const line of lines) {
      let parsed;
      try {
        parsed = JSON.parse(line);
      } catch {
        errored++;
        continue;
      }

      const slug = parsed.custom_id;
      if (!slug) { errored++; continue; }

      // Extract translated content from various response formats
      let translated =
        parsed.response?.body?.choices?.[0]?.message?.content ||
        parsed.choices?.[0]?.message?.content ||
        parsed.response?.choices?.[0]?.message?.content ||
        null;

      if (!translated) {
        markTranslateError(slug, 'No content in response');
        errored++;
        continue;
      }

      // Strip markdown code fences if LLM wrapped output
      translated = translated.replace(/^```(?:markdown|md|yaml)?\s*\n/, '').replace(/\n```\s*$/, '');

      // Validate
      const v = validateSkillMd(slug, translated);
      if (!v.valid) {
        console.warn(`    ⚠️ ${slug}: ${v.errors.join(', ')}`);
        warned++;
      }

      // Save to DB
      markTranslated(slug, translated);

      // Write to filesystem
      const skillDir = join(outputDir, slug);
      mkdirSync(skillDir, { recursive: true });
      writeFileSync(join(skillDir, 'SKILL.md'), translated, 'utf8');
      assembled++;
    }
  }

  console.log(`\n  ✅ Assembled: ${assembled} skills`);
  if (warned > 0) console.log(`  ⚠️ Warnings: ${warned} (written but may need review)`);
  if (errored > 0) console.log(`  ❌ Errors: ${errored}`);
  console.log(`  Output: ${outputDir}`);
  closeDb();
}

main();
