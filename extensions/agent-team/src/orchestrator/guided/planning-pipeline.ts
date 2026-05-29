/**
 * Multi-Round Planning Pipeline
 *
 * Replaces the single-pass blueprint processing in handleGuidedPropose with
 * a Plan→Verify→Refine→Finalize cycle that checks completeness, capability
 * coverage, and feasibility.
 *
 * Inspired by MetaGPT SOP pipeline and LangGraph Plan-and-Execute with Reflexion.
 *
 * The pipeline runs up to MAX_ROUNDS iterations (default 3).
 * Each round:
 *   1. Infers capabilities for all blueprints
 *   2. Verifies the team (scene-verifier)
 *   3. Detects structural issues (overlap, gaps, imbalance)
 *   4. If issues found, generates refinement actions automatically
 *   5. If no critical issues or max rounds reached, finalizes
 *
 * Zero LLM cost — all logic is deterministic.
 */

import { recommendToolsForRole } from "../tool-recommend.js";
import type { AgentBlueprint, UserContext, InferredCapabilities } from "../types.js";
import {
  inferAgentCapabilities,
  estimateRoleComplexity,
  isSupervisorRole,
  type ModelCandidate,
} from "./capability-inference.js";
import type { DiscoveryResult } from "./runtime-discovery.js";
import { MAX_SKILLS_PER_AGENT, MAX_MCP_PER_AGENT } from "./runtime-discovery.js";
import type { SceneVerification, SceneGap } from "./scene-verifier.js";
import { verifyScene } from "./scene-verifier.js";

// ── Types ────────────────────────────────────────────────────────────────

export type PlanningIssue = {
  severity: "error" | "warning" | "info";
  category: "coverage" | "capability" | "feasibility" | "structure" | "overlap";
  message: string;
  agentId?: string;
  suggestion?: string;
};

export type PlanningRoundResult = {
  round: number;
  issues: PlanningIssue[];
  actionsApplied: string[];
  verification?: SceneVerification;
};

export type PipelineResult = {
  /** Final refined blueprints */
  blueprints: AgentBlueprint[];
  /** Results from each planning round */
  rounds: PlanningRoundResult[];
  /** Overall coverage score (0-100) */
  coverageScore: number;
  /** Overall feasibility score (0-100) */
  feasibilityScore: number;
  /** Final scene verification */
  verification: SceneVerification;
  /** Total rounds executed */
  totalRounds: number;
  /** Human-readable summary of refinements applied */
  refinementSummary: string;
};

// ── Constants ────────────────────────────────────────────────────────────

const MAX_ROUNDS = 3;
const OVERLAP_THRESHOLD = 0.6; // 60% keyword overlap → considered duplicate

// ── Main Pipeline ────────────────────────────────────────────────────────

/**
 * Execute the multi-round planning pipeline.
 *
 * Iteratively refines blueprints until no critical issues remain
 * or MAX_ROUNDS is reached.
 */
