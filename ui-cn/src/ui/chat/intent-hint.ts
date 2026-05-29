/**
 * OpenClawCN: Intent Hint Module
 *
 * 意图检测 + 能力缺失智能提示。
 * 当用户输入暗示需要某种能力（画图、搜索等）但该能力未配置时，
 * 在输入框上方轻量提示。
 *
 * 独立模块，方便与上游 OpenClaw 合并。
 */
import { html, nothing, type TemplateResult } from "lit";
import { t, tMaybe } from "../i18n/index.js";

// ── Types ──────────────────────────────────────────────

export type IntentHintProps = {
  /** Current draft text */
  draft: string;
  /** Active capabilities (e.g. ["text", "image-understanding", "image-generation"]) */
  activeCapabilities: string[];
  /** Whether user has image attachments */
  hasImageAttachments: boolean;
  /** Navigate to model config page */
  onNavigateToModelConfig?: () => void;
};

type DetectedIntent = {
  /** Capability key needed */
  capability: string;
  /** User-friendly hint message i18n key */
  hintKey: string;
  /** Emoji icon */
  icon: string;
};

// ── v2→v1 capability key aliases ─────────────────────
// The v2 capability_matrix API returns short keys ("vision", "imageGen") while
// INTENT_PATTERNS use v1 keys ("image-understanding", "image-generation").
// This map lets us match either convention from activeCapabilities.
const CAPABILITY_ALIASES: Record<string, string> = {
  vision: "image-understanding",
  imageGen: "image-generation",
  videoGen: "video-generation",
};

/** Check whether a given capability is present in activeCapabilities,
 *  accepting both v1 and v2 key conventions. */
function hasCapability(active: string[], cap: string): boolean {
  if (active.includes(cap)) return true;
  // Check if any v2 alias maps to this v1 key
  for (const [v2Key, v1Key] of Object.entries(CAPABILITY_ALIASES)) {
    if (v1Key === cap && active.includes(v2Key)) return true;
  }
  return false;
}

// ── Intent detection patterns ──────────────────────────
// Matches user draft text to detect what capability they likely need.
// Reuses similar pattern logic from backend modality-router.ts.
// Note: .*? (lazy) instead of .* (greedy) to limit backtracking.

const INTENT_PATTERNS: Array<{
  capability: string;
  hintKey: string;
  icon: string;
  patterns: RegExp[];
}> = [
  {
    capability: "image-generation",
    hintKey: "chat.hint.imageGen",
    icon: "🎨",
    patterns: [
      // Bounded gap {0,8} to avoid cross-clause matches; 画画 added
      // (?<!动)图 excludes "动图" (GIF/animation → video-gen territory)
      /画[一个两三张幅]|画画|帮我画|生成.{0,8}(?:图片|图像|照片|(?<!动)图)|画.{0,6}(?:图片|(?<!动)图)|制作.{0,6}图片|创作.{0,6}(?:图片|(?<!动)图)/,
      /\b(?:generate|create).{0,12}(?:image|picture|photo)|\bdraw.{0,8}for me|\bmake.{0,12}illustration/i,
    ],
  },
  {
    capability: "image-understanding",
    hintKey: "chat.hint.vision",
    icon: "👁",
    // Only triggers when user has image attachments but no vision capability
    patterns: [], // Detected via hasImageAttachments instead
  },
  {
    // web search - either "search" capability or a search-related agent tool
    capability: "web-search",
    hintKey: "chat.hint.search",
    icon: "🔍",
    patterns: [
      /搜[一索]|搜索一下|查[一查]|查一下|帮我[搜查]|最新.{0,6}新闻|今天.{0,6}消息/,
      /\bsearch for\b|\blook up\b|\bfind.{0,12}online|\blatest news/i,
    ],
  },
  {
    capability: "video-generation",
    hintKey: "chat.hint.videoGen",
    icon: "🎬",
    patterns: [
      // Video generation: "生成视频", "制作动画", "文字转视频" etc.
      /生成.{0,6}(?:视频|动画|短片|短视频|动图)/,
      /制作.{0,4}(?:视频|动画|短片)/,
      /做[一个].{0,4}(?:视频|动画)/,
      /帮我.{0,4}(?:生成|制作|做).{0,4}(?:视频|动画)/,
      /(?:文字|文本|图片?).{0,4}(?:转|变成|生成).{0,4}(?:视频|动画)/,
      /\b(?:generate|create|make).{0,12}(?:video|animation|clip)\b/i,
      /\b(?:text|image)\s*(?:to|2)\s*video\b/i,
    ],
  },
  {
    capability: "video",
    hintKey: "chat.hint.video",
    icon: "📹",
    patterns: [
      // Video understanding: "分析视频", "看视频", "这个视频" etc.
      /分析.{0,6}视频|视频.{0,4}分析|看.{0,4}视频|这个视频/,
      /\banalyze.{0,8}video\b|\bthis video\b|\bwatch.{0,8}video\b/i,
    ],
  },
  {
    capability: "embedding",
    hintKey: "chat.hint.memory",
    icon: "🧠",
    patterns: [
      /记住|之前说过|上次聊|还记得/,
      /\bremember\b.*\b(?:said|told|discussed|conversation)\b|\brecall\b.*\b(?:earlier|before|previous)\b|\bwe discussed\b|\blast time we\b/i,
    ],
  },
];

