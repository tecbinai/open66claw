/**
 * 欢迎发现组件
 * Welcome Discovery Component
 *
 * 首次进入 Chat 页面时显示的能力发现界面
 * 扫描用户设备能力，展示个性化建议
 */

import { html, nothing } from "lit";
import { t } from "../i18n/index.js";

// ============================================================================
// 类型定义 (Type Definitions)
// ============================================================================

export type CapabilityStatus = "ready" | "needs_config" | "not_available" | "can_install";

export type DetectedCapability = {
  id: string;
  name: string;
  icon: string;
  category: "tool" | "channel" | "browser" | "workspace" | "system";
  status: CapabilityStatus;
  skill?: string;
  configured: boolean;
  configHint?: string;
  configPath?: string;
  description?: string;
  examples?: string[];
};

export type WorkspaceInfo = {
  path: string;
  projectType: string | null;
  languages: string[];
  mainFiles: string[];
  name: string | null;
  description: string | null;
};

export type DiscoveryState = "idle" | "scanning" | "done" | "error";

export type WelcomeDiscoveryProps = {
  /** 当前状态 */
  state: DiscoveryState;
  /** 扫描进度 (0-100) */
  progress: number;
  /** 检测到的能力 */
  capabilities: DetectedCapability[];
  /** 工作空间信息 */
  workspace: WorkspaceInfo | null;
  /** 个性化建议 */
  suggestions: Array<{
    icon: string;
    text: string;
    prompt: string;
    capability?: string;
  }>;
  /** 检测耗时 */
  detectTimeMs?: number;
  /** 错误信息 */
  error?: string | null;
  /** 点击建议回调 */
  onSuggestionClick: (prompt: string) => void;
  /** 跳过回调 */
  onSkip: () => void;
  /** 配置点击回调 */
  onConfigClick?: (capability: DetectedCapability) => void;
  /** 重试回调 */
  onRetry?: () => void;
};

// ============================================================================
// 渲染函数 (Render Functions)
// ============================================================================

/**
 * 渲染扫描中状态
 */
function renderScanning(progress: number) {
  // 扫描阶段文本
  const scanPhases = [
    { threshold: 20, text: "检测 CLI 工具..." },
    { threshold: 40, text: "检测已配置渠道..." },
    { threshold: 60, text: "检测浏览器..." },
    { threshold: 80, text: "扫描工作空间..." },
    { threshold: 100, text: "生成个性化建议..." },
  ];

  const currentPhase =
    scanPhases.find((p) => progress <= p.threshold) ?? scanPhases[scanPhases.length - 1];

  return html`
    <div class="welcome-discovery welcome-discovery--scanning">
      <div class="welcome-discovery__scan-icon">
        <div class="welcome-discovery__scan-ring"></div>
        <div class="welcome-discovery__scan-ring welcome-discovery__scan-ring--delay"></div>
        <span class="welcome-discovery__scan-emoji">🔍</span>
      </div>
      
      <h2 class="welcome-discovery__title">正在了解您的设备能力</h2>
      <p class="welcome-discovery__subtitle">${currentPhase.text}</p>
      
      <div class="welcome-discovery__progress">
        <div class="welcome-discovery__progress-track">
          <div 
            class="welcome-discovery__progress-bar" 
            style="width: ${progress}%"
          ></div>
        </div>
        <span class="welcome-discovery__progress-text">${progress}%</span>
      </div>
      
      <p class="welcome-discovery__hint">
        这通常只需要几秒钟
      </p>
    </div>
  `;
}

/**
 * 渲染错误状态
 */
function renderError(error: string, onRetry?: () => void) {
  return html`
    <div class="welcome-discovery welcome-discovery--error">
      <div class="welcome-discovery__error-icon">⚠️</div>
      <h2 class="welcome-discovery__title">检测遇到问题</h2>
      <p class="welcome-discovery__error-message">${error}</p>
      ${
        onRetry
          ? html`
            <button class="welcome-discovery__retry-btn" @click=${onRetry}>
              重新检测
            </button>
          `
          : nothing
      }
    </div>
  `;
}

/**
 * 渲染能力卡片
 */
function renderCapabilityCard(
  capability: DetectedCapability,
  onConfigClick?: (cap: DetectedCapability) => void,
) {
  const statusClass = `welcome-discovery__capability--${capability.status.replace("_", "-")}`;

  return html`
    <div class="welcome-discovery__capability ${statusClass}">
      <span class="welcome-discovery__capability-icon">${capability.icon}</span>
      <div class="welcome-discovery__capability-info">
        <span class="welcome-discovery__capability-name">${capability.name}</span>
        ${
          capability.description
            ? html`<span class="welcome-discovery__capability-desc">${capability.description}</span>`
            : nothing
        }
      </div>
      ${
        capability.status === "needs_config" && onConfigClick
          ? html`
            <button
              class="welcome-discovery__config-btn"
              @click=${(e: Event) => {
                e.stopPropagation();
                onConfigClick(capability);
              }}
            >
              配置
            </button>
          `
          : nothing
      }
    </div>
  `;
}