export function executePlanningPipeline(params: {
  blueprints: AgentBlueprint[];
  requirement: string;
  userCtx: UserContext;
  pluginConfig?: Record<string, unknown>;
  discovery?: DiscoveryResult;
  availableModels?: ModelCandidate[];
}): PipelineResult {
  const { requirement, userCtx, pluginConfig, discovery, availableModels } = params;
  let blueprints = [...params.blueprints];
  const rounds: PlanningRoundResult[] = [];

  let lastVerification: SceneVerification | undefined;

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    const roundResult: PlanningRoundResult = {
      round,
      issues: [],
      actionsApplied: [],
    };

    // ── Step 1: Infer capabilities ──
    for (const bp of blueprints) {
      bp.inferredCapabilities = inferAgentCapabilities(
        bp,
        userCtx,
        pluginConfig,
        discovery,
        availableModels,
      );
      if (!bp.tools || !bp.tools.allow || bp.tools.allow.length === 0) {
        bp.tools = recommendToolsForRole(bp.role, bp.name);
      }
    }

    // ── Step 2: Verify scene ──
    const verification = verifyScene({
      requirement,
      blueprints,
      userCtx,
      discovery,
    });
    roundResult.verification = verification;
    lastVerification = verification;

    // ── Step 3: Structural analysis ──
    const structuralIssues = analyzeStructure(blueprints, userCtx, requirement);
    roundResult.issues.push(...structuralIssues);

    // Convert verification failures to issues
    for (const check of verification.checks) {
      if (!check.pass) {
        roundResult.issues.push({
          severity: check.severity === "critical" ? "error" : "warning",
          category: checkNameToCategory(check.name),
          message: check.detail,
        });
      }
    }

    // Add gap-based issues
    for (const gap of verification.gaps) {
      roundResult.issues.push({
        severity: "warning",
        category: "coverage",
        message: gap.missingCapability,
        suggestion: gap.suggestion,
      });
    }

    // ── Step 4: Auto-refine if actionable issues found ──
    const criticalIssues = roundResult.issues.filter((i) => i.severity === "error");
    const actionableWarnings = roundResult.issues.filter(
      (i) => i.severity === "warning" && (i.category === "overlap" || i.category === "feasibility"),
    );
    const needsRefine = criticalIssues.length > 0 || actionableWarnings.length > 0;

    if (!needsRefine) {
      // No actionable issues — finalize
      rounds.push(roundResult);
      break;
    }

    if (round === MAX_ROUNDS) {
      // Max rounds exhausted with unresolved issues — add warning if critical
      if (criticalIssues.length > 0) {
        roundResult.issues.push({
          severity: "warning",
          category: "structure",
          message: `经过 ${MAX_ROUNDS} 轮优化仍有 ${criticalIssues.length} 个严重问题未解决，建议人工审查`,
          suggestion: criticalIssues.map((i) => i.message).join("；"),
        });
      }
      rounds.push(roundResult);
      break;
    }

    // Apply automatic refinements
    const { refined, actions } = autoRefine(
      blueprints,
      roundResult.issues,
      verification.gaps,
      userCtx,
    );
    blueprints = refined;
    roundResult.actionsApplied = actions;

    rounds.push(roundResult);

    // If no refinements were applied, stop early
    if (actions.length === 0) break;
  }

  // ── Finalize ──
  // Defensive: if no rounds executed (shouldn't happen with MAX_ROUNDS>=1), create a default verification
  if (!lastVerification) {
    lastVerification = verifyScene({ requirement, blueprints, userCtx, discovery });
  }

  const coverageScore = computeCoverageScore(lastVerification);
  const feasibilityScore = computeFeasibilityScore(blueprints, discovery);
  const refinementSummary = formatRefinementSummary(rounds);

  return {
    blueprints,
    rounds,
    coverageScore,
    feasibilityScore,
    verification: lastVerification,
    totalRounds: rounds.length,
    refinementSummary,
  };
}

// ── Structural Analysis ──────────────────────────────────────────────────

/**
 * Analyze team structure for issues beyond scene verification.
 */
function analyzeStructure(
  blueprints: AgentBlueprint[],
  userCtx: UserContext,
  _requirement: string,
): PlanningIssue[] {
  const issues: PlanningIssue[] = [];

  // Check 1: Detect role overlap
  const overlaps = detectRoleOverlap(blueprints);
  for (const overlap of overlaps) {
    issues.push({
      severity: "warning",
      category: "overlap",
      message: `「${overlap.agent1}」和「${overlap.agent2}」角色高度重叠（${Math.round(overlap.similarity * 100)}%）`,
      suggestion: `考虑合并为一个 agent 或细化各自职责`,
    });
  }

  // Check 2: Team size balance
  if (blueprints.length > 8) {
    issues.push({
      severity: "warning",
      category: "structure",
      message: `团队规模过大（${blueprints.length} 个成员），可能导致 Supervisor 路由困难`,
      suggestion: "建议控制在 5-7 个成员以内",
    });
  }

  if (blueprints.length === 1 && userCtx.scenario !== "general") {
    issues.push({
      severity: "info",
      category: "structure",
      message: "只有1个成员，不需要多 agent 协作",
    });
  }

  // Check 3: Complexity-model mismatch
  for (const bp of blueprints) {
    const complexity = estimateRoleComplexity(bp.role);
    if (complexity === "complex" && bp.modelTier === "cheap") {
      issues.push({
        severity: "warning",
        category: "feasibility",
        message: `「${bp.name}」角色复杂度高但使用了低端模型`,
        agentId: bp.id,
        suggestion: `建议升级到 mid 或 sota 模型`,
      });
    }
    if (complexity === "simple" && bp.modelTier === "sota") {
      issues.push({
        severity: "info",
        category: "feasibility",
        message: `「${bp.name}」角色简单但使用了高端模型，可降级节省成本`,
        agentId: bp.id,
        suggestion: `可使用 cheap 模型降低成本`,
      });
    }
  }

  // Check 4: Duplicate agent IDs
  const idSet = new Set<string>();
  for (const bp of blueprints) {
    if (idSet.has(bp.id)) {
      issues.push({
        severity: "error",
        category: "structure",
        message: `重复的 agent ID: "${bp.id}"`,
        agentId: bp.id,
        suggestion: "每个 agent 必须有唯一的 ID",
      });
    }
    idSet.add(bp.id);
  }

  // Check 5: Skill/MCP over-limit
  for (const bp of blueprints) {
    const skillCount = bp.inferredCapabilities?.skills?.length ?? 0;
    const mcpCount = bp.inferredCapabilities?.mcpHints?.length ?? 0;
    if (skillCount > MAX_SKILLS_PER_AGENT) {
      issues.push({
        severity: "error",
        category: "capability",
        message: `「${bp.name}」技能数量 ${skillCount} 超过上限 ${MAX_SKILLS_PER_AGENT}`,
        agentId: bp.id,
      });
    }
    if (mcpCount > MAX_MCP_PER_AGENT) {
      issues.push({
        severity: "error",
        category: "capability",
        message: `「${bp.name}」MCP 服务数量 ${mcpCount} 超过上限 ${MAX_MCP_PER_AGENT}`,
        agentId: bp.id,
      });
    }
  }

  return issues;
}

