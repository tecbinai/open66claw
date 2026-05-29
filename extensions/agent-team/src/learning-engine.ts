/**
 * Learning Engine — Supervisor Self-Learning from Execution Data
 *
 * Analyzes the activity buffer, health FSM, and member stats to identify
 * patterns and generate actionable insights for the supervisor.
 *
 * Learning Cycle triggers:
 *   - Every 50 activity events
 *   - Manual trigger via `team.project.optimize` gateway method
 *
 * All insights are deterministic (zero LLM cost).
 * Safe, reversible optimizations are applied automatically;
 * risky changes (skill/MCP modifications) require user confirmation.
 *
 * Migrated from clawdbot extensions/agent-team/src/learning-engine.ts
 */

import { computeAverageDuration } from "./member-stats.js";
import type { MemberHealth, MemberStats, Project } from "./types.js";

// ── Types ────────────────────────────────────────────────────────────────

/**
 * A single activity event (structural match for the module-local type in index.ts).
 */
export type ActivityEventLike = {
  readonly agentId: string;
  readonly method?: string;
  readonly confidence?: number;
  readonly matchedPattern?: string;
  readonly durationMs?: number;
  readonly success?: boolean;
  readonly error?: string;
  readonly taskType?: string;
  readonly outcome?: string;
};

/**
 * A learning insight identified from execution data.
 */
export type LearningInsight = {
  id: string;
  category:
    | "routing_failure"
    | "timeout_pattern"
    | "skill_gap"
    | "utilization_imbalance"
    | "underutilized_agent"
    | "model_mismatch"
    | "success_pattern";
  severity: "high" | "medium" | "low";
  /** Human-readable description (Chinese) */
  description: string;
  /** Affected agent IDs */
  agentIds: string[];
  /** Suggested fix */
  suggestion: string;
  /** Whether this can be auto-applied safely */
  autoApplicable: boolean;
};

/**
 * Routing pattern learned from activity data.
 */
export type LearnedRoutingPattern = {
  /** Trigger keywords or patterns */
  trigger: string;
  /** Best agent for this trigger */
  agentId: string;
  /** Confidence based on historical success rate */
  confidence: number;
  /** Number of observations this is based on */
  sampleSize: number;
};

/**
 * Agent specialization profile derived from execution history.
 */
export type AgentSpecialization = {
  agentId: string;
  /** Task types this agent excels at */
  strengths: string[];
  /** Average response time in ms */
  avgDurationMs: number;
  /** Success rate (0-1) */
  successRate: number;
  /** Total calls observed */
  totalCalls: number;
};

/**
 * Complete learning analysis result.
 */
export type LearningAnalysis = {
  projectId: string;
  analyzedAt: string;
  /** Number of events analyzed */
  eventCount: number;
  insights: LearningInsight[];
  routingPatterns: LearnedRoutingPattern[];
  specializations: AgentSpecialization[];
  /** Summary text for display */
  summary: string;
};

// ── Constants ────────────────────────────────────────────────────────────

/** Trigger learning cycle every N events */
export const LEARNING_CYCLE_THRESHOLD = 50;

/** Minimum events needed to generate reliable insights */
const MIN_EVENTS_FOR_INSIGHTS = 10;

/** Agent is "underutilized" if it handles less than this fraction of total calls */
const UNDERUTILIZED_THRESHOLD = 0.05;

/** Agent is "overloaded" if it handles more than this fraction */
const OVERLOADED_THRESHOLD = 0.6;

/** High failure rate threshold */
const HIGH_FAILURE_RATE = 0.3;

/** Timeout threshold in ms (agent taking too long) */
const SLOW_AGENT_THRESHOLD_MS = 15_000;

// ── Main Analysis ────────────────────────────────────────────────────────

/**
 * Analyze execution data and generate learning insights.
 */
