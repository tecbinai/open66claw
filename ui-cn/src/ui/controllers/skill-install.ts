import type { SkillInstallRequest } from "../views/skill-install-approval.js";
import type { SkillInstallProgress } from "../views/skill-install-progress.js";

/**
 * 技能安装决策类型
 */
export type SkillInstallDecision = "install" | "install-continue" | "deny";

/**
 * 技能安装解决事件
 */
export type SkillInstallResolved = {
  id: string;
  decision?: SkillInstallDecision | null;
  resolvedBy?: string | null;
  ts?: number | null;
};

/**
 * 技能安装进度事件
 */
export type SkillInstallProgressEvent = {
  id: string;
  stage: "downloading" | "installing" | "verifying" | "complete" | "failed";
  message: string;
  percent?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * 解析技能安装请求事件
 */
export function parseSkillInstallRequested(payload: unknown): SkillInstallRequest | null {
  if (!isRecord(payload)) return null;

  const id = typeof payload.id === "string" ? payload.id.trim() : "";
  const request = payload.request;
  if (!id || !isRecord(request)) return null;

  const skillName = typeof request.skillName === "string" ? request.skillName.trim() : "";
  if (!skillName) return null;

  const createdAtMs = typeof payload.createdAtMs === "number" ? payload.createdAtMs : 0;
  const expiresAtMs = typeof payload.expiresAtMs === "number" ? payload.expiresAtMs : 0;
  if (!createdAtMs || !expiresAtMs) return null;

  const missing = isRecord(request.missing) ? request.missing : {};

  return {
    id,
    request: {
      skillName,
      skillDescription:
        typeof request.skillDescription === "string" ? request.skillDescription : null,
      missing: {
        bins: Array.isArray(missing.bins)
          ? missing.bins.filter((b): b is string => typeof b === "string")
          : [],
        env: Array.isArray(missing.env)
          ? missing.env.filter((e): e is string => typeof e === "string")
          : [],
        config: Array.isArray(missing.config)
          ? missing.config.filter((c): c is string => typeof c === "string")
          : [],
      },
      installSteps: Array.isArray(request.installSteps)
        ? request.installSteps.filter((s): s is string => typeof s === "string")
        : null,
      estimatedTime: typeof request.estimatedTime === "string" ? request.estimatedTime : null,
      originalMessage: typeof request.originalMessage === "string" ? request.originalMessage : null,
      sessionKey: typeof request.sessionKey === "string" ? request.sessionKey : null,
    },
    createdAtMs,
    expiresAtMs,
  };
}

/**
 * 解析技能安装解决事件
 */
export function parseSkillInstallResolved(payload: unknown): SkillInstallResolved | null {
  if (!isRecord(payload)) return null;

  const id = typeof payload.id === "string" ? payload.id.trim() : "";
  if (!id) return null;

  return {
    id,
    decision:
      typeof payload.decision === "string" ? (payload.decision as SkillInstallDecision) : null,
    resolvedBy: typeof payload.resolvedBy === "string" ? payload.resolvedBy : null,
    ts: typeof payload.ts === "number" ? payload.ts : null,
  };
}

/**
 * 解析技能安装进度事件
 * 支持详细下载信息和国内镜像标识
 */
export function parseSkillInstallProgress(
  payload: unknown,
  existingProgress?: SkillInstallProgress | null,
  skillName?: string,
): SkillInstallProgress | null {
  if (!isRecord(payload)) return null;

  const id = typeof payload.id === "string" ? payload.id.trim() : "";
  if (!id) return null;

  const stage = payload.stage as SkillInstallProgress["stage"];
  const validStages = ["downloading", "installing", "verifying", "complete", "failed"];
  if (!validStages.includes(stage)) return null;

  const message = typeof payload.message === "string" ? payload.message : "";
  const percent = typeof payload.percent === "number" ? payload.percent : undefined;

  // 从 payload 或参数中获取 skillName
  const resolvedSkillName =
    typeof (payload as Record<string, unknown>).skillName === "string"
      ? (payload as Record<string, string>).skillName
      : (existingProgress?.skillName ?? skillName ?? "");

  // 保留之前的日志，追加新消息
  const existingLogs = existingProgress?.logs ?? [];
  const logs = message ? [...existingLogs, message] : existingLogs;

  // 解析下载详情
  let downloadInfo: SkillInstallProgress["downloadInfo"];
  const payloadDownloadInfo = (payload as Record<string, unknown>).downloadInfo;
  if (payloadDownloadInfo && isRecord(payloadDownloadInfo)) {
    downloadInfo = {
      speed: typeof payloadDownloadInfo.speed === "string" ? payloadDownloadInfo.speed : undefined,
      eta: typeof payloadDownloadInfo.eta === "string" ? payloadDownloadInfo.eta : undefined,
      downloaded:
        typeof payloadDownloadInfo.downloaded === "string"
          ? payloadDownloadInfo.downloaded
          : undefined,
      total: typeof payloadDownloadInfo.total === "string" ? payloadDownloadInfo.total : undefined,
    };
  }

  // 解析国内镜像标识
  const usingCNMirror =
    typeof (payload as Record<string, unknown>).usingCNMirror === "boolean"
      ? (payload as Record<string, boolean>).usingCNMirror
      : existingProgress?.usingCNMirror;

  // 解析当前依赖名称
  const currentDependency =
    typeof (payload as Record<string, unknown>).currentDependency === "string"
      ? (payload as Record<string, string>).currentDependency
      : existingProgress?.currentDependency;

  return {
    id,
    skillName: resolvedSkillName,
    stage,
    message,
    percent,
    logs: logs.slice(-50), // 只保留最后 50 条日志
    downloadInfo: downloadInfo ?? existingProgress?.downloadInfo,
    usingCNMirror,
    currentDependency,
  };
}

/**
 * 清理过期的安装请求
 */
export function pruneSkillInstallQueue(queue: SkillInstallRequest[]): SkillInstallRequest[] {
  const now = Date.now();
  return queue.filter((entry) => entry.expiresAtMs > now);
}

/**
 * 添加安装请求到队列
 */
export function addSkillInstallRequest(
  queue: SkillInstallRequest[],
  entry: SkillInstallRequest,
): SkillInstallRequest[] {
  const next = pruneSkillInstallQueue(queue).filter((item) => item.id !== entry.id);
  next.push(entry);
  return next;
}

/**
 * 从队列中移除安装请求
 */
export function removeSkillInstallRequest(
  queue: SkillInstallRequest[],
  id: string,
): SkillInstallRequest[] {
  return pruneSkillInstallQueue(queue).filter((entry) => entry.id !== id);
}

/**
 * 创建初始进度状态
 * 默认启用国内镜像标识
 */
export function createInitialProgress(
  request: SkillInstallRequest,
  usingCNMirror = true,
): SkillInstallProgress {
  return {
    id: request.id,
    skillName: request.request.skillName,
    stage: "downloading",
    message: `正在准备安装 ${request.request.skillName}...`,
    percent: 0,
    logs: [],
    usingCNMirror,
  };
}

/**
 * 创建简单进度状态（用于直接安装场景）
 * 用于 playground 等直接安装场景
 */
export function createSimpleProgress(
  skillName: string,
  usingCNMirror = true,
): SkillInstallProgress {
  const id = `install-${skillName}-${Date.now()}`;
  return {
    id,
    skillName,
    stage: "downloading",
    message: `正在准备安装 ${skillName}...`,
    percent: 0,
    logs: [],
    usingCNMirror,
  };
}
