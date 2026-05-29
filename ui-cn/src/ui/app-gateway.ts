import { CHAT_SESSIONS_ACTIVE_MINUTES, flushChatQueueForEvent } from "./app-chat.ts";
import type { EventLogEntry } from "./app-events.ts";
import {
  applySettings,
  loadCron,
  refreshActiveTab,
  setLastActiveSessionKey,
} from "./app-settings.ts";
import { handleAgentEvent, resetToolStream, type AgentEventPayload } from "./app-tool-stream.ts";
import type { OpenClawCNApp } from "./app.ts";
import { shouldReloadHistoryForFinalEvent } from "./chat-event-reload.ts";
import { handleAgentChatEvent } from "./controllers/agent-chat.ts";
import { loadAgents } from "./controllers/agents.ts";
import { loadAssistantIdentity } from "./controllers/assistant-identity.ts";
import { loadChatHistory } from "./controllers/chat.ts";
import { extractText } from "./chat/message-extract.ts";
import { handleChatEvent, type ChatEventPayload } from "./controllers/chat.ts";
import { loadDevices } from "./controllers/devices.ts";
import type { ExecApprovalRequest } from "./controllers/exec-approval.ts";
import {
  addExecApproval,
  parseExecApprovalRequested,
  parseExecApprovalResolved,
  removeExecApproval,
} from "./controllers/exec-approval.ts";
import { isImageGenTierProgressEvent } from "./controllers/imagegen-tier.ts";
import { isLocalEngineProgressEvent } from "./controllers/local-engine.ts";
import { loadNodes } from "./controllers/nodes.ts";
import { loadSessions } from "./controllers/sessions.ts";
import type { InstallProgress } from "./controllers/skills.ts";
import { loadTeamProjects } from "./controllers/team-projects.ts";
import { isVoiceTierProgressEvent } from "./controllers/voice-tier.ts";
import type { GatewayEventFrame, GatewayHelloOk } from "./gateway.ts";
import { GatewayBrowserClient } from "./gateway.ts";
import type { Tab } from "./navigation.ts";
import type { UiSettings } from "./storage.ts";
import {
  isTokenAuthError,
  refreshGatewayTokenFromServer,
  saveSettings,
} from "./storage.ts";
import type { AgentsListResult, PresenceEntry, HealthSnapshot, StatusSummary } from "./types.ts";

// Wizard SOUL.md generation: handle streaming chat events
function handleWizardSoulEvent(app: OpenClawCNApp, payload: ChatEventPayload) {
  const wiz = app.agentWizard;
  if (!wiz) return;

  if (payload.state === "delta") {
    const text = extractText(payload.message);
    if (typeof text === "string") {
      wiz.soulMdDraft = text;
      app.requestUpdate();
    }
  } else if (payload.state === "final") {
    const text = extractText(payload.message);
    if (typeof text === "string" && text.length > 0) {
      wiz.soulMdDraft = text;
    }
    wiz.soulGenerating = false;
    wiz.soulGenerated = true;
    wiz._soulSessionKey = "";
    app.requestUpdate();
  } else if (payload.state === "error" || payload.state === "aborted") {
    wiz.soulGenerating = false;
    wiz.soulError = payload.errorMessage || "生成失败";
    wiz._soulSessionKey = "";
    app.requestUpdate();
  }
}

// [CN-FIX:assets-refresh] Inline helper to reload sidebar assets after media
// generation completes. Avoids circular dependency with app-render.ts where the
// primary loadSidebarAssets lives.
async function refreshSidebarAssetsInline(app: OpenClawCNApp) {
  if (!app.client || !app.connected || !app.sessionKey) {return;}
  if (app.convSidebarAssetsLoading) {return;}
  // Skip if cache is still valid (another caller already refreshed)
  if (app.convSidebarAssetsSessionKey === app.sessionKey) {return;}
  try {
    const res = (await app.client.request("media.list", {
      sessionKey: app.sessionKey,
    }));
    app.convSidebarAssets = res?.assets ?? [];
    app.convSidebarAssetsSessionKey = app.sessionKey;
  } catch {
    // Silently ignore — non-critical UI refresh
  }
}