export function analyzeLearningOpportunities(
  projectId: string,
  events: ActivityEventLike[],
  healthMap: Map<string, MemberHealth>,
  statsMap: Map<string, MemberStats>,
  project: Project,
): LearningAnalysis {
  const insights: LearningInsight[] = [];
  const now = new Date().toISOString();

  if (events.length < MIN_EVENTS_FOR_INSIGHTS) {
    return {
      projectId,
      analyzedAt: now,
      eventCount: events.length,
      insights: [],
      routingPatterns: [],
      specializations: [],
      summary: `事件数不足（${events.length}/${MIN_EVENTS_FOR_INSIGHTS}），暂不生成学习洞察。`,
    };
  }

  // ── Pattern 1: Routing failure analysis ──
  insights.push(...analyzeRoutingFailures(events, project));

  // ── Pattern 2: Timeout patterns ──
  insights.push(...analyzeTimeoutPatterns(events, statsMap, project));

  // ── Pattern 3: Utilization imbalance ──
  insights.push(...analyzeUtilizationBalance(events, project));

  // ── Pattern 4: Underutilized agents ──
  insights.push(...analyzeUnderutilizedAgents(events, project));

  // ── Pattern 5: Success patterns ──
  insights.push(...analyzeSuccessPatterns(events, project));

  // ── Build routing patterns ──
  const routingPatterns = buildRoutingPatterns(events, project);

  // ── Build specializations ──
  const specializations = buildSpecializations(events, healthMap, statsMap, project);

  // ── Summary ──
  const highCount = insights.filter((i) => i.severity === "high").length;
  const mediumCount = insights.filter((i) => i.severity === "medium").length;
  const autoCount = insights.filter((i) => i.autoApplicable).length;

  const summaryParts: string[] = [];
  summaryParts.push(`分析 ${events.length} 个事件`);
  if (highCount > 0) summaryParts.push(`${highCount} 个高优先级洞察`);
  if (mediumCount > 0) summaryParts.push(`${mediumCount} 个中优先级洞察`);
  if (autoCount > 0) summaryParts.push(`${autoCount} 个可自动优化`);
  if (routingPatterns.length > 0) summaryParts.push(`${routingPatterns.length} 个路由模式`);

  return {
    projectId,
    analyzedAt: now,
    eventCount: events.length,
    insights,
    routingPatterns,
    specializations,
    summary: summaryParts.join("，"),
  };
}

// ── Pattern Analyzers ────────────────────────────────────────────────────

function analyzeRoutingFailures(events: ActivityEventLike[], project: Project): LearningInsight[] {
  const insights: LearningInsight[] = [];

  // Group events by agent, count failures
  const agentFailures = new Map<string, { total: number; failures: number; errors: string[] }>();

  for (const event of events) {
    if (!event.agentId) continue;
    let entry = agentFailures.get(event.agentId);
    if (!entry) {
      entry = { total: 0, failures: 0, errors: [] };
      agentFailures.set(event.agentId, entry);
    }
    entry.total++;
    if (event.success === false || event.outcome === "failure") {
      entry.failures++;
      if (event.error && entry.errors.length < 5) {
        entry.errors.push(event.error);
      }
    }
  }

  for (const [agentId, data] of agentFailures) {
    if (data.total < 3) continue; // Need minimum sample size
    const failureRate = data.failures / data.total;

    if (failureRate >= HIGH_FAILURE_RATE) {
      const member = project.members.find((m) => m.id === agentId);
      const name = member?.name ?? agentId;

      const betterAgent = findBetterAlternative(agentId, events, project);

      insights.push({
        id: `routing_failure_${agentId}`,
        category: "routing_failure",
        severity: failureRate >= 0.5 ? "high" : "medium",
        description: `「${name}」失败率 ${Math.round(failureRate * 100)}%（${data.failures}/${data.total}）`,
        agentIds: [agentId],
        suggestion: betterAgent
          ? `考虑将部分任务路由到「${betterAgent.name}」（成功率更高）`
          : `检查「${name}」的 SOUL 和技能配置是否匹配其角色`,
        autoApplicable: false,
      });
    }
  }

  return insights;
}

function analyzeTimeoutPatterns(
  events: ActivityEventLike[],
  statsMap: Map<string, MemberStats>,
  project: Project,
): LearningInsight[] {
  const insights: LearningInsight[] = [];

  for (const member of project.members) {
    if (member.id === project.supervisorId) continue;

    const stats = statsMap.get(member.id);
    if (!stats || stats.callCount < 3) continue;

    const avgDuration = computeAverageDuration(stats);
    if (avgDuration > SLOW_AGENT_THRESHOLD_MS) {
      const recentEvents = events.filter((e) => e.agentId === member.id).slice(-10);
      const timeoutCount = recentEvents.filter(
        (e) => e.outcome === "timeout" || (e.durationMs && e.durationMs > SLOW_AGENT_THRESHOLD_MS),
      ).length;

      if (timeoutCount >= 2) {
        insights.push({
          id: `timeout_${member.id}`,
          category: "timeout_pattern",
          severity: timeoutCount >= 5 ? "high" : "medium",
          description: `「${member.name}」平均响应 ${Math.round(avgDuration / 1000)}s，最近 ${timeoutCount} 次超时`,
          agentIds: [member.id],
          suggestion: "考虑增加超时时间、简化任务拆分、或将复杂任务分配给更强的模型",
          autoApplicable: false,
        });
      }
    }
  }

  return insights;
}

