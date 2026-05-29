import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createCnLogger } from "../utils/index.js";
import type { CnPluginConfig } from "./cn-config.js";

const log = createCnLogger("memory");

// ============================================================
// Types
// ============================================================

/** CN 用户 Profile（持久化到 JSON） */
export type CnProfile = {
  /** 用户昵称 */
  nickname?: string;
  /** 技术栈偏好 */
  techStack?: string[];
  /** 工作偏好 */
  preferences?: string[];
  /** 项目上下文 */
  projectContext?: string;
  /** 自定义注入文本（原文） */
  customPrompt?: string;
};

/** 对话摘要记录 */
export type SessionSummary = {
  sessionKey: string;
  timestamp: string;
  durationMs?: number;
  success: boolean;
  messageCount: number;
  /** 自动生成的简短摘要 */
  summary: string;
};

/** Compaction 归档记录 */
export type CompactionArchive = {
  sessionKey: string;
  timestamp: string;
  messageCount: number;
  compactingCount?: number;
  tokenCount?: number;
  /** 从消息中提取的关键事实 */
  keyFacts: string[];
};

/** 完整的 memory 存储结构 */
export type MemoryStore = {
  version: number;
  profile: CnProfile;
  summaries: SessionSummary[];
  archives: CompactionArchive[];
};

// ============================================================
// Storage — 轻量 JSON 文件
// ============================================================

const MEMORY_STORE_VERSION = 1;
const MAX_SUMMARIES = 50;
const MAX_ARCHIVES = 100;

/** 获取 memory 存储路径：~/.openclaw/cn-memory.json */
export function getMemoryStorePath(): string {
  return path.join(os.homedir(), ".openclaw", "cn-memory.json");
}

/** 读取 memory 存储，不存在则返回空存储 */
export function loadMemoryStore(storePath?: string): MemoryStore {
  const filePath = storePath ?? getMemoryStorePath();
  try {
    if (!fs.existsSync(filePath)) {
      return createEmptyStore();
    }
    const raw = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw) as Partial<MemoryStore>;
    // 版本校验 + 字段兜底
    return {
      version: typeof data.version === "number" ? data.version : MEMORY_STORE_VERSION,
      profile: isValidProfile(data.profile) ? data.profile : {},
      summaries: Array.isArray(data.summaries) ? data.summaries : [],
      archives: Array.isArray(data.archives) ? data.archives : [],
    };
  } catch {
    return createEmptyStore();
  }
}

/** 保存 memory 存储 */
export function saveMemoryStore(store: MemoryStore, storePath?: string): void {
  const filePath = storePath ?? getMemoryStorePath();
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(store, null, 2), "utf-8");
}

// ============================================================
// 写入串行化 — 防止并发 read-modify-write 竞态
// ============================================================

let writeQueue: Promise<void> = Promise.resolve();

/**
 * 串行化 store 的 read-modify-write 操作。
 * before_compaction 和 agent_end 是 fire-and-forget 并行 hook，
 * 可能几乎同时触发，需要保证写入不丢失。
 */
export function withStoreLock(
  storePath: string | undefined,
  mutator: (store: MemoryStore) => void,
): Promise<void> {
  writeQueue = writeQueue
    .then(() => {
      const store = loadMemoryStore(storePath);
      mutator(store);
      saveMemoryStore(store, storePath);
    })
    .catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn(`store 写入失败: ${msg}`);
    });
  return writeQueue;
}

function createEmptyStore(): MemoryStore {
  return {
    version: MEMORY_STORE_VERSION,
    profile: {},
    summaries: [],
    archives: [],
  };
}

function isValidProfile(v: unknown): v is CnProfile {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// ============================================================
// Hook 1: before_prompt_build — CN Profile 注入
// ============================================================

export type PromptBuildEvent = {
  prompt: string;
  messages: unknown[];
};

export type PromptBuildResult = {
  prependSystemContext?: string;
  appendSystemContext?: string;
};

/**
 * 从 profile + 最近摘要构建注入文本。
 * 返回 appendSystemContext（排在 cn-adapter prompt-inject 之后）。
 */
export function buildProfileContext(store: MemoryStore): string | undefined {
  const parts: string[] = [];

  const { profile } = store;
  if (profile.nickname) {
    parts.push(`用户昵称: ${profile.nickname}`);
  }
  if (profile.techStack && profile.techStack.length > 0) {
    parts.push(`技术栈偏好: ${profile.techStack.join(", ")}`);
  }
  if (profile.preferences && profile.preferences.length > 0) {
    parts.push(`工作偏好: ${profile.preferences.join(", ")}`);
  }
  if (profile.projectContext) {
    parts.push(`项目上下文: ${profile.projectContext}`);
  }
  if (profile.customPrompt) {
    parts.push(profile.customPrompt);
  }

  // 最近 3 条对话摘要
  const recentSummaries = store.summaries.slice(-3);
  if (recentSummaries.length > 0) {
    parts.push("最近对话摘要:");
    for (const s of recentSummaries) {
      parts.push(`- [${s.timestamp}] ${s.summary}`);
    }
  }

  if (parts.length === 0) return undefined;
  return parts.join("\n");
}

export function createProfileInjectHandler(getConfig: () => CnPluginConfig, storePath?: string) {
  return async (_event: PromptBuildEvent): Promise<PromptBuildResult> => {
    const config = getConfig();
    if (config.locale !== "zh-CN" && config.locale !== "zh-TW") {
      return {};
    }

    try {
      const store = loadMemoryStore(storePath);
      const context = buildProfileContext(store);
      if (!context) return {};
      return { appendSystemContext: context };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn(`profile 注入失败: ${msg}`);
      return {};
    }
  };
}

// ============================================================
// Hook 2: before_compaction — 压缩前信息归档
// ============================================================

export type CompactionEvent = {
  messageCount: number;
  compactingCount?: number;
  tokenCount?: number;
  messages?: unknown[];
  sessionFile?: string;
};

export type CompactionContext = {
  sessionKey?: string;
};

/**
 * 从消息列表中提取关键事实（用户明确的决策和结论）。
 * 只提取 assistant 消息中包含特定模式的文本。
 */
export function extractKeyFacts(messages: unknown[]): string[] {
  const facts: string[] = [];
  const patterns = [
    /决定[：:]\s*([^。\n]+)/,
    /结论[：:]\s*([^。\n]+)/,
    /选择了?\s*([^。\n]*方案[^。\n]*)/,
    /确认[：:]\s*([^。\n]+)/,
    /最终.*(采用|使用|选择)\s*([^。\n]+)/,
  ];

  for (const msg of messages) {
    if (!isAssistantMessage(msg)) continue;
    const text = extractMessageText(msg);
    if (!text) continue;

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const fact = (match[2] ?? match[1])!.trim();
        if (fact.length > 0 && fact.length <= 200) {
          facts.push(fact);
        }
      }
    }
  }

  // 去重并限制数量
  return [...new Set(facts)].slice(0, 10);
}

