#!/usr/bin/env node
/**
 * Fix .ts import specifiers in compiled .js files.
 *
 * After transpiling .ts → .js, some compiled files still contain
 * `from "...foo.ts"` specifiers because esbuild does not rewrite them.
 * jiti resolves extensions in order [".ts", ".js"], so if .ts exists it
 * wins — causing "Unknown file extension .ts" errors in native ESM chains.
 *
 * This script rewrites all `.ts` specifiers to `.js` in:
 *   - _dist/src/**\/*.js
 *   - _dist/extensions/**\/*.js
 *
 * Usage: node fix-ts-imports.mjs <_dist-directory>
 */
import fs from "node:fs";
import path from "node:path";

const distDir = path.resolve(process.argv[2] ?? ".");

function rewriteSpecifiers(content) {
  return content
    .replace(/((?:from|import)\s+["'])([^"']+)\.ts(["'])/g, "$1$2.js$3")
    .replace(/(import\s*\(\s*["'])([^"']+)\.ts(["'])/g, "$1$2.js$3")
    .replace(/(export\s+\*\s+from\s+["'])([^"']+)\.ts(["'])/g, "$1$2.js$3");
}

let fixedCount = 0;

function processDir(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      processDir(full);
    } else if (entry.name.endsWith(".js")) {
      const original = fs.readFileSync(full, "utf8");
      const rewritten = rewriteSpecifiers(original);
      if (rewritten !== original) {
        fs.writeFileSync(full, rewritten, "utf8");
        fixedCount++;
      }
    }
  }
}

processDir(path.join(distDir, "src"));
processDir(path.join(distDir, "extensions"));

console.log(`  [fix-ts-imports] Fixed ${fixedCount} .js files with .ts specifiers`);
