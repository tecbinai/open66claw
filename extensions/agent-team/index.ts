/**
 * Agent Team Plugin — Entry Point
 *
 * Registers hooks, gateway methods, and background services for
 * project-level agent team management.
 *
 * Migrated from clawdbot extensions/agent-team/index.ts
 * Changes:
 *   - OpenClawCNPluginApi → OpenClawPluginApi (via openclaw/plugin-sdk/core)
 *   - resolve_agent hook: COMMENTED OUT — hook removed by upstream
 *   - callGateway: uses api.registerGatewayMethod pattern
 *   - ~/.openclawcn → ~/.openclaw
 *   - OPENCLAWCN_STATE_DIR → OPENCLAW_STATE_DIR
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { autoPromoteEntries } from "./src/auto-promote.js";
// ── New modules (Agent-14) ──────────────────────────────────────────────
import { formatActivitySummary } from "./src/conversation-compactor.js";
import { setRouteTable, clearRouteTable, routeMessage } from "./src/fast-path-router.js";
import { createHookErrorLogger } from "./src/hook-error-logger.js";
import { buildRoutesFromMembers } from "./src/keyword-router.js";
import {
  analyzeLearningOpportunities,
  applyAutoOptimizations,
  generateLearningHints,
  formatLearningReport,
  shouldTriggerLearning,
  LEARNING_CYCLE_THRESHOLD,
} from "./src/learning-engine.js";
import type { LearningAnalysis } from "./src/learning-engine.js";
import {
  createInitialMemberHealth,
  recordMemberSuccess,
  recordMemberFailure,
} from "./src/member-health.js";
import {
  createInitialMemberStats,
  recordMemberCall,
  computeAverageDuration,
} from "./src/member-stats.js";
import { createMemoryShareTool } from "./src/memory-share-tool.js";
import { generateProjectId } from "./src/project-id.js";
import {
  clearProjectAffinities,
  purgeExpiredAffinities,
  initAffinityPersistence,
  restoreAffinitiesFromDisk,
  flushAffinityToDisk,
} from "./src/session-affinity.js";
import { readSharedProfile, formatSharedProfileForPrompt } from "./src/shared-profile-store.js";
import { buildSupervisorLearningContext } from "./src/soul-optimizer.js";
import {
  initProjectStateDir,
  saveProject,
  loadProject,
  deleteProject,
  loadAllProjects,
  saveProjectState,
  loadProjectState,
  saveActivity,
  loadActivity,
} from "./src/state.js";
import { buildTeamContextBlock, isSupervisor } from "./src/system-prompt.js";
import { matchWorkflow, generateWorkflowInstructions } from "./src/task-coordinator.js";
import type {
  MemberHealth,
  MemberInfo,
  MemberStats,
  Project,
  ProjectState,
  SharedCategory,
  TeamConstraints,
} from "./src/types.js";

// ── In-Memory Cache ──────────────────────────────────────────────────────

const projectCache = new Map<string, Project>();
const agentToProject = new Map<string, string>();
const healthCache = new Map<string, Map<string, MemberHealth>>();
const statsCache = new Map<string, Map<string, MemberStats>>();
const memberNameMapCache = new Map<string, { version: number; map: Map<string, string> }>();

function getMemberNameMap(project: Project): Map<string, string> {
  const cached = memberNameMapCache.get(project.projectId);
  if (cached && cached.version === project.version) return cached.map;
  const map = new Map<string, string>();
  for (const m of project.members) {
    map.set(m.id, m.emoji ? `${m.emoji} ${m.name}` : m.name);
  }
  memberNameMapCache.set(project.projectId, { version: project.version, map });
  return map;
}

// ── Learning Engine State (Agent-14) ────────────────────────────────────
const learningAnalysisCache = new Map<string, LearningAnalysis>();
const eventsSinceLastLearning = new Map<string, number>();

let cacheReadyResolve: () => void;
const cacheReady = new Promise<void>((r) => {
  cacheReadyResolve = r;
});

// ── Activity Event Ring Buffer ──────────────────────────────────────────

const ACTIVITY_BUFFER_BASE = 50;
const ACTIVITY_BUFFER_PER_MEMBER = 25;
const ACTIVITY_BUFFER_HARD_MAX = 500;

function getActivityBufferMax(project: Project): number {
  const size = ACTIVITY_BUFFER_BASE + project.memberIds.length * ACTIVITY_BUFFER_PER_MEMBER;
  return Math.min(size, ACTIVITY_BUFFER_HARD_MAX);
}

type ActivityEvent = {
  id: string;
  timestamp: number;
  agentId: string;
  peerId?: string;
  method: "affinity" | "keyword" | "supervisor-llm";
  confidence: number;
  matchedPattern?: string;
  durationMs?: number;
  success?: boolean;
  error?: string;
  replySummary?: string;
  taskType?: "routing" | "sub-task" | "direct-reply" | "fallback";
  outcome?: "success" | "failure" | "timeout" | "partial";
};

const activityBuffers = new Map<string, ActivityEvent[]>();
const activitySaveTimers = new Map<string, ReturnType<typeof setTimeout>>();

function pushActivityEvent(projectId: string, event: ActivityEvent): void {
  let buf = activityBuffers.get(projectId);
  if (!buf) {
    buf = [];
    activityBuffers.set(projectId, buf);
  }
  buf.push(event);
  const project = projectCache.get(projectId);
  const maxSize = project ? getActivityBufferMax(project) : ACTIVITY_BUFFER_BASE;
  if (buf.length > maxSize) {
    buf.splice(0, buf.length - maxSize);
  }
  if (!activitySaveTimers.has(projectId)) {
    activitySaveTimers.set(
      projectId,
      setTimeout(() => {
        activitySaveTimers.delete(projectId);
        const current = activityBuffers.get(projectId);
        if (current && current.length > 0) {
          const snapshot = [...current];
          saveActivity(projectId, snapshot).catch((err) => {
            console.warn(
              `[agent-team] Failed to persist activity for project ${projectId}: ${String(err)}`,
            );
          });
        }
      }, 2000),
    );
  }
}

// TODO: resolve_agent hook 已被上游删除，待 PR 新 hook 或 gateway method 替代
// 以下 3 个缓存变量原本由 resolve_agent hook 写入，暂时保留声明但不使用
// const pendingRouteEvents = new Map<...>();
// const lastSupervisorMessage = new Map<string, string>();
// const lastAgentForPeer = new Map<string, string>();

let activityIdCounter = 0;
function nextActivityId(): string {
  return `act_${Date.now()}_${++activityIdCounter}`;
}

// ── Index Helpers ────────────────────────────────────────────────────────

const supervisorToProject = new Map<string, string>();

function rebuildSupervisorIndex(): void {
  supervisorToProject.clear();
  for (const [projectId, project] of projectCache) {
    supervisorToProject.set(project.supervisorId, projectId);
  }
}

function rebuildAgentIndex(): void {
  agentToProject.clear();
  const entries = [...projectCache.entries()];
  for (const [projectId, project] of entries) {
    if (!project.isFederation) continue;
    for (const memberId of project.memberIds) {
      agentToProject.set(memberId, projectId);
    }
  }
  for (const [projectId, project] of entries) {
    if (project.isFederation) continue;
    for (const memberId of project.memberIds) {
      agentToProject.set(memberId, projectId);
    }
  }
  rebuildSupervisorIndex();
  buildAllRouteTables();
}

function findProjectByAgentId(agentId: string): Project | undefined {
  const projectId = agentToProject.get(agentId);
  if (!projectId) return undefined;
  return projectCache.get(projectId);
}

function getOrCreateHealthMap(projectId: string, memberIds: string[]): Map<string, MemberHealth> {
  let map = healthCache.get(projectId);
  if (!map) {
    map = new Map();
    for (const id of memberIds) {
      map.set(id, createInitialMemberHealth(id));
    }
    healthCache.set(projectId, map);
  }
  return map;
}

function getOrCreateStatsMap(projectId: string, memberIds: string[]): Map<string, MemberStats> {
  let map = statsCache.get(projectId);
  if (!map) {
    map = new Map();
    for (const id of memberIds) {
      map.set(id, createInitialMemberStats(id));
    }
    statsCache.set(projectId, map);
  }
  return map;
}

function buildAllRouteTables(): void {
  for (const [, project] of projectCache) {
    if (project.status !== "active") continue;
    const nonSupervisor = project.members.filter((m) => m.id !== project.supervisorId);
    const routes = buildRoutesFromMembers(nonSupervisor);
    setRouteTable(project.projectId, routes);
  }
}

function extractConstraints(raw: unknown): TeamConstraints | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const c = raw as Record<string, unknown>;
  const brandRules = c.brandRules;
  if (!brandRules || typeof brandRules !== "object") return undefined;
  const br = brandRules as Record<string, unknown>;
  const result: TeamConstraints = { brandRules: {} };
  if (typeof br.userAddress === "string") {
    result.brandRules!.userAddress = br.userAddress;
  }
  if (Array.isArray(br.forbidden)) {
    result.brandRules!.forbidden = br.forbidden.filter((v): v is string => typeof v === "string");
  }
  if (Array.isArray(br.safetyRules)) {
    result.brandRules!.safetyRules = br.safetyRules.filter(
      (v): v is string => typeof v === "string",
    );
  }
  return result;
}

// ── Plugin Definition ────────────────────────────────────────────────────

const plugin = {
  id: "agent-team",
  name: "Agent Team Manager",
  description: "Project-level agent team management.",
  version: "0.1.0",

  register(api: OpenClawPluginApi) {
    const logger = api.logger;
    logger.info("Agent Team plugin registering...");

    // ── Initialize state directory ─────────────────────────────────
    const stateBaseDir = process.env.OPENCLAW_STATE_DIR?.trim() || api.resolvePath("~/.openclaw");
    const stateDir = api.resolvePath(`${stateBaseDir}/agent-team`);
    void (async () => {
      try {
        await initProjectStateDir(stateDir);
        initAffinityPersistence(stateDir);

        const projects = await loadAllProjects();

        await Promise.all(
          projects.map(async (p) => {
            projectCache.set(p.projectId, p);

            const [state, saved] = await Promise.all([
              loadProjectState(p.projectId),
              loadActivity(p.projectId),
            ]);

            if (state?.memberHealth) {
              const map = new Map<string, MemberHealth>();
              for (const h of state.memberHealth) {
                map.set(h.agentId, h);
              }
              healthCache.set(p.projectId, map);
            }
            if (state?.memberStats) {
              const sMap = new Map<string, MemberStats>();
              for (const s of state.memberStats) {
                sMap.set(s.agentId, s);
              }
              statsCache.set(p.projectId, sMap);
            }

            if (saved.length > 0) {
              activityBuffers.set(p.projectId, saved as ActivityEvent[]);
            }
          }),
        );
        rebuildAgentIndex();

        const validAgentIds = new Set<string>();
        for (const p of projects) {
          for (const id of p.memberIds) validAgentIds.add(id);
        }
        const restoredAffinities = await restoreAffinitiesFromDisk(validAgentIds);
        if (restoredAffinities > 0) {
          logger.info(`Restored ${restoredAffinities} session affinity record(s) from disk.`);
        }

        logger.info(`Loaded ${projects.length} project(s) from disk.`);
      } catch (err) {
        logger.error(`Failed to load projects on startup: ${err}`);
      } finally {
        cacheReadyResolve();
      }
    })();

    const hookErrLogger = createHookErrorLogger(
      { error: (m) => logger.error?.(m), warn: (m) => logger.warn?.(m) },
      { ttlMs: 60_000, maxSize: 200, summaryInterval: 10 },
    );
    const logHookError = (hook: string, err: unknown, extra?: string) =>
      hookErrLogger.log(hook, err, extra);

    // ═══════════════════════════════════════════════════════════════════
    // TODO: resolve_agent hook 已被上游删除，待 PR 新 hook 或 gateway method 替代
    //
    // 原 resolve_agent hook 实现了以下功能：
    //   1. Fast Path Router: 消息拦截 → affinity → keyword → federation cascade
    //   2. Supervisor Failover: supervisor down 时自动切换到最健康的 worker
    //   3. Federation 二级级联路由
    //   4. Session Affinity 更新
    //   5. Peer→Agent 映射（供 message_sending hook 使用）
    //   6. Activity Event 记录
    //
    // 恢复方案（三选一）：
    //   A) PR before_message_route 新 hook 到上游
    //   B) 第 3 个 patch（在消息路由前插入 hook 调用点）
    //   C) 通过 gateway method + UI 配合实现消息路由
    //
    // 参见：旧版 index.ts 第 575-761 行
    // ═══════════════════════════════════════════════════════════════════

    // ── before_agent_start: inject team context ────────────────────
    api.on(
      "before_agent_start",
      async (event, ctx) => {
        try {
          if (!ctx.agentId) return;

          const project = findProjectByAgentId(ctx.agentId);
          if (!project) return;
          if (project.status !== "active") return;

          const parts: string[] = [];

          // 1. Team context (always)
          const context = buildTeamContextBlock(project, ctx.agentId);
          if (context) parts.push(context);

          // 2. Supervisor-only enhancements (Agent-14)
          if (isSupervisor(project, ctx.agentId)) {
            // 2a. Activity summary from conversation-compactor
            const actBuf = activityBuffers.get(project.projectId);
            if (actBuf && actBuf.length > 0) {
              const nameMap = getMemberNameMap(project);
              const summary = formatActivitySummary(actBuf, nameMap);
              if (summary) parts.push(summary);
            }

            // 2b. Learning context from soul-optimizer
            const analysis = learningAnalysisCache.get(project.projectId);
            const sMap = getOrCreateStatsMap(project.projectId, project.memberIds);
            const hMap = getOrCreateHealthMap(project.projectId, project.memberIds);
            const learningCtx = buildSupervisorLearningContext(project, analysis, sMap, hMap);
            if (learningCtx) parts.push(learningCtx);

            // 2c. Task workflow detection from task-coordinator
            const userMsg = (event as Record<string, unknown>).message;
            if (typeof userMsg === "string" && userMsg.length > 0) {
              const nonSupervisor = project.members.filter((m) => m.id !== project.supervisorId);
              const workflow = matchWorkflow(userMsg);
              if (workflow) {
                const instructions = generateWorkflowInstructions(workflow, nonSupervisor);
                if (instructions) parts.push(instructions);
              }
            }

            // 2d. Shared profile context (for read-shared memory mode)
            if (project.memory.mode === "read-shared") {
              const sharedProfile = readSharedProfile(project.projectId);
              const sharedCtx = formatSharedProfileForPrompt(sharedProfile);
              if (sharedCtx) parts.push(sharedCtx);
            }
          } else {
            // 3. Member-only: shared profile (excluding own contributions)
            if (project.memory.mode === "read-shared") {
              const sharedProfile = readSharedProfile(project.projectId);
              const sharedCtx = formatSharedProfileForPrompt(sharedProfile, undefined, ctx.agentId);
              if (sharedCtx) parts.push(sharedCtx);
            }
          }

          if (parts.length === 0) return;
          return { prependContext: parts.join("\n\n") };
        } catch (err) {
          logHookError("before_agent_start", err);
          return;
        }
      },
      { priority: 50 },
    );

    // ── agent_end: track member health ────────────────────────────
    api.on("agent_end", async (event, ctx) => {
      try {
        if (!ctx.agentId) return;

        const project = findProjectByAgentId(ctx.agentId);
        if (!project) return;

        const healthMap = getOrCreateHealthMap(project.projectId, project.memberIds);
        const current = healthMap.get(ctx.agentId);
        if (!current) return;

        const updated = event.success
          ? recordMemberSuccess(current)
          : recordMemberFailure(current, event.error);

        healthMap.set(ctx.agentId, updated);

        // Track stats
        const sMap = getOrCreateStatsMap(project.projectId, project.memberIds);
        const currentStats = sMap.get(ctx.agentId);
        if (currentStats) {
          sMap.set(ctx.agentId, recordMemberCall(currentStats, event.durationMs));
        }

        // TODO: resolve_agent hook 已被上游删除
        // 原本这里会 finalize pending activity event from resolve_agent
        // 现在只记录一个简化的 activity event
        const isSuccess = event.success ?? true;
        const outcome: ActivityEvent["outcome"] = isSuccess ? "success" : "failure";

        pushActivityEvent(project.projectId, {
          id: nextActivityId(),
          timestamp: Date.now(),
          agentId: ctx.agentId,
          method: "supervisor-llm",
          confidence: 1,
          durationMs: event.durationMs,
          success: isSuccess,
          error: event.error,
          taskType: isSupervisor(project, ctx.agentId) ? "direct-reply" : "fallback",
          outcome,
        });

        // ── Learning cycle trigger (Agent-14) ──
        const prevCount = eventsSinceLastLearning.get(project.projectId) ?? 0;
        const newCount = prevCount + 1;
        eventsSinceLastLearning.set(project.projectId, newCount);

        if (shouldTriggerLearning(newCount)) {
          eventsSinceLastLearning.set(project.projectId, 0);
          try {
            const actBuf = activityBuffers.get(project.projectId) ?? [];
            const analysis = analyzeLearningOpportunities(
              project.projectId,
              actBuf,
              healthMap,
              sMap,
              project,
            );
            learningAnalysisCache.set(project.projectId, analysis);

            // Apply safe auto-optimizations (keyword boosts)
            if (analysis.insights.some((i) => i.autoApplicable)) {
              const { updatedProject, appliedChanges } = applyAutoOptimizations(project, analysis);
              if (appliedChanges.length > 0) {
                await saveProject(updatedProject);
                projectCache.set(project.projectId, updatedProject);
                rebuildAgentIndex();
                logger.info?.(
                  `[agent-team] Auto-optimized project "${project.name}": ${appliedChanges.join("; ")}`,
                );
              }
            }
          } catch (learnErr) {
            logHookError("agent_end.learning", learnErr);
          }
        }

        // ── Auto-promote private→shared memory (Agent-14, fire-and-forget) ──
        if (project.memory.mode === "read-shared" && !isSupervisor(project, ctx.agentId)) {
          autoPromoteEntries({
            projectId: project.projectId,
            agentId: ctx.agentId,
            workspaceDir: "", // TODO: resolve actual workspace dir when SDK provides it
          }).catch(() => {
            // fire-and-forget — errors do not affect main flow
          });
        }

        // Persist state asynchronously
        const state: ProjectState = {
          projectId: project.projectId,
          memberHealth: [...healthMap.values()],
          memberStats: [...sMap.values()],
          activeSessions: 0,
          lastActivityAt: new Date().toISOString(),
        };
        saveProjectState(state).catch((err) => {
          logger.warn?.(`Failed to persist health state: ${err}`);
        });
      } catch (err) {
        logHookError("agent_end", err, ` for agent "${ctx.agentId}"`);
      }
    });

    // TODO: message_sending hook 暂不注册 — 无 resolve_agent 时无法确定
    // peer→agent 映射，visibility rewrite 无法工作。恢复 resolve_agent 后启用。

    // ═══════════════════════════════════════════════════════════════════
    // GATEWAY METHODS
    // ═══════════════════════════════════════════════════════════════════

    // ── team.project.list ─────────────────────────────────────────────
    api.registerGatewayMethod("team.project.list", async ({ respond }) => {
      await cacheReady;
      // Re-scan disk to pick up projects written by other plugins (e.g. quick_deploy)
      try {
        const allDisk = await loadAllProjects();
        let added = false;
        for (const p of allDisk) {
          if (!projectCache.has(p.projectId)) {
            projectCache.set(p.projectId, p);
            added = true;
          }
        }
        if (added) rebuildAgentIndex();
      } catch {
        // ignore scan errors — fall back to cached data
      }
      const projects = [...projectCache.values()].map((p) => ({
        projectId: p.projectId,
        name: p.name,
        description: p.description,
        status: p.status,
        memberCount: p.memberIds.length,
        memberIds: p.memberIds,
        supervisorId: p.supervisorId,
        autoSupervisor: p.autoSupervisor ?? false,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        version: p.version,
        bindings: p.bindings,
        isFederation: p.isFederation ?? false,
        parentProjectId: p.parentProjectId,
      }));
      respond(true, { projects }, undefined);
    });

    // ── team.project.get ──────────────────────────────────────────────
    api.registerGatewayMethod("team.project.get", async ({ params, respond }) => {
      await cacheReady;
      const p = params as Record<string, unknown>;
      const projectId = String(p.projectId ?? "");

      let project = projectCache.get(projectId);

      if (!project) {
        const fromDisk = await loadProject(projectId);
        if (fromDisk) {
          projectCache.set(fromDisk.projectId, fromDisk);
          rebuildAgentIndex();
          project = fromDisk;
        }
      }

      if (!project) {
        respond(false, undefined, {
          code: "NOT_FOUND",
          message: `Project "${projectId}" not found`,
        });
        return;
      }

      const state = await loadProjectState(projectId);
      respond(true, { project, state }, undefined);
    });

    // ── team.project.create ───────────────────────────────────────────
    api.registerGatewayMethod("team.project.create", async ({ params, respond }) => {
      const p = params as Record<string, unknown>;

      const name = String(p.name ?? "").trim();
      const description = String(p.description ?? "").trim();
      const supervisorId = String(p.supervisorId ?? "").trim();
      const memberIds = Array.isArray(p.memberIds)
        ? (p.memberIds as unknown[])
            .filter((v): v is string => typeof v === "string" && v.trim() !== "")
            .map((s) => s.trim())
        : [];
      const members = Array.isArray(p.members)
        ? (p.members as unknown[])
            .filter(
              (m): m is MemberInfo =>
                typeof m === "object" &&
                m !== null &&
                typeof (m as Record<string, unknown>).id === "string" &&
                typeof (m as Record<string, unknown>).name === "string" &&
                typeof (m as Record<string, unknown>).role === "string",
            )
            .map((m) => ({
              id: m.id,
              name: m.name,
              role: m.role,
              ...(typeof m.emoji === "string" ? { emoji: m.emoji } : {}),
            }))
        : memberIds.map((id) => ({
            id,
            name: id,
            role: "",
          }));

      if (!name || !supervisorId || memberIds.length === 0) {
        respond(false, undefined, {
          code: "INVALID_PARAMS",
          message: "Required: name, supervisorId, memberIds (non-empty array)",
        });
        return;
      }

      if (!memberIds.includes(supervisorId)) {
        memberIds.unshift(supervisorId);
      }

      const MAX_MEMBERS = 8;
      if (memberIds.length > MAX_MEMBERS) {
        respond(false, undefined, {
          code: "INVALID_PARAMS",
          message: `Too many members (${memberIds.length}). Maximum is ${MAX_MEMBERS}.`,
        });
        return;
      }

      const now = new Date().toISOString();
      const project: Project = {
        projectId: generateProjectId(),
        name,
        description: description || name,
        status: "active",
        version: 1,
        createdAt: now,
        updatedAt: now,
        supervisorId,
        memberIds,
        members,
        memory: {
          mode: p.memoryMode === "read-shared" ? "read-shared" : "isolated",
          ...(Array.isArray(p.sharedCategories)
            ? {
                sharedCategories: (p.sharedCategories as string[]).filter(
                  (c): c is SharedCategory =>
                    c === "fact" || c === "identity" || c === "preference",
                ),
              }
            : {}),
        },
        coordination: {
          supervisorStyle: p.supervisorStyle === "delegate-only" ? "delegate-only" : "concierge",
          maxMembers: 8,
          hopLimit: 5,
          memberTimeoutSeconds: 30,
          supervisorFallbackEnabled: true,
          ...(p.handoffStyle === "silent" ||
          p.handoffStyle === "notify" ||
          p.handoffStyle === "introduce"
            ? { handoffStyle: p.handoffStyle as "silent" | "notify" | "introduce" }
            : {}),
        },
        visibility: {
          mode:
            p.visibilityMode === "unified"
              ? "unified"
              : p.visibilityMode === "transparent"
                ? "transparent"
                : "team",
          ...(typeof p.displayName === "string" ? { displayName: p.displayName } : {}),
        },
        constraints: extractConstraints(p.constraints),
        bindings: [],
      };

      try {
        await saveProject(project);
        projectCache.set(project.projectId, project);
        rebuildAgentIndex();
        getOrCreateHealthMap(project.projectId, memberIds);

        respond(true, { project }, undefined);
      } catch (err) {
        respond(false, undefined, {
          code: "CREATE_FAILED",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    });

    // ── team.project.delete ───────────────────────────────────────────
    api.registerGatewayMethod("team.project.delete", async ({ params, respond }) => {
      const p = params as Record<string, unknown>;
      const projectId = String(p.projectId ?? "");

      const project = projectCache.get(projectId);
      if (!project) {
        respond(false, undefined, {
          code: "NOT_FOUND",
          message: `Project "${projectId}" not found`,
        });
        return;
      }

      try {
        await deleteProject(projectId);
        projectCache.delete(projectId);
        healthCache.delete(projectId);
        statsCache.delete(projectId);
        memberNameMapCache.delete(projectId);
        activityBuffers.delete(projectId);
        const pendingSaveTimer = activitySaveTimers.get(projectId);
        if (pendingSaveTimer) {
          clearTimeout(pendingSaveTimer);
          activitySaveTimers.delete(projectId);
        }
        clearProjectAffinities(projectId);
        clearRouteTable(projectId);
        rebuildAgentIndex();

        respond(true, { success: true }, undefined);
      } catch (err) {
        respond(false, undefined, {
          code: "DELETE_FAILED",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    });

    // ── team.project.health ────────────────────────────────────────────
    api.registerGatewayMethod("team.project.health", async ({ params, respond }) => {
      const p = params as Record<string, unknown>;
      const projectId = String(p.projectId ?? "");

      const project = projectCache.get(projectId);
      if (!project) {
        respond(false, undefined, {
          code: "NOT_FOUND",
          message: `Project "${projectId}" not found`,
        });
        return;
      }

      const healthMap = getOrCreateHealthMap(projectId, project.memberIds);
      const members = [...healthMap.values()].map((h) => ({
        agentId: h.agentId,
        state: h.state,
        totalSuccesses: h.totalSuccesses,
        totalFailures: h.totalFailures,
        lastError: h.lastError ?? null,
        lastSuccessAt: h.lastSuccessAt ?? null,
        lastFailureAt: h.lastFailureAt ?? null,
      }));

      respond(true, { projectId, status: project.status, members }, undefined);
    });

    // ── team.project.stats ──────────────────────────────────────────────
    api.registerGatewayMethod("team.project.stats", async ({ params, respond }) => {
      const p = params as Record<string, unknown>;
      const projectId = String(p.projectId ?? "");

      const project = projectCache.get(projectId);
      if (!project) {
        respond(false, undefined, {
          code: "NOT_FOUND",
          message: `Project "${projectId}" not found`,
        });
        return;
      }

      const sMap = getOrCreateStatsMap(projectId, project.memberIds);
      const members = [...sMap.values()].map((s) => ({
        agentId: s.agentId,
        callCount: s.callCount,
        totalDurationMs: s.totalDurationMs,
        avgDurationMs: computeAverageDuration(s),
        lastCallAt: s.lastCallAt ?? null,
      }));

      const totalCalls = members.reduce((sum, m) => sum + m.callCount, 0);
      const totalDuration = members.reduce((sum, m) => sum + m.totalDurationMs, 0);

      respond(
        true,
        {
          projectId,
          members,
          totalCalls,
          avgDurationMs: totalCalls > 0 ? Math.round(totalDuration / totalCalls) : 0,
        },
        undefined,
      );
    });

    // ── team.project.activity ──────────────────────────────────────────
    api.registerGatewayMethod("team.project.activity", async ({ params, respond }) => {
      const p = params as Record<string, unknown>;
      const projectId = String(p.projectId ?? "");

      const project = projectCache.get(projectId);
      if (!project) {
        respond(false, undefined, {
          code: "NOT_FOUND",
          message: `Project "${projectId}" not found`,
        });
        return;
      }

      const bufMax = getActivityBufferMax(project);
      const limit = Math.min(Number(p.limit ?? 50), bufMax);

      const buf = activityBuffers.get(projectId) ?? [];
      const events = buf.slice(-limit).reverse();

      const enriched = events.map((ev) => {
        const member = project.members?.find((m) => m.id === ev.agentId);
        return {
          ...ev,
          agentName: member?.name ?? ev.agentId,
          agentEmoji: member?.emoji,
        };
      });

      respond(true, { projectId, events: enriched }, undefined);
    });

    // ── team.project.pause ────────────────────────────────────────────
    api.registerGatewayMethod("team.project.pause", async ({ params, respond }) => {
      const p = params as Record<string, unknown>;
      const projectId = String(p.projectId ?? "");

      const project = projectCache.get(projectId);
      if (!project) {
        respond(false, undefined, {
          code: "NOT_FOUND",
          message: `Project "${projectId}" not found`,
        });
        return;
      }

      const updated: Project = {
        ...project,
        status: "paused",
        version: project.version + 1,
        updatedAt: new Date().toISOString(),
      };

      await saveProject(updated);
      projectCache.set(projectId, updated);
      rebuildAgentIndex();
      respond(true, { project: updated }, undefined);
    });

    // ── team.project.resume ───────────────────────────────────────────
    api.registerGatewayMethod("team.project.resume", async ({ params, respond }) => {
      const p = params as Record<string, unknown>;
      const projectId = String(p.projectId ?? "");

      const project = projectCache.get(projectId);
      if (!project) {
        respond(false, undefined, {
          code: "NOT_FOUND",
          message: `Project "${projectId}" not found`,
        });
        return;
      }

      const updated: Project = {
        ...project,
        status: "active",
        version: project.version + 1,
        updatedAt: new Date().toISOString(),
      };

      await saveProject(updated);
      projectCache.set(projectId, updated);
      rebuildAgentIndex();
      respond(true, { project: updated }, undefined);
    });

    // ── team.project.optimize (Agent-14: manual learning trigger) ──
    api.registerGatewayMethod("team.project.optimize", async ({ params, respond }) => {
      const p = params as Record<string, unknown>;
      const projectId = String(p.projectId ?? "");

      const project = projectCache.get(projectId);
      if (!project) {
        respond(false, undefined, {
          code: "NOT_FOUND",
          message: `Project "${projectId}" not found`,
        });
        return;
      }

      const actBuf = activityBuffers.get(projectId) ?? [];
      const healthMap = getOrCreateHealthMap(projectId, project.memberIds);
      const sMap = getOrCreateStatsMap(projectId, project.memberIds);

      const analysis = analyzeLearningOpportunities(projectId, actBuf, healthMap, sMap, project);
      learningAnalysisCache.set(projectId, analysis);
      eventsSinceLastLearning.set(projectId, 0);

      // Apply safe auto-optimizations
      let appliedChanges: string[] = [];
      if (analysis.insights.some((i) => i.autoApplicable)) {
        const result = applyAutoOptimizations(project, analysis);
        appliedChanges = result.appliedChanges;
        if (appliedChanges.length > 0) {
          await saveProject(result.updatedProject);
          projectCache.set(projectId, result.updatedProject);
          rebuildAgentIndex();
        }
      }

      const report = formatLearningReport(analysis);

      respond(
        true,
        {
          projectId,
          analysis,
          appliedChanges,
          report,
        },
        undefined,
      );
    });

    // ── team.route.summary ─────────────────────────────────────────
    api.registerGatewayMethod("team.route.summary", ({ respond }) => {
      const routes: Array<{
        channel: string;
        accountId?: string;
        targetType: "project";
        targetId: string;
        targetName: string;
      }> = [];

      for (const project of projectCache.values()) {
        if (project.status !== "active") continue;
        for (const binding of project.bindings) {
          routes.push({
            channel: binding.channel,
            ...(binding.accountId ? { accountId: binding.accountId } : {}),
            targetType: "project",
            targetId: project.projectId,
            targetName: project.name,
          });
        }
      }

      respond(true, { routes }, undefined);
    });

    // ── team.route.message: determine which agent should handle a message ──
    api.registerGatewayMethod("team.route.message", async ({ params, respond }) => {
      await cacheReady;
      const p = params as Record<string, unknown>;
      const agentId = String(p.agentId ?? "");
      const message = String(p.message ?? "");

      if (!agentId || !message.trim()) {
        respond(true, { routed: false }, undefined);
        return;
      }

      // Find the project this agent belongs to as supervisor
      const project = findProjectByAgentId(agentId);
      if (!project || project.status !== "active" || project.supervisorId !== agentId) {
        respond(true, { routed: false }, undefined);
        return;
      }

      // Run fast-path router (keyword matching)
      const healthMap = getOrCreateHealthMap(project.projectId, project.memberIds);
      const result = routeMessage({
        message,
        project,
        peerId: "webchat",
        healthMap,
      });

      if (result) {
        respond(
          true,
          {
            routed: true,
            targetAgentId: result.agentId,
            method: result.method,
            confidence: result.confidence,
            matchedPattern: result.matchedPattern,
          },
          undefined,
        );
      } else {
        // No keyword match — message stays with the supervisor
        respond(true, { routed: false }, undefined);
      }
    });

    // ═══════════════════════════════════════════════════════════════════
    // BACKGROUND SERVICE: Health Checker
    // ═══════════════════════════════════════════════════════════════════

    let healthTimer: ReturnType<typeof setInterval> | undefined;

    api.registerService({
      id: "agent-team-health",

      start: async () => {
        const INTERVAL_MS = 5 * 60_000;

        healthTimer = setInterval(async () => {
          // Purge expired session affinities
          let minTimeout = 30;
          for (const [, proj] of projectCache) {
            if (
              proj.status === "active" &&
              proj.coordination.fastPath?.affinityTimeoutMinutes != null
            ) {
              minTimeout = Math.min(minTimeout, proj.coordination.fastPath.affinityTimeoutMinutes);
            }
          }
          const purged = purgeExpiredAffinities(Math.max(minTimeout, 1));
          if (purged > 0) {
            logger.info?.(`[agent-team] Purged ${purged} expired affinity record(s).`);
          }
        }, INTERVAL_MS);
      },

      stop: async () => {
        if (healthTimer) {
          clearInterval(healthTimer);
          healthTimer = undefined;
        }
        for (const [projectId, timer] of activitySaveTimers) {
          clearTimeout(timer);
          const buf = activityBuffers.get(projectId);
          if (buf && buf.length > 0) {
            const snapshot = [...buf];
            saveActivity(projectId, snapshot).catch(() => {});
          }
        }
        activitySaveTimers.clear();
        await flushAffinityToDisk();
      },
    });

    logger.info(
      `Agent Team plugin registered successfully (v0.2.0). ` +
        `Hooks: before_agent_start (enhanced), agent_end (learning+auto-promote). ` +
        `Methods: team.project.{list,get,create,delete,pause,resume,health,stats,activity,optimize}, ` +
        `team.route.summary. ` +
        `Modules: conversation-compactor, task-coordinator, learning-engine, soul-optimizer, ` +
        `shared-profile-store, memory-share-tool, auto-promote, deploy-bridge (skeleton). ` +
        `Service: agent-team-health. ` +
        `NOTE: resolve_agent hook pending — fast-path routing disabled.`,
    );
  },
};

export default plugin;
