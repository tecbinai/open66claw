import { html, nothing } from "lit";
import {
  renderOrchestratorEntry,
  renderOrchestrator,
} from "../shared/orchestrator/orchestrator-view.js";
import { parseAgentSessionKey } from "../shared/session-key-utils.js";
import { refreshChatAvatar } from "./app-chat";
import { renderUsageTab } from "./app-render-usage-tab";
import { renderTab } from "./app-render.helpers";
import type { AppViewState, McpMarketplaceItem } from "./app-view-state";
import { brand } from "./brand";
import { handleComposePaste } from "./chat/compose-card.js";
import { formatGeneralError } from "./chat/error-hints";
import { renderImageGallery } from "./chat/image-gallery";
import {
  loadAgentChatHistory,
  sendAgentChatMessage,
  abortAgentChatRun,
  resetAgentChatState,
} from "./controllers/agent-chat";
import { loadAgentFileContent, loadAgentFiles, saveAgentFile } from "./controllers/agent-files";
import { loadAgentIdentities, loadAgentIdentity } from "./controllers/agent-identity";
import { loadAgentOutputs, loadAgentOutputContent } from "./controllers/agent-outputs";
import { loadAgentSkills } from "./controllers/agent-skills";
import { loadAgents, createAgent, deleteAgent, loadDmScopeStatus } from "./controllers/agents";
import {
  buildDiscoveryProps,
  shouldShowDiscovery,
  handleSkip as handleDiscoverySkip,
  handleSuggestionClick as handleDiscoverySuggestionClick,
  runCapabilityDetection,
} from "./controllers/capability-detect";
import { loadChannels, updateChannelRoute } from "./controllers/channels";
import { loadChatHistory } from "./controllers/chat";
import {
  applyConfig,
  loadConfig,
  runUpdate,
  saveConfig,
  updateConfigFormValue,
  removeConfigFormValue,
} from "./controllers/config";
import {
  loadCronRuns,
  toggleCronJob,
  runCronJob,
  removeCronJob,
  addCronJob,
} from "./controllers/cron";
import { loadDebug, callDebugMethod } from "./controllers/debug";
import {
  approveDevicePairing,
  loadDevices,
  rejectDevicePairing,
  removeDevice,
  revokeDeviceToken,
  rotateDeviceToken,
} from "./controllers/devices";
import {
  loadExecApprovals,
  removeExecApprovalsFormValue,
  saveExecApprovals,
  updateExecApprovalsFormValue,
} from "./controllers/exec-approvals";
import { loadLogs } from "./controllers/logs";
import {
  restartMcpServer,
  disableMcpServer,
  enableMcpServer,
  testMcpServer,
  checkMcpUpdate,
  initMcpCapabilities,
  installMarketplaceItem,
  uninstallMarketplaceItem,
  updateMarketplaceItem,
  loadMarketplaceItems,
  loadMoreMarketplaceItems,
  loadMarketplaceRecommendations,
  batchUpdateMcpServerEnv,
  fetchServerEnvStatus,
  type McpLifecycleState,
  type MarketplaceCallbacks,
} from "./controllers/mcp-lifecycle.js";
import {
  loadNetworkStatus,
  discoverGateways,
  probeGateway,
  configureNetworkMode,
} from "./controllers/networking";
import { loadNodes } from "./controllers/nodes";
import {
  openOrchestrator,
  closeOrchestrator,
  handleTemplateClick as orchTemplateClick,
  handleExampleClick as orchExampleClick,
  handleInput as orchInput,
  handleKeydown as orchKeydown,
  handleSend as orchSend,
  handleActionClick as orchActionClick,
  handleAnswerQuestion as orchAnswerQuestion,
  handleDeployProposal as orchDeployProposal,
  handlePreviewDeploy as orchPreviewDeploy,
} from "./controllers/orchestrator";
import { applyPerformanceProfile } from "./controllers/perf-profile";
import {
  loadPlaygroundSkills,
  setPlaygroundCategory,
  handleTrySkill,
  installSkillDeps,
} from "./controllers/playground";
import { loadPresence } from "./controllers/presence";
import { deleteSession, loadSessions, patchSession } from "./controllers/sessions";
import {
  installSkill,
  installRemoteSkill,
  uninstallRemoteSkill,
  loadSkills,
  refreshMarketSkills,
  saveSkillApiKey,
  searchMarketSkills,
  loadMoreMarketSkills,
  setActiveCategory,
  updateSkillEdit,
  updateSkillEnabled,
  promoteSkillToCore,
  demoteSkillFromCore,
  countCoreSkills,
  CORE_SKILLS_MAX,
  openSkillImport,
  closeSkillImport,
  browseSkillDir,
  importSkill,
  selectSkill,
  selectMarketSkill,
} from "./controllers/skills";
import {
  startBatchInstall,
  cancelBatchInstall,
  reportBatchFailures,
  dismissBanner,
} from "./controllers/skills-batch";
import {
  loadTeamProjects,
  selectProject,
  pauseProject,
  resumeProject,
  deleteProject,
  loadProjectStats,
  loadSharedMemory,
  clearSharedMemory,
  loadProjectActivity,
  loadProjectFiles,
  stopProjectHealthPoll,
  updateProjectSettings,
  removeProjectMember,
} from "./controllers/team-projects";
import { editionVisible } from "./edition";
import "./views/model-config";
import { t, type TranslationKey } from "./i18n/index.js";
import { icons } from "./icons";
import {
  getMainTabs,
  getMoreTabs,
  MORE_TABS,
  subtitleForTab,
  titleForTab,
  type Tab,
} from "./navigation";
// 官方原始组件（已禁用）
// import { renderSkillsBatchBanner } from "./views/skills-batch-banner";
// import { renderSkillsBatchConfirm } from "./views/skills-batch-confirm";
// import { renderSkillsBatchProgress } from "./views/skills-batch-progress";
// import { renderSkillsBatchResult } from "./views/skills-batch-result";
// import { renderSkillsBatchComplete } from "./views/skills-batch-complete";
import type { ChatAttachment } from "./ui-types";
import { generateUUID } from "./uuid";
import { renderAgents } from "./views/agents";
import {
  renderAgentWizard,
  createWizardInitialState,
  AGENT_TEMPLATES,
  type AgentWizardStep,
} from "./views/agent-wizard";
import { renderChannels } from "./views/channels";
import { renderChat } from "./views/chat";
import { renderConfig } from "./views/config";
import { renderConversationSidebar, renderSidebarToggle } from "./views/conversation-sidebar";
import { renderCron } from "./views/cron";
import { renderDebug } from "./views/debug";
import {
  renderDocs,
  handleDocSelect,
  handleDocsBack,
  handleDocsSearch,
  handleToggleFavorite,
} from "./views/docs";
import { renderExecApprovalPrompt } from "./views/exec-approval";
import { renderExtensions } from "./views/extensions-page";
import { type FeedbackViewProps, renderFeedbackPage } from "./views/feedback";
import { renderGatewayUrlConfirmation } from "./views/gateway-url-confirmation";
import { renderInstances } from "./views/instances";
import { renderLogReportModal } from "./views/log-report";
import { renderLogs } from "./views/logs";
import { MCP_MAX_RUNNING } from "./views/mcp-shared.js";
import { renderNetworkCenter } from "./views/network-center";
import { renderNodes } from "./views/nodes";
import { renderOverview } from "./views/overview";
import { renderPlayground } from "./views/playground";
import { renderSessions } from "./views/sessions";
import { renderSkillInstallApproval } from "./views/skill-install-approval";
import { renderSkillInstallProgress } from "./views/skill-install-progress";
import { renderSkills } from "./views/skills";
// 🎨 增强版组件（基于您的精美设计）
import { renderSkillsBatchBannerEnhanced as renderSkillsBatchBanner } from "./views/skills-batch-banner-enhanced";
import { renderSkillsBatchCompleteEnhanced as renderSkillsBatchComplete } from "./views/skills-batch-complete-enhanced";
import { renderSkillsBatchConfirmEnhanced as renderSkillsBatchConfirm } from "./views/skills-batch-confirm-enhanced";
// 保留 Pill 和 Result（暂无增强版）
import { renderSkillsBatchPill } from "./views/skills-batch-pill";
import { renderSkillsBatchProgressEnhanced as renderSkillsBatchProgress } from "./views/skills-batch-progress-enhanced";
import { renderSkillsBatchResult } from "./views/skills-batch-result";
import { renderUpdateBanner } from "./views/update-banner";
import { renderUpdateDialog } from "./views/update-dialog";
import { renderWorkspace } from "./views/workspace";

// Module-scoped set tracking which team projects are collapsed in sidebar
const _teamCollapsedProjects = new Set<string>();

const AVATAR_DATA_RE = /^data:/i;
const AVATAR_HTTP_RE = /^https?:\/\//i;
const MCP_TOAST_DURATION_MS = 4000;
const MCP_TOAST_ERROR_DURATION_MS = 12000;

/**
 * Show a toast notification for MCP install/uninstall/error actions.
 * Auto-clears after 4s (success/info) or 8s (error) for readability.
 */
function showMcpToast(
  state: AppViewState,
  message: string,
  type: "success" | "error" | "info",
): void {
  if (state._mcpToastTimer) {
    clearTimeout(state._mcpToastTimer);
  }
  state.mcpMarketplace = {
    ...state.mcpMarketplace,
    toast: { message, type, timestamp: Date.now() },
  };
  const duration = type === "error" ? MCP_TOAST_ERROR_DURATION_MS : MCP_TOAST_DURATION_MS;
  state._mcpToastTimer = window.setTimeout(() => {
    state.mcpMarketplace = { ...state.mcpMarketplace, toast: null };
    state._mcpToastTimer = null;
  }, duration);
}

function resolveAssistantAvatarUrl(state: AppViewState): string | undefined {
  const list = state.agentsList?.agents ?? [];
  const parsed = parseAgentSessionKey(state.sessionKey);
  const agentId = parsed?.agentId ?? state.agentsList?.defaultId ?? "main";
  const agent = list.find((entry) => entry.id === agentId);
  const identity = agent?.identity;
  const candidate = identity?.avatarUrl ?? identity?.avatar;
  if (!candidate) {
    return undefined;
  }
  if (AVATAR_DATA_RE.test(candidate) || AVATAR_HTTP_RE.test(candidate)) {
    return candidate;
  }
  return identity?.avatarUrl;
}

/**
 * 顶栏通知铃铛（Figma 风格，带红点 badge）
 */
function renderTopbarNotificationBell(state: AppViewState) {
  void state;
  return nothing;
}

/**
 * 顶栏用户信息框（Figma 风格：头像 + 名称 + 角色 + dropdown chevron）
 */
function _renderTopbarUserBox(state: AppViewState) {
  void state;
  const tierLabel = "Open Source";
  const userName = "用户";
  const avatarText = userName.slice(0, 1);

  return html`
    <button
      class="topbar-user-box"
      @click=${() => {
        state.requestUpdate?.();
      }}
      title="账号信息"
    >
      <span class="topbar-user-box__avatar">${avatarText}</span>
      <span class="topbar-user-box__info">
        <span class="topbar-user-box__name">${userName}</span>
        <span class="topbar-user-box__role">${tierLabel}</span>
      </span>
      <svg class="topbar-user-box__chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="m6 9 6 6 6-6"></path>
      </svg>
    </button>
  `;
}

