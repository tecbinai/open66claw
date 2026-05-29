import type { EventLogEntry } from "./app-events";
import type { AgentWizardState } from "./views/agent-wizard";
import type { DiscoveryControllerState } from "./controllers/capability-detect";
import type { DevicePairingList } from "./controllers/devices";
import type { ExecApprovalRequest } from "./controllers/exec-approval";
import type { ExecApprovalsFile, ExecApprovalsSnapshot } from "./controllers/exec-approvals";
import type { SkillInstallDecision } from "./controllers/skill-install";
import type { SkillMessage } from "./controllers/skills";
import type { GatewayBrowserClient, GatewayHelloOk } from "./gateway";
import type { Tab } from "./navigation";
import type { UiSettings } from "./storage";
import type { ThemeMode } from "./theme";
import type { ThemeTransitionContext } from "./theme-transition";
import type {
  AgentIdentityResult,
  AgentsFilesListResult,
  AgentsListResult,
  ChannelsStatusSnapshot,
  ConfigSnapshot,
  ConfigUiHints,
  CronJob,
  CronRunLogEntry,
  CronStatus,
  HealthSnapshot,
  LogEntry,
  LogLevel,
  NostrProfile,
  PresenceEntry,
  RemoteSkillsIndex,
  SessionsListResult,
  SkillStatusReport,
  StatusSummary,
  TeamProjectSummary,
  TeamProjectDetail,
  TeamProjectHealthResult,
  TeamProjectStatsResult,
  TeamSharedMemoryEntry,
  TeamActivityEvent,
  ProjectWorkspaceFilesResult,
} from "./types";
import type { CostUsageSummary, SessionsUsageResult, SessionUsageTimeSeries } from "./types";
import type { ChatAttachment, ChatQueueItem, CronFormState } from "./ui-types";
import type { NostrProfileFormState } from "./views/channels.nostr-profile-form";
import type {
  ChannelRouteAgentOption,
  ChannelRouteEntry,
  ChannelRouteProjectOption,
} from "./views/channels.types";
import type { DocsViewState } from "./views/docs";
import type { FeedbackViewState } from "./views/feedback";
import type { LogReportViewState } from "./views/log-report";
import type { SkillInstallRequest } from "./views/skill-install-approval";
import type { SkillInstallProgress } from "./views/skill-install-progress";

