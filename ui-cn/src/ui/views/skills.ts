/**
 * Skills page — dual-tab layout:
 *   1. 技能管理 (local skills, tier-based layout with drag-and-drop)
 *   2. 技能市场 (marketplace search with FTS5 pagination)
 *
 * All user-facing strings use i18n via t().
 */
import { html, nothing } from "lit";
import type {
  BrowseResult,
  InstallProgress,
  SkillMessageMap,
  SkillsMarketSearchResult,
} from "../controllers/skills.ts";
import { clampText } from "../format.ts";
import { t } from "../i18n/index.js";
import type { SkillStatusEntry, SkillStatusReport } from "../types.ts";
import { groupByTier, type SkillGroup, type TierGroupId } from "./skills-grouping.ts";
import {
  computeSkillMissing,
  computeSkillReasons,
  renderIncompatibleBadge,
} from "./skills-shared.ts";

// ============================================================================
// Types
// ============================================================================

export type SkillsProps = {
  // ---- local skills ----
  loading: boolean;
  report: SkillStatusReport | null;
  error: string | null;
  filter: string;
  edits: Record<string, string>;
  busyKey: string | null;
  messages: SkillMessageMap;
  /** Monotonic counter bumped to force re-render (e.g., "Load More" pagination) */
  tierRenderKey: number;
  onTierRenderBump: () => void;
  onFilterChange: (next: string) => void;
  onRefresh: () => void;
  onToggle: (skillKey: string, enabled: boolean) => void;
  onEdit: (skillKey: string, value: string) => void;
  onSaveKey: (skillKey: string) => void;
  onInstall: (skillKey: string, name: string, installId: string) => void;
  // ---- core skills drag-and-drop ----
  onPromoteToCore: (skillKey: string) => void;
  onDemoteFromCore: (skillKey: string) => void;
  coreCount: number;
  coreMax: number;
  // ---- marketplace ----
  activeTab: "local" | "market";
  onTabChange: (tab: "local" | "market") => void;
  marketLoading: boolean;
  marketError: string | null;
  marketSearchResult: SkillsMarketSearchResult | null;
  marketCategory: string;
  installProgress: Record<string, InstallProgress>;
  onMarketSearch: (keyword: string) => void;
  onMarketCategoryChange: (category: string) => void;
  onMarketLoadMore: () => void;
  hasMorePages: boolean;
  onMarketInstall: (skillName: string) => void;
  onMarketUninstall: (skillName: string) => void;
  onMarketRefresh: () => void;
  // ---- import modal ----
  importOpen: boolean;
  importPath: string;
  importBrowseResult: BrowseResult | null;
  importLoading: boolean;
  importError: string | null;
  importSuccess: string | null;
  onImportOpen: () => void;
  onImportClose: () => void;
  onImportBrowse: (path?: string) => void;
  onImportPathChange: (path: string) => void;
  onImportExecute: (path: string, mode: "copy" | "reference") => void;
  // ---- detail modal ----
  selectedSkillKey: string | null;
  selectedMarketSkill: SkillsMarketSearchResult["items"][number] | null;
  onSelectSkill: (skillKey: string | null) => void;
  onSelectMarketSkill: (item: SkillsMarketSearchResult["items"][number] | null) => void;
  // ---- sidebar tier filter ----
  sidebarTierFilter: "all" | "core" | "ready" | "needs-config";
  onSidebarTierChange: (tier: "all" | "core" | "ready" | "needs-config") => void;
};

// ============================================================================
// Marketplace constants
// ============================================================================

const SKILLS_CATEGORIES: ReadonlyArray<{ id: string; label: string }> = [
  { id: "all", label: "全部" },
  { id: "productivity", label: "生产力工具" },
  { id: "ai_ml", label: "AI 工具" },
  { id: "dev_tools", label: "开发工具" },
  { id: "databases", label: "数据工具" },
  { id: "communication", label: "通信协作" },
  { id: "devops", label: "系统工具" },
  { id: "security", label: "安全工具" },
  { id: "general", label: "内容管理" },
  { id: "cn_services", label: "智能家居" },
  { id: "file_processing", label: "多媒体" },
];

/**
 * Colored SVG icon system for skills — replaces ugly unicode emoji.
 * Maps skill name/emoji keywords → colorful SVG icons matching Figma design.
 * Icon style: white SVG on colored circle background.
 */
type IconEntry = { keywords: string[]; bg: string; icon: unknown };

function _mailIcon() {
  return html`
    <svg viewBox="0 0 24 24" fill="none">
      <rect x="2" y="5" width="20" height="14" rx="3" fill="#fff" />
      <path d="M2 8l10 6 10-6" stroke="#4a90d9" stroke-width="2" stroke-linecap="round" />
    </svg>
  `;
}
function _githubIcon() {
  return html`
    <svg viewBox="0 0 24 24" fill="#fff">
      <path
        d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.009-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z"
      />
    </svg>
  `;
}
function _discordIcon() {
  return html`
    <svg viewBox="0 0 24 24" fill="#fff">
      <path
        d="M19.27 5.33C17.94 4.71 16.5 4.26 15 4a.09.09 0 00-.07.03c-.18.33-.39.76-.53 1.09a16.09 16.09 0 00-4.8 0c-.14-.34-.35-.76-.54-1.09-.01-.02-.04-.03-.07-.03-1.5.26-2.93.71-4.27 1.33-.01 0-.02.01-.03.02-2.72 4.07-3.47 8.03-3.1 11.95 0 .02.01.04.03.05 1.8 1.32 3.53 2.12 5.24 2.65.03.01.06 0 .07-.02.4-.55.76-1.13 1.07-1.74.02-.04 0-.08-.04-.09-.57-.22-1.11-.48-1.64-.78-.04-.02-.04-.08-.01-.11.11-.08.22-.17.33-.25.02-.02.04-.02.07-.01 3.44 1.57 7.15 1.57 10.55 0 .02-.01.05-.01.07.01.11.09.22.17.33.26.04.03.04.09-.01.11-.52.31-1.07.56-1.64.78-.04.01-.05.06-.04.09.32.61.68 1.19 1.07 1.74.02.03.05.03.07.02 1.72-.53 3.45-1.33 5.24-2.65.02-.01.03-.03.03-.05.44-4.53-.73-8.46-3.1-11.95-.01-.01-.02-.02-.04-.02zM8.52 14.91c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12 0 1.17-.84 2.12-1.89 2.12zm6.97 0c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12 0 1.17-.83 2.12-1.89 2.12z"
      />
    </svg>
  `;
}
function _aiIcon() {
  return html`
    <svg viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="8" fill="#fff" opacity="0.9" />
      <path d="M12 6v4l3 2" stroke="#8b5cf6" stroke-width="2" stroke-linecap="round" />
      <circle cx="12" cy="12" r="3" fill="#8b5cf6" opacity="0.3" />
      <path
        d="M8 4l1 2M16 4l-1 2M4 8l2 1M4 16l2-1M20 8l-2 1M20 16l-2-1M8 20l1-2M16 20l-1-2"
        stroke="#8b5cf6"
        stroke-width="1.5"
        stroke-linecap="round"
      />
    </svg>
  `;
}
function _cameraIcon() {
  return html`
    <svg viewBox="0 0 24 24" fill="none">
      <rect x="2" y="6" width="20" height="14" rx="3" fill="#fff" />
      <circle cx="12" cy="13" r="4" stroke="#ec4899" stroke-width="2" />
      <circle cx="12" cy="13" r="2" fill="#ec4899" />
      <path d="M7 6l1-3h8l1 3" stroke="#ec4899" stroke-width="1.5" />
    </svg>
  `;
}
function _storeIcon() {
  return html`
    <svg viewBox="0 0 24 24" fill="none">
      <path d="M3 9l1-5h16l1 5" stroke="#fff" stroke-width="2" />
      <path d="M3 9v11a1 1 0 001 1h16a1 1 0 001-1V9" stroke="#fff" stroke-width="2" />
      <rect x="9" y="14" width="6" height="7" rx="1" fill="#fff" opacity="0.4" />
    </svg>
  `;
}
function _searchIcon() {
  return html`
    <svg viewBox="0 0 24 24" fill="none">
      <circle cx="11" cy="11" r="6" stroke="#fff" stroke-width="2.5" />
      <path d="M16 16l4 4" stroke="#fff" stroke-width="2.5" stroke-linecap="round" />
    </svg>
  `;
}
function _docsIcon() {
  return html`
    <svg viewBox="0 0 24 24" fill="none">
      <rect x="4" y="2" width="16" height="20" rx="2" fill="#fff" />
      <path d="M8 7h8M8 11h8M8 15h5" stroke="#ea4335" stroke-width="1.5" stroke-linecap="round" />
    </svg>
  `;
}
function _calendarIcon() {
  return html`
    <svg viewBox="0 0 24 24" fill="none">
      <rect x="3" y="4" width="18" height="18" rx="3" fill="#fff" />
      <path d="M3 9h18" stroke="#f59e0b" stroke-width="2" />
      <path d="M8 2v4M16 2v4" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" />
      <rect x="7" y="12" width="3" height="3" rx="0.5" fill="#f59e0b" />
    </svg>
  `;
}
function _taskIcon() {
  return html`
    <svg viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="18" height="18" rx="3" fill="#fff" />
      <path
        d="M8 12l3 3 5-6"
        stroke="#10b981"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  `;
}
function _securityIcon() {
  return html`
    <svg viewBox="0 0 24 24" fill="none">
      <rect x="5" y="10" width="14" height="11" rx="2" fill="#fff" />
      <path d="M8 10V7a4 4 0 018 0v3" stroke="#6366f1" stroke-width="2" />
      <circle cx="12" cy="15" r="1.5" fill="#6366f1" />
    </svg>
  `;
}
function _databaseIcon() {
  return html`
    <svg viewBox="0 0 24 24" fill="none">
      <ellipse cx="12" cy="6" rx="8" ry="3" fill="#fff" />
      <path d="M4 6v12c0 1.66 3.58 3 8 3s8-1.34 8-3V6" stroke="#0ea5e9" stroke-width="2" />
      <path d="M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3" stroke="#0ea5e9" stroke-width="2" />
    </svg>
  `;
}
function _codeIcon() {
  return html`
    <svg viewBox="0 0 24 24" fill="none">
      <rect x="2" y="3" width="20" height="18" rx="3" fill="#fff" />
      <path
        d="M7 9l3 3-3 3"
        stroke="#374151"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path d="M13 15h4" stroke="#374151" stroke-width="2" stroke-linecap="round" />
    </svg>
  `;
}
function _networkIcon() {
  return html`
    <svg viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="#fff" stroke-width="2" />
      <path
        d="M2 12h20M12 3c-2 2.5-3 5.5-3 9s1 6.5 3 9c2-2.5 3-5.5 3-9s-1-6.5-3-9z"
        stroke="#fff"
        stroke-width="1.5"
      />
    </svg>
  `;
}
function _chatIcon() {
  return html`
    <svg viewBox="0 0 24 24" fill="none">
      <path
        d="M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
        fill="#fff"
      />
      <circle cx="8" cy="12" r="1" fill="#3b82f6" />
      <circle cx="12" cy="12" r="1" fill="#3b82f6" />
      <circle cx="16" cy="12" r="1" fill="#3b82f6" />
    </svg>
  `;
}
function _fileIcon() {
  return html`
    <svg viewBox="0 0 24 24" fill="none">
      <path d="M4 4a2 2 0 012-2h8l6 6v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" fill="#fff" />
      <path d="M14 2v6h6" stroke="#f97316" stroke-width="1.5" />
      <path d="M8 13h8M8 17h5" stroke="#f97316" stroke-width="1.5" stroke-linecap="round" />
    </svg>
  `;
}
function _musicIcon() {
  return html`
    <svg viewBox="0 0 24 24" fill="none">
      <circle cx="8" cy="18" r="3" fill="#fff" />
      <circle cx="18" cy="15" r="3" fill="#fff" />
      <path d="M11 18V6l10-3v12" stroke="#a855f7" stroke-width="2" />
    </svg>
  `;
}
function _imageIcon() {
  return html`
    <svg viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="18" height="18" rx="3" fill="#fff" />
      <circle cx="8.5" cy="8.5" r="2" fill="#14b8a6" />
      <path d="M3 16l5-5 4 4 3-3 6 6v2a3 3 0 01-3 3H6a3 3 0 01-3-3v-4z" fill="#14b8a6" opacity="0.3" />
    </svg>
  `;
}
function _defaultSkillIcon() {
  return html`
    <svg viewBox="0 0 24 24" fill="none">
      <path
        d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"
        fill="#fff"
      />
      <path d="M3.27 6.96L12 12.01l8.73-5.05" stroke="#4a90d9" stroke-width="1.5" />
      <path d="M12 22.08V12" stroke="#4a90d9" stroke-width="1.5" />
    </svg>
  `;
}
// Varied fallback icons for skills that don't match any keyword
function _puzzleIcon() {
  return html`
    <svg viewBox="0 0 24 24" fill="none">
      <path
        d="M4 7h3a2 2 0 012-2 2 2 0 012 2h3v3a2 2 0 012 2 2 2 0 01-2 2v3H7v-3a2 2 0 01-2-2 2 2 0 012-2V7z"
        fill="#fff"
      />
    </svg>
  `;
}
function _rocketIcon() {
  return html`
    <svg viewBox="0 0 24 24" fill="none">
      <path d="M12 2C8 6 6 10 6 14l3 3 3-3 3 3 3-3c0-4-2-8-6-12z" fill="#fff" />
      <circle cx="12" cy="11" r="2" fill="currentColor" opacity="0.3" />
    </svg>
  `;
}
function _sparkleIcon() {
  return html`
    <svg viewBox="0 0 24 24" fill="none">
      <path d="M12 2l2.4 7.2H22l-6 4.8 2.4 7.2L12 16.4 5.6 21.2 8 14 2 9.2h7.6L12 2z" fill="#fff" />
    </svg>
  `;
}
function _lightbulbIcon() {
  return html`
    <svg viewBox="0 0 24 24" fill="none">
      <path
        d="M9 21h6M12 3a6 6 0 014 10.47V17a1 1 0 01-1 1H9a1 1 0 01-1-1v-3.53A6 6 0 0112 3z"
        fill="#fff"
      />
    </svg>
  `;
}
function _compassIcon() {
  return html`
    <svg viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="#fff" stroke-width="2" />
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88" fill="#fff" />
    </svg>
  `;
}
function _bookIcon() {
  return html`
    <svg viewBox="0 0 24 24" fill="none">
      <path d="M4 19.5A2.5 2.5 0 016.5 17H20" stroke="#fff" stroke-width="2" />
      <path d="M4 4.5A2.5 2.5 0 016.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15z" fill="#fff" opacity="0.9" />
      <path
        d="M8 7h8M8 11h5"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        opacity="0.3"
      />
    </svg>
  `;
}
function _cubeIcon() {
  return html`
    <svg viewBox="0 0 24 24" fill="none">
      <path d="M21 16V8l-9 5-9-5v8l9 5 9-5z" fill="#fff" opacity="0.8" />
      <path d="M3 8l9-5 9 5-9 5-9-5z" fill="#fff" />
    </svg>
  `;
}
function _wandIcon() {
  return html`
    <svg viewBox="0 0 24 24" fill="none">
      <path d="M15 4l5 5-11 11H4v-5L15 4z" fill="#fff" />
      <path d="M7 7l3 3" stroke="currentColor" stroke-width="1.5" opacity="0.3" />
      <circle cx="19" cy="5" r="1" fill="#fff" />
      <circle cx="21" cy="9" r="0.7" fill="#fff" />
      <circle cx="17" cy="2" r="0.7" fill="#fff" />
    </svg>
  `;
}

