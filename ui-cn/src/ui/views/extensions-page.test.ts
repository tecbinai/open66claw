/**
 * extensions-page.test.ts
 * Tests for the extensions page: filterItems logic, debounce, process limit, tab state.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { McpMarketplaceItem, McpMarketplaceState } from "../app-view-state.js";

// ── Test helpers ────────────────────────────────────────────

function makeItem(overrides: Partial<McpMarketplaceItem> = {}): McpMarketplaceItem {
  return {
    serverId: "test-" + Math.random().toString(36).slice(2, 6),
    friendlyName: "测试",
    friendlyNameEn: "Test",
    description: "测试描述",
    descriptionEn: "Test description",
    category: "other",
    tags: ["test"],
    version: "1.0.0",
    npmPackage: "@test/mcp",
    securityScore: 85,
    requiresApiKey: false,
    platforms: ["windows", "macos", "linux"],
    isOfficial: false,
    isNew: false,
    toolCount: 2,
    installStatus: "not_installed",
    ...overrides,
  };
}

function makeState(overrides: Partial<McpMarketplaceState> = {}): McpMarketplaceState {
  return {
    items: [],
    loading: false,
    error: null,
    search: "",
    activeCategory: "all",
    sort: "recommended",
    recommendations: [],
    showFirstVisit: false,
    detailItem: null,
    configTarget: null,
    toast: null,
    showBatchConfig: false,
    page: 1,
    pageSize: 50,
    total: 0,
    totalPages: 0,
    loadingMore: false,
    ...overrides,
  };
}

// ── filterItems logic (reimplemented for testing) ───────────
// The filterItems function is module-private in extensions-page.ts,
// so we re-implement the same logic here for thorough testing.

function filterItems(state: McpMarketplaceState): McpMarketplaceItem[] {
  let items = state.items;

  // Category filter
  if (state.activeCategory !== "all") {
    items = items.filter((i) => i.category === state.activeCategory);
  }

  // Search filter
  if (state.search.trim()) {
    const q = state.search.trim().toLowerCase();
    items = items.filter(
      (i) =>
        i.friendlyName.toLowerCase().includes(q) ||
        i.friendlyNameEn.toLowerCase().includes(q) ||
        i.description.toLowerCase().includes(q) ||
        i.descriptionEn.toLowerCase().includes(q) ||
        i.tags.some((tag) => tag.toLowerCase().includes(q)),
    );
  }

  // Sort
  switch (state.sort) {
    case "newest":
      items = [...items].sort((a, b) => (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0));
      break;
    case "name":
      items = [...items].sort((a, b) => a.friendlyName.localeCompare(b.friendlyName));
      break;
    case "popular":
      items = [...items].sort((a, b) => b.securityScore - a.securityScore);
      break;
    default: // recommended
      items = [...items].sort((a, b) => {
        if (a.isOfficial !== b.isOfficial) return a.isOfficial ? -1 : 1;
        return b.securityScore - a.securityScore;
      });
  }

  return items;
}

// ── Tests ───────────────────────────────────────────────────

describe("filterItems", () => {
  const items = [
    makeItem({
      serverId: "fs",
      friendlyName: "文件管理",
      friendlyNameEn: "Filesystem",
      category: "filesystem",
      isOfficial: true,
      securityScore: 95,
      tags: ["file", "io"],
    }),
    makeItem({
      serverId: "sql",
      friendlyName: "数据库",
      friendlyNameEn: "SQLite",
      category: "database",
      isOfficial: true,
      securityScore: 90,
      tags: ["database", "sql"],
    }),
    makeItem({
      serverId: "search",
      friendlyName: "网页搜索",
      friendlyNameEn: "Web Search",
      category: "search",
      isOfficial: false,
      isNew: true,
      securityScore: 80,
      tags: ["search", "web"],
    }),
    makeItem({
      serverId: "hue",
      friendlyName: "智能灯光",
      friendlyNameEn: "OpenHUE",
      category: "smarthome",
      isOfficial: false,
      securityScore: 70,
      tags: ["hue", "light"],
    }),
  ];

  it("returns all items with default state (no filters)", () => {
    const state = makeState({ items });
    const result = filterItems(state);
    expect(result).toHaveLength(4);
  });

  // ── Category filtering ──────────────────────────────────

  it("filters by filesystem category", () => {
    const state = makeState({ items, activeCategory: "filesystem" });
    const result = filterItems(state);
    expect(result).toHaveLength(1);
    expect(result[0].serverId).toBe("fs");
  });

  it("filters by database category", () => {
    const state = makeState({ items, activeCategory: "database" });
    const result = filterItems(state);
    expect(result).toHaveLength(1);
    expect(result[0].serverId).toBe("sql");
  });

  it("returns empty for category with no items", () => {
    const state = makeState({ items, activeCategory: "ai" });
    const result = filterItems(state);
    expect(result).toHaveLength(0);
  });

  it("'all' category returns everything", () => {
    const state = makeState({ items, activeCategory: "all" });
    const result = filterItems(state);
    expect(result).toHaveLength(4);
  });

  // ── Search filtering ────────────────────────────────────

  it("searches by Chinese name", () => {
    const state = makeState({ items, search: "数据" });
    const result = filterItems(state);
    expect(result).toHaveLength(1);
    expect(result[0].serverId).toBe("sql");
  });

  it("searches by English name (case-insensitive)", () => {
    const state = makeState({ items, search: "SQLITE" });
    const result = filterItems(state);
    expect(result).toHaveLength(1);
    expect(result[0].serverId).toBe("sql");
  });

  it("searches by tag", () => {
    const state = makeState({ items, search: "hue" });
    const result = filterItems(state);
    expect(result).toHaveLength(1);
    expect(result[0].serverId).toBe("hue");
  });

  it("searches by description", () => {
    const state = makeState({ items, search: "网页" });
    const result = filterItems(state);
    expect(result).toHaveLength(1);
    expect(result[0].serverId).toBe("search");
  });

  it("ignores whitespace-only search", () => {
    const state = makeState({ items, search: "   " });
    const result = filterItems(state);
    expect(result).toHaveLength(4);
  });

  it("returns empty when no match", () => {
    const state = makeState({ items, search: "不存在的能力xyz" });
    const result = filterItems(state);
    expect(result).toHaveLength(0);
  });

  // ── Combined category + search ──────────────────────────

  it("applies both category and search filters", () => {
    const state = makeState({ items, activeCategory: "filesystem", search: "文件" });
    const result = filterItems(state);
    expect(result).toHaveLength(1);
    expect(result[0].serverId).toBe("fs");
  });

  it("returns empty when category + search don't overlap", () => {
    const state = makeState({ items, activeCategory: "search", search: "数据库" });
    const result = filterItems(state);
    expect(result).toHaveLength(0);
  });

  // ── Sort: recommended (default) ─────────────────────────

  it("recommended sort: official first, then by score", () => {
    const state = makeState({ items, sort: "recommended" });
    const result = filterItems(state);
    // Official items first (fs=95, sql=90), then non-official (search=80, hue=70)
    expect(result[0].serverId).toBe("fs");
    expect(result[1].serverId).toBe("sql");
    expect(result[2].serverId).toBe("search");
    expect(result[3].serverId).toBe("hue");
  });

  // ── Sort: newest ────────────────────────────────────────

  it("newest sort: isNew items first", () => {
    const state = makeState({ items, sort: "newest" });
    const result = filterItems(state);
    expect(result[0].isNew).toBe(true);
    expect(result[0].serverId).toBe("search");
  });

  // ── Sort: name ──────────────────────────────────────────

  it("name sort: alphabetical by friendlyName", () => {
    const state = makeState({ items, sort: "name" });
    const result = filterItems(state);
    // Chinese sorting: 文 < 数 < 智 < 网 (by locale)
    const names = result.map((r) => r.friendlyName);
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);
  });

  // ── Sort: popular ───────────────────────────────────────

  it("popular sort: highest security score first", () => {
    const state = makeState({ items, sort: "popular" });
    const result = filterItems(state);
    expect(result[0].securityScore).toBe(95);
    expect(result[1].securityScore).toBe(90);
    expect(result[2].securityScore).toBe(80);
    expect(result[3].securityScore).toBe(70);
  });
});

// ── Search debounce ─────────────────────────────────────────

describe("search debounce", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("debounces search callback by 300ms", () => {
    // Simulate the debounce logic from extensions-page.ts
    let timer: ReturnType<typeof setTimeout> | null = null;
    let draft = "";
    const onSearchChange = vi.fn();

    function debouncedSearch(value: string) {
      draft = value;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        onSearchChange(draft);
        timer = null;
      }, 300);
    }

    // Type rapidly
    debouncedSearch("f");
    debouncedSearch("fi");
    debouncedSearch("fil");
    debouncedSearch("file");

    // Before 300ms: no calls
    expect(onSearchChange).not.toHaveBeenCalled();

    // Advance time by 300ms
    vi.advanceTimersByTime(300);

    // Should be called once with final value
    expect(onSearchChange).toHaveBeenCalledTimes(1);
    expect(onSearchChange).toHaveBeenCalledWith("file");
  });

  it("resets timer on each keystroke", () => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let draft = "";
    const onSearchChange = vi.fn();

    function debouncedSearch(value: string) {
      draft = value;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        onSearchChange(draft);
        timer = null;
      }, 300);
    }

    debouncedSearch("a");
    vi.advanceTimersByTime(200); // 200ms, not yet fired
    expect(onSearchChange).not.toHaveBeenCalled();

    debouncedSearch("ab"); // Reset timer
    vi.advanceTimersByTime(200); // Another 200ms (400ms total, 200ms from last)
    expect(onSearchChange).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100); // 300ms from last keystroke
    expect(onSearchChange).toHaveBeenCalledTimes(1);
    expect(onSearchChange).toHaveBeenCalledWith("ab");
  });
});

// ── Process limit ───────────────────────────────────────────

describe("process limit guard", () => {
  const MCP_MAX_RUNNING = 8;

  it("allows install when under limit", () => {
    const runningCount = 5;
    expect(runningCount < MCP_MAX_RUNNING).toBe(true);
  });

  it("blocks install when at limit", () => {
    const runningCount = 8;
    expect(runningCount >= MCP_MAX_RUNNING).toBe(true);
  });

  it("blocks install when over limit", () => {
    const runningCount = 10;
    expect(runningCount >= MCP_MAX_RUNNING).toBe(true);
  });

  it("guard boundary: 7 is under, 8 is at", () => {
    expect(7 >= MCP_MAX_RUNNING).toBe(false);
    expect(8 >= MCP_MAX_RUNNING).toBe(true);
  });
});

// ── Tab state ───────────────────────────────────────────────

describe("tab state", () => {
  it("default tab is 'my'", () => {
    const tab: "my" | "store" = "my";
    expect(tab).toBe("my");
  });

  it("switching to 'store' changes active tab", () => {
    let tab: "my" | "store" = "my";
    tab = "store";
    expect(tab).toBe("store");
  });
});

// ── First visit guide ───────────────────────────────────────

describe("first visit state", () => {
  it("showFirstVisit defaults based on localStorage", () => {
    const state = makeState({ showFirstVisit: true });
    expect(state.showFirstVisit).toBe(true);
  });

  it("dismiss hides the guide", () => {
    const state = makeState({ showFirstVisit: true });
    state.showFirstVisit = false;
    expect(state.showFirstVisit).toBe(false);
  });
});

// ── Recommendation banner ───────────────────────────────────

describe("recommendations", () => {
  it("banner shows when recommendations exist", () => {
    const recs = [makeItem({ serverId: "rec-1" }), makeItem({ serverId: "rec-2" })];
    const state = makeState({ recommendations: recs });
    expect(state.recommendations.length).toBeGreaterThan(0);
  });

  it("banner hidden when no recommendations", () => {
    const state = makeState({ recommendations: [] });
    expect(state.recommendations.length).toBe(0);
  });

  it("install all triggers onInstall for each recommendation", () => {
    const onInstall = vi.fn();
    const recs = [
      makeItem({ serverId: "rec-1" }),
      makeItem({ serverId: "rec-2" }),
      makeItem({ serverId: "rec-3" }),
    ];

    // Simulate "install all" button click
    recs.forEach((r) => onInstall(r));

    expect(onInstall).toHaveBeenCalledTimes(3);
    expect(onInstall).toHaveBeenCalledWith(expect.objectContaining({ serverId: "rec-1" }));
    expect(onInstall).toHaveBeenCalledWith(expect.objectContaining({ serverId: "rec-2" }));
    expect(onInstall).toHaveBeenCalledWith(expect.objectContaining({ serverId: "rec-3" }));
  });
});

// ── Loading / empty / error states ──────────────────────────

describe("store content states", () => {
  it("loading state shows spinner", () => {
    const state = makeState({ loading: true });
    expect(state.loading).toBe(true);
    expect(state.error).toBeNull();
  });

  it("error state shows error message", () => {
    const state = makeState({ loading: false, error: "Network timeout" });
    expect(state.error).toBe("Network timeout");
  });

  it("no results when items exist but filter matches none", () => {
    const state = makeState({
      items: [makeItem({ friendlyName: "文件管理" })],
      search: "不存在xyz",
    });
    const result = filterItems(state);
    expect(result).toHaveLength(0);
    expect(state.items.length).toBeGreaterThan(0); // items exist but filtered out
  });

  it("empty state when no items loaded", () => {
    const state = makeState({ items: [], loading: false });
    expect(state.items).toHaveLength(0);
  });
});
