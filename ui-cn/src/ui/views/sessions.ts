import { html, nothing } from "lit";
import { formatAgo } from "../format";
import { t, tMaybe } from "../i18n/index.js";
import { icons } from "../icons.js";
import { pathForTab } from "../navigation";
import { formatSessionTokens } from "../presenter";
import type { GatewaySessionRow, SessionsListResult } from "../types";

export type SessionsProps = {
  loading: boolean;
  result: SessionsListResult | null;
  error: string | null;
  activeMinutes: string;
  limit: string;
  includeGlobal: boolean;
  includeUnknown: boolean;
  basePath: string;
  /** Session key to highlight (navigated from chat "View Details") */
  highlightKey: string;
  /** Current search query for filtering sessions */
  searchQuery: string;
  onFiltersChange: (next: {
    activeMinutes: string;
    limit: string;
    includeGlobal: boolean;
    includeUnknown: boolean;
  }) => void;
  onSearchChange: (query: string) => void;
  onRefresh: () => void;
  onPatch: (
    key: string,
    patch: {
      label?: string | null;
      thinkingLevel?: string | null;
      verboseLevel?: string | null;
      reasoningLevel?: string | null;
    },
  ) => void;
  onDelete: (key: string) => void;
};

const THINK_LEVELS = [
  { value: "", labelKey: "sessions.opt.inherit" },
  { value: "off", labelKey: "sessions.opt.off" },
  { value: "minimal", labelKey: "sessions.opt.minimal" },
  { value: "low", labelKey: "sessions.opt.low" },
  { value: "medium", labelKey: "sessions.opt.medium" },
  { value: "high", labelKey: "sessions.opt.high" },
] as const;
const BINARY_THINK_LEVELS = [
  { value: "", labelKey: "sessions.opt.inherit" },
  { value: "off", labelKey: "sessions.opt.off" },
  { value: "on", labelKey: "sessions.opt.on" },
] as const;
const VERBOSE_LEVELS = [
  { value: "", labelKey: "sessions.opt.inherit" },
  { value: "off", labelKey: "sessions.opt.offExplicit" },
  { value: "on", labelKey: "sessions.opt.on" },
] as const;
const REASONING_LEVELS = [
  { value: "", labelKey: "sessions.opt.inherit" },
  { value: "off", labelKey: "sessions.opt.off" },
  { value: "on", labelKey: "sessions.opt.on" },
  { value: "stream", labelKey: "sessions.opt.stream" },
] as const;

function normalizeProviderId(provider?: string | null): string {
  if (!provider) return "";
  const normalized = provider.trim().toLowerCase();
  if (normalized === "z.ai" || normalized === "z-ai") return "zai";
  return normalized;
}

function isBinaryThinkingProvider(provider?: string | null): boolean {
  return normalizeProviderId(provider) === "zai";
}

function resolveThinkLevelOptions(provider?: string | null) {
  return isBinaryThinkingProvider(provider) ? BINARY_THINK_LEVELS : THINK_LEVELS;
}

function resolveThinkLevelDisplay(value: string, isBinary: boolean): string {
  if (!isBinary) return value;
  if (!value || value === "off") return value;
  return "on";
}

function resolveThinkLevelPatchValue(value: string, isBinary: boolean): string | null {
  if (!value) return null;
  if (!isBinary) return value;
  if (value === "on") return "low";
  return value;
}

/** 浮动气泡帮助组件 */
function tip(helpKey: string, extraClass = "") {
  return html`<span class="tip-wrap ${extraClass}"><span class="tip-icon">?</span><span class="tip-bubble">${tMaybe(helpKey)}</span></span>`;
}

// ── Session title resolution (mirrors conversation-sidebar logic) ──

/** Detect hash/UUID-like strings that aren't meaningful titles */
const HASH_LIKE_RE = /^[0-9a-f]{6,}(?:\s|$)/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;
const CHANNEL_KEY_RE = /^(?:slack|telegram|discord|signal|wecom|wechat|qq|feishu|dingtalk|nostr):/i;

function isHashLike(text: string): boolean {
  return HASH_LIKE_RE.test(text) || UUID_RE.test(text) || CHANNEL_KEY_RE.test(text);
}

