/**
 * 能力检测控制器
 * Capability Detection Controller
 *
 * 管理首次使用发现流程的状态和逻辑
 */

import type {
  DiscoveryState,
  DetectedCapability,
  WorkspaceInfo,
  WelcomeDiscoveryProps,
} from "../views/welcome-discovery.js";
import { createProgressSimulator } from "../views/welcome-discovery.js";

// ============================================================================
// 类型定义 (Type Definitions)
// ============================================================================

export type CapabilityDetectResult = {
  platform: {
    os: string;
    arch: string;
    hostname: string;
  };
  capabilities: DetectedCapability[];
  workspace: WorkspaceInfo | null;
  suggestions: Array<{
    icon: string;
    text: string;
    prompt: string;
    capability?: string;
  }>;
  detectTimeMs: number;
};

export type DiscoveryControllerState = {
  /** 发现状态 */
  state: DiscoveryState;
  /** 扫描进度 */
  progress: number;
  /** 检测结果 */
  result: CapabilityDetectResult | null;
  /** 错误信息 */
  error: string | null;
  /** 是否首次访问 */
  isFirstVisit: boolean;
  /** 是否已完成首次访问 */
  hasCompletedFirstVisit: boolean;
};

export type GatewayClient = {
  request: (method: string, params?: Record<string, unknown>) => Promise<unknown>;
};

// ============================================================================
// 常量 (Constants)
// ============================================================================

const FIRST_VISIT_KEY = "clawdbot:discovery:firstVisit";
const FIRST_VISIT_COMPLETED_KEY = "clawdbot:discovery:completed";

// 内存 fallback（当 localStorage 不可用时）
const memoryStorage: Record<string, string> = {};

/**
 * 安全的存储访问（localStorage 不可用时使用内存存储）
 */
function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return memoryStorage[key] ?? null;
  }
}

function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    memoryStorage[key] = value;
  }
}

function safeRemoveItem(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    delete memoryStorage[key];
  }
}

// ============================================================================
// 状态管理 (State Management)
// ============================================================================

/**
 * 创建初始状态
 */
export function createInitialDiscoveryState(): DiscoveryControllerState {
  const isFirstVisit = checkIsFirstVisit();
  const hasCompletedFirstVisit = checkHasCompletedFirstVisit();

  return {
    state: "idle",
    progress: 0,
    result: null,
    error: null,
    isFirstVisit,
    hasCompletedFirstVisit,
  };
}

/**
 * 检查是否首次访问
 */
function checkIsFirstVisit(): boolean {
  const value = safeGetItem(FIRST_VISIT_KEY);
  // 如果没有记录，则为首次访问
  return value === null;
}

/**
 * 检查是否已完成首次访问引导
 */
function checkHasCompletedFirstVisit(): boolean {
  return safeGetItem(FIRST_VISIT_COMPLETED_KEY) === "true";
}

/**
 * 标记已访问
 */
export function markVisited(): void {
  safeSetItem(FIRST_VISIT_KEY, new Date().toISOString());
}

/**
 * 标记首次访问引导完成
 */
export function markFirstVisitCompleted(): void {
  safeSetItem(FIRST_VISIT_COMPLETED_KEY, "true");
  markVisited();
}

/**
 * 重置首次访问状态（用于测试）
 */
export function resetFirstVisitState(): void {
  safeRemoveItem(FIRST_VISIT_KEY);
  safeRemoveItem(FIRST_VISIT_COMPLETED_KEY);
  // 同时清理内存存储
  delete memoryStorage[FIRST_VISIT_KEY];
  delete memoryStorage[FIRST_VISIT_COMPLETED_KEY];
}

// ============================================================================
// 检测流程 (Detection Flow)
// ============================================================================

export type DetectionCallbacks = {
  onStateChange: (state: Partial<DiscoveryControllerState>) => void;
};

// API 请求超时时间 (ms)
const DETECTION_TIMEOUT_MS = 10000;

// 防止多次同时检测的锁
let isDetectionRunning = false;

/**
 * 带超时的 Promise 包装器
 */
function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);

    promise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

/**
 * 执行能力检测
 * 添加超时保护、状态检查和防重复检测
 */