const _FALLBACK_ICONS = [
  _puzzleIcon,
  _rocketIcon,
  _sparkleIcon,
  _lightbulbIcon,
  _compassIcon,
  _bookIcon,
  _cubeIcon,
  _wandIcon,
  _defaultSkillIcon,
];
const _FALLBACK_COLORS = [
  "#e8872b",
  "#8b5cf6",
  "#ec4899",
  "#10b981",
  "#06b6d4",
  "#f59e0b",
  "#6366f1",
  "#ef4444",
  "#14b8a6",
  "#84cc16",
  "#f97316",
  "#3b82f6",
  "#a855f7",
  "#0ea5e9",
  "#d946ef",
];

function _hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

const SKILL_ICON_MAP: IconEntry[] = [
  {
    keywords: [
      "邮件",
      "mail",
      "email",
      "imap",
      "smtp",
      "📧",
      "✉️",
      "泡泡消息",
      "bluebubbles",
      "imessage",
    ],
    bg: "#4a90d9",
    icon: _mailIcon(),
  },
  { keywords: ["github", "git"], bg: "#24292e", icon: _githubIcon() },
  { keywords: ["discord"], bg: "#5865f2", icon: _discordIcon() },
  {
    keywords: ["ai", "gemini", "claude", "gpt", "openai", "llm", "模型", "🤖", "🧠"],
    bg: "#8b5cf6",
    icon: _aiIcon(),
  },
  {
    keywords: ["摄像", "相机", "camera", "rtsp", "📷", "📹", "🎥"],
    bg: "#ec4899",
    icon: _cameraIcon(),
  },
  { keywords: ["商店", "store", "market", "商城", "🏪", "🛒"], bg: "#1a1a2e", icon: _storeIcon() },
  { keywords: ["搜索", "search", "🔍"], bg: "#3b82f6", icon: _searchIcon() },
  {
    keywords: ["google", "办公", "docs", "sheets", "drive", "📄", "📊"],
    bg: "#ea4335",
    icon: _docsIcon(),
  },
  { keywords: ["日历", "calendar", "日程", "📅"], bg: "#f59e0b", icon: _calendarIcon() },
  { keywords: ["任务", "task", "todo", "审批", "✅", "📋"], bg: "#10b981", icon: _taskIcon() },
  {
    keywords: ["安全", "security", "lock", "auth", "🔒", "🛡️"],
    bg: "#6366f1",
    icon: _securityIcon(),
  },
  {
    keywords: ["数据", "database", "db", "sql", "mongo", "redis", "🗄️"],
    bg: "#0ea5e9",
    icon: _databaseIcon(),
  },
  {
    keywords: ["代码", "code", "terminal", "命令", "shell", "cli", "💻", "⌨️"],
    bg: "#374151",
    icon: _codeIcon(),
  },
  {
    keywords: ["网络", "network", "api", "http", "web", "proxy", "🌐"],
    bg: "#06b6d4",
    icon: _networkIcon(),
  },
  {
    keywords: [
      "消息",
      "chat",
      "message",
      "聊天",
      "im",
      "slack",
      "telegram",
      "钉钉",
      "飞书",
      "微信",
      "wecom",
      "wechat",
      "💬",
      "🗨️",
    ],
    bg: "#3b82f6",
    icon: _chatIcon(),
  },
  { keywords: ["文件", "file", "document", "文档", "📁", "📂"], bg: "#f97316", icon: _fileIcon() },
  {
    keywords: ["音乐", "music", "audio", "声音", "voice", "🎵", "🎤"],
    bg: "#a855f7",
    icon: _musicIcon(),
  },
  {
    keywords: ["图片", "image", "picture", "photo", "screenshot", "🖼️"],
    bg: "#14b8a6",
    icon: _imageIcon(),
  },
];

/** Match a skill to a colored SVG icon based on name/emoji keywords */
function skillColorIcon(skill: { name: string; nameZh?: string; emoji?: string }) {
  const text = [skill.name, skill.nameZh || "", skill.emoji || ""].join(" ").toLowerCase();
  for (const entry of SKILL_ICON_MAP) {
    if (entry.keywords.some((k) => text.includes(k.toLowerCase()))) {
      return html`<div class="skills-color-icon" style="background:${entry.bg}">${entry.icon}</div>`;
    }
  }
  // Varied fallback: deterministic icon+color based on skill name hash
  const h = _hashStr(skill.name);
  const icon = _FALLBACK_ICONS[h % _FALLBACK_ICONS.length]();
  const bg = _FALLBACK_COLORS[h % _FALLBACK_COLORS.length];
  return html`<div class="skills-color-icon" style="background:${bg}">${icon}</div>`;
}

let _skillSearchTimer: ReturnType<typeof setTimeout> | null = null;

// ============================================================================
// Tier section pagination state
// ============================================================================

const TIER_PAGE_SIZE = 50;
const _tierVisibleCounts = new Map<string, number>();
let _lastFilterValue = "";

function getTierVisibleCount(tierId: string): number {
  return _tierVisibleCounts.get(tierId) ?? TIER_PAGE_SIZE;
}

function showMoreInTier(tierId: string) {
  _tierVisibleCounts.set(tierId, getTierVisibleCount(tierId) + TIER_PAGE_SIZE);
}

function resetTierPagination() {
  _tierVisibleCounts.clear();
}

// ============================================================================
// Tier section config
// ============================================================================

type TierConfig = {
  id: TierGroupId;
  icon: unknown; // TemplateResult (SVG)
  descKey: string;
  accentColor: string;
  accentBg: string;
};

