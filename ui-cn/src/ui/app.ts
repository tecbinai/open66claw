import { LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import {
  handleChannelConfigReload as handleChannelConfigReloadInternal,
  handleChannelConfigSave as handleChannelConfigSaveInternal,
  handleNostrProfileCancel as handleNostrProfileCancelInternal,
  handleNostrProfileEdit as handleNostrProfileEditInternal,
  handleNostrProfileFieldChange as handleNostrProfileFieldChangeInternal,
  handleNostrProfileImport as handleNostrProfileImportInternal,
  handleNostrProfileSave as handleNostrProfileSaveInternal,
  handleNostrProfileToggleAdvanced as handleNostrProfileToggleAdvancedInternal,
  handleDeleteBot as handleDeleteBotInternal,
  handleWhatsAppLogout as handleWhatsAppLogoutInternal,
  handleWhatsAppStart as handleWhatsAppStartInternal,
  handleWhatsAppWait as handleWhatsAppWaitInternal,
} from "./app-channels";
import {
  handleAbortChat as handleAbortChatInternal,
  handleSendChat as handleSendChatInternal,
  removeQueuedMessage as removeQueuedMessageInternal,
} from "./app-chat";
import { DEFAULT_CRON_FORM, DEFAULT_LOG_LEVEL_FILTERS } from "./app-defaults";
import type { EventLogEntry } from "./app-events";
import { connectGateway as connectGatewayInternal } from "./app-gateway";
import {
  handleConnected,
  handleDisconnected,
  handleFirstUpdated,
  handleUpdated,
} from "./app-lifecycle";
import { renderApp } from "./app-render";
import {
  exportLogs as exportLogsInternal,
  handleChatScroll as handleChatScrollInternal,
  handleAgentChatScroll as handleAgentChatScrollInternal,
  handleLogsScroll as handleLogsScrollInternal,
  resetChatScroll as resetChatScrollInternal,
} from "./app-scroll";
import {
  applySettings as applySettingsInternal,
  loadCron as loadCronInternal,
  loadOverview as loadOverviewInternal,
  setTab as setTabInternal,
  setTheme as setThemeInternal,
  onPopState as onPopStateInternal,
} from "./app-settings";
import {
  resetToolStream as resetToolStreamInternal,
  type ToolStreamEntry,
} from "./app-tool-stream";
import { resolveInjectedAssistantIdentity } from "./assistant-identity";
import { initCodeBlockCopyHandlers } from "./code-highlight";
import { resetAgentChatState, loadAgentChatHistory } from "./controllers/agent-chat";
import { loadAgents } from "./controllers/agents";
import { createWizardInitialState } from "./views/agent-wizard.js";
import { loadAssistantIdentity as loadAssistantIdentityInternal } from "./controllers/assistant-identity";
import { createInitialDiscoveryState } from "./controllers/capability-detect";
import type { DevicePairingList } from "./controllers/devices";
import type { ExecApprovalRequest } from "./controllers/exec-approval";
import type { ExecApprovalsFile, ExecApprovalsSnapshot } from "./controllers/exec-approvals";
import type { SkillMessage } from "./controllers/skills";
import {
  createDefaultBatchState,
  checkBatchSkills as checkBatchSkillsController,
  handleBatchEvent as handleBatchEventController,
} from "./controllers/skills-batch";
import { loadTeamProjects } from "./controllers/team-projects";
import {
  checkAsrAvailability,
  checkStreamingAsrAvailability,
  dismissMascot,
  endStreamingAsr,
  feedStreamingAsr,
  isMascotDismissed,
  startStreamingAsr,
  transcribeAudio,
} from "./controllers/voice";
// OpenClawCN: 预加载内嵌二维码数据（离线备用）
import { getEmbeddedQrcode } from "./embedded-qrcodes";
import type { GatewayBrowserClient, GatewayHelloOk } from "./gateway";
import { t } from "./i18n/index.js";
import type { Tab } from "./navigation";
import { initQrGuard } from "./qr-guard";
import { loadSettings, type UiSettings } from "./storage";
import type { ResolvedTheme, ThemeMode } from "./theme";
import type {
  AgentsListResult,
  ConfigSnapshot,
  ConfigUiHints,
  CronJob,
  CronRunLogEntry,
  CronStatus,
  HealthSnapshot,
  LogEntry,
  LogLevel,
  PresenceEntry,
  ChannelsStatusSnapshot,
  RemoteSkillsIndex,
  SessionsListResult,
  SkillStatusReport,
  StatusSummary,
  NostrProfile,
} from "./types";
import { type ChatAttachment, type ChatQueueItem, type CronFormState } from "./ui-types";
import type { NostrProfileFormState } from "./views/channels.nostr-profile-form";
import type {
  ChannelRouteAgentOption,
  ChannelRouteEntry,
  ChannelRouteProjectOption,
} from "./views/channels.types";
import { setupContextMenuDismiss } from "./views/conversation-sidebar";
import type { RecordingState } from "./voice/audio-recorder";
import { AudioRecorder } from "./voice/audio-recorder";
import {
  StreamingAudioRecorder,
  type SilenceDetectionOptions,
} from "./voice/streaming-audio-recorder";

declare global {
  interface Window {
    __CLAWDBOT_CONTROL_UI_BASE_PATH__?: string;
    __OPENCLAWCN_CONTROL_UI_BASE_PATH__?: string;
  }
}

const injectedAssistantIdentity = resolveInjectedAssistantIdentity();

function resolveOnboardingMode(): boolean {
  if (!window.location.search) {
    return false;
  }
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("onboarding");
  if (!raw) {
    return false;
  }
  const normalized = raw.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

@customElement("openclaw-cn-app")
export class ClawdbotApp extends LitElement {
  @state() settings: UiSettings = loadSettings();
  @state() password = "";
  @state() tab: Tab = "chat";
  @state() onboarding = resolveOnboardingMode();
  @state() connected = false;
  @state() theme: ThemeMode = this.settings.theme ?? "light";
  @state() themeResolved: ResolvedTheme = "light";
  @state() hello: GatewayHelloOk | null = null;
  @state() lastError: string | null = null;
  @state() eventLog: EventLogEntry[] = [];
  private eventLogBuffer: EventLogEntry[] = [];
  private toolStreamSyncTimer: number | null = null;
  private sidebarCloseTimer: number | null = null;

  @state() assistantName = injectedAssistantIdentity.name;
  @state() assistantAvatar = injectedAssistantIdentity.avatar;
  @state() assistantAgentId = injectedAssistantIdentity.agentId ?? null;

  @state() sessionKey = this.settings.sessionKey;
  @state() chatLoading = false;
  @state() chatSending = false;
  @state() chatMessage = "";
  @state() chatMessages: unknown[] = [];
  @state() chatToolMessages: unknown[] = [];
  @state() chatStream: string | null = null;
  @state() chatStreamStartedAt: number | null = null;
  @state() chatMediaToolActive: { tool: string; args?: Record<string, unknown> } | null = null;
  @state() chatRunId: string | null = null;
  @state() chatStreamJustCompleted = false;
  /** 计时器 ID，用于 justCompleted 自动清除（app-gateway / app-chat 需要访问） */
  _justCompletedTimer = 0;
  @state() compactionStatus: import("./app-tool-stream").CompactionStatus | null = null;
  // API Response Monitor state
  @state() apiMonitorElapsedMs = 0;
  @state() apiMonitorDismissed = false;
  apiMonitorTimer: number | null = null;
  @state() chatAvatarUrl: string | null = null;
  @state() chatThinkingLevel: string | null = null;
  @state() chatQueue: ChatQueueItem[] = [];
  @state() chatAttachments: ChatAttachment[] = [];
  // OpenClawCN: auto-failover notification banner
  @state() failoverBanner: import("./app-view-state").AppViewState["failoverBanner"] = null;
  // OpenClawCN: 聊天模型是否已配置（text capability active）
  @state() chatModelConfigured: boolean | null = null;
  // OpenClawCN: 必要 provider（硅基流动）是否已配置
  @state() essentialProviderConfigured: boolean | null = null;
  // OpenClawCN: 首次启动引导中
  @state() firstRunGuide = false;
  // OpenClawCN: 当前已激活的能力列表（用于 intent-hint 判断缺失能力）
  @state() activeCapabilities: string[] = [];
  // OpenClawCN: 生图模式开关
  @state() imageGenMode = false;
  // Voice / ASR state
  @state() voiceAsrAvailable: boolean | null = null;
  @state() voiceStreamingAsrAvailable = false;
  @state() voiceMascotDismissed = isMascotDismissed();
  @state() voiceRecordingState: RecordingState = "idle";
  @state() voiceError: string | null = null;
  @state() voiceMode = false;
  @state() voiceWakeListening = false;
  @state() voiceVolumeLevel = 0;
  @state() voiceStreamSessionId: string | null = null;
  @state() voicePartialText = "";
  private audioRecorder: AudioRecorder | null = null;
  private streamingRecorder: StreamingAudioRecorder | null = null;
  private voiceErrorTimer: ReturnType<typeof setTimeout> | null = null;
  private _asrHealthTimer: ReturnType<typeof setTimeout> | null = null;
  /** True when handleSendChat() is stopping a recording — prevents double-send in voice mode. */
  private _sendingStopsRecording = false;
  /** Set by handleVoiceStopRecording to tell batch onComplete to auto-send. */
  private _batchAutoSend = false;
  /** Track runs initiated by voice input — triggers TTS on AI response. */
  _voiceInputRunIds = new Set<string>();
  private _ttsAudio: HTMLAudioElement | null = null;
  /** Streaming TTS: audio queue for chunk-by-chunk playback. */
  private _ttsQueue: Array<{ base64: string; format: string }> = [];
  /** Whether a TTS chunk is currently being played from the queue. */
  private _ttsQueuePlaying = false;
  /** Whether the final tts.chunk (isFinal=true) has been received for the current run. */
  private _ttsQueueFinalReceived = false;

  // OpenClawCN: Screen Share
  @state() screenShareActive = false;
  @state() screenShareFrameCount = 0;
  @state() screenShareModelName: string | null = null;
  /** Latest captured frame — plain property, not @state(), to avoid re-rendering on every 3s frame. */
  screenShareLatestFrame: string | null = null;
  private screenLive: import("./screen/screen-live").ScreenLive | null = null;

  // OpenClawCN: Orchestrator (智能组队)
  @state() orchestratorOpen = false;
  @state() orchestratorState: Record<string, unknown> | null = null;

  // OpenClawCN: Update system
  @state() updateAvailable: import("./views/update-dialog").UpdateAvailableInfo | null = null;
  @state() updateDialogOpen = false;
  @state() updateExecuting = false;
  @state() updateProgress: import("./views/update-dialog").UpdateProgress | null = null;
  @state() updateResult: import("./views/update-dialog").UpdateResult | null = null;

  // OpenClawCN: Conversation sidebar
  @state() convSidebarOpen = false;
  @state() convSidebarAssets: import("./views/conversation-sidebar").DigitalAsset[] = [];
  @state() convSidebarAssetsLoading = false;
  @state() convSidebarAssetsSessionKey = "";

  // OpenClawCN: Image gallery overlay
  @state() imageGalleryOpen = false;
  @state() imageGalleryImages: Array<{
    url: string;
    prompt?: string;
    model?: string;
    timestamp?: number;
  }> = [];

  // Sidebar state for tool output viewing
  @state() sidebarOpen = false;
  @state() sidebarContent: string | null = null;
  @state() sidebarError: string | null = null;
  @state() splitRatio = this.settings.splitRatio;

  // OpenClawCN: Networking Center
  @state() networkTab: import("./app-view-state.js").NetworkTab = "devices";
  @state() networkStatusLoading = false;
  @state() networkStatus: import("./app-view-state.js").NetworkCenterStatus | null = null;
  @state() networkStatusError: string | null = null;
  @state() networkDiscoveryLoading = false;
  @state() networkDiscoveredGateways: import("./app-view-state.js").NetworkDiscoveredGateway[] = [];
  @state() networkDiscoveryError: string | null = null;
  @state() networkProbeLoading = false;
  @state() networkProbeResult: import("./app-view-state.js").NetworkProbeResult | null = null;
  @state() networkInterfacesLoading = false;
  @state() networkInterfaces: import("./app-view-state.js").NetworkInterfaceInfo[] = [];
  @state() networkConfigureLoading = false;
  @state() networkConfigureError: string | null = null;

  @state() nodesLoading = false;
  @state() nodes: Array<Record<string, unknown>> = [];
  @state() devicesLoading = false;
  @state() devicesError: string | null = null;
  @state() devicesList: DevicePairingList | null = null;
  @state() execApprovalsLoading = false;
  @state() execApprovalsSaving = false;
  @state() execApprovalsDirty = false;
  @state() execApprovalsSnapshot: ExecApprovalsSnapshot | null = null;
  @state() execApprovalsForm: ExecApprovalsFile | null = null;
  @state() execApprovalsSelectedAgent: string | null = null;
  @state() execApprovalsTarget: "gateway" | "node" = "gateway";
  @state() execApprovalsTargetNodeId: string | null = null;
  @state() execApprovalQueue: ExecApprovalRequest[] = [];
  @state() execApprovalBusy = false;
  @state() execApprovalError: string | null = null;

  @state() showOfflineBanner = false;

  // QR 码预加载状态
  @state() qrcodePreloading = false;
  @state() qrcodePreloaded = false;
  @state() qrcodeExpiresAt: number | null = null;
  // HTTP fallback QR 码（断连时通过 /api/support/qrcode 获取）
  @state() fallbackQrcode: { base64: string; groupName: string } | null = null;

  // 能力发现状态 (Capability Discovery)
  @state() discoveryState: import("./controllers/capability-detect").DiscoveryControllerState =
    createInitialDiscoveryState();

  // 智能推荐开关 (Smart Dispatch Toggle) - 出厂默认关闭，用户通过 UI 开关控制
  @state() smartDispatchEnabled = false;
  @state() smartDispatchSaving = false;
  // 性能档位 (Performance Profile)
  @state() performanceProfile: "economy" | "balanced" | "power" = "power";
  @state() performanceProfileSaving = false;
  // 深度思考模式 (Deep Thinking) - 开启后自动切换到 power 档
  @state() chatDeepThinking = false;

  @state() pendingGatewayUrl: string | null = null;

  @state() configLoading = false;
  @state() configRaw = "{\n}\n";
  @state() configRawOriginal = "";
  @state() configValid: boolean | null = null;
  @state() configIssues: unknown[] = [];
  @state() configSaving = false;
  @state() configApplying = false;
  @state() updateRunning = false;
  @state() applySessionKey = this.settings.lastActiveSessionKey;
  @state() configSnapshot: ConfigSnapshot | null = null;
  @state() configSchema: unknown = null;
  @state() configSchemaVersion: string | null = null;
  @state() configSchemaLoading = false;
  @state() configUiHints: ConfigUiHints = {};
  @state() configForm: Record<string, unknown> | null = null;
  @state() configFormOriginal: Record<string, unknown> | null = null;
  @state() configFormDirty = false;
  @state() configFormMode: "form" | "raw" = "form";
  @state() configSearchQuery = "";
  @state() configActiveSection: string | null = null;
  @state() configActiveSubsection: string | null = null;

  // 模型选择状态 (Model Selection)
  @state() modelsLoading = false;
  @state() modelsProviders: import("./controllers/models").ProviderInfo[] = [];
  @state() modelsDefaults: Record<string, string> = {};
  @state() modelsCurrent: import("./controllers/models").CurrentModelInfo | null = null;
  @state() modelsSaving = false;
  @state() modelsError: string | null = null;
  @state() modelsSuccessMessage: string | null = null; // 成功消息
  // 待保存的模型选择（用户选择后需要点击保存才生效）
  @state() modelsPendingProvider: string | null = null;
  @state() modelsPendingModel: string | null = null;
  @state() modelsConfiguringProvider: string | null = null; // 正在配置的提供商 ID
  @state() modelsAuthSaving = false; // API Key 保存中
  @state() modelsAuthVerifying = false; // API Key 验证中
  @state() modelsAuthVerifyResult: import("./controllers/models").ApiKeyVerifyResult | null = null; // 验证结果

  // 安全模式状态 (Security Mode)
  @state() securityLoading = false;
  @state() securityModes: import("./controllers/security").SecurityModeInfo[] = [];
  @state() securityCurrent: import("./controllers/security").SecurityMode | null = null;
  @state() securitySaving = false;
  @state() securityError: string | null = null;
  @state() securityShowWarning = false; // 显示危险警告弹框
  @state() securitySuccessMessage: string | null = null; // 安全模式切换成功消息

  // 免费模型管理状态 (Free Models)
  @state() freeModelsLoading = false;
  @state() freeModelsEnabled = false;
  @state() freeModelsProviders: import("./views/free-models").FreeModelProvider[] = [];
  @state() freeModelsAccounts: import("./views/free-models").FreeModelAccount[] = [];
  @state() freeModelsStats: import("./views/free-models").FreeModelsStats = {
    todaySavings: 0,
    totalSavings: 0,
    todayFreeRequests: 0,
    lastResetDate: new Date().toISOString().split("T")[0],
  };
  @state() freeModelsSwitchHistory: import("./views/free-models").FreeModelSwitchRecord[] = [];
  @state() freeModelsError: string | null = null;
  @state() freeModelsConfigModalOpen = false;
  @state() freeModelsConfigModalProvider: import("./views/free-models").FreeModelProvider | null =
    null;
  @state() freeModelsConfigModalApiKey = "";
  @state() freeModelsConfigModalTesting = false;
  @state() freeModelsConfigModalTestResult: { success: boolean; message: string } | null = null;
  @state() freeModelsConfigModalSaving = false;
  @state() freeModelsDeleteModalOpen = false;
  @state() freeModelsDeleteModalProvider: import("./views/free-models").FreeModelProvider | null =
    null;
  @state() freeModelsDeleteModalDeleting = false;

  @state() channelsLoading = false;
  @state() channelsSnapshot: ChannelsStatusSnapshot | null = null;
  @state() channelsError: string | null = null;
  @state() channelsLastSuccess: number | null = null;
  @state() whatsappLoginMessage: string | null = null;
  @state() whatsappLoginQrDataUrl: string | null = null;
  @state() whatsappLoginConnected: boolean | null = null;
  @state() whatsappBusy = false;
  @state() channelRouteSummary: ChannelRouteEntry[] | null = null;
  @state() channelRouteProjects: ChannelRouteProjectOption[] | null = null;
  @state() channelRouteAgents: ChannelRouteAgentOption[] | null = null;
  @state() channelRouteSaving = false;
  @state() channelRouteSavedHint = false;
  @state() channelsSelectedKey: string | null = null;
  @state() channelsWizardOpen = false;
  @state() channelsWizardAccountId: string | null = null;
  @state() channelsWizardIsNew = false;
  @state() channelDeletingBotId: string | null = null;
  @state() nostrProfileFormState: NostrProfileFormState | null = null;
  @state() nostrProfileAccountId: string | null = null;

  @state() presenceLoading = false;
  @state() presenceEntries: PresenceEntry[] = [];
  @state() presenceError: string | null = null;
  @state() presenceStatus: string | null = null;

  @state() agentsLoading = false;
  @state() agentsList: AgentsListResult | null = null;
  @state() agentsError: string | null = null;
  @state() agentsSelectedId: string | null = null;
  @state() agentCreating = false;
  @state() agentCreateError: string | null = null;
  @state() agentCreateSuccess = false;
  @state() agentDeleting = false;
  @state() agentDeleteError: string | null = null;
  @state() agentWizard = createWizardInitialState();
  @state() agentsPanel:
    | "overview"
    | "outputs"
    | "files"
    | "tools"
    | "skills"
    | "channels"
    | "cron"
    | "chat" = "overview";
  @state() agentFilesLoading = false;
  @state() agentFilesError: string | null = null;
  @state() agentFilesList: import("./types").AgentsFilesListResult | null = null;
  @state() agentFileContents: Record<string, string> = {};
  @state() agentFileDrafts: Record<string, string> = {};
  @state() agentFileActive: string | null = null;
  @state() agentFileSaving = false;
  // Agent outputs (workspace files)
  @state() agentOutputsLoading = false;
  @state() agentOutputsError: string | null = null;
  @state() agentOutputsList: import("./types").AgentOutputsListResult | null = null;
  @state() agentOutputActive: string | null = null;
  @state() agentOutputContent: string | null = null;
  @state() agentOutputContentLoading = false;
  @state() agentIdentityLoading = false;
  @state() agentIdentityError: string | null = null;
  @state() agentIdentityById: Record<string, import("./types").AgentIdentityResult> = {};
  @state() agentSkillsLoading = false;
  @state() agentSkillsError: string | null = null;
  @state() agentSkillsReport: SkillStatusReport | null = null;
  @state() agentSkillsAgentId: string | null = null;
  @state() dmScopeStatus: import("./app-view-state").AppViewState["dmScopeStatus"] = null;

  // Agent embedded chat
  @state() agentChatSessionKey = "";
  @state() agentChatMessages: unknown[] = [];
  @state() agentChatStream: string | null = null;
  @state() agentChatStreamStartedAt: number | null = null;
  @state() agentChatRunId: string | null = null;
  @state() agentChatSending = false;
  @state() agentChatLoading = false;
  @state() agentChatMessage = "";
  @state() agentChatAttachments: ChatAttachment[] = [];
  @state() agentChatError: string | null = null;

  // Team Projects
  @state() teamProjectsLoading = false;
  @state() teamProjectsList: import("./types").TeamProjectSummary[] | null = null;
  @state() teamProjectsError: string | null = null;
  @state() teamProjectSelectedId: string | null = null;
  @state() teamProjectDetail: import("./types").TeamProjectDetail | null = null;
  @state() teamProjectDetailLoading = false;
  @state() teamProjectHealth: import("./types").TeamProjectHealthResult | null = null;
  @state() teamProjectStats: import("./types").TeamProjectStatsResult | null = null;
  @state() teamProjectMemory: import("./types").TeamSharedMemoryEntry[] | null = null;
  @state() teamProjectActivity: import("./types").TeamActivityEvent[] | null = null;
  @state() teamProjectFiles: import("./types").ProjectWorkspaceFilesResult | null = null;
  @state() teamProjectTab: "members" | "activity" | "stats" | "settings" | "memory" | "files" =
    "members";
  @state() teamProjectBusy = false;

  @state() sessionsLoading = false;
  @state() sessionsResult: SessionsListResult | null = null;
  @state() sessionsError: string | null = null;
  @state() sessionsFilterActive = "";
  @state() sessionsFilterLimit = "120";
  @state() sessionsIncludeGlobal = true;
  @state() sessionsIncludeUnknown = false;
  @state() sessionsHighlightKey = "";
  @state() sessionsSearchQuery = "";
  // Track chat runs that should trigger session refresh on completion
  refreshSessionsAfterChat = new Set<string>();

  @state() cronLoading = false;
  @state() cronJobs: CronJob[] = [];
  @state() cronStatus: CronStatus | null = null;
  @state() cronError: string | null = null;
  @state() cronForm: CronFormState = { ...DEFAULT_CRON_FORM };
  @state() cronRunsJobId: string | null = null;
  @state() cronRuns: CronRunLogEntry[] = [];
  @state() cronBusy = false;

  @state() skillsLoading = false;
  @state() skillsReport: SkillStatusReport | null = null;
  @state() skillsError: string | null = null;
  @state() skillsFilter = "";
  @state() skillsTierRenderKey = 0;
  @state() skillEdits: Record<string, string> = {};
  @state() skillsBusyKey: string | null = null;
  @state() skillMessages: Record<string, SkillMessage> = {};
  @state() skillsInstallProgress: Record<string, import("./controllers/skills").InstallProgress> =
    {};
  @state() skillsActiveTab: "active" | "library" | "blocked" | "mcp-store" | "market" = "active";
  @state() skillsRemoteLoading = false;
  @state() skillsRemoteIndex: RemoteSkillsIndex | null = null;
  @state() skillsRemoteError: string | null = null;
  // 新的市场状态（基于本地索引）
  @state() skillsMarketLoading = false;
  @state() skillsMarketResponse: import("./types").SkillsMarketResponse | null = null;
  @state() skillsMarketSyncing = false;
  @state() skillsMarketLastSyncedAt: string | null = null;
  @state() skillsMarketError: string | null = null;
  // 技能分类筛选
  @state() skillsActiveCategory = "all";
  // 技能市场搜索关键词（与本地 skillsFilter 分离）
  @state() skillsMarketKeyword = "";
  // 技能市场搜索结果（SQLite FTS5 分页）
  @state() skillsMarketSearchResult:
    | import("./controllers/skills").SkillsMarketSearchResult
    | null = null;
  @state() skillsMarketPage = 1;
  // 技能列表分页
  @state() skillsVisibleCount = 50;
  // 统一视图层级筛选
  @state() skillsTierGroupFilter:
    | "all"
    | "core"
    | "ready"
    | "needs-config"
    | "disabled"
    | "catalog" = "all";
  // 导入本地技能
  @state() skillsImportOpen = false;
  @state() skillsImportPath = "";
  @state() skillsImportBrowseResult: import("./controllers/skills").BrowseResult | null = null;
  @state() skillsImportLoading = false;
  @state() skillsImportError: string | null = null;
  @state() skillsImportSuccess: string | null = null;

  // 详情弹窗
  @state() selectedSkillKey: string | null = null;
  @state() selectedMarketSkill:
    | import("./controllers/skills").SkillsMarketSearchResult["items"][number]
    | null = null;
  // 侧栏 tier 筛选
  @state() sidebarTierFilter: "all" | "core" | "ready" | "needs-config" = "all";

  // Playground 状态（技能玩法推荐）
  @state() playgroundLoading = false;
  @state() playgroundReport: import("./types").SkillStatusReport | null = null;
  @state() playgroundError: string | null = null;
  @state() playgroundActiveCategory: string | null = null;
  @state() playgroundFilter: string = "";
  @state() playgroundInstallingSkill: string | null = null;
  @state() playgroundInstallMessage: string | null = null;

  // 技能安装进度弹框状态
  @state() skillInstallQueue: import("./views/skill-install-approval").SkillInstallRequest[] = [];
  @state() skillInstallProgress:
    | import("./views/skill-install-progress").SkillInstallProgress
    | null = null;
  @state() skillInstallBusy = false;
  @state() skillInstallError: string | null = null;

  // 技能批量安装状态 (Skills Batch Install)
  @state() skillsBatch = createDefaultBatchState();
  private batchPillAutoDismissTimer: number | null = null;
  handleBatchEvent = (event: Record<string, unknown>) => {
    handleBatchEventController(this.skillsBatch, event);
    // Trigger Lit re-render by reassigning the state object
    this.skillsBatch = { ...this.skillsBatch };
  };
  checkBatchSkills = async () => {
    // Augment state with client reference — controller mutates in-place
    const proxy = Object.assign(this.skillsBatch, {
      client: this.client,
      connected: this.connected,
    });
    await checkBatchSkillsController(proxy);
    this.skillsBatch = { ...this.skillsBatch };
  };

  // MCP 扩展工具状态 (Extensions)
  @state() mcpCapabilities: import("./app-view-state").McpCapability[] = [];
  @state() mcpAdvancedOpen = false;
  @state() mcpUpdateNotice: { count: number; names: string[] } | null = null;
  @state() mcpProcesses: import("./app-view-state").McpProcessInfo[] = [];
  @state() mcpExtTab: import("./app-view-state").McpExtensionsTab = "my";
  @state() mcpMarketplace: import("./app-view-state").McpMarketplaceState = {
    items: [],
    loading: false,
    error: null,
    search: "",
    activeCategory: "all",
    sort: "recommended",
    recommendations: [],
    showFirstVisit: !localStorage.getItem("openclawcn.mcp.firstVisitSeen"),
    detailItem: null,
    configTarget: null,
    toast: null,
    showBatchConfig: false,
    page: 1,
    pageSize: 50,
    total: 0,
    totalPages: 0,
    loadingMore: false,
  };
  @state() mcpTestingServerId: string | null = null;
  @state() mcpTestResults: Record<string, "success" | "failed"> = {};
  @state() mcpEnablingServerId: string | null = null;
  @state() mcpManualFormTrigger = 0;
  /** Timer for auto-clearing MCP toast notifications */
  _mcpToastTimer: number | null = null;
  /** Batch API key config state */
  @state() _mcpBatchConfigSaving = false;
  @state() _mcpBatchConfigResult: { success: number; failed: number } | null = null;
  @state() _mcpServerEnvStatus: Record<string, Record<string, boolean>> = {};

  // 文档中心状态
  @state() docsViewState: import("./views/docs").DocsViewState = {
    mode: "home",
    searchQuery: "",
    searchResults: [],
    currentDocId: null,
    showSearchModal: false,
  };

  // 适配公告弹框（仅显示一次）
  @state() showAdaptationNotice = !localStorage.getItem("openclawcn.chat.adaptationNoticeSeen");

  // 日志上报运维中心状态
  @state() logReportState: import("./views/log-report").LogReportViewState = {
    showModal: false,
    description: "",
    attachments: [],
    submitting: false,
    submitted: false,
    error: null,
    ticketCode: null,
    remaining: null,
    queryMode: false,
    queryCode: "",
    querying: false,
    queryResult: null,
    queryError: null,
  };

  // 意见反馈状态
  @state() feedbackState: import("./views/feedback").FeedbackViewState = {
    showModal: false,
    type: "suggestion",
    content: "",
    contact: "",
    attachments: [],
    submitting: false,
    submitted: false,
    error: null,
  };

  // Token 使用量统计状态 (简易视图，保留向后兼容)
  @state() usageSummary: import("./types").CostUsageSummary | null = null;
  @state() usageDays = 30;
  // 高级 Usage 分析系统
  @state() usageLoading = false;
  @state() usageResult: import("./types").SessionsUsageResult | null = null;
  @state() usageCostSummary: import("./types").CostUsageSummary | null = null;
  @state() usageError: string | null = null;
  @state() usageStartDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  @state() usageEndDate = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  @state() usageSelectedSessions: string[] = [];
  @state() usageSelectedDays: string[] = [];
  @state() usageSelectedHours: number[] = [];
  @state() usageChartMode: "tokens" | "cost" = "tokens";
  @state() usageDailyChartMode: "total" | "by-type" = "by-type";
  @state() usageTimeSeriesMode: "cumulative" | "per-turn" = "per-turn";
  @state() usageTimeSeriesBreakdownMode: "total" | "by-type" = "by-type";
  @state() usageTimeSeries: import("./types").SessionUsageTimeSeries | null = null;
  @state() usageTimeSeriesLoading = false;
  @state() usageSessionLogs: import("./views/usage").SessionLogEntry[] | null = null;
  @state() usageSessionLogsLoading = false;
  @state() usageSessionLogsExpanded = false;
  @state() usageQuery = "";
  @state() usageQueryDraft = "";
  @state() usageSessionSort: "tokens" | "cost" | "recent" | "messages" | "errors" = "recent";
  @state() usageSessionSortDir: "desc" | "asc" = "desc";
  @state() usageRecentSessions: string[] = [];
  @state() usageTimeZone: "local" | "utc" = "local";
  @state() usageContextExpanded = false;
  @state() usageHeaderPinned = false;
  @state() usageSessionsTab: "all" | "recent" = "all";
  @state() usageVisibleColumns: string[] = [
    "channel",
    "agent",
    "provider",
    "model",
    "messages",
    "tools",
    "errors",
    "duration",
  ];
  @state() usageLogFilterRoles: import("./views/usage").SessionLogRole[] = [];
  @state() usageLogFilterTools: string[] = [];
  @state() usageLogFilterHasTools = false;
  @state() usageLogFilterQuery = "";
  usageQueryDebounceTimer: number | null = null;

  @state() debugLoading = false;
  @state() debugStatus: StatusSummary | null = null;
  @state() debugHealth: HealthSnapshot | null = null;
  @state() debugModels: unknown[] = [];
  @state() debugHeartbeat: unknown = null;
  @state() debugCallMethod = "";
  @state() debugCallParams = "{}";
  @state() debugCallResult: string | null = null;
  @state() debugCallError: string | null = null;

  @state() logsLoading = false;
  @state() logsError: string | null = null;
  @state() logsFile: string | null = null;
  @state() logsEntries: LogEntry[] = [];
  @state() logsFilterText = "";
  @state() logsLevelFilters: Record<LogLevel, boolean> = {
    ...DEFAULT_LOG_LEVEL_FILTERS,
  };
  @state() logsAutoFollow = true;
  @state() logsTruncated = false;
  @state() logsCursor: number | null = null;
  @state() logsLastFetchAt: number | null = null;
  @state() logsLimit = 500;
  @state() logsMaxBytes = 250_000;
  @state() logsAtBottom = true;

  client: GatewayBrowserClient | null = null;
  private chatScrollFrame: number | null = null;
  private chatScrollTimeout: number | null = null;
  private chatHasAutoScrolled = false;
  private chatUserNearBottom = true;
  private agentChatScrollFrame: number | null = null;
  private agentChatScrollTimeout: number | null = null;
  private agentChatUserNearBottom = true;
  private nodesPollInterval: number | null = null;
  private logsPollInterval: number | null = null;
  private debugPollInterval: number | null = null;
  private mcpPollInterval: number | null = null;
  private logsScrollFrame: number | null = null;
  private toolStreamById = new Map<string, ToolStreamEntry>();
  private toolStreamOrder: string[] = [];
  // readingIndicatorTimer removed — apiMonitorTimer (1s) already triggers re-render
  basePath = "";
  private popStateHandler = () =>
    onPopStateInternal(this as unknown as Parameters<typeof onPopStateInternal>[0]);
  private themeMedia: MediaQueryList | null = null;
  private themeMediaHandler: ((event: MediaQueryListEvent) => void) | null = null;
  private topbarObserver: ResizeObserver | null = null;

  createRenderRoot() {
    return this;
  }

  private _silentNewHandler: (() => void) | null = null;
  private _modelSwitchedHandler: (() => void) | null = null;
  private _imageGenRegenerateHandler: ((e: Event) => void) | null = null;
  private _videoGenRegenerateHandler: ((e: Event) => void) | null = null;
  private _contextMenuDismissCleanup: (() => void) | null = null;
  private _orchNavigateHandler: ((e: Event) => void) | null = null;
  private _orchAgentsChangedHandler: (() => void) | null = null;
  private _voiceCredsChangedHandler: (() => void) | null = null;
  private _tauriUpdateHandler: ((e: Event) => void) | null = null;
  private _tauriProgressHandler: ((e: Event) => void) | null = null;

  private handleDocsKeydown = (e: KeyboardEvent) => {
    // ⌘K or Ctrl+K to open docs search
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      if (this.tab === "docs") {
        this.docsViewState = { ...this.docsViewState, showSearchModal: true };
      } else {
        // 切换到文档页面并打开搜索
        this.tab = "docs";
        this.docsViewState = { ...this.docsViewState, showSearchModal: true };
      }
    }
    // Esc to close docs search modal
    if (e.key === "Escape" && this.docsViewState.showSearchModal) {
      e.preventDefault();
      this.docsViewState = { ...this.docsViewState, showSearchModal: false };
    }
  };

  connectedCallback() {
    super.connectedCallback();
    handleConnected(this as unknown as Parameters<typeof handleConnected>[0]);
    document.addEventListener("keydown", this.handleDocsKeydown);
    // 初始化代码块复制功能（事件委托，只需初始化一次）
    initCodeBlockCopyHandlers();
    // 初始化 QR 码截屏保护
    initQrGuard();
    // OpenClawCN: 全局点击关闭会话侧栏右键菜单
    this._contextMenuDismissCleanup = setupContextMenuDismiss(() => this.requestUpdate());
    // 模型切换后静默清空聊天 UI（服务端 session 不动，modelOverride 已由 updateSessionModelOverrides 更新）
    // 需要 abort 正在运行的请求，否则旧请求使用旧模型配置会导致超时/错误
    this._silentNewHandler = () => {
      if (this.chatRunId) {
        void this.handleAbortChat();
      }
      this.chatMessages = [];
      this.chatStream = null;
      this.chatRunId = null;
      this.chatQueue = [];
      this.chatMediaToolActive = null;
      this.resetToolStream();
    };
    globalThis.addEventListener("openclawcn:silent-new", this._silentNewHandler);
    // 模型切换后：只中止正在运行的旧请求，保留聊天记录，下一条消息自动使用新模型
    this._modelSwitchedHandler = () => {
      if (this.chatRunId) {
        void this.handleAbortChat();
      }
      this.chatStream = null;
      this.chatMediaToolActive = null;
      this.resetToolStream();
    };
    globalThis.addEventListener("openclawcn:model-switched", this._modelSwitchedHandler);
    // OpenClawCN: 图片重新生成事件
    this._imageGenRegenerateHandler = (e: Event) => {
      const prompt = (e as CustomEvent).detail?.prompt;
      if (typeof prompt === "string" && prompt.trim()) {
        void this.handleSendChat(
          `[生图模式] 请使用 image_gen 工具，根据以下描述生成图片：${prompt.trim()}`,
        );
      }
    };
    document.addEventListener("image-gen-regenerate", this._imageGenRegenerateHandler);
    // OpenClawCN: 视频重新生成事件
    this._videoGenRegenerateHandler = (e: Event) => {
      const prompt = (e as CustomEvent).detail?.prompt;
      if (typeof prompt === "string" && prompt.trim()) {
        void this.handleSendChat(
          `[视频生成模式] 请使用 video_gen 工具，根据以下描述生成视频：${prompt.trim()}`,
        );
      }
    };
    document.addEventListener("video-gen-regenerate", this._videoGenRegenerateHandler);
    // OpenClawCN: 智能组队 — 部署完成后导航到 agent 内嵌聊天
    // 注意: 不修改主 chat 的 sessionKey，团队聊天在智能体面板内完成，
    // 避免主 chat 被 "劫持" 显示 supervisor 的会话。
    this._orchNavigateHandler = (e: Event) => {
      const agentId = (e as CustomEvent).detail?.agentId;
      if (typeof agentId === "string" && agentId) {
        // Navigate to agents tab → select the agent → open chat panel
        this.setTab("agents");
        (this as never).agentsSelectedId = agentId;
        (this as never).teamProjectSelectedId = null;
        (this as never).agentsPanel = "chat";
        resetAgentChatState(this as never, `agent:${agentId}:main`);
        void loadAgentChatHistory(this as never);
      }
    };
    globalThis.addEventListener("orch:navigate-to-agent", this._orchNavigateHandler);
    // OpenClawCN: 智能组队 — 部署完成后刷新 agent 列表
    // Use force=true to ensure a fresh fetch even if a previous load is in-flight.
    // The backend now creates the team project BEFORE marking status as "deployed",
    // so the first fetch should normally succeed. Retries are kept as a safety net.
    this._orchAgentsChangedHandler = () => {
      void (async () => {
        const prevCount = (this as never).teamProjectsList?.length ?? 0;
        await Promise.all([loadAgents(this as never), loadTeamProjects(this as never, true)]);
        // Safety net: retry if the new project hasn't appeared yet.
        // Check by comparing project count — a new deploy should increase it.
        const self = this as never;
        const retryIfNoNewProject = (delayMs: number) => {
          setTimeout(() => {
            const currentCount = self.teamProjectsList?.length ?? 0;
            if (currentCount <= prevCount) {
              void loadTeamProjects(self, true);
            }
          }, delayMs);
        };
        retryIfNoNewProject(2000);
        retryIfNoNewProject(5000);
      })();
    };
    globalThis.addEventListener("orch:agents-changed", this._orchAgentsChangedHandler);
    // OpenClawCN: 语音凭证变更后重新检测 ASR/TTS 可用性
    this._voiceCredsChangedHandler = () => {
      void this.checkVoiceCapabilities();
    };
    globalThis.addEventListener(
      "openclawcn:voice-credentials-changed",
      this._voiceCredsChangedHandler,
    );
    // OpenClawCN: Tauri Desktop 平滑升级 — 监听 Rust Updater 的更新通知
    this._tauriUpdateHandler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { version?: string; notes?: string } | undefined;
      if (detail?.version) {
        this.updateAvailable = {
          version: detail.version,
          updateType: "full",
          summary: detail.notes || undefined,
        };
      }
    };
    window.addEventListener("openclawcn-update-available", this._tauriUpdateHandler);
    // Tauri Desktop: 监听下载进度事件
    this._tauriProgressHandler = (e: Event) => {
      const detail = (e as CustomEvent).detail as
        | {
            stage?: string;
            percent?: number;
            message?: string;
          }
        | undefined;
      if (detail && this.updateExecuting) {
        this.updateProgress = {
          stage: (detail.stage as "downloading") || "downloading",
          percent: detail.percent ?? 0,
          message: detail.message || "",
        };
      }
    };
    window.addEventListener("openclawcn-update-progress", this._tauriProgressHandler);
    // HTTP fallback: 立即获取运维二维码（不依赖 WebSocket 连接）
    void this._fetchFallbackQrcode();
  }

  private async _fetchFallbackQrcode() {
    try {
      const resp = await fetch("/api/support/qrcode");
      if (!resp.ok) {
        throw new Error("not ok");
      }
      const json = (await resp.json()) as {
        ok?: boolean;
        qrcode?: { base64: string; groupName: string } | null;
      };
      if (json?.ok && json.qrcode) {
        this.fallbackQrcode = json.qrcode;
      } else {
        this.fallbackQrcode = getEmbeddedQrcode("test");
      }
    } catch {
      // API 不可用时使用内嵌二维码
      this.fallbackQrcode = getEmbeddedQrcode("test");
    }
  }

  protected firstUpdated() {
    handleFirstUpdated(this as unknown as Parameters<typeof handleFirstUpdated>[0]);
  }

  disconnectedCallback() {
    handleDisconnected(this as unknown as Parameters<typeof handleDisconnected>[0]);
    document.removeEventListener("keydown", this.handleDocsKeydown);
    if (this._silentNewHandler) {
      globalThis.removeEventListener("openclawcn:silent-new", this._silentNewHandler);
    }
    if (this._modelSwitchedHandler) {
      globalThis.removeEventListener("openclawcn:model-switched", this._modelSwitchedHandler);
    }
    if (this._imageGenRegenerateHandler) {
      document.removeEventListener("image-gen-regenerate", this._imageGenRegenerateHandler);
    }
    if (this._videoGenRegenerateHandler) {
      document.removeEventListener("video-gen-regenerate", this._videoGenRegenerateHandler);
    }
    if (this._orchNavigateHandler) {
      globalThis.removeEventListener("orch:navigate-to-agent", this._orchNavigateHandler);
    }
    if (this._orchAgentsChangedHandler) {
      globalThis.removeEventListener("orch:agents-changed", this._orchAgentsChangedHandler);
    }
    if (this._voiceCredsChangedHandler) {
      globalThis.removeEventListener(
        "openclawcn:voice-credentials-changed",
        this._voiceCredsChangedHandler,
      );
    }
    if (this._tauriUpdateHandler) {
      window.removeEventListener("openclawcn-update-available", this._tauriUpdateHandler);
    }
    if (this._tauriProgressHandler) {
      window.removeEventListener("openclawcn-update-progress", this._tauriProgressHandler);
    }
    if (this._contextMenuDismissCleanup) {
      this._contextMenuDismissCleanup();
      this._contextMenuDismissCleanup = null;
    }
    if (this.batchPillAutoDismissTimer != null) {
      window.clearTimeout(this.batchPillAutoDismissTimer);
      this.batchPillAutoDismissTimer = null;
    }
    super.disconnectedCallback();
  }

  protected updated(changed: Map<PropertyKey, unknown>) {
    handleUpdated(this as unknown as Parameters<typeof handleUpdated>[0], changed);

    // Auto-dismiss the minimized "complete" pill after 5 seconds
    if (changed.has("skillsBatch")) {
      const { batchPhase, batchMinimized } = this.skillsBatch;
      if (batchMinimized && batchPhase === "complete") {
        if (this.batchPillAutoDismissTimer == null) {
          this.batchPillAutoDismissTimer = window.setTimeout(() => {
            this.batchPillAutoDismissTimer = null;
            if (this.skillsBatch.batchMinimized && this.skillsBatch.batchPhase === "complete") {
              this.skillsBatch = { ...this.skillsBatch, batchPhase: "idle", batchMinimized: false };
            }
          }, 5000);
        }
      } else if (this.batchPillAutoDismissTimer != null) {
        window.clearTimeout(this.batchPillAutoDismissTimer);
        this.batchPillAutoDismissTimer = null;
      }
    }
  }

  connect() {
    connectGatewayInternal(this as unknown as Parameters<typeof connectGatewayInternal>[0]);
  }

  handleChatScroll(event: Event) {
    handleChatScrollInternal(
      this as unknown as Parameters<typeof handleChatScrollInternal>[0],
      event,
    );
  }

  handleAgentChatScroll(event: Event) {
    handleAgentChatScrollInternal(
      this as unknown as Parameters<typeof handleAgentChatScrollInternal>[0],
      event,
    );
  }

  handleLogsScroll(event: Event) {
    handleLogsScrollInternal(
      this as unknown as Parameters<typeof handleLogsScrollInternal>[0],
      event,
    );
  }

  exportLogs(lines: string[], label: string) {
    exportLogsInternal(lines, label);
  }

  resetToolStream() {
    resetToolStreamInternal(this as unknown as Parameters<typeof resetToolStreamInternal>[0]);
  }

  resetChatScroll() {
    resetChatScrollInternal(this as unknown as Parameters<typeof resetChatScrollInternal>[0]);
  }

  async loadAssistantIdentity() {
    await loadAssistantIdentityInternal(this);
  }

  applySettings(next: UiSettings) {
    applySettingsInternal(this as unknown as Parameters<typeof applySettingsInternal>[0], next);
  }

  setTab(next: Tab) {
    setTabInternal(this as unknown as Parameters<typeof setTabInternal>[0], next);
  }

  setTheme(next: ThemeMode, context?: Parameters<typeof setThemeInternal>[2]) {
    setThemeInternal(this as unknown as Parameters<typeof setThemeInternal>[0], next, context);
  }

  async loadOverview() {
    await loadOverviewInternal(this as unknown as Parameters<typeof loadOverviewInternal>[0]);
  }

  async setModelPrimary(provider: string, model: string) {
    const { setModelPrimary } = await import("./controllers/models.js");
    await setModelPrimary(this, provider, model);
  }

  // 设置待保存的模型选择（不立即保存）
  setModelPending(provider: string, model: string) {
    this.modelsPendingProvider = provider;
    this.modelsPendingModel = model;
  }

  // 取消待保存的模型选择
  cancelModelPending() {
    this.modelsPendingProvider = null;
    this.modelsPendingModel = null;
  }

  // 确认并保存待选择的模型
  async confirmModelPending() {
    if (!this.modelsPendingProvider || !this.modelsPendingModel) {
      return;
    }
    const provider = this.modelsPendingProvider;
    const model = this.modelsPendingModel;
    // 记录切换前的模型，用于判断是否真正发生了变更
    const prevRef = this.modelsCurrent?.ref;
    // 清除之前的消息
    this.modelsError = null;
    this.modelsSuccessMessage = null;
    // 执行实际保存
    const { setModelPrimary } = await import("./controllers/models.js");
    const success = await setModelPrimary(this, provider, model);
    if (success) {
      // 保存成功后才清除待保存状态（失败时保留，方便用户重试）
      this.modelsPendingProvider = null;
      this.modelsPendingModel = null;
      // 显示切换成功消息
      const { t } = await import("./i18n/index.js");
      this.modelsSuccessMessage = t("models.switchSuccess");
      // 3秒后自动清除成功消息
      setTimeout(() => {
        this.modelsSuccessMessage = null;
      }, 3000);
      // 模型真正变了：中止旧请求，保留聊天记录，下一条消息自动使用新模型
      if (this.modelsCurrent?.ref !== prevRef) {
        globalThis.dispatchEvent?.(new CustomEvent("openclawcn:model-switched"));
      }
    }
    // 失败时 modelsError 已由 setModelPrimary 设置，pending 状态保留方便重试
  }

  async loadModelsProviders() {
    const { loadModelsProviders } = await import("./controllers/models.js");
    await loadModelsProviders(this);
  }

  setConfiguringProvider(providerId: string | null) {
    this.modelsConfiguringProvider = providerId;
  }

  async saveProviderAuth(
    provider: string,
    auth: { apiKey?: string; secretId?: string; secretKey?: string },
  ) {
    const { setProviderAuth } = await import("./controllers/models.js");
    this.modelsAuthSaving = true;
    this.modelsError = null;
    this.modelsSuccessMessage = null;

    try {
      const success = await setProviderAuth(this, provider, auth);
      if (success) {
        // 保存成功，关闭配置表单
        this.modelsConfiguringProvider = null;
        this.modelsAuthVerifyResult = null; // 清除验证结果
        // 记录切换前的模型
        const prevRef = this.modelsCurrent?.ref;
        // 重新加载提供商列表以更新状态
        await this.loadModelsProviders();
        // 自动切换到该提供商的模型：优先使用用户已手动选择的模型
        const providerData = this.modelsProviders.find((p) => p.id === provider);
        const pendingModelForProvider =
          this.modelsPendingProvider === provider ? this.modelsPendingModel : null;
        const defaultModel = this.modelsDefaults[provider];
        const recommendedModel = providerData?.models.find((m) => m.recommended);
        const firstModel = providerData?.models[0];
        const modelToUse =
          pendingModelForProvider ?? defaultModel ?? recommendedModel?.id ?? firstModel?.id;
        if (modelToUse) {
          await this.setModelPrimary(provider, modelToUse);
          // 显示切换成功消息
          const { t } = await import("./i18n/index.js");
          this.modelsSuccessMessage = t("models.switchSuccess");
          // 清除待保存状态
          this.modelsPendingProvider = null;
          this.modelsPendingModel = null;
          // 3秒后自动清除成功消息
          setTimeout(() => {
            this.modelsSuccessMessage = null;
          }, 3000);
          // 模型真正变了：中止旧请求，保留聊天记录（首次配置时 prevRef 为 null，不触发）
          if (prevRef && this.modelsCurrent?.ref !== prevRef) {
            globalThis.dispatchEvent?.(new CustomEvent("openclawcn:model-switched"));
          }
        }
      }
    } finally {
      this.modelsAuthSaving = false;
    }
  }

  async verifyProviderApiKey(provider: string, apiKey: string, model?: string) {
    const { verifyProviderApiKey } = await import("./controllers/models.js");
    return verifyProviderApiKey(this, provider, apiKey, model);
  }

  clearAuthVerifyResult() {
    this.modelsAuthVerifyResult = null;
  }

  async setSecurityMode(
    mode: import("./controllers/security").SecurityMode,
    confirmed: boolean = false,
  ) {
    const { setSecurityMode } = await import("./controllers/security.js");
    const result = await setSecurityMode(this, mode, confirmed);

    // 如果需要确认，显示警告弹框
    if (!result.ok && result.needsConfirmation) {
      this.securityShowWarning = true;
      return { needsConfirmation: true };
    }

    // 切换成功，显示成功消息
    if (result.ok) {
      const { t } = await import("./i18n/index.js");
      this.securitySuccessMessage = t("security.switchSuccess");
      // 3秒后自动清除成功消息
      setTimeout(() => {
        this.securitySuccessMessage = null;
      }, 3000);
    }

    return result;
  }

  closeSecurityWarning() {
    this.securityShowWarning = false;
  }

  async confirmSecurityTrustMode() {
    this.securityShowWarning = false;
    await this.setSecurityMode("trust", true);
  }

  async handleRunUpdate() {
    if (this.updateExecuting) {
      return;
    } // CR-8: 防止双击

    // Tauri Desktop: 直接调用 Rust Updater 插件下载安装
    const w = window as unknown as {
      __TAURI_INTERNALS__?: { invoke: (cmd: string) => Promise<unknown> };
    };
    if (w.__TAURI_INTERNALS__?.invoke) {
      this.updateExecuting = true;
      this.updateProgress = {
        stage: "downloading",
        percent: 0,
        message: t("update.progress.downloading"),
      };
      this.updateResult = null;
      try {
        await w.__TAURI_INTERNALS__.invoke("install_update");
        // install_update 成功后会 app.restart()，不会执行到这里
      } catch (err) {
        this.updateResult = { ok: false, error: String(err) };
        this.updateExecuting = false;
      }
      return;
    }

    // Web 模式: 走 Gateway RPC
    if (!this.client || !this.connected) {
      return;
    }
    this.updateExecuting = true;
    this.updateProgress = null;
    this.updateResult = null;
    try {
      const res = await this.client.request("update.execute", {});
      if (!res) {
        // CR-4: 空响应时重置状态，防止对话框永久卡在进度态
        this.updateResult = { ok: false, error: "empty response from server" };
        this.updateExecuting = false;
        return;
      }
      // installer-redirect: set result directly so dialog shows download link
      if (res.status === "installer-redirect") {
        this.updateResult = {
          ok: true,
          status: "installer-redirect",
          installerUrl: res.installerUrl,
          version: res.version,
        };
        this.updateExecuting = false;
        return;
      }
      // delta/full failure (success is driven by update.progress broadcast)
      if (!res.ok) {
        this.updateResult = { ok: false, error: res.error };
        this.updateExecuting = false;
      }
    } catch (err) {
      this.updateResult = { ok: false, error: String(err) };
      this.updateExecuting = false;
    }
  }

  async loadCron() {
    await loadCronInternal(this as unknown as Parameters<typeof loadCronInternal>[0]);
  }

  async handleAbortChat() {
    await handleAbortChatInternal(this as unknown as Parameters<typeof handleAbortChatInternal>[0]);
  }

  removeQueuedMessage(id: string) {
    removeQueuedMessageInternal(
      this as unknown as Parameters<typeof removeQueuedMessageInternal>[0],
      id,
    );
  }

  async handleSendChat(
    messageOverride?: string,
    opts?: Parameters<typeof handleSendChatInternal>[2],
  ) {
    // If voice recording is active, stop it first so we get the final text.
    // Set _sendingStopsRecording to prevent handleVoiceStopRecording from
    // auto-sending in voice-mode (we'll send here after stop completes).
    if (this.voiceRecordingState === "recording" && this.streamingRecorder) {
      this._sendingStopsRecording = true;
      await this.handleVoiceStopRecording();
      this._sendingStopsRecording = false;
    }
    // 生图模式：为用户消息添加生图指令前缀，引导 LLM 调用 image_gen tool
    let msg = messageOverride;
    if (this.imageGenMode && !msg) {
      const draft = this.chatMessage?.trim();
      if (draft) {
        msg = `[生图模式] 请使用 image_gen 工具，根据以下描述生成图片：${draft}`;
        this.chatMessage = "";
      }
    }
    await handleSendChatInternal(
      this as unknown as Parameters<typeof handleSendChatInternal>[0],
      msg,
      opts,
    );
  }

  async handleWhatsAppStart(force: boolean) {
    await handleWhatsAppStartInternal(this, force);
  }

  async handleWhatsAppWait() {
    await handleWhatsAppWaitInternal(this);
  }

  async handleWhatsAppLogout() {
    await handleWhatsAppLogoutInternal(this);
  }

  async handleChannelConfigSave() {
    await handleChannelConfigSaveInternal(this);
  }

  async handleChannelConfigReload() {
    await handleChannelConfigReloadInternal(this);
  }

  async handleDeleteBot(channelId: string, accountId: string) {
    await handleDeleteBotInternal(this, channelId, accountId);
  }

  handleNostrProfileEdit(accountId: string, profile: NostrProfile | null) {
    handleNostrProfileEditInternal(this, accountId, profile);
  }

  handleNostrProfileCancel() {
    handleNostrProfileCancelInternal(this);
  }

  handleNostrProfileFieldChange(field: keyof NostrProfile, value: string) {
    handleNostrProfileFieldChangeInternal(this, field, value);
  }

  async handleNostrProfileSave() {
    await handleNostrProfileSaveInternal(this);
  }

  async handleNostrProfileImport() {
    await handleNostrProfileImportInternal(this);
  }

  handleNostrProfileToggleAdvanced() {
    handleNostrProfileToggleAdvancedInternal(this);
  }

  async handleExecApprovalDecision(decision: "allow-once" | "allow-always" | "deny") {
    const active = this.execApprovalQueue[0];
    if (!active || !this.client || this.execApprovalBusy) {
      return;
    }
    this.execApprovalBusy = true;
    this.execApprovalError = null;
    try {
      await this.client.request("exec.approval.resolve", {
        id: active.id,
        decision,
      });
      this.execApprovalQueue = this.execApprovalQueue.filter((entry) => entry.id !== active.id);
    } catch (err) {
      this.execApprovalError = t("execApprovals.error.saveFailed", { error: String(err) });
    } finally {
      this.execApprovalBusy = false;
    }
  }

  // =========================================================================
  // 技能安装进度弹框方法
  // =========================================================================

  /**
   * 关闭技能安装进度弹框
   */
  dismissSkillInstallProgress() {
    this.skillInstallProgress = null;
  }

  /**
   * 重试技能安装
   */
  async retrySkillInstall() {
    const progress = this.skillInstallProgress;
    if (!progress || !this.client) {
      this.skillInstallProgress = null;
      return;
    }

    // 重置进度状态
    this.skillInstallProgress = {
      ...progress,
      stage: "downloading",
      message: `正在重新安装 ${progress.skillName}...`,
      percent: 0,
      logs: [],
    };

    try {
      // 重新触发安装
      const result = await this.client.request("skills.install", {
        name: progress.skillName,
        timeoutMs: 180000,
      });

      // 注意：进度更新会通过 WebSocket 事件推送
      if (!result?.ok) {
        this.skillInstallProgress = {
          ...this.skillInstallProgress,
          stage: "failed",
          message: result?.message ?? "安装失败",
          percent: 0,
        };
      }
    } catch (err) {
      this.skillInstallProgress = {
        ...this.skillInstallProgress,
        stage: "failed",
        message: `安装失败: ${err instanceof Error ? err.message : String(err)}`,
        percent: 0,
      };
    }
  }

  /**
   * 处理技能安装决策（审批弹框）
   */
  async handleSkillInstallDecision(decision: "install" | "install-continue" | "deny") {
    const active = this.skillInstallQueue[0];
    if (!active || !this.client || this.skillInstallBusy) {
      return;
    }

    this.skillInstallBusy = true;
    this.skillInstallError = null;

    try {
      await this.client.request("skill.install.resolve", {
        id: active.id,
        decision,
      });
      // 从队列中移除
      this.skillInstallQueue = this.skillInstallQueue.filter((entry) => entry.id !== active.id);
    } catch (err) {
      this.skillInstallError = `技能安装决策失败: ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      this.skillInstallBusy = false;
    }
  }

  handleGatewayUrlConfirm() {
    const nextGatewayUrl = this.pendingGatewayUrl;
    if (!nextGatewayUrl) {
      return;
    }
    this.pendingGatewayUrl = null;
    applySettingsInternal(this as unknown as Parameters<typeof applySettingsInternal>[0], {
      ...this.settings,
      gatewayUrl: nextGatewayUrl,
    });
    this.connect();
  }

  handleGatewayUrlCancel() {
    this.pendingGatewayUrl = null;
  }

  // Sidebar handlers for tool output viewing
  handleOpenSidebar(content: string) {
    if (this.sidebarCloseTimer != null) {
      window.clearTimeout(this.sidebarCloseTimer);
      this.sidebarCloseTimer = null;
    }
    this.sidebarContent = content;
    this.sidebarError = null;
    this.sidebarOpen = true;
  }

  handleCloseSidebar() {
    this.sidebarOpen = false;
    // Clear content after transition
    if (this.sidebarCloseTimer != null) {
      window.clearTimeout(this.sidebarCloseTimer);
    }
    this.sidebarCloseTimer = window.setTimeout(() => {
      if (this.sidebarOpen) {
        return;
      }
      this.sidebarContent = null;
      this.sidebarError = null;
      this.sidebarCloseTimer = null;
    }, 200);
  }

  handleSplitRatioChange(ratio: number) {
    const newRatio = Math.max(0.4, Math.min(0.7, ratio));
    this.splitRatio = newRatio;
    this.applySettings({ ...this.settings, splitRatio: newRatio });
  }

  // ── Voice mascot handlers ──────────────────────────────

  private setVoiceError(err: string | null) {
    if (this.voiceErrorTimer) {
      clearTimeout(this.voiceErrorTimer);
      this.voiceErrorTimer = null;
    }
    this.voiceError = err;
    if (err) {
      this.voiceErrorTimer = setTimeout(() => {
        this.voiceError = null;
      }, 5000);
    }
  }

  async checkVoiceCapabilities() {
    if (!this.client) {
      return;
    }
    const [batchAvail, streamAvail] = await Promise.all([
      checkAsrAvailability(this.client),
      checkStreamingAsrAvailability(this.client),
    ]);
    this.voiceAsrAvailable = batchAvail || streamAvail;
    this.voiceStreamingAsrAvailable = streamAvail;
  }

  /**
   * Start voice recording. Prefers streaming ASR (real-time partial text)
   * when available, falls back to batch recording + asr.transcribe.
   */
  async handleVoiceStartRecording() {
    if (!this.client) {
      return;
    }
    if (this.voiceRecordingState !== "idle") {
      return;
    }
    this.setVoiceError(null);

    // Lock state immediately to prevent duplicate calls while awaiting RPC
    this.voiceRecordingState = "recording";

    // Try streaming ASR first
    if (this.voiceStreamingAsrAvailable) {
      const startResult = await startStreamingAsr(this.client);
      if (startResult) {
        this._startStreamingRecording(startResult.sessionId);
        return;
      }
      // Streaming start failed — fall through to batch
    }

    // Fallback: batch recording + asr.transcribe
    this.voiceRecordingState = "idle"; // reset so AudioRecorder's onStateChange can take over
    this._startBatchRecording();
  }

  /** Streaming path: StreamingAudioRecorder + asr.stream.feed + asr.partial events. */
  private _startStreamingRecording(sessionId: string) {
    this.streamingRecorder?.dispose();
    this.voiceStreamSessionId = sessionId;
    this.voicePartialText = "";
    this.voiceVolumeLevel = 0;

    // In voice mode, enable silence detection to auto-stop when user stops speaking
    const silenceDetection: SilenceDetectionOptions | undefined = this.voiceMode
      ? { threshold: 0.05, silenceDurationMs: 2000, minRecordingMs: 1200 }
      : undefined;

    this.streamingRecorder = new StreamingAudioRecorder(
      {
        onStateChange: (s) => {
          if (s === "recording" || s === "idle" || s === "requesting") {
            this.voiceRecordingState = s === "requesting" ? "recording" : s;
          }
          // "processing" is set explicitly in handleVoiceStopRecording
        },
        onError: (err) => {
          this.setVoiceError(err);
          this._cleanupStreamingSession();
          this.voiceRecordingState = "idle";
        },
        onVolume: (v) => {
          this.voiceVolumeLevel = v;
        },
        onChunk: (pcmBase64) => {
          if (this.client && this.voiceStreamSessionId) {
            void feedStreamingAsr(this.client, this.voiceStreamSessionId, pcmBase64);
          }
        },
        onRecordingEnd: () => {
          // Triggered by silence detection, auto-stop (30s timer), or manual stop.
          // Run the full stop flow to send asr.stream.end and get the final text.
          // Auto-send since the user was actively recording.
          if (this.voiceStreamSessionId) {
            void this.handleVoiceStopRecording({ autoSend: true });
          }
        },
      },
      undefined,
      silenceDetection,
    );

    void this.streamingRecorder.start();

    // ASR health watchdog: if no asr.partial arrives within 8s, the backend is non-functional
    this._clearAsrHealthTimer();
    this._asrHealthTimer = setTimeout(() => {
      if (
        this.voiceRecordingState === "recording" &&
        this.voiceStreamSessionId &&
        !this.voicePartialText
      ) {
        console.warn(
          "[asr] health watchdog: no partial text received after 8s — ASR backend may be non-functional",
        );
        this.setVoiceError("voice.error.asrNoResponse");
        // Don't stop recording — user may still want to end manually and get final text
      }
    }, 8000);
  }

  /** Batch fallback: original AudioRecorder + asr.transcribe. */
  private _startBatchRecording() {
    this.audioRecorder?.dispose();
    this.audioRecorder = new AudioRecorder({
      onStateChange: (s) => {
        this.voiceRecordingState = s;
      },
      onError: (err) => {
        this.setVoiceError(err);
        this.voiceRecordingState = "idle";
      },
      onComplete: async (wavBase64) => {
        if (!this.client) {
          return;
        }
        this.voiceRecordingState = "processing";
        try {
          const result = await transcribeAudio(this.client, wavBase64);
          if ("text" in result && result.text) {
            if (this.voiceMode || this._batchAutoSend) {
              this._batchAutoSend = false;
              await this.handleSendChat(result.text, {
                voiceInput: true,
                voiceMode: this.voiceMode,
              });
            } else {
              this.chatMessage = (this.chatMessage ? `${this.chatMessage} ` : "") + result.text;
            }
          } else if ("error" in result) {
            this.setVoiceError(result.error);
          }
        } catch {
          this.setVoiceError("voice.error.transcriptionFailed");
        } finally {
          this._batchAutoSend = false;
          this.voiceRecordingState = "idle";
        }
      },
    });
    void this.audioRecorder.start();
  }

  /**
   * @param opts.autoSend — if true, auto-send the final text after recording stops.
   *   Mic-button click passes true; textarea-edit-triggered stop passes false.
   */
  private _voiceStopInProgress = false;

  /**
   * @param opts.autoSend — if true, auto-send the final text after recording stops.
   *   Mic-button click passes true; textarea-edit-triggered stop passes false.
   */
  async handleVoiceStopRecording(opts?: { autoSend?: boolean }) {
    const shouldAutoSend = opts?.autoSend ?? false;

    // Streaming path: stop recorder, then get final text from server
    if (this.streamingRecorder && this.voiceStreamSessionId) {
      // Guard against re-entrant calls: streamingRecorder.stop() fires
      // onRecordingEnd synchronously, which would call us again.
      if (this._voiceStopInProgress) {
        return;
      }
      this._voiceStopInProgress = true;

      // Clear sessionId BEFORE stop() to prevent onRecordingEnd re-entry
      const sessionId = this.voiceStreamSessionId;
      this.voiceStreamSessionId = null;

      this.streamingRecorder.stop();
      this.voiceRecordingState = "processing";
      this.voiceVolumeLevel = 0;
      this._clearAsrHealthTimer();

      // Use voicePartialText (clean, without "..." suffix) as fallback
      let finalText = this.voicePartialText || this.chatMessage?.replace(/\.{3}$/, "") || "";

      if (this.client) {
        try {
          const result = await endStreamingAsr(this.client, sessionId);
          if (result?.text) {
            finalText = result.text;
            // Immediately show complete text in input box
            this.chatMessage = finalText;
          }
        } catch {
          // keep whatever partial text we already have
        }
      }

      // Auto-send: in voice-mode always, or when mic button was explicitly clicked.
      // But not if handleSendChat() initiated this stop (it will send for us).
      // Filter out noise: require at least 2 meaningful characters (Chinese/letters)
      const meaningfulChars = finalText.replace(/[\s.。,，!！?？…·、\-_]+/g, "");
      const isSubstantial = meaningfulChars.length >= 2;
      if (
        finalText &&
        isSubstantial &&
        !this._sendingStopsRecording &&
        (this.voiceMode || shouldAutoSend)
      ) {
        this.chatMessage = "";
        void this.handleSendChat(finalText, { voiceInput: true, voiceMode: this.voiceMode });
      } else if (!shouldAutoSend || !isSubstantial) {
        // Not auto-sending: put text in input for user to edit
        this.chatMessage = finalText;
      }

      this._cleanupStreamingSession();
      this.voiceRecordingState = "idle";
      this._voiceStopInProgress = false;
      if (!shouldAutoSend) {
        this._focusChatInput();
      }
      return;
    }

    // Batch path: stop triggers processRecording → onComplete
    if (shouldAutoSend) {
      this._batchAutoSend = true;
    }
    this.audioRecorder?.stop();
  }

  private _clearAsrHealthTimer() {
    if (this._asrHealthTimer) {
      clearTimeout(this._asrHealthTimer);
      this._asrHealthTimer = null;
    }
  }

  /** Focus the chat textarea after voice input completes so the user can edit/send. */
  private _focusChatInput() {
    requestAnimationFrame(() => {
      const ta =
        document.querySelector<HTMLTextAreaElement>(".cc-textarea") ??
        this.querySelector<HTMLTextAreaElement>(".chat-compose textarea");
      if (ta) {
        ta.focus();
        // Place cursor at the end of text
        ta.selectionStart = ta.selectionEnd = ta.value.length;
      }
    });
  }

  private _cleanupStreamingSession() {
    this._clearAsrHealthTimer();
    this.voiceStreamSessionId = null;
    this.voicePartialText = "";
    this.voiceVolumeLevel = 0;
    this.streamingRecorder?.dispose();
    this.streamingRecorder = null;
  }

  handleVoiceMascotDismiss() {
    dismissMascot();
    this.voiceMascotDismissed = true;
  }

  // ── Voice loop & wake word ────────────────────────────────────────────

  async toggleVoiceMode() {
    if (this.voiceMode) {
      // Exit voice mode
      this.voiceMode = false;
      this._stopTtsPlayback();
      // Clean up both recorder types
      this._cleanupStreamingSession();
      this.audioRecorder?.stop();
      this.audioRecorder?.dispose();
      this.audioRecorder = null;
      this.voiceRecordingState = "idle";
      // Resume KWS if it was active before entering voice mode
      if (this.voiceWakeListening) {
        void this.startWakeWordListening();
      }
    } else {
      // Enter voice mode — pause KWS first (mic conflict)
      const wasListening = this.voiceWakeListening;
      if (wasListening) {
        await this.stopWakeWordListening();
        // Preserve the flag so KWS resumes when voice mode exits
        this.voiceWakeListening = true;
      }
      this.voiceMode = true;
      await this.handleVoiceStartRecording();
    }
  }

  // ── Screen Share ──────────────────────────────────────────────────────

  private _screenShareToggling = false;

  async toggleScreenShare() {
    if (this._screenShareToggling) {
      return;
    } // prevent double-click race
    this._screenShareToggling = true;
    try {
      if (this.screenShareActive) {
        // Stop screen sharing
        await this.screenLive?.stop();
        this.screenLive = null;
        this.screenShareActive = false;
        this.screenShareFrameCount = 0;
        this.screenShareLatestFrame = null;
        this.screenShareModelName = null;
      } else {
        // Start screen sharing
        const { ScreenLive } = await import("./screen/screen-live.js");
        this.screenLive = new ScreenLive({
          onStateChange: (state) => {
            this.screenShareActive = state === "active";
            if (state === "idle" || state === "error") {
              this.screenShareActive = false;
            }
            this.requestUpdate();
          },
          onFrame: (frameBase64) => {
            this.screenShareLatestFrame = frameBase64;
            this.screenShareFrameCount++; // @state() triggers re-render for frame count display
          },
          onError: (error) => {
            console.warn("[ScreenShare] Error:", error);
            this.screenShareActive = false;
            this.requestUpdate();
          },
        });
        await this.screenLive.start();
        // If user cancelled the dialog or an error occurred, clean up
        if (this.screenLive.getState() !== "active") {
          this.screenLive = null;
        }
      }
    } catch (e) {
      console.error("[ScreenShare] toggleScreenShare failed:", e);
      this.screenShareActive = false;
      this.screenLive = null;
      this.requestUpdate();
    } finally {
      this._screenShareToggling = false;
    }
  }

  playTtsAudio(base64: string, format: string) {
    this._stopTtsPlayback();
    const mime = format === "mp3" ? "audio/mpeg" : format === "opus" ? "audio/opus" : "audio/wav";
    const audio = new Audio(`data:${mime};base64,${base64}`);
    this._ttsAudio = audio;
    const onDone = () => {
      this._ttsAudio = null;
      if (this.voiceMode) {
        void this.handleVoiceStartRecording();
      }
    };
    audio.addEventListener("ended", onDone);
    audio.addEventListener("error", onDone);
    audio.play().catch(onDone);
  }

  private _stopTtsPlayback() {
    if (this._ttsAudio) {
      this._ttsAudio.pause();
      this._ttsAudio = null;
    }
    // Also clear streaming queue
    this._ttsQueue = [];
    this._ttsQueuePlaying = false;
    this._ttsQueueFinalReceived = false;
  }

  /**
   * Enqueue a TTS audio chunk for streaming playback.
   * Called by the gateway event handler when a tts.chunk event arrives.
   */
  enqueueTtsChunk(base64: string, format: string) {
    this._ttsQueue.push({ base64, format });
    if (!this._ttsQueuePlaying) {
      this._playNextTtsChunk();
    }
  }

  /**
   * Mark that the final tts.chunk has been received (no more audio coming).
   */
  markTtsStreamComplete() {
    this._ttsQueueFinalReceived = true;
    // If queue is empty and nothing is playing, trigger voice recording
    if (!this._ttsQueuePlaying && this._ttsQueue.length === 0) {
      this._onTtsStreamDone();
    }
  }

  private _playNextTtsChunk() {
    const next = this._ttsQueue.shift();
    if (!next) {
      this._ttsQueuePlaying = false;
      if (this._ttsQueueFinalReceived) {
        this._onTtsStreamDone();
      }
      return;
    }

    this._ttsQueuePlaying = true;
    const mime =
      next.format === "mp3" ? "audio/mpeg" : next.format === "opus" ? "audio/opus" : "audio/wav";
    const audio = new Audio(`data:${mime};base64,${next.base64}`);
    this._ttsAudio = audio;

    const onChunkDone = () => {
      this._ttsAudio = null;
      this._playNextTtsChunk();
    };
    audio.addEventListener("ended", onChunkDone);
    audio.addEventListener("error", onChunkDone);
    audio.play().catch(onChunkDone);
  }

  private _onTtsStreamDone() {
    this._ttsQueueFinalReceived = false;
    if (this.voiceMode) {
      void this.handleVoiceStartRecording();
    }
  }

  async startWakeWordListening() {
    const { startWakeWordListening } = await import("./controllers/wake-word.ts");
    await startWakeWordListening(
      this as unknown as import("./controllers/wake-word.ts").WakeWordHost,
    );
  }

  async stopWakeWordListening() {
    const { stopWakeWordListening } = await import("./controllers/wake-word.ts");
    await stopWakeWordListening(
      this as unknown as import("./controllers/wake-word.ts").WakeWordHost,
    );
  }

  // 关闭适配公告弹框（永久记住）
  dismissAdaptationNotice() {
    localStorage.setItem("openclawcn.chat.adaptationNoticeSeen", "1");
    this.showAdaptationNotice = false;
  }

  // 意见反馈处理函数
  handleFeedbackOpen() {
    this.feedbackState = { ...this.feedbackState, showModal: true };
  }

  handleFeedbackClose() {
    this.feedbackState = {
      ...this.feedbackState,
      showModal: false,
      // 如果已提交成功，重置表单
      ...(this.feedbackState.submitted
        ? {
            type: "suggestion" as const,
            content: "",
            contact: "",
            attachments: [],
            submitting: false,
            submitted: false,
            error: null,
          }
        : {}),
    };
  }

  async handleFeedbackSubmit() {
    const { content, type, contact, attachments } = this.feedbackState;

    // 验证内容
    if (!content.trim()) {
      this.feedbackState = {
        ...this.feedbackState,
        error: "请填写反馈内容哦",
      };
      return;
    }

    if (content.trim().length < 5) {
      this.feedbackState = {
        ...this.feedbackState,
        error: "再多写几个字吧，让我们更好地理解你的想法",
      };
      return;
    }

    this.feedbackState = {
      ...this.feedbackState,
      submitting: true,
      error: null,
    };

    try {
      // 构建反馈数据
      const payload = {
        type,
        content: content.trim(),
        contact: contact.trim() || undefined,
        attachments: attachments.length > 0 ? attachments.map((a) => a.dataUrl) : undefined,
        context: {
          version: this.hello?.version ?? "unknown",
          platform: navigator.platform,
          page: this.tab,
          userAgent: navigator.userAgent,
          timestamp: new Date().toISOString(),
        },
      };

      // 调用网关 API 提交反馈
      if (this.client) {
        await this.client.request("feedback.submit", payload);
      } else {
        // 如果没有连接，保存到本地存储
        let feedbackList: unknown[] = [];
        try {
          feedbackList = JSON.parse(localStorage.getItem("openclawcn-feedback") || "[]");
        } catch {
          /* corrupted localStorage, reset */
        }
        feedbackList.push({ ...payload, id: Date.now().toString() });
        localStorage.setItem("openclawcn-feedback", JSON.stringify(feedbackList));
      }

      this.feedbackState = {
        ...this.feedbackState,
        submitting: false,
        submitted: true,
      };
    } catch (err) {
      console.error("Feedback submit error:", err);
      this.feedbackState = {
        ...this.feedbackState,
        submitting: false,
        error: "提交失败，请稍后重试",
      };
    }
  }

  // 日志上报运维中心处理函数
  handleLogReportOpen() {
    this.logReportState = { ...this.logReportState, showModal: true };
  }

  handleLogReportClose() {
    const reset = this.logReportState.submitted;
    this.logReportState = {
      ...this.logReportState,
      showModal: false,
      ...(reset
        ? {
            description: "",
            attachments: [],
            submitting: false,
            submitted: false,
            error: null,
            ticketCode: null,
            remaining: null,
            queryMode: false,
            queryCode: "",
            querying: false,
            queryResult: null,
            queryError: null,
          }
        : {}),
    };
  }

  async handleLogReportSubmit() {
    const { description, attachments } = this.logReportState;

    if (!description.trim()) {
      this.logReportState = { ...this.logReportState, error: "请填写问题描述" };
      return;
    }
    if (description.trim().length < 5) {
      this.logReportState = { ...this.logReportState, error: "问题描述至少需要5个字符" };
      return;
    }

    this.logReportState = { ...this.logReportState, submitting: true, error: null };

    try {
      // 提交前先刷新日志，确保拿到最新数据
      if (this.client && this.connected) {
        try {
          const { loadLogs } = await import("./controllers/logs.js");
          await loadLogs(this as Parameters<typeof loadLogs>[0], { reset: true });
        } catch {
          /* 刷新失败不阻塞提交 */
        }
      }

      // 收集最近日志条目的原始行
      const logEntries = this.logsEntries.slice(-500).map((entry) => entry.raw);

      const payload = {
        description: description.trim(),
        attachments: attachments.length > 0 ? attachments.map((a) => a.dataUrl) : undefined,
        logEntries,
        context: {
          version: this.hello?.version ?? "unknown",
          platform: navigator.platform,
          hostname: (this.hello as Record<string, unknown>)?.hostname as string | undefined,
          timestamp: new Date().toISOString(),
        },
      };

      if (this.client) {
        const result = await this.client.request("log_report.submit", payload);

        this.logReportState = {
          ...this.logReportState,
          submitting: false,
          submitted: true,
          ticketCode: result.ticketCode ?? null,
          remaining: result.remaining ?? null,
        };
      } else {
        // 没有网关连接时保存摘要到本地（不存 base64 图片和日志原文，防止 localStorage 溢出）
        const summary = {
          id: Date.now().toString(),
          description: payload.description,
          attachmentCount: payload.attachments?.length ?? 0,
          logEntryCount: payload.logEntries?.length ?? 0,
          context: payload.context,
          createdAt: new Date().toISOString(),
        };
        try {
          const reports = JSON.parse(localStorage.getItem("openclawcn-log-reports") || "[]");
          reports.push(summary);
          localStorage.setItem("openclawcn-log-reports", JSON.stringify(reports));
        } catch {
          /* localStorage quota exceeded, ignore */
        }

        this.logReportState = {
          ...this.logReportState,
          submitting: false,
          submitted: true,
          ticketCode: null,
          remaining: null,
        };
      }
    } catch (err) {
      console.error("Log report submit error:", err);
      this.logReportState = {
        ...this.logReportState,
        submitting: false,
        error: err instanceof Error ? err.message : "提交失败，请稍后重试",
      };
    }
  }

  async handleLogReportQuery() {
    const { queryCode } = this.logReportState;
    if (!queryCode || queryCode.length !== 6) {
      this.logReportState = { ...this.logReportState, queryError: "请输入6位工单号" };
      return;
    }

    this.logReportState = {
      ...this.logReportState,
      querying: true,
      queryError: null,
      queryResult: null,
    };

    try {
      if (this.client) {
        const result = await this.client.request("log_report.status", {
          ticketCode: queryCode.toUpperCase(),
        });

        this.logReportState = {
          ...this.logReportState,
          querying: false,
          queryResult: result,
        };
      } else {
        this.logReportState = {
          ...this.logReportState,
          querying: false,
          queryError: "未连接到网关",
        };
      }
    } catch (err) {
      this.logReportState = {
        ...this.logReportState,
        querying: false,
        queryError: err instanceof Error ? err.message : "查询失败",
      };
    }
  }

  render() {
    return renderApp(this as unknown as import("./app-view-state").AppViewState);
  }
}

/** Alias kept for CN compatibility. */
export type OpenClawCNApp = ClawdbotApp;