export async function runCapabilityDetection(
  client: GatewayClient | null,
  callbacks: DetectionCallbacks,
): Promise<CapabilityDetectResult | null> {
  // 防止多次同时检测
  if (isDetectionRunning) {
    console.warn("[capability-detect] Detection already running, skipping");
    return null;
  }

  if (!client) {
    callbacks.onStateChange({
      state: "error",
      error: "未连接到网关",
    });
    return null;
  }

  isDetectionRunning = true;

  // 创建进度模拟器
  const progressSimulator = createProgressSimulator(
    (progress) => callbacks.onStateChange({ progress }),
    800, // 预估检测时间
  );

  // 标记是否已取消（用于防止组件卸载后更新状态）
  let cancelled = false;

  try {
    // 开始扫描
    callbacks.onStateChange({
      state: "scanning",
      progress: 0,
      error: null,
    });

    // 启动进度动画
    progressSimulator.start();

    // 调用后端 API（带超时）
    const result = await withTimeout(
      client.request("capability.detect.quick") as Promise<CapabilityDetectResult>,
      DETECTION_TIMEOUT_MS,
      "检测超时，请重试",
    );

    // 检查是否已取消
    if (cancelled) return null;

    // 完成进度
    progressSimulator.complete();

    // 短暂延迟，让用户看到 100%
    await new Promise((resolve) => setTimeout(resolve, 200));

    // 再次检查是否已取消
    if (cancelled) return null;

    // 更新状态
    callbacks.onStateChange({
      state: "done",
      progress: 100,
      result,
    });

    return result;
  } catch (err) {
    progressSimulator.cancel();

    // 如果已取消，不更新状态
    if (cancelled) return null;

    const message = err instanceof Error ? err.message : String(err);
    callbacks.onStateChange({
      state: "error",
      error: message,
    });
    return null;
  } finally {
    // 释放锁
    isDetectionRunning = false;
  }
}

// ============================================================================
// Props 构建 (Props Builder)
// ============================================================================

export type DiscoveryPropsOptions = {
  state: DiscoveryControllerState;
  onSuggestionClick: (prompt: string) => void;
  onSkip: () => void;
  onConfigClick?: (capability: DetectedCapability) => void;
  onRetry?: () => void;
};

/**
 * 构建 WelcomeDiscoveryProps
 */
export function buildDiscoveryProps(options: DiscoveryPropsOptions): WelcomeDiscoveryProps {
  const { state, onSuggestionClick, onSkip, onConfigClick, onRetry } = options;

  return {
    state: state.state,
    progress: state.progress,
    capabilities: state.result?.capabilities ?? [],
    workspace: state.result?.workspace ?? null,
    suggestions: state.result?.suggestions ?? [],
    detectTimeMs: state.result?.detectTimeMs,
    error: state.error,
    onSuggestionClick,
    onSkip,
    onConfigClick,
    onRetry,
  };
}

// ============================================================================
// 集成辅助 (Integration Helpers)
// ============================================================================

/**
 * 判断是否应该显示发现界面
 */
export function shouldShowDiscovery(
  _state: DiscoveryControllerState,
  _hasMessages: boolean,
  _connected: boolean,
): boolean {
  // OpenClawCN: 禁用设备检测/发现流程，桌面模式下不需要
  return false;
}

/**
 * 处理跳过操作
 * 立即标记完成，即使检测仍在进行中
 */
export function handleSkip(callbacks: DetectionCallbacks): void {
  markFirstVisitCompleted();
  // 重置检测锁，允许后续重新检测
  isDetectionRunning = false;
  callbacks.onStateChange({
    state: "done", // 将状态设置为 done，防止继续显示 scanning
    hasCompletedFirstVisit: true,
  });
}

/**
 * 处理建议点击
 */
export function handleSuggestionClick(
  prompt: string,
  callbacks: DetectionCallbacks,
  onDraftChange: (draft: string) => void,
): void {
  // 填充到输入框
  onDraftChange(prompt);

  // 标记完成
  markFirstVisitCompleted();
  callbacks.onStateChange({
    hasCompletedFirstVisit: true,
  });
}
