/**
 * Soul Optimizer — Dynamic SOUL Enhancement via Learning
 *
 * Takes learning insights and injects them into the Supervisor's SOUL
 * as a `<learning-hints>` section. This provides the supervisor with
 * data-driven guidance for routing, task decomposition, and quality control.
 *
 * The optimizer works in two modes:
 *   1. **Hints injection**: Append/replace `<learning-hints>` in supervisor context
 *      (lightweight, no SOUL regeneration needed)
 *   2. **Performance profile**: Generate a compact member performance section
 *      for SOUL regeneration (used when project.update triggers regen)
 *
 * All operations are deterministic and zero-LLM-cost.
 *
 * Migrated from clawdbot extensions/agent-team/src/soul-optimizer.ts
 */

import type { AgentSpecialization, LearningAnalysis } from "./learning-engine.js";
import { computeAverageDuration } from "./member-stats.js";
import type { MemberHealth, MemberStats, Project } from "./types.js";

// ── Types ────────────────────────────────────────────────────────────────

export type PerformanceProfile = {
  /** Agent ID */
  agentId: string;
  /** Display name */
  name: string;
  /** Success rate as percentage string */
  successRate: string;
  /** Average duration as human-readable string */
  avgDuration: string;
  /** Health state */
  health: string;
  /** Notable strengths or patterns */
  notes: string;
};

// ── Constants ────────────────────────────────────────────────────────────

const LEARNING_HINTS_START = "<learning-hints>";
const LEARNING_HINTS_END = "</learning-hints>";
const MAX_PROFILE_CHARS = 800;

// ── Performance Profile ──────────────────────────────────────────────────

/**
 * Build a compact performance profile for all team members.
 * Designed to be injected into the Supervisor's SOUL during regeneration.
 *
 * @returns A formatted section string, or empty string if insufficient data
 */
export function buildMemberPerformanceProfile(
  project: Project,
  statsMap: Map<string, MemberStats>,
  healthMap: Map<string, MemberHealth>,
  specializations?: AgentSpecialization[],
): string {
  const nonSupervisor = project.members.filter((m) => m.id !== project.supervisorId);
  if (nonSupervisor.length === 0) return "";

  const profiles: PerformanceProfile[] = [];
  let hasData = false;

  for (const member of nonSupervisor) {
    const stats = statsMap.get(member.id);
    const health = healthMap.get(member.id);
    const spec = specializations?.find((s) => s.agentId === member.id);

    if (!stats || stats.callCount === 0) {
      profiles.push({
        agentId: member.id,
        name: member.name,
        successRate: "-",
        avgDuration: "-",
        health: health?.state ?? "unknown",
        notes: "No data yet",
      });
      continue;
    }

    hasData = true;
    const avgMs = computeAverageDuration(stats);
    const successRate = spec
      ? `${Math.round(spec.successRate * 100)}%`
      : health
        ? `${Math.round((health.totalSuccesses / (health.totalSuccesses + health.totalFailures || 1)) * 100)}%`
        : "-";

    const notes: string[] = [];
    if (spec?.strengths && spec.strengths.length > 0) {
      notes.push(`strengths: ${spec.strengths.join(", ")}`);
    }
    if (health?.state === "degraded") notes.push("recent failures");
    if (health?.state === "down") notes.push("currently down");
    if (avgMs > 10000) notes.push("slow responses");

    profiles.push({
      agentId: member.id,
      name: member.name,
      successRate,
      avgDuration: avgMs > 0 ? `${(avgMs / 1000).toFixed(1)}s` : "-",
      health: health?.state ?? "healthy",
      notes: notes.join(", ") || "normal",
    });
  }

  if (!hasData) return "";

  const lines: string[] = [];
  lines.push("## Live Member Stats\n");

  for (const profile of profiles) {
    lines.push(
      `- ${profile.name}: ${profile.successRate} success, avg ${profile.avgDuration}, ${profile.notes}`,
    );
  }

  let result = lines.join("\n");
  if (result.length > MAX_PROFILE_CHARS) {
    result = result.slice(0, MAX_PROFILE_CHARS - 3) + "...";
  }

  return result;
}