function cleanForTitle(raw: string): string | null {
  let t = raw;
  t = t.replace(/^\[?(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[^\]]*\]?\s*/i, "");
  t = t.replace(
    /^\d{4}[-/]\d{1,2}[-/]\d{1,2}[\sT]\d{1,2}:\d{2}(?::\d{2})?(?:\s*(?:GMT|UTC)?[+-]?\d{0,4})?\s*/i,
    "",
  );
  t = t.replace(/[*_~`#]+/g, "");
  t = t.replace(/https?:\/\/\S+/gi, "");
  t = t.replace(/^(?:视频已生成[！!]?\s*)/i, "");
  t = t.replace(/^[\s\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F]+/gu, "");
  t = t.replace(/\s+/g, " ").trim();
  if (t.length < 2) return null;
  return t.length > 40 ? t.slice(0, 40) + "..." : t;
}

function getSessionTitle(s: GatewaySessionRow): string {
  if (s.displayName?.trim()) return s.displayName.trim();
  if (s.derivedTitle?.trim()) {
    const cleaned = cleanForTitle(s.derivedTitle.trim());
    if (cleaned && !isHashLike(cleaned)) return cleaned;
  }
  if (s.lastMessagePreview?.trim()) {
    const cleaned = cleanForTitle(s.lastMessagePreview.trim());
    if (cleaned && !isHashLike(cleaned)) return cleaned;
  }
  if (s.label?.trim()) {
    const cleaned = cleanForTitle(s.label.trim());
    if (cleaned && !isHashLike(cleaned)) return cleaned;
  }
  return "";
}

function filterSessionRows(rows: GatewaySessionRow[], query: string): GatewaySessionRow[] {
  if (!query.trim()) return rows;
  const lower = query.toLowerCase();
  return rows.filter((s) => {
    const title = getSessionTitle(s).toLowerCase();
    const label = (s.label ?? "").toLowerCase();
    const key = s.key.toLowerCase();
    return title.includes(lower) || label.includes(lower) || key.includes(lower);
  });
}

export function renderSessions(props: SessionsProps) {
  const allRows = props.result?.sessions ?? [];
  const rows = filterSessionRows(allRows, props.searchQuery);
  return html`
    <section class="card">
      <!-- Search + refresh bar -->
      <div class="row" style="justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap;">
        <div class="sessions-search" style="flex: 1; min-width: 200px; max-width: 400px; position: relative;">
          <input
            type="text"
            class="sessions-search__input"
            placeholder=${t("sessions.searchSessions")}
            .value=${props.searchQuery}
            @input=${(e: Event) => props.onSearchChange((e.target as HTMLInputElement).value)}
            style="width: 100%; padding: 6px 12px 6px 32px; border: 1px solid var(--border); border-radius: 6px; font-size: 14px; background: var(--bg); color: var(--fg);"
          />
          <span style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--muted); width: 16px; height: 16px; pointer-events: none;">${icons.search}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          ${
            allRows.length !== rows.length
              ? html`<span class="muted" style="font-size: 13px;">${t("sessions.searchResultCount", { shown: String(rows.length), total: String(allRows.length) })}</span>`
              : nothing
          }
          <button class="btn" ?disabled=${props.loading} @click=${props.onRefresh}>
            ${props.loading ? t("common.loading") : t("common.refresh")}
          </button>
        </div>
      </div>

      <div class="filters" style="margin-top: 14px;">
        <label class="field">
          <span>${t("sessions.filter.activeMinutes")} ${tip("sessions.help.activeMinutes")}</span>
          <input
            .value=${props.activeMinutes}
            @input=${(e: Event) =>
              props.onFiltersChange({
                activeMinutes: (e.target as HTMLInputElement).value,
                limit: props.limit,
                includeGlobal: props.includeGlobal,
                includeUnknown: props.includeUnknown,
              })}
          />
        </label>
        <label class="field">
          <span>${t("sessions.filter.limit")}</span>
          <input
            .value=${props.limit}
            @input=${(e: Event) =>
              props.onFiltersChange({
                activeMinutes: props.activeMinutes,
                limit: (e.target as HTMLInputElement).value,
                includeGlobal: props.includeGlobal,
                includeUnknown: props.includeUnknown,
              })}
          />
        </label>
        <label class="field checkbox">
          <span>${t("sessions.filter.includeGlobal")}</span>
          <input
            type="checkbox"
            .checked=${props.includeGlobal}
            @change=${(e: Event) =>
              props.onFiltersChange({
                activeMinutes: props.activeMinutes,
                limit: props.limit,
                includeGlobal: (e.target as HTMLInputElement).checked,
                includeUnknown: props.includeUnknown,
              })}
          />
        </label>
        <label class="field checkbox">
          <span>${t("sessions.filter.includeUnknown")}</span>
          <input
            type="checkbox"
            .checked=${props.includeUnknown}
            @change=${(e: Event) =>
              props.onFiltersChange({
                activeMinutes: props.activeMinutes,
                limit: props.limit,
                includeGlobal: props.includeGlobal,
                includeUnknown: (e.target as HTMLInputElement).checked,
              })}
          />
        </label>
      </div>

      ${
        props.error
          ? html`<div class="callout danger" style="margin-top: 12px;">${props.error}</div>`
          : nothing
      }

      <div class="muted" style="margin-top: 12px;">
        ${props.result ? `Store: ${props.result.path}` : ""}
      </div>

      <div class="table" style="margin-top: 16px;">
        <div class="table-head">
          <div>${t("sessions.sessionKey")} ${tip("sessions.help.sessionKey")}</div>
          <div>${t("sessions.col.conversationTitle")} ${tip("sessions.help.conversationTitle")}</div>
          <div>${t("common.name")}</div>
          <div>${t("common.type")}</div>
          <div>${t("common.updated")}</div>
          <div>${t("sessions.col.tokens")} ${tip("sessions.help.tokens")}</div>
          <div>${t("chat.thinkingLevel")} ${tip("sessions.help.thinkingLevel")}</div>
          <div>${t("sessions.col.verbose")} ${tip("sessions.help.verbose")}</div>
          <div>${t("sessions.col.reasoning")} ${tip("sessions.help.reasoning", "tip-right")}</div>
          <div>${t("common.actions")}</div>
        </div>
        ${
          rows.length === 0
            ? html`<div class="muted">${t("sessions.noSessions")}</div>`
            : rows.map((row) =>
                renderRow(
                  row,
                  props.basePath,
                  props.highlightKey,
                  props.onPatch,
                  props.onDelete,
                  props.loading,
                  props.result?.mainKey,
                ),
              )
        }
      </div>
    </section>
  `;
}

function renderRow(
  row: GatewaySessionRow,
  basePath: string,
  highlightKey: string,
  onPatch: SessionsProps["onPatch"],
  onDelete: SessionsProps["onDelete"],
  disabled: boolean,
  mainKey?: string,
) {
  const isMain = !!(mainKey && row.key === mainKey);
  const updated = row.updatedAt ? formatAgo(row.updatedAt) : "n/a";
  const rawThinking = row.thinkingLevel ?? "";
  const isBinaryThinking = isBinaryThinkingProvider(row.modelProvider);
  const thinking = resolveThinkLevelDisplay(rawThinking, isBinaryThinking);
  const thinkLevels = resolveThinkLevelOptions(row.modelProvider);
  const verbose = row.verboseLevel ?? "";
  const reasoning = row.reasoningLevel ?? "";
  const displayName = row.displayName ?? row.key;
  const canLink = row.kind !== "global";
  const chatUrl = canLink
    ? `${pathForTab("chat", basePath)}?session=${encodeURIComponent(row.key)}`
    : null;
  const isHighlighted = highlightKey === row.key;
  const convTitle = getSessionTitle(row);

  return html`
    <div class="table-row ${isHighlighted ? "table-row--highlight" : ""}">
      <div class="mono">${
        canLink ? html`<a href=${chatUrl} class="session-link">${displayName}</a>` : displayName
      }</div>
      <div class="session-conv-title">${
        convTitle ||
        html`
          <span class="muted">-</span>
        `
      }</div>
      <div>
        <input
          .value=${row.label ?? ""}
          ?disabled=${disabled}
          placeholder=${t("sessions.namePlaceholder")}
          @change=${(e: Event) => {
            const value = (e.target as HTMLInputElement).value.trim();
            onPatch(row.key, { label: value || null });
          }}
        />
      </div>
      <div>${tMaybe(`sessions.kind.${row.kind}`)}</div>
      <div>${updated}</div>
      <div>${formatSessionTokens(row)}</div>
      <div>
        <select
          .value=${thinking}
          ?disabled=${disabled}
          @change=${(e: Event) => {
            const value = (e.target as HTMLSelectElement).value;
            onPatch(row.key, {
              thinkingLevel: resolveThinkLevelPatchValue(value, isBinaryThinking),
            });
          }}
        >
          ${thinkLevels.map(
            (level) => html`<option value=${level.value}>${tMaybe(level.labelKey)}</option>`,
          )}
        </select>
      </div>
      <div>
        <select
          .value=${verbose}
          ?disabled=${disabled}
          @change=${(e: Event) => {
            const value = (e.target as HTMLSelectElement).value;
            onPatch(row.key, { verboseLevel: value || null });
          }}
        >
          ${VERBOSE_LEVELS.map(
            (level) => html`<option value=${level.value}>${tMaybe(level.labelKey)}</option>`,
          )}
        </select>
      </div>
      <div>
        <select
          .value=${reasoning}
          ?disabled=${disabled}
          @change=${(e: Event) => {
            const value = (e.target as HTMLSelectElement).value;
            onPatch(row.key, { reasoningLevel: value || null });
          }}
        >
          ${REASONING_LEVELS.map(
            (level) => html`<option value=${level.value}>${tMaybe(level.labelKey)}</option>`,
          )}
        </select>
      </div>
      <div>
        <button class="btn danger" ?disabled=${disabled || isMain} title=${isMain ? t("sidebar.mainSessionCannotDelete") : ""} @click=${() => {
          if (!isMain) onDelete(row.key);
        }}>
          ${isMain ? t("sidebar.mainSession") : t("common.delete")}
        </button>
      </div>
    </div>
  `;
}
