/**
 * Orchestrator Controller
 *
 * Lifecycle manager that connects the orchestrator view (reducer + render)
 * to the gateway backend. Dispatches actions, polls deploy status,
 * manages the open/close lifecycle.
 *
 * Pattern: same as agents.ts / smart-dispatch.ts — export plain functions
 * that mutate the Lit reactive state proxy.
 */

import {
  generateGatheringQuestions,
  buildAnswersMap,
} from "../../shared/orchestrator/gathering-questions.js";
import {
  fetchTemplates,
  fetchCommunityTemplates,
  quickDeployTemplate,
  pollDeployStatus,
  toDeployProgress,
  deployProposal,
  proposeTeam,
  type GatewayCallFn,
  type DeployStatusResponse,
} from "../../shared/orchestrator/orchestrator-gateway.js";
import {
  type OrchestratorState,
  type OrchestratorAction,
  orchestratorReducer,
  createInitialOrchestratorState,
  createMessage,
} from "../../shared/orchestrator/orchestrator-state.js";
import type { GatewayBrowserClient } from "../gateway";
import { isTokenAuthError } from "../storage.js";

// ── State Slice ─────────────────────────────────────────────────────────

export type OrchestratorControllerState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  orchestratorOpen: boolean;
  orchestratorState: OrchestratorState | null;
};

// ── Internal state ───────────────────────────────────────────────────────

let _userRequirement = "";
/** Guard: prevent double-click on template deploy buttons. */
let _deployInFlight = false;

// ── Dispatch Helper ─────────────────────────────────────────────────────

function dispatch(state: OrchestratorControllerState, action: OrchestratorAction): void {
  if (!state.orchestratorState) return;
  state.orchestratorState = orchestratorReducer(state.orchestratorState, action);
}

function callGateway(state: OrchestratorControllerState): GatewayCallFn {
  return async (method: string, params: Record<string, unknown>) => {
    if (!state.client || !state.connected) {
      throw new Error("Gateway not connected");
    }
    try {
      return await state.client.request(method, params);
    } catch (err) {
      // On token auth error (device token mismatch / shared token stale), the
      // main app's onClose handler auto-refreshes the token and reconnects.
      // During the reconnect window (1-3s), state.connected is false. We wait
      // for the reconnect to complete, then retry once with the new client.
      if (isTokenAuthError(String(err))) {
        // Wait for auto-recovery (refreshGatewayTokenFromServer + reconnect)
        const deadline = Date.now() + 5000;
        while (Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 500));
          if (state.client && state.connected) {
            return state.client.request(method, params);
          }
        }
      }
      throw err;
    }
  };
}

// ── Open / Close ────────────────────────────────────────────────────────

/**
 * Open the orchestrator view. Initializes state and fetches templates.
 */
export async function openOrchestrator(state: OrchestratorControllerState): Promise<void> {
  state.orchestratorOpen = true;
  state.orchestratorState = createInitialOrchestratorState();
  _userRequirement = "";

  const gw = callGateway(state);

  // Check provider availability (non-blocking)
  void (async () => {
    try {
      const snapshot = (await gw("config.get", {})) as
        | { config?: { agents?: { defaults?: { model?: unknown } } } }
        | undefined;
      const model = snapshot?.config?.agents?.defaults?.model;
      dispatch(state, { type: "SET_HAS_PROVIDER", has: !!model });
    } catch {
      // Can't check — assume OK
      dispatch(state, { type: "SET_HAS_PROVIDER", has: true });
    }
  })();

  // Fetch builtin templates in background
  try {
    const templates = await fetchTemplates(gw);
    dispatch(state, { type: "SET_TEMPLATES", templates });
  } catch {
    // Templates are optional — welcome screen still works without them
  }

  // Fetch community templates in background (non-blocking)
  void loadCommunityTemplates(state);
}

/**
 * Close the orchestrator view and reset state.
 */
export function closeOrchestrator(state: OrchestratorControllerState): void {
  state.orchestratorOpen = false;
  state.orchestratorState = null;
  _userRequirement = "";
  _deployInFlight = false;
  // Stop any active polling
  stopPolling();
}

// ── Template Preview ────────────────────────────────────────────────────

/**
 * Handle clicking a template card — show preview before deploying.
 */
export function handleTemplateClick(state: OrchestratorControllerState, templateId: string): void {
  const orch = state.orchestratorState;
  if (!orch) return;

  const tpl = orch.templates.find((t) => t.id === templateId);
  if (!tpl) return;

  dispatch(state, { type: "SET_PREVIEW", template: tpl });
}

