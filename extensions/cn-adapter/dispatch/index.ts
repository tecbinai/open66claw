// --- Tool Discovery (Wave 2) ---
export { discoverTools, extractKeywords } from "./tool-discovery.js";
export type { ToolMeta, DiscoveryResult } from "./tool-discovery.js";

// --- Tool Filter Rules (Wave 2) ---
export {
  buildToolFilterPolicy,
  isToolAllowed,
  CORE_ALWAYS_ON_TOOLS,
  INTENT_TOOL_MAP,
} from "./tool-filter-rules.js";
export type { ToolFilterMode, ToolFilterPolicy } from "./tool-filter-rules.js";

// --- Types ---
export type {
  DispatchPatterns,
  IntentDefinition,
  CompiledIntent,
  RuleMatchResult,
  ComplexityLevel,
  ExecutionStrategy,
  RoutingDecision,
  Subtask,
  MergeStrategy,
  DecompositionResult,
  WorkerResult,
  StepRunnerFn,
} from "./types.js";

// --- Intent Classifier ---
export { compileIntents, classifyByRules, classifyIntent } from "./intent-classifier.js";

// --- Execution Workspace ---
export { createWorkspace } from "./execution-workspace.js";
export type { StepOutputStatus, StepOutput, ExecutionWorkspace } from "./execution-workspace.js";

// --- DAG Executor ---
export { topologicalWaves, executeDag } from "./dag-executor.js";
export type { DagNode, DagExecutionConfig, DagExecutionResult } from "./dag-executor.js";

// --- Step Runner ---
export { createStepRunner, defaultExecutor } from "./step-runner.js";
export type { StepExecutor } from "./step-runner.js";

// --- Result Merger ---
export { mergeWorkerResults } from "./result-merger.js";

// --- Orchestrator ---
export { runOrchestration, defaultDecomposer } from "./orchestrator.js";
export type { TaskDecomposer, OrchestrationConfig, OrchestrationResult } from "./orchestrator.js";