// ── Role Overlap Detection ───────────────────────────────────────────────

type OverlapResult = {
  agent1: string;
  agent2: string;
  similarity: number;
};

/**
 * Detect pairs of agents with high role overlap using keyword similarity.
 */
function detectRoleOverlap(blueprints: AgentBlueprint[]): OverlapResult[] {
  const results: OverlapResult[] = [];

  for (let i = 0; i < blueprints.length; i++) {
    for (let j = i + 1; j < blueprints.length; j++) {
      const a = blueprints[i];
      const b = blueprints[j];

      const similarity = computeRoleSimilarity(a.role, b.role);
      if (similarity >= OVERLAP_THRESHOLD) {
        results.push({
          agent1: a.name,
          agent2: b.name,
          similarity,
        });
      }
    }
  }

  return results;
}

/**
 * Compute similarity between two role descriptions using Jaccard index on keywords,
 * with a shared-prefix bonus for CJK to handle short compound words.
 */
function computeRoleSimilarity(role1: string, role2: string): number {
  const words1 = extractSignificantWords(role1);
  const words2 = extractSignificantWords(role2);

  if (words1.length === 0 || words2.length === 0) return 0;

  const set1 = new Set(words1);
  const set2 = new Set(words2);

  const arr1 = Array.from(set1);
  const arr2 = Array.from(set2);

  let intersection = 0;
  for (const w of arr1) {
    if (set2.has(w)) {
      intersection++;
    }
  }

  // Shared-prefix bonus for CJK: "数据分析" and "数据处理" share prefix "数据"
  // Count partial overlaps (one token contains the other) as 0.5 intersection
  let partialOverlap = 0;
  for (const w1 of arr1) {
    if (set2.has(w1)) continue; // Already counted as exact match
    for (const w2 of arr2) {
      if (w1 === w2) continue;
      if ((w1.length >= 2 && w2.includes(w1)) || (w2.length >= 2 && w1.includes(w2))) {
        partialOverlap += 0.5;
        break; // Only count each w1 once
      }
    }
  }

  const effectiveIntersection = intersection + partialOverlap;
  const union = set1.size + set2.size - intersection;
  return union > 0 ? effectiveIntersection / union : 0;
}

/**
 * Extract meaningful words from a role description.
 * Handles both CJK and Latin text.
 */
function extractSignificantWords(text: string): string[] {
  const lower = text.toLowerCase();

  // CJK segments: allow single meaningful chars (e.g., "写", "搜") as well as multi-char
  // Use 2+ char segments as primary tokens, but also extract overlapping 2-grams from longer segments
  const cjkSegments = lower.match(/[\u4e00-\u9fff]+/g) ?? [];
  const cjk: string[] = [];
  for (const seg of cjkSegments) {
    if (seg.length >= 2) {
      cjk.push(seg);
    }
    // For segments ≥ 3 chars, also add 2-char sub-tokens for finer-grained matching
    if (seg.length >= 4) {
      for (let i = 0; i < seg.length - 1; i++) {
        cjk.push(seg.slice(i, i + 2));
      }
    }
  }
  // Latin words 3+ chars
  const latin = lower.match(/[a-z][a-z0-9]{2,}/g) ?? [];

  const stopWords = new Set([
    "the",
    "and",
    "for",
    "with",
    "that",
    "this",
    "from",
    "are",
    "was",
    "负责",
    "进行",
    "工作",
    "处理",
    "管理",
    "相关",
    "包括",
    "agent",
    "助手",
    "机器人",
  ]);

  return Array.from(new Set([...cjk, ...latin])).filter((w) => !stopWords.has(w));
}