/**
 * Handle confirming deploy from the preview page.
 * Includes double-click guard to prevent duplicate deployments.
 */
export async function handlePreviewDeploy(
  state: OrchestratorControllerState,
  templateId: string,
): Promise<void> {
  const orch = state.orchestratorState;
  if (!orch) return;

  // Double-click guard: reject if a deploy is already in flight
  if (_deployInFlight || orch.phase === "deploying") return;
  _deployInFlight = true;

  const tpl = orch.templates.find((t) => t.id === templateId);
  const tplName = tpl?.name ?? templateId;

  dispatch(state, { type: "SET_INPUT_DISABLED", disabled: true });
  dispatch(state, {
    type: "ADD_MESSAGE",
    message: createMessage("user", `部署「${tplName}」模板`),
  });
  dispatch(state, { type: "SET_PHASE", phase: "deploying" });

  try {
    const gw = callGateway(state);
    const result = await quickDeployTemplate(gw, templateId);
    dispatch(state, { type: "SET_PLAN_ID", planId: result.planId });

    // Start polling for deploy progress
    await startPolling(state, result.planId);
  } catch (err) {
    dispatch(state, { type: "DEPLOY_ERROR", error: String(err) });
  } finally {
    _deployInFlight = false;
  }
}

// ── Example Click ───────────────────────────────────────────────────────

/**
 * Handle clicking an example prompt — fill input and send.
 */
export function handleExampleClick(state: OrchestratorControllerState, text: string): void {
  dispatch(state, { type: "SET_INPUT", value: text });
}

// ── User Input ──────────────────────────────────────────────────────────

/**
 * Handle input change.
 */
export function handleInput(state: OrchestratorControllerState, e: Event): void {
  const value = (e.target as HTMLTextAreaElement).value;
  dispatch(state, { type: "SET_INPUT", value });
}

/**
 * Handle Enter key press.
 */
export function handleKeydown(state: OrchestratorControllerState, e: KeyboardEvent): void {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    void handleSend(state);
  }
}

/**
 * Send the current input as a user message.
 * Routes to quick_deploy (if it looks like a template match) or guided flow.
 */
export async function handleSend(state: OrchestratorControllerState): Promise<void> {
  const orch = state.orchestratorState;
  if (!orch || !orch.inputValue.trim() || orch.inputDisabled) return;

  const text = orch.inputValue.trim();
  dispatch(state, { type: "SET_INPUT", value: "" });
  dispatch(state, { type: "SET_INPUT_DISABLED", disabled: true });
  dispatch(state, {
    type: "ADD_MESSAGE",
    message: createMessage("user", text),
  });

  // If in welcome phase, this is the initial requirement
  if (orch.phase === "welcome") {
    _userRequirement = text;

    try {
      const gw = callGateway(state);

      // Try quick_deploy first — the backend will attempt template matching
      const result = (await gw("orchestrator.quick_deploy", { requirement: text })) as {
        planId?: string;
        status?: string;
        error?: string;
        matched?: boolean;
      };

      if (result.planId) {
        dispatch(state, { type: "SET_PLAN_ID", planId: result.planId });
        dispatch(state, { type: "SET_PHASE", phase: "deploying" });
        await startPolling(state, result.planId);
      } else {
        // No template matched — generate clarifying questions
        dispatch(state, {
          type: "ADD_MESSAGE",
          message: createMessage(
            "system",
            "没有完全匹配的模板，让我帮你定制一个团队。先回答几个问题，我才能更好地为你规划：",
          ),
        });

        const questions = generateGatheringQuestions(text);
        dispatch(state, { type: "SET_QUESTIONS", questions });
      }
    } catch {
      // Gateway might not have the quick_deploy method yet — fall back to local questions
      dispatch(state, {
        type: "ADD_MESSAGE",
        message: createMessage("system", "让我帮你定制一个团队。先回答几个问题："),
      });
      const questions = generateGatheringQuestions(text);
      dispatch(state, { type: "SET_QUESTIONS", questions });
    }
    return;
  }

  // For other phases (proposed, gathering, etc.) — accept user follow-up
  dispatch(state, {
    type: "ADD_MESSAGE",
    message: createMessage("system", "收到，正在处理你的反馈..."),
  });
  dispatch(state, { type: "SET_INPUT_DISABLED", disabled: false });
}

// ── Question Answers ────────────────────────────────────────────────────

/**
 * Handle clicking an option on a gathering question.
 */