type GatewayHost = {
  settings: UiSettings;
  password: string;
  // [CN-MERGE:d574056761] Stable websocket instance ID for reconnection dedup
  clientInstanceId: string;
  client: GatewayBrowserClient | null;
  connected: boolean;
  hello: GatewayHelloOk | null;
  lastError: string | null;
  onboarding?: boolean;
  eventLogBuffer: EventLogEntry[];
  eventLog: EventLogEntry[];
  tab: Tab;
  presenceEntries: PresenceEntry[];
  presenceError: string | null;
  presenceStatus: StatusSummary | null;
  agentsLoading: boolean;
  agentsList: AgentsListResult | null;
  agentsError: string | null;
  debugHealth: HealthSnapshot | null;
  assistantName: string;
  assistantAvatar: string | null;
  assistantAgentId: string | null;
  sessionKey: string;
  chatRunId: string | null;
  refreshSessionsAfterChat: Set<string>;
  execApprovalQueue: ExecApprovalRequest[];
  execApprovalError: string | null;
  skillsInstallProgress: Record<string, InstallProgress>;
  globalToast: import("./app-view-state.ts").McpToast | null;
  _globalToastTimer: number | null;
  updateExecuting: boolean;
  updateProgress: import("./views/update-dialog").UpdateProgress | null;
  updateResult: import("./views/update-dialog").UpdateResult | null;
  updateAvailable: import("./views/update-dialog").UpdateAvailableInfo | null;
  // 首次启动引导中
  firstRunGuide: boolean;
};

type SessionDefaultsSnapshot = {
  defaultAgentId?: string;
  mainKey?: string;
  mainSessionKey?: string;
  scope?: string;
};

function normalizeSessionKeyForDefaults(
  value: string | undefined,
  defaults: SessionDefaultsSnapshot,
): string {
  const raw = (value ?? "").trim();
  const mainSessionKey = defaults.mainSessionKey?.trim();
  if (!mainSessionKey) {
    return raw;
  }
  if (!raw) {
    return mainSessionKey;
  }
  const mainKey = defaults.mainKey?.trim() || "main";
  const defaultAgentId = defaults.defaultAgentId?.trim();
  const isAlias =
    raw === "main" ||
    raw === mainKey ||
    (defaultAgentId &&
      (raw === `agent:${defaultAgentId}:main` || raw === `agent:${defaultAgentId}:${mainKey}`));
  return isAlias ? mainSessionKey : raw;
}

function applySessionDefaults(host: GatewayHost, defaults?: SessionDefaultsSnapshot) {
  if (!defaults?.mainSessionKey) {
    return;
  }
  const resolvedSessionKey = normalizeSessionKeyForDefaults(host.sessionKey, defaults);
  const resolvedSettingsSessionKey = normalizeSessionKeyForDefaults(
    host.settings.sessionKey,
    defaults,
  );
  const resolvedLastActiveSessionKey = normalizeSessionKeyForDefaults(
    host.settings.lastActiveSessionKey,
    defaults,
  );
  const nextSessionKey = resolvedSessionKey || resolvedSettingsSessionKey || host.sessionKey;
  const nextSettings = {
    ...host.settings,
    sessionKey: resolvedSettingsSessionKey || nextSessionKey,
    lastActiveSessionKey: resolvedLastActiveSessionKey || nextSessionKey,
  };
  const shouldUpdateSettings =
    nextSettings.sessionKey !== host.settings.sessionKey ||
    nextSettings.lastActiveSessionKey !== host.settings.lastActiveSessionKey;
  if (nextSessionKey !== host.sessionKey) {
    host.sessionKey = nextSessionKey;
  }
  if (shouldUpdateSettings) {
    applySettings(host as unknown as Parameters<typeof applySettings>[0], nextSettings);
  }
}

