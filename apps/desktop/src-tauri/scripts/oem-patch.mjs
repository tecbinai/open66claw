#!/usr/bin/env node
// OEM patch script: called by stage-dist.sh
// Usage: node oem-patch.mjs <oem.json> <splash.html> <oem-runtime.json> <index.html>
import fs from 'fs';
import path from 'path';

const [, , oemPath, splashPath, runtimePath, indexPath] = process.argv;

try {
  const oem = JSON.parse(fs.readFileSync(oemPath, 'utf8'));
  const name = oem.displayName || '66Claw';
  const oemId = oem.oemId || 'default';

  // --- patch splash.html ---
  let html = fs.readFileSync(splashPath, 'utf8');
  html = html.replace(/66Claw/g, name);
  html = html.replace(/小圆claw/g, name);
  html = html.replace(/XiaoYuanClaw/g, name);
  html = html.replace(/xiaoyuanclaw/g, name);
  const logoPath = '/oem/' + oemId + '/logo_main.png';
  // Replace logo: img src update (already structured as logo-wrap)
  html = html.replace(/src="\/oem\/[^"]+"/g, 'src="' + logoPath + '"');
  // Replace logo-emoji placeholder with img (new logo-wrap structure)
  html = html.replace(/<div class="logo-emoji">[^<]*<\/div>/, '<img src="' + logoPath + '" />');
  fs.writeFileSync(splashPath, html, 'utf8');

  // --- patch index.html title & description ---
  if (indexPath && fs.existsSync(indexPath)) {
    let idx = fs.readFileSync(indexPath, 'utf8');
    idx = idx.replace(/<title>[^<]*<\/title>/, '<title>' + name + '</title>');
    idx = idx.replace(/content="66Claw[^"]*"/g, 'content="' + name + ' - 智能 AI 助手"');
    idx = idx.replace(/content="小圆claw[^"]*"/g, 'content="' + name + ' - 智能 AI 助手"');
    idx = idx.replace(/content="XiaoYuanClaw[^"]*"/g, 'content="' + name + ' - 智能 AI 助手"');
    fs.writeFileSync(indexPath, idx, 'utf8');
  }

  // --- write oem runtime json ---
  const runtime = { oemId, displayName: name };
  fs.writeFileSync(runtimePath, JSON.stringify(runtime, null, 2), 'utf8');

  // --- patch CLI wrappers ---
  const distDir = path.dirname(runtimePath);
  for (const f of ['openclaw', 'openclaw.cmd']) {
    const p = path.join(distDir, f);
    if (fs.existsSync(p)) {
      let txt = fs.readFileSync(p, 'utf8');
      txt = txt.replace(/66Claw/g, name);
      fs.writeFileSync(p, txt, 'utf8');
    }
  }

  console.log('[stage-dist] OEM: patched splash.html + index.html + oem.json + CLI wrappers (brand=' + name + ')');
} catch (e) {
  console.error('[stage-dist] OEM patch failed:', e.message);
  process.exit(1);
}