/**
 * 渲染建议卡片
 */
function renderSuggestionCard(
  suggestion: { icon: string; text: string; prompt: string },
  onClick: (prompt: string) => void,
) {
  return html`
    <button
      class="welcome-discovery__suggestion"
      @click=${() => onClick(suggestion.prompt)}
    >
      <span class="welcome-discovery__suggestion-icon">${suggestion.icon}</span>
      <span class="welcome-discovery__suggestion-text">${suggestion.text}</span>
    </button>
  `;
}

/**
 * 渲染工作空间信息
 */
function renderWorkspaceInfo(workspace: WorkspaceInfo) {
  return html`
    <div class="welcome-discovery__workspace">
      <div class="welcome-discovery__workspace-header">
        <span class="welcome-discovery__workspace-icon">📁</span>
        <span class="welcome-discovery__workspace-name">${workspace.name ?? "当前项目"}</span>
      </div>
      ${
        workspace.projectType
          ? html`
            <div class="welcome-discovery__workspace-detail">
              <span class="welcome-discovery__workspace-label">项目类型:</span>
              <span class="welcome-discovery__workspace-value">${workspace.projectType}</span>
            </div>
          `
          : nothing
      }
      ${
        workspace.languages.length > 0
          ? html`
            <div class="welcome-discovery__workspace-detail">
              <span class="welcome-discovery__workspace-label">语言/框架:</span>
              <span class="welcome-discovery__workspace-value">${workspace.languages.join(", ")}</span>
            </div>
          `
          : nothing
      }
    </div>
  `;
}

/**
 * 渲染空状态（未检测到任何能力）
 */
function renderEmpty(onSkip: () => void) {
  return html`
    <div class="welcome-discovery welcome-discovery--done">
      <div class="welcome-discovery__header">
        <div class="welcome-discovery__header-icon">👋</div>
        <h2 class="welcome-discovery__title">${t("discovery.welcome.title")}</h2>
        <p class="welcome-discovery__subtitle">欢迎使用！我可以帮助您完成各种任务。</p>
      </div>
      
      <div class="welcome-discovery__section">
        <p class="welcome-discovery__empty-hint">
          未检测到已安装的工具或已配置的渠道，但这不影响使用。
          您可以直接开始对话，或前往设置页面配置更多功能。
        </p>
      </div>
      
      <div class="welcome-discovery__footer">
        <button class="welcome-discovery__skip-btn" @click=${onSkip}>
          开始使用
        </button>
      </div>
    </div>
  `;
}

/**
 * 渲染完成状态
 */