// SVG icons: stroke-based, currentColor — aligned with Chat page (no emoji)
const TIER_CONFIGS: Record<TierGroupId, TierConfig> = {
  core: {
    id: "core",
    icon: html`
      <svg viewBox="0 0 24 24">
        <polygon
          points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
        />
      </svg>
    `,
    descKey: "skills.tier.core.desc",
    accentColor: "#f59e0b",
    accentBg: "rgba(251,191,36,0.08)",
  },
  ready: {
    id: "ready",
    icon: html`
      <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12" /></svg>
    `,
    descKey: "skills.tier.ready.desc",
    accentColor: "#34d399",
    accentBg: "rgba(52,211,153,0.06)",
  },
  "needs-config": {
    id: "needs-config",
    icon: html`
      <svg viewBox="0 0 24 24">
        <path
          d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"
        />
      </svg>
    `,
    descKey: "skills.tier.needsConfig.desc",
    accentColor: "#f97316",
    accentBg: "rgba(249,115,22,0.06)",
  },
  incompatible: {
    id: "incompatible",
    icon: html`
      <svg viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" />
        <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
      </svg>
    `,
    descKey: "skills.tier.incompatible.desc",
    accentColor: "#94a3b8",
    accentBg: "rgba(148,163,184,0.06)",
  },
};

// ============================================================================
// Main render
// ============================================================================

export function renderSkills(props: SkillsProps) {
  return html`
    <div class="skills-wrapper">
      ${renderTabBar(props)}
      ${props.activeTab === "local" ? renderLocalSkills(props) : renderMarketplace(props)}
    </div>
    ${renderSkillDetailModal(props)}
    ${renderMarketDetailModal(props)}
  `;
}

// ============================================================================
// Tab bar — glassmorphism pill tabs
// ============================================================================

function renderTabBar(props: SkillsProps) {
  const { activeTab, onTabChange } = props;

  return html`
    <div class="skills-glass-tabbar">
      <div class="skills-glass-tabs">
        <button
          class="skills-glass-tab ${activeTab === "local" ? "skills-glass-tab--active" : ""}"
          @click=${() => onTabChange("local")}
        >${t("skills.tab.local" as never)}</button>
        <button
          class="skills-glass-tab ${activeTab === "market" ? "skills-glass-tab--active" : ""}"
          @click=${() => onTabChange("market")}
        >${t("skills.tab.remote" as never)}</button>
      </div>
    </div>
  `;
}

// ============================================================================
// Tab 1: Local Skills — tier-based layout with drag-and-drop
// ============================================================================

function renderLocalSkills(props: SkillsProps) {
  const skills = props.report?.skills ?? [];
  const filter = props.filter.trim().toLowerCase();

  // Reset pagination when filter changes
  if (filter !== _lastFilterValue) {
    _lastFilterValue = filter;
    resetTierPagination();
  }

  const filtered = filter
    ? skills.filter((skill) =>
        [skill.name, skill.nameZh, skill.description, skill.descriptionZh, skill.source]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(filter),
      )
    : skills;
  const allGroups = groupByTier(skills); // unfiltered — for stats
  const groups = groupByTier(filtered);

  // Always show core section as a drop target if there are core skills in the full list
  const hasCoreGroup = groups.some((g) => g.id === "core");
  const hasUnfilteredCoreSkills = props.coreCount > 0;
  const showEmptyCoreSection = !hasCoreGroup && hasUnfilteredCoreSkills && filter !== "";

  // Stats from unfiltered
  const coreCount = allGroups.find((g) => g.id === "core")?.skills.length ?? 0;
  const readyCount = allGroups.find((g) => g.id === "ready")?.skills.length ?? 0;
  const needsConfigCount = allGroups.find((g) => g.id === "needs-config")?.skills.length ?? 0;
  const incompatCount = allGroups.find((g) => g.id === "incompatible")?.skills.length ?? 0;

  // Sidebar tier filter: filter groups shown in main area
  // "all" defaults to core; "needs-config" also includes "incompatible"
  const tierFilter = props.sidebarTierFilter;
  const effectiveTier = tierFilter === "all" ? "core" : tierFilter;
  const mainGroups =
    effectiveTier === "needs-config"
      ? groups.filter((g) => g.id === "needs-config" || g.id === "incompatible")
      : groups.filter((g) => g.id === effectiveTier);

  // Sidebar list: same filtered skills, flat list for quick navigation
  const sidebarSkills = filtered.filter((s) => {
    const g = groups.find((gg) => gg.skills.includes(s));
    if (!g) {
      return false;
    }
    if (effectiveTier === "needs-config") {
      return g.id === "needs-config" || g.id === "incompatible";
    }
    return g.id === effectiveTier;
  });

  return html`
    <div class="skills-layout">
      <!-- Sidebar -->
      <aside class="skills-sidebar">
        <!-- Stats dashboard -->
        <div class="skills-sidebar__stats">
          <div class="skills-sidebar__stat-card skills-sidebar__stat-card--core">
            <div class="skills-sidebar__stat-illust">
              <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                <!-- 3D 橙色底座 -->
                <ellipse cx="50" cy="82" rx="34" ry="8" fill="#e8872b" opacity="0.25"/>
                <path d="M20 70 L50 82 L80 70 L80 62 L50 74 L20 62 Z" fill="#d4782a"/>
                <path d="M20 62 L50 74 L80 62 L50 50 Z" fill="#f5a94d"/>
                <path d="M20 62 L50 50 L50 74 Z" fill="#e8932e"/>
                <path d="M80 62 L50 50 L50 74 Z" fill="#fbc078"/>
                <!-- 盾牌 -->
                <path d="M50 16 L30 26 L30 44 C30 54 38 62 50 66 C62 62 70 54 70 44 L70 26 Z" fill="#f5a030"/>
                <path d="M50 16 L30 26 L30 44 C30 54 38 62 50 66 L50 16Z" fill="#e8872b"/>
                <path d="M50 22 L35 30 L35 43 C35 51 41 57 50 60 C59 57 65 51 65 43 L65 30 Z" fill="#fcc06a"/>
                <path d="M50 22 L35 30 L35 43 C35 51 41 57 50 60 L50 22Z" fill="#f5a030"/>
                <!-- 星星 -->
                <polygon points="50,30 53,38 62,39 56,44 57,53 50,49 43,53 44,44 38,39 47,38" fill="#fff" opacity="0.9"/>
                <!-- 文字banner -->
                <rect x="30" y="55" width="40" height="10" rx="5" fill="#e07926" opacity="0.7"/>
                <text x="50" y="63" text-anchor="middle" font-size="7" fill="#fff" font-weight="600" opacity="0.9">Core Skills</text>
              </svg>
            </div>
            <div class="skills-sidebar__stat-text">
              <div class="skills-sidebar__stat-num">${coreCount}</div>
              <div class="skills-sidebar__stat-label">${t("skills.dashboard.coreLabel" as never)}</div>
            </div>
          </div>
          <div class="skills-sidebar__stat-card skills-sidebar__stat-card--ready">
            <div class="skills-sidebar__stat-illust">
              <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                <!-- 3D 橙色底座 -->
                <ellipse cx="50" cy="82" rx="34" ry="8" fill="#e8872b" opacity="0.25"/>
                <path d="M20 70 L50 82 L80 70 L80 62 L50 74 L20 62 Z" fill="#d4782a"/>
                <path d="M20 62 L50 74 L80 62 L50 50 Z" fill="#f5a94d"/>
                <path d="M20 62 L50 50 L50 74 Z" fill="#e8932e"/>
                <path d="M80 62 L50 50 L50 74 Z" fill="#fbc078"/>
                <!-- 圆形勋章 -->
                <circle cx="50" cy="36" r="22" fill="#f5a030"/>
                <circle cx="50" cy="36" r="22" fill="#e8872b" clip-path="inset(0 50% 0 0)"/>
                <circle cx="50" cy="36" r="18" fill="#fcc06a"/>
                <circle cx="50" cy="36" r="18" fill="#f5a030" clip-path="inset(0 50% 0 0)"/>
                <!-- 打钩 -->
                <path d="M38 36 L46 44 L62 28" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
                <!-- 文字banner -->
                <rect x="30" y="55" width="40" height="10" rx="5" fill="#e07926" opacity="0.7"/>
                <text x="50" y="63" text-anchor="middle" font-size="7" fill="#fff" font-weight="600" opacity="0.9">Ready</text>
              </svg>
            </div>
            <div class="skills-sidebar__stat-text">
              <div class="skills-sidebar__stat-num">${readyCount}</div>
              <div class="skills-sidebar__stat-label">${t("skills.dashboard.readyLabel" as never)}</div>
            </div>
          </div>
          <div class="skills-sidebar__stat-card skills-sidebar__stat-card--config">
            <div class="skills-sidebar__stat-illust">
              <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                <!-- 3D 橙色底座 -->
                <ellipse cx="50" cy="82" rx="34" ry="8" fill="#e8872b" opacity="0.25"/>
                <path d="M20 70 L50 82 L80 70 L80 62 L50 74 L20 62 Z" fill="#d4782a"/>
                <path d="M20 62 L50 74 L80 62 L50 50 Z" fill="#f5a94d"/>
                <path d="M20 62 L50 50 L50 74 Z" fill="#e8932e"/>
                <path d="M80 62 L50 50 L50 74 Z" fill="#fbc078"/>
                <!-- 文档/卡片 -->
                <rect x="32" y="14" width="36" height="44" rx="4" fill="#f5a030"/>
                <rect x="32" y="14" width="18" height="44" rx="4" fill="#e8872b"/>
                <rect x="36" y="18" width="28" height="36" rx="2" fill="#fcc06a"/>
                <rect x="36" y="18" width="14" height="36" rx="2" fill="#f5a030"/>
                <!-- 横线 -->
                <rect x="40" y="24" width="20" height="2.5" rx="1" fill="#fff" opacity="0.7"/>
                <rect x="40" y="30" width="16" height="2.5" rx="1" fill="#fff" opacity="0.5"/>
                <rect x="40" y="36" width="18" height="2.5" rx="1" fill="#fff" opacity="0.5"/>
                <!-- 问号 -->
                <circle cx="50" cy="46" r="8" fill="#e07926"/>
                <text x="50" y="50" text-anchor="middle" font-size="12" fill="#fff" font-weight="800">?</text>
                <!-- 文字banner -->
                <rect x="26" y="55" width="48" height="10" rx="5" fill="#e07926" opacity="0.7"/>
                <text x="50" y="63" text-anchor="middle" font-size="6" fill="#fff" font-weight="600" opacity="0.9">Ready to Install</text>
              </svg>
            </div>
            <div class="skills-sidebar__stat-text">
              <div class="skills-sidebar__stat-num">${needsConfigCount + incompatCount}</div>
              <div class="skills-sidebar__stat-label">${t("skills.dashboard.attentionLabel" as never)}</div>
            </div>
          </div>
          <button class="skills-sidebar__import-btn"
            @click=${props.onImportOpen}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
            ${t("skills.import.button" as never)}
          </button>
        </div>

        <!-- Search -->
        <div class="skills-sidebar__search">
          <svg class="skills-sidebar__search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            class="skills-sidebar__search-input"
            .value=${props.filter}
            @input=${(e: Event) => props.onFilterChange((e.target as HTMLInputElement).value)}
            placeholder=${t("skills.filterPlaceholder" as never)}
          />
        </div>
        <div class="skills-sidebar__search-count">
          ${filtered.length > 0 ? html`一共搜索到${filtered.length}条结果` : nothing}
        </div>

        <!-- Tier filter tabs -->
        <div class="skills-sidebar__tier-tabs">
          ${(["core", "ready", "needs-config"] as const).map(
            (tid) => html`
            <button
              class="skills-sidebar__tier-tab ${effectiveTier === tid ? "skills-sidebar__tier-tab--active" : ""}"
              @click=${() => props.onSidebarTierChange(tid)}
            >${tid === "core" ? "核心激活" : tid === "ready" ? "准备就绪" : "等待配置"}</button>
          `,
          )}
        </div>

        <!-- Skill list -->
        <div class="skills-sidebar__list">
          ${sidebarSkills.map((skill) => {
            const g = groups.find((gg) => gg.skills.includes(skill));
            const tier = (g?.id ?? "needs-config") as TierGroupId;
            return renderSidebarSkillItem(skill, tier, props);
          })}
          ${
            sidebarSkills.length === 0
              ? html`
                  <div class="skills-sidebar__empty">无匹配技能</div>
                `
              : nothing
          }
        </div>
      </aside>

      <!-- Main area -->
      <div class="skills-main">
        <!-- Fixed header: filter tabs + tips (does NOT scroll) -->
        <div class="skills-main__sticky-header">
          ${
            props.error
              ? html`<div class="callout danger" style="margin-bottom: 8px;">${props.error}</div>`
              : nothing
          }
          <div class="skills-main__filter-tabs">
            <button class="skills-main__filter-tab ${tierFilter === "all" || tierFilter === "core" ? "skills-main__filter-tab--active" : ""}"
              @click=${() => props.onSidebarTierChange("core")}
            >核心技能</button>
            <button class="skills-main__filter-tab ${tierFilter === "ready" ? "skills-main__filter-tab--active" : ""}"
              @click=${() => props.onSidebarTierChange("ready")}
            >准备就绪</button>
            <button class="skills-main__filter-tab ${tierFilter === "needs-config" ? "skills-main__filter-tab--active" : ""}"
              @click=${() => props.onSidebarTierChange("needs-config")}
            >等待配置</button>
          </div>
          <div class="skills-main__tips">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
            Tips：始终加载到 AI 对话中的技能（每个核心技能都会消耗 token，请精简）
          </div>
        </div>

        <!-- Scrollable cards area -->
        <div class="skills-main__scroll">
          <div class="skills-glass-tier__content">
            ${
              showEmptyCoreSection
                ? renderCoreTierSection(
                    {
                      id: "core",
                      label: t("skills.tier.core" as never) || "\u6838\u5FC3\u6280\u80FD",
                      skills: [],
                    },
                    props,
                    TIER_CONFIGS.core,
                  )
                : nothing
            }
            ${mainGroups.map((group) => renderTierSection(group, props))}
            ${filtered.length === 0 && !showEmptyCoreSection ? renderEmptyState(props) : nothing}
          </div>
        </div>
      </div>
    </div>
    ${props.importOpen ? renderSkillImportModal(props) : nothing}
  `;
}