function renderApiMonitor(state: AppViewState) {
  const isWaiting =
    state.chatRunId !== null &&
    state.chatStream !== null &&
    state.chatStream.trim().length === 0 &&
    state.chatStreamStartedAt !== null;

  const elapsed = state.apiMonitorElapsedMs;

  // Don't show if nothing to display or dismissed
  if (!isWaiting && elapsed === 0) {
    return nothing;
  }
  if (state.apiMonitorDismissed) {
    return nothing;
  }

  const seconds = Math.floor(elapsed / 1000);
  // Hide for very short waits to avoid visual noise
  if (isWaiting && seconds < 3) {
    return nothing;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  const timeStr =
    minutes > 0 ? `${minutes}:${String(remainingSeconds).padStart(2, "0")}` : `${seconds}s`;

  // Determine severity
  const level: "normal" | "warning" | "danger" =
    seconds < 10 ? "normal" : seconds < 30 ? "warning" : "danger";

  // Just completed — brief green flash
  if (!isWaiting && elapsed > 0) {
    return html`
      <div class="api-monitor api-monitor--ok" title="API responded in ${timeStr}">
        <span class="api-monitor__dot api-monitor__dot--ok"></span>
        <span class="api-monitor__time">API ${timeStr} ✓</span>
      </div>
    `;
  }

  const title =
    level === "danger"
      ? t("apiMonitor.slowWarning" as TranslationKey)
      : t("apiMonitor.waiting" as TranslationKey);

  return html`
    <div class="api-monitor api-monitor--${level}" title="${title}">
      <span class="api-monitor__dot api-monitor__dot--${level}"></span>
      <span class="api-monitor__time">${timeStr}</span>
      ${
        level === "danger"
          ? html`<span class="api-monitor__label">${t("apiMonitor.slow" as TranslationKey)}</span>`
          : nothing
      }
      ${
        seconds > 15
          ? html`<button
            class="api-monitor__dismiss"
            @click=${(e: Event) => {
              e.stopPropagation();
              state.apiMonitorDismissed = true;
            }}
            title="${t("apiMonitor.dismiss" as TranslationKey)}"
          >&times;</button>`
          : nothing
      }
    </div>
  `;
}

/**
 * [CN-FIX:session-key-prefix] Normalize a session key to the canonical
 * `agent:<agentId>:<key>` format that the gateway uses internally.
 * Without this, a plain UUID sent by the client won't match the
 * `agent:main:UUID` broadcast by the gateway, causing events to be dropped.
 */
function normalizeSessionKey(state: AppViewState, key: string): string {
  if (!key || key.startsWith("agent:") || key === "global" || key === "unknown") {
    return key;
  }
  const snapshot = state.hello?.snapshot as
    | { sessionDefaults?: { defaultAgentId?: string } }
    | undefined;
  const agentId = snapshot?.sessionDefaults?.defaultAgentId || "main";
  return `agent:${agentId}:${key}`;
}

/** Reset chat state and switch to a new session key. */
function switchSession(state: AppViewState, key: string) {
  // Abort the current chat run (if any) before switching — fire-and-forget so
  // the UI switches instantly while the backend tears down the old run.
  // [CN-FIX:media-gen-switch] Skip abort when a media generation tool (image_gen /
  // video_gen) is actively running. Aborting mid-generation causes the agent to
  // stop before persisting the final assistant message, so when the user switches
  // back the entire conversation appears lost. By letting the run complete in the
  // background, the server persists both the user message and the generated result
  // to the transcript; loadChatHistory will recover them on return.
  if (state.chatRunId && !state.chatMediaToolActive) {
    void state.handleAbortChat();
  }

  const normalizedKey = normalizeSessionKey(state, key);
  state.sessionKey = normalizedKey;
  state.chatMessage = "";
  state.chatAttachments = [];
  state.chatStream = null;
  state.chatStreamStartedAt = null;
  state.chatRunId = null;
  state.chatQueue = [];
  state.chatMediaToolActive = null;
  // Clear stale assets for the new session
  state.convSidebarAssets = [];
  state.convSidebarAssetsSessionKey = "";
  state.resetToolStream();
  state.resetChatScroll();
  state.applySettings({
    ...state.settings,
    sessionKey: normalizedKey,
    lastActiveSessionKey: normalizedKey,
  });
  void state.loadAssistantIdentity();
  void loadChatHistory(state);
  void refreshChatAvatar(state);
  void loadSidebarAssets(state);
}

/** Load assets (images/videos) for the conversation sidebar's "资源" tab. */
async function loadSidebarAssets(state: AppViewState) {
  if (!state.client || !state.connected || !state.sessionKey) {
    return;
  }
  if (state.convSidebarAssetsLoading) {
    return;
  }
  // Skip re-fetch if already loaded for this session
  if (state.convSidebarAssetsSessionKey === state.sessionKey) {
    return;
  }
  state.convSidebarAssetsLoading = true;
  state.requestUpdate();
  try {
    const res = await state.client.request("media.list", {
      sessionKey: state.sessionKey,
    });
    state.convSidebarAssets = res?.assets ?? [];
    state.convSidebarAssetsSessionKey = state.sessionKey;
  } catch {
    state.convSidebarAssets = [];
  } finally {
    state.convSidebarAssetsLoading = false;
    state.requestUpdate();
  }
}

export function renderApp(state: AppViewState) {
  const presenceCount = state.presenceEntries.length;
  const sessionsCount = state.sessionsResult?.count ?? null;
  const cronNext = state.cronStatus?.nextWakeAtMs ?? null;
  // First startup (hello===null): suppress error/disconnect messages — show loading instead.
  // Only show disconnected message after a successful connection was later lost.
  const isFirstStartup = !state.connected && !state.hello;
  const chatDisabledReason = state.connected
    ? null
    : isFirstStartup
      ? null
      : t("connection.disconnectedFromGateway");
  // [CN-FIX:dup-disconnect] When disconnected, disabledReason already shows a friendly
  // banner.  Suppress the raw "disconnected (code): reason" from lastError so users
  // see exactly one message instead of three redundant ones.
  const isDisconnectError = !state.connected && /^disconnected\s*\(/i.test(state.lastError ?? "");
  const chatError = isFirstStartup || isDisconnectError ? null : state.lastError;
  const isChat = state.tab === "chat";
  const chatFocus = isChat && (state.settings.chatFocusMode || state.onboarding);
  const showThinking = state.onboarding ? false : state.settings.chatShowThinking;
  const assistantAvatarUrl = resolveAssistantAvatarUrl(state);
  const chatAvatarUrl = state.chatAvatarUrl ?? assistantAvatarUrl ?? null;
  const configValue =
    state.configForm ?? (state.configSnapshot?.config as Record<string, unknown> | null);
  const resolvedAgentId =
    state.agentsSelectedId ??
    state.agentsList?.defaultId ??
    state.agentsList?.agents?.[0]?.id ??
    null;

  return html`
    <div class="shell ${isChat ? "shell--chat" : ""} ${chatFocus ? "shell--chat-focus" : ""} ${state.settings.navCollapsed ? "shell--nav-collapsed" : ""} ${state.onboarding ? "shell--onboarding" : ""}">
      <header class="topbar">
        <div class="topbar-left">
          <button
            class="nav-collapse-toggle"
            @click=${() =>
              state.applySettings({
                ...state.settings,
                navCollapsed: !state.settings.navCollapsed,
              })}
            title="${state.settings.navCollapsed ? "Expand sidebar" : "Collapse sidebar"}"
            aria-label="${state.settings.navCollapsed ? "Expand sidebar" : "Collapse sidebar"}"
          >
            <span class="nav-collapse-toggle__icon">${icons.menu}</span>
          </button>
          <div class="brand">
            <div class="brand-logo ${brand.logoPath.includes('/oem/') ? 'brand-logo--oem' : ''}">
              <img src="${brand.logoPath}" alt="${brand.logoAlt}" />
            </div>
            <div class="brand-text">
              <div class="brand-title">${brand.productName}</div>
            </div>
          </div>
        </div>
        <div class="topbar-status">
          ${renderApiMonitor(state)}
          ${nothing /* renderTopbarSupportButtons — hidden by design */}
          ${nothing /* topbar-online-status moved to chat-controls area */}
          ${renderTopbarNotificationBell(state)}
          ${nothing /* renderThemeToggle — hidden by design */}
          ${nothing /* renderTopbarUserBox — hidden by design */}
        </div>
      </header>
      <aside class="nav ${state.settings.navCollapsed ? "nav--collapsed" : ""}">
        <div class="nav-main">
          ${getMainTabs().map((tab) => renderTab(state, tab))}
        </div>
        ${(() => {
          const moreTabs = getMoreTabs();
          const isMoreCollapsed = state.settings.navGroupsCollapsed["More"] ?? true;
          const showExpanded = !isMoreCollapsed;
          const collapseMore = () => {
            state.applySettings({
              ...state.settings,
              navGroupsCollapsed: { ...state.settings.navGroupsCollapsed, More: true },
            });
          };
          return html`
          ${showExpanded ? html`<div class="nav-more__backdrop" @click=${collapseMore}></div>` : nothing}
          <div class="nav-more ${showExpanded ? "nav-more--expanded" : ""}">
            ${
              showExpanded
                ? html`
            <div class="nav-more__items">
              ${moreTabs.map((tab) => renderTab(state, tab))}
              ${renderTab(state, "feedback")}
              ${renderTab(state, "docs")}
            </div>
            `
                : nothing
            }
            <button
              class="nav-more__toggle"
              @click=${() => {
                const next = { ...state.settings.navGroupsCollapsed };
                next["More"] = !isMoreCollapsed;
                state.applySettings({
                  ...state.settings,
                  navGroupsCollapsed: next,
                });
              }}
              aria-expanded=${showExpanded}
            >
              <span class="nav-more__icon">${icons.moreHorizontal}</span>
              <span class="nav-more__text">${t("nav.more")}</span>
              <span class="nav-more__chevron">${showExpanded ? "−" : "+"}</span>
            </button>
          </div>
          `;
        })()}
        ${
          brand.promoUrl
            ? html`
        <div class="nav-footer">
          <a href="${brand.promoUrl}" target="_blank" rel="noreferrer" class="nav-footer-link">
            <span class="nav-footer-icon">🚀</span>
            <span class="nav-footer-text">
              <span class="nav-footer-title">${brand.promoName}</span>
              <span class="nav-footer-desc">${brand.promoDesc}</span>
            </span>
          </a>
        </div>
        `
            : nothing
        }
      </aside>
      <main class="content ${isChat ? "content--chat" : ""} ${(MORE_TABS as readonly string[]).includes(state.tab) || state.tab === "docs" || state.tab === "feedback" ? "content--more" : ""} ${state.tab === "skills" ? "content--skills" : ""} ${state.tab === "extensions" ? "content--extensions" : ""} ${state.tab === "agents" ? "content--agents" : ""} ${state.tab === "channels" ? "content--channels" : ""} ${state.tab === "model-config" ? "content--model-config" : ""} ${state.tab === "cron" ? "content--cron" : ""} ${state.tab === "config" ? "content--config" : ""}">
        ${
          state.tab !== "usage"
            ? html`
        ${
          isChat ||
          state.tab === "agents" ||
          state.tab === "model-config" ||
          state.tab === "channels" ||
          (MORE_TABS as readonly string[]).includes(state.tab) ||
          state.tab === "docs" ||
          state.tab === "feedback"
            ? nothing
            : html`
        <section class="content-header">
          <div>
            <div class="page-title">${titleForTab(state.tab)}</div>
            <div class="page-sub">${subtitleForTab(state.tab)}</div>
          </div>
          <div class="page-meta">
            ${state.lastError && !isDisconnectError ? html`<div class="pill danger">${state.lastError}</div>` : nothing}
          </div>
        </section>
        `
        }
        `
            : nothing
        }

        ${
          state.tab === "overview"
            ? renderOverview({
                connected: state.connected,
                hello: state.hello,
                settings: state.settings,
                password: state.password,
                lastError: state.lastError,
                presenceCount,
                sessionsCount,
                cronEnabled: state.cronStatus?.enabled ?? null,
                cronNext,
                lastChannelsRefresh: state.channelsLastSuccess,
                usageLoading: state.usageLoading,
                usageSummary: state.usageSummary,
                usageError: state.usageError,
                // 模型选择相关
                modelsLoading: state.modelsLoading,
                modelsProviders: state.modelsProviders,
                modelsDefaults: state.modelsDefaults,
                modelsCurrent: state.modelsCurrent,
                modelsSaving: state.modelsSaving,
                modelsError: state.modelsError,
                modelsSuccessMessage: state.modelsSuccessMessage,
                modelsAuthSaving: state.modelsAuthSaving,
                modelsConfiguringProvider: state.modelsConfiguringProvider,
                modelsAuthVerifying: state.modelsAuthVerifying,
                modelsAuthVerifyResult: state.modelsAuthVerifyResult,
                // 安全模式相关
                securityLoading: state.securityLoading,
                securityModes: state.securityModes,
                securityCurrent: state.securityCurrent,
                securitySaving: state.securitySaving,
                securityError: state.securityError,
                securityShowWarning: state.securityShowWarning,
                securitySuccessMessage: state.securitySuccessMessage,
                onSettingsChange: (next) => state.applySettings(next),
                onPasswordChange: (next) => (state.password = next),
                onSessionKeyChange: (next) => switchSession(state, next),
                onConnect: () => state.connect(),
                onRefresh: () => state.loadOverview(),
                onNavigateToUsage: () => state.setTab("usage" as Tab),
                onModelChange: (provider: string, model: string) =>
                  state.setModelPrimary(provider, model),
                modelsPendingProvider: state.modelsPendingProvider,
                modelsPendingModel: state.modelsPendingModel,
                onModelPendingChange: (provider, model) => state.setModelPending(provider, model),
                onModelPendingCancel: () => state.cancelModelPending(),
                onModelPendingConfirm: () => state.confirmModelPending(),
                onNavigateToConfig: () => state.setTab("config" as Tab),
                onSetConfiguringProvider: (providerId) => state.setConfiguringProvider(providerId),
                onSaveProviderAuth: (provider, auth) => state.saveProviderAuth(provider, auth),
                onVerifyApiKey: (provider, apiKey, model) =>
                  state.verifyProviderApiKey(provider, apiKey, model),
                onClearVerifyResult: () => state.clearAuthVerifyResult(),
                // 安全模式回调
                onSecurityModeChange: (mode) => state.setSecurityMode(mode),
                onCloseSecurityWarning: () => state.closeSecurityWarning(),
                onConfirmSecurityTrust: () => state.confirmSecurityTrustMode(),
              })
            : nothing
        }

        ${renderUsageTab(state)}

        ${
          state.tab === "channels"
            ? renderChannels({
                connected: state.connected,
                loading: state.channelsLoading,
                snapshot: state.channelsSnapshot,
                lastError: state.channelsError,
                lastSuccessAt: state.channelsLastSuccess,
                whatsappMessage: state.whatsappLoginMessage,
                whatsappQrDataUrl: state.whatsappLoginQrDataUrl,
                whatsappConnected: state.whatsappLoginConnected,
                whatsappBusy: state.whatsappBusy,
                configSchema: state.configSchema,
                configSchemaLoading: state.configSchemaLoading,
                configForm: state.configForm,
                configUiHints: state.configUiHints,
                configSaving: state.configSaving,
                configFormDirty: state.configFormDirty,
                configLastError: state.lastError,
                nostrProfileFormState: state.nostrProfileFormState,
                nostrProfileAccountId: state.nostrProfileAccountId,
                routeSummary: state.channelRouteSummary,
                routeProjects: state.channelRouteProjects,
                routeAgents: state.channelRouteAgents,
                routeSaving: state.channelRouteSaving,
                routeSavedHint: state.channelRouteSavedHint,
                onRefresh: (probe) => loadChannels(state, probe),
                onWhatsAppStart: (force) => state.handleWhatsAppStart(force),
                onWhatsAppWait: () => state.handleWhatsAppWait(),
                onWhatsAppLogout: () => state.handleWhatsAppLogout(),
                onConfigPatch: (path, value) => updateConfigFormValue(state, path, value),
                onConfigSave: () => state.handleChannelConfigSave(),
                onConfigReload: () => state.handleChannelConfigReload(),
                onNostrProfileEdit: (accountId, profile) =>
                  state.handleNostrProfileEdit(accountId, profile),
                onNostrProfileCancel: () => state.handleNostrProfileCancel(),
                onNostrProfileFieldChange: (field, value) =>
                  state.handleNostrProfileFieldChange(field, value),
                onNostrProfileSave: () => state.handleNostrProfileSave(),
                onNostrProfileImport: () => state.handleNostrProfileImport(),
                onNostrProfileToggleAdvanced: () => state.handleNostrProfileToggleAdvanced(),
                onRouteChange: (channel, accountId, targetId, targetType) =>
                  updateChannelRoute(state, channel, accountId, targetId, targetType),
                onDeleteBot: (channelId, accountId) => {
                  if (window.confirm(t("channels.detail.deleteConfirm"))) {
                    void state.handleDeleteBot(channelId, accountId);
                  }
                },
                deletingBotId: state.channelDeletingBotId ?? null,
                channelsSelectedKey: state.channelsSelectedKey ?? null,
                onSelectChannel: (key) => {
                  state.channelsSelectedKey = key;
                  state.requestUpdate();
                },
                channelsWizardOpen: state.channelsWizardOpen ?? false,
                channelsWizardAccountId: state.channelsWizardAccountId ?? null,
                channelsWizardIsNew: state.channelsWizardIsNew ?? false,
                onWizardOpen: (accountId) => {
                  state.channelsWizardOpen = true;
                  if (accountId) {
                    // Edit existing bot
                    state.channelsWizardAccountId = accountId;
                    state.channelsWizardIsNew = false;
                  } else {
                    // Add new bot
                    const channelId = state.channelsSelectedKey;
                    const existingAccounts =
                      state.channelsSnapshot?.channelAccounts?.[channelId ?? ""] ?? [];
                    if (
                      existingAccounts.length === 0 ||
                      (existingAccounts.length === 1 && !existingAccounts[0]?.configured)
                    ) {
                      // First bot → use default, write to top-level
                      state.channelsWizardAccountId = null;
                      state.channelsWizardIsNew = true;
                    } else {
                      // Additional bot → generate incremental ID
                      const existingIds = new Set(existingAccounts.map((a) => a.accountId));
                      let counter = 2;
                      while (existingIds.has(`bot-${counter}`)) {
                        counter++;
                      }
                      state.channelsWizardAccountId = `bot-${counter}`;
                      state.channelsWizardIsNew = true;

                      // Migrate first bot from top-level to accounts.default
                      // when it was stored at channels.{channelId}.{appId,...}
                      // instead of channels.{channelId}.accounts.default.{appId,...}
                      if (channelId) {
                        const cfg = (state.configForm ?? state.configSnapshot?.config ?? {}) as Record<string, any>;
                        const cc = cfg?.channels?.[channelId];
                        if (cc && typeof cc === "object" && cc.appId && !cc.accounts?.["default"]) {
                          // First bot has top-level credentials but no accounts.default entry.
                          // Filter out redacted sentinel values — account inherits real secrets
                          // from the top-level config via mergeFeishuAccountConfig().
                          const REDACTED = "__OPENCLAW_REDACTED__";
                          const SKIP_KEYS = new Set(["accounts", "enabled", "defaultAccount"]);
                          const firstBotFields: Record<string, unknown> = {};
                          for (const [k, v] of Object.entries(cc)) {
                            if (SKIP_KEYS.has(k)) continue;
                            if (v === REDACTED) continue;
                            if (typeof v === "object" && v !== null && (v as any).resolved === REDACTED) continue;
                            firstBotFields[k] = v;
                          }
                          const accts = cc.accounts && typeof cc.accounts === "object" ? { ...cc.accounts } : {};
                          accts["default"] = firstBotFields;
                          updateConfigFormValue(state, ["channels", channelId, "accounts"], accts);
                        }
                      }
                    }
                  }
                  state.requestUpdate();
                },
                onWizardClose: () => {
                  state.channelsWizardOpen = false;
                  state.channelsWizardAccountId = null;
                  state.channelsWizardIsNew = false;
                  // Reload config to discard unsaved wizard edits and reset dirty state
                  if (state.configFormDirty) {
                    void state.handleChannelConfigReload();
                  }
                  state.requestUpdate();
                },
              })
            : nothing
        }

        ${
          state.tab === "instances"
            ? renderInstances({
                loading: state.presenceLoading,
                entries: state.presenceEntries,
                lastError: state.presenceError,
                statusMessage: state.presenceStatus,
                onRefresh: () => loadPresence(state),
              })
            : nothing
        }

        ${
          state.tab === "sessions"
            ? renderSessions({
                loading: state.sessionsLoading,
                result: state.sessionsResult,
                error: state.sessionsError,
                activeMinutes: state.sessionsFilterActive,
                limit: state.sessionsFilterLimit,
                includeGlobal: state.sessionsIncludeGlobal,
                includeUnknown: state.sessionsIncludeUnknown,
                basePath: state.basePath,
                highlightKey: state.sessionsHighlightKey,
                searchQuery: state.sessionsSearchQuery,
                onFiltersChange: (next) => {
                  state.sessionsFilterActive = next.activeMinutes;
                  state.sessionsFilterLimit = next.limit;
                  state.sessionsIncludeGlobal = next.includeGlobal;
                  state.sessionsIncludeUnknown = next.includeUnknown;
                },
                onSearchChange: (query) => {
                  state.sessionsSearchQuery = query;
                },
                onRefresh: () => loadSessions(state),
                onPatch: (key, patch) => patchSession(state, key, patch),
                onDelete: (key) => deleteSession(state, key),
              })
            : nothing
        }

        ${
          state.tab === "cron"
            ? renderCron({
                loading: state.cronLoading,
                status: state.cronStatus,
                jobs: state.cronJobs,
                error: state.cronError,
                busy: state.cronBusy,
                form: state.cronForm,
                channels: state.channelsSnapshot?.channelMeta?.length
                  ? state.channelsSnapshot.channelMeta.map((entry) => entry.id)
                  : (state.channelsSnapshot?.channelOrder ?? []),
                channelLabels: state.channelsSnapshot?.channelLabels ?? {},
                channelMeta: state.channelsSnapshot?.channelMeta ?? [],
                runsJobId: state.cronRunsJobId,
                runs: state.cronRuns,
                onFormChange: (patch) => (state.cronForm = { ...state.cronForm, ...patch }),
                onRefresh: () => state.loadCron(),
                onAdd: () => addCronJob(state),
                onToggle: (job, enabled) => toggleCronJob(state, job, enabled),
                onRun: (job) => runCronJob(state, job),
                onRemove: (job) => removeCronJob(state, job),
                onLoadRuns: (jobId) => loadCronRuns(state, jobId),
              })
            : nothing
        }

        ${
          state.tab === "playground"
            ? renderPlayground({
                loading: state.playgroundLoading ?? false,
                report: state.playgroundReport ?? null,
                error: state.playgroundError ?? null,
                activeCategory: state.playgroundActiveCategory ?? null,
                filter: state.playgroundFilter ?? "",
                onFilterChange: (next) => (state.playgroundFilter = next),
                installingSkill: state.playgroundInstallingSkill ?? null,
                installMessage: state.playgroundInstallMessage ?? null,
                onCategoryChange: (category) => setPlaygroundCategory(state, category),
                onTrySkill: (skillName, example) => {
                  handleTrySkill(
                    (tab) => state.setTab(tab),
                    (msg) => (state.chatMessage = msg),
                    skillName,
                    example,
                  );
                },
                onInstallSkill: (skill) => {
                  void installSkillDeps(state, skill);
                },
                onRefresh: () => loadPlaygroundSkills(state),
                onGoToSkills: () => state.setTab("skills" as never),
              })
            : nothing
        }

        ${
          state.tab === "agents"
            ? renderAgents({
                loading: state.agentsLoading,
                error: state.agentsError,
                agentsList: state.agentsList,
                selectedAgentId: resolvedAgentId,
                activePanel: state.agentsPanel,
                configForm: configValue,
                configLoading: state.configLoading,
                configSaving: state.configSaving,
                configDirty: state.configFormDirty,
                channelsLoading: state.channelsLoading,
                channelsError: state.channelsError,
                channelsSnapshot: state.channelsSnapshot,
                channelsLastSuccess: state.channelsLastSuccess,
                channelRouteSummary: state.channelRouteSummary,
                cronLoading: state.cronLoading,
                cronStatus: state.cronStatus,
                cronJobs: state.cronJobs,
                cronError: state.cronError,
                agentFilesLoading: state.agentFilesLoading,
                agentFilesError: state.agentFilesError,
                agentFilesList: state.agentFilesList,
                agentFileActive: state.agentFileActive,
                agentFileContents: state.agentFileContents,
                agentFileDrafts: state.agentFileDrafts,
                agentFileSaving: state.agentFileSaving,
                agentOutputsLoading: state.agentOutputsLoading,
                agentOutputsError: state.agentOutputsError,
                agentOutputsList: state.agentOutputsList,
                agentOutputActive: state.agentOutputActive,
                agentOutputContent: state.agentOutputContent,
                agentOutputContentLoading: state.agentOutputContentLoading,
                onLoadOutputs: (agentId: string) => loadAgentOutputs(state as never, agentId),
                onSelectOutput: (agentId: string, filePath: string, relativeName: string) =>
                  loadAgentOutputContent(state as never, agentId, filePath, relativeName),
                agentIdentityLoading: state.agentIdentityLoading,
                agentIdentityError: state.agentIdentityError,
                agentIdentityById: state.agentIdentityById,
                agentSkillsLoading: state.agentSkillsLoading,
                agentSkillsReport: state.agentSkillsReport,
                agentSkillsError: state.agentSkillsError,
                agentSkillsAgentId: state.agentSkillsAgentId,
                skillsFilter: state.skillsFilter,
                dmScopeStatus: state.dmScopeStatus,
                onDmScopeApply: () => {
                  if (!state.dmScopeStatus?.recommended) {
                    return;
                  }
                  const recommended = state.dmScopeStatus.recommended;
                  void (async () => {
                    try {
                      updateConfigFormValue(state, ["session", "dmScope"], recommended);
                      await saveConfig(state);
                      void loadDmScopeStatus(state);
                    } catch {
                      /* best-effort */
                    }
                  })();
                },
                agentCreating: state.agentCreating,
                agentCreateError: state.agentCreateError,
                agentCreateSuccess: state.agentCreateSuccess,
                agentDeleting: state.agentDeleting,
                agentDeleteError: state.agentDeleteError,
                onOpenWizard: () => {
                  state.agentWizard = createWizardInitialState();
                  state.agentWizard.open = true;
                  state.requestUpdate();
                },
                onRefresh: async () => {
                  await loadAgents(state);
                  const agentIds = state.agentsList?.agents?.map((entry) => entry.id) ?? [];
                  if (agentIds.length > 0) {
                    void loadAgentIdentities(state, agentIds);
                  }
                  void loadDmScopeStatus(state);
                  void loadTeamProjects(state as never, true);
                },
                onSelectAgent: (agentId) => {
                  if (state.agentsSelectedId === agentId && !state.teamProjectSelectedId) {
                    return;
                  }
                  state.agentsSelectedId = agentId;
                  state.teamProjectSelectedId = null; // Switch to agent view
                  // Capture panel before guard so control-flow narrowing doesn't suppress chat/outputs branches below
                  const prevPanel = state.agentsPanel;
                  // Guard: fall back to overview if current panel can't render without chat init
                  if (prevPanel === "chat" || prevPanel === "outputs") {
                    state.agentsPanel = "overview";
                  }
                  stopProjectHealthPoll();
                  state.agentCreateSuccess = false;
                  state.agentDeleteError = null;
                  state.agentFilesList = null;
                  state.agentFilesError = null;
                  state.agentFilesLoading = false;
                  state.agentFileActive = null;
                  state.agentFileContents = {};
                  state.agentFileDrafts = {};
                  state.agentSkillsReport = null;
                  state.agentSkillsError = null;
                  state.agentSkillsAgentId = null;
                  // Reset outputs state
                  state.agentOutputsList = null;
                  state.agentOutputsError = null;
                  state.agentOutputActive = null;
                  state.agentOutputContent = null;
                  void loadAgentIdentity(state, agentId);
                  if (prevPanel === "outputs") {
                    void loadAgentOutputs(state as never, agentId);
                  }
                  if (prevPanel === "files") {
                    void loadAgentFiles(state, agentId);
                  }
                  if (prevPanel === "skills") {
                    void loadAgentSkills(state, agentId);
                  }
                  if (prevPanel === "chat") {
                    resetAgentChatState(state as never, `agent:${agentId}:main`);
                    void loadAgentChatHistory(state as never);
                  }
                },
                onSelectPanel: (panel) => {
                  state.agentsPanel = panel;
                  if (panel === "files" && resolvedAgentId) {
                    if (state.agentFilesList?.agentId !== resolvedAgentId) {
                      state.agentFilesList = null;
                      state.agentFilesError = null;
                      state.agentFileActive = null;
                      state.agentFileContents = {};
                      state.agentFileDrafts = {};
                      void loadAgentFiles(state, resolvedAgentId);
                    }
                  }
                  if (panel === "outputs" && resolvedAgentId) {
                    if (state.agentOutputsList?.agentId !== resolvedAgentId) {
                      state.agentOutputsList = null;
                      state.agentOutputsError = null;
                      state.agentOutputActive = null;
                      state.agentOutputContent = null;
                      void loadAgentOutputs(state as never, resolvedAgentId);
                    }
                  }
                  if (panel === "skills" && resolvedAgentId) {
                    void loadAgentSkills(state, resolvedAgentId);
                  }
                  if (panel === "channels") {
                    void loadChannels(state, false);
                  }
                  if (panel === "cron") {
                    void state.loadCron();
                  }
                  if (panel === "chat" && resolvedAgentId) {
                    const key = `agent:${resolvedAgentId}:main`;
                    if (state.agentChatSessionKey !== key) {
                      resetAgentChatState(state as never, key);
                    }
                    void loadAgentChatHistory(state as never);
                  }
                },
                onLoadFiles: (agentId) => loadAgentFiles(state, agentId),
                onSelectFile: (name) => {
                  state.agentFileActive = name;
                  if (resolvedAgentId) {
                    void loadAgentFileContent(state, resolvedAgentId, name);
                  }
                },
                onFileDraftChange: (name, content) => {
                  state.agentFileDrafts = { ...state.agentFileDrafts, [name]: content };
                },
                onFileReset: (name) => {
                  state.agentFileDrafts = {
                    ...state.agentFileDrafts,
                    [name]: state.agentFileContents[name] ?? "",
                  };
                },
                onFileSave: (name) => {
                  if (!resolvedAgentId) {
                    return;
                  }
                  void saveAgentFile(
                    state,
                    resolvedAgentId,
                    name,
                    state.agentFileDrafts[name] ?? state.agentFileContents[name] ?? "",
                  );
                },
                onToolsProfileChange: (agentId, profile, clearAllow) => {
                  if (!configValue) {
                    return;
                  }
                  const list = (configValue as { agents?: { list?: unknown[] } }).agents?.list;
                  if (!Array.isArray(list)) {
                    return;
                  }
                  const index = list.findIndex(
                    (e) =>
                      e &&
                      typeof e === "object" &&
                      "id" in e &&
                      (e as { id?: string }).id === agentId,
                  );
                  if (index < 0) {
                    return;
                  }
                  const bp = ["agents", "list", index, "tools"];
                  if (profile) {
                    updateConfigFormValue(state, [...bp, "profile"], profile);
                  } else {
                    removeConfigFormValue(state, [...bp, "profile"]);
                  }
                  if (clearAllow) {
                    removeConfigFormValue(state, [...bp, "allow"]);
                  }
                },
                onToolsOverridesChange: (agentId, alsoAllow, deny) => {
                  if (!configValue) {
                    return;
                  }
                  const list = (configValue as { agents?: { list?: unknown[] } }).agents?.list;
                  if (!Array.isArray(list)) {
                    return;
                  }
                  const index = list.findIndex(
                    (e) =>
                      e &&
                      typeof e === "object" &&
                      "id" in e &&
                      (e as { id?: string }).id === agentId,
                  );
                  if (index < 0) {
                    return;
                  }
                  const bp = ["agents", "list", index, "tools"];
                  if (alsoAllow.length > 0) {
                    updateConfigFormValue(state, [...bp, "alsoAllow"], alsoAllow);
                  } else {
                    removeConfigFormValue(state, [...bp, "alsoAllow"]);
                  }
                  if (deny.length > 0) {
                    updateConfigFormValue(state, [...bp, "deny"], deny);
                  } else {
                    removeConfigFormValue(state, [...bp, "deny"]);
                  }
                },
                onConfigReload: () => loadConfig(state),
                onConfigSave: () => saveConfig(state),
                onChannelsRefresh: () => loadChannels(state, false),
                onCronRefresh: () => state.loadCron(),
                onSkillsFilterChange: (next) => {
                  state.skillsFilter = next;
                },
                onSkillsRefresh: () => {
                  if (resolvedAgentId) {
                    void loadAgentSkills(state, resolvedAgentId);
                  }
                },
                onAgentSkillToggle: (agentId, skillName, enabled) => {
                  if (!configValue) {
                    return;
                  }
                  const list = (configValue as { agents?: { list?: unknown[] } }).agents?.list;
                  if (!Array.isArray(list)) {
                    return;
                  }
                  const index = list.findIndex(
                    (e) =>
                      e &&
                      typeof e === "object" &&
                      "id" in e &&
                      (e as { id?: string }).id === agentId,
                  );
                  if (index < 0) {
                    return;
                  }
                  const entry = list[index] as { skills?: unknown };
                  const ns = skillName.trim();
                  if (!ns) {
                    return;
                  }
                  const allSkills =
                    state.agentSkillsReport?.skills?.map((s) => s.name).filter(Boolean) ?? [];
                  const existing = Array.isArray(entry.skills)
                    ? entry.skills.map((n) => String(n).trim()).filter(Boolean)
                    : undefined;
                  const base = existing ?? allSkills;
                  const next = new Set(base);
                  if (enabled) {
                    next.add(ns);
                  } else {
                    next.delete(ns);
                  }
                  updateConfigFormValue(state, ["agents", "list", index, "skills"], [...next]);
                },
                onAgentSkillsClear: (agentId) => {
                  if (!configValue) {
                    return;
                  }
                  const list = (configValue as { agents?: { list?: unknown[] } }).agents?.list;
                  if (!Array.isArray(list)) {
                    return;
                  }
                  const index = list.findIndex(
                    (e) =>
                      e &&
                      typeof e === "object" &&
                      "id" in e &&
                      (e as { id?: string }).id === agentId,
                  );
                  if (index < 0) {
                    return;
                  }
                  removeConfigFormValue(state, ["agents", "list", index, "skills"]);
                },
                onAgentSkillsDisableAll: (agentId) => {
                  if (!configValue) {
                    return;
                  }
                  const list = (configValue as { agents?: { list?: unknown[] } }).agents?.list;
                  if (!Array.isArray(list)) {
                    return;
                  }
                  const index = list.findIndex(
                    (e) =>
                      e &&
                      typeof e === "object" &&
                      "id" in e &&
                      (e as { id?: string }).id === agentId,
                  );
                  if (index < 0) {
                    return;
                  }
                  updateConfigFormValue(state, ["agents", "list", index, "skills"], []);
                },
                onModelChange: (agentId, modelId) => {
                  if (!configValue) {
                    return;
                  }
                  const list = (configValue as { agents?: { list?: unknown[] } }).agents?.list;
                  if (!Array.isArray(list)) {
                    return;
                  }
                  const index = list.findIndex(
                    (e) =>
                      e &&
                      typeof e === "object" &&
                      "id" in e &&
                      (e as { id?: string }).id === agentId,
                  );
                  if (index < 0) {
                    return;
                  }
                  const bp = ["agents", "list", index, "model"];
                  if (!modelId) {
                    removeConfigFormValue(state, bp);
                    return;
                  }
                  const entry = list[index] as { model?: unknown };
                  const existing = entry?.model;
                  if (existing && typeof existing === "object" && !Array.isArray(existing)) {
                    const fb = (existing as { fallbacks?: unknown }).fallbacks;
                    updateConfigFormValue(state, bp, {
                      primary: modelId,
                      ...(Array.isArray(fb) ? { fallbacks: fb } : {}),
                    });
                  } else {
                    updateConfigFormValue(state, bp, modelId);
                  }
                },
                onModelFallbacksChange: (agentId, fallbacks) => {
                  if (!configValue) {
                    return;
                  }
                  const list = (configValue as { agents?: { list?: unknown[] } }).agents?.list;
                  if (!Array.isArray(list)) {
                    return;
                  }
                  const index = list.findIndex(
                    (e) =>
                      e &&
                      typeof e === "object" &&
                      "id" in e &&
                      (e as { id?: string }).id === agentId,
                  );
                  if (index < 0) {
                    return;
                  }
                  const bp = ["agents", "list", index, "model"];
                  const entry = list[index] as { model?: unknown };
                  const normalized = fallbacks.map((n) => n.trim()).filter(Boolean);
                  const existing = entry.model;
                  const resolvePrimary = () => {
                    if (typeof existing === "string") {
                      return existing.trim() || null;
                    }
                    if (existing && typeof existing === "object" && !Array.isArray(existing)) {
                      const p = (existing as { primary?: unknown }).primary;
                      return typeof p === "string" ? p.trim() || null : null;
                    }
                    return null;
                  };
                  const primary = resolvePrimary();
                  if (normalized.length === 0) {
                    if (primary) {
                      updateConfigFormValue(state, bp, primary);
                    } else {
                      removeConfigFormValue(state, bp);
                    }
                    return;
                  }
                  updateConfigFormValue(
                    state,
                    bp,
                    primary ? { primary, fallbacks: normalized } : { fallbacks: normalized },
                  );
                },
                onDeleteAgent: async (agentId: string) => {
                  await deleteAgent(state, { agentId });
                  const agentIds = state.agentsList?.agents?.map((entry) => entry.id) ?? [];
                  if (agentIds.length > 0) {
                    void loadAgentIdentities(state, agentIds);
                  }
                },
                onStartChat: (agentId: string) => {
                  resetAgentChatState(state as never, `agent:${agentId}:main`);
                  state.agentsPanel = "chat";
                  void loadAgentChatHistory(state as never);
                },
                agentChatProps: state.agentChatSessionKey
                  ? {
                      connected: state.connected,
                      loading: state.agentChatLoading,
                      messages: state.agentChatMessages,
                      stream: state.agentChatStream,
                      streamStartedAt: state.agentChatStreamStartedAt,
                      sending: state.agentChatSending,
                      runId: state.agentChatRunId,
                      draft: state.agentChatMessage,
                      attachments: state.agentChatAttachments,
                      error: state.agentChatError,
                      onDraftChange: (next: string) => {
                        state.agentChatMessage = next;
                      },
                      onSend: () => {
                        const msg = state.agentChatMessage.trim();
                        const atts = [...state.agentChatAttachments];
                        state.agentChatMessage = "";
                        state.agentChatAttachments = [];
                        if (msg || atts.length > 0) {
                          void sendAgentChatMessage(state as never, msg, atts);
                        }
                      },
                      onAbort: () => {
                        void abortAgentChatRun(state as never);
                      },
                      onAttachmentsChange: (atts) => {
                        state.agentChatAttachments = atts;
                      },
                      onPaste: (e: ClipboardEvent) => {
                        // Reuse paste handler from compose-card
                        void handleComposePaste(e, state.agentChatAttachments, (next) => {
                          state.agentChatAttachments = next;
                        });
                      },
                      onScroll: (e: Event) => {
                        state.handleAgentChatScroll(e);
                      },
                    }
                  : null,
                // Team Projects
                teamProjects: state.teamProjectsList,
                teamProjectSelectedId: state.teamProjectSelectedId,
                teamProjectDetail: state.teamProjectDetail,
                teamProjectDetailLoading: state.teamProjectDetailLoading,
                teamProjectHealth: state.teamProjectHealth,
                teamProjectStats: state.teamProjectStats,
                teamProjectMemory: state.teamProjectMemory,
                teamProjectActivity: state.teamProjectActivity,
                teamProjectFiles: state.teamProjectFiles,
                teamProjectTab: state.teamProjectTab,
                teamProjectBusy: state.teamProjectBusy,
                teamCollapsedProjects: _teamCollapsedProjects,
                onSelectProject: (projectId: string) => {
                  state.agentsSelectedId = null;
                  void selectProject(state as never, projectId);
                },
                onSelectProjectTab: (tab) => {
                  state.teamProjectTab = tab;
                  const pid = state.teamProjectSelectedId;
                  if (!pid) {
                    return;
                  }
                  if (tab === "stats" && !state.teamProjectStats) {
                    void loadProjectStats(state as never, pid);
                  }
                  if (tab === "activity" && !state.teamProjectActivity) {
                    void loadProjectActivity(state as never, pid);
                  }
                  if (tab === "memory" && !state.teamProjectMemory) {
                    void loadSharedMemory(state as never, pid);
                  }
                  if (tab === "files" && !state.teamProjectFiles) {
                    void loadProjectFiles(state as never, pid);
                  }
                },
                onPauseProject: (projectId: string) => void pauseProject(state as never, projectId),
                onResumeProject: (projectId: string) =>
                  void resumeProject(state as never, projectId),
                onDeleteProject: (projectId: string) =>
                  void deleteProject(state as never, projectId),
                onLoadProjectStats: (projectId: string) =>
                  void loadProjectStats(state as never, projectId),
                onLoadProjectMemory: (projectId: string) =>
                  void loadSharedMemory(state as never, projectId),
                onLoadProjectActivity: (projectId: string) =>
                  void loadProjectActivity(state as never, projectId),
                onLoadProjectFiles: (projectId: string) => {
                  state.teamProjectFiles = null;
                  void loadProjectFiles(state as never, projectId);
                },
                onClearProjectMemory: (projectId: string) =>
                  void clearSharedMemory(state as never, projectId),
                onToggleProjectCollapse: (projectId: string) => {
                  if (_teamCollapsedProjects.has(projectId)) {
                    _teamCollapsedProjects.delete(projectId);
                  } else {
                    _teamCollapsedProjects.add(projectId);
                  }
                  state.requestUpdate();
                },
                onDeleteOrchGroup: async (agentIds: string[]) => {
                  for (const agentId of agentIds) {
                    await deleteAgent(state as never, { agentId, deleteFiles: true });
                  }
                },
                // Team project detail: settings + member management
                onUpdateProjectSettings: (projectId: string, updates: Record<string, unknown>) =>
                  void updateProjectSettings(state as never, projectId, updates),
                onRemoveProjectMember: (projectId: string, agentId: string) =>
                  void removeProjectMember(state as never, projectId, agentId),
                onSelectAgentFromProject: (agentId: string) => {
                  // Reuse the same agent-selection logic as sidebar click
                  state.agentsSelectedId = agentId;
                  state.teamProjectSelectedId = null;
                  stopProjectHealthPoll();
                  state.agentDeleteError = null;
                  state.agentFilesList = null;
                  state.agentFilesError = null;
                  state.agentFilesLoading = false;
                  state.agentFileActive = null;
                  state.agentFileContents = {};
                  state.agentFileDrafts = {};
                  state.agentSkillsReport = null;
                  state.agentSkillsError = null;
                  state.agentSkillsAgentId = null;
                  void loadAgentIdentity(state, agentId);
                  // Switch to chat panel and init chat session
                  state.agentsPanel = "chat";
                  resetAgentChatState(state as never, `agent:${agentId}:main`);
                  void loadAgentChatHistory(state as never);
                },
                // Overview: inline identity & SOUL.md editing
                requestUpdate: () => state.requestUpdate(),
                onIdentityUpdate: async (agentId: string, name: string, emoji: string) => {
                  if (!state.client || !state.connected) {
                    return false;
                  }
                  try {
                    await state.client.request("agents.update", { agentId, name });
                    // Read existing IDENTITY.md, update Name/Emoji lines, preserve others
                    let existingContent = "";
                    try {
                      const res = await state.client.request<{
                        file?: { content?: string };
                      } | null>("agents.files.get", { agentId, name: "IDENTITY.md" });
                      existingContent = res?.file?.content ?? "";
                    } catch {
                      /* ignore: file may not exist yet */
                    }
                    const lines = existingContent.split("\n");
                    const kept = lines.filter(
                      (l) => !l.startsWith("- Name:") && !l.startsWith("- Emoji:"),
                    );
                    const newLines = [`- Name: ${name}`];
                    if (emoji) {
                      newLines.push(`- Emoji: ${emoji}`);
                    }
                    const merged = [...newLines, ...kept.filter((l) => l.trim())].join("\n") + "\n";
                    await state.client.request("agents.files.set", {
                      agentId,
                      name: "IDENTITY.md",
                      content: merged,
                    });
                    // Reload identity to reflect changes
                    void loadAgentIdentity(state, agentId);
                    await loadAgents(state);
                    return true;
                  } catch {
                    return false;
                  }
                },
                onSoulLoad: async (agentId: string) => {
                  if (!state.client || !state.connected) {
                    return "";
                  }
                  try {
                    const res = await state.client.request<{ file?: { content?: string } } | null>(
                      "agents.files.get",
                      { agentId, name: "SOUL.md" },
                    );
                    return res?.file?.content ?? "";
                  } catch {
                    return "";
                  }
                },
                onSoulSave: async (agentId: string, content: string) => {
                  if (!state.client || !state.connected) {
                    return false;
                  }
                  try {
                    await state.client.request("agents.files.set", {
                      agentId,
                      name: "SOUL.md",
                      content,
                    });
                    return true;
                  } catch {
                    return false;
                  }
                },
                // OpenClawCN: Orchestrator entry — hidden (功能未完成，暂不上线)
                orchestratorEntryHtml: nothing,
                // orchestratorHtml — hidden (功能未完成，暂不上线)
                orchestratorHtml: nothing,
              })
            : nothing
        }

        <!-- Agent Creation Wizard overlay -->
        ${renderAgentWizard({
          state: state.agentWizard,
          existingAgentIds: state.agentsList?.agents?.map((a) => a.id) ?? [],
          channelsSnapshot: state.channelsSnapshot,
          modelOptions: (() => {
            const models = (state.configForm as Record<string, unknown>)?.["agents.defaults.models"];
            if (!models || typeof models !== "object") return [];
            return Object.entries(models as Record<string, unknown>).map(([id, v]) => ({
              value: id,
              label: (v as { alias?: string })?.alias ? `${(v as { alias?: string }).alias} (${id})` : id,
            }));
          })(),
          connected: state.connected,
          onClose: () => {
            state.agentWizard.open = false;
            state.agentWizard.soulGenerating = false;
            state.agentWizard._soulSessionKey = "";
            state.requestUpdate();
          },
          onStepChange: (step: AgentWizardStep) => {
            state.agentWizard.step = step;
            state.requestUpdate();
          },
          onTemplateSelect: (tplId: string) => {
            const tpl = AGENT_TEMPLATES.find((t) => t.id === tplId);
            if (!tpl) return;
            state.agentWizard.templateId = tplId;
            state.agentWizard.agentId = tpl.defaultId;
            state.agentWizard.agentName = t(tpl.labelKey as TranslationKey);
            state.agentWizard.agentEmoji = tpl.emoji;
            state.agentWizard.toolProfile = tpl.profile;
            state.requestUpdate();
          },
          onAgentIdChange: (id: string) => {
            state.agentWizard.agentId = id;
            state.requestUpdate();
          },
          onAgentNameChange: (name: string) => {
            state.agentWizard.agentName = name;
            state.requestUpdate();
          },
          onAgentEmojiChange: (emoji: string) => {
            state.agentWizard.agentEmoji = emoji;
            state.requestUpdate();
          },
          onUserDescriptionChange: (desc: string) => {
            state.agentWizard.userDescription = desc;
            state.requestUpdate();
          },
          onGenerateSoul: () => {
            const wiz = state.agentWizard;
            if (!state.client || !state.connected) {
              wiz.soulError = "未连接到网关";
              state.requestUpdate();
              return;
            }
            wiz.soulGenerating = true;
            wiz.soulError = null;
            wiz.soulMdDraft = "";
            state.requestUpdate();

            const tpl = AGENT_TEMPLATES.find((tp) => tp.id === wiz.templateId);
            const sessionKey = `wizard-soul-${generateUUID()}`;
            wiz._soulSessionKey = sessionKey;

            const prompt = [
              `请为一个名为「${wiz.agentName || wiz.agentId}」的 AI 智能体生成 SOUL.md 角色定义文件。`,
              `用户描述：${wiz.userDescription}`,
              tpl ? `模板类型：${tpl.id}（${tpl.creature}，风格：${tpl.vibe}）` : "",
              "",
              "要求：",
              "1. 用 Markdown 格式输出，包含 # 标题、## 角色、## 性格与风格、## 能力、## 约束 等章节",
              "2. 内容要具体、有个性，不要空泛",
              "3. 直接输出 SOUL.md 内容，不要加任何解释或代码块标记",
              "4. 用中文撰写",
              "5. 控制在 300-500 字",
            ].filter(Boolean).join("\n");

            const idempotencyKey = generateUUID();
            state.client.request("chat.send", {
              sessionKey,
              message: prompt,
              deliver: false,
              idempotencyKey,
            }).catch((err: unknown) => {
              wiz.soulGenerating = false;
              wiz.soulError = String(err);
              wiz._soulSessionKey = "";
              state.requestUpdate();
            });
          },
          onSoulDraftChange: (content: string) => {
            state.agentWizard.soulMdDraft = content;
            state.requestUpdate();
          },
          onToolProfileChange: (profile: string) => {
            state.agentWizard.toolProfile = profile;
            state.requestUpdate();
          },
          onModelChange: (modelId: string | null) => {
            state.agentWizard.modelPrimary = modelId;
            state.requestUpdate();
          },
          onEnvAnswersChange: (answers: string) => {
            state.agentWizard.envAnswers = answers;
            state.requestUpdate();
          },
          onChannelToggle: (key: string, bound: boolean) => {
            state.agentWizard.channelBindings[key] = bound;
            state.requestUpdate();
          },
          onSkipChannels: () => {
            state.agentWizard.skipChannels = true;
            state.agentWizard.channelBindings = {};
            state.agentWizard.step = 5;
            state.requestUpdate();
          },
          onCreateAgent: async () => {
            const wiz = state.agentWizard;
            wiz.creating = true;
            wiz.createError = null;
            state.requestUpdate();
            try {
              // 1. Create agent
              const result = await createAgent(state, {
                id: wiz.agentId.trim(),
                name: wiz.agentName.trim(),
                workspace: `~/${wiz.agentId.trim()}`,
              });
              if (!result.ok) {
                wiz.creating = false;
                wiz.createError = state.agentCreateError || "创建失败";
                state.requestUpdate();
                return;
              }
              const agentId = result.agentId ?? wiz.agentId.trim();

              // 2. Write SOUL.md if content exists
              if (wiz.soulMdDraft.trim() && state.client && state.connected) {
                try {
                  await state.client.request("agents.files.set", {
                    agentId,
                    name: "SOUL.md",
                    content: wiz.soulMdDraft.trim(),
                  });
                } catch { /* non-fatal */ }
              }

              // 3. Write IDENTITY.md with full fields
              if (state.client && state.connected) {
                const tpl = AGENT_TEMPLATES.find((tp) => tp.id === wiz.templateId);
                const identityLines = [
                  `- Name: ${wiz.agentName.trim()}`,
                  `- Emoji: ${wiz.agentEmoji}`,
                ];
                if (tpl?.creature) identityLines.push(`- Creature: ${tpl.creature}`);
                if (tpl?.vibe) identityLines.push(`- Vibe: ${tpl.vibe}`);
                try {
                  await state.client.request("agents.files.set", {
                    agentId,
                    name: "IDENTITY.md",
                    content: identityLines.join("\n") + "\n",
                  });
                } catch { /* non-fatal */ }
              }

              // 4. Write TOOLS.md env hints if provided
              if (wiz.envAnswers.trim() && state.client && state.connected) {
                const tpl = AGENT_TEMPLATES.find((tp) => tp.id === wiz.templateId);
                const envLabel = tpl?.envQuestionKey ? t(tpl.envQuestionKey as TranslationKey) : "环境信息";
                const toolsContent = `### ${envLabel}\n${wiz.envAnswers.trim()}\n`;
                try {
                  // Read existing TOOLS.md then append
                  let existing = "";
                  try {
                    const res = await state.client.request("agents.files.get", { agentId, name: "TOOLS.md" }) as { file?: { content?: string } } | null;
                    existing = res?.file?.content ?? "";
                  } catch { /* file may not exist */ }
                  await state.client.request("agents.files.set", {
                    agentId,
                    name: "TOOLS.md",
                    content: existing ? existing.trimEnd() + "\n\n" + toolsContent : toolsContent,
                  });
                } catch { /* non-fatal */ }
              }

              // 5. Patch tool profile and model via config
              if (state.client && state.connected) {
                try {
                  await loadConfig(state);
                  const cv = state.configForm ?? (state.configSnapshot?.config as Record<string, unknown> | null);
                  const agList = (cv as { agents?: { list?: unknown[] } } | null)?.agents?.list;
                  if (Array.isArray(agList)) {
                    const idx = agList.findIndex(
                      (e) => e && typeof e === "object" && "id" in e && (e as { id?: string }).id === agentId,
                    );
                    if (idx >= 0) {
                      if (wiz.toolProfile) {
                        updateConfigFormValue(state, ["agents", "list", idx, "tools", "profile"], wiz.toolProfile);
                      }
                      if (wiz.modelPrimary) {
                        updateConfigFormValue(state, ["agents", "list", idx, "model"], wiz.modelPrimary);
                      }
                      await saveConfig(state);
                    }
                  }
                } catch { /* non-fatal: config patch failed, user can adjust later */ }
              }

              // Success: close wizard, select new agent
              wiz.open = false;
              wiz.creating = false;
              state.agentCreateSuccess = true;
              state.requestUpdate();
              setTimeout(() => {
                state.agentCreateSuccess = false;
                state.requestUpdate();
              }, 15000);

              // Reload identities
              const agentIds = state.agentsList?.agents?.map((entry) => entry.id) ?? [];
              if (agentIds.length > 0) {
                void loadAgentIdentities(state, agentIds);
              }
            } catch (err) {
              wiz.creating = false;
              wiz.createError = String(err);
              state.requestUpdate();
            }
          },
        })}

        ${
          state.tab === "skills"
            ? renderSkills({
                loading: state.skillsLoading,
                report: state.skillsReport,
                error: state.skillsError,
                filter: state.skillsFilter,
                edits: state.skillEdits,
                messages: state.skillMessages,
                busyKey: state.skillsBusyKey,
                tierRenderKey: state.skillsTierRenderKey,
                onTierRenderBump: () => {
                  state.skillsTierRenderKey++;
                },
                onFilterChange: (next) => {
                  state.skillsFilter = next;
                },
                onRefresh: () => loadSkills(state, { clearMessages: true }),
                onToggle: (key, enabled) => updateSkillEnabled(state, key, enabled),
                onEdit: (key, value) => updateSkillEdit(state, key, value),
                onSaveKey: (key) => saveSkillApiKey(state, key),
                onInstall: (skillKey, name, installId) =>
                  installSkill(state, skillKey, name, installId),
                // core skills drag-and-drop
                onPromoteToCore: (skillKey) => void promoteSkillToCore(state, skillKey),
                onDemoteFromCore: (skillKey) => void demoteSkillFromCore(state, skillKey),
                coreCount: countCoreSkills(state.skillsReport),
                coreMax: CORE_SKILLS_MAX,
                // marketplace props
                activeTab: state.skillsActiveTab === "market" ? "market" : "local",
                onTabChange: (tab) => {
                  state.skillsActiveTab = tab === "market" ? "market" : "active";
                  if (tab === "market" && !state.skillsMarketSearchResult) {
                    const cat = state.skillsActiveCategory;
                    void searchMarketSkills(state, {
                      category: cat === "all" ? undefined : cat,
                      page: 1,
                    });
                  }
                },
                marketLoading: state.skillsMarketLoading,
                marketError: state.skillsMarketError,
                marketSearchResult: state.skillsMarketSearchResult ?? null,
                marketCategory: state.skillsActiveCategory,
                installProgress: state.skillsInstallProgress,
                onMarketSearch: (keyword) => {
                  state.skillsMarketKeyword = keyword;
                  state.skillsMarketPage = 1;
                  void searchMarketSkills(state, { keyword: keyword || undefined, page: 1 });
                },
                onMarketCategoryChange: (category) => {
                  setActiveCategory(state, category);
                  void searchMarketSkills(state, {
                    category: category === "all" ? undefined : category,
                    page: 1,
                  });
                },
                onMarketLoadMore: () => void loadMoreMarketSkills(state),
                hasMorePages:
                  (state.skillsMarketSearchResult?.page ?? 0) <
                  (state.skillsMarketSearchResult?.totalPages ?? 0),
                onMarketInstall: (skillName) => void installRemoteSkill(state, skillName),
                onMarketUninstall: (skillName) => void uninstallRemoteSkill(state, skillName),
                onMarketRefresh: () => {
                  void refreshMarketSkills(state);
                  void searchMarketSkills(state, { page: 1 });
                },
                // import modal
                importOpen: state.skillsImportOpen,
                importPath: state.skillsImportPath,
                importBrowseResult: state.skillsImportBrowseResult,
                importLoading: state.skillsImportLoading,
                importError: state.skillsImportError,
                importSuccess: state.skillsImportSuccess,
                onImportOpen: () => void openSkillImport(state),
                onImportClose: () => closeSkillImport(state),
                onImportBrowse: (path?: string) => void browseSkillDir(state, path),
                onImportPathChange: (path: string) => {
                  state.skillsImportPath = path;
                },
                onImportExecute: (path: string, mode: "copy" | "reference") =>
                  void importSkill(state, path, mode),
                // detail modal
                selectedSkillKey: state.selectedSkillKey,
                selectedMarketSkill: state.selectedMarketSkill,
                onSelectSkill: (key) => {
                  selectSkill(state, key);
                },
                onSelectMarketSkill: (item) => {
                  selectMarketSkill(state, item);
                },
                // sidebar tier filter
                sidebarTierFilter: state.sidebarTierFilter,
                onSidebarTierChange: (tier) => {
                  state.sidebarTierFilter = tier;
                },
              })
            : nothing
        }

        ${
          state.tab === "extensions"
            ? renderExtensions({
                capabilities: state.mcpCapabilities,
                advancedOpen: state.mcpAdvancedOpen,
                onToggleAdvanced: () => {
                  state.mcpAdvancedOpen = !state.mcpAdvancedOpen;
                },
                onConfigClick: (id) => {
                  const cap = state.mcpCapabilities.find((c) => c.id === id);
                  if (cap?.configNeeded) {
                    // Has unconfigured env keys — open config wizard so the user
                    // can fill in API keys.  Build a synthetic marketplace item
                    // with just enough data for the wizard.
                    const firstKey = cap.configNeeded.split(",")[0]?.trim() ?? "API_KEY";
                    state.mcpMarketplace = {
                      ...state.mcpMarketplace,
                      configTarget: {
                        serverId: id,
                        friendlyName: cap.friendlyName,
                        friendlyNameEn: cap.friendlyName,
                        description: "",
                        descriptionEn: "",
                        category: "other",
                        tags: [],
                        version: "",
                        npmPackage: "",
                        securityScore: 0,
                        requiresApiKey: true,
                        apiKeyName: firstKey,
                        platforms: [],
                        isOfficial: false,
                        isNew: false,
                        toolCount: 0,
                        installStatus: "installed",
                      },
                    };
                    // Switch to extensions tab (stay on it) to show the wizard modal
                    return;
                  }
                  // No config needed — enable/restart the server directly.
                  const name = cap?.friendlyName ?? id;
                  state.mcpEnablingServerId = id;
                  showMcpToast(
                    state,
                    `${name} — ${t("extensions.advanced.restarting" as never)}`,
                    "info",
                  );
                  void enableMcpServer(state.client, id, {
                    onStateChange: (patch: Partial<McpLifecycleState>) => {
                      if (patch.capabilities !== undefined) {
                        state.mcpCapabilities = patch.capabilities;
                      }
                      if (patch.processes !== undefined) {
                        state.mcpProcesses = patch.processes;
                      }
                      if (patch.updateNotice !== undefined) {
                        state.mcpUpdateNotice = patch.updateNotice;
                      }
                    },
                  })
                    .then(() => {
                      state.mcpEnablingServerId = null;
                      const updated = state.mcpCapabilities.find((c) => c.id === id);
                      if (updated?.status === "ready") {
                        showMcpToast(state, `${name} — ${t("extensions.status.ready")}`, "success");
                      }
                    })
                    .catch(() => {
                      state.mcpEnablingServerId = null;
                    });
                },
                onTrySay: (prompt) => {
                  state.chatMessage = prompt;
                  state.setTab("chat");
                },
                onRestart: (id) => {
                  showMcpToast(
                    state,
                    `${id} — ${t("extensions.advanced.restarting" as never)}`,
                    "info",
                  );
                  void (async () => {
                    try {
                      await restartMcpServer(state.client, id, {
                        onStateChange: (patch: Partial<McpLifecycleState>) => {
                          if (patch.capabilities !== undefined) {
                            state.mcpCapabilities = patch.capabilities;
                          }
                          if (patch.processes !== undefined) {
                            state.mcpProcesses = patch.processes;
                          }
                          if (patch.updateNotice !== undefined) {
                            state.mcpUpdateNotice = patch.updateNotice;
                          }
                        },
                      });
                      // Check the resulting status
                      const proc = state.mcpProcesses.find((p) => p.id === id);
                      if (proc?.status === "running") {
                        showMcpToast(
                          state,
                          `${id} — ${t("extensions.advanced.restartSuccess" as never)}`,
                          "success",
                        );
                      } else {
                        const { detail } = formatGeneralError(proc?.error, `${id} 重启`);
                        showMcpToast(state, detail, "error");
                      }
                    } catch {
                      showMcpToast(
                        state,
                        `${id} — ${t("extensions.advanced.restartFailed" as never)}`,
                        "error",
                      );
                    }
                  })();
                },
                onDisable: (id) => {
                  void disableMcpServer(state.client, id, {
                    onStateChange: (patch: Partial<McpLifecycleState>) => {
                      if (patch.capabilities !== undefined) {
                        state.mcpCapabilities = patch.capabilities;
                      }
                      if (patch.processes !== undefined) {
                        state.mcpProcesses = patch.processes;
                      }
                      if (patch.updateNotice !== undefined) {
                        state.mcpUpdateNotice = patch.updateNotice;
                      }
                    },
                  });
                },
                onEnable: (id) => {
                  state.mcpEnablingServerId = id;
                  void enableMcpServer(state.client, id, {
                    onStateChange: (patch: Partial<McpLifecycleState>) => {
                      if (patch.capabilities !== undefined) {
                        state.mcpCapabilities = patch.capabilities;
                      }
                      if (patch.processes !== undefined) {
                        state.mcpProcesses = patch.processes;
                      }
                      if (patch.updateNotice !== undefined) {
                        state.mcpUpdateNotice = patch.updateNotice;
                      }
                    },
                  })
                    .then(() => {
                      state.mcpEnablingServerId = null;
                    })
                    .catch(() => {
                      state.mcpEnablingServerId = null;
                    });
                },
                onTest: (id, env) => {
                  state.mcpTestingServerId = id;
                  // Clear previous result for this server
                  const results = { ...state.mcpTestResults };
                  delete results[id];
                  state.mcpTestResults = results;
                  void (async () => {
                    try {
                      const result = await testMcpServer(state.client, id, env);
                      state.mcpTestResults = {
                        ...state.mcpTestResults,
                        [id]: result.ok ? "success" : "failed",
                      };
                      if (result.ok) {
                        const toolInfo = result.toolCount ? ` (${result.toolCount} tools)` : "";
                        showMcpToast(
                          state,
                          `${id} — ${t("extensions.advanced.testSuccess" as never)}${toolInfo}`,
                          "success",
                        );
                      } else {
                        const { detail } = formatGeneralError(result.error, `${id} 测试`);
                        showMcpToast(state, detail, "error");
                      }
                      // Also refresh status after test
                      await checkMcpUpdate(state.client, {
                        onStateChange: (patch: Partial<McpLifecycleState>) => {
                          if (patch.capabilities !== undefined) {
                            state.mcpCapabilities = patch.capabilities;
                          }
                          if (patch.processes !== undefined) {
                            state.mcpProcesses = patch.processes;
                          }
                          if (patch.updateNotice !== undefined) {
                            state.mcpUpdateNotice = patch.updateNotice;
                          }
                        },
                      });
                    } catch {
                      state.mcpTestResults = { ...state.mcpTestResults, [id]: "failed" };
                      showMcpToast(
                        state,
                        `${id} — ${t("extensions.advanced.testFailed" as never)}`,
                        "error",
                      );
                    } finally {
                      state.mcpTestingServerId = null;
                    }
                  })();
                },
                testingServerId: state.mcpTestingServerId,
                testResults: state.mcpTestResults,
                enablingServerId: state.mcpEnablingServerId,
                onCheckUpdate: () => {
                  void checkMcpUpdate(state.client, {
                    onStateChange: (patch: Partial<McpLifecycleState>) => {
                      if (patch.capabilities !== undefined) {
                        state.mcpCapabilities = patch.capabilities;
                      }
                      if (patch.processes !== undefined) {
                        state.mcpProcesses = patch.processes;
                      }
                      if (patch.updateNotice !== undefined) {
                        state.mcpUpdateNotice = patch.updateNotice;
                      }
                    },
                  });
                },
                onViewUpdate: () => {
                  state.mcpUpdateNotice = null;
                },
                processes: state.mcpProcesses,
                updateNotice: state.mcpUpdateNotice,
                // Marketplace props
                activeTab: state.mcpExtTab,
                onTabChange: (tab) => {
                  state.mcpExtTab = tab;
                  // Fix #5: Lazy-load marketplace data when switching to store tab
                  if (
                    tab === "store" &&
                    state.mcpMarketplace.items.length === 0 &&
                    !state.mcpMarketplace.loading
                  ) {
                    const mcpCallbacks: MarketplaceCallbacks = {
                      onStateChange: (patch) => {
                        state.mcpMarketplace = { ...state.mcpMarketplace, ...patch };
                      },
                    };
                    void loadMarketplaceItems(state.client, mcpCallbacks);
                    void loadMarketplaceRecommendations(state.client, mcpCallbacks);
                  }
                },
                marketplace: state.mcpMarketplace,
                onSearchChange: (search) => {
                  // Update input immediately for responsive typing
                  state.mcpMarketplace = { ...state.mcpMarketplace, search };
                  // Debounce server-side search query (300ms)
                  clearTimeout((state as never)._mcpSearchTimer);
                  (state as never)._mcpSearchTimer = setTimeout(() => {
                    const cb: MarketplaceCallbacks = {
                      onStateChange: (patch) => {
                        state.mcpMarketplace = { ...state.mcpMarketplace, ...patch };
                      },
                    };
                    void loadMarketplaceItems(state.client, cb, {
                      search,
                      category: state.mcpMarketplace.activeCategory,
                    });
                  }, 300);
                },
                onCategoryChange: (category) => {
                  state.mcpMarketplace = { ...state.mcpMarketplace, activeCategory: category };
                  // Trigger server-side filtered query immediately
                  const cb: MarketplaceCallbacks = {
                    onStateChange: (patch) => {
                      state.mcpMarketplace = { ...state.mcpMarketplace, ...patch };
                    },
                  };
                  void loadMarketplaceItems(state.client, cb, {
                    search: state.mcpMarketplace.search,
                    category,
                  });
                },
                onSortChange: (sort) => {
                  state.mcpMarketplace = { ...state.mcpMarketplace, sort };
                },
                onOpenDetail: (item) => {
                  state.mcpMarketplace = { ...state.mcpMarketplace, detailItem: item };
                },
                onCloseDetail: () => {
                  state.mcpMarketplace = { ...state.mcpMarketplace, detailItem: null };
                },
                onInstall: (item) => {
                  // Non-installable guard — items without npm/pypi/sse cannot be installed
                  if (item.installable === false || item.installMethod === "none") {
                    showMcpToast(
                      state,
                      `${item.friendlyName} — ${t("extensions.store.notInstallable" as never) || "暂不支持一键安装"}`,
                      "error",
                    );
                    return;
                  }
                  // Process limit guard
                  const installedCount = state.mcpProcesses.length;
                  if (installedCount >= MCP_MAX_RUNNING) {
                    showMcpToast(
                      state,
                      t("extensions.store.limitReached")
                        .replace("{{count}}", String(installedCount))
                        .replace("{{max}}", String(MCP_MAX_RUNNING)),
                      "error",
                    );
                    return;
                  }
                  // SSE security confirmation — remote services send data to third-party servers
                  const _itemExtras = item as McpMarketplaceItem & {
                    sseUrl?: string;
                    _overrides?: { sseUrl?: string };
                  };
                  const _overrideSseUrl = _itemExtras._overrides?.sseUrl;
                  if (item.installMethod === "sse" || _overrideSseUrl) {
                    const sseUrl = _overrideSseUrl || _itemExtras.sseUrl || "";
                    let domain = "";
                    try {
                      domain = new URL(sseUrl).hostname;
                    } catch {
                      domain = sseUrl;
                    }
                    const msg = t("extensions.store.sseInstallConfirm" as never)
                      .replace("{{name}}", item.friendlyName)
                      .replace("{{url}}", domain || "unknown");
                    if (!confirm(msg)) {
                      return;
                    }
                  }
                  // Token consumption warning — always show before install
                  const afterCount = installedCount + 1;
                  showMcpToast(
                    state,
                    t("extensions.toast.tokenWarning" as never)
                      .replace("{{current}}", String(afterCount))
                      .replace("{{max}}", String(MCP_MAX_RUNNING)),
                    "info",
                  );
                  // Extract env and overrides from config wizard (attached as _env / _overrides on the item)
                  const itemWithExtras = item as McpMarketplaceItem & {
                    _env?: Record<string, string>;
                    _overrides?: { sseUrl?: string; npmPackage?: string; pypiPackage?: string };
                  };
                  const env = itemWithExtras._env;
                  const overrides = itemWithExtras._overrides;
                  void (async () => {
                    const result = await installMarketplaceItem(
                      state.client,
                      item,
                      env,
                      {
                        currentItems: () => state.mcpMarketplace.items,
                        onStateChange: (patch) => {
                          state.mcpMarketplace = { ...state.mcpMarketplace, ...patch };
                        },
                      },
                      overrides,
                    );

                    if (result?.ok) {
                      showMcpToast(
                        state,
                        `${item.friendlyName} ${t("extensions.toast.installed" as never)}`,
                        "success",
                      );
                      // Refresh "My Capabilities" tab
                      const refreshCaps = () =>
                        initMcpCapabilities(state.client, {
                          onStateChange: (lcPatch) => {
                            if (lcPatch.capabilities !== undefined) {
                              state.mcpCapabilities = lcPatch.capabilities;
                            }
                            if (lcPatch.processes !== undefined) {
                              state.mcpProcesses = lcPatch.processes;
                            }
                            if (lcPatch.updateNotice !== undefined) {
                              state.mcpUpdateNotice = lcPatch.updateNotice;
                            }
                          },
                        });
                      void refreshCaps();
                      setTimeout(() => void refreshCaps(), 3000);
                    } else {
                      const errorDetail = result?.connectError;
                      const { detail } = formatGeneralError(
                        errorDetail,
                        `${item.friendlyName} 安装`,
                      );
                      // Detect missing runtime — append chat guidance
                      const lowerDetail = (errorDetail ?? "").toLowerCase();
                      const needsUvToast =
                        lowerDetail.includes("uvx") ||
                        lowerDetail.includes("python uv") ||
                        lowerDetail.includes("安装 uv");
                      const needsNodeToast =
                        lowerDetail.includes("node.js") ||
                        lowerDetail.includes("安装 node");
                      const runtimeHint = needsUvToast
                        ? "\n提示：去聊天框输入「帮我安装 uv」即可自动安装"
                        : needsNodeToast
                          ? "\n提示：去聊天框输入「帮我安装 Node.js」即可自动安装"
                          : "";
                      showMcpToast(state, detail + runtimeHint, "error");
                    }
                  })();
                },
                onUninstall: (serverId) => {
                  // Capture name BEFORE optimistic update
                  const itemName =
                    state.mcpMarketplace.items.find((i) => i.serverId === serverId)?.friendlyName ??
                    state.mcpCapabilities.find((c) => c.id === serverId)?.friendlyName ??
                    serverId;

                  // Optimistic: immediately remove from "My Capabilities" list
                  // so the card disappears instantly without waiting for RPC roundtrip
                  const removedCap = state.mcpCapabilities.find((c) => c.id === serverId);
                  state.mcpCapabilities = state.mcpCapabilities.filter(
                    (c) => c.id !== serverId || c.isBuiltin,
                  );
                  state.mcpProcesses = state.mcpProcesses.filter((p) => p.id !== serverId);

                  void (async () => {
                    try {
                      await uninstallMarketplaceItem(state.client, serverId, {
                        currentItems: () => state.mcpMarketplace.items,
                        onStateChange: (patch) => {
                          state.mcpMarketplace = { ...state.mcpMarketplace, ...patch };
                        },
                      });
                      showMcpToast(
                        state,
                        `${itemName} ${t("extensions.toast.uninstalled" as never)}`,
                        "info",
                      );
                      // Refresh My Capabilities to get authoritative server-side state
                      void checkMcpUpdate(state.client, {
                        onStateChange: (lcPatch: Partial<McpLifecycleState>) => {
                          if (lcPatch.capabilities !== undefined) {
                            state.mcpCapabilities = lcPatch.capabilities;
                          }
                          if (lcPatch.processes !== undefined) {
                            state.mcpProcesses = lcPatch.processes;
                          }
                          if (lcPatch.updateNotice !== undefined) {
                            state.mcpUpdateNotice = lcPatch.updateNotice;
                          }
                        },
                      });
                    } catch (err) {
                      console.error("[mcp] uninstall failed:", serverId, err);
                      // Rollback: restore the optimistically removed capability
                      if (removedCap && !state.mcpCapabilities.some((c) => c.id === serverId)) {
                        state.mcpCapabilities = [...state.mcpCapabilities, removedCap];
                      }
                      showMcpToast(
                        state,
                        `${itemName} ${t("extensions.toast.uninstallFailed" as never)}`,
                        "error",
                      );
                    }
                  })();
                },
                onUpdate: (serverId) => {
                  const itemName =
                    state.mcpMarketplace.items.find((i) => i.serverId === serverId)?.friendlyName ??
                    serverId;
                  void (async () => {
                    try {
                      await updateMarketplaceItem(state.client, serverId, {
                        currentItems: () => state.mcpMarketplace.items,
                        onStateChange: (patch) => {
                          state.mcpMarketplace = { ...state.mcpMarketplace, ...patch };
                        },
                      });
                      showMcpToast(
                        state,
                        `${itemName} ${t("extensions.toast.updated" as never)}`,
                        "success",
                      );
                      void checkMcpUpdate(state.client, {
                        onStateChange: (lcPatch: Partial<McpLifecycleState>) => {
                          if (lcPatch.capabilities !== undefined) {
                            state.mcpCapabilities = lcPatch.capabilities;
                          }
                          if (lcPatch.processes !== undefined) {
                            state.mcpProcesses = lcPatch.processes;
                          }
                          if (lcPatch.updateNotice !== undefined) {
                            state.mcpUpdateNotice = lcPatch.updateNotice;
                          }
                        },
                      });
                    } catch (err) {
                      console.error("[mcp] update failed:", serverId, err);
                      showMcpToast(
                        state,
                        `${itemName} ${t("extensions.toast.error" as never)}`,
                        "error",
                      );
                    }
                  })();
                },
                onOpenConfigWizard: (item) => {
                  state.mcpMarketplace = { ...state.mcpMarketplace, configTarget: item };
                },
                onCloseConfigWizard: () => {
                  state.mcpMarketplace = { ...state.mcpMarketplace, configTarget: null };
                },
                onUpdateServerEnv: (serverId, env) => {
                  const name =
                    state.mcpCapabilities.find((c) => c.id === serverId)?.friendlyName ?? serverId;
                  state.mcpEnablingServerId = serverId;
                  showMcpToast(
                    state,
                    `${name} — ${t("extensions.advanced.restarting" as never)}`,
                    "info",
                  );
                  void (async () => {
                    try {
                      await state.client?.request("mcp.servers.updateEnv", { id: serverId, env });
                      await restartMcpServer(state.client, serverId, {
                        onStateChange: (patch: Partial<McpLifecycleState>) => {
                          if (patch.capabilities !== undefined) {
                            state.mcpCapabilities = patch.capabilities;
                          }
                          if (patch.processes !== undefined) {
                            state.mcpProcesses = patch.processes;
                          }
                          if (patch.updateNotice !== undefined) {
                            state.mcpUpdateNotice = patch.updateNotice;
                          }
                        },
                      });
                      const updated = state.mcpCapabilities.find((c) => c.id === serverId);
                      if (updated?.status === "ready") {
                        showMcpToast(state, `${name} — ${t("extensions.status.ready")}`, "success");
                      } else {
                        showMcpToast(
                          state,
                          `${name} — ${t("extensions.advanced.restartFailed" as never)}`,
                          "error",
                        );
                      }
                    } catch {
                      showMcpToast(
                        state,
                        `${name} — ${t("extensions.advanced.restartFailed" as never)}`,
                        "error",
                      );
                    } finally {
                      state.mcpEnablingServerId = null;
                    }
                  })();
                },
                onLoadMore: () => {
                  void loadMoreMarketplaceItems(state.client, {
                    onStateChange: (patch) => {
                      state.mcpMarketplace = { ...state.mcpMarketplace, ...patch };
                    },
                    currentState: () => state.mcpMarketplace,
                  });
                },
                onDismissFirstVisit: () => {
                  localStorage.setItem(`${brand.storagePrefix}mcp.firstVisitSeen`, "1");
                  state.mcpMarketplace = { ...state.mcpMarketplace, showFirstVisit: false };
                },
                onDismissRecommendation: () => {
                  state.mcpMarketplace = { ...state.mcpMarketplace, recommendations: [] };
                },
                runningCount: state.mcpProcesses.filter((p) => p.status === "running").length,
                toast: state.mcpMarketplace.toast,
                onManualAdd: async (config) => {
                  try {
                    await state.client?.request("mcp.servers.add", {
                      id: config.id,
                      command: config.command,
                      args: config.args,
                      transport: config.transport,
                      env: config.env,
                      url: config.url,
                      headers: config.headers,
                      enabled: true,
                      autoStart: true,
                    });
                    showMcpToast(
                      state,
                      `${config.id} ${t("extensions.toast.installed" as never)}`,
                      "success",
                    );
                    void checkMcpUpdate(state.client, {
                      onStateChange: (lcPatch: Partial<McpLifecycleState>) => {
                        if (lcPatch.capabilities !== undefined) {
                          state.mcpCapabilities = lcPatch.capabilities;
                        }
                        if (lcPatch.processes !== undefined) {
                          state.mcpProcesses = lcPatch.processes;
                        }
                        if (lcPatch.updateNotice !== undefined) {
                          state.mcpUpdateNotice = lcPatch.updateNotice;
                        }
                      },
                    });
                    return true;
                  } catch (err) {
                    console.error("[mcp] manual add failed:", config.id, err);
                    showMcpToast(
                      state,
                      `${t("extensions.toast.error" as never)}: ${config.id}`,
                      "error",
                    );
                    return false;
                  }
                },
                onRetrySync: () => {
                  const mcpCallbacks: MarketplaceCallbacks = {
                    onStateChange: (patch) => {
                      state.mcpMarketplace = { ...state.mcpMarketplace, ...patch };
                    },
                  };
                  state.mcpMarketplace = { ...state.mcpMarketplace, loading: true, error: null };
                  void loadMarketplaceItems(state.client, mcpCallbacks);
                  void loadMarketplaceRecommendations(state.client, mcpCallbacks);
                },
                // Batch API Key configuration
                onOpenBatchConfig: () => {
                  state.mcpMarketplace = { ...state.mcpMarketplace, showBatchConfig: true };
                  state._mcpBatchConfigResult = null;
                  void (async () => {
                    try {
                      state._mcpServerEnvStatus = await fetchServerEnvStatus(state.client);
                    } catch {
                      /* ignore */
                    }
                  })();
                },
                onCloseBatchConfig: () => {
                  state.mcpMarketplace = { ...state.mcpMarketplace, showBatchConfig: false };
                  state._mcpBatchConfigResult = null;
                },
                onSaveBatchConfig: (updates) => {
                  state._mcpBatchConfigSaving = true;
                  state._mcpBatchConfigResult = null;
                  void (async () => {
                    try {
                      const { success, failed } = await batchUpdateMcpServerEnv(
                        state.client,
                        updates,
                      );
                      state._mcpBatchConfigResult = { success, failed };
                      if (success > 0) {
                        showMcpToast(
                          state,
                          `${success} ${t("extensions.batchConfig.saved" as never)}`,
                          "success",
                        );
                        // Refresh env status + capabilities
                        state._mcpServerEnvStatus = await fetchServerEnvStatus(state.client);
                        void checkMcpUpdate(state.client, {
                          onStateChange: (lcPatch: Partial<McpLifecycleState>) => {
                            if (lcPatch.capabilities !== undefined) {
                              state.mcpCapabilities = lcPatch.capabilities;
                            }
                            if (lcPatch.processes !== undefined) {
                              state.mcpProcesses = lcPatch.processes;
                            }
                          },
                        });
                      }
                      if (failed > 0) {
                        showMcpToast(
                          state,
                          `${failed} ${t("extensions.batchConfig.failed" as never)}`,
                          "error",
                        );
                      }
                    } catch (err) {
                      console.error("[mcp] batch env update failed:", err);
                      showMcpToast(state, t("extensions.toast.error" as never), "error");
                    } finally {
                      state._mcpBatchConfigSaving = false;
                    }
                  })();
                },
                batchConfigSaving: state._mcpBatchConfigSaving,
                batchConfigResult: state._mcpBatchConfigResult,
                serverEnvStatus: state._mcpServerEnvStatus,
              })
            : nothing
        }

        ${
          state.tab === "nodes"
            ? renderNodes({
                loading: state.nodesLoading,
                nodes: state.nodes,
                devicesLoading: state.devicesLoading,
                devicesError: state.devicesError,
                devicesList: state.devicesList,
                configForm:
                  state.configForm ??
                  (state.configSnapshot?.config as Record<string, unknown> | null),
                configLoading: state.configLoading,
                configSaving: state.configSaving,
                configDirty: state.configFormDirty,
                configFormMode: state.configFormMode,
                execApprovalsLoading: state.execApprovalsLoading,
                execApprovalsSaving: state.execApprovalsSaving,
                execApprovalsDirty: state.execApprovalsDirty,
                execApprovalsSnapshot: state.execApprovalsSnapshot,
                execApprovalsForm: state.execApprovalsForm,
                execApprovalsSelectedAgent: state.execApprovalsSelectedAgent,
                execApprovalsTarget: state.execApprovalsTarget,
                execApprovalsTargetNodeId: state.execApprovalsTargetNodeId,
                onRefresh: () => loadNodes(state),
                onDevicesRefresh: () => loadDevices(state),
                onDeviceApprove: (requestId) => approveDevicePairing(state, requestId),
                onDeviceReject: (requestId) => rejectDevicePairing(state, requestId),
                onDeviceRotate: (deviceId, role, scopes) =>
                  rotateDeviceToken(state, { deviceId, role, scopes }),
                onDeviceRevoke: (deviceId, role) => revokeDeviceToken(state, { deviceId, role }),
                onDeviceRemove: (deviceId) =>
                  removeDevice(state, deviceId, t("network.devices.unpairConfirm")),
                onLoadConfig: () => loadConfig(state),
                onLoadExecApprovals: () => {
                  const target =
                    state.execApprovalsTarget === "node" && state.execApprovalsTargetNodeId
                      ? { kind: "node" as const, nodeId: state.execApprovalsTargetNodeId }
                      : { kind: "gateway" as const };
                  return loadExecApprovals(state, target);
                },
                onBindDefault: (nodeId) => {
                  if (nodeId) {
                    updateConfigFormValue(state, ["tools", "exec", "node"], nodeId);
                  } else {
                    removeConfigFormValue(state, ["tools", "exec", "node"]);
                  }
                },
                onBindAgent: (agentIndex, nodeId) => {
                  const basePath = ["agents", "list", agentIndex, "tools", "exec", "node"];
                  if (nodeId) {
                    updateConfigFormValue(state, basePath, nodeId);
                  } else {
                    removeConfigFormValue(state, basePath);
                  }
                },
                onSaveBindings: () => saveConfig(state),
                onExecApprovalsTargetChange: (kind, nodeId) => {
                  state.execApprovalsTarget = kind;
                  state.execApprovalsTargetNodeId = nodeId;
                  state.execApprovalsSnapshot = null;
                  state.execApprovalsForm = null;
                  state.execApprovalsDirty = false;
                  state.execApprovalsSelectedAgent = null;
                },
                onExecApprovalsSelectAgent: (agentId) => {
                  state.execApprovalsSelectedAgent = agentId;
                },
                onExecApprovalsPatch: (path, value) =>
                  updateExecApprovalsFormValue(state, path, value),
                onExecApprovalsRemove: (path) => removeExecApprovalsFormValue(state, path),
                onSaveExecApprovals: () => {
                  const target =
                    state.execApprovalsTarget === "node" && state.execApprovalsTargetNodeId
                      ? { kind: "node" as const, nodeId: state.execApprovalsTargetNodeId }
                      : { kind: "gateway" as const };
                  return saveExecApprovals(state, target);
                },
              })
            : nothing
        }

        ${
          state.tab === "network"
            ? renderNetworkCenter({
                activeTab: state.networkTab ?? "devices",
                onTabChange: (tab) => {
                  state.networkTab = tab;
                },
                statusLoading: state.networkStatusLoading,
                status: state.networkStatus,
                statusError: state.networkStatusError,
                onRefreshStatus: () => loadNetworkStatus(state),
                presenceLoading: state.presenceLoading,
                presenceEntries: state.presenceEntries,
                presenceError: state.presenceError,
                onRefreshPresence: () => loadPresence(state),
                nodesProps: {
                  loading: state.nodesLoading,
                  nodes: state.nodes,
                  devicesLoading: state.devicesLoading,
                  devicesError: state.devicesError,
                  devicesList: state.devicesList,
                  configForm:
                    state.configForm ??
                    (state.configSnapshot?.config as Record<string, unknown> | null),
                  configLoading: state.configLoading,
                  configSaving: state.configSaving,
                  configDirty: state.configFormDirty,
                  configFormMode: state.configFormMode,
                  execApprovalsLoading: state.execApprovalsLoading,
                  execApprovalsSaving: state.execApprovalsSaving,
                  execApprovalsDirty: state.execApprovalsDirty,
                  execApprovalsSnapshot: state.execApprovalsSnapshot,
                  execApprovalsForm: state.execApprovalsForm,
                  execApprovalsSelectedAgent: state.execApprovalsSelectedAgent,
                  execApprovalsTarget: state.execApprovalsTarget,
                  execApprovalsTargetNodeId: state.execApprovalsTargetNodeId,
                  onRefresh: () => loadNodes(state),
                  onDevicesRefresh: () => loadDevices(state),
                  onDeviceApprove: (requestId) => approveDevicePairing(state, requestId),
                  onDeviceReject: (requestId) => rejectDevicePairing(state, requestId),
                  onDeviceRotate: (deviceId, role, scopes) =>
                    rotateDeviceToken(state, { deviceId, role, scopes }),
                  onDeviceRevoke: (deviceId, role) => revokeDeviceToken(state, { deviceId, role }),
                  onDeviceRemove: (deviceId) =>
                    removeDevice(state, deviceId, t("network.devices.unpairConfirm")),
                  onLoadConfig: () => loadConfig(state),
                  onLoadExecApprovals: () => {
                    const target =
                      state.execApprovalsTarget === "node" && state.execApprovalsTargetNodeId
                        ? { kind: "node" as const, nodeId: state.execApprovalsTargetNodeId }
                        : { kind: "gateway" as const };
                    return loadExecApprovals(state, target);
                  },
                  onBindDefault: (nodeId) => {
                    if (nodeId) {
                      updateConfigFormValue(state, ["tools", "exec", "node"], nodeId);
                    } else {
                      removeConfigFormValue(state, ["tools", "exec", "node"]);
                    }
                  },
                  onBindAgent: (agentIndex, nodeId) => {
                    const basePath = ["agents", "list", agentIndex, "tools", "exec", "node"];
                    if (nodeId) {
                      updateConfigFormValue(state, basePath, nodeId);
                    } else {
                      removeConfigFormValue(state, basePath);
                    }
                  },
                  onSaveBindings: () => saveConfig(state),
                  onExecApprovalsTargetChange: (kind, nodeId) => {
                    state.execApprovalsTarget = kind;
                    state.execApprovalsTargetNodeId = nodeId;
                    state.execApprovalsSnapshot = null;
                    state.execApprovalsForm = null;
                    state.execApprovalsDirty = false;
                    state.execApprovalsSelectedAgent = null;
                  },
                  onExecApprovalsSelectAgent: (agentId) => {
                    state.execApprovalsSelectedAgent = agentId;
                  },
                  onExecApprovalsPatch: (path, value) =>
                    updateExecApprovalsFormValue(state, path, value),
                  onExecApprovalsRemove: (path) => removeExecApprovalsFormValue(state, path),
                  onSaveExecApprovals: () => {
                    const target =
                      state.execApprovalsTarget === "node" && state.execApprovalsTargetNodeId
                        ? { kind: "node" as const, nodeId: state.execApprovalsTargetNodeId }
                        : { kind: "gateway" as const };
                    return saveExecApprovals(state, target);
                  },
                },
                discoveryLoading: state.networkDiscoveryLoading,
                discoveredGateways: state.networkDiscoveredGateways,
                discoveryError: state.networkDiscoveryError,
                onDiscover: () => discoverGateways(state),
                probeLoading: state.networkProbeLoading,
                probeResult: state.networkProbeResult,
                onProbe: (host) => probeGateway(state, host),
                interfacesLoading: state.networkInterfacesLoading,
                interfaces: state.networkInterfaces,
                configureLoading: state.networkConfigureLoading,
                configureError: state.networkConfigureError,
                onConfigure: (params) => configureNetworkMode(state, params),
              })
            : nothing
        }

        ${renderUpdateBanner(
          state.updateAvailable && !state.updateDialogOpen
            ? {
                version: state.updateAvailable.version,
                summary: state.updateAvailable.summary,
                mandatory: state.updateAvailable.mandatory,
                onView: () => {
                  state.updateResult = null;
                  state.updateProgress = null;
                  state.updateDialogOpen = true;
                },
                onDismiss: () => {
                  const ver = state.updateAvailable?.version;
                  state.updateAvailable = null;
                  if (ver && state.client) {
                    void state.client.request("update.dismiss", { version: ver }).catch(() => {});
                  }
                },
              }
            : null,
        )}

        ${
          state.updateDialogOpen && state.updateAvailable
            ? renderUpdateDialog({
                info: state.updateAvailable,
                executing: state.updateExecuting,
                progress: state.updateProgress,
                result: state.updateResult,
                onExecute: () => {
                  void state.handleRunUpdate();
                },
                onDismiss: () => {
                  state.updateDialogOpen = false;
                  const ver = state.updateAvailable?.version;
                  state.updateAvailable = null;
                  if (ver && state.client) {
                    void state.client.request("update.dismiss", { version: ver }).catch(() => {});
                  }
                },
                onClose: () => {
                  state.updateDialogOpen = false;
                  state.updateResult = null;
                  state.updateProgress = null;
                },
                onRetry: () => {
                  state.updateResult = null;
                  state.updateProgress = null;
                  void state.handleRunUpdate();
                },
                onRestart: () => {
                  // S5-3: 通知服务端立即重启（取消 30s 自动重启定时器）
                  if (state.client) {
                    void state.client.request("update.restart", {}).catch(() => {});
                  }
                  // CR-11: Tauri 桌面端重启整个应用，Web 端 fallback 到 reload
                  try {
                    const w = window as unknown as {
                      __TAURI_INTERNALS__?: { invoke: (cmd: string) => void };
                    };
                    if (w.__TAURI_INTERNALS__?.invoke) {
                      w.__TAURI_INTERNALS__.invoke("restart");
                      return;
                    }
                  } catch {
                    /* not in Tauri */
                  }
                  window.location.reload();
                },
              })
            : nothing
        }

        ${
          state.tab === "chat" &&
          state.skillsBatch.batchPhase === "banner" &&
          state.skillsBatch.batchCheckResult
            ? renderSkillsBatchBanner({
                missingSkills: state.skillsBatch.batchCheckResult.missing,
                totalSizeBytes: state.skillsBatch.batchCheckResult.total_size_bytes,
                estimatedSeconds: state.skillsBatch.batchCheckResult.estimated_seconds,
                onInstall: () => {
                  state.skillsBatch.batchPhase = "confirm";
                  state.skillsBatch = { ...state.skillsBatch };
                },
                onDismiss: () => {
                  void dismissBanner(Object.assign(state.skillsBatch, { client: state.client }));
                  state.skillsBatch = { ...state.skillsBatch };
                },
                onClose: () => {
                  void dismissBanner(Object.assign(state.skillsBatch, { client: state.client }));
                  state.skillsBatch = { ...state.skillsBatch };
                },
              })
            : nothing
        }
        ${
          state.tab === "chat"
            ? html`
            <div class="chat-with-sidebar">
            ${renderConversationSidebar(
              {
                open: state.convSidebarOpen,
                sessionKey: state.sessionKey,
                sessionsResult: state.sessionsResult,
                sessionsLoading: false,
                connected: state.connected,
                mainKey: (() => {
                  const snap = state.hello?.snapshot as
                    | { sessionDefaults?: { defaultAgentId?: string } }
                    | undefined;
                  const agentId = snap?.sessionDefaults?.defaultAgentId || "main";
                  return `agent:${agentId}:main`;
                })(),
                onToggle: () => {
                  state.convSidebarOpen = !state.convSidebarOpen;
                },
                onSelectSession: (key: string) => switchSession(state, key),
                onNewChat: () => {
                  state.convSidebarOpen = false;
                  switchSession(state, generateUUID());
                },
                onPinSession: (key: string, pinned: boolean) => {
                  void state.client?.request("sessions.pin", { sessionKey: key, pinned });
                },
                onArchiveSession: (key: string) => {
                  void state.client?.request("sessions.archive", { sessionKey: key });
                },
                onDeleteSession: (key: string) => {
                  void state.client
                    ?.request("sessions.delete", { key, deleteTranscript: true })
                    .then(() => loadSessions(state))
                    .catch((err: unknown) => {
                      const msg = err instanceof Error ? err.message : String(err);
                      if (msg.includes("main session")) {
                        alert("无法删除主会话。请在会话管理中重置此会话，或切换到其他会话后再试。");
                      } else if (msg.includes("still active")) {
                        alert("该会话正在运行中，请稍后再试。");
                      } else {
                        alert(`删除会话失败: ${msg}`);
                      }
                    });
                },
                onRenameSession: (key: string, name: string) => {
                  void state.client?.request("sessions.rename", { sessionKey: key, name });
                },
                onViewDetails: (key: string) => {
                  state.sessionsHighlightKey = key;
                  state.setTab("sessions" as Tab);
                },
                onManageAll: () => {
                  state.setTab("sessions" as Tab);
                },
                lastError: isFirstStartup ? null : state.lastError,
                assets: state.convSidebarAssets,
                assetsLoading: state.convSidebarAssetsLoading,
                onAssetsTabActivated: () => {
                  void loadSidebarAssets(state);
                },
                onViewAsset: (asset) => {
                  if (asset.type === "image") {
                    window.open(asset.url, "_blank");
                  } else if (asset.type === "video") {
                    window.open(asset.url, "_blank");
                  }
                },
              },
              () => state.requestUpdate(),
            )}
            <div class="chat-content-area">
            ${
              state.convSidebarOpen
                ? html`
              <div class="chat-content-overlay" @click=${() => {
                state.convSidebarOpen = false;
              }}></div>
            `
                : nothing
            }
            ${renderChat({
              sessionKey: state.sessionKey,
              onSessionKeyChange: (next) => switchSession(state, next),
              thinkingLevel: state.chatThinkingLevel,
              showThinking,
              loading: state.chatLoading,
              sending: state.chatSending,
              compactionStatus: state.compactionStatus,
              assistantAvatarUrl: chatAvatarUrl,
              messages: state.chatMessages,
              toolMessages: state.chatToolMessages,
              stream: state.chatStream,
              justCompleted: state.chatStreamJustCompleted,
              streamStartedAt: state.chatStreamStartedAt,
              mediaToolActive: state.chatMediaToolActive,
              draft: state.chatMessage,
              queue: state.chatQueue,
              connected: state.connected,
              canSend: state.connected,
              disabledReason: chatDisabledReason,
              error: chatError,
              sessions: state.sessionsResult,
              focusMode: chatFocus,
              onRefresh: () => {
                state.resetToolStream();
                return Promise.all([loadChatHistory(state), refreshChatAvatar(state)]);
              },
              onToggleFocusMode: () => {
                if (state.onboarding) {
                  return;
                }
                state.applySettings({
                  ...state.settings,
                  chatFocusMode: !state.settings.chatFocusMode,
                });
              },
              onChatScroll: (event) => state.handleChatScroll(event),
              onDraftChange: (next) => (state.chatMessage = next),
              attachments: state.chatAttachments,
              onAttachmentsChange: (next) => (state.chatAttachments = next),
              onSend: () => {
                state.convSidebarOpen = false;
                void state.handleSendChat();
              },
              canAbort: Boolean(state.chatRunId),
              onAbort: () => void state.handleAbortChat(),
              onQueueRemove: (id) => state.removeQueuedMessage(id),
              onNewSession: () => switchSession(state, generateUUID()),
              // Sidebar props for tool output viewing
              sidebarOpen: state.sidebarOpen,
              sidebarContent: state.sidebarContent,
              sidebarError: state.sidebarError,
              splitRatio: state.splitRatio,
              onOpenSidebar: (content: string) => state.handleOpenSidebar(content),
              onCloseSidebar: () => state.handleCloseSidebar(),
              onSplitRatioChange: (ratio: number) => state.handleSplitRatioChange(ratio),
              assistantName: state.assistantName,
              assistantAvatar: state.assistantAvatar,
              // Discovery props (首次使用发现)
              showDiscovery: shouldShowDiscovery(
                state.discoveryState,
                state.chatMessages.length > 0 || state.chatStream !== null || state.chatLoading,
                state.connected,
              ),
              discoveryProps: buildDiscoveryProps({
                state: state.discoveryState,
                onSuggestionClick: (prompt) => {
                  handleDiscoverySuggestionClick(
                    prompt,
                    {
                      onStateChange: (patch) => {
                        state.discoveryState = { ...state.discoveryState, ...patch };
                      },
                    },
                    (draft) => (state.chatMessage = draft),
                  );
                },
                onSkip: () => {
                  handleDiscoverySkip({
                    onStateChange: (patch) => {
                      state.discoveryState = { ...state.discoveryState, ...patch };
                    },
                  });
                },
                onRetry: () => {
                  void runCapabilityDetection(state.client, {
                    onStateChange: (patch) => {
                      state.discoveryState = { ...state.discoveryState, ...patch };
                    },
                  });
                },
              }),
              // Voice mascot (语音吉祥物)
              voiceMascot:
                state.voiceAsrAvailable === true && !state.voiceMascotDismissed
                  ? {
                      visible: true,
                      recordingState: state.voiceRecordingState,
                      error: state.voiceError,
                      onStartRecording: () => state.handleVoiceStartRecording(),
                      onStopRecording: () => state.handleVoiceStopRecording({ autoSend: true }),
                      onDismiss: () => state.handleVoiceMascotDismiss(),
                    }
                  : null,
              // OpenClawCN: auto-failover banner
              failoverBanner: state.failoverBanner ?? null,
              onDismissFailoverBanner: () => {
                state.failoverBanner = null;
              },
              // OpenClawCN: 聊天模型配置状态
              chatModelConfigured: state.chatModelConfigured,
              onNavigateToModelConfig: () => {
                state.setTab("model-config" as Tab);
              },
              // OpenClawCN: compose-card (豆包风格输入框)
              composeCardProps: {
                draft: state.chatMessage,
                connected: state.connected,
                sending: state.chatSending,
                canAbort: Boolean(state.chatRunId),
                hasStream: state.chatStream !== null,
                placeholder: t("chat.sendMessage"),
                attachments: state.chatAttachments,
                onDraftChange: (next: string) => (state.chatMessage = next),
                onSend: () => {
                  state.convSidebarOpen = false;
                  void state.handleSendChat();
                },
                onAbort: () => void state.handleAbortChat(),
                onAttachmentsChange: (next: ChatAttachment[]) => (state.chatAttachments = next),
                onPaste: (e: ClipboardEvent) => {
                  void handleComposePaste(e, state.chatAttachments, (next: ChatAttachment[]) => {
                    state.chatAttachments = next;
                  });
                },
                voiceAvailable: state.voiceAsrAvailable === true,
                voiceRecording: state.voiceRecordingState === "recording",
                voiceProcessing: state.voiceRecordingState === "processing",
                volumeLevel: state.voiceVolumeLevel,
                onVoiceToggle: (opts?: { autoSend?: boolean }) => {
                  if (state.voiceRecordingState === "recording") {
                    void state.handleVoiceStopRecording(opts);
                  } else {
                    void state.handleVoiceStartRecording();
                  }
                },
                onVoiceUnavailable:
                  state.voiceAsrAvailable !== true
                    ? () => {
                        // 移除已有的引导浮层（防止重复）
                        document.querySelector(".voice-setup-popover-overlay")?.remove();

                        // 创建全屏遮罩 + 居中弹窗（毛玻璃风格，与主页一致）
                        const overlay = document.createElement("div");
                        overlay.className = "voice-setup-popover-overlay";
                        Object.assign(overlay.style, {
                          position: "fixed",
                          top: "0",
                          left: "0",
                          width: "100vw",
                          height: "100vh",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          background: "rgba(255,255,255,0.15)",
                          backdropFilter: "blur(6px)",
                          WebkitBackdropFilter: "blur(6px)",
                          zIndex: "99999",
                        });

                        const el = document.createElement("div");
                        el.className = "voice-setup-popover";
                        el.innerHTML = `
                        <div style="font-size:17px;font-weight:700;margin-bottom:12px;color:#1f2937">开启语音对话</div>
                        <div style="font-size:13px;color:#6b7280;margin-bottom:4px;line-height:1.6">配置<strong style="color:#4b5563">豆包语音</strong>服务后即可<strong style="color:#4b5563">语音输入</strong></div>
                        <div style="font-size:13px;color:#e8915a;font-weight:600;margin-bottom:18px"><strong>免费额度</strong></div>
                        <button data-action="volc" style="display:block;width:100%;padding:10px 0;border:none;border-radius:10px;background:linear-gradient(135deg,#f5a623,#e8915a);color:#fff;font-size:14px;font-weight:600;cursor:pointer;margin-bottom:8px;transition:opacity .15s;box-shadow:0 2px 8px rgba(245,166,35,0.3)">立即配置</button>
                        <button data-action="dismiss" style="display:block;width:100%;padding:7px 0;border:none;border-radius:8px;background:transparent;color:#6b7280;font-size:13px;cursor:pointer;transition:color .15s">稍后再说</button>
                      `;
                        Object.assign(el.style, {
                          padding: "24px 26px",
                          borderRadius: "20px",
                          width: "300px",
                          background:
                            "linear-gradient(160deg, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0.95) 100%)",
                          backdropFilter: "blur(30px) saturate(1.5)",
                          WebkitBackdropFilter: "blur(30px) saturate(1.5)",
                          border: "1px solid rgba(255,255,255,0.6)",
                          boxShadow: "0 8px 32px rgba(91,181,222,0.12), 0 2px 8px rgba(0,0,0,0.06)",
                          textAlign: "center",
                          animation: "voice-popover-in 0.25s ease-out",
                        });

                        overlay.appendChild(el);

                        const cleanup = () => {
                          overlay.remove();
                        };
                        overlay.addEventListener("pointerdown", (ev) => {
                          if (ev.target === overlay) {
                            cleanup();
                          }
                        });

                        el.querySelector('[data-action="volc"]')!.addEventListener("click", () => {
                          cleanup();
                          state.setTab("model-config");
                          // 通知 model-config-view 自动打开豆包语音配置
                          setTimeout(
                            () =>
                              globalThis.dispatchEvent(
                                new CustomEvent(`${brand.eventPrefix}voice-setup`),
                              ),
                            300,
                          );
                        });
                        el.querySelector('[data-action="dismiss"]')!.addEventListener(
                          "click",
                          () => {
                            cleanup();
                          },
                        );

                        document.body.appendChild(overlay);
                      }
                    : undefined,
                voiceMode: state.voiceMode,
                // [CN-PATCH] Hide voice-call (phone) button — feature not ready for production
                // onVoiceModeToggle: () => { void state.toggleVoiceMode(); },
                onToolSelect: (toolId: string) => {
                  const prompts: Record<string, string> = {
                    copywriting: "请帮我写一篇文案：",
                    spreadsheet: "请帮我制作一个表格：",
                    presentation: "请帮我制作一个PPT大纲：",
                    imagegen: "请帮我生成一张图片：",
                    videogen: "请帮我制作一个视频：",
                  };
                  const prompt = prompts[toolId];
                  if (prompt) {
                    state.chatMessage = prompt;
                    // Focus textarea
                    requestAnimationFrame(() => {
                      const ta = document.querySelector(".cc-textarea") as HTMLTextAreaElement;
                      if (ta) {
                        ta.focus();
                        ta.setSelectionRange(prompt.length, prompt.length);
                      }
                    });
                  }
                },
                // Image generation mode
                imageGenMode: (state as unknown as { imageGenMode?: boolean }).imageGenMode,
                // Screen share
                screenShareActive: state.screenShareActive,
                screenShareFrameCount: state.screenShareFrameCount,
                screenShareModelName: state.screenShareModelName ?? undefined,
                onScreenShareToggle: () => {
                  void state.toggleScreenShare();
                },
                // Deep thinking — 开启后自动切换到 power 档
                deepThinking: state.chatDeepThinking,
                onDeepThinkToggle: () => {
                  state.chatDeepThinking = !state.chatDeepThinking;
                  // 开启深度思考时，自动切换到 power 档（不弹确认框）
                  if (state.chatDeepThinking && state.performanceProfile !== "power") {
                    void applyPerformanceProfile(state, "power");
                  }
                },
              },
              // OpenClawCN: intent-hint (智能意图提示)
              intentHintProps: {
                draft: state.chatMessage,
                activeCapabilities:
                  (state as unknown as { activeCapabilities?: string[] }).activeCapabilities ?? [],
                hasImageAttachments: (state.chatAttachments ?? []).some((a) =>
                  a.mimeType?.startsWith("image/"),
                ),
                onNavigateToModelConfig: () => {
                  state.setTab("model-config" as Tab);
                },
              },
              // OpenClawCN: 原 chat-content-toolbar 内容移入 chat card 顶部
              headerStatusContent: html`
                <div class="chat-header-status">
                  ${
                    !state.convSidebarOpen
                      ? renderSidebarToggle(false, () => {
                          state.convSidebarOpen = true;
                        })
                      : nothing
                  }
                  ${
                    state.chatModelConfigured === false
                      ? html`
                    <div class="chat-header-banner">
                      <span class="chat-header-banner__icon">🔑</span>
                      <span class="chat-header-banner__text">
                        聊天功能需要配置 AI 模型，请先前往模型设置完成配置
                      </span>
                      <button class="chat-header-banner__btn" type="button"
                        @click=${() => {
                          state.setTab("model-config" as Tab);
                        }}>前往配置</button>
                    </div>
                  `
                      : state.essentialProviderConfigured === false
                        ? html`
                    <div class="chat-header-banner chat-header-banner--warn">
                      <span class="chat-header-banner__icon">⚡</span>
                      <span class="chat-header-banner__text">
                        记忆、推荐等功能需要 <strong>硅基流动</strong>，模型免费，建议配置
                      </span>
                      <button class="chat-header-banner__btn" type="button"
                        @click=${() => {
                          state.setTab("model-config" as Tab);
                        }}>去配置</button>
                    </div>
                  `
                        : nothing
                  }
                  ${
                    state.lastError && !isDisconnectError
                      ? html`<div class="pill danger">${state.lastError}</div>`
                      : nothing
                  }
                  <div class="topbar-online-status">
                    <span class="topbar-online-dot ${state.connected ? "topbar-online-dot--ok" : ""}"></span>
                    <span class="topbar-online-label">${state.connected ? "在线" : "离线"}</span>
                  </div>
                </div>
              `,
            })}
            ${
              state.imageGalleryOpen
                ? renderImageGallery({
                    images: state.imageGalleryImages ?? [],
                    onClose: () => {
                      state.imageGalleryOpen = false;
                    },
                  })
                : nothing
            }
            </div><!-- .chat-content-area -->
            </div><!-- .chat-with-sidebar -->
          `
            : nothing
        }

        ${
          state.tab === "workspace"
            ? renderWorkspace({
                connected: state.connected,
                loading: state.configLoading,
                saving: state.configSaving,
                dirty: state.configFormDirty,
                workspace:
                  ((
                    (state.configForm?.agents as Record<string, unknown>)?.defaults as Record<
                      string,
                      unknown
                    >
                  )?.workspace as string) ?? "",
                fsWorkspaceOnly:
                  ((
                    (state.configForm?.tools as Record<string, unknown>)?.fs as Record<
                      string,
                      unknown
                    >
                  )?.workspaceOnly as boolean) ?? false,
                memoryWatch:
                  (
                    (
                      (state.configForm?.agents as Record<string, unknown>)?.defaults as Record<
                        string,
                        unknown
                      >
                    )?.memorySearch as Record<string, unknown>
                  )?.sync !== undefined
                    ? (((
                        (
                          (
                            (state.configForm?.agents as Record<string, unknown>)
                              ?.defaults as Record<string, unknown>
                          )?.memorySearch as Record<string, unknown>
                        )?.sync as Record<string, unknown>
                      )?.watch as boolean) ?? false)
                    : false,
                memoryFlush:
                  ((
                    (
                      (state.configForm?.agents as Record<string, unknown>)?.defaults as Record<
                        string,
                        unknown
                      >
                    )?.compaction as Record<string, unknown>
                  )?.memoryFlush as boolean) ?? false,
                onWorkspaceChange: (v) =>
                  updateConfigFormValue(state, ["agents", "defaults", "workspace"], v || undefined),
                onFsWorkspaceOnlyChange: (v) =>
                  updateConfigFormValue(state, ["tools", "fs", "workspaceOnly"], v),
                onMemoryWatchChange: (v) =>
                  updateConfigFormValue(
                    state,
                    ["agents", "defaults", "memorySearch", "sync", "watch"],
                    v,
                  ),
                onMemoryFlushChange: (v) =>
                  updateConfigFormValue(
                    state,
                    ["agents", "defaults", "compaction", "memoryFlush"],
                    v,
                  ),
                onSave: () => saveConfig(state),
              })
            : nothing
        }

        ${
          state.tab === "config"
            ? renderConfig({
                raw: state.configRaw,
                originalRaw: state.configRawOriginal,
                valid: state.configValid,
                issues: state.configIssues,
                loading: state.configLoading,
                saving: state.configSaving,
                applying: state.configApplying,
                updating: state.updateRunning,
                connected: state.connected,
                schema: state.configSchema,
                schemaLoading: state.configSchemaLoading,
                uiHints: state.configUiHints,
                formMode: state.configFormMode,
                formValue: state.configForm,
                originalValue: state.configFormOriginal,
                searchQuery: state.configSearchQuery,
                activeSection: state.configActiveSection,
                activeSubsection: state.configActiveSubsection,
                configFilePath: state.configSnapshot?.path ?? null,
                onRevealConfigFile: state.client
                  ? () => {
                      void state.client!.request("config.reveal", {});
                    }
                  : null,
                onRawChange: (next) => {
                  state.configRaw = next;
                },
                onFormModeChange: (mode) => (state.configFormMode = mode),
                onFormPatch: (path, value) => updateConfigFormValue(state, path, value),
                onSearchChange: (query) => (state.configSearchQuery = query),
                onSectionChange: (section) => {
                  state.configActiveSection = section;
                  state.configActiveSubsection = null;
                },
                onSubsectionChange: (section) => (state.configActiveSubsection = section),
                onReload: () => loadConfig(state),
                onSave: () => saveConfig(state),
                onApply: () => applyConfig(state),
                onUpdate: () => runUpdate(state),
              })
            : nothing
        }

        ${
          state.tab === "debug"
            ? renderDebug({
                loading: state.debugLoading,
                status: state.debugStatus,
                health: state.debugHealth,
                models: state.debugModels,
                heartbeat: state.debugHeartbeat,
                eventLog: state.eventLog,
                callMethod: state.debugCallMethod,
                callParams: state.debugCallParams,
                callResult: state.debugCallResult,
                callError: state.debugCallError,
                onCallMethodChange: (next) => (state.debugCallMethod = next),
                onCallParamsChange: (next) => (state.debugCallParams = next),
                onRefresh: () => loadDebug(state),
                onCall: () => callDebugMethod(state),
              })
            : nothing
        }

        ${
          state.tab === "logs"
            ? renderLogs({
                loading: state.logsLoading,
                error: state.logsError,
                file: state.logsFile,
                entries: state.logsEntries,
                filterText: state.logsFilterText,
                levelFilters: state.logsLevelFilters,
                autoFollow: state.logsAutoFollow,
                truncated: state.logsTruncated,
                onFilterTextChange: (next) => (state.logsFilterText = next),
                onLevelToggle: (level, enabled) => {
                  state.logsLevelFilters = { ...state.logsLevelFilters, [level]: enabled };
                },
                onToggleAutoFollow: (next) => (state.logsAutoFollow = next),
                onRefresh: () => loadLogs(state, { reset: true }),
                onExport: (lines, label) => state.exportLogs(lines, label),
                onRevealLogDir: state.client
                  ? () => {
                      void state.client!.request("logs.reveal", {});
                    }
                  : null,
                onScroll: (event) => state.handleLogsScroll(event),
                onReportIssue: state.connected ? () => state.handleLogReportOpen() : null,
              })
            : nothing
        }

        ${
          state.logReportState.showModal
            ? renderLogReportModal({
                state: state.logReportState,
                onOpen: () => state.handleLogReportOpen(),
                onClose: () => state.handleLogReportClose(),
                onDescriptionChange: (value) => {
                  state.logReportState = { ...state.logReportState, description: value };
                },
                onAddAttachment: (att) => {
                  state.logReportState = {
                    ...state.logReportState,
                    attachments: [...state.logReportState.attachments, att],
                  };
                },
                onRemoveAttachment: (id) => {
                  state.logReportState = {
                    ...state.logReportState,
                    attachments: state.logReportState.attachments.filter((a) => a.id !== id),
                  };
                },
                onImageError: (message) => {
                  state.logReportState = { ...state.logReportState, error: message };
                },
                onSubmit: () => void state.handleLogReportSubmit(),
                onReset: () => {
                  state.logReportState = {
                    ...state.logReportState,
                    description: "",
                    attachments: [],
                    submitting: false,
                    submitted: false,
                    error: null,
                    ticketCode: null,
                    remaining: null,
                  };
                },
                onToggleQueryMode: () => {
                  state.logReportState = {
                    ...state.logReportState,
                    queryMode: !state.logReportState.queryMode,
                    queryError: null,
                    queryResult: null,
                  };
                },
                onQueryCodeChange: (value) => {
                  state.logReportState = { ...state.logReportState, queryCode: value };
                },
                onQuerySubmit: () => void state.handleLogReportQuery(),
              })
            : nothing
        }

        ${state.tab === "feedback" ? renderFeedbackPage(buildFeedbackProps(state)) : nothing}

        ${
          state.tab === "docs"
            ? renderDocs({
                state: state.docsViewState,
                onSearchQueryChange: (query) => {
                  state.docsViewState = handleDocsSearch(state.docsViewState, query);
                },
                onDocSelect: (docId) => {
                  state.docsViewState = handleDocSelect(state.docsViewState, docId);
                },
                onBack: () => {
                  state.docsViewState = handleDocsBack(state.docsViewState);
                },
                onToggleFavorite: (docId) => {
                  handleToggleFavorite(docId);
                  // Force re-render
                  state.docsViewState = { ...state.docsViewState };
                },
                onOpenSearchModal: () => {
                  state.docsViewState = { ...state.docsViewState, showSearchModal: true };
                },
                onCloseSearchModal: () => {
                  state.docsViewState = { ...state.docsViewState, showSearchModal: false };
                },
              })
            : nothing
        }

        ${
          state.tab === "model-config"
            ? html`<model-config-view .client=${state.client} .connected=${state.connected}></model-config-view>`
            : nothing
        }
      </main>
      ${renderExecApprovalPrompt(state)}
      ${renderGatewayUrlConfirmation(state)}
      ${renderSkillInstallApproval(state)}
      ${renderSkillInstallProgress(state)}
      ${renderSkillsBatchOverlays(state)}
      ${nothing}
    </div>
  `;
}

/**
 * 构建反馈组件 props
 */
function buildFeedbackProps(state: AppViewState): FeedbackViewProps {
  return {
    state: state.feedbackState,
    onOpenModal: () => state.handleFeedbackOpen(),
    onCloseModal: () => state.handleFeedbackClose(),
    onTypeChange: (type) => {
      state.feedbackState = { ...state.feedbackState, type };
    },
    onContentChange: (content) => {
      state.feedbackState = { ...state.feedbackState, content };
    },
    onContactChange: (contact) => {
      state.feedbackState = { ...state.feedbackState, contact };
    },
    onAddAttachment: (attachment) => {
      state.feedbackState = {
        ...state.feedbackState,
        attachments: [...state.feedbackState.attachments, attachment],
      };
    },
    onRemoveAttachment: (id) => {
      state.feedbackState = {
        ...state.feedbackState,
        attachments: state.feedbackState.attachments.filter((a) => a.id !== id),
      };
    },
    onSubmit: state.handleFeedbackSubmit,
    onReset: () => {
      state.feedbackState = {
        ...state.feedbackState,
        type: "suggestion",
        content: "",
        contact: "",
        attachments: [],
        submitting: false,
        submitted: false,
        error: null,
      };
    },
  };
}


/**
 * 渲染技能批量安装相关浮层 (confirm / progress / result / complete)
 */
function renderSkillsBatchOverlays(state: AppViewState) {
  const batch = state.skillsBatch;
  const phase = batch.batchPhase;
  const minimized = batch.batchMinimized;

  const withClient = () => Object.assign(batch, { client: state.client });
  const sync = () => {
    state.skillsBatch = { ...batch };
  };

  const onMinimize = () => {
    batch.batchMinimized = true;
    sync();
  };
  const onExpand = () => {
    batch.batchMinimized = false;
    sync();
  };
  const onPillDismiss = () => {
    batch.batchPhase = "idle";
    batch.batchMinimized = false;
    sync();
  };

  // Confirm — never minimizable
  if (phase === "confirm" && batch.batchCheckResult) {
    return renderSkillsBatchConfirm({
      checkResult: batch.batchCheckResult,
      onConfirm: (selectedSkills) => {
        void startBatchInstall(withClient(), selectedSkills);
        sync();
      },
      onCancel: () => {
        batch.batchPhase = "idle";
        sync();
      },
    });
  }

  // Minimized pill for downloading / result / complete
  if (minimized && (phase === "downloading" || phase === "result" || phase === "complete")) {
    return html`
      <div style="position:fixed;bottom:24px;left:24px;z-index:8500;">
        ${renderSkillsBatchPill({
          phase,
          progress: batch.batchProgress,
          skills: batch.batchSkills,
          result: batch.batchResult,
          onExpand,
          onDismiss: onPillDismiss,
        })}
      </div>
      <style>
        @keyframes batchPillIn { from { opacity:0;transform:translateY(20px) scale(0.8); } to { opacity:1;transform:translateY(0) scale(1); } }
        .batch-pill:hover { transform:scale(1.04); }
        .batch-pill:active { transform:scale(0.97); }
      </style>
    `;
  }

  // Full modals (not minimized)
  if (phase === "downloading") {
    return renderSkillsBatchProgress({
      batchState: batch,
      onCancel: () => {
        void cancelBatchInstall(withClient());
        batch.batchPhase = "idle";
        batch.batchId = null;
        sync();
      },
      onMinimize,
    });
  }

  if (phase === "result" && batch.batchResult) {
    return renderSkillsBatchResult({
      succeeded: batch.batchResult.succeeded,
      failed: batch.batchResult.failed,
      durationMs: batch.batchResult.durationMs,
      totalCount: batch.batchResult.succeeded.length + batch.batchResult.failed.length,
      onContinue: () => {
        batch.batchPhase = "idle";
        sync();
      },
      onRetryFailed: () => {
        const failedNames = batch.batchResult!.failed.map((f) => f.name);
        void startBatchInstall(withClient(), failedNames);
        sync();
      },
      onReport: () => {
        void reportBatchFailures(withClient());
        sync();
      },
      reportSent: batch.reportSent,
    });
  }

  if (phase === "complete" && batch.batchResult) {
    return renderSkillsBatchComplete({
      batchState: batch,
      onStartChat: () => {
        batch.batchPhase = "idle";
        sync();
        state.tab = "chat" as Tab;
      },
      onDismiss: () => {
        batch.batchPhase = "idle";
        sync();
      },
    });
  }

  return nothing;
}
