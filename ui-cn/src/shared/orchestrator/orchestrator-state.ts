/**
 * Orchestrator Frontend State Machine
 *
 * Manages the UI state for the orchestrator view.
 * Pure functions — no side effects, no DOM, no gateway calls.
 */

import type { SceneTemplate, GatheringQuestion } from "./types.js";
export type { GatheringQuestion };

// ── Phase ────────────────────────────────────────────────────────────────

export type OrchestratorPhase =
  | "closed"
  | "welcome"
  | "gathering"
  | "proposing"
  | "proposed"
  | "refining"
  | "soul-preview"
  | "previewing"
  | "deploying"
  | "success"
  | "error";

// ── Message ──────────────────────────────────────────────────────────────

export type MessageRole = "system" | "user" | "thinking";

export type MessageWidget =
  | "questions"
  | "proposal"
  | "soul-preview"
  | "deploy-progress"
  | "deploy-report"
  | "success"
  | "error";

export type OrchestratorMessage = {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  widget?: MessageWidget;
  widgetData?: unknown;
};

// ── Deploy Progress ──────────────────────────────────────────────────────

export type DeployAgentProgress = {
  id: string;
  name: string;
  status: "pending" | "creating" | "writing_soul" | "configuring" | "ready" | "failed";
  error?: string;
};

export type DeployProgress = {
  total: number;
  completed: number;
  failed: number;
  agents: DeployAgentProgress[];
};

// ── Gathering Questions (re-exported from types.ts) ─────────────────────

// ── Team Proposal ────────────────────────────────────────────────────────

export type TeamProposal = {
  planId: string;
  teamName: string;
  teamDescription: string;
  agents: Array<{
    id: string;
    name: string;
    role: string;
    emoji?: string;
    modelTier: string;
    tools: string[];
    /** Human-readable ability descriptions */
    abilities?: string[];
    /** Skill names assigned to this agent */
    skills?: string[];
    /** Actual model name (e.g. "qwen-max") */
    modelName?: string;
  }>;
  costEstimate?: string;
  /** Coverage score from scene verifier (0-100) */
  coverageScore?: number;
  /** Feasibility score from pipeline (0-100) */
  feasibilityScore?: number;
  /** Refinement summary log */
  refinementSummary?: string;
};

// ── Community Template ───────────────────────────────────────────────────

export type CommunityTemplate = {
  id: string;
  name: string;
  description: string;
  category?: string;
  author?: string;
  downloads?: number;
  agents: Array<{ name: string; role: string }>;
  highlights?: string[];
};

// ── State ────────────────────────────────────────────────────────────────

// ── Deploy Report (from agent-team) ─────────────────────────────────────

export type DeployReportAgentStep = {
  step: string;
  status: "ok" | "warn" | "fail";
  detail?: string;
};

export type DeployReportAgent = {
  agentId: string;
  name: string;
  role: string;
  emoji?: string;
  modelTier?: string;
  toolProfile?: string;
  steps: DeployReportAgentStep[];
};

export type DeployReportSummary = {
  totalAgents: number;
  readyAgents: number;
  toolPoliciesWritten: number;
  keywordsPopulated: number;
  soulsWritten: number;
};

/** Animated step state for proposing phase */
export type ProposingStep = {
  label: string;
  detail?: string;
  status: "pending" | "active" | "done";
};

export type OrchestratorState = {
  phase: OrchestratorPhase;
  messages: OrchestratorMessage[];
  currentPlanId: string | null;
  inputValue: string;
  inputDisabled: boolean;
  templates: SceneTemplate[];
  communityTemplates: CommunityTemplate[];
  communityLoading: boolean;
  communityError: string | null;
  gatheringQuestions: GatheringQuestion[];
  proposal: TeamProposal | null;
  previewTemplate: SceneTemplate | null;
  deployProgress: DeployProgress | null;
  /** Animated steps for proposing phase (frontend simulation) */
  proposingSteps: ProposingStep[];
  /** Whether we are retrying failed agents during deploy */
  retryingFailed: boolean;
  /** Provider pre-check: false if no provider configured */
  hasProvider: boolean | null;
  successData: {
    teamDescription: string;
    agents: Array<{
      id: string;
      name: string;
      role: string;
      emoji?: string;
      modelTier?: string;
      toolProfile?: string;
    }>;
    usageGuide: string;
    report?: {
      agents: DeployReportAgent[];
      summary: DeployReportSummary;
    };
  } | null;
  error: string | null;
};

// ── Actions ──────────────────────────────────────────────────────────────