// ── Auto-Refinement ──────────────────────────────────────────────────────

/**
 * Automatically apply safe refinements to fix detected issues.
 * Returns the refined blueprints and descriptions of applied actions.
 */
function autoRefine(
  blueprints: AgentBlueprint[],
  issues: PlanningIssue[],
  gaps: SceneGap[],
  userCtx: UserContext,
): { refined: AgentBlueprint[]; actions: string[] } {
  let refined = [...blueprints];
  const actions: string[] = [];

  // Fix 1: Trim over-limit skills/MCP
  for (const bp of refined) {
    const caps = bp.inferredCapabilities;
    if (!caps) continue;

    if (caps.skills.length > MAX_SKILLS_PER_AGENT) {
      const removed = caps.skills.length - MAX_SKILLS_PER_AGENT;
      caps.skills = caps.skills.slice(0, MAX_SKILLS_PER_AGENT);
      actions.push(
        `裁剪「${bp.name}」技能至 ${MAX_SKILLS_PER_AGENT} 个（移除 ${removed} 个低优先级技能）`,
      );
    }
    if (caps.mcpHints.length > MAX_MCP_PER_AGENT) {
      const removed = caps.mcpHints.length - MAX_MCP_PER_AGENT;
      caps.mcpHints = caps.mcpHints.slice(0, MAX_MCP_PER_AGENT);
      actions.push(`裁剪「${bp.name}」MCP 至 ${MAX_MCP_PER_AGENT} 个（移除 ${removed} 个）`);
    }
  }

  // Fix 2: Upgrade model tier for complex roles using cheap models
  for (const issue of issues) {
    if (issue.category === "feasibility" && issue.agentId && issue.severity === "warning") {
      const bp = refined.find((b) => b.id === issue.agentId);
      if (bp && estimateRoleComplexity(bp.role) === "complex" && bp.modelTier === "cheap") {
        bp.modelTier = "mid";
        actions.push(`升级「${bp.name}」模型至 mid 级别（角色复杂度高）`);
      }
    }
  }

  // Fix 3: Deduplicate heavily overlapping agents
  const overlaps = issues.filter((i) => i.category === "overlap" && i.severity === "warning");
  // Only merge if there are more than 5 agents (avoid over-merging small teams)
  if (overlaps.length > 0 && refined.length > 5) {
    // For safety, only merge the highest-overlap pair per round
    const overlapIssue = overlaps[0];
    const match = overlapIssue.message.match(/「(.+?)」和「(.+?)」/);
    if (match) {
      const [, name1, name2] = match;
      const idx2 = refined.findIndex((bp) => bp.name === name2);
      if (idx2 >= 0) {
        const bp1 = refined.find((bp) => bp.name === name1);
        if (bp1) {
          const bp2 = refined[idx2];
          // Check if merge would exceed capability limits (deduplicate identical entries)
          const mergedSkills = new Set([
            ...(bp1.inferredCapabilities?.skills ?? []),
            ...(bp2.inferredCapabilities?.skills ?? []),
          ]);
          const mergedMCP = new Set([
            ...(bp1.inferredCapabilities?.mcpHints ?? []),
            ...(bp2.inferredCapabilities?.mcpHints ?? []),
          ]);
          const mergedSkillCount = mergedSkills.size;
          const mergedMCPCount = mergedMCP.size;

          if (mergedSkillCount <= MAX_SKILLS_PER_AGENT && mergedMCPCount <= MAX_MCP_PER_AGENT) {
            // Safe to merge: keep bp1, extend its role, remove bp2
            bp1.role = `${bp1.role}，同时${bp2.role}`;
            // Deduplicate capabilities after merge
            if (bp1.inferredCapabilities) {
              bp1.inferredCapabilities.skills = Array.from(mergedSkills);
              bp1.inferredCapabilities.mcpHints = Array.from(mergedMCP);
            }
            // Fix dependency references: any agent that depended on bp2 should now depend on bp1.
            for (const other of refined) {
              if (Array.isArray(other.dependsOn) && other.dependsOn.includes(bp2.id)) {
                other.dependsOn = other.dependsOn.map((d) => (d === bp2.id ? bp1.id : d));
              }
            }
            refined.splice(idx2, 1);
            actions.push(`合并「${name1}」和「${name2}」为一个 agent（角色高度重叠）`);
          } else {
            actions.push(`跳过合并「${name1}」和「${name2}」（合并后技能/MCP 数量将超限）`);
          }
        }
      }
    }
  }

  // Fix 4: Remove duplicate agent IDs (keep first occurrence)
  const seenIds = new Set<string>();
  const deduped: AgentBlueprint[] = [];
  for (const bp of refined) {
    if (seenIds.has(bp.id)) {
      actions.push(`移除重复 ID 的 agent「${bp.name}」(${bp.id})`);
      continue;
    }
    seenIds.add(bp.id);
    deduped.push(bp);
  }
  refined = deduped;

  return { refined, actions };
}