// ── Detection cache ───────────────────────────────────
// Avoid re-running regex on every keystroke when input hasn't changed.

let _cachedDraft = "";
let _cachedAttachments = false;
let _cachedCaps: string[] = [];
let _cachedResult: DetectedIntent | null = null;
let _cacheValid = false;

function isCapsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

// ── Detection logic ────────────────────────────────────

function detectMissingCapabilityIntent(props: IntentHintProps): DetectedIntent | null {
  const { draft, activeCapabilities, hasImageAttachments } = props;

  // Check cache
  if (
    _cacheValid &&
    draft === _cachedDraft &&
    hasImageAttachments === _cachedAttachments &&
    isCapsEqual(activeCapabilities, _cachedCaps)
  ) {
    return _cachedResult;
  }

  // Compute
  const result = computeIntent(draft, activeCapabilities, hasImageAttachments);

  // Store cache
  _cachedDraft = draft;
  _cachedAttachments = hasImageAttachments;
  _cachedCaps = [...activeCapabilities];
  _cachedResult = result;
  _cacheValid = true;

  return result;
}

function computeIntent(
  draft: string,
  activeCapabilities: string[],
  hasImageAttachments: boolean,
): DetectedIntent | null {
  // Check image understanding first (attachment-triggered)
  if (hasImageAttachments && !hasCapability(activeCapabilities, "image-understanding")) {
    return {
      capability: "image-understanding",
      hintKey: "chat.hint.vision",
      icon: "👁",
    };
  }

  // Check text-based intents
  const trimmed = draft.trim();
  if (trimmed.length < 2) return null;

  for (const intent of INTENT_PATTERNS) {
    // Skip if no patterns (image-understanding is attachment-only)
    if (intent.patterns.length === 0) continue;
    // Skip if capability already active (accept both v1 and v2 keys)
    if (hasCapability(activeCapabilities, intent.capability)) continue;
    // Check if any pattern matches
    if (intent.patterns.some((p) => p.test(trimmed))) {
      return {
        capability: intent.capability,
        hintKey: intent.hintKey,
        icon: intent.icon,
      };
    }
  }

  return null;
}

// ── Render ──────────────────────────────────────────────

/**
 * Renders a lightweight hint bar above the compose card when
 * the user's input implies a capability that isn't configured.
 */
export function renderIntentHint(props: IntentHintProps): TemplateResult | typeof nothing {
  const intent = detectMissingCapabilityIntent(props);
  if (!intent) return nothing;

  return html`
    <div class="cc-intent-hint" role="status">
      <span class="cc-intent-hint__icon">${intent.icon}</span>
      <span class="cc-intent-hint__text">${tMaybe(intent.hintKey)}</span>
      ${
        props.onNavigateToModelConfig
          ? html`
            <button
              class="cc-intent-hint__action"
              type="button"
              @click=${props.onNavigateToModelConfig}
            >
              ${t("chat.hint.configure")}
            </button>
          `
          : nothing
      }
    </div>
  `;
}
