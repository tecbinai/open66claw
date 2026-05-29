#!/usr/bin/env node

/**
 * Plugin API Surface 快照工具
 *
 * 从上游代码中提取 Plugin API 结构（hook names、注册方法、SDK 导出），
 * 并与已有快照对比，发现 breaking change 和新能力。
 *
 * 用法:
 *   node scripts/upstream-watch/snapshot-api.mjs          # 生成新快照
 *   node scripts/upstream-watch/snapshot-api.mjs --diff   # 对比差异
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const API_SURFACE_FILE = join(ROOT, "dev", "upstream-tracking", "api-surface.json");
const TYPES_FILE = join(ROOT, "src", "plugins", "types.ts");
const HOOKS_FILE = join(ROOT, "src", "plugins", "hooks.ts");
const SDK_CHECK_FILE = join(ROOT, "scripts", "check-plugin-sdk-exports.mjs");
const VERSION_FILE = join(ROOT, ".openclaw-version");

const diffMode = process.argv.includes("--diff");

// ─── Extract hook names from types.ts ───────────────────

function extractHookNames(source) {
  // Match: PluginHookName = "xxx" | "yyy" | ...
  // or individual string literals in the union type
  const hookPattern = /"([a-z_]+)"/g;
  const hookSection = source.match(/PluginHookName\s*=[\s\S]*?;/);
  if (!hookSection) return [];

  const hooks = [];
  let m;
  while ((m = hookPattern.exec(hookSection[0])) !== null) {
    hooks.push(m[1]);
  }
  return [...new Set(hooks)];
}

// ─── Extract register methods from types.ts ─────────────

function extractRegisterMethods(source) {
  const methods = [];
  // Match method declarations in OpenClawPluginApi interface
  // May be: "export type OpenClawPluginApi = {" or "export interface OpenClawPluginApi {"
  const apiSection = source.match(
    /(?:export\s+)?(?:type|interface)\s+OpenClawPluginApi\s*=?\s*\{[\s\S]*?\n\}/,
  );
  if (!apiSection) return methods;

  // Match: registerXxx: / registerXxx( / resolvePath: / on(
  const methodPattern = /^\s+(register\w+|resolvePath|on)\s*[\(:<]/gm;
  let m;
  while ((m = methodPattern.exec(apiSection[0])) !== null) {
    methods.push(m[1]);
  }
  return [...new Set(methods)];
}

// ─── Extract hook categories from hooks.ts ──────────────

function extractHookCategories(source) {
  const categories = { modifying: [], void: [], sync: [] };
  let m;

  // runModifyingHook calls
  // Patterns in hooks.ts:
  //   return runModifyingHook<"before_model_resolve", ...>(
  //   return runModifyingHook<"before_tool_call", ...>(
  const modifyingPattern = /runModifyingHook\w*<\s*["'](\w+)["']/g;
  while ((m = modifyingPattern.exec(source)) !== null) {
    categories.modifying.push(m[1]);
  }

  // runVoidHook calls
  // Pattern: return runVoidHook("agent_end", event, ctx);
  const voidPattern = /runVoidHook\w*\(\s*["'](\w+)["']/g;
  while ((m = voidPattern.exec(source)) !== null) {
    categories.void.push(m[1]);
  }

  // Sync hooks — detected by their dedicated runner functions and string references
  if (source.includes("tool_result_persist")) categories.sync.push("tool_result_persist");
  if (source.includes("before_message_write")) categories.sync.push("before_message_write");

  return {
    modifying: [...new Set(categories.modifying)],
    void: [...new Set(categories.void)],
    sync: [...new Set(categories.sync)],
  };
}

// ─── Extract SDK exports from check script ──────────────

function extractSdkExports(source) {
  const exports = [];
  const subpaths = [];

  // requiredExports array (camelCase in actual file)
  const exportsMatch = source.match(/(?:const\s+)?requiredExports\s*=\s*\[([\s\S]*?)\]/);
  if (exportsMatch) {
    const strPattern = /["'](\w+)["']/g;
    let m;
    while ((m = strPattern.exec(exportsMatch[1])) !== null) {
      exports.push(m[1]);
    }
  }

  // requiredSubpathEntries array (camelCase in actual file)
  const subpathsMatch = source.match(/(?:const\s+)?requiredSubpathEntries\s*=\s*\[([\s\S]*?)\]/);
  if (subpathsMatch) {
    const strPattern = /["']([\w-]+)["']/g;
    let m;
    while ((m = strPattern.exec(subpathsMatch[1])) !== null) {
      subpaths.push(m[1]);
    }
  }

  return { exports, subpaths };
}

// ─── Diff two snapshots ─────────────────────────────────

function diffArrays(label, oldArr, newArr) {
  const oldSet = new Set(oldArr);
  const newSet = new Set(newArr);
  const added = newArr.filter((x) => !oldSet.has(x));
  const removed = oldArr.filter((x) => !newSet.has(x));

  if (added.length === 0 && removed.length === 0) return null;

  return {
    label,
    added,
    removed,
    breaking: removed.length > 0,
  };
}

function diffSnapshots(oldSnap, newSnap) {
  const diffs = [];

  // Hook names
  const oldHooks = [
    ...(oldSnap.hookNames?.modifying || []),
    ...(oldSnap.hookNames?.void || []),
    ...(oldSnap.hookNames?.sync || []),
  ];
  const newHooks = [
    ...(newSnap.hookNames?.modifying || []),
    ...(newSnap.hookNames?.void || []),
    ...(newSnap.hookNames?.sync || []),
  ];
  const hookDiff = diffArrays("PluginHookName", oldHooks, newHooks);
  if (hookDiff) diffs.push(hookDiff);

  // Register methods
  const methodDiff = diffArrays(
    "OpenClawPluginApi methods",
    oldSnap.registerMethods || [],
    newSnap.registerMethods || [],
  );
  if (methodDiff) diffs.push(methodDiff);

  // SDK exports
  const exportDiff = diffArrays(
    "plugin-sdk exports",
    oldSnap.pluginSdkExports || [],
    newSnap.pluginSdkExports || [],
  );
  if (exportDiff) diffs.push(exportDiff);

  // SDK subpaths
  const subpathDiff = diffArrays(
    "plugin-sdk subpaths",
    oldSnap.pluginSdkSubpaths || [],
    newSnap.pluginSdkSubpaths || [],
  );
  if (subpathDiff) diffs.push(subpathDiff);

  // Check if any of our used hooks were removed
  const cnUsedHooks = oldSnap.cnAdapterUsedHooks || [];
  const removedUsedHooks = cnUsedHooks.filter((h) => !newHooks.includes(h));

  return {
    diffs,
    hasBreaking: diffs.some((d) => d.breaking),
    removedUsedHooks,
    criticalBreaking: removedUsedHooks.length > 0,
    summary:
      diffs.length === 0
        ? "API surface 无变化"
        : diffs
            .map(
              (d) =>
                `${d.label}: +${d.added.length} -${d.removed.length}${d.breaking ? " ⚠️ BREAKING" : ""}`,
            )
            .join(", "),
  };
}

// ─── Main ───────────────────────────────────────────────

function main() {
  // Build new snapshot from current codebase
  const newSnap = {
    snapshotDate: new Date().toISOString().slice(0, 10),
    sourceFile: "src/plugins/types.ts",
  };

  // Read .openclaw-version
  if (existsSync(VERSION_FILE)) {
    const [commit, version] = readFileSync(VERSION_FILE, "utf-8").trim().split(/\s+/);
    newSnap.snapshotCommit = commit;
    newSnap.snapshotVersion = version;
  }

  // Extract from types.ts
  if (existsSync(TYPES_FILE)) {
    const typesSource = readFileSync(TYPES_FILE, "utf-8");
    const allHooks = extractHookNames(typesSource);
    newSnap.registerMethods = extractRegisterMethods(typesSource);

    // Get categories from hooks.ts
    if (existsSync(HOOKS_FILE)) {
      const hooksSource = readFileSync(HOOKS_FILE, "utf-8");
      newSnap.hookNames = extractHookCategories(hooksSource);

      // Ensure all hooks are categorized
      const categorized = new Set([
        ...newSnap.hookNames.modifying,
        ...newSnap.hookNames.void,
        ...newSnap.hookNames.sync,
      ]);
      const uncategorized = allHooks.filter((h) => !categorized.has(h));
      if (uncategorized.length > 0) {
        console.warn(`Uncategorized hooks: ${uncategorized.join(", ")}`);
      }
    }

    newSnap.hookNames = newSnap.hookNames || { modifying: [], void: [], sync: [] };
    newSnap.hookNames.total =
      newSnap.hookNames.modifying.length +
      newSnap.hookNames.void.length +
      newSnap.hookNames.sync.length;
  }

  // Extract from check-plugin-sdk-exports.mjs
  if (existsSync(SDK_CHECK_FILE)) {
    const sdkSource = readFileSync(SDK_CHECK_FILE, "utf-8");
    const { exports, subpaths } = extractSdkExports(sdkSource);
    newSnap.pluginSdkExports = exports;
    newSnap.pluginSdkSubpaths = subpaths;
  }

  if (diffMode) {
    // Load old snapshot and diff
    if (!existsSync(API_SURFACE_FILE)) {
      console.error("No existing api-surface.json to diff against");
      process.exitCode = 1;
      return;
    }

    const oldSnap = JSON.parse(readFileSync(API_SURFACE_FILE, "utf-8"));
    // Preserve cnAdapterUsedHooks from old snapshot
    newSnap.cnAdapterUsedHooks = oldSnap.cnAdapterUsedHooks || [];

    const result = diffSnapshots(oldSnap, newSnap);

    console.log("\n" + "=".repeat(50));
    console.log("  API Surface Diff");
    console.log("  Old: " + (oldSnap.snapshotVersion || "unknown"));
    console.log("  New: " + (newSnap.snapshotVersion || "current"));
    console.log("=".repeat(50));

    if (result.diffs.length === 0) {
      console.log("  ✅ 无变化");
    } else {
      for (const d of result.diffs) {
        console.log(`\n  ${d.label}:`);
        if (d.added.length > 0) console.log(`    + Added: ${d.added.join(", ")}`);
        if (d.removed.length > 0) console.log(`    - Removed: ${d.removed.join(", ")}`);
        if (d.breaking) console.log(`    ⚠️  BREAKING CHANGE`);
      }
    }

    if (result.removedUsedHooks.length > 0) {
      console.log(
        `\n  🔴 CRITICAL: cn-adapter 使用的 hook 被移除: ${result.removedUsedHooks.join(", ")}`,
      );
    }

    console.log("\n" + "=".repeat(50));
    console.log(`  Summary: ${result.summary}`);

    // GitHub Actions output
    if (process.env.GITHUB_OUTPUT) {
      const outputs = [
        `api_changed=${result.diffs.length > 0}`,
        `has_breaking=${result.hasBreaking}`,
        `critical_breaking=${result.criticalBreaking}`,
        `diff_summary=${result.summary}`,
      ];
      writeFileSync(process.env.GITHUB_OUTPUT, outputs.join("\n") + "\n", {
        flag: "a",
      });
    }

    if (result.criticalBreaking) process.exitCode = 2;
    else if (result.hasBreaking) process.exitCode = 1;
  } else {
    // Just save new snapshot
    // Preserve cnAdapterUsedHooks from existing file
    if (existsSync(API_SURFACE_FILE)) {
      const old = JSON.parse(readFileSync(API_SURFACE_FILE, "utf-8"));
      newSnap.cnAdapterUsedHooks = old.cnAdapterUsedHooks || [];
    }

    writeFileSync(API_SURFACE_FILE, JSON.stringify(newSnap, null, 2));
    console.log(`API surface snapshot saved to ${API_SURFACE_FILE}`);
    console.log(`  Hooks: ${newSnap.hookNames?.total || 0}`);
    console.log(`  Register methods: ${newSnap.registerMethods?.length || 0}`);
    console.log(`  SDK exports: ${newSnap.pluginSdkExports?.length || 0}`);
    console.log(`  SDK subpaths: ${newSnap.pluginSdkSubpaths?.length || 0}`);
  }
}

main();