export function handleAnswerQuestion(
  state: OrchestratorControllerState,
  questionIndex: number,
  answer: string,
): void {
  dispatch(state, { type: "ANSWER_QUESTION", questionIndex, answer });
}

/**
 * Submit all answered questions and request a team proposal.
 */
export async function handleSubmitAnswers(state: OrchestratorControllerState): Promise<void> {
  const orch = state.orchestratorState;
  if (!orch) return;

  const answers = buildAnswersMap(orch.gatheringQuestions, _userRequirement);

  dispatch(state, { type: "SET_INPUT_DISABLED", disabled: true });
  dispatch(state, {
    type: "ADD_MESSAGE",
    message: createMessage("system", "收到，正在为你规划团队方案..."),
  });
  dispatch(state, { type: "SET_PHASE", phase: "proposing" });

  // Animated proposing steps (frontend simulation)
  dispatch(state, {
    type: "SET_PROPOSING_STEPS",
    steps: [
      { label: "理解你的需求", status: "active" },
      { label: "匹配团队能力", status: "pending" },
      { label: "检查并优化", status: "pending" },
    ],
  });

  try {
    const gw = callGateway(state);

    // Step 1 → done (simulate ~500ms)
    await new Promise((r) => setTimeout(r, 500));
    dispatch(state, {
      type: "UPDATE_PROPOSING_STEP",
      index: 0,
      step: { status: "done", detail: `场景分析完成` },
    });
    dispatch(state, { type: "UPDATE_PROPOSING_STEP", index: 1, step: { status: "active" } });

    // Actually call the gateway
    const result = await proposeTeam(gw, _userRequirement, answers);

    // Step 2 → done
    dispatch(state, {
      type: "UPDATE_PROPOSING_STEP",
      index: 1,
      step: { status: "done", detail: `为 ${result.agents.length} 个成员匹配了技能` },
    });
    dispatch(state, { type: "UPDATE_PROPOSING_STEP", index: 2, step: { status: "active" } });

    // Step 3 → done (brief pause for visual)
    await new Promise((r) => setTimeout(r, 400));
    dispatch(state, {
      type: "UPDATE_PROPOSING_STEP",
      index: 2,
      step: {
        status: "done",
        detail:
          result.coverageScore != null
            ? `覆盖率 ${result.coverageScore}%，可行性 ${result.feasibilityScore ?? "-"}%`
            : "优化完成",
      },
    });

    // Brief pause to show completed steps before revealing proposal
    await new Promise((r) => setTimeout(r, 300));

    dispatch(state, {
      type: "SET_PROPOSAL",
      proposal: {
        planId: result.planId,
        teamName: result.teamName,
        teamDescription: result.teamDescription,
        agents: result.agents,
        costEstimate: result.costEstimate,
        coverageScore: result.coverageScore,
        feasibilityScore: result.feasibilityScore,
        refinementSummary: result.refinementSummary,
      },
    });
    dispatch(state, {
      type: "ADD_MESSAGE",
      message: createMessage("system", "方案已生成，看看是否满意："),
    });
  } catch (err) {
    dispatch(state, { type: "DEPLOY_ERROR", error: String(err) });
  }
}

// ── Deploy Proposal ─────────────────────────────────────────────────────

/**
 * Deploy the proposed team plan.
 */
export async function handleDeployProposal(
  state: OrchestratorControllerState,
  planId: string,
): Promise<void> {
  dispatch(state, { type: "SET_INPUT_DISABLED", disabled: true });
  dispatch(state, {
    type: "ADD_MESSAGE",
    message: createMessage("user", "确认部署"),
  });
  dispatch(state, { type: "SET_PHASE", phase: "deploying" });

  try {
    const gw = callGateway(state);
    await deployProposal(gw, planId);
    await startPolling(state, planId);
  } catch (err) {
    dispatch(state, { type: "DEPLOY_ERROR", error: String(err) });
  }
}

// ── Community Templates ──────────────────────────────────────────────────