export function connectGateway(host: GatewayHost) {
  host.lastError = null;
  host.hello = null;
  host.connected = false;
  host.execApprovalQueue = [];
  host.execApprovalError = null;
  // FIX R3-9: 重连时清理上一轮连接遗留的 approval 过期定时器，
  // 防止旧定时器触发时错误操作新连接的 execApprovalQueue
  for (const tid of _approvalTimers.values()) {
    clearTimeout(tid);
  }
  _approvalTimers.clear();

  const previousClient = host.client;
  const client = new GatewayBrowserClient({
    url: host.settings.gatewayUrl,
    token: host.settings.token.trim() ? host.settings.token : undefined,
    password: host.password.trim() ? host.password : undefined,
    clientName: "openclaw-control-ui",
    mode: "webchat",
    instanceId: host.clientInstanceId,
    onHello: (hello) => {
      if (host.client !== client) {
        return;
      }
      host.connected = true;
      host.lastError = null;
      host.hello = hello;
      applySnapshot(host, hello);
      // Reset orphaned chat run state from before disconnect.
      // Any in-flight run's final event was lost during the disconnect window.
      host.chatRunId = null;
      (host as unknown as { chatStream: string | null }).chatStream = null;
      (host as unknown as { chatStreamStartedAt: number | null }).chatStreamStartedAt = null;
      resetToolStream(host as unknown as Parameters<typeof resetToolStream>[0]);
      void loadAssistantIdentity(host as unknown as OpenClawCNApp);
      void loadAgents(host as unknown as OpenClawCNApp);
      void loadTeamProjects(host as unknown as OpenClawCNApp);
      void loadNodes(host as unknown as OpenClawCNApp, { quiet: true });
      void loadDevices(host as unknown as OpenClawCNApp, { quiet: true });
      void refreshActiveTab(host as unknown as Parameters<typeof refreshActiveTab>[0]);
      // Desktop first-run: auto-navigate to model-config if no providers configured
      void detectFirstRunSetup(host);
      // CR-5 + S2-6: 重连时如果之前有正在执行的更新，先标记为断开，
      // 然后查 update.status 判断更新是否其实已成功（VERSION 已变）。
      const wasExecutingUpdate = host.updateExecuting;
      if (wasExecutingUpdate) {
        host.updateExecuting = false;
        host.updateProgress = null;
      }
      // Smooth Update: restore update banner state after reconnect
      void client
        .request("update.status", {})
        .then((res: unknown) => {
          const result = res as Record<string, unknown> | undefined;
          const res2 = result;
          if (wasExecutingUpdate && (!res2?.hasUpdate || res2.dismissed)) {
            // S2-6: 之前在执行更新，重连后发现更新状态已清除 → 更新实际成功了
            host.updateResult = { ok: true, status: "ok", version: host.updateAvailable?.version };
            return;
          }
          if (wasExecutingUpdate && !host.updateResult) {
            // 仍有更新可用，说明更新未成功 → 显示连接丢失错误
            host.updateResult = { ok: false, error: "connection lost during update" };
          }
          if (res2?.hasUpdate && !res2.dismissed && typeof res2.version === "string") {
            host.updateAvailable = {
              version: res2.version,
              updateType: (res2.updateType as "delta" | "full" | "installer") ?? "installer",
              changelog: res2.changelog as { "zh-CN"?: string; "en-US"?: string } | undefined,
              summary: typeof res2.summary === "string" ? res2.summary : undefined,
              mandatory: res2.mandatory === true,
              installerUrl: typeof res2.installerUrl === "string" ? res2.installerUrl : undefined,
            };
          }
        })
        .catch(() => {
          // 查询失败，保守处理
          if (wasExecutingUpdate && !host.updateResult) {
            host.updateResult = { ok: false, error: "connection lost during update" };
          }
        });
      // [CN-PATCH:voice] Check ASR availability + auto-start KWS wake word listening
      {
        const app = host as unknown as OpenClawCNApp;
        if (typeof app.checkVoiceCapabilities === "function") {
          void app.checkVoiceCapabilities().then(() => {
            // Auto-start KWS if voice is available
            if (app.voiceAsrAvailable && typeof app.startWakeWordListening === "function") {
              void app.startWakeWordListening();
            }
          });
        }
      }
    },
    onClose: ({ code, reason }) => {
      if (host.client !== client) {
        return;
      }
      host.connected = false;
      // Code 1012 = Service Restart (expected during config saves, don't show as error)
      if (code !== 1012) {
        host.lastError = `disconnected (${code}): ${reason || "no reason"}`;
      }
      // Auto-refresh token on auth failure and reconnect
      if (isTokenAuthError(reason)) {
        void refreshGatewayTokenFromServer().then((newToken) => {
          if (newToken && newToken !== host.settings.token) {
            host.settings = { ...host.settings, token: newToken };
            saveSettings(host.settings);
            connectGateway(host);
          }
        });
      }
    },
    onEvent: (evt) => {
      if (host.client !== client) {
        return;
      }
      handleGatewayEvent(host, evt);
    },
    onGap: ({ expected, received }) => {
      if (host.client !== client) {
        return;
      }
      host.lastError = `event gap detected (expected seq ${expected}, got ${received}); refresh recommended`;
    },
  });
  host.client = client;
  previousClient?.stop();
  client.start();
}