export type AppViewState = {
  settings: UiSettings;
  password: string;
  tab: Tab;
  onboarding: boolean;
  basePath: string;
  connected: boolean;
  theme: ThemeMode;
  themeResolved: "light" | "dark";
  hello: GatewayHelloOk | null;
  lastError: string | null;
  eventLog: EventLogEntry[];
  assistantName: string;
  assistantAvatar: string | null;
  assistantAgentId: string | null;
  sessionKey: string;
  chatLoading: boolean;
  chatSending: boolean;
  chatMessage: string;
  chatAttachments: ChatAttachment[];
  chatMessages: unknown[];
  chatToolMessages: unknown[];
  chatStream: string | null;
  chatStreamStartedAt: number | null;
  /** Active media generation tool (video_gen / image_gen) detected in stream */
  chatMediaToolActive: { tool: string; args?: Record<string, unknown> } | null;
  chatRunId: string | null;
  chatAvatarUrl: string | null;
  chatThinkingLevel: string | null;
  chatQueue: ChatQueueItem[];
  compactionStatus: import("./app-tool-stream").CompactionStatus | null;
  /** OpenClawCN: auto-failover notification banner */
  failoverBanner: {
    fromProvider: string;
    toProvider: string;
    toModel: string;
    reason: string;
    reasonText: string;
  } | null;
  // OpenClawCN: 聊天模型是否已配置
  chatModelConfigured: boolean | null;
  // OpenClawCN: 必要 provider（硅基流动）是否已配置
  essentialProviderConfigured: boolean | null;
  // OpenClawCN: 首次启动引导中（detectFirstRunSetup 跳转到 model-config 时设为 true）
  firstRunGuide: boolean;
  // API Response Monitor state
  apiMonitorElapsedMs: number;
  apiMonitorDismissed: boolean;
  // Sidebar state
  sidebarOpen: boolean;
  sidebarContent: string | null;
  sidebarError: string | null;
  splitRatio: number;
  nodesLoading: boolean;
  nodes: Array<Record<string, unknown>>;
  devicesLoading: boolean;
  devicesError: string | null;
  devicesList: DevicePairingList | null;
  execApprovalsLoading: boolean;
  execApprovalsSaving: boolean;
  execApprovalsDirty: boolean;
  execApprovalsSnapshot: ExecApprovalsSnapshot | null;
  execApprovalsForm: ExecApprovalsFile | null;
  execApprovalsSelectedAgent: string | null;
  execApprovalsTarget: "gateway" | "node";
  execApprovalsTargetNodeId: string | null;
  execApprovalQueue: ExecApprovalRequest[];
  execApprovalBusy: boolean;
  execApprovalError: string | null;
  // 技能安装审批状态
  skillInstallQueue?: SkillInstallRequest[];
  skillInstallBusy?: boolean;
  skillInstallError?: string | null;
  skillInstallProgress?: SkillInstallProgress | null;
  handleSkillInstallDecision?: (decision: SkillInstallDecision) => Promise<void>;
  dismissSkillInstallProgress?: () => void;
  retrySkillInstall?: () => void;
  // 能力发现状态 (Capability Discovery)
  discoveryState: DiscoveryControllerState;
  handleDiscoveryStart?: () => Promise<void>;
  handleDiscoverySkip?: () => void;
  handleDiscoverySuggestionClick?: (prompt: string) => void;
  showOfflineBanner: boolean;
  // QR 码预加载状态
  qrcodePreloading: boolean;
  qrcodePreloaded: boolean;
  qrcodeExpiresAt: number | null;
  // HTTP fallback QR 码（断连时通过 /api/support/qrcode 获取）
  fallbackQrcode: { base64: string; groupName: string } | null;
  // 智能推荐开关 (Smart Dispatch Toggle)
  smartDispatchEnabled: boolean;
  smartDispatchSaving: boolean;
  // 性能档位 (Performance Profile)
  performanceProfile: "economy" | "balanced" | "power";
  performanceProfileSaving: boolean;
  chatDeepThinking: boolean;
  pendingGatewayUrl: string | null;
  configLoading: boolean;
  configRaw: string;
  configRawOriginal: string;
  configValid: boolean | null;
  configIssues: unknown[];
  configSaving: boolean;
  configApplying: boolean;
  updateRunning: boolean;
  configSnapshot: ConfigSnapshot | null;
  configSchema: unknown | null;
  configSchemaLoading: boolean;
  configUiHints: ConfigUiHints;
  configForm: Record<string, unknown> | null;
  configFormOriginal: Record<string, unknown> | null;
  configFormMode: "form" | "raw";
  configSchemaVersion: string | null;
  configSearchQuery: string;
  configActiveSection: string | null;
  configActiveSubsection: string | null;
  applySessionKey: string;
  channelsLoading: boolean;
  channelsSnapshot: ChannelsStatusSnapshot | null;
  channelsError: string | null;
  channelsLastSuccess: number | null;
  whatsappLoginMessage: string | null;
  whatsappLoginQrDataUrl: string | null;
  whatsappLoginConnected: boolean | null;
  whatsappBusy: boolean;
  // Channel route binding
  channelRouteSummary: ChannelRouteEntry[] | null;
  channelRouteProjects: ChannelRouteProjectOption[] | null;
  channelRouteAgents: ChannelRouteAgentOption[] | null;
  channelRouteSaving: boolean;
  channelRouteSavedHint: boolean;
  // Channel master-detail layout
  channelsSelectedKey: string | null;
  // Channel config wizard
  channelsWizardOpen: boolean;
  channelsWizardAccountId: string | null;
  channelsWizardIsNew: boolean;
  channelDeletingBotId: string | null;
  nostrProfileFormState: NostrProfileFormState | null;
  nostrProfileAccountId: string | null;
  configFormDirty: boolean;
  presenceLoading: boolean;
  presenceEntries: PresenceEntry[];
  presenceError: string | null;
  presenceStatus: string | null;
  agentsLoading: boolean;
  agentsList: AgentsListResult | null;
  agentsError: string | null;
  agentsSelectedId: string | null;
  agentCreating: boolean;
  agentCreateError: string | null;
  agentCreateSuccess: boolean;
  agentDeleting: boolean;
  agentDeleteError: string | null;
  agentWizard: AgentWizardState;
  agentsPanel: "overview" | "outputs" | "files" | "tools" | "skills" | "channels" | "cron" | "chat";
  agentFilesLoading: boolean;
  agentFilesError: string | null;
  agentFilesList: AgentsFilesListResult | null;
  agentFileContents: Record<string, string>;
  agentFileDrafts: Record<string, string>;
  agentFileActive: string | null;
  agentFileSaving: boolean;
  // Agent outputs (workspace files)
  agentOutputsLoading: boolean;
  agentOutputsError: string | null;
  agentOutputsList: import("./types").AgentOutputsListResult | null;
  agentOutputActive: string | null;
  agentOutputContent: string | null;
  agentOutputContentLoading: boolean;
  agentIdentityLoading: boolean;
  agentIdentityError: string | null;
  agentIdentityById: Record<string, AgentIdentityResult>;
  agentSkillsLoading: boolean;
  agentSkillsError: string | null;
  agentSkillsReport: SkillStatusReport | null;
  agentSkillsAgentId: string | null;
  // Agent embedded chat
  agentChatSessionKey: string;
  agentChatMessages: unknown[];
  agentChatStream: string | null;
  agentChatStreamStartedAt: number | null;
  agentChatRunId: string | null;
  agentChatSending: boolean;
  agentChatLoading: boolean;
  agentChatMessage: string;
  agentChatAttachments: ChatAttachment[];
  agentChatError: string | null;
  // dmScope auto-detection status (session isolation)
  dmScopeStatus: {
    recommended: string;
    current: string;
    isExplicit: boolean;
    shouldUpgrade: boolean;
    reason: string;
    configuredChannelCount: number;
    totalAccounts: number;
    multiUserChannels: string[];
  } | null;
  // Team Projects
  teamProjectsLoading: boolean;
  teamProjectsList: TeamProjectSummary[] | null;
  teamProjectsError: string | null;
  teamProjectSelectedId: string | null;
  teamProjectDetail: TeamProjectDetail | null;
  teamProjectDetailLoading: boolean;
  teamProjectHealth: TeamProjectHealthResult | null;
  teamProjectStats: TeamProjectStatsResult | null;
  teamProjectMemory: TeamSharedMemoryEntry[] | null;
  teamProjectActivity: TeamActivityEvent[] | null;
  teamProjectFiles: ProjectWorkspaceFilesResult | null;
  teamProjectTab: "members" | "activity" | "stats" | "settings" | "memory" | "files";
  teamProjectBusy: boolean;
  sessionsLoading: boolean;
  sessionsResult: SessionsListResult | null;
  sessionsError: string | null;
  sessionsFilterActive: string;
  sessionsFilterLimit: string;
  sessionsIncludeGlobal: boolean;
  sessionsIncludeUnknown: boolean;
  /** Session key to highlight when navigated from chat "View Details" */
  sessionsHighlightKey: string;
  /** Search query for filtering sessions on the sessions page */
  sessionsSearchQuery: string;
  cronLoading: boolean;
  cronJobs: CronJob[];
  cronStatus: CronStatus | null;
  cronError: string | null;
  cronForm: CronFormState;
  cronRunsJobId: string | null;
  cronRuns: CronRunLogEntry[];
  cronBusy: boolean;
  skillsLoading: boolean;
  skillsReport: SkillStatusReport | null;
  skillsError: string | null;
  skillsFilter: string;
  skillEdits: Record<string, string>;
  skillMessages: Record<string, SkillMessage>;
  skillsBusyKey: string | null;
  skillsActiveTab: "active" | "library" | "blocked" | "mcp-store" | "market";
  skillsRemoteLoading: boolean;
  skillsRemoteIndex: RemoteSkillsIndex | null;
  skillsRemoteError: string | null;
  // 新的市场状态（基于本地索引）
  skillsMarketLoading: boolean;
  skillsMarketResponse: import("./types").SkillsMarketResponse | null;
  skillsMarketSyncing: boolean;
  skillsMarketLastSyncedAt: string | null;
  skillsMarketError: string | null;
  // 技能分类筛选
  skillsActiveCategory: string;
  // 技能市场搜索关键词（与本地 skillsFilter 分离）
  skillsMarketKeyword: string;
  // 技能市场搜索结果（SQLite FTS5 分页）
  skillsMarketSearchResult: import("./controllers/skills").SkillsMarketSearchResult | null;
  skillsMarketPage: number;
  // 技能列表分页
  skillsVisibleCount: number;
  // 统一视图层级筛选
  skillsTierGroupFilter: "all" | "core" | "ready" | "needs-config" | "disabled" | "catalog";
  // 导入本地技能
  skillsImportOpen: boolean;
  skillsImportPath: string;
  skillsImportBrowseResult: import("./controllers/skills").BrowseResult | null;
  skillsImportLoading: boolean;
  skillsImportError: string | null;
  skillsImportSuccess: string | null;
  // 详情弹窗
  selectedSkillKey: string | null;
  selectedMarketSkill:
    | import("./controllers/skills").SkillsMarketSearchResult["items"][number]
    | null;
  // 侧栏 tier 筛选
  sidebarTierFilter: "all" | "core" | "ready" | "needs-config";
  // Playground 状态（技能玩法推荐）
  playgroundLoading: boolean;
  playgroundReport: SkillStatusReport | null;
  playgroundError: string | null;
  playgroundActiveCategory: string | null;
  playgroundFilter: string;
  playgroundInstallingSkill: string | null;
  playgroundInstallMessage: string | null;
  // 技能安装进度
  skillsInstallProgress: Record<string, import("./controllers/skills").InstallProgress>;
  // 技能批量安装状态
  skillsBatch: import("./controllers/skills-batch").SkillsBatchState;
  handleBatchEvent?: (event: Record<string, unknown>) => void;
  // MCP 扩展工具状态 (Extensions)
  mcpCapabilities: McpCapability[];
  mcpAdvancedOpen: boolean;
  mcpUpdateNotice: { count: number; names: string[] } | null;
  mcpProcesses: McpProcessInfo[];
  mcpTestingServerId: string | null;
  mcpTestResults: Record<string, "success" | "failed">;
  /** Server currently being enabled (shows spinner on card button) */
  mcpEnablingServerId: string | null;
  mcpManualFormTrigger: number;
  // MCP 市场状态
  mcpExtTab: McpExtensionsTab;
  mcpMarketplace: McpMarketplaceState;
  // 文档中心状态
  docsViewState: DocsViewState;
  // 日志上报运维中心状态
  logReportState: LogReportViewState;
  handleLogReportOpen: () => void;
  handleLogReportClose: () => void;
  handleLogReportSubmit: () => Promise<void>;
  handleLogReportQuery: () => Promise<void>;
  // 意见反馈状态
  feedbackState: FeedbackViewState;
  // Token 使用量统计状态 (简易视图，保留向后兼容)
  usageSummary: CostUsageSummary | null;
  usageDays: number;
  // 高级 Usage 分析系统
  usageLoading: boolean;
  usageResult: SessionsUsageResult | null;
  usageCostSummary: CostUsageSummary | null;
  usageError: string | null;
  usageStartDate: string;
  usageEndDate: string;
  usageSelectedSessions: string[];
  usageSelectedDays: string[];
  usageSelectedHours: number[];
  usageChartMode: "tokens" | "cost";
  usageDailyChartMode: "total" | "by-type";
  usageTimeSeriesMode: "cumulative" | "per-turn";
  usageTimeSeriesBreakdownMode: "total" | "by-type";
  usageTimeSeries: SessionUsageTimeSeries | null;
  usageTimeSeriesLoading: boolean;
  usageSessionLogs: import("./views/usage").SessionLogEntry[] | null;
  usageSessionLogsLoading: boolean;
  usageSessionLogsExpanded: boolean;
  usageQuery: string;
  usageQueryDraft: string;
  usageQueryDebounceTimer: number | null;
  usageSessionSort: "tokens" | "cost" | "recent" | "messages" | "errors";
  usageSessionSortDir: "asc" | "desc";
  usageRecentSessions: string[];
  usageTimeZone: "local" | "utc";
  usageContextExpanded: boolean;
  usageHeaderPinned: boolean;
  usageSessionsTab: "all" | "recent";
  usageVisibleColumns: string[];
  usageLogFilterRoles: import("./views/usage").SessionLogRole[];
  usageLogFilterTools: string[];
  usageLogFilterHasTools: boolean;
  usageLogFilterQuery: string;
  // 模型选择状态
  modelsLoading: boolean;
  modelsProviders: import("./controllers/models").ProviderInfo[];
  modelsDefaults: Record<string, string>;
  modelsCurrent: import("./controllers/models").CurrentModelInfo | null;
  modelsSaving: boolean;
  modelsError: string | null;
  modelsConfiguringProvider: string | null;
  modelsAuthSaving: boolean;
  modelsAuthVerifying: boolean;
  modelsAuthVerifyResult: import("./controllers/models").ApiKeyVerifyResult | null;
  // 安全模式状态
  securityLoading: boolean;
  securityModes: import("./controllers/security").SecurityModeInfo[];
  securityCurrent: import("./controllers/security").SecurityMode | null;
  securitySaving: boolean;
  securityError: string | null;
  securityShowWarning: boolean;
  // 免费模型管理状态
  freeModelsLoading: boolean;
  freeModelsEnabled: boolean;
  freeModelsProviders: import("./views/free-models").FreeModelProvider[];
  freeModelsAccounts: import("./views/free-models").FreeModelAccount[];
  freeModelsStats: import("./views/free-models").FreeModelsStats;
  freeModelsSwitchHistory: import("./views/free-models").FreeModelSwitchRecord[];
  freeModelsError: string | null;
  freeModelsConfigModalOpen: boolean;
  freeModelsConfigModalProvider: import("./views/free-models").FreeModelProvider | null;
  freeModelsConfigModalApiKey: string;
  freeModelsConfigModalTesting: boolean;
  freeModelsConfigModalTestResult: { success: boolean; message: string } | null;
  freeModelsConfigModalSaving: boolean;
  freeModelsDeleteModalOpen: boolean;
  freeModelsDeleteModalProvider: import("./views/free-models").FreeModelProvider | null;
  freeModelsDeleteModalDeleting: boolean;
  debugLoading: boolean;
  debugStatus: StatusSummary | null;
  debugHealth: HealthSnapshot | null;
  debugModels: unknown[];
  debugHeartbeat: unknown | null;
  debugCallMethod: string;
  debugCallParams: string;
  debugCallResult: string | null;
  debugCallError: string | null;
  logsLoading: boolean;
  logsError: string | null;
  logsFile: string | null;
  logsEntries: LogEntry[];
  logsFilterText: string;
  logsLevelFilters: Record<LogLevel, boolean>;
  logsAutoFollow: boolean;
  logsTruncated: boolean;
  client: GatewayBrowserClient | null;
  connect: () => void;
  setTab: (tab: Tab) => void;
  setTheme: (theme: ThemeMode, context?: ThemeTransitionContext) => void;
  applySettings: (next: UiSettings) => void;
  loadOverview: () => Promise<void>;
  loadAssistantIdentity: () => Promise<void>;
  loadCron: () => Promise<void>;
  handleWhatsAppStart: (force: boolean) => Promise<void>;
  handleWhatsAppWait: () => Promise<void>;
  handleWhatsAppLogout: () => Promise<void>;
  handleChannelConfigSave: () => Promise<void>;
  handleChannelConfigReload: () => Promise<void>;
  handleDeleteBot: (channelId: string, accountId: string) => Promise<void>;
  handleNostrProfileEdit: (accountId: string, profile: NostrProfile | null) => void;
  handleNostrProfileCancel: () => void;
  handleNostrProfileFieldChange: (field: keyof NostrProfile, value: string) => void;
  handleNostrProfileSave: () => Promise<void>;
  handleNostrProfileImport: () => Promise<void>;
  handleNostrProfileToggleAdvanced: () => void;
  handleExecApprovalDecision: (decision: "allow-once" | "allow-always" | "deny") => Promise<void>;
  handleGatewayUrlConfirm: () => void;
  handleGatewayUrlCancel: () => void;
  handleConfigLoad: () => Promise<void>;
  handleConfigSave: () => Promise<void>;
  handleConfigApply: () => Promise<void>;
  handleConfigFormUpdate: (path: string, value: unknown) => void;
  handleConfigFormModeChange: (mode: "form" | "raw") => void;
  handleConfigRawChange: (raw: string) => void;
  handleInstallSkill: (key: string) => Promise<void>;
  handleUpdateSkill: (key: string) => Promise<void>;
  handleToggleSkillEnabled: (key: string, enabled: boolean) => Promise<void>;
  handleUpdateSkillEdit: (key: string, value: string) => void;
  handleSaveSkillApiKey: (key: string, apiKey: string) => Promise<void>;
  handleCronToggle: (jobId: string, enabled: boolean) => Promise<void>;
  handleCronRun: (jobId: string) => Promise<void>;
  handleCronRemove: (jobId: string) => Promise<void>;
  handleCronAdd: () => Promise<void>;
  handleCronRunsLoad: (jobId: string) => Promise<void>;
  handleCronFormUpdate: (path: string, value: unknown) => void;
  handleSessionsLoad: () => Promise<void>;
  handleSessionsPatch: (key: string, patch: unknown) => Promise<void>;
  handleLoadNodes: () => Promise<void>;
  handleLoadPresence: () => Promise<void>;
  handleLoadSkills: () => Promise<void>;
  handleLoadDebug: () => Promise<void>;
  handleLoadLogs: () => Promise<void>;
  handleDebugCall: () => Promise<void>;
  handleRunUpdate: () => Promise<void>;
  setPassword: (next: string) => void;
  setSessionKey: (next: string) => void;
  setChatMessage: (next: string) => void;
  handleChatSend: () => Promise<void>;
  handleChatAbort: () => Promise<void>;
  handleChatSelectQueueItem: (id: string) => void;
  handleChatDropQueueItem: (id: string) => void;
  handleChatClearQueue: () => void;
  handleLogsFilterChange: (next: string) => void;
  handleLogsLevelFilterToggle: (level: LogLevel) => void;
  handleLogsAutoFollowToggle: (next: boolean) => void;
  handleCallDebugMethod: (method: string, params: string) => Promise<void>;
  // 适配公告弹框
  showAdaptationNotice: boolean;
  dismissAdaptationNotice: () => void;
  // 反馈功能处理函数
  handleFeedbackOpen: () => void;
  handleFeedbackClose: () => void;
  handleFeedbackSubmit: () => Promise<void>;
  // 模型选择处理函数
  setModelPrimary: (providerId: string, modelId: string) => Promise<void>;
  setModelPending: (providerId: string, modelId: string) => void;
  cancelModelPending: () => void;
  confirmModelPending: () => Promise<void>;
  modelsPendingProvider: string | null;
  modelsPendingModel: string | null;
  setConfiguringProvider: (providerId: string | null) => void;
  saveProviderAuth: (
    providerId: string,
    auth: { apiKey?: string; secretId?: string; secretKey?: string },
  ) => Promise<void>;
  verifyProviderApiKey: (
    providerId: string,
    apiKey: string,
    model?: string,
  ) => Promise<import("./controllers/models").ApiKeyVerifyResult>;
  clearAuthVerifyResult: () => void;
  // 安全模式处理函数
  setSecurityMode: (mode: string) => Promise<void>;
  closeSecurityWarning: () => void;
  confirmSecurityTrustMode: () => Promise<void>;
  // 工具流处理函数
  resetToolStream: () => void;
  resetChatScroll: (force?: boolean) => void;
  // Chat 处理函数
  handleChatScroll: (event: Event) => void;
  handleAgentChatScroll: (event: Event) => void;
  handleSendChat: (
    msg?: string,
    opts?: { restoreDraft?: boolean; voiceMode?: boolean },
  ) => Promise<void>;
  handleAbortChat: () => Promise<void>;
  removeQueuedMessage: (id: string) => void;
  // Sidebar 处理函数
  handleOpenSidebar: (content: string) => void;
  handleCloseSidebar: () => void;
  handleSplitRatioChange: (ratio: number) => void;
  // Logs 处理函数
  exportLogs: (lines: string[], label: string) => void;
  handleLogsScroll: (event: Event) => void;
  logsCursor: number | null;
  logsLastFetchAt: number | null;
  logsLimit: number;
  logsMaxBytes: number;

  // ── OpenClawCN: Voice / ASR / TTS ──────────────────────────────────
  voiceAsrAvailable: boolean | null;
  voiceStreamingAsrAvailable: boolean;
  voiceError: string | null;
  voiceMascotDismissed: boolean;
  voiceMode: boolean;
  voiceRecordingState: "idle" | "recording" | "processing";
  /** Real-time volume level (0..1) from AnalyserNode during recording. */
  voiceVolumeLevel: number;
  /** Active streaming ASR session ID, null when not streaming. */
  voiceStreamSessionId: string | null;
  /** Partial transcription text from streaming ASR (updated via asr.partial events). */
  voicePartialText: string;
  handleVoiceMascotDismiss: () => void;
  handleVoiceStartRecording: () => Promise<void>;
  handleVoiceStopRecording: (opts?: { autoSend?: boolean }) => void | Promise<void>;
  toggleVoiceMode: () => Promise<void>;

  // ── OpenClawCN: Screen Share ──────────────────────────────────────
  screenShareActive: boolean;
  screenShareFrameCount: number;
  screenShareModelName: string | null;
  screenShareLatestFrame: string | null;
  toggleScreenShare: () => Promise<void>;

  // ── OpenClawCN: Update system ──────────────────────────────────────
  updateAvailable: import("./views/update-dialog").UpdateAvailableInfo | null;
  updateDialogOpen: boolean;
  updateExecuting: boolean;
  updateProgress: import("./views/update-dialog").UpdateProgress | null;
  updateResult: import("./views/update-dialog").UpdateResult | null;

  // ── OpenClawCN: Orchestrator (智能组队) ─────────────────────────────
  orchestratorOpen: boolean;
  orchestratorState: unknown;

  // ── OpenClawCN: Networking Center (组网中心) ───────────────────────
  networkTab: NetworkTab;
  networkStatusLoading: boolean;
  networkStatus: NetworkCenterStatus | null;
  networkStatusError: string | null;
  networkDiscoveryLoading: boolean;
  networkDiscoveredGateways: NetworkDiscoveredGateway[];
  networkDiscoveryError: string | null;
  networkProbeLoading: boolean;
  networkProbeResult: NetworkProbeResult | null;
  networkInterfacesLoading: boolean;
  networkInterfaces: NetworkInterfaceInfo[];
  networkConfigureLoading: boolean;
  networkConfigureError: string | null;

  // ── OpenClawCN: Conversation sidebar ───────────────────────────────
  convSidebarOpen: boolean;
  convSidebarAssets: import("./views/conversation-sidebar").DigitalAsset[];
  convSidebarAssetsLoading: boolean;
  convSidebarAssetsSessionKey: string;

  // ── OpenClawCN: Image gallery ──────────────────────────────────────
  imageGalleryOpen: boolean;
  imageGalleryImages: Array<{ url: string; prompt?: string; model?: string; timestamp?: number }>;

  // ── OpenClawCN: Chat stream ────────────────────────────────────────
  chatStreamJustCompleted: boolean;

  // ── OpenClawCN: MCP batch config ───────────────────────────────────
  _mcpBatchConfigResult: { success: number; failed: number } | null;
  _mcpBatchConfigSaving: boolean;
  _mcpServerEnvStatus: Record<string, Record<string, boolean>>;
  _mcpToastTimer: number | null;

  // ── OpenClawCN: Success messages ───────────────────────────────────
  modelsSuccessMessage: string | null;
  securitySuccessMessage: string | null;

  // ── OpenClawCN: Skills tier ────────────────────────────────────────
  skillsTierRenderKey: number;

  // ── LitElement base (re-declared for structural typing) ────────────
  requestUpdate: () => void;
};