/** Built-in fallback templates shown when the gateway call fails (e.g. plugin not loaded). */
const FALLBACK_COMMUNITY_TEMPLATES: import("../../../../extensions/orchestrator/src/ui/orchestrator-state").CommunityTemplate[] =
  [
    {
      id: "community-social-crm",
      name: "社群运营助手",
      description: "自动管理微信群、欢迎新成员、定期推送内容日历",
      category: "social",
      author: "社区贡献者",
      downloads: 0,
      agents: [
        { name: "群管家", role: "管理群消息和新成员欢迎" },
        { name: "日历编辑", role: "维护社群内容日历和定期推送" },
      ],
      highlights: ["自动欢迎新成员", "内容日历管理", "违规消息过滤"],
    },
    {
      id: "community-ecommerce-ops",
      name: "电商运营全家桶",
      description: "竞品监控、评论分析、营销文案，一站式电商运营",
      category: "ecommerce",
      author: "社区贡献者",
      downloads: 0,
      agents: [
        { name: "竞品雷达", role: "监控竞品价格和上新动态" },
        { name: "评论分析师", role: "分析买家评论提取改进建议" },
        { name: "文案写手", role: "撰写商品详情和营销文案" },
      ],
      highlights: ["竞品实时监控", "评论情感分析", "爆款文案生成"],
    },
    {
      id: "community-legal-assistant",
      name: "法律文书助手",
      description: "合同审查、法规检索、文书模板，法务工作加速",
      category: "legal",
      author: "社区贡献者",
      downloads: 0,
      agents: [
        { name: "合同审查员", role: "自动检查合同关键条款和风险点" },
        { name: "法规检索", role: "快速查找相关法规和案例" },
      ],
      highlights: ["合同风险检查", "法规智能检索", "文书模板生成"],
    },
  ];

async function loadCommunityTemplates(state: OrchestratorControllerState): Promise<void> {
  dispatch(state, { type: "SET_COMMUNITY_LOADING", loading: true });
  try {
    const gw = callGateway(state);
    const templates = await fetchCommunityTemplates(gw);
    dispatch(state, {
      type: "SET_COMMUNITY_TEMPLATES",
      templates: templates.length > 0 ? templates : FALLBACK_COMMUNITY_TEMPLATES,
    });
  } catch {
    // Gateway call failed (plugin not loaded, not connected, etc.) — use local fallback
    dispatch(state, { type: "SET_COMMUNITY_TEMPLATES", templates: FALLBACK_COMMUNITY_TEMPLATES });
  }
}

// ── Action Clicks ───────────────────────────────────────────────────────

/**
 * Handle generic action buttons (retry, back-to-list, create-more, start-chat, submit-answers, adjust-proposal).
 */