function analyzeUtilizationBalance(
  events: ActivityEventLike[],
  project: Project,
): LearningInsight[] {
  const insights: LearningInsight[] = [];

  const nonSupervisorMembers = project.members.filter((m) => m.id !== project.supervisorId);
  if (nonSupervisorMembers.length < 2) return insights;

  const eventCounts = new Map<string, number>();
  let totalNonSupervisor = 0;

  for (const event of events) {
    if (event.agentId === project.supervisorId) continue;
    eventCounts.set(event.agentId, (eventCounts.get(event.agentId) ?? 0) + 1);
    totalNonSupervisor++;
  }

  if (totalNonSupervisor < 10) return insights;

  for (const [agentId, count] of eventCounts) {
    const ratio = count / totalNonSupervisor;
    if (ratio >= OVERLOADED_THRESHOLD) {
      const member = project.members.find((m) => m.id === agentId);
      if (!member) continue;

      insights.push({
        id: `overloaded_${agentId}`,
        category: "utilization_imbalance",
        severity: "medium",
        description: `「${member.name}」处理了 ${Math.round(ratio * 100)}% 的任务，负载过高`,
        agentIds: [agentId],
        suggestion: "考虑拆分其职责或添加相同角色的 agent 分担负载",
        autoApplicable: false,
      });
    }
  }

  return insights;
}

function analyzeUnderutilizedAgents(
  events: ActivityEventLike[],
  project: Project,
): LearningInsight[] {
  const insights: LearningInsight[] = [];

  const nonSupervisorMembers = project.members.filter((m) => m.id !== project.supervisorId);
  if (nonSupervisorMembers.length < 2) return insights;

  const eventCounts = new Map<string, number>();
  let totalEvents = 0;

  for (const event of events) {
    if (event.agentId === project.supervisorId) continue;
    eventCounts.set(event.agentId, (eventCounts.get(event.agentId) ?? 0) + 1);
    totalEvents++;
  }

  if (totalEvents < 10) return insights;

  for (const member of nonSupervisorMembers) {
    const count = eventCounts.get(member.id) ?? 0;
    const ratio = totalEvents > 0 ? count / totalEvents : 0;

    if (ratio <= UNDERUTILIZED_THRESHOLD) {
      insights.push({
        id: `underutilized_${member.id}`,
        category: "underutilized_agent",
        severity: "low",
        description: `「${member.name}」几乎未被使用（${count} 次，占 ${Math.round(ratio * 100)}%）`,
        agentIds: [member.id],
        suggestion: "考虑调整路由关键词、优化其角色定义、或合并到其他 agent",
        autoApplicable: false,
      });
    }
  }

  return insights;
}

function analyzeSuccessPatterns(events: ActivityEventLike[], project: Project): LearningInsight[] {
  const insights: LearningInsight[] = [];

  const agentStats = new Map<string, { total: number; successes: number }>();

  for (const event of events) {
    if (!event.agentId || event.agentId === project.supervisorId) continue;
    let stats = agentStats.get(event.agentId);
    if (!stats) {
      stats = { total: 0, successes: 0 };
      agentStats.set(event.agentId, stats);
    }
    stats.total++;
    if (event.success !== false && event.outcome !== "failure" && event.outcome !== "timeout") {
      stats.successes++;
    }
  }

  for (const [agentId, stats] of agentStats) {
    if (stats.total < 5) continue;
    const successRate = stats.successes / stats.total;

    if (successRate >= 0.95) {
      const member = project.members.find((m) => m.id === agentId);
      if (!member) continue;

      insights.push({
        id: `success_${agentId}`,
        category: "success_pattern",
        severity: "low",
        description: `「${member.name}」表现优秀（成功率 ${Math.round(successRate * 100)}%，${stats.total} 次调用）`,
        agentIds: [agentId],
        suggestion: "可以增加此 agent 的路由权重，优先分配更多任务",
        autoApplicable: true,
      });
    }
  }

  return insights;
}

// ── Routing Pattern Builder ──────────────────────────────────────────────

