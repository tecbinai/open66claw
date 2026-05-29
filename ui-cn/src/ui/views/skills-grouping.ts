import { t } from "../i18n/index.js";
import type { SkillStatusEntry } from "../types.ts";

export type SkillGroup = {
  id: string;
  label: string;
  skills: SkillStatusEntry[];
};

export type TierGroupId = "core" | "ready" | "needs-config" | "incompatible";

/**
 * Group skills by status tier (aligned with upstream prompt injection logic):
 * - incompatible: missing.os — cannot run on this platform
 * - core (核心激活): eligible + not disabled + not blocked — these ARE injected
 *         into every LLM request and consume tokens. Upstream injects ALL
 *         eligible skills (up to 150 / 30k chars).
 * - ready (准备就绪): not disabled but missing deps (bins/env) — install deps
 *         to make them eligible and auto-activate.
 * - needs-config (待配置): disabled or blocked by allowlist — needs user action.
 */
export function groupByTier(skills: SkillStatusEntry[]): SkillGroup[] {
  const core: SkillStatusEntry[] = [];
  const ready: SkillStatusEntry[] = [];
  const needsConfig: SkillStatusEntry[] = [];
  const incompatible: SkillStatusEntry[] = [];

  for (const skill of skills) {
    if (skill.missing.os.length > 0) {
      incompatible.push(skill);
    } else if (skill.eligible && !skill.disabled && !skill.blockedByAllowlist) {
      // Eligible = will be injected into LLM prompt → core
      core.push(skill);
    } else if (!skill.disabled && !skill.blockedByAllowlist) {
      // Not disabled, not blocked, but missing deps → ready (install to activate)
      ready.push(skill);
    } else {
      // Disabled or blocked → needs config
      needsConfig.push(skill);
    }
  }

  const groups: SkillGroup[] = [];
  if (core.length > 0) {
    groups.push({
      id: "core",
      label: t("skills.tier.core" as never) || "核心技能",
      skills: core,
    });
  }
  if (ready.length > 0) {
    groups.push({
      id: "ready",
      label: t("skills.tier.ready" as never) || "就绪技能",
      skills: ready,
    });
  }
  if (needsConfig.length > 0) {
    groups.push({
      id: "needs-config",
      label: t("skills.tier.needsConfig" as never) || "需要配置",
      skills: needsConfig,
    });
  }
  if (incompatible.length > 0) {
    groups.push({
      id: "incompatible",
      label: t("skills.tier.incompatible" as never) || "不兼容",
      skills: incompatible,
    });
  }

  return groups;
}

// Legacy source-based grouping (kept for compatibility)
function getSkillSourceGroups(): Array<{ id: string; label: string; sources: string[] }> {
  return [
    {
      id: "workspace",
      label: t("skills.group.workspace" as never) || "工作区技能",
      sources: ["openclawcn-workspace"],
    },
    {
      id: "built-in",
      label: t("skills.group.builtIn" as never) || "内置技能",
      sources: ["openclawcn-bundled"],
    },
    {
      id: "installed",
      label: t("skills.group.installed" as never) || "已安装技能",
      sources: ["openclawcn-managed"],
    },
    {
      id: "extra",
      label: t("skills.group.extra" as never) || "扩展技能",
      sources: ["openclawcn-extra"],
    },
  ];
}

export function groupSkills(skills: SkillStatusEntry[]): SkillGroup[] {
  const sourceGroups = getSkillSourceGroups();
  const groups = new Map<string, SkillGroup>();
  for (const def of sourceGroups) {
    groups.set(def.id, { id: def.id, label: def.label, skills: [] });
  }
  const builtInGroup = sourceGroups.find((group) => group.id === "built-in");
  const other: SkillGroup = {
    id: "other",
    label: t("skills.group.other" as never) || "其他技能",
    skills: [],
  };
  for (const skill of skills) {
    const match = skill.bundled
      ? builtInGroup
      : sourceGroups.find((group) => group.sources.includes(skill.source));
    if (match) {
      groups.get(match.id)?.skills.push(skill);
    } else {
      other.skills.push(skill);
    }
  }
  const ordered = sourceGroups
    .map((group) => groups.get(group.id))
    .filter((group): group is SkillGroup => Boolean(group && group.skills.length > 0));
  if (other.skills.length > 0) {
    ordered.push(other);
  }
  return ordered;
}