export function handleActionClick(
  state: OrchestratorControllerState,
  action: string,
  _data?: unknown,
): void {
  switch (action) {
    case "retry":
      dispatch(state, { type: "RESET" });
      void openOrchestrator(state);
      break;

    case "back-to-list":
      closeOrchestrator(state);
      break;

    case "create-more":
      dispatch(state, { type: "RESET" });
      _userRequirement = "";
      // Re-fetch templates
      void fetchTemplates(callGateway(state))
        .then((templates) => dispatch(state, { type: "SET_TEMPLATES", templates }))
        .catch(() => {});
      // Re-fetch community templates
      void loadCommunityTemplates(state);
      break;

    case "start-chat": {
      // _data is the agentId — close orchestrator and navigate to chat
      const agentId = typeof _data === "string" ? _data : undefined;
      closeOrchestrator(state);
      // Dispatch custom event so app.ts can navigate to the agent's chat
      if (agentId && typeof globalThis.dispatchEvent === "function") {
        globalThis.dispatchEvent(
          new CustomEvent("orch:navigate-to-agent", { detail: { agentId } }),
        );
      }
      break;
    }

    case "submit-answers":
      void handleSubmitAnswers(state);
      break;

    case "approve-proposal": {
      const planId = typeof _data === "string" ? _data : undefined;
      if (planId) {
        void handleDeployProposal(state, planId);
      }
      break;
    }

    case "adjust-proposal":
      // Go back to gathering with the same questions
      dispatch(state, { type: "SET_PHASE", phase: "gathering" });
      dispatch(state, { type: "SET_INPUT_DISABLED", disabled: false });
      break;

    case "back-from-preview":
      // Return to welcome from template preview
      dispatch(state, { type: "SET_PHASE", phase: "welcome" });
      dispatch(state, { type: "SET_INPUT_DISABLED", disabled: false });
      break;

    case "answer-question": {
      // From renderQuestionsWidget: data = { index: number, answer: string }
      const qData = _data as { index?: number; answer?: string } | undefined;
      if (qData && typeof qData.index === "number" && typeof qData.answer === "string") {
        dispatch(state, {
          type: "ANSWER_QUESTION",
          questionIndex: qData.index,
          answer: qData.answer,
        });
      }
      break;
    }

    case "reload-community":
      void loadCommunityTemplates(state);
      break;

    case "retry-failed": {
      // Retry all failed agents by re-triggering deploy with the same planId
      if (state.orchestratorState?.retryingFailed) break; // guard: ignore rapid clicks
      const planId = state.orchestratorState?.currentPlanId;
      if (!planId) break;
      dispatch(state, { type: "SET_RETRYING_FAILED", retrying: true });
      void (async () => {
        try {
          const gw = callGateway(state);
          await gw("orchestrator.guided_deploy", { planId, retryFailed: true });
          await startPolling(state, planId);
          // retryingFailed is reset by polling when it detects a terminal state
        } catch (err) {
          dispatch(state, { type: "SET_RETRYING_FAILED", retrying: false });
          dispatch(state, { type: "DEPLOY_ERROR", error: String(err) });
        }
      })();
      break;
    }

    case "skip-failed": {
      // Treat current state as success (skip failed agents, keep ready ones)
      const orch2 = state.orchestratorState;
      if (orch2?.deployProgress) {
        const readyAgents = orch2.deployProgress.agents.filter((a) => a.status === "ready");
        if (readyAgents.length === 0) break; // Nothing to skip to — all agents failed
        const proposal = orch2.proposal;
        const proposalAgents = proposal?.agents ?? [];
        dispatch(state, {
          type: "DEPLOY_SUCCESS",
          data: {
            teamDescription: proposal?.teamDescription ?? "",
            agents: readyAgents.map((a) => {
              const proposalAgent = proposalAgents.find((pa) => pa.id === a.id);
              return {
                id: a.id,
                name: a.name,
                role: proposalAgent?.role ?? "",
                emoji: proposalAgent?.emoji,
                modelTier: proposalAgent?.modelTier,
              };
            }),
            usageGuide: "",
          },
        });
        if (typeof globalThis.dispatchEvent === "function") {
          globalThis.dispatchEvent(new CustomEvent("orch:agents-changed"));
        }
      }
      break;
    }

    case "try-it-send": {
      // Send first message to the team's first agent
      const agentId = state.orchestratorState?.successData?.agents[0]?.id;
      if (agentId && typeof _data === "string") {
        closeOrchestrator(state);
        if (typeof globalThis.dispatchEvent === "function") {
          globalThis.dispatchEvent(
            new CustomEvent("orch:navigate-to-agent", { detail: { agentId, message: _data } }),
          );
        }
      }
      break;
    }

    case "goto-model-config":
      closeOrchestrator(state);
      if (typeof globalThis.dispatchEvent === "function") {
        globalThis.dispatchEvent(
          new CustomEvent("orch:navigate-to-view", { detail: { view: "model-config" } }),
        );
      }
      break;

    case "deploy-community": {
      // Treat community template click like a user requirement — enter guided flow
      const communityId = typeof _data === "string" ? _data : undefined;
      if (!communityId) break;
      const cTpl = state.orchestratorState?.communityTemplates.find((t) => t.id === communityId);
      if (cTpl) {
        _userRequirement = cTpl.name;
        dispatch(state, { type: "SET_INPUT", value: "" });
        dispatch(state, { type: "SET_INPUT_DISABLED", disabled: true });
        dispatch(state, {
          type: "ADD_MESSAGE",
          message: createMessage("user", `使用社区模板「${cTpl.name}」`),
        });
        // Show "proposing" first (not "deploying") to avoid blank screen while async runs
        dispatch(state, {
          type: "ADD_MESSAGE",
          message: createMessage("system", "正在匹配模板并准备部署..."),
        });
        dispatch(state, { type: "SET_PHASE", phase: "proposing" });

        const gw = callGateway(state);
        void (async () => {
          try {
            const result = (await gw("orchestrator.quick_deploy", { requirement: cTpl.name })) as {
              planId?: string;
            };
            if (result.planId) {
              dispatch(state, { type: "SET_PLAN_ID", planId: result.planId });
              dispatch(state, { type: "SET_PHASE", phase: "deploying" });
              await startPolling(state, result.planId);
            } else {
              dispatch(state, {
                type: "ADD_MESSAGE",
                message: createMessage("system", "让我帮你定制一个团队。先回答几个问题："),
              });
              const questions = generateGatheringQuestions(cTpl.description || cTpl.name);
              dispatch(state, { type: "SET_QUESTIONS", questions });
            }
          } catch {
            dispatch(state, {
              type: "ADD_MESSAGE",
              message: createMessage("system", "让我帮你定制一个团队。先回答几个问题："),
            });
            const questions = generateGatheringQuestions(cTpl.description || cTpl.name);
            dispatch(state, { type: "SET_QUESTIONS", questions });
          }
        })();
      }
      break;
    }
  }
}