// FIX BUG-R2-9: 跟踪 exec approval 过期定时器，支持提前清理
const _approvalTimers = new Map<string, number>();

/**
 * [CN-PATCH:voice] Frontend-driven TTS: synthesize response text via gateway
 * and play it as audio. Used when backend TTS pipeline is not available.
 */
async function synthesizeAndPlayTts(app: OpenClawCNApp, text: string) {
  if (!app.client) return;
  // Truncate for TTS — long responses should be summarized, not spoken in full
  const ttsText = text.length > 500 ? text.slice(0, 500) : text;
  try {
    const result = (await app.client.request("tts.synthesize", {
      text: ttsText,
      encoding: "mp3",
    })) as { audioBase64?: string; format?: string } | undefined;
    if (result?.audioBase64 && typeof app.playTtsAudio === "function") {
      app.playTtsAudio(result.audioBase64, result.format ?? "mp3");
    }
  } catch (err) {
    console.warn("[voice] TTS synthesis failed:", err);
  }
}

export function handleGatewayEvent(host: GatewayHost, evt: GatewayEventFrame) {
  try {
    handleGatewayEventUnsafe(host, evt);
  } catch (err) {
    console.error("[gateway] handleGatewayEvent error:", evt.event, err);
  }
}

function handleGatewayEventUnsafe(host: GatewayHost, evt: GatewayEventFrame) {
  // [CN-PERF] Only collect event log entries when on the debug tab.
  // Previously, every WS message (including high-frequency chat deltas)
  // created a new 250-element array via spread+slice — unnecessary GC
  // pressure when the user is on chat/config/other tabs.
  if (host.tab === "debug") {
    host.eventLogBuffer = [
      { ts: Date.now(), event: evt.event, payload: evt.payload },
      ...host.eventLogBuffer,
    ].slice(0, 250);
    host.eventLog = host.eventLogBuffer;
  }

  if (evt.event === "agent") {
    if (host.onboarding) {
      return;
    }
    handleAgentEvent(
      host as unknown as Parameters<typeof handleAgentEvent>[0],
      evt.payload as AgentEventPayload | undefined,
    );
    return;
  }

  if (evt.event === "chat") {
    const payload = evt.payload as ChatEventPayload | undefined;
    if (payload?.sessionKey) {
      setLastActiveSessionKey(
        host as unknown as Parameters<typeof setLastActiveSessionKey>[0],
        payload.sessionKey,
      );
    }

    // Wizard SOUL generation: intercept if sessionKey matches wizard session
    const app = host as unknown as OpenClawCNApp;
    const wizSoulKey = app.agentWizard?._soulSessionKey;
    if (
      payload?.sessionKey &&
      wizSoulKey &&
      (payload.sessionKey === wizSoulKey ||
        payload.sessionKey.endsWith(`:${wizSoulKey}`) ||
        wizSoulKey.endsWith(`:${payload.sessionKey}`))
    ) {
      handleWizardSoulEvent(app, payload);
      return; // consumed by wizard, skip main chat
    }

    // Agent embedded chat: intercept if sessionKey matches agentChat
    if (
      payload?.sessionKey &&
      app.agentChatSessionKey &&
      payload.sessionKey === app.agentChatSessionKey
    ) {
      handleAgentChatEvent(app, payload);
      return; // consumed by embedded chat, skip main chat
    }

    const state = handleChatEvent(host as unknown as OpenClawCNApp, payload);
    // [CN-FIX:live-render] Explicitly request Lit re-render after chat state mutation.
    (host as unknown as OpenClawCNApp).requestUpdate();
    if (
      state === "final" ||
      state === "final_failover" ||
      state === "error" ||
      state === "aborted"
    ) {
      resetToolStream(host as unknown as Parameters<typeof resetToolStream>[0]);
      void flushChatQueueForEvent(host as unknown as Parameters<typeof flushChatQueueForEvent>[0]);
      const runId = payload?.runId;
      if (runId && host.refreshSessionsAfterChat.has(runId)) {
        host.refreshSessionsAfterChat.delete(runId);
      }
      // [CN-PATCH:voice] Clean up voice-input tracking on error/abort
      if (runId && (state === "error" || state === "aborted")) {
        const app = host as unknown as OpenClawCNApp;
        app._voiceInputRunIds?.delete(runId);
      }
      // Always refresh sessions after chat completes so sidebar titles update
      if (state === "final" || state === "final_failover") {
        void loadSessions(host as unknown as OpenClawCNApp, {
          activeMinutes: CHAT_SESSIONS_ACTIVE_MINUTES,
        });
      }
    }
    // [CN-MERGE:dc6afeb4f8] Skip full history reload when the final message was already
    // appended inline by handleChatEvent (normalizeFinalAssistantMessage).
    // [CN-FIX:swallowed-reply] When no inline message was appended (agent/tool-only runs),
    // delay the history reload slightly to give the PI runner time to persist the
    // assistant message to the session JSONL. Without this delay, the reload can
    // race with server-side persistence and return stale history.
    if (
      (state === "final" || state === "final_failover") &&
      shouldReloadHistoryForFinalEvent(
        evt.payload as import("./controllers/chat.ts").ChatEventPayload,
      )
    ) {
      setTimeout(() => {
        void loadChatHistory(host as unknown as OpenClawCNApp);
        // [CN-FIX:assets-refresh] Invalidate sidebar assets cache AND proactively
        // reload so newly generated images/videos appear in the "资源" tab without
        // requiring the user to manually click the tab again.
        const app = host as unknown as OpenClawCNApp;
        app.convSidebarAssetsSessionKey = "";
        void refreshSidebarAssetsInline(app);
      }, 600);
    }
    // [CN-PATCH:voice] Auto-play TTS audio on chat final (one-shot fallback)
    // Skip if streaming TTS queue is active (already playing chunks progressively)
    if ((state === "final" || state === "final_failover") && payload?.ttsAudio) {
      const app = host as unknown as OpenClawCNApp;
      const hasStreamQueue = (app as any)._ttsQueuePlaying || (app as any)._ttsQueue?.length > 0;
      if (!hasStreamQueue && typeof app.playTtsAudio === "function") {
        app.playTtsAudio(payload.ttsAudio.base64, payload.ttsAudio.format);
      }
    }
    // [CN-PATCH:voice] Frontend-driven TTS: when a voice-input run completes,
    // synthesize TTS for the AI response and play it. This bypasses the backend
    // TTS pipeline (which requires upstream modifications we can't make).
    if ((state === "final" || state === "final_failover") && payload?.runId) {
      const app = host as unknown as OpenClawCNApp;
      if (app._voiceInputRunIds?.has(payload.runId)) {
        app._voiceInputRunIds.delete(payload.runId);
        // Extract assistant response text for TTS
        const responseText = extractText(payload.message);
        if (responseText && responseText.trim().length >= 2 && app.client) {
          // Don't synthesize if streaming TTS already played
          const hasStreamQueue =
            (app as any)._ttsQueuePlaying || (app as any)._ttsQueue?.length > 0;
          if (!hasStreamQueue && !(payload as any).ttsAudio) {
            void synthesizeAndPlayTts(app, responseText.trim());
          }
        }
      }
    }
    return;
  }

  // [CN-PATCH:voice] Streaming TTS chunks → enqueue for progressive playback
  if (evt.event === "tts.chunk") {
    const payload = evt.payload as
      | {
          runId?: string;
          audio?: { base64: string; format: string; sampleRate?: number } | null;
          isFinal?: boolean;
        }
      | undefined;
    const app = host as unknown as OpenClawCNApp;
    if (payload?.audio && typeof app.enqueueTtsChunk === "function") {
      app.enqueueTtsChunk(payload.audio.base64, payload.audio.format);
    }
    if (payload?.isFinal && typeof app.markTtsStreamComplete === "function") {
      app.markTtsStreamComplete();
    }
    return;
  }

  // [CN-PATCH:voice] Streaming ASR partial results → update chatMessage in real-time
  if (evt.event === "asr.partial") {
    const payload = evt.payload as
      | { sessionId?: string; partial?: string; final?: string; isFinal?: boolean }
      | undefined;
    const app = host as unknown as OpenClawCNApp;
    if (payload?.sessionId && payload.sessionId === app.voiceStreamSessionId) {
      // Cancel ASR health watchdog — we got a response
      if (typeof (app as any)._clearAsrHealthTimer === "function") {
        (app as any)._clearAsrHealthTimer();
      }
      if (payload.isFinal && payload.final) {
        app.voicePartialText = payload.final;
        app.chatMessage = payload.final;
      } else if (payload.partial && payload.partial !== "...") {
        // Filter out "..." placeholder from API backend — it's just a recording indicator
        app.voicePartialText = payload.partial;
        // Show partial with trailing indicator so users know it's incomplete;
        // the final result from OfflineRecognizer will replace this.
        app.chatMessage = payload.partial + "...";
      }
    }
    return;
  }

  // [CN-PATCH:voice] Wake word detected → enter voice interaction loop
  if (evt.event === "voicewake.detected") {
    const payload = evt.payload as { keyword?: string } | undefined;
    if (payload?.keyword) {
      const app = host as unknown as OpenClawCNApp;
      if (typeof app.toggleVoiceMode === "function" && !app.voiceMode) {
        void app.toggleVoiceMode();
      }
    }
    return;
  }

  if (evt.event === "presence") {
    const payload = evt.payload as { presence?: PresenceEntry[] } | undefined;
    if (payload?.presence && Array.isArray(payload.presence)) {
      host.presenceEntries = payload.presence;
      host.presenceError = null;
      host.presenceStatus = null;
    }
    return;
  }

  if (evt.event === "cron" && host.tab === "cron") {
    void loadCron(host as unknown as Parameters<typeof loadCron>[0]);
  }

  if (evt.event === "device.pair.requested" || evt.event === "device.pair.resolved") {
    void loadDevices(host as unknown as OpenClawCNApp, { quiet: true });
  }

  if (evt.event === "exec.approval.requested") {
    const entry = parseExecApprovalRequested(evt.payload);
    if (entry) {
      host.execApprovalQueue = addExecApproval(host.execApprovalQueue, entry);
      host.execApprovalError = null;
      // FIX BUG-R2-9: 存储定时器引用，在 resolved 或重连时可以清理
      const delay = Math.max(0, entry.expiresAtMs - Date.now() + 500);
      const timerId = window.setTimeout(() => {
        host.execApprovalQueue = removeExecApproval(host.execApprovalQueue, entry.id);
        _approvalTimers.delete(entry.id);
      }, delay);
      _approvalTimers.set(entry.id, timerId);
    }
    return;
  }

  if (evt.event === "exec.approval.resolved") {
    const resolved = parseExecApprovalResolved(evt.payload);
    if (resolved) {
      host.execApprovalQueue = removeExecApproval(host.execApprovalQueue, resolved.id);
      // FIX BUG-R2-9: 清理已解决审批的定时器
      const tid = _approvalTimers.get(resolved.id);
      if (tid != null) {
        clearTimeout(tid);
        _approvalTimers.delete(resolved.id);
      }
    }
  }

  // Voice tier install progress — forward as DOM CustomEvent for model-config view
  if (isVoiceTierProgressEvent(evt)) {
    document.dispatchEvent(new CustomEvent("voice-tier-progress", { detail: evt.payload }));
    return;
  }

  // ImageGen tier install progress — forward as DOM CustomEvent for model-config view
  if (isImageGenTierProgressEvent(evt)) {
    document.dispatchEvent(new CustomEvent("imagegen-tier-progress", { detail: evt.payload }));
    return;
  }

  // Local engine install progress — forward as DOM CustomEvent for model-config view
  if (isLocalEngineProgressEvent(evt)) {
    document.dispatchEvent(new CustomEvent("local-engine-progress", { detail: evt.payload }));
    return;
  }

  // Config auto-repair notification → show global toast
  if (evt.event === "config.repaired") {
    const payload = evt.payload as { method?: string; details?: string } | undefined;
    const method = payload?.method === "rollback" ? "rollback" : "strip";
    const detail = payload?.details ?? "";
    const msg =
      method === "strip"
        ? `config auto-repaired: removed invalid keys (${detail})`
        : `config auto-repaired: rolled back to backup (${detail})`;
    if (host._globalToastTimer) {clearTimeout(host._globalToastTimer);}
    host.globalToast = { message: msg, type: "info", timestamp: Date.now() };
    host._globalToastTimer = window.setTimeout(() => {
      host.globalToast = null;
      host._globalToastTimer = null;
    }, 5000);
    return;
  }

  // Model detect progress broadcast from backend → forward to model-config view
  if (evt.event === "modelConfig.detect.progress") {
    globalThis.dispatchEvent(
      new CustomEvent("openclawcn:detect-progress", { detail: evt.payload }),
    );
    return;
  }
  if (evt.event === "modelConfig.detect.complete") {
    globalThis.dispatchEvent(
      new CustomEvent("openclawcn:detect-complete", { detail: evt.payload }),
    );
    return;
  }

  // Local engine progress broadcast from backend → forward to model-config view
  if (evt.event === "local_engine.progress") {
    globalThis.dispatchEvent(
      new CustomEvent("openclawcn:local-engine-progress", { detail: evt.payload }),
    );
    return;
  }

  // Skill install progress broadcast from backend
  if (evt.event === "skill.install.progress") {
    const payload = evt.payload as
      | {
          skillName?: string;
          stage?: string;
          message?: string;
          percent?: number;
          downloadInfo?: { speed?: string; eta?: string; downloaded?: string; total?: string };
        }
      | undefined;
    if (payload?.skillName) {
      const key = payload.skillName;
      const existing = host.skillsInstallProgress[key];
      // Don't overwrite "done" or cleared progress — prevents WS race after RPC completes
      if (existing?.stage === "done") {return;}
      if (_finishedInstalls.has(key)) {return;}
      const stage = (payload.stage ?? "downloading") as
        | "downloading"
        | "installing"
        | "verifying"
        | "done";
      const msg = payload.message ?? "";
      const pct = payload.percent;
      const dl = payload.downloadInfo;
      const progressMsg = dl?.speed
        ? `${msg} (${dl.downloaded ?? ""}/${dl.total ?? ""} · ${dl.speed})`
        : msg;
      host.skillsInstallProgress = {
        ...host.skillsInstallProgress,
        [key]: { stage, message: progressMsg, percent: pct },
      };
    }
    return;
  }

  // Smooth Update: server-pushed update availability notification
  if (evt.event === "update.available") {
    const payload = evt.payload as
      | {
          version?: string;
          updateType?: "delta" | "full" | "installer";
          changelog?: { "zh-CN"?: string; "en-US"?: string };
          summary?: string;
          mandatory?: boolean;
          installerUrl?: string;
        }
      | undefined;
    if (payload?.version) {
      host.updateAvailable = {
        version: payload.version,
        updateType: payload.updateType ?? "installer",
        changelog: payload.changelog,
        summary: payload.summary,
        mandatory: payload.mandatory,
        installerUrl: payload.installerUrl,
      };
    }
    return;
  }

  // Smooth Update: real-time progress broadcast during update execution
  if (evt.event === "update.progress") {
    const payload = evt.payload as
      | {
          stage?: string;
          percent?: number;
          message?: string;
        }
      | undefined;
    if (host.updateExecuting && payload) {
      host.updateProgress = {
        stage: (payload.stage ?? "checking") as
          | "checking"
          | "downloading"
          | "applying"
          | "verifying"
          | "complete"
          | "error",
        percent: payload.percent ?? 0,
        message: payload.message ?? "",
      };
      if (payload.stage === "complete") {
        host.updateResult = { ok: true, status: "ok", version: host.updateAvailable?.version };
        host.updateExecuting = false;
      }
      if (payload.stage === "error") {
        host.updateResult = { ok: false, error: payload.message };
        host.updateExecuting = false;
      }
    }
    return;
  }
}

