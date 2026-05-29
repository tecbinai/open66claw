type ScrollHost = {
  updateComplete: Promise<unknown>;
  querySelector: (selectors: string) => Element | null;
  style: CSSStyleDeclaration;
  chatScrollFrame: number | null;
  chatScrollTimeout: number | null;
  chatHasAutoScrolled: boolean;
  chatUserNearBottom: boolean;
  logsScrollFrame: number | null;
  logsAtBottom: boolean;
  topbarObserver: ResizeObserver | null;
  // Agent embedded chat scroll state
  agentChatScrollFrame: number | null;
  agentChatScrollTimeout: number | null;
  agentChatUserNearBottom: boolean;
};

export function scheduleChatScroll(host: ScrollHost, force = false) {
  if (host.chatScrollFrame) cancelAnimationFrame(host.chatScrollFrame);
  if (host.chatScrollTimeout != null) {
    clearTimeout(host.chatScrollTimeout);
    host.chatScrollTimeout = null;
  }
  const pickScrollTarget = () => {
    const container = host.querySelector(".chat-thread") as HTMLElement | null;
    if (container) {
      const overflowY = getComputedStyle(container).overflowY;
      const canScroll =
        overflowY === "auto" ||
        overflowY === "scroll" ||
        container.scrollHeight - container.clientHeight > 1;
      if (canScroll) return container;
    }
    return (document.scrollingElement ?? document.documentElement) as HTMLElement | null;
  };
  // Wait for Lit render to complete, then scroll
  void host.updateComplete.then(() => {
    host.chatScrollFrame = requestAnimationFrame(() => {
      host.chatScrollFrame = null;
      const target = pickScrollTarget();
      if (!target) return;
      const distanceFromBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
      const shouldStick = force || host.chatUserNearBottom || distanceFromBottom < 200;
      if (!shouldStick) return;
      if (force) host.chatHasAutoScrolled = true;
      target.scrollTop = target.scrollHeight;
      host.chatUserNearBottom = true;
      const retryDelay = force ? 150 : 120;
      host.chatScrollTimeout = window.setTimeout(() => {
        host.chatScrollTimeout = null;
        const latest = pickScrollTarget();
        if (!latest) return;
        const latestDistanceFromBottom =
          latest.scrollHeight - latest.scrollTop - latest.clientHeight;
        const shouldStickRetry = force || host.chatUserNearBottom || latestDistanceFromBottom < 200;
        if (!shouldStickRetry) return;
        latest.scrollTop = latest.scrollHeight;
        host.chatUserNearBottom = true;
      }, retryDelay);
    });
  });
}

export function scheduleLogsScroll(host: ScrollHost, force = false) {
  if (host.logsScrollFrame) cancelAnimationFrame(host.logsScrollFrame);
  void host.updateComplete.then(() => {
    host.logsScrollFrame = requestAnimationFrame(() => {
      host.logsScrollFrame = null;
      const container = host.querySelector(".log-stream") as HTMLElement | null;
      if (!container) return;
      const distanceFromBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight;
      const shouldStick = force || distanceFromBottom < 80;
      if (!shouldStick) return;
      container.scrollTop = container.scrollHeight;
    });
  });
}

// ============ 性能优化：滚动处理节流 ============
let chatScrollThrottleTimer: number | null = null;
const CHAT_SCROLL_THROTTLE_MS = 50; // 约 20fps

export function handleChatScroll(host: ScrollHost, event: Event) {
  // 节流：避免滚动事件过于频繁
  if (chatScrollThrottleTimer !== null) return;

  chatScrollThrottleTimer = window.setTimeout(() => {
    chatScrollThrottleTimer = null;
  }, CHAT_SCROLL_THROTTLE_MS);

  const container = event.currentTarget as HTMLElement | null;
  if (!container) return;
  const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
  host.chatUserNearBottom = distanceFromBottom < 200;
}

// 日志滚动节流
let logsScrollThrottleTimer: number | null = null;

export function handleLogsScroll(host: ScrollHost, event: Event) {
  // 节流：避免滚动事件过于频繁
  if (logsScrollThrottleTimer !== null) return;

  logsScrollThrottleTimer = window.setTimeout(() => {
    logsScrollThrottleTimer = null;
  }, CHAT_SCROLL_THROTTLE_MS);

  const container = event.currentTarget as HTMLElement | null;
  if (!container) return;
  const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
  host.logsAtBottom = distanceFromBottom < 80;
}

export function resetChatScroll(host: ScrollHost) {
  host.chatHasAutoScrolled = false;
  host.chatUserNearBottom = true;
}

// ============ Agent 内嵌聊天滚动 ============

export function scheduleAgentChatScroll(host: ScrollHost, force = false) {
  if (host.agentChatScrollFrame) cancelAnimationFrame(host.agentChatScrollFrame);
  if (host.agentChatScrollTimeout != null) {
    clearTimeout(host.agentChatScrollTimeout);
    host.agentChatScrollTimeout = null;
  }
  void host.updateComplete.then(() => {
    host.agentChatScrollFrame = requestAnimationFrame(() => {
      host.agentChatScrollFrame = null;
      const container = host.querySelector(".agent-chat-messages") as HTMLElement | null;
      if (!container) return;
      const distanceFromBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight;
      const shouldStick = force || host.agentChatUserNearBottom || distanceFromBottom < 200;
      if (!shouldStick) return;
      container.scrollTop = container.scrollHeight;
      host.agentChatUserNearBottom = true;
      const retryDelay = force ? 150 : 120;
      host.agentChatScrollTimeout = window.setTimeout(() => {
        host.agentChatScrollTimeout = null;
        const latest = host.querySelector(".agent-chat-messages") as HTMLElement | null;
        if (!latest) return;
        const d = latest.scrollHeight - latest.scrollTop - latest.clientHeight;
        if (force || host.agentChatUserNearBottom || d < 200) {
          latest.scrollTop = latest.scrollHeight;
          host.agentChatUserNearBottom = true;
        }
      }, retryDelay);
    });
  });
}

let agentChatScrollThrottleTimer: number | null = null;

export function handleAgentChatScroll(host: ScrollHost, event: Event) {
  if (agentChatScrollThrottleTimer !== null) return;
  agentChatScrollThrottleTimer = window.setTimeout(() => {
    agentChatScrollThrottleTimer = null;
  }, CHAT_SCROLL_THROTTLE_MS);
  const container = event.currentTarget as HTMLElement | null;
  if (!container) return;
  const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
  host.agentChatUserNearBottom = distanceFromBottom < 200;
}

export function exportLogs(lines: string[], label: string) {
  if (lines.length === 0) return;
  const blob = new Blob([`${lines.join("\n")}\n`], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  anchor.href = url;
  anchor.download = `clawdbot-logs-${label}-${stamp}.log`;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function observeTopbar(host: ScrollHost) {
  if (typeof ResizeObserver === "undefined") return;
  const topbar = host.querySelector(".topbar");
  if (!topbar) return;
  const update = () => {
    const { height } = topbar.getBoundingClientRect();
    host.style.setProperty("--topbar-height", `${height}px`);
  };
  update();
  host.topbarObserver = new ResizeObserver(() => update());
  host.topbarObserver.observe(topbar);
}