// ── SOUL Learning Hints Management ───────────────────────────────────────

/**
 * Append or replace the `<learning-hints>` section in a SOUL string.
 */
export function appendLearningHintsToSoul(existingSoul: string, hints: string): string {
  if (!hints || hints.trim().length === 0) return existingSoul;

  const startIdx = existingSoul.indexOf(LEARNING_HINTS_START);
  const endIdx = existingSoul.indexOf(LEARNING_HINTS_END);

  if (startIdx >= 0 && endIdx >= 0 && endIdx > startIdx) {
    // Replace existing block
    return (
      existingSoul.slice(0, startIdx) +
      hints +
      existingSoul.slice(endIdx + LEARNING_HINTS_END.length)
    );
  }

  // Insert after Quality Gates but before Operating Rules
  const qualityGatesIdx = existingSoul.indexOf("## Quality Gates");
  if (qualityGatesIdx > 0) {
    const afterQG = existingSoul.indexOf("\n## ", qualityGatesIdx + 1);
    if (afterQG > 0) {
      return existingSoul.slice(0, afterQG) + "\n\n" + hints + existingSoul.slice(afterQG);
    }
  }

  // Fallback: before Operating Rules
  const operatingRulesIdx = existingSoul.indexOf("## Operating Rules");
  if (operatingRulesIdx > 0) {
    return (
      existingSoul.slice(0, operatingRulesIdx) +
      hints +
      "\n\n" +
      existingSoul.slice(operatingRulesIdx)
    );
  }

  // Otherwise just append at the end
  return existingSoul + "\n\n" + hints;
}

/**
 * Remove learning hints from a SOUL string.
 */
export function removeLearningHintsFromSoul(existingSoul: string): string {
  const startIdx = existingSoul.indexOf(LEARNING_HINTS_START);
  const endIdx = existingSoul.indexOf(LEARNING_HINTS_END);

  if (startIdx >= 0 && endIdx >= 0 && endIdx > startIdx) {
    const before = existingSoul.slice(0, startIdx).trimEnd();
    const after = existingSoul.slice(endIdx + LEARNING_HINTS_END.length).trimStart();
    return before + (after ? "\n\n" + after : "");
  }

  return existingSoul;
}

// ── Supervisor Context Enhancement ───────────────────────────────────────

/**
 * Build the learning context block to prepend to supervisor's context
 * in the `before_agent_start` hook.
 */
export function buildSupervisorLearningContext(
  project: Project,
  analysis: LearningAnalysis | undefined,
  statsMap: Map<string, MemberStats>,
  healthMap: Map<string, MemberHealth>,
): string {
  const parts: string[] = [];

  // Part 1: Quick performance snapshot
  const profileSection = buildMemberPerformanceProfile(
    project,
    statsMap,
    healthMap,
    analysis?.specializations,
  );
  if (profileSection) {
    parts.push(profileSection);
  }

  // Part 2: High-severity alerts from learning analysis
  if (analysis && analysis.insights.length > 0) {
    const highAlerts = analysis.insights.filter((i) => i.severity === "high");
    if (highAlerts.length > 0) {
      const alertLines = ["[Team Alerts]"];
      for (const alert of highAlerts.slice(0, 3)) {
        alertLines.push(`- ${alert.description}`);
      }
      parts.push(alertLines.join("\n"));
    }
  }

  // Part 3: Learned routing preferences
  if (analysis && analysis.routingPatterns.length > 0) {
    const patternLines = ["[Learned Routing]"];
    for (const p of analysis.routingPatterns.slice(0, 5)) {
      if (p.confidence >= 0.8 && p.sampleSize >= 3) {
        patternLines.push(`- "${p.trigger}" -> ${p.agentId} (${Math.round(p.confidence * 100)}%)`);
      }
    }
    if (patternLines.length > 1) {
      parts.push(patternLines.join("\n"));
    }
  }

  return parts.join("\n\n");
}