/**
 * Track finished installs to prevent late WS events from re-injecting stale progress
 * after the controller has cleared progress to null.
 */
const _finishedInstalls = new Set<string>();
export function markInstallFinished(skillName: string): void {
  _finishedInstalls.add(skillName);
  setTimeout(() => _finishedInstalls.delete(skillName), 10_000);
}

export function applySnapshot(host: GatewayHost, hello: GatewayHelloOk) {
  const snapshot = hello.snapshot as
    | {
        presence?: PresenceEntry[];
        health?: HealthSnapshot;
        sessionDefaults?: SessionDefaultsSnapshot;
      }
    | undefined;
  if (snapshot?.presence && Array.isArray(snapshot.presence)) {
    host.presenceEntries = snapshot.presence;
  }
  if (snapshot?.health) {
    host.debugHealth = snapshot.health;
  }
  if (snapshot?.sessionDefaults) {
    applySessionDefaults(host, snapshot.sessionDefaults);
  }
}

// ============================================================================
// Desktop first-run setup detection
// ============================================================================

const FIRST_RUN_CHECKED_KEY = "openclawcn-first-run-checked";

/**
 * After gateway connects, check if any model provider is configured.
 * If not:
 *   - Desktop mode: redirect WebView to gateway's /setup wizard page
 *   - Browser mode: navigate to model-config tab
 * If providers are already configured (reinstall / normal startup), skip.
 * Only triggers once per installation (persisted via localStorage flag).
 */