function buildRoutingPatterns(
  events: ActivityEventLike[],
  project: Project,
): LearnedRoutingPattern[] {
  const patterns: LearnedRoutingPattern[] = [];

  // Group successful keyword-routed events by matchedPattern
  const patternStats = new Map<string, Map<string, { success: number; total: number }>>();

  for (const event of events) {
    if (!event.matchedPattern || !event.agentId) continue;
    if (event.agentId === project.supervisorId) continue;

    let agentMap = patternStats.get(event.matchedPattern);
    if (!agentMap) {
      agentMap = new Map();
      patternStats.set(event.matchedPattern, agentMap);
    }

    let agentStat = agentMap.get(event.agentId);
    if (!agentStat) {
      agentStat = { success: 0, total: 0 };
      agentMap.set(event.agentId, agentStat);
    }

    agentStat.total++;
    if (event.success !== false && event.outcome !== "failure") {
      agentStat.success++;
    }
  }

  for (const [pattern, agentMap] of patternStats) {
    let bestAgent = "";
    let bestRate = 0;
    let bestTotal = 0;

    for (const [agentId, stats] of agentMap) {
      const rate = stats.total > 0 ? stats.success / stats.total : 0;
      if (rate > bestRate || (rate === bestRate && stats.total > bestTotal)) {
        bestAgent = agentId;
        bestRate = rate;
        bestTotal = stats.total;
      }
    }

    if (bestAgent && bestTotal >= 2) {
      patterns.push({
        trigger: pattern,
        agentId: bestAgent,
        confidence: bestRate,
        sampleSize: bestTotal,
      });
    }
  }

  return patterns;
}

// ── Specialization Builder ───────────────────────────────────────────────

