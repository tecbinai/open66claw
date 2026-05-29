/**
 * theme_light.cjs
 * 将 model-config.ts 的 CSS 从暗色主题替换为浅色毛玻璃主题
 * 只替换颜色/背景/阴影值，不碰布局、class名、HTML、交互逻辑
 */
const fs = require("fs");
const path = require("path");

const FILE = path.resolve(__dirname, "../ui-cn/src/ui/views/model-config.ts");
let src = fs.readFileSync(FILE, "utf8");

// ─── 精确替换映射（顺序无关，每对只替换 CSS 块内的值） ───

const replacements = [
  // ===== :host 块 =====
  // 在 :host 块添加背景 + 改文字色
  [
    `color: var(--text, #e8ecf1);\n    }`,
    `color: var(--text, #1a1a2e);\n      background: linear-gradient(180deg, #EEF3FA 0%, #F5F7FC 100%);\n    }`,
  ],

  // ===== 滚动条 =====
  [
    `background: var(--border, #2d3a4d); border-radius: 3px; }`,
    `background: #d1d5db; border-radius: 3px; }`,
  ],

  // ===== 文字颜色系列 =====
  // --text fallback (主文字)
  ["var(--text, #e8ecf1)", "var(--text, #1a1a2e)"],
  // --text-strong fallback (强调文字)
  ["var(--text-strong, #fff)", "var(--text-strong, #1a1a2e)"],
  // --muted fallback (次要文字)
  ["var(--muted, #8b9caf)", "var(--muted, #6b7280)"],
  // --muted-strong fallback
  ["var(--muted-strong, #6b7d91)", "var(--muted-strong, #9ca3af)"],

  // ===== 背景系列 =====
  // --card (卡片)
  ["var(--card, #1a2332)", "var(--card, rgba(255,255,255,0.7))"],
  // --surface (弹窗面板)
  ["var(--surface, #1a2332)", "var(--surface, rgba(255,255,255,0.92))"],
  // --surface-elevated (弹窗内区块)
  ["var(--surface-elevated, #1a2233)", "var(--surface-elevated, rgba(255,255,255,0.9))"],
  // --bg-elevated (图标底色/hover)
  ["var(--bg-elevated, #1c242e)", "var(--bg-elevated, rgba(0,0,0,0.03))"],
  // --bg-muted (输入框/下拉背景)
  ["var(--bg-muted, #2a3544)", "var(--bg-muted, #f3f4f6)"],
  // --bg-hover
  ["var(--bg-hover, #2a3544)", "var(--bg-hover, rgba(0,0,0,0.04))"],
  // --bg 系列
  ["var(--bg, #0f1419)", "var(--bg, #f3f4f6)"],
  ["var(--bg, #0f1724)", "var(--bg, #f3f4f6)"],

  // ===== 边框系列 =====
  ["var(--border, #2d3a4d)", "var(--border, rgba(0,0,0,0.06))"],
  ["var(--border-strong, #4a5a70)", "var(--border-strong, rgba(0,0,0,0.12))"],

  // ===== 强调色 =====
  ["var(--accent, #6c8cff)", "var(--accent, #4F8CFF)"],
  // accent-subtle 系列
  ["var(--accent-subtle, rgba(108,140,255,.1))", "var(--accent-subtle, rgba(79,140,255,.08))"],
  ["var(--accent-subtle, rgba(108,140,255,.12))", "var(--accent-subtle, rgba(79,140,255,.1))"],
  ["var(--accent-subtle, rgba(108,140,255,.15))", "var(--accent-subtle, rgba(79,140,255,.12))"],
  ["var(--accent-subtle, rgba(108,140,255,.08))", "var(--accent-subtle, rgba(79,140,255,.06))"],
  // 直接 rgba(108,140,255,...) 值
  ["rgba(108,140,255,.06)", "rgba(79,140,255,.04)"],
  ["rgba(108,140,255,.08)", "rgba(79,140,255,.06)"],
  ["rgba(108,140,255,.1)", "rgba(79,140,255,.08)"],
  ["rgba(108,140,255,.12)", "rgba(79,140,255,.1)"],
  ["rgba(108,140,255,.15)", "rgba(79,140,255,.12)"],
  ["rgba(108,140,255,.18)", "rgba(79,140,255,.14)"],
  ["rgba(108,140,255,.2)", "rgba(79,140,255,.15)"],
  ["rgba(108,140,255,.25)", "rgba(79,140,255,.2)"],
  ["rgba(108,140,255, 0.15)", "rgba(79,140,255, 0.12)"],

  // ===== 危险色 =====
  ["var(--danger, #f87171)", "var(--danger, #ef4444)"],
  ["var(--danger-subtle, rgba(248,113,113,.15))", "var(--danger-subtle, rgba(239,68,68,.08))"],
  ["rgba(248,113,113,.15)", "rgba(239,68,68,.08)"],
  ["rgba(248,113,113,.08)", "rgba(239,68,68,.05)"],
  ["rgba(248,113,113,.2)", "rgba(239,68,68,.12)"],
  ["rgba(248,113,113,.25)", "rgba(239,68,68,.15)"],
  ["rgba(248,113,113,.3)", "rgba(239,68,68,.18)"],

  // ===== 警告色 =====
  ["var(--warning, #fbbf24)", "var(--warning, #f59e0b)"],
  ["rgba(251,191,36,.06)", "rgba(245,158,11,.05)"],
  ["rgba(251,191,36,.12)", "rgba(245,158,11,.08)"],
  ["rgba(251,191,36,.15)", "rgba(245,158,11,.1)"],

  // ===== 成功色 =====
  ["var(--ok, #4ade80)", "var(--ok, #34d399)"],
  ["rgba(74,222,128,.12)", "rgba(52,211,153,.08)"],

  // ===== 阴影 =====
  ["var(--shadow-sm, 0 2px 8px rgba(0,0,0,.15))", "var(--shadow-sm, 0 2px 8px rgba(0,0,0,.06))"],
  ["var(--shadow-sm, 0 1px 3px rgba(0,0,0,.12))", "var(--shadow-sm, 0 1px 3px rgba(0,0,0,.05))"],
  ["var(--shadow-xl, 0 24px 48px rgba(0,0,0,.4))", "var(--shadow-xl, 0 20px 48px rgba(0,0,0,.12))"],
  ["0 8px 24px rgba(0,0,0,.3)", "0 8px 24px rgba(0,0,0,.1)"],

  // ===== 弹窗遮罩 =====
  [
    "background: rgba(0, 0, 0, 0.55); backdrop-filter: blur(6px);",
    "background: rgba(0, 0, 0, 0.25); backdrop-filter: blur(6px);",
  ],

  // ===== 按钮 =====
  // btn--primary：暗色主题用白色背景，改成橙色渐变
  [
    ".btn--primary { background: var(--text-strong, #1a1a2e); color: var(--bg, #f3f4f6); }",
    ".btn--primary { background: linear-gradient(135deg, #FF6B35, #FF8F5E); color: #fff; }",
  ],

  // ===== 半透明 hover 值 =====
  ["rgba(255,255,255,.04)", "rgba(0,0,0,.03)"],
  ["rgba(255,255,255,.06)", "rgba(0,0,0,.04)"],

  // ===== 毛玻璃效果 =====
  // cap-card 添加 backdrop-filter
  [
    "border-radius: var(--radius-lg, 12px);\n      padding: 16px; cursor: pointer;\n      transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s;",
    "border-radius: var(--radius-lg, 12px);\n      padding: 16px; cursor: pointer; backdrop-filter: blur(12px);\n      transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s;",
  ],
  // modal 添加 backdrop-filter
  [
    "border-radius: var(--radius-lg, 12px);\n      max-width: 520px; width: 94%; max-height: 80vh; overflow-y: auto;",
    "border-radius: var(--radius-lg, 12px); backdrop-filter: blur(20px);\n      max-width: 520px; width: 94%; max-height: 80vh; overflow-y: auto;",
  ],
  // ms-dropdown 添加 backdrop-filter
  [
    "border-radius: 8px; padding: 4px; z-index: 10;\n      box-shadow:",
    "border-radius: 8px; padding: 4px; z-index: 10; backdrop-filter: blur(16px);\n      box-shadow:",
  ],
  // prov-row 背景改毛玻璃
  [
    "padding: 12px 14px; background: var(--card, rgba(255,255,255,0.7));\n      border: 1px solid var(--border, rgba(0,0,0,0.06));",
    "padding: 12px 14px; background: var(--card, rgba(255,255,255,0.7)); backdrop-filter: blur(10px);\n      border: 1px solid var(--border, rgba(0,0,0,0.06));",
  ],
  // onboarding 背景减淡
  [
    "background: linear-gradient(135deg, rgba(108,140,255,.1) 0%, rgba(52,211,153,.08) 100%);",
    "background: linear-gradient(135deg, rgba(79,140,255,.06) 0%, rgba(52,211,153,.04) 100%);",
  ],
  // sf-banner 背景减淡
  [
    "background: linear-gradient(135deg, rgba(168,85,247,.1) 0%, rgba(108,140,255,.08) 100%);",
    "background: linear-gradient(135deg, rgba(168,85,247,.06) 0%, rgba(79,140,255,.04) 100%);",
  ],
  ["rgba(168,85,247,.3)", "rgba(168,85,247,.15)"],

  // le-global-rec 渐变
  [
    "background: linear-gradient(135deg, rgba(108,140,255,.08) 0%, rgba(52,211,153,.06) 100%);",
    "background: linear-gradient(135deg, rgba(79,140,255,.05) 0%, rgba(52,211,153,.03) 100%);",
  ],
];

// ─── 执行替换 ───
let count = 0;
for (const [from, to] of replacements) {
  if (from === to) continue;
  // 全局替换
  const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(escaped, "g");
  const before = src;
  src = src.replace(re, to);
  if (src !== before) {
    const hits = (before.match(re) || []).length;
    count += hits;
  }
}

fs.writeFileSync(FILE, src, "utf8");
console.log(`Done. ${count} replacements applied.`);
console.log(`File: ${FILE}`);
