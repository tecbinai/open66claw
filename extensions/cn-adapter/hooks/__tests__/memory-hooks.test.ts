import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { CnPluginConfig } from "../cn-config.js";
import {
  createProfileInjectHandler,
  createCompactionArchiveHandler,
  createSessionSummaryHandler,
  loadMemoryStore,
  saveMemoryStore,
  buildProfileContext,
  extractKeyFacts,
  generateSessionSummary,
  getMemoryStorePath,
  type MemoryStore,
  type CnProfile,
} from "../memory-hooks.js";

// ============================================================
// 测试用临时文件
// ============================================================

function createTempStorePath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cn-memory-test-"));
  return path.join(dir, "cn-memory.json");
}

function cleanupTempStore(storePath: string): void {
  const dir = path.dirname(storePath);
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

// ============================================================
// Storage 测试
// ============================================================

describe("MemoryStore", () => {
  let storePath: string;

  beforeEach(() => {
    storePath = createTempStorePath();
  });

  afterEach(() => {
    cleanupTempStore(storePath);
  });

  it("returns empty store when file does not exist", () => {
    const store = loadMemoryStore(storePath);
    expect(store.version).toBe(1);
    expect(store.profile).toEqual({});
    expect(store.summaries).toEqual([]);
    expect(store.archives).toEqual([]);
  });

  it("saves and loads store correctly", () => {
    const store: MemoryStore = {
      version: 1,
      profile: { nickname: "测试用户", techStack: ["TypeScript", "React"] },
      summaries: [],
      archives: [],
    };
    saveMemoryStore(store, storePath);
    const loaded = loadMemoryStore(storePath);
    expect(loaded.profile.nickname).toBe("测试用户");
    expect(loaded.profile.techStack).toEqual(["TypeScript", "React"]);
  });

  it("returns empty store for corrupted JSON", () => {
    fs.mkdirSync(path.dirname(storePath), { recursive: true });
    fs.writeFileSync(storePath, "not json{{{", "utf-8");
    const store = loadMemoryStore(storePath);
    expect(store.version).toBe(1);
    expect(store.profile).toEqual({});
  });

  it("handles missing fields gracefully", () => {
    fs.mkdirSync(path.dirname(storePath), { recursive: true });
    fs.writeFileSync(storePath, JSON.stringify({ version: 1 }), "utf-8");
    const store = loadMemoryStore(storePath);
    expect(store.summaries).toEqual([]);
    expect(store.archives).toEqual([]);
  });

  it("getMemoryStorePath returns expected path", () => {
    const p = getMemoryStorePath();
    expect(p).toContain("cn-memory.json");
    expect(p).toContain(".openclaw");
  });
});

// ============================================================
// buildProfileContext 测试
// ============================================================

describe("buildProfileContext", () => {
  it("returns undefined for empty profile and no summaries", () => {
    const store: MemoryStore = {
      version: 1,
      profile: {},
      summaries: [],
      archives: [],
    };
    expect(buildProfileContext(store)).toBeUndefined();
  });

  it("includes nickname", () => {
    const store: MemoryStore = {
      version: 1,
      profile: { nickname: "小明" },
      summaries: [],
      archives: [],
    };
    const ctx = buildProfileContext(store)!;
    expect(ctx).toContain("小明");
    expect(ctx).toContain("用户昵称");
  });

  it("includes tech stack", () => {
    const store: MemoryStore = {
      version: 1,
      profile: { techStack: ["Vue", "Python"] },
      summaries: [],
      archives: [],
    };
    const ctx = buildProfileContext(store)!;
    expect(ctx).toContain("Vue");
    expect(ctx).toContain("Python");
  });

  it("includes preferences", () => {
    const store: MemoryStore = {
      version: 1,
      profile: { preferences: ["暗色主题", "Vim 模式"] },
      summaries: [],
      archives: [],
    };
    const ctx = buildProfileContext(store)!;
    expect(ctx).toContain("暗色主题");
  });

  it("includes project context", () => {
    const store: MemoryStore = {
      version: 1,
      profile: { projectContext: "电商后台管理系统" },
      summaries: [],
      archives: [],
    };
    const ctx = buildProfileContext(store)!;
    expect(ctx).toContain("电商后台管理系统");
  });

  it("includes custom prompt as-is", () => {
    const store: MemoryStore = {
      version: 1,
      profile: { customPrompt: "我喜欢简洁的代码风格" },
      summaries: [],
      archives: [],
    };
    const ctx = buildProfileContext(store)!;
    expect(ctx).toContain("我喜欢简洁的代码风格");
  });

  it("includes last 3 summaries", () => {
    const store: MemoryStore = {
      version: 1,
      profile: { nickname: "test" },
      summaries: [
        { sessionKey: "s1", timestamp: "t1", success: true, messageCount: 5, summary: "摘要1" },
        { sessionKey: "s2", timestamp: "t2", success: true, messageCount: 3, summary: "摘要2" },
        { sessionKey: "s3", timestamp: "t3", success: true, messageCount: 8, summary: "摘要3" },
        { sessionKey: "s4", timestamp: "t4", success: false, messageCount: 2, summary: "摘要4" },
      ],
      archives: [],
    };
    const ctx = buildProfileContext(store)!;
    expect(ctx).toContain("摘要2");
    expect(ctx).toContain("摘要3");
    expect(ctx).toContain("摘要4");
    expect(ctx).not.toContain("摘要1"); // 只保留最近 3 条
  });
});

// ============================================================
// extractKeyFacts 测试
// ============================================================

describe("extractKeyFacts", () => {
  it("extracts decision facts from assistant messages", () => {
    const messages = [
      { role: "user", content: "用哪个框架？" },
      { role: "assistant", content: "决定: 使用 React 作为前端框架" },
    ];
    const facts = extractKeyFacts(messages);
    expect(facts).toContain("使用 React 作为前端框架");
  });

  it("extracts conclusion facts", () => {
    const messages = [{ role: "assistant", content: "结论：采用微服务架构" }];
    const facts = extractKeyFacts(messages);
    expect(facts).toContain("采用微服务架构");
  });

  it("extracts choice facts", () => {
    const messages = [{ role: "assistant", content: "选择了 B 方案" }];
    const facts = extractKeyFacts(messages);
    expect(facts.length).toBe(1);
    expect(facts[0]).toContain("方案");
  });

  it("ignores user messages", () => {
    const messages = [{ role: "user", content: "决定: 用 Vue" }];
    const facts = extractKeyFacts(messages);
    expect(facts).toEqual([]);
  });

  it("deduplicates facts", () => {
    const messages = [{ role: "assistant", content: "决定: 用 React\n决定: 用 React" }];
    const facts = extractKeyFacts(messages);
    expect(facts.length).toBe(1);
  });

  it("limits to 10 facts", () => {
    const messages = Array.from({ length: 20 }, (_, i) => ({
      role: "assistant" as const,
      content: `决定: 事实 ${i}`,
    }));
    const facts = extractKeyFacts(messages);
    expect(facts.length).toBeLessThanOrEqual(10);
  });

  it("handles content array format", () => {
    const messages = [
      {
        role: "assistant",
        content: [{ type: "text", text: "决定: 使用 PostgreSQL" }],
      },
    ];
    const facts = extractKeyFacts(messages);
    expect(facts).toContain("使用 PostgreSQL");
  });

  it("returns empty for non-object messages", () => {
    const facts = extractKeyFacts([null, undefined, "string", 42]);
    expect(facts).toEqual([]);
  });
});

// ============================================================
// generateSessionSummary 测试
// ============================================================

describe("generateSessionSummary", () => {
  it("generates topic → result summary", () => {
    const messages = [
      { role: "user", content: "帮我写个排序函数" },
      { role: "assistant", content: "好的，这是冒泡排序的实现" },
    ];
    const summary = generateSessionSummary(messages);
    expect(summary).toContain("帮我写个排序函数");
    expect(summary).toContain("冒泡排序");
  });

  it("returns empty session for no messages", () => {
    expect(generateSessionSummary([])).toBe("空对话");
  });

  it("handles only user messages", () => {
    const messages = [{ role: "user", content: "你好" }];
    const summary = generateSessionSummary(messages);
    expect(summary).toContain("你好");
  });

  it("handles only assistant messages", () => {
    const messages = [{ role: "assistant", content: "有什么可以帮助你的？" }];
    const summary = generateSessionSummary(messages);
    expect(summary).toContain("有什么可以帮助你的");
  });

  it("truncates long text", () => {
    const longText = "a".repeat(200);
    const messages = [{ role: "user", content: longText }];
    const summary = generateSessionSummary(messages);
    expect(summary.length).toBeLessThan(210);
  });
});

// ============================================================
// createProfileInjectHandler 测试
// ============================================================

describe("createProfileInjectHandler", () => {
  let storePath: string;

  beforeEach(() => {
    storePath = createTempStorePath();
  });

  afterEach(() => {
    cleanupTempStore(storePath);
  });

  it("injects profile context for zh-CN locale", async () => {
    const store: MemoryStore = {
      version: 1,
      profile: { nickname: "开发者", techStack: ["Node.js"] },
      summaries: [],
      archives: [],
    };
    saveMemoryStore(store, storePath);

    const handler = createProfileInjectHandler(() => ({ locale: "zh-CN" }), storePath);
    const result = await handler({ prompt: "hello", messages: [] });
    expect(result.appendSystemContext).toContain("开发者");
    expect(result.appendSystemContext).toContain("Node.js");
  });

  it("returns empty for non-Chinese locale", async () => {
    const handler = createProfileInjectHandler(() => ({ locale: "en" }), storePath);
    const result = await handler({ prompt: "hello", messages: [] });
    expect(result.appendSystemContext).toBeUndefined();
  });

  it("returns empty when no profile data", async () => {
    const handler = createProfileInjectHandler(() => ({ locale: "zh-CN" }), storePath);
    const result = await handler({ prompt: "hello", messages: [] });
    expect(result.appendSystemContext).toBeUndefined();
  });

  it("works with zh-TW locale", async () => {
    const store: MemoryStore = {
      version: 1,
      profile: { nickname: "用戶" },
      summaries: [],
      archives: [],
    };
    saveMemoryStore(store, storePath);

    const handler = createProfileInjectHandler(() => ({ locale: "zh-TW" }), storePath);
    const result = await handler({ prompt: "hello", messages: [] });
    expect(result.appendSystemContext).toContain("用戶");
  });
});

// ============================================================
// createCompactionArchiveHandler 测试
// ============================================================

describe("createCompactionArchiveHandler", () => {
  let storePath: string;

  beforeEach(() => {
    storePath = createTempStorePath();
  });

  afterEach(() => {
    cleanupTempStore(storePath);
  });

  it("archives compaction event with key facts", async () => {
    const handler = createCompactionArchiveHandler(storePath);
    await handler(
      {
        messageCount: 20,
        compactingCount: 15,
        tokenCount: 5000,
        messages: [{ role: "assistant", content: "决定: 使用 Redis 缓存" }],
      },
      { sessionKey: "test-session" },
    );

    const store = loadMemoryStore(storePath);
    expect(store.archives.length).toBe(1);
    expect(store.archives[0]!.sessionKey).toBe("test-session");
    expect(store.archives[0]!.messageCount).toBe(20);
    expect(store.archives[0]!.keyFacts).toContain("使用 Redis 缓存");
  });

  it("handles missing messages gracefully", async () => {
    const handler = createCompactionArchiveHandler(storePath);
    await handler({ messageCount: 10 }, { sessionKey: "s1" });

    const store = loadMemoryStore(storePath);
    expect(store.archives.length).toBe(1);
    expect(store.archives[0]!.keyFacts).toEqual([]);
  });

  it("limits archives to MAX_ARCHIVES", async () => {
    // 预填充 100 条
    const preStore: MemoryStore = {
      version: 1,
      profile: {},
      summaries: [],
      archives: Array.from({ length: 100 }, (_, i) => ({
        sessionKey: `s${i}`,
        timestamp: new Date().toISOString(),
        messageCount: 10,
        keyFacts: [],
      })),
    };
    saveMemoryStore(preStore, storePath);

    const handler = createCompactionArchiveHandler(storePath);
    await handler({ messageCount: 5 }, { sessionKey: "new" });

    const store = loadMemoryStore(storePath);
    expect(store.archives.length).toBe(100);
    expect(store.archives[store.archives.length - 1]!.sessionKey).toBe("new");
  });

  it("uses 'unknown' for missing sessionKey", async () => {
    const handler = createCompactionArchiveHandler(storePath);
    await handler({ messageCount: 5 }, {});

    const store = loadMemoryStore(storePath);
    expect(store.archives[0]!.sessionKey).toBe("unknown");
  });
});

// ============================================================
// createSessionSummaryHandler 测试
// ============================================================

describe("createSessionSummaryHandler", () => {
  let storePath: string;

  beforeEach(() => {
    storePath = createTempStorePath();
  });

  afterEach(() => {
    cleanupTempStore(storePath);
  });

  it("saves session summary on agent end", async () => {
    const handler = createSessionSummaryHandler(storePath);
    await handler(
      {
        messages: [
          { role: "user", content: "帮我调试这个 bug" },
          { role: "assistant", content: "问题出在第 42 行" },
        ],
        success: true,
        durationMs: 3000,
      },
      { sessionKey: "debug-session" },
    );

    const store = loadMemoryStore(storePath);
    expect(store.summaries.length).toBe(1);
    expect(store.summaries[0]!.sessionKey).toBe("debug-session");
    expect(store.summaries[0]!.success).toBe(true);
    expect(store.summaries[0]!.durationMs).toBe(3000);
    expect(store.summaries[0]!.summary).toContain("帮我调试这个 bug");
  });

  it("skips sessions with less than 2 messages", async () => {
    const handler = createSessionSummaryHandler(storePath);
    await handler(
      { messages: [{ role: "user", content: "hi" }], success: true },
      { sessionKey: "short" },
    );

    const store = loadMemoryStore(storePath);
    expect(store.summaries.length).toBe(0);
  });

  it("limits summaries to MAX_SUMMARIES", async () => {
    const preStore: MemoryStore = {
      version: 1,
      profile: {},
      summaries: Array.from({ length: 50 }, (_, i) => ({
        sessionKey: `s${i}`,
        timestamp: new Date().toISOString(),
        success: true,
        messageCount: 5,
        summary: `摘要 ${i}`,
      })),
      archives: [],
    };
    saveMemoryStore(preStore, storePath);

    const handler = createSessionSummaryHandler(storePath);
    await handler(
      {
        messages: [
          { role: "user", content: "新对话" },
          { role: "assistant", content: "回复" },
        ],
        success: true,
      },
      { sessionKey: "new" },
    );

    const store = loadMemoryStore(storePath);
    expect(store.summaries.length).toBe(50);
    expect(store.summaries[store.summaries.length - 1]!.sessionKey).toBe("new");
  });

  it("records failed sessions", async () => {
    const handler = createSessionSummaryHandler(storePath);
    await handler(
      {
        messages: [
          { role: "user", content: "做点什么" },
          { role: "assistant", content: "出错了" },
        ],
        success: false,
        error: "timeout",
      },
      { sessionKey: "fail" },
    );

    const store = loadMemoryStore(storePath);
    expect(store.summaries[0]!.success).toBe(false);
  });
});