// ── Scoring ──────────────────────────────────────────────────────────────

/**
 * Compute coverage score from verification results.
 * 100 = all sub-requirements covered, 0 = none covered.
 */
function computeCoverageScore(verification: SceneVerification): number {
  const coverageCheck = verification.checks.find((c) => c.name === "requirement_coverage");
  if (!coverageCheck) return verification.score;

  // Extract percentage from detail text like "需求覆盖率 75%（...）"
  const match = coverageCheck.detail.match(/(\d+)%/);
  return match ? parseInt(match[1], 10) : verification.score;
}

/**
 * Compute feasibility score based on capability availability.
 * 100 = all skills/MCP available, deducted for missing capabilities.
 */
function computeFeasibilityScore(
  blueprints: AgentBlueprint[],
  discovery?: DiscoveryResult,
): number {
  if (!discovery) return 80; // Default when no discovery data

  let totalCaps = 0;
  let availableCaps = 0;

  const installedSkills = new Set(discovery.skills.map((s) => s.name.toLowerCase()));
  const runningMCP = new Set(
    discovery.mcpServers.filter((s) => s.enabled && s.running).map((s) => s.id.toLowerCase()),
  );

  for (const bp of blueprints) {
    const skills = bp.inferredCapabilities?.skills ?? [];
    const mcpHints = bp.inferredCapabilities?.mcpHints ?? [];

    totalCaps += skills.length + mcpHints.length;

    for (const skill of skills) {
      if (installedSkills.has(skill.toLowerCase())) availableCaps++;
    }
    for (const mcp of mcpHints) {
      if (runningMCP.has(mcp.toLowerCase())) availableCaps++;
    }
  }

  if (totalCaps === 0) return 100;
  return Math.round((availableCaps / totalCaps) * 100);
}

// ── Helpers ──────────────────────────────────────────────────────────────

function checkNameToCategory(name: string): PlanningIssue["category"] {
  if (name.includes("skill") || name.includes("mcp")) return "capability";
  if (name.includes("coverage") || name.includes("resource")) return "coverage";
  if (name.includes("limits")) return "capability";
  if (name.includes("supervisor") || name.includes("channel")) return "structure";
  return "feasibility";
}

/**
 * Format a human-readable summary of all refinements applied across rounds.
 */
function formatRefinementSummary(rounds: PlanningRoundResult[]): string {
  const allActions = rounds.flatMap((r) => r.actionsApplied);
  if (allActions.length === 0) {
    return "团队配置一次通过，无需自动调整。";
  }

  const lines: string[] = ["自动优化记录:"];
  for (const round of rounds) {
    if (round.actionsApplied.length === 0) continue;
    lines.push(`  第 ${round.round} 轮:`);
    for (const action of round.actionsApplied) {
      lines.push(`    - ${action}`);
    }
  }
  return lines.join("\n");
}

/**
 * Format pipeline result as a compact section to append to the proposal.
 */
export function formatPipelineReport(result: PipelineResult): string {
  const lines: string[] = [];

  lines.push(`📊 规划质量评估（${result.totalRounds} 轮优化）`);
  lines.push(`  需求覆盖率: ${result.coverageScore}%`);
  lines.push(`  能力可行性: ${result.feasibilityScore}%`);

  // Issue summary
  const allIssues = result.rounds.flatMap((r) => r.issues);
  const errors = allIssues.filter((i) => i.severity === "error").length;
  const warnings = allIssues.filter((i) => i.severity === "warning").length;

  if (errors > 0 || warnings > 0) {
    const parts: string[] = [];
    if (errors > 0) parts.push(`${errors} 个严重问题`);
    if (warnings > 0) parts.push(`${warnings} 个提醒`);
    lines.push(`  发现问题: ${parts.join("、")}`);
  } else {
    lines.push("  检查结果: 全部通过");
  }

  // Refinement summary
  if (result.refinementSummary !== "团队配置一次通过，无需自动调整。") {
    lines.push("");
    lines.push(result.refinementSummary);
  }

  return lines.join("\n");
}