function renderDone(props: WelcomeDiscoveryProps) {
  const {
    capabilities,
    workspace,
    suggestions,
    detectTimeMs,
    onSuggestionClick,
    onSkip,
    onConfigClick,
  } = props;

  // 按状态分组能力
  const readyCapabilities = capabilities.filter((c) => c.status === "ready");
  const needsConfigCapabilities = capabilities.filter((c) => c.status === "needs_config");

  // 如果没有检测到任何能力，显示空状态
  const hasAnyCapability = readyCapabilities.length > 0 || needsConfigCapabilities.length > 0;
  if (!hasAnyCapability && !workspace?.projectType) {
    return renderEmpty(onSkip);
  }

  // 按类别分组已就绪的能力
  const toolCapabilities = readyCapabilities.filter((c) => c.category === "tool");
  const channelCapabilities = readyCapabilities.filter((c) => c.category === "channel");
  const browserCapabilities = readyCapabilities.filter((c) => c.category === "browser");
  const workspaceCapabilities = readyCapabilities.filter((c) => c.category === "workspace");

  const hasReadyCapabilities = readyCapabilities.length > 0;
  const hasNeedsConfigCapabilities = needsConfigCapabilities.length > 0;

  return html`
    <div class="welcome-discovery welcome-discovery--done">
      <!-- 头部 -->
      <div class="welcome-discovery__header">
        <div class="welcome-discovery__header-icon">👋</div>
        <h2 class="welcome-discovery__title">${t("discovery.welcome.title")}</h2>
        <p class="welcome-discovery__subtitle">${t("discovery.welcome.subtitle")}</p>
      </div>

      <!-- 工作空间信息 -->
      ${
        workspace && workspace.projectType
          ? html`
            <div class="welcome-discovery__section">
              <h3 class="welcome-discovery__section-title">
                <span class="welcome-discovery__section-icon">📁</span>
                ${t("discovery.workspace.title")}
              </h3>
              ${renderWorkspaceInfo(workspace)}
            </div>
          `
          : nothing
      }

      <!-- 已就绪的能力 -->
      ${
        hasReadyCapabilities
          ? html`
            <div class="welcome-discovery__section">
              <h3 class="welcome-discovery__section-title">
                <span class="welcome-discovery__section-icon">✅</span>
                ${t("discovery.ready.title")}
              </h3>
              
              <div class="welcome-discovery__capabilities-grid">
                <!-- 工具 -->
                ${
                  toolCapabilities.length > 0
                    ? html`
                      <div class="welcome-discovery__capability-group">
                        <span class="welcome-discovery__capability-group-label">工具</span>
                        <div class="welcome-discovery__capabilities">
                          ${toolCapabilities.map((cap) => renderCapabilityCard(cap))}
                        </div>
                      </div>
                    `
                    : nothing
                }
                
                <!-- 渠道 -->
                ${
                  channelCapabilities.length > 0
                    ? html`
                      <div class="welcome-discovery__capability-group">
                        <span class="welcome-discovery__capability-group-label">消息渠道</span>
                        <div class="welcome-discovery__capabilities">
                          ${channelCapabilities.map((cap) => renderCapabilityCard(cap))}
                        </div>
                      </div>
                    `
                    : nothing
                }
                
                <!-- 浏览器 -->
                ${
                  browserCapabilities.length > 0
                    ? html`
                      <div class="welcome-discovery__capability-group">
                        <span class="welcome-discovery__capability-group-label">浏览器</span>
                        <div class="welcome-discovery__capabilities">
                          ${browserCapabilities.map((cap) => renderCapabilityCard(cap))}
                        </div>
                      </div>
                    `
                    : nothing
                }
                
                <!-- 工作空间能力 -->
                ${
                  workspaceCapabilities.length > 0
                    ? html`
                      <div class="welcome-discovery__capability-group">
                        <span class="welcome-discovery__capability-group-label">开发能力</span>
                        <div class="welcome-discovery__capabilities">
                          ${workspaceCapabilities.map((cap) => renderCapabilityCard(cap))}
                        </div>
                      </div>
                    `
                    : nothing
                }
              </div>
            </div>
          `
          : nothing
      }

      <!-- 需要配置的能力 -->
      ${
        hasNeedsConfigCapabilities
          ? html`
            <div class="welcome-discovery__section welcome-discovery__section--needs-config">
              <h3 class="welcome-discovery__section-title">
                <span class="welcome-discovery__section-icon">⚙️</span>
                ${t("discovery.needsConfig.title")}
              </h3>
              <div class="welcome-discovery__capabilities">
                ${needsConfigCapabilities.map((cap) => renderCapabilityCard(cap, onConfigClick))}
              </div>
            </div>
          `
          : nothing
      }

      <!-- 个性化建议 -->
      ${
        suggestions.length > 0
          ? html`
            <div class="welcome-discovery__section">
              <h3 class="welcome-discovery__section-title">
                <span class="welcome-discovery__section-icon">✨</span>
                ${t("discovery.suggestions.title")}
              </h3>
              <div class="welcome-discovery__suggestions">
                ${suggestions.map((s) => renderSuggestionCard(s, onSuggestionClick))}
              </div>
            </div>
          `
          : nothing
      }

      <!-- 底部 -->
      <div class="welcome-discovery__footer">
        <button class="welcome-discovery__skip-btn" @click=${onSkip}>
          ${t("discovery.skip")}
        </button>
        ${
          detectTimeMs !== undefined
            ? html`
              <span class="welcome-discovery__detect-time">
                检测耗时 ${detectTimeMs}ms
              </span>
            `
            : nothing
        }
      </div>
    </div>
  `;
}

// ============================================================================
// 主渲染函数 (Main Render Function)
// ============================================================================

/**
 * 渲染欢迎发现组件
 */
export function renderWelcomeDiscovery(props: WelcomeDiscoveryProps) {
  switch (props.state) {
    case "idle":
      // 空闲状态，显示加载中
      return renderScanning(0);

    case "scanning":
      return renderScanning(props.progress);

    case "error":
      return renderError(props.error ?? "未知错误", props.onRetry);

    case "done":
      return renderDone(props);

    default:
      return nothing;
  }
}

// ============================================================================
// 辅助函数 (Helper Functions)
// ============================================================================

/**
 * 创建模拟进度动画
 * 用于在真实检测完成前显示平滑的进度条
 */
export function createProgressSimulator(
  onProgress: (progress: number) => void,
  duration: number = 500,
): { start: () => void; complete: () => void; cancel: () => void } {
  let animationFrame: number | null = null;
  let startTime: number | null = null;
  let completed = false;

  const animate = (timestamp: number) => {
    if (!startTime) startTime = timestamp;
    const elapsed = timestamp - startTime;

    // 使用缓动函数，开始快后面慢
    const rawProgress = Math.min(elapsed / duration, 1);
    const easedProgress = 1 - Math.pow(1 - rawProgress, 3); // easeOutCubic

    // 最大到 90%，留 10% 给完成状态
    const progress = Math.round(easedProgress * 90);

    onProgress(progress);

    if (!completed && rawProgress < 1) {
      animationFrame = requestAnimationFrame(animate);
    }
  };

  return {
    start: () => {
      completed = false;
      startTime = null;
      animationFrame = requestAnimationFrame(animate);
    },
    complete: () => {
      completed = true;
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
      // 快速完成到 100%
      onProgress(100);
    },
    cancel: () => {
      completed = true;
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
    },
  };
}