// ============================================================================
// Sidebar skill list item
// ============================================================================

function renderSidebarSkillItem(skill: SkillStatusEntry, tier: TierGroupId, props: SkillsProps) {
  return html`
    <div
      class="skills-sidebar__item"
      draggable="true"
      @dragstart=${(e: DragEvent) => {
        e.dataTransfer!.setData("text/plain", skill.skillKey);
        e.dataTransfer!.setData("application/x-skill-tier", tier);
        e.dataTransfer!.effectAllowed = "move";
        (e.currentTarget as HTMLElement).classList.add("skills-sidebar__item--dragging");
      }}
      @dragend=${(e: DragEvent) => {
        (e.currentTarget as HTMLElement).classList.remove("skills-sidebar__item--dragging");
      }}
      @click=${() => props.onSelectSkill(skill.skillKey)}
    >
      <div class="skills-sidebar__item-icon">
        ${skillColorIcon(skill)}
      </div>
      <div class="skills-sidebar__item-info">
        <div class="skills-sidebar__item-name">${skill.nameZh || skill.name}</div>
        <div class="skills-sidebar__item-desc">${clampText(skill.descriptionZh || skill.description, 30)}</div>
      </div>
    </div>
  `;
}

// ============================================================================
// Dashboard summary: ring chart + 3 stat cards
// ============================================================================