// ---------------------------------------------------------------------------
// MCP / Extensions types
// ---------------------------------------------------------------------------

export type McpCapabilityStatus = "ready" | "needs_config" | "paused" | "fixing" | "unavailable";

export type McpCapability = {
  id: string;
  friendlyName: string;
  status: McpCapabilityStatus;
  description: string[];
  examplePrompt: string;
  configNeeded?: string;
  isNew?: boolean;
  /** true for the 5 hardcoded built-in capabilities; false/undefined for user-installed MCP */
  isBuiltin?: boolean;
};

export type McpProcessInfo = {
  id: string;
  friendlyName: string;
  status: "running" | "stopped" | "error";
  memoryMB: number;
  toolCount: number;
  error?: string;
};

// ---------------------------------------------------------------------------
// MCP Marketplace types
// ---------------------------------------------------------------------------

export type McpMarketplaceItem = {
  serverId: string;
  friendlyName: string;
  friendlyNameEn: string;
  description: string;
  descriptionEn: string;
  category: string;
  tags: string[];
  version: string;
  npmPackage: string;
  securityScore: number;
  requiresApiKey: boolean;
  apiKeyName?: string;
  apiKeyGuideUrl?: string;
  platforms: string[];
  isOfficial: boolean;
  isNew: boolean;
  toolCount: number;
  installStatus: "not_installed" | "installing" | "installed" | "error";
  /** Detailed error message from last failed install attempt */
  errorMessage?: string;
  /** Capabilities list shown in detail modal */
  capabilities?: string[];
  /** Example prompts for "try saying" */
  examplePrompts?: string[];
  /** Tool names exposed by this server */
  toolNames?: string[];
  /** Installed version (if any) for update detection */
  installedVersion?: string;
  /** True when marketplace version > installed version */
  hasUpdate?: boolean;
  /** Whether this item has a working install method (npm/pypi/SSE) */
  installable?: boolean;
  /** Install method type for UI labeling */
  installMethod?: "npm" | "pypi" | "sse" | "none";
  /** Link to source detail page (for items without install method) */
  sourceUrl?: string;
  /** Data source identifier */
  source?: string;
  /** Setup hint from platformNotes (shown when requiresApiKey is inferred) */
  configHint?: string;
  /** Environment variable schema from ModelScope (keys, descriptions, placeholders) */
  envSchema?: Record<string, { description?: string; type?: string; placeholder?: string }>;
  /** Required environment variable names */
  envRequired?: string[];
  /** SSE endpoint URL (for remote/cloud services) */
  sseUrl?: string;
  /** Whether the item has been verified by the platform */
  isVerified?: boolean;
  /** Whether the SSE service is hosted on a known platform (smithery/modelscope/fcapp) */
  isHosted?: boolean;
};

