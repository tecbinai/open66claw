#!/usr/bin/env node
// Fix extension package.json entries: remove setupEntry if the referenced file doesn't exist.
// Called by stage-dist.sh after bundling. Bundled extensions have only index.js,
// so setupEntry pointing to setup-entry.js would fail gateway's boundary check.
// Usage: node fix-extension-entries.mjs <extensions-dir>
// Output: number of removed entries (stdout)
import fs from 'fs';
import path from 'path';

const extensionsDir = process.argv[2];
if (!extensionsDir || !fs.existsSync(extensionsDir)) {
  process.stdout.write('0\n');
  process.exit(0);
}

let removed = 0;

for (const extName of fs.readdirSync(extensionsDir)) {
  const pkgPath = path.join(extensionsDir, extName, 'package.json');
  if (!fs.existsSync(pkgPath)) continue;

  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  } catch (e) {
    continue;
  }

  // Check top-level setupEntry and openclaw.setupEntry
  const topLevel = pkg.setupEntry;
  const nested = pkg.openclaw && pkg.openclaw.setupEntry;
  const setupEntry = topLevel || nested;

  if (!setupEntry) continue;

  const setupFile = path.join(extensionsDir, extName, setupEntry);
  if (fs.existsSync(setupFile)) continue;

  // File doesn't exist - remove the setupEntry field
  let changed = false;
  if (pkg.setupEntry) {
    delete pkg.setupEntry;
    changed = true;
  }
  if (pkg.openclaw && pkg.openclaw.setupEntry) {
    delete pkg.openclaw.setupEntry;
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
    removed++;
  }
}

process.stdout.write(removed + '\n');