async function detectFirstRunSetup(host: GatewayHost) {
  try {
    // Skip if already checked before
    if (localStorage.getItem(FIRST_RUN_CHECKED_KEY)) {return;}
    // Skip if user is already on model-config or config page
    if (host.tab === "model-config" || host.tab === "config") {return;}
    // Need WebSocket client to query provider status
    if (!host.client) {return;}

    // FIX MC-3: 记录发起检测时的初始 tab，用于检测用户是否已手动导航
    const initialTab = host.tab;

    // Use WebSocket gateway method instead of HTTP endpoint (avoids CORS issues)
    const result = await host.client.request("capability_matrix.providers.list", {});
    const data = result as { providers?: Array<{ configured?: boolean }> } | undefined;
    const providers = data?.providers ?? [];
    const needsSetup = !providers.some((p) => p.configured);

    if (needsSetup) {
      // Switch to model-config tab so the user can configure providers.
      // FIX MC-3: 只在用户未手动导航时才自动切换 tab，防止异步竞态覆盖用户操作
      if (host.tab === initialTab) {
        console.log("[FirstRun] No model providers configured, navigating to model-config");
        host.tab = "model-config" as Tab;
        host.firstRunGuide = true;
      }
    }

    // Mark as checked so we don't redirect on every reconnect
    localStorage.setItem(FIRST_RUN_CHECKED_KEY, Date.now().toString());
  } catch {
    // Non-critical — don't block app startup
  }
}
