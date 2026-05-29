import { html, nothing } from "lit";
import { t } from "../i18n/index.js";
import type { SkillStatusEntry } from "../types.ts";

export function computeSkillMissing(skill: SkillStatusEntry): string[] {
  return [
    ...skill.missing.bins.map((b) => `bin:${b}`),
    ...skill.missing.env.map((e) => `env:${e}`),
    ...skill.missing.config.map((c) => `config:${c}`),
    ...skill.missing.os.map((o) => `os:${o}`),
  ];
}

export function computeSkillReasons(skill: SkillStatusEntry): string[] {
  const reasons: string[] = [];
  if (skill.disabled) {
    reasons.push(t("agents.skillDisabled"));
  }
  // blockedByAllowlist is shown as a badge in the card header (ready tier),
  // no longer as a blocking reason since eligible is now independent of allowBundled.
  return reasons;
}

function localizeSource(source: string): string {
  switch (source) {
    case "openclawcn-bundled":
      return "内置";
    case "openclawcn-managed":
      return "已安装";
    case "openclawcn-workspace":
      return "工作区";
    case "openclawcn-extra":
      return "扩展";
    case "openclawcn-private":
      return "私有";
    case "clawdbot-bundled":
      return "内置";
    case "clawdbot-managed":
      return "已安装";
    case "clawdbot-workspace":
      return "工作区";
    case "clawdbot-extra":
      return "扩展";
    case "agents-skills-personal":
      return "个人";
    case "agents-skills-project":
      return "项目";
    default:
      return source;
  }
}

export function renderSkillStatusChips(params: {
  skill: SkillStatusEntry;
  showBundledBadge?: boolean;
}) {
  const skill = params.skill;
  const showBundledBadge = Boolean(params.showBundledBadge);
  return html`
    <div class="chip-row" style="margin-top: 6px;">
      <span class="chip">${localizeSource(skill.source)}</span>
      ${
        showBundledBadge
          ? html`
              <span class="chip">${t("agents.skillBundled")}</span>
            `
          : nothing
      }
      <span class="chip ${skill.eligible ? "chip-ok" : "chip-warn"}">
        ${skill.eligible ? t("agents.skillEligible") : t("agents.skillBlocked")}
      </span>
      ${
        skill.disabled
          ? html`
              <span class="chip chip-warn">${t("agents.skillDisabled")}</span>
            `
          : nothing
      }
    </div>
  `;
}

/** Core skill badge (amber/gold) */
export function renderCoreBadge() {
  return html`<span style="
    font-size:10px; padding:2px 8px; border-radius:4px;
    background:rgba(251,191,36,0.15); color:#f59e0b;
    font-weight:600;
  ">${t("skills.core.badge" as never)}</span>`;
}

/** Pinned skill badge (blue) */
export function renderPinnedBadge() {
  return html`<span style="
    font-size:10px; padding:2px 8px; border-radius:4px;
    background:rgba(96,165,250,0.12); color:#60a5fa;
    font-weight:600;
  ">${t("skills.pinned.badge" as never)}</span>`;
}

/** Incompatible OS badge (gray) */
export function renderIncompatibleBadge(requiredOs: string[]) {
  let label: string;
  if (requiredOs.length === 1) {
    const os = requiredOs[0];
    if (os === "darwin") label = t("skills.incompatible.macos" as never);
    else if (os === "win32") label = t("skills.incompatible.windows" as never);
    else if (os === "linux") label = t("skills.incompatible.linux" as never);
    else label = t("skills.incompatible" as never);
  } else {
    label = t("skills.incompatible" as never);
  }
  return html`<span style="
    font-size:10px; padding:2px 8px; border-radius:4px;
    background:rgba(148,163,184,0.1); color:#94a3b8;
    font-weight:600;
  ">${label}</span>`;
}

/** Tier badge (S/A/B/C colored) */
export function renderTierBadge(tier: string) {
  let bg: string;
  let color: string;
  switch (tier) {
    case "S":
      bg = "rgba(52,211,153,0.12)";
      color = "#34d399";
      break;
    case "A":
      bg = "rgba(96,165,250,0.12)";
      color = "#60a5fa";
      break;
    case "B":
      bg = "rgba(251,191,36,0.12)";
      color = "#fbbf24";
      break;
    default:
      bg = "rgba(148,163,184,0.1)";
      color = "#94a3b8";
      break;
  }
  return html`<span style="
    font-size:10px; padding:2px 8px; border-radius:4px;
    background:${bg}; color:${color}; font-weight:600;
  ">${tier}</span>`;
}