// ── Deploy Status Polling ───────────────────────────────────────────────

let pollTimer: ReturnType<typeof setInterval> | null = null;
/** Active plan ID guard — discard stale poll results from a previous deploy */
let activePollPlanId: string | null = null;
/** Deploy timeout: 5 minutes max polling before declaring failure */
const DEPLOY_TIMEOUT_MS = 5 * 60 * 1000;

function stopPolling(): void {
  if (pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  activePollPlanId = null;
}

async function startPolling(state: OrchestratorControllerState, planId: string): Promise<void> {
  stopPolling();
  activePollPlanId = planId;
  const gw = callGateway(state);
  const startedAt = Date.now();

  const poll = async () => {
    // Guard: discard if orchestrator was closed or planId changed
    if (activePollPlanId !== planId || !state.orchestratorState) {
      stopPolling();
      return;
    }
    // Guard: timeout — prevent infinite polling
    if (Date.now() - startedAt > DEPLOY_TIMEOUT_MS) {
      stopPolling();
      dispatch(state, { type: "SET_RETRYING_FAILED", retrying: false });
      dispatch(state, {
        type: "DEPLOY_ERROR",
        error: "部署超时（超过 5 分钟未完成），请检查日志后重试",
      });
      return;
    }
    try {
      const response: DeployStatusResponse = await pollDeployStatus(gw, planId);
      // Re-check guard after async call
      if (activePollPlanId !== planId || !state.orchestratorState) {
        stopPolling();
        return;
      }
      const progress = toDeployProgress(response);
      dispatch(state, { type: "SET_DEPLOY_PROGRESS", progress });

      // Check for terminal states
      if (response.status === "deployed") {
        stopPolling();
        dispatch(state, { type: "SET_RETRYING_FAILED", retrying: false });

        // Try to fetch the deploy report from the project bridge
        let report: { agents: unknown[]; summary: unknown } | undefined;
        try {
          const reportRes = (await gw("orchestrator.deploy.report", { planId })) as
            | {
                report?: { agents: unknown[]; summary: unknown };
              }
            | undefined;
          if (reportRes?.report) {
            report = reportRes.report as { agents: unknown[]; summary: unknown };
          }
        } catch {
          // Deploy report is optional — success page still works without it
        }

        dispatch(state, {
          type: "DEPLOY_SUCCESS",
          data: {
            teamDescription: response.plan.teamDescription,
            agents: response.agents.map((a) => {
              const ext = a as Record<string, unknown>;
              return {
                id: a.id,
                name: a.name,
                role: a.role,
                emoji: typeof ext.emoji === "string" ? ext.emoji : undefined,
                modelTier: typeof ext.modelTier === "string" ? ext.modelTier : undefined,
                toolProfile: typeof ext.toolProfile === "string" ? ext.toolProfile : undefined,
              };
            }),
            usageGuide: response.plan.usageGuide ?? "",
            report: report as NonNullable<OrchestratorState["successData"]>["report"],
          },
        });
        // Notify app to refresh the agent list sidebar
        if (typeof globalThis.dispatchEvent === "function") {
          globalThis.dispatchEvent(new CustomEvent("orch:agents-changed"));
        }
      } else if (response.status === "failed") {
        stopPolling();
        dispatch(state, { type: "SET_RETRYING_FAILED", retrying: false });
        const hasReady = response.agents.some((a) => a.status === "ready");
        if (hasReady) {
          // Partial failure: keep deploy progress view so retry/skip buttons stay visible
          // SET_DEPLOY_PROGRESS already dispatched above, just stop polling
        } else {
          // Total failure: show error page
          const failedAgent = response.agents.find((a) => a.error);
          dispatch(state, {
            type: "DEPLOY_ERROR",
            error: failedAgent?.error ?? "Deployment failed",
          });
        }
      }
    } catch (err) {
      // Re-check guard after async error
      if (activePollPlanId !== planId || !state.orchestratorState) return;
      stopPolling();
      dispatch(state, { type: "SET_RETRYING_FAILED", retrying: false });
      dispatch(state, { type: "DEPLOY_ERROR", error: String(err) });
    }
  };

  // First poll immediately
  await poll();

  // Then poll every 2 seconds
  if (state.orchestratorState?.phase === "deploying" && activePollPlanId === planId) {
    pollTimer = setInterval(() => void poll(), 2000);
  }
}