export type McpMarketplaceState = {
  items: McpMarketplaceItem[];
  loading: boolean;
  error: string | null;
  search: string;
  activeCategory: string;
  sort: "recommended" | "newest" | "popular" | "name";
  recommendations: McpMarketplaceItem[];
  showFirstVisit: boolean;
  /** Currently open detail modal item */
  detailItem: McpMarketplaceItem | null;
  /** Config wizard target */
  configTarget: McpMarketplaceItem | null;
  /** Toast notification (auto-dismissed after 4s) */
  toast: McpToast | null;
  /** Batch API key configuration modal open state */
  showBatchConfig: boolean;
  /** Pagination: current page (1-based) */
  page: number;
  /** Pagination: items per page */
  pageSize: number;
  /** Pagination: total items across all pages */
  total: number;
  /** Pagination: total pages */
  totalPages: number;
  /** True when loading more items (infinite scroll) */
  loadingMore: boolean;
};

export type McpToast = {
  message: string;
  type: "success" | "error" | "info";
  timestamp: number;
};

export type McpExtensionsTab = "my" | "store";

// ---------------------------------------------------------------------------
// OpenClawCN: Networking Center (组网中心) types
// ---------------------------------------------------------------------------

export type NetworkTab = "devices" | "connection" | "security";

export type NetworkCenterStatus = {
  mode: "loopback" | "lan" | "tailnet";
  gatewayBind: string;
  gatewayPort: number;
  gatewayTls: boolean;
  onlineDeviceCount: number;
  onlineNodeCount: number;
  mdnsEnabled: boolean;
  tailscaleAvailable: boolean;
  tailscaleConnected: boolean;
  localIp: string | null;
  tailnetIp: string | null;
  hasAuthToken: boolean;
  platform: string;
};

export type NetworkDiscoveredGateway = {
  instanceName: string;
  displayName: string;
  host: string;
  port: number;
  domain: string;
  tailnetDns?: string;
  lanHost?: string;
  role?: string;
  platform?: string;
  version?: string;
  gatewayTls?: boolean;
};

export type NetworkProbeResult = {
  targetHost: string;
  reachable: boolean;
  latencyMs: number;
  error?: string;
  gatewayVersion?: string;
};

export type NetworkInterfaceInfo = {
  name: string;
  address: string;
  family: "IPv4" | "IPv6";
  internal: boolean;
  netmask: string;
  mac: string;
  isTailnet: boolean;
};
