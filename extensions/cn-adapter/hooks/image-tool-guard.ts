/**
 * image-tool-guard — vision 模型下禁用 image 工具
 *
 * 原理：当主模型已经支持 vision（model.input 包含 "image"），用户发的图片会通过
 * detectAndLoadPromptImages 自动注入到 prompt 中，模型直接能看到。此时 image 工具
 * 是多余的（额外一次 API 调用，浪费费用）。
 *
 * 实现：
 *   1. llm_input hook（observational）→ 记录 runId → { provider, model } 映射
 *   2. before_tool_call hook → toolName === "image" 时查映射，vision 模型则 block
 *   3. agent_end hook → 清理映射，避免内存泄漏
 */
import { createCnLogger } from "../utils/index.js";

const log = createCnLogger("image-guard");

// ── runId → model info 映射 ──────────────────────────────────────────────
type RunModelInfo = { provider: string; model: string };
const _runModels = new Map<string, RunModelInfo>();

/** 清理超时映射（兜底，防止 agent_end 未触发时内存泄漏） */
const MAX_RUN_ENTRIES = 200;
const MAX_RUN_AGE_MS = 30 * 60 * 1000; // 30 min
const _runTimestamps = new Map<string, number>();

function cleanupStaleEntries() {
  if (_runModels.size <= MAX_RUN_ENTRIES) return;
  const now = Date.now();
  for (const [runId, ts] of _runTimestamps) {
    if (now - ts > MAX_RUN_AGE_MS) {
      _runModels.delete(runId);
      _runTimestamps.delete(runId);
    }
  }
}

/**
 * llm_input handler — 记录 runId 对应的 provider/model。
 * 在每次 LLM 调用前触发（observational hook，无返回值）。
 */
export function createLlmInputModelTracker() {
  return (_event: { runId: string; provider: string; model: string }) => {
    _runModels.set(_event.runId, {
      provider: _event.provider,
      model: _event.model,
    });
    _runTimestamps.set(_event.runId, Date.now());
    cleanupStaleEntries();
  };
}

/**
 * agent_end handler — 清理 runId 映射。
 */
export function createAgentEndModelCleanup() {
  return (_event: { runId?: string }) => {
    if (_event.runId) {
      _runModels.delete(_event.runId);
      _runTimestamps.delete(_event.runId);
    }
  };
}

/**
 * before_tool_call handler — 当 toolName === "image" 且当前模型支持 vision 时 block。
 *
 * 动态导入 provider-config-store 的 getProviderModelInput 来判断 vision 能力，
 * 与 provider-config-store 保持一致的 TEXT_ONLY_MODELS 黑名单逻辑。
 */
export function createImageToolGuardHandler() {
  return async (event: { toolName: string; runId?: string }) => {
    if (event.toolName !== "image") return undefined;

    const runId = event.runId;
    if (!runId) return undefined;

    const info = _runModels.get(runId);
    if (!info) return undefined;

    // 动态导入避免循环依赖
    try {
      const { getProviderModelInput } = await import(
        "../gateway/provider-config-store.js"
      );
      const input = getProviderModelInput(info.provider, info.model);
      if (input.includes("image")) {
        log.debug(
          `block image tool: ${info.provider}/${info.model} already has vision — images auto-injected`,
        );
        return {
          block: true,
          blockReason:
            "当前模型已支持图片理解，用户发送的图片会自动注入。无需调用 image 工具。" +
            "如需分析本地文件中的图片，请直接描述文件路径，系统会自动加载。",
        };
      }
    } catch (err) {
      log.debug(`image-tool-guard: failed to check vision capability: ${err}`);
    }

    return undefined;
  };
}