export function createCompactionArchiveHandler(storePath?: string) {
  return async (event: CompactionEvent, ctx: CompactionContext): Promise<void> => {
    const sessionKey = ctx.sessionKey ?? "unknown";
    const keyFacts = event.messages ? extractKeyFacts(event.messages) : [];

    await withStoreLock(storePath, (store) => {
      const archive: CompactionArchive = {
        sessionKey,
        timestamp: new Date().toISOString(),
        messageCount: event.messageCount,
        compactingCount: event.compactingCount,
        tokenCount: event.tokenCount,
        keyFacts,
      };

      store.archives.push(archive);

      // 限制归档数量
      if (store.archives.length > MAX_ARCHIVES) {
        store.archives = store.archives.slice(-MAX_ARCHIVES);
      }
    });

    log.info(`归档 ${keyFacts.length} 条关键事实 (session: ${sessionKey})`);
  };
}

// ============================================================
// Hook 3: agent_end — 对话摘要存档
// ============================================================

export type AgentEndEvent = {
  messages: unknown[];
  success: boolean;
  error?: string;
  durationMs?: number;
};

export type AgentEndContext = {
  sessionKey?: string;
};

/**
 * 从对话消息中生成简短摘要。
 * 提取第一条 user 消息作为主题 + 最后一条 assistant 消息的第一行作为结果。
 */
export function generateSessionSummary(messages: unknown[]): string {
  let topic = "";
  let result = "";

  for (const msg of messages) {
    if (isUserMessage(msg) && !topic) {
      const text = extractMessageText(msg);
      if (text) {
        topic = text.slice(0, 100);
      }
    }
    if (isAssistantMessage(msg)) {
      const text = extractMessageText(msg);
      if (text) {
        const firstLine = text.split("\n")[0]!;
        result = firstLine.slice(0, 100);
      }
    }
  }

  if (!topic && !result) return "空对话";
  if (!topic) return result;
  if (!result) return `主题: ${topic}`;
  return `${topic} → ${result}`;
}

export function createSessionSummaryHandler(storePath?: string) {
  return async (event: AgentEndEvent, ctx: AgentEndContext): Promise<void> => {
    const sessionKey = ctx.sessionKey ?? "unknown";

    // 对话太短（< 2 条消息）不记录
    if (event.messages.length < 2) return;

    const summaryText = generateSessionSummary(event.messages);

    await withStoreLock(storePath, (store) => {
      const summary: SessionSummary = {
        sessionKey,
        timestamp: new Date().toISOString(),
        durationMs: event.durationMs,
        success: event.success,
        messageCount: event.messages.length,
        summary: summaryText,
      };

      store.summaries.push(summary);

      // 限制摘要数量
      if (store.summaries.length > MAX_SUMMARIES) {
        store.summaries = store.summaries.slice(-MAX_SUMMARIES);
      }
    });

    log.info(`记录对话摘要 (session: ${sessionKey}, msgs: ${event.messages.length})`);
  };
}

// ============================================================
// Message 解析辅助
// ============================================================

function isAssistantMessage(msg: unknown): boolean {
  if (typeof msg !== "object" || msg === null) return false;
  return (msg as Record<string, unknown>).role === "assistant";
}

function isUserMessage(msg: unknown): boolean {
  if (typeof msg !== "object" || msg === null) return false;
  return (msg as Record<string, unknown>).role === "user";
}

function extractMessageText(msg: unknown): string | undefined {
  if (typeof msg !== "object" || msg === null) return undefined;
  const obj = msg as Record<string, unknown>;

  // 简单 string content
  if (typeof obj.content === "string") return obj.content;

  // content array（anthropic 格式）
  if (Array.isArray(obj.content)) {
    const texts: string[] = [];
    for (const block of obj.content) {
      if (typeof block === "string") {
        texts.push(block);
      } else if (typeof block === "object" && block !== null) {
        const b = block as Record<string, unknown>;
        if (b.type === "text" && typeof b.text === "string") {
          texts.push(b.text);
        }
      }
    }
    return texts.length > 0 ? texts.join("\n") : undefined;
  }

  return undefined;
}