function buildSpecializations(
  events: ActivityEventLike[],
  _healthMap: Map<string, MemberHealth>,
  statsMap: Map<string, MemberStats>,
  project: Project,
): AgentSpecialization[] {
  const specializations: AgentSpecialization[] = [];

  for (const member of project.members) {
    if (member.id === project.supervisorId) continue;

    const memberEvents = events.filter((e) => e.agentId === member.id);
    if (memberEvents.length < 3) continue;

    const stats = statsMap.get(member.id);

    // Determine strengths from successful task types
    const taskTypeSuccess = new Map<string, { success: number; total: number }>();
    for (const event of memberEvents) {
      const taskType = event.taskType ?? "unknown";
      let entry = taskTypeSuccess.get(taskType);
      if (!entry) {
        entry = { success: 0, total: 0 };
        taskTypeSuccess.set(taskType, entry);
      }
      entry.total++;
      if (event.success !== false) entry.success++;
    }

    const strengths: string[] = [];
    for (const [taskType, data] of taskTypeSuccess) {
      if (data.total >= 2 && data.success / data.total >= 0.7) {
        strengths.push(taskType);
      }
    }

    const totalSuccesses = memberEvents.filter((e) => e.success !== false).length;
    const successRate = memberEvents.length > 0 ? totalSuccesses / memberEvents.length : 0;

    specializations.push({
      agentId: member.id,
      strengths,
      avgDurationMs: stats ? computeAverageDuration(stats) : 0,
      successRate,
      totalCalls: stats?.callCount ?? memberEvents.length,
    });
  }

  return specializations;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function findBetterAlternative(
  failingAgentId: string,
  events: ActivityEventLike[],
  project: Project,
): { id: string; name: string } | undefined {
  const nonSupervisorMembers = project.members.filter(
    (m) => m.id !== project.supervisorId && m.id !== failingAgentId,
  );

  const failingTaskTypes = new Set<string>();
  for (const e of events) {
    if (e.agentId === failingAgentId && e.taskType) {
      failingTaskTypes.add(e.taskType);
    }
  }

  let bestCandidate: { id: string; name: string; rate: number } | undefined;

  for (const member of nonSupervisorMembers) {
    const memberEvents = events.filter((e) => e.agentId === member.id);
    if (memberEvents.length < 3) continue;

    if (failingTaskTypes.size > 0) {
      const candidateTaskTypes = new Set(
        memberEvents.filter((e) => e.taskType).map((e) => e.taskType!),
      );
      const hasOverlap = Array.from(failingTaskTypes).some((t) => candidateTaskTypes.has(t));
      if (!hasOverlap) continue;
    }

    const successes = memberEvents.filter((e) => e.success !== false).length;
    const rate = successes / memberEvents.length;

    if (rate >= 0.8 && (!bestCandidate || rate > bestCandidate.rate)) {
      bestCandidate = { id: member.id, name: member.name, rate };
    }
  }

  return bestCandidate;
}

// ── Auto-Optimization (Safe, Reversible) ─────────────────────────────────

/**
 * Apply safe, reversible optimizations based on learning insights.
 * Only modifies routing keywords (via project.members[].keywords).
 * Does NOT modify skills, MCP, or SOUL content (those need user approval).
 */
export function applyAutoOptimizations(
  project: Project,
  analysis: LearningAnalysis,
): { updatedProject: Project; appliedChanges: string[] } {
  const updated = { ...project, members: project.members.map((m) => ({ ...m })) };
  const changes: string[] = [];

  // Auto-opt 1: Boost keywords for high-success routing patterns
  for (const pattern of analysis.routingPatterns) {
    if (pattern.confidence < 0.75 || pattern.sampleSize < 3) continue;

    const member = updated.members.find((m) => m.id === pattern.agentId);
    if (!member) continue;

    const keywords = member.keywords ?? [];
    const trigger = pattern.trigger.toLowerCase();

    if (!keywords.some((kw) => kw.toLowerCase() === trigger)) {
      member.keywords = [...keywords, trigger];
      changes.push(
        `为「${member.name}」添加路由关键词「${trigger}」（历史成功率 ${Math.round(pattern.confidence * 100)}%, n=${pattern.sampleSize}）`,
      );
    }
  }

  if (changes.length > 0) {
    updated.version += 1;
    updated.updatedAt = new Date().toISOString();
  }

  return { updatedProject: updated, appliedChanges: changes };
}

// ── Learning Hints for SOUL Injection ────────────────────────────────────

/**
 * Generate learning hints text to inject into supervisor's context.
 */
export function generateLearningHints(analysis: LearningAnalysis): string {
  if (analysis.insights.length === 0 && analysis.specializations.length === 0) {
    return "";
  }

  const lines: string[] = [];
  const MAX_HINT_CHARS = 600;

  lines.push("<learning-hints>");

  if (analysis.specializations.length > 0) {
    lines.push("Member Performance:");
    for (const spec of analysis.specializations) {
      const strengthsStr = spec.strengths.length > 0 ? spec.strengths.join("/") : "general";
      lines.push(
        `  ${spec.agentId}: ${Math.round(spec.successRate * 100)}% success, ` +
          `avg ${Math.round(spec.avgDurationMs / 1000)}s, ${strengthsStr}`,
      );
    }
  }

  const highInsights = analysis.insights.filter((i) => i.severity === "high");
  if (highInsights.length > 0) {
    lines.push("Alerts:");
    for (const insight of highInsights.slice(0, 3)) {
      lines.push(`  - ${insight.description}`);
    }
  }

  if (analysis.routingPatterns.length > 0) {
    lines.push("Learned Patterns:");
    for (const pattern of analysis.routingPatterns.slice(0, 5)) {
      lines.push(
        `  "${pattern.trigger}" → ${pattern.agentId} (${Math.round(pattern.confidence * 100)}%, n=${pattern.sampleSize})`,
      );
    }
  }

  lines.push("</learning-hints>");

  let result = lines.join("\n");
  if (result.length > MAX_HINT_CHARS) {
    result = result.slice(0, MAX_HINT_CHARS - 3) + "...";
  }

  return result;
}

/**
 * Format a complete learning report for the UI.
 */
export function formatLearningReport(analysis: LearningAnalysis): string {
  const lines: string[] = [];

  lines.push(`Learning Analysis Report`);
  lines.push(`  Analyzed at: ${analysis.analyzedAt}`);
  lines.push(`  Event count: ${analysis.eventCount}`);
  lines.push("");

  if (analysis.insights.length > 0) {
    lines.push("Insights:");
    for (const insight of analysis.insights) {
      const icon =
        insight.severity === "high" ? "[HIGH]" : insight.severity === "medium" ? "[MED]" : "[LOW]";
      lines.push(`  ${icon} ${insight.description}`);
      lines.push(`     Suggestion: ${insight.suggestion}`);
    }
    lines.push("");
  }

  if (analysis.specializations.length > 0) {
    lines.push("Member Profiles:");
    for (const spec of analysis.specializations) {
      const strengths = spec.strengths.length > 0 ? spec.strengths.join(", ") : "general";
      lines.push(
        `  ${spec.agentId}: success ${Math.round(spec.successRate * 100)}%, ` +
          `avg ${Math.round(spec.avgDurationMs / 1000)}s, ` +
          `strengths ${strengths} (${spec.totalCalls} calls)`,
      );
    }
    lines.push("");
  }

  if (analysis.routingPatterns.length > 0) {
    lines.push("Routing Patterns:");
    for (const pattern of analysis.routingPatterns) {
      lines.push(
        `  "${pattern.trigger}" -> ${pattern.agentId} ` +
          `(confidence ${Math.round(pattern.confidence * 100)}%, n=${pattern.sampleSize})`,
      );
    }
    lines.push("");
  }

  lines.push(`Summary: ${analysis.summary}`);

  return lines.join("\n");
}

/**
 * Check if a learning cycle should be triggered based on event count.
 */
export function shouldTriggerLearning(eventsSinceLastCycle: number): boolean {
  return eventsSinceLastCycle >= LEARNING_CYCLE_THRESHOLD;
}