export type OrchestratorAction =
  | { type: "OPEN" }
  | { type: "CLOSE" }
  | { type: "SET_TEMPLATES"; templates: SceneTemplate[] }
  | { type: "ADD_MESSAGE"; message: OrchestratorMessage }
  | { type: "SET_PHASE"; phase: OrchestratorPhase }
  | { type: "SET_INPUT"; value: string }
  | { type: "SET_INPUT_DISABLED"; disabled: boolean }
  | { type: "SET_PLAN_ID"; planId: string }
  | { type: "SET_QUESTIONS"; questions: GatheringQuestion[] }
  | { type: "ANSWER_QUESTION"; questionIndex: number; answer: string }
  | { type: "SET_PROPOSAL"; proposal: TeamProposal }
  | { type: "SET_PREVIEW"; template: SceneTemplate }
  | { type: "SET_DEPLOY_PROGRESS"; progress: DeployProgress }
  | { type: "DEPLOY_SUCCESS"; data: OrchestratorState["successData"] }
  | { type: "DEPLOY_ERROR"; error: string }
  | { type: "SET_COMMUNITY_TEMPLATES"; templates: CommunityTemplate[] }
  | { type: "SET_COMMUNITY_LOADING"; loading: boolean }
  | { type: "SET_COMMUNITY_ERROR"; error: string }
  | { type: "SET_PROPOSING_STEPS"; steps: ProposingStep[] }
  | { type: "UPDATE_PROPOSING_STEP"; index: number; step: Partial<ProposingStep> }
  | { type: "SET_RETRYING_FAILED"; retrying: boolean }
  | { type: "SET_HAS_PROVIDER"; has: boolean }
  | { type: "RESET" };

// ── Initial State ────────────────────────────────────────────────────────

export function createInitialOrchestratorState(): OrchestratorState {
  return {
    phase: "welcome",
    messages: [],
    currentPlanId: null,
    inputValue: "",
    inputDisabled: false,
    templates: [],
    communityTemplates: [],
    communityLoading: false,
    communityError: null,
    gatheringQuestions: [],
    proposal: null,
    previewTemplate: null,
    deployProgress: null,
    proposingSteps: [],
    retryingFailed: false,
    hasProvider: null,
    successData: null,
    error: null,
  };
}

// ── Reducer ──────────────────────────────────────────────────────────────

export function orchestratorReducer(
  state: OrchestratorState,
  action: OrchestratorAction,
): OrchestratorState {
  switch (action.type) {
    case "OPEN":
      return { ...createInitialOrchestratorState(), phase: "welcome" };

    case "CLOSE":
      return { ...state, phase: "closed" };

    case "SET_TEMPLATES":
      return { ...state, templates: action.templates };

    case "ADD_MESSAGE":
      return { ...state, messages: [...state.messages, action.message] };

    case "SET_PHASE":
      return { ...state, phase: action.phase };

    case "SET_INPUT":
      return { ...state, inputValue: action.value };

    case "SET_INPUT_DISABLED":
      return { ...state, inputDisabled: action.disabled };

    case "SET_PLAN_ID":
      return { ...state, currentPlanId: action.planId };

    case "SET_QUESTIONS":
      return {
        ...state,
        phase: "gathering",
        gatheringQuestions: action.questions,
        inputDisabled: false,
      };

    case "ANSWER_QUESTION": {
      const questions = state.gatheringQuestions.map((q, i) =>
        i === action.questionIndex ? { ...q, answer: action.answer } : q,
      );
      return { ...state, gatheringQuestions: questions };
    }

    case "SET_PROPOSAL":
      return {
        ...state,
        phase: "proposed",
        proposal: action.proposal,
        inputDisabled: false,
      };

    case "SET_PREVIEW":
      return {
        ...state,
        phase: "previewing",
        previewTemplate: action.template,
        inputDisabled: true,
      };

    case "SET_DEPLOY_PROGRESS":
      return {
        ...state,
        phase: "deploying",
        deployProgress: action.progress,
        inputDisabled: true,
      };

    case "DEPLOY_SUCCESS":
      return {
        ...state,
        phase: "success",
        successData: action.data,
        inputDisabled: true,
      };

    case "DEPLOY_ERROR":
      return {
        ...state,
        phase: "error",
        error: action.error,
        inputDisabled: false,
      };

    case "SET_COMMUNITY_TEMPLATES":
      return {
        ...state,
        communityTemplates: action.templates,
        communityLoading: false,
        communityError: null,
      };

    case "SET_COMMUNITY_LOADING":
      return { ...state, communityLoading: action.loading };

    case "SET_COMMUNITY_ERROR":
      return { ...state, communityLoading: false, communityError: action.error };

    case "SET_PROPOSING_STEPS":
      return { ...state, proposingSteps: action.steps };

    case "UPDATE_PROPOSING_STEP": {
      const steps = state.proposingSteps.map((s, i) =>
        i === action.index ? { ...s, ...action.step } : s,
      );
      return { ...state, proposingSteps: steps };
    }

    case "SET_RETRYING_FAILED":
      return { ...state, retryingFailed: action.retrying };

    case "SET_HAS_PROVIDER":
      return { ...state, hasProvider: action.has };

    case "RESET":
      return createInitialOrchestratorState();

    default:
      return state;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────

let msgCounter = 0;

export function createMessage(
  role: MessageRole,
  content: string,
  widget?: MessageWidget,
  widgetData?: unknown,
): OrchestratorMessage {
  return {
    id: `msg-${Date.now()}-${++msgCounter}`,
    role,
    content,
    timestamp: Date.now(),
    widget,
    widgetData,
  };
}
