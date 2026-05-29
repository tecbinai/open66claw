#!/usr/bin/env node
/**
 * Transpile all .ts files in a directory to .js (ESM, no bundling).
 * Used by stage-dist.sh to make src/ files loadable by native ESM
 * Bundled desktop builds load compiled JavaScript directly.
 *
 * Usage: node transpile-src.mjs <src-directory>
 */
import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";

// --keep-ts flag: transpile but don't delete .ts source files (useful when
// other modules still need them, e.g. extensions referencing src/*.ts)
const keepTs = process.argv.includes("--keep-ts");
const nonFlagArgs = process.argv.slice(2).filter(a => !a.startsWith("--"));
const srcDir = path.resolve(nonFlagArgs[0]);
if (!fs.existsSync(srcDir)) {
  console.error(`Directory not found: ${srcDir}`);
  process.exit(1);
}

function collectTs(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectTs(full));
    } else if (
      entry.name.endsWith(".ts") &&
      !entry.name.endsWith(".d.ts") &&
      !entry.name.endsWith(".test.ts") &&
      !entry.name.endsWith(".test-d.ts")
    ) {
      results.push(full);
    }
  }
  return results;
}

const tsFiles = collectTs(srcDir);
if (tsFiles.length === 0) {
  console.log("  [transpile-src] No .ts files found");
  process.exit(0);
}

// Helper: rewrite .ts import/export specifiers → .js in a file's content
function rewriteSpecifiers(content) {
  return content
    .replace(/((?:from|import)\s+["'])([^"']+)\.ts(["'])/g, "$1$2.js$3")
    .replace(/(import\s*\(\s*["'])([^"']+)\.ts(["'])/g, "$1$2.js$3")
    .replace(/(export\s+\*\s+from\s+["'])([^"']+)\.ts(["'])/g, "$1$2.js$3");
}

// Pre-process: rewrite .ts specifiers in source .ts files before compilation.
// This ensures esbuild sees .js references and the compiled output is correct.
let preRewriteCount = 0;
for (const tsFile of tsFiles) {
  const original = fs.readFileSync(tsFile, "utf8");
  const rewritten = rewriteSpecifiers(original);
  if (rewritten !== original) {
    fs.writeFileSync(tsFile, rewritten, "utf8");
    preRewriteCount++;
  }
}

await build({
  entryPoints: tsFiles,
  outdir: srcDir,
  outbase: srcDir,
  format: "esm",
  platform: "node",
  target: "node22",
  allowOverwrite: true,
  logLevel: "warning",
});

// Post-process: also rewrite any remaining .ts specifiers in compiled .js files
// (in case some were missed by the pre-process pass, e.g. in .ts files not in tsFiles).
function collectJs(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...collectJs(full));
    else if (entry.name.endsWith(".js")) results.push(full);
  }
  return results;
}

const jsFiles = collectJs(srcDir);
let postRewriteCount = 0;
for (const jsFile of jsFiles) {
  const original = fs.readFileSync(jsFile, "utf8");
  const rewritten = rewriteSpecifiers(original);
  if (rewritten !== original) {
    fs.writeFileSync(jsFile, rewritten, "utf8");
    postRewriteCount++;
  }
}

// Remove source .ts files so jiti/native-ESM always loads the compiled .js.
// jiti resolves extensions in order ([".ts", ..., ".js"]) so if .ts exists it
// wins — deleting it forces the .js to be used instead.
// When --keep-ts is used, skip deletion (caller will handle it later).
if (!keepTs) {
  for (const tsFile of tsFiles) {
    try { fs.unlinkSync(tsFile); } catch { /* ignore */ }
  }
}

const totalRewrite = preRewriteCount + postRewriteCount;
const keptNote = keepTs ? ", .ts sources kept (--keep-ts)" : ", removed .ts sources";
console.log(`  [transpile-src] Transpiled ${tsFiles.length} .ts → ${jsFiles.length} .js files (rewrote ${totalRewrite} import paths${keptNote})`);