function _renderDashboard(
  coreCount: number,
  coreMax: number,
  coreFiltered: number,
  readyFiltered: number,
  attentionFiltered: number,
) {
  // SVG ring chart calculations
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const ratio = coreMax > 0 ? Math.min(coreCount / coreMax, 1) : 0;
  const dashOffset = circumference * (1 - ratio);
  const ringColor = ratio >= 1 ? "#ef4444" : ratio > 0.6 ? "#f59e0b" : "var(--accent, #6c8cff)";

  return html`
    <div class="skills-dashboard">
      <!-- Ring Chart -->
      <div class="skills-dashboard__ring">
        <svg class="skills-ring-svg" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r="${radius}"
            fill="none" stroke="var(--border)" stroke-width="6" opacity="0.3" />
          <circle cx="40" cy="40" r="${radius}"
            fill="none" stroke="${ringColor}" stroke-width="6"
            stroke-dasharray="${circumference}"
            stroke-dashoffset="${dashOffset}"
            stroke-linecap="round"
            class="skills-ring-progress"
            transform="rotate(-90 40 40)" />
        </svg>
        <div class="skills-ring-text">
          <span class="skills-ring-value">${coreCount}</span>
          <span class="skills-ring-max">/ ${coreMax}</span>
        </div>
      </div>

      <!-- 3 Stat Cards -->
      <div class="skills-dashboard__stats">
        <div class="skills-stat-card">
          <div class="skills-stat-card__icon skills-stat-card__icon--core">
            <svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
          </div>
          <div class="skills-stat-card__info">
            <span class="skills-stat-card__value">${coreFiltered}</span>
            <span class="skills-stat-card__label">${t("skills.dashboard.coreLabel" as never)}</span>
          </div>
        </div>

        <div class="skills-stat-card">
          <div class="skills-stat-card__icon skills-stat-card__icon--ready">
            <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12" /></svg>
          </div>
          <div class="skills-stat-card__info">
            <span class="skills-stat-card__value">${readyFiltered}</span>
            <span class="skills-stat-card__label">${t("skills.dashboard.readyLabel" as never)}</span>
          </div>
        </div>

        <div class="skills-stat-card">
          <div class="skills-stat-card__icon skills-stat-card__icon--blocked">
            <svg viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
          </div>
          <div class="skills-stat-card__info">
            <span class="skills-stat-card__value">${attentionFiltered}</span>
            <span class="skills-stat-card__label">${t("skills.dashboard.attentionLabel" as never)}</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ============================================================================
// Empty state with illustration + CTA
// ============================================================================

function renderEmptyState(props: SkillsProps) {
  return html`
    <div class="skills-glass-empty">
      <div class="skills-glass-empty__icon">
        <svg viewBox="0 0 24 24">
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>
      </div>
      <div class="skills-glass-empty__title">${t("skills.empty.title" as never)}</div>
      <div class="skills-glass-empty__desc">${t("skills.empty.description" as never)}</div>
      <button
        class="skills-pill-btn skills-pill-btn--accent"
        style="margin-top:16px;"
        @click=${() => props.onTabChange("market")}
      >${t("skills.empty.browseMarket" as never)}</button>
    </div>
  `;
}

// ============================================================================
// Tier section rendering
// ============================================================================

function renderTierSection(group: SkillGroup, props: SkillsProps) {
  const tierId = group.id as TierGroupId;
  const config = TIER_CONFIGS[tierId];
  if (!config) {
    return nothing;
  }

  if (tierId === "core") {
    return renderCoreTierSection(group, props, config);
  }
  if (tierId === "ready") {
    return renderReadyTierSection(group, props, config);
  }
  if (tierId === "incompatible") {
    return renderIncompatibleTierSection(group, props, config);
  }
  return renderStaticTierSection(group, props, config);
}

// ---- Core section: drop target, draggable cards, counter ----

function renderCoreTierSection(group: SkillGroup, props: SkillsProps, config: TierConfig) {
  const atLimit = props.coreCount >= props.coreMax;
  const nearLimit = !atLimit && props.coreCount > 70; // 超过 70 个就提醒用户注意 token 开销
  const visibleCount = getTierVisibleCount("core");
  const visible = group.skills.slice(0, visibleCount);
  const hasMore = group.skills.length > visibleCount;

  return html`
    <div
      class="skills-glass-tier skills-glass-tier--core"
      data-tier="core"
      @dragover=${(e: DragEvent) => {
        if (!e.dataTransfer?.types.includes("application/x-skill-tier")) {
          return;
        }
        if (atLimit) {
          return;
        }
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const dropZone = (e.currentTarget as HTMLElement).querySelector(".skills-drop-zone");
        if (dropZone) {
          dropZone.classList.add("skills-drop-active", "skills-drop-active--core");
        }
      }}
      @dragleave=${(e: DragEvent) => {
        const el = e.currentTarget as HTMLElement;
        if (!el.contains(e.relatedTarget as Node)) {
          const dropZone = el.querySelector(".skills-drop-zone");
          if (dropZone) {
            dropZone.classList.remove("skills-drop-active", "skills-drop-active--core");
          }
        }
      }}
      @drop=${(e: DragEvent) => {
        e.preventDefault();
        const el = e.currentTarget as HTMLElement;
        const dropZone = el.querySelector(".skills-drop-zone");
        if (dropZone) {
          dropZone.classList.remove("skills-drop-active", "skills-drop-active--core");
        }
        if (atLimit) {
          return;
        }
        const skillKey = e.dataTransfer?.getData("text/plain");
        const sourceTier = e.dataTransfer?.getData("application/x-skill-tier");
        if (skillKey && sourceTier === "ready") {
          props.onPromoteToCore(skillKey);
        }
      }}
    >
      <!-- Header -->
      <div class="skills-glass-tier__header">
        <div class="skills-glass-tier__title-group">
          <span class="skills-glass-tier__icon">${config.icon}</span>
          <span class="skills-glass-tier__title">${group.label}</span>
          <span class="skills-glass-tier__count skills-glass-tier__count--normal">${props.coreCount}</span>
        </div>
        <span class="skills-glass-tier__desc">
          ${t("skills.tier.core.desc" as never)}
        </span>
      </div>
      ${
        atLimit
          ? html`<div class="skills-glass-alert--limit">${t("skills.core.limitReached" as never)}</div>`
          : nearLimit
            ? html`<div class="skills-glass-alert--warning">${t("skills.core.tokenWarning" as never)}</div>`
            : html`<div class="skills-drop-zone">
            <span class="skills-drop-zone__icon">
              <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
            </span>
            ${t("skills.dnd.dropToAdd" as never)}
          </div>`
      }
      <!-- Cards -->
      <div class="skills-glass-tier-grid">
        ${visible.map((skill) => renderDraggableSkillCard(skill, "core", props))}
      </div>
      ${hasMore ? renderLoadMoreButton("core", visible.length, group.skills.length, props) : nothing}
    </div>
  `;
}

// ---- Ready section: drop target (for demoting), draggable cards ----

function renderReadyTierSection(group: SkillGroup, props: SkillsProps, config: TierConfig) {
  const visibleCount = getTierVisibleCount("ready");
  const visible = group.skills.slice(0, visibleCount);
  const hasMore = group.skills.length > visibleCount;

  return html`
    <div
      class="skills-glass-tier skills-glass-tier--ready"
      data-tier="ready"
      @dragover=${(e: DragEvent) => {
        if (!e.dataTransfer?.types.includes("application/x-skill-tier")) {
          return;
        }
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const dropZone = (e.currentTarget as HTMLElement).querySelector(".skills-drop-zone");
        if (dropZone) {
          dropZone.classList.add("skills-drop-active", "skills-drop-active--ready");
        }
      }}
      @dragleave=${(e: DragEvent) => {
        const el = e.currentTarget as HTMLElement;
        if (!el.contains(e.relatedTarget as Node)) {
          const dropZone = el.querySelector(".skills-drop-zone");
          if (dropZone) {
            dropZone.classList.remove("skills-drop-active", "skills-drop-active--ready");
          }
        }
      }}
      @drop=${(e: DragEvent) => {
        e.preventDefault();
        const el = e.currentTarget as HTMLElement;
        const dropZone = el.querySelector(".skills-drop-zone");
        if (dropZone) {
          dropZone.classList.remove("skills-drop-active", "skills-drop-active--ready");
        }
        const skillKey = e.dataTransfer?.getData("text/plain");
        const sourceTier = e.dataTransfer?.getData("application/x-skill-tier");
        if (skillKey && sourceTier === "core") {
          props.onDemoteFromCore(skillKey);
        }
      }}
    >
      <!-- Header -->
      <div class="skills-glass-tier__header">
        <div class="skills-glass-tier__title-group">
          <span class="skills-glass-tier__icon">${config.icon}</span>
          <span class="skills-glass-tier__title">${group.label}</span>
          <span class="skills-glass-tier__count skills-glass-tier__count--normal">${group.skills.length}</span>
        </div>
        <span class="skills-glass-tier__desc">
          ${t("skills.tier.ready.desc" as never)}
        </span>
      </div>
      <div class="skills-drop-zone skills-drop-zone--remove">
        <span class="skills-drop-zone__icon">
          <svg viewBox="0 0 24 24"><path d="M18 15l-6-6-6 6" /></svg>
        </span>
        ${t("skills.dnd.dropToRemove" as never)}
      </div>
      <!-- Cards -->
      <div class="skills-glass-tier-grid">
        ${visible.map((skill) => renderDraggableSkillCard(skill, "ready", props))}
      </div>
      ${hasMore ? renderLoadMoreButton("ready", visible.length, group.skills.length, props) : nothing}
    </div>
  `;
}

// ---- Needs-config section: static cards ----

function renderStaticTierSection(group: SkillGroup, props: SkillsProps, config: TierConfig) {
  const tierId = group.id;
  const visibleCount = getTierVisibleCount(tierId);
  const visible = group.skills.slice(0, visibleCount);
  const hasMore = group.skills.length > visibleCount;

  return html`
    <div class="skills-glass-tier skills-glass-tier--needs-config">
      <!-- Header -->
      <div class="skills-glass-tier__header">
        <div class="skills-glass-tier__title-group">
          <span class="skills-glass-tier__icon">${config.icon}</span>
          <span class="skills-glass-tier__title">${group.label}</span>
          <span class="skills-glass-tier__count skills-glass-tier__count--plain">${group.skills.length}</span>
        </div>
        <span class="skills-glass-tier__desc">
          ${t(config.descKey as never)}
        </span>
      </div>
      <!-- Cards -->
      <div class="skills-glass-tier-grid">
        ${visible.map((skill) => renderSkillCard(skill, tierId as TierGroupId, props))}
      </div>
      ${hasMore ? renderLoadMoreButton(tierId, visible.length, group.skills.length, props) : nothing}
    </div>
  `;
}

// ---- Incompatible section: collapsed by default ----

function renderIncompatibleTierSection(group: SkillGroup, props: SkillsProps, config: TierConfig) {
  const tierId = "incompatible";
  const visibleCount = getTierVisibleCount(tierId);
  const visible = group.skills.slice(0, visibleCount);
  const hasMore = group.skills.length > visibleCount;

  return html`
    <details class="skills-glass-tier skills-glass-tier--incompatible">
      <summary class="skills-glass-tier__header" style="cursor:pointer; user-select:none; padding:0; margin-bottom:0;">
        <div class="skills-glass-tier__title-group">
          <span class="skills-glass-tier__icon">${config.icon}</span>
          <span class="skills-glass-tier__title">${group.label}</span>
          <span class="skills-glass-tier__count skills-glass-tier__count--plain">${group.skills.length}</span>
        </div>
        <span class="skills-glass-tier__desc">
          ${t(config.descKey as never)}
        </span>
      </summary>
      <div style="padding-top:14px;">
        <div class="skills-glass-tier-grid">
          ${visible.map((skill) => renderSkillCard(skill, tierId, props))}
        </div>
        ${hasMore ? renderLoadMoreButton(tierId, visible.length, group.skills.length, props) : nothing}
      </div>
    </details>
  `;
}

// ============================================================================
// Skill card (draggable variant for core/ready)
// ============================================================================

function renderDraggableSkillCard(skill: SkillStatusEntry, tier: TierGroupId, props: SkillsProps) {
  return html`
    <div
      class="skills-glass-card skills-glass-card--draggable"
      draggable="true"
      @dragstart=${(e: DragEvent) => {
        e.dataTransfer!.setData("text/plain", skill.skillKey);
        e.dataTransfer!.setData("application/x-skill-tier", tier);
        e.dataTransfer!.effectAllowed = "move";
        (e.currentTarget as HTMLElement).classList.add("skills-glass-card--dragging");
      }}
      @dragend=${(e: DragEvent) => {
        (e.currentTarget as HTMLElement).classList.remove("skills-glass-card--dragging");
      }}
    >
      <div style="display:flex; gap:4px;">
        <div class="skills-drag-handle" title="${t("skills.dnd.dragHint" as never)}">
          <span class="skills-drag-handle__line"></span>
          <span class="skills-drag-handle__line"></span>
          <span class="skills-drag-handle__line"></span>
        </div>
        <div style="flex:1; min-width:0;">
          ${renderSkillCardContent(skill, tier, props)}
        </div>
      </div>
    </div>
  `;
}

function renderSkillCard(skill: SkillStatusEntry, tier: TierGroupId, props: SkillsProps) {
  return html`
    <div class="skills-glass-card">
      ${renderSkillCardContent(skill, tier, props)}
    </div>
  `;
}

function renderSkillCardContent(skill: SkillStatusEntry, tier: TierGroupId, props: SkillsProps) {
  const busy = props.busyKey === skill.skillKey;

  const iconClass =
    tier === "core"
      ? "skills-glass-card__icon--core"
      : tier === "ready"
        ? "skills-glass-card__icon--ready"
        : tier === "incompatible"
          ? "skills-glass-card__icon--incompatible"
          : "skills-glass-card__icon--needs-config";

  // Indicate actionable state — e.g. needs API key or has missing deps
  const needsAttention = !!skill.primaryEnv || skill.missing.bins.length > 0;

  return html`
    <!-- Clickable area opens detail modal -->
    <div class="skills-glass-card__clickable"
      @click=${(e: Event) => {
        // Don't open modal when clicking buttons inside the card
        if ((e.target as HTMLElement).closest("button")) {
          return;
        }
        props.onSelectSkill(skill.skillKey);
      }}
    >
      <!-- Header row -->
      <div class="skills-glass-card__header">
        <div class="skills-glass-card__icon ${iconClass}">
          ${skillColorIcon(skill)}
        </div>
        <div class="skills-glass-card__body">
          <div class="skills-glass-card__name-row">
            <span class="skills-glass-card__name">
              ${skill.nameZh || skill.name}
            </span>
            ${tier === "incompatible" ? renderIncompatibleBadge(skill.requirements.os) : nothing}
            ${
              tier === "core" && skill.pinned && !skill.activeInPrompt
                ? html`
                    <span class="skills-glass-card__badge skills-glass-card__badge--inactive">未注入对话</span>
                  `
                : nothing
            }
            ${
              skill.bundled && !skill.activeInPrompt && !skill.disabled && tier === "ready"
                ? html`<span class="skills-glass-card__badge skills-glass-card__badge--bundled">
                  ${t("skills.bundled.notInCore" as never)}</span>`
                : nothing
            }
            ${
              skill.cnDeprioritized
                ? html`<span class="skills-glass-card__badge skills-glass-card__badge--cn-blocked"
                  title=${t("skills.market.cnBlocked.reason" as never)}
                >${t("skills.market.cnBlocked.vpnHint" as never)}</span>`
                : nothing
            }
            ${
              skill.disabled
                ? html`<span class="skills-glass-card__badge skills-glass-card__badge--disabled">
                  ${t("skills.disabled" as never)}</span>`
                : nothing
            }
            ${
              needsAttention
                ? html`<span class="skills-glass-card__badge skills-glass-card__badge--attention">
                  ${skill.primaryEnv ? t("skills.apiKey" as never) : t("skills.missing" as never)}</span>`
                : nothing
            }
          </div>
          <div class="skills-glass-card__desc">
            ${clampText(skill.descriptionZh || skill.description, 60)}
          </div>
          <div class="skills-glass-card__meta">
            <span>来源 ${skill.source || "local"}</span>
          </div>
          ${
            skill.missing.bins.length > 0 || skill.missing.env.length > 0
              ? html`<div class="skills-glass-card__missing-line">缺失: ${[...skill.missing.bins.map((b) => `bin:${b}`), ...skill.missing.env.map((e) => `env:${e}`)].join(", ")}</div>`
              : nothing
          }
        </div>
      </div>
    </div>

    <!-- Divider -->
    <div class="skills-glass-card__divider"></div>

    <!-- Actions row (outside clickable area) -->
    <div class="skills-card-footer">
      ${
        tier === "ready"
          ? html`<button
            class="skills-pill-btn skills-pill-btn--accent skills-pill-btn--sm"
            ?disabled=${busy}
            @click=${() => props.onPromoteToCore(skill.skillKey)}
          >${t("skills.action.addToCore" as never)}</button>`
          : nothing
      }
      ${
        tier === "core"
          ? html`<button
            class="skills-pill-btn skills-pill-btn--sm"
            ?disabled=${busy}
            @click=${() => props.onDemoteFromCore(skill.skillKey)}
          >${t("skills.core.demoteFromCore" as never)}</button>`
          : nothing
      }
      ${
        tier !== "incompatible"
          ? html`<button
            class="skills-pill-btn skills-pill-btn--sm"
            ?disabled=${busy}
            @click=${() => props.onToggle(skill.skillKey, skill.disabled)}
          >${skill.disabled ? t("skills.enable" as never) : t("skills.disable" as never)}</button>`
          : nothing
      }
    </div>
  `;
}

// ============================================================================
// Load more button for tier sections
// ============================================================================

function renderLoadMoreButton(tierId: string, shown: number, total: number, props: SkillsProps) {
  return html`
    <button
      class="skills-pill-btn skills-pill-btn--block"
      @click=${() => {
        showMoreInTier(tierId);
        props.onTierRenderBump();
      }}
    >
      ${t("skills.loadMore" as never)} (${shown}/${total})
    </button>
  `;
}

// ============================================================================
// Skills Import Modal — 本地技能导入对话框
// ============================================================================

function renderSkillImportModal(props: SkillsProps) {
  const result = props.importBrowseResult;
  const dirs = result?.directories ?? [];
  const drives = result?.drives ?? [];
  const isSkillDir = result?.isSkillDir ?? false;
  const skillSubdirCount = result?.skillSubdirCount ?? 0;
  const currentPath = result?.currentPath ?? "";
  const parentPath = result?.parentPath ?? null;

  return html`
    <div
      class="skills-glass-modal-overlay"
      @click=${(e: Event) => {
        if (e.target === e.currentTarget) {
          props.onImportClose();
        }
      }}
    >
      <div
        class="skills-glass-modal"
        @click=${(e: Event) => e.stopPropagation()}
      >
        <!-- Header -->
        <div class="skills-glass-modal__header">
          <div class="skills-glass-modal__title">
            ${t("skills.import.title" as never)}
          </div>
          <button class="skills-glass-modal__close" @click=${props.onImportClose}>&times;</button>
        </div>

        <!-- Path input bar -->
        <div class="skills-glass-modal__path-bar">
          <input
            type="text"
            class="skills-glass-modal__path-input"
            .value=${props.importPath}
            @input=${(e: Event) => props.onImportPathChange((e.target as HTMLInputElement).value)}
            @keydown=${(e: KeyboardEvent) => {
              if (e.key === "Enter") {
                props.onImportBrowse(props.importPath);
              }
            }}
            placeholder=${t("skills.import.pathPlaceholder" as never)}
          />
          <button
            class="skills-pill-btn skills-pill-btn--primary"
            ?disabled=${props.importLoading}
            @click=${() => props.onImportBrowse(props.importPath)}
          >${t("skills.import.go" as never)}</button>
        </div>

        <!-- Windows drives bar -->
        ${
          drives.length > 0
            ? html`
          <div class="skills-glass-modal__drives">
            ${drives.map(
              (drive) => html`
              <button
                class="skills-glass-modal__drive-btn"
                @click=${() => props.onImportBrowse(drive)}
                title=${drive}
              >${drive.replace("\\", "")}</button>
            `,
            )}
          </div>
        `
            : nothing
        }

        <!-- Directory listing (scrollable) -->
        <div class="skills-glass-modal__body">
          ${
            props.importLoading
              ? html`
                  <div class="skills-glass-modal__spinner">
                    <div class="skills-glass-modal__spinner-ring"></div>
                  </div>
                `
              : html`
            <!-- Parent directory link -->
            ${
              parentPath != null
                ? html`
              <div
                class="skills-glass-modal__dir-item"
                @click=${() => props.onImportBrowse(parentPath)}
              >
                <span class="skills-glass-modal__dir-icon skills-glass-modal__dir-icon--back"><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6" /></svg></span>
                <span class="skills-glass-modal__dir-name" style="font-weight:500;">..</span>
              </div>
            `
                : nothing
            }

            <!-- Directory entries -->
            ${dirs.map(
              (dir) => html`
              <div
                class="skills-glass-modal__dir-item"
                @click=${() => props.onImportBrowse(dir.path)}
              >
                <span class="skills-glass-modal__dir-icon ${dir.hasSkillMd ? "skills-glass-modal__dir-icon--skill" : ""}">
                  ${
                    dir.hasSkillMd
                      ? html`
                          <svg viewBox="0 0 24 24">
                            <polygon
                              points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
                            />
                          </svg>
                        `
                      : html`
                          <svg viewBox="0 0 24 24">
                            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                          </svg>
                        `
                  }
                </span>
                <span class="skills-glass-modal__dir-name ${dir.hasSkillMd ? "skills-glass-modal__dir-name--skill" : ""}">
                  ${dir.name}
                </span>
                ${
                  dir.hasSkillMd
                    ? html`
                        <span class="skills-glass-modal__dir-badge">SKILL.md</span>
                      `
                    : nothing
                }
              </div>
            `,
            )}

            ${
              dirs.length === 0 && parentPath != null
                ? html`
                    <div class="skills-glass-modal__empty-text">（空目录）</div>
                  `
                : nothing
            }
          `
          }
        </div>

        <!-- Detection status + import actions -->
        <div class="skills-glass-modal__footer">
          ${
            props.importLoading
              ? nothing
              : isSkillDir
                ? html`
            <div class="skills-glass-modal__detect skills-glass-modal__detect--skill">
              <span class="skills-glass-modal__detect-icon"><svg viewBox="0 0 24 24" width="14" height="14" stroke="#34d399" fill="none" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12" /></svg></span>
              <span class="skills-glass-modal__detect-text">
                ${t("skills.import.detectedSkill" as never)}
              </span>
            </div>
            <div class="skills-glass-modal__actions">
              <button
                class="skills-pill-btn"
                ?disabled=${props.importLoading}
                @click=${() => props.onImportExecute(currentPath, "reference")}
                title=${t("skills.import.referenceHint" as never)}
              >${t("skills.import.addReference" as never)}</button>
              <button
                class="skills-pill-btn skills-pill-btn--primary"
                ?disabled=${props.importLoading}
                @click=${() => props.onImportExecute(currentPath, "copy")}
                title=${t("skills.import.copyHint" as never)}
              >${t("skills.import.copyImport" as never)}</button>
            </div>
          `
                : skillSubdirCount > 0
                  ? html`
            <div class="skills-glass-modal__detect skills-glass-modal__detect--multi">
              <span class="skills-glass-modal__detect-icon"><svg viewBox="0 0 24 24" width="14" height="14" stroke="#f59e0b" fill="none" stroke-width="2" stroke-linecap="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></svg></span>
              <span class="skills-glass-modal__detect-text">
                ${t("skills.import.detectedMultiple" as never).replace("{count}", String(skillSubdirCount))}
              </span>
            </div>
            <div class="skills-glass-modal__actions">
              <button
                class="skills-pill-btn"
                ?disabled=${props.importLoading}
                @click=${() => props.onImportExecute(currentPath, "reference")}
                title=${t("skills.import.referenceHint" as never)}
              >${t("skills.import.addReference" as never)}</button>
              <button
                class="skills-pill-btn skills-pill-btn--primary"
                ?disabled=${props.importLoading}
                @click=${() => props.onImportExecute(currentPath, "copy")}
                title=${t("skills.import.copyHint" as never)}
              >${t("skills.import.copyImport" as never)}</button>
            </div>
          `
                  : html`
            <div class="skills-glass-modal__no-skill">
              ${t("skills.import.noSkillFound" as never)}
            </div>
          `
          }

          <!-- Success display -->
          ${
            props.importSuccess
              ? html`
            <div class="skills-glass-modal__success">${props.importSuccess}</div>
          `
              : nothing
          }

          <!-- Error display (hidden during loading to avoid stale errors) -->
          ${
            !props.importLoading && props.importError
              ? html`
            <div class="skills-glass-modal__error">${props.importError}</div>
          `
              : nothing
          }
        </div>
      </div>
    </div>
  `;
}

// ============================================================================
// Tab 2: Marketplace (search + grid + pagination)
// ============================================================================

function renderMarketplace(props: SkillsProps) {
  const result = props.marketSearchResult;
  const items = result?.items ?? [];

  return html`
    <div class="skills-market-scroll">
    <!-- ClawHub official link banner -->
    <div class="skills-glass-banner">
      <span class="skills-glass-banner__icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg></span>
      <span style="flex:1;">
        ${t("skills.market.clawhubBanner" as never)}
        <a
          href="https://clawhub.com"
          target="_blank"
          rel="noopener"
          class="skills-glass-banner__link"
        >clawhub.com</a>
        <span style="opacity:0.4; margin:0 6px;">|</span>
        <span style="opacity:0.55;">
          ${t("skills.market.clawhubFallback" as never)}
        </span>
      </span>
    </div>

    <!-- Toolbar: search + categories + refresh -->
    <div class="skills-glass-market-toolbar">
      <!-- Search box -->
      <div class="skills-glass-market-search">
        <span class="skills-glass-market-search__icon"><svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg></span>
        <input
          type="text"
          class="skills-glass-market-search__input"
          @input=${(e: Event) => {
            const val = (e.target as HTMLInputElement).value;
            if (_skillSearchTimer) {
              clearTimeout(_skillSearchTimer);
            }
            _skillSearchTimer = setTimeout(() => props.onMarketSearch(val), 300);
          }}
          placeholder=${t("skills.search.placeholder" as never)}
        />
      </div>

      <!-- Category chips -->
      <div class="skills-glass-category-bar">
        ${SKILLS_CATEGORIES.map((cat) => {
          const isActive = props.marketCategory === cat.id;
          return html`
            <button
              class="skills-glass-category-chip ${isActive ? "skills-glass-category-chip--active" : ""}"
              @click=${() =>
                props.onMarketCategoryChange(isActive && cat.id !== "all" ? "all" : cat.id)}
            >
              ${cat.label}
            </button>
          `;
        })}
      </div>

      <!-- Refresh button -->
      <button
        class="skills-glass-refresh-btn"
        @click=${props.onMarketRefresh}
        ?disabled=${props.marketLoading}
      >
        ${props.marketLoading ? t("skills.market.syncing" as never) : t("common.refresh" as never)}
      </button>
    </div>

    <!-- Content -->
    ${
      !result
        ? props.marketError
          ? renderMarketError(props.marketError)
          : renderMarketLoading()
        : items.length === 0
          ? renderMarketEmpty()
          : html`
            <div class="skills-glass-market-grid">
              ${items.map((item) => renderSkillMarketCard(item, props))}
            </div>
            ${renderScrollSentinel(props)}
          `
    }
    </div>
  `;
}

// ============================================================================
// Marketplace card
// ============================================================================

type MarketItem = SkillsMarketSearchResult["items"][number];

function tierBg(tier: string): string {
  switch (tier) {
    case "S":
      return "rgba(52,211,153,0.12)";
    case "A":
      return "rgba(96,165,250,0.12)";
    case "B":
      return "rgba(251,191,36,0.12)";
    default:
      return "rgba(148,163,184,0.1)";
  }
}

function tierColor(tier: string): string {
  switch (tier) {
    case "S":
      return "#34d399";
    case "A":
      return "#60a5fa";
    case "B":
      return "#fbbf24";
    default:
      return "#94a3b8";
  }
}

function marketCardTierClass(tier: string | undefined): string {
  if (!tier) {
    return "skills-glass-market-card--tier-default";
  }
  switch (tier) {
    case "S":
      return "skills-glass-market-card--tier-s";
    case "A":
      return "skills-glass-market-card--tier-a";
    case "B":
      return "skills-glass-market-card--tier-b";
    default:
      return "skills-glass-market-card--tier-default";
  }
}

function renderCardAction(item: MarketItem, props: SkillsProps) {
  const installKey = item.skillId || item.name;
  const busy = props.busyKey === installKey;
  if (item.installed) {
    return html`<span class="skills-card-installed-row">
      <span class="skills-installed-badge">\u2713 ${t("skills.remote.alreadyInstalled" as never)}</span>
      <button
        class="skills-pill-btn skills-pill-btn--danger skills-pill-btn--sm"
        ?disabled=${busy}
        @click=${(e: Event) => { e.stopPropagation(); props.onMarketUninstall(installKey); }}
      >${t("skills.uninstall" as never)}</button>
    </span>`;
  }
  const progress = props.installProgress[installKey];
  if (progress) {
    const isDone = progress.stage === "done";
    const isSuccess = isDone && (progress.percent ?? 0) >= 100;
    const badgeClass = isSuccess
      ? "skills-progress-badge--success"
      : isDone
        ? "skills-progress-badge--error"
        : "skills-progress-badge--working";
    return html`<span class="skills-progress-badge ${badgeClass}">
      ${isDone
        ? html`<span>${isSuccess ? "\u2713" : "\u2717"}</span>`
        : html`<span class="skills-progress-badge__spinner"></span>`}
      ${progress.message || t("skills.installing" as never)}
    </span>`;
  }
  return html`<button
    class="skills-pill-btn skills-pill-btn--primary skills-pill-btn--sm"
    @click=${(e: Event) => { e.stopPropagation(); props.onMarketInstall(installKey); }}
  >${t("skills.remote.install" as never)}</button>`;
}

function renderSkillMarketCard(item: MarketItem, props: SkillsProps) {
  // Gateway skills_marketplace.search 返回 SkillMarketplaceItem，字段是 nameCn/descriptionCn。
  // 同时兼容 friendlyNameCn/friendlyName（来自 MCP marketplace 的不同接口）。
  const displayName = item.nameCn || item.friendlyNameCn || item.friendlyName || item.name;
  const displayDesc = item.descriptionCn || item.description;
  const iconContent = item.emoji ? item.emoji : _defaultSkillIcon();
  const isInstalled = item.installed === true;

  // 从 item 中提取扩展字段
  const author = (item as any).author as string | undefined;
  const stars = item.overallScore;
  const tags = item.tags ?? [];

  // 副标题：author · category
  const subtitleParts: string[] = [];
  if (author) subtitleParts.push(author);
  if (item.category) subtitleParts.push(item.category);
  const subtitle = subtitleParts.join(" · ");

  // 格式化 stars
  const formatStars = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);

  return html`
    <div class="skills-glass-market-card ${marketCardTierClass(item.tier)}"
      @click=${() => props.onSelectMarketSkill(item)}
    >
      <!-- Header: icon + name + tier -->
      <div class="skills-glass-market-card__header">
        <div class="skills-glass-market-card__icon ${isInstalled ? "skills-glass-market-card__icon--installed" : "skills-glass-market-card__icon--default"}">
          ${iconContent}
        </div>
        <div class="skills-glass-market-card__body">
          <div class="skills-glass-market-card__name-row">
            <span class="skills-glass-market-card__name">${displayName}</span>
            ${
              item.tier
                ? html`<span class="skills-glass-market-card__tier-badge" style="background:${tierBg(item.tier)}; color:${tierColor(item.tier)};">${item.tier}</span>`
                : nothing
            }
          </div>
          ${subtitle ? html`<div class="skills-glass-market-card__subtitle">${subtitle}</div>` : nothing}
        </div>
      </div>

      <!-- Description (2-line CSS clamp) -->
      <div class="skills-glass-market-card__desc">
        ${displayDesc}
      </div>

      <!-- Tags (max 3) -->
      ${tags.length > 0 ? html`
        <div class="skills-glass-market-card__tags">
          ${tags.slice(0, 3).map((tag: string) => html`<span class="skills-glass-market-card__tag">${tag}</span>`)}
        </div>
      ` : nothing}

      <!-- Footer: stats left, action right -->
      <div class="skills-glass-market-card__footer">
        <div class="skills-glass-market-card__stats">
          ${stars ? html`<span class="skills-glass-market-card__stat">\u2B50 ${formatStars(stars)}</span>` : nothing}
        </div>
        ${renderCardAction(item, props)}
      </div>
    </div>
  `;
}

// ============================================================================
// Detail modal — local skill
// ============================================================================

function renderSkillDetailModal(props: SkillsProps) {
  if (!props.selectedSkillKey || !props.report) {
    return nothing;
  }
  const skill = props.report.skills.find((s) => s.skillKey === props.selectedSkillKey);
  if (!skill) {
    return nothing;
  }

  const busy = props.busyKey === skill.skillKey;
  const apiKey = props.edits[skill.skillKey] ?? "";
  const message = props.messages[skill.skillKey] ?? null;
  const canInstall = skill.install.length > 0 && skill.missing.bins.length > 0;
  const missing = computeSkillMissing(skill);
  const reasons = computeSkillReasons(skill);
  const progress =
    props.installProgress[skill.name] ?? props.installProgress[skill.skillKey] ?? null;

  // Determine which tier this skill is in
  const groups = groupByTier(props.report.skills);
  let tier: TierGroupId = "needs-config";
  for (const g of groups) {
    if (g.skills.some((s) => s.skillKey === skill.skillKey)) {
      tier = g.id as TierGroupId;
      break;
    }
  }

  const close = () => props.onSelectSkill(null);

  return html`
    <div class="skills-glass-modal-overlay" @click=${close}>
      <div class="skills-detail-modal" @click=${(e: Event) => e.stopPropagation()}>
        <!-- Header -->
        <div class="skills-detail-modal__header">
          <div class="skills-detail-modal__hero">
            <div class="skills-glass-card__icon skills-glass-card__icon--${tier === "core" ? "core" : tier === "ready" ? "ready" : tier === "incompatible" ? "incompatible" : "needs-config"}" style="width:48px;height:48px;font-size:24px;">
              ${skillColorIcon(skill)}
            </div>
            <div>
              <div class="skills-detail-modal__name">${skill.nameZh || skill.name}</div>
              <div class="skills-detail-modal__source">${skill.source}</div>
            </div>
          </div>
          <button class="skills-detail-modal__close" @click=${close}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <!-- Description -->
        <div class="skills-detail-modal__desc">
          ${skill.descriptionZh || skill.description}
        </div>

        <!-- Badges -->
        <div class="skills-detail-modal__badges">
          ${tier === "incompatible" ? renderIncompatibleBadge(skill.requirements.os) : nothing}
          ${
            tier === "core" && skill.pinned && !skill.activeInPrompt
              ? html`
                  <span class="skills-glass-card__badge skills-glass-card__badge--inactive">未注入对话</span>
                `
              : nothing
          }
          ${
            skill.cnDeprioritized
              ? html`<span class="skills-glass-card__badge skills-glass-card__badge--cn-blocked">${t("skills.market.cnBlocked.vpnHint" as never)}</span>`
              : nothing
          }
          ${
            skill.disabled
              ? html`<span class="skills-glass-card__badge skills-glass-card__badge--disabled">${t("skills.disabled" as never)}</span>`
              : nothing
          }
        </div>

        <!-- Missing deps -->
        ${
          missing.length > 0
            ? html`<div class="skills-detail-modal__section">
              <div class="skills-detail-modal__section-label">${t("skills.missing" as never)}</div>
              <div class="skills-glass-card__missing">${missing.join(", ")}</div>
            </div>`
            : nothing
        }
        ${
          reasons.length > 0
            ? html`<div class="skills-detail-modal__section">
              <div class="skills-detail-modal__section-label">${t("skills.reason" as never)}</div>
              <div class="skills-glass-card__missing">${reasons.join(", ")}</div>
            </div>`
            : nothing
        }

        <!-- API key -->
        ${
          skill.primaryEnv
            ? html`<div class="skills-detail-modal__section">
              <div class="skills-detail-modal__section-label">${t("skills.apiKey" as never)}</div>
              <div class="skills-detail-modal__apikey">
                <input
                  type="password"
                  class="skills-glass-card__apikey-input"
                  .value=${apiKey}
                  placeholder="${skill.primaryEnv}"
                  @input=${(e: Event) =>
                    props.onEdit(skill.skillKey, (e.target as HTMLInputElement).value)}
                />
                <button
                  class="skills-pill-btn skills-pill-btn--primary skills-pill-btn--sm"
                  ?disabled=${busy}
                  @click=${() => props.onSaveKey(skill.skillKey)}
                >${t("skills.saveKey" as never)}</button>
              </div>
            </div>`
            : nothing
        }

        <!-- Actions -->
        <div class="skills-detail-modal__actions">
          ${
            tier === "ready"
              ? html`<button
                class="skills-pill-btn skills-pill-btn--accent"
                ?disabled=${busy}
                @click=${() => props.onPromoteToCore(skill.skillKey)}
              >${t("skills.action.addToCore" as never)}</button>`
              : nothing
          }
          ${
            tier === "core"
              ? html`<button
                class="skills-pill-btn"
                ?disabled=${busy}
                @click=${() => props.onDemoteFromCore(skill.skillKey)}
              >${t("skills.core.demoteFromCore" as never)}</button>`
              : nothing
          }
          ${
            tier !== "incompatible"
              ? html`<button
                class="skills-pill-btn"
                ?disabled=${busy}
                @click=${() => props.onToggle(skill.skillKey, skill.disabled)}
              >${skill.disabled ? t("skills.enable" as never) : t("skills.disable" as never)}</button>`
              : nothing
          }
          ${
            canInstall
              ? html`<button
                class="skills-pill-btn skills-pill-btn--primary"
                ?disabled=${busy}
                @click=${() => props.onInstall(skill.skillKey, skill.name, skill.install[0].id)}
              >${busy ? t("skills.installing" as never) : skill.install[0].label}</button>`
              : nothing
          }
        </div>

        <!-- Install progress -->
        ${
          progress && progress.stage !== "done"
            ? html`<div class="skills-glass-progress">
              <div class="skills-glass-progress__info">
                <span class="skills-glass-progress__message">${progress.message}</span>
                ${
                  progress.percent != null
                    ? html`<span class="skills-glass-progress__percent">${progress.percent}%</span>`
                    : nothing
                }
              </div>
              <div class="skills-glass-progress__track">
                <div class="skills-glass-progress__fill" style="width:${progress.percent ?? 50}%;"></div>
              </div>
            </div>`
            : nothing
        }

        <!-- Message -->
        ${
          message
            ? html`<div class="${message.kind === "error" ? "skills-glass-card__message--error" : "skills-glass-card__message--success"}">${message.message}</div>`
            : nothing
        }
      </div>
    </div>
  `;
}

// ============================================================================
// Detail modal — market skill
// ============================================================================

function renderMarketDetailModal(props: SkillsProps) {
  const item = props.selectedMarketSkill;
  if (!item) {
    return nothing;
  }

  const displayName = item.nameCn || item.friendlyNameCn || item.friendlyName || item.name;
  const displayDesc = item.descriptionCn || item.description;
  const iconContent = item.emoji ? item.emoji : _defaultSkillIcon();
  const installKey = item.skillId || item.name;
  const progress = props.installProgress[installKey];

  const close = () => props.onSelectMarketSkill(null);

  return html`
    <div class="skills-glass-modal-overlay" @click=${close}>
      <div class="skills-detail-modal" @click=${(e: Event) => e.stopPropagation()}>
        <!-- Header -->
        <div class="skills-detail-modal__header">
          <div class="skills-detail-modal__hero">
            <div class="skills-glass-market-card__icon ${item.installed ? "skills-glass-market-card__icon--installed" : "skills-glass-market-card__icon--default"}" style="width:48px;height:48px;font-size:24px;">
              ${iconContent}
            </div>
            <div>
              <div class="skills-detail-modal__name">${displayName}</div>
              ${
                item.tier
                  ? html`<span class="skills-glass-market-card__tier-badge" style="background:${tierBg(item.tier)}; color:${tierColor(item.tier)};">${item.tier}</span>`
                  : nothing
              }
              ${
                item.category
                  ? html`<span class="skills-detail-modal__category">${item.category}</span>`
                  : nothing
              }
            </div>
          </div>
          <button class="skills-detail-modal__close" @click=${close}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <!-- Full description -->
        <div class="skills-detail-modal__desc">
          ${displayDesc}
        </div>

        <!-- Tags -->
        ${
          item.tags && item.tags.length > 0
            ? html`<div class="skills-detail-modal__tags">
              ${item.tags.map(
                (tag) => html`<span class="skills-glass-market-card__tag">${tag}</span>`,
              )}
            </div>`
            : nothing
        }

        <!-- CN blocked info -->
        ${
          item.cnBlocked
            ? html`<div class="skills-detail-modal__section">
              <span class="skills-cnblocked__reason">${t("skills.market.cnBlocked.reason" as never)}</span>
              ${
                item.cnAlternative
                  ? html`<span class="skills-cnblocked__alt">
                    ${t("skills.market.cnBlocked.alternative" as never).replace("{alternative}", item.cnAlternative)}
                  </span>`
                  : nothing
              }
            </div>`
            : nothing
        }

        <!-- Install button -->
        <div class="skills-detail-modal__actions">
          ${renderInstallButton(item, progress, props)}
        </div>
      </div>
    </div>
  `;
}

function renderInstallButton(
  item: MarketItem,
  progress: InstallProgress | undefined,
  props: SkillsProps,
) {
  // 用 skillId 作为安装标识（proxy 下载 API 需要 skillId，不是 name）
  const installKey = item.skillId || item.name;
  const busy = props.busyKey === installKey;
  if (item.installed) {
    return html`<span class="skills-card-installed-row">
      <span class="skills-installed-badge">\u2713 ${t("skills.remote.alreadyInstalled" as never)}</span>
      <button
        class="skills-pill-btn skills-pill-btn--danger skills-pill-btn--sm"
        ?disabled=${busy}
        @click=${() => props.onMarketUninstall(installKey)}
      >${t("skills.uninstall" as never)}</button>
    </span>`;
  }
  // availability-dict / qc 来源的技能可能在 proxy 上有包，允许用户尝试安装。
  // 安装失败时 gateway 会返回错误提示。不再一刀切阻止。
  if (item.cnBlocked) {
    return html`<div class="skills-cnblocked">
      <span class="skills-cnblocked__reason">
        ${t("skills.market.cnBlocked.reason" as never)}
      </span>
      ${
        item.cnAlternative
          ? html`<span class="skills-cnblocked__alt">
            ${t("skills.market.cnBlocked.alternative" as never).replace(
              "{alternative}",
              item.cnAlternative,
            )}
          </span>`
          : nothing
      }
      <button
        class="skills-pill-btn skills-pill-btn--danger skills-pill-btn--sm"
        @click=${() => props.onMarketInstall(installKey)}
        title=${t("skills.market.cnBlocked.vpnHint" as never)}
      >
        ${t("skills.market.cnBlocked.installAnyway" as never)}
      </button>
    </div>`;
  }
  if (progress) {
    const isDone = progress.stage === "done";
    const isSuccess = isDone && (progress.percent ?? 0) >= 100;
    const badgeClass = isSuccess
      ? "skills-progress-badge--success"
      : isDone
        ? "skills-progress-badge--error"
        : "skills-progress-badge--working";
    return html`<span class="skills-progress-badge ${badgeClass}">
      ${
        isDone
          ? html`<span>${isSuccess ? "\u2713" : "\u2717"}</span>`
          : html`
              <span class="skills-progress-badge__spinner"></span>
            `
      }
      ${progress.message || t("skills.installing" as never)}
    </span>`;
  }
  return html`<button
    class="skills-pill-btn skills-pill-btn--primary"
    @click=${() => props.onMarketInstall(installKey)}
  >
    ${t("skills.remote.install" as never)}
  </button>`;
}

// ============================================================================
// Infinite scroll sentinel (IntersectionObserver)
// ============================================================================

let _scrollObserver: IntersectionObserver | null = null;
let _latestLoadMore: (() => void) | null = null;
let _latestCanLoad = false;

function setupScrollObserver(props: SkillsProps) {
  // Update module-level refs so the observer callback always uses latest state
  _latestLoadMore = props.onMarketLoadMore;
  _latestCanLoad = props.hasMorePages && !props.marketLoading;

  // Defer to next frame so the sentinel element exists in the DOM
  requestAnimationFrame(() => {
    const sentinel = document.querySelector(".skills-scroll-sentinel");
    if (!sentinel) {
      if (_scrollObserver) {
        _scrollObserver.disconnect();
        _scrollObserver = null;
      }
      return;
    }

    if (!props.hasMorePages) {
      if (_scrollObserver) {
        _scrollObserver.disconnect();
        _scrollObserver = null;
      }
      return;
    }

    // Only create observer once; re-use across renders (callback reads module refs)
    if (!_scrollObserver) {
      _scrollObserver = new IntersectionObserver(
        (entries) => {
          if (entries[0]?.isIntersecting && _latestCanLoad && _latestLoadMore) {
            _latestLoadMore();
          }
        },
        { rootMargin: "300px" },
      );
    }

    // Re-observe in case sentinel element changed (Lit may recreate DOM nodes)
    _scrollObserver.disconnect();
    _scrollObserver.observe(sentinel);
  });
}

function renderScrollSentinel(props: SkillsProps) {
  const result = props.marketSearchResult;
  const loaded = result?.items.length ?? 0;
  const total = result?.total ?? 0;

  // Schedule observer setup after this render
  setupScrollObserver(props);

  if (!props.hasMorePages) {
    return html`
      <div class="skills-glass-scroll-status" style="opacity:0.7;">
        ${t("skills.market.allLoaded" as never)} (${loaded}/${total})
      </div>
    `;
  }

  return html`
    <div class="skills-glass-scroll-status">
      ${
        props.marketLoading
          ? html`
            <span class="skills-glass-scroll-status__spinner"></span>
            <span>${t("skills.market.loadingMore" as never)}</span>
          `
          : html`<span>${t("skills.market.scrollForMore" as never)}</span>`
      }
    </div>
    <div class="skills-scroll-sentinel"></div>
  `;
}

// ============================================================================
// Loading / Error / Empty states
// ============================================================================

function renderMarketLoading() {
  return html`
    <div class="skills-glass-status">
      <div class="skills-glass-status__icon--spinner"></div>
      <div class="skills-glass-status__title">
        ${t("skills.market.loading" as never)}
      </div>
      <div class="skills-glass-status__hint">
        ${t("skills.market.loadingHint" as never)}
      </div>
    </div>
  `;
}

function renderMarketError(error: string) {
  return html`
    <div class="skills-glass-status">
      <div class="skills-glass-status__icon">
        <svg viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
      </div>
      <div class="skills-glass-status__title">
        ${t("skills.market.errorTitle" as never)}
      </div>
      <div class="skills-glass-status__desc">
        ${error}
      </div>
      <div class="skills-glass-status__hint">
        ${t("skills.market.errorClawhubHint" as never)}
        <a
          href="https://clawhub.com"
          target="_blank"
          rel="noopener"
          class="skills-glass-banner__link"
        >clawhub.com</a>
      </div>
    </div>
  `;
}

function renderMarketEmpty() {
  return html`
    <div class="skills-glass-status">
      <div class="skills-glass-status__icon">
        <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
      </div>
      <div class="skills-glass-status__title">
        ${t("skills.noResults.title" as never)}
      </div>
      <div class="skills-glass-status__desc">
        ${t("skills.market.emptyHint" as never)}
      </div>
      <div class="skills-glass-status__hint">
        ${t("skills.market.emptyClawhubHint" as never)}
        <a
          href="https://clawhub.com"
          target="_blank"
          rel="noopener"
          class="skills-glass-banner__link"
        >clawhub.com</a>
      </div>
    </div>
  `;
}
