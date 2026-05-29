/**
 * mcp-lifecycle.marketplace.test.ts
 * Tests for marketplace controller: loadItems, loadRecommendations,
 * installItem (optimistic UI), loadDetail.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import type { McpMarketplaceItem, McpMarketplaceState } from "../app-view-state.js";
import {
  loadMarketplaceItems,
  loadMarketplaceRecommendations,
  installMarketplaceItem,
  loadMarketplaceDetail,
  type GatewayClient,
  type MarketplaceCallbacks,
} from "./mcp-lifecycle.js";

// ── Helpers ─────────────────────────────────────────────────

function makeClient(responses: Record<string, unknown> = {}): GatewayClient {
  return {
    request: vi.fn(async (method: string) => {
      if (method in responses) return responses[method];
      throw new Error(`Unknown RPC: ${method}`);
    }),
  };
}

function makeFailingClient(method: string, error: Error): GatewayClient {
  return {
    request: vi.fn(async (m: string) => {
      if (m === method) throw error;
      return {};
    }),
  };
}

function makeItem(overrides: Partial<McpMarketplaceItem> = {}): McpMarketplaceItem {
  return {
    serverId: "test-srv",
    friendlyName: "测试",
    friendlyNameEn: "Test",
    description: "desc",
    descriptionEn: "desc",
    category: "other",
    tags: [],
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

function makeCallbacks(): MarketplaceCallbacks & { patches: Array<Partial<McpMarketplaceState>> } {
  const patches: Array<Partial<McpMarketplaceState>> = [];
  return {
    patches,
    onStateChange: vi.fn((patch: Partial<McpMarketplaceState>) => {
      patches.push(patch);
    }),
  };
}

// ── loadMarketplaceItems ────────────────────────────────────

describe("loadMarketplaceItems", () => {
  it("sets loading=true then populates items on success", async () => {
    const serverItems = [makeItem({ serverId: "s1" }), makeItem({ serverId: "s2" })];
    const client = makeClient({ "mcp.marketplace.list": { items: serverItems } });
    const cb = makeCallbacks();

    await loadMarketplaceItems(client, cb);

    // First call: loading=true
    expect(cb.onStateChange).toHaveBeenCalledWith(
      expect.objectContaining({ loading: true, error: null }),
    );
    // Second call: items populated, loading=false
    expect(cb.patches[1]).toEqual(
      expect.objectContaining({
        items: serverItems,
        loading: false,
        error: null,
      }),
    );
  });

  it("returns empty items when RPC returns empty response", async () => {
    const client = makeClient({ "mcp.marketplace.list": {} });
    const cb = makeCallbacks();

    await loadMarketplaceItems(client, cb);

    const lastPatch = cb.patches[cb.patches.length - 1];
    expect(lastPatch.items).toEqual([]);
    expect(lastPatch.loading).toBe(false);
  });

  it("handles null client gracefully", async () => {
    const cb = makeCallbacks();
    await loadMarketplaceItems(null, cb);

    expect(cb.onStateChange).toHaveBeenCalledWith(
      expect.objectContaining({ loading: false, error: "No gateway connection" }),
    );
  });

  it("handles RPC failure silently", async () => {
    const client = makeFailingClient("mcp.marketplace.list", new Error("timeout"));
    const cb = makeCallbacks();

    await loadMarketplaceItems(client, cb);

    const lastPatch = cb.patches[cb.patches.length - 1];
    expect(lastPatch.items).toEqual([]);
    expect(lastPatch.loading).toBe(false);
  });
});

// ── loadMarketplaceRecommendations ──────────────────────────

describe("loadMarketplaceRecommendations", () => {
  it("populates recommendations on success", async () => {
    const recs = [makeItem({ serverId: "rec-1" })];
    const client = makeClient({ "mcp.marketplace.recommend": { items: recs } });
    const cb = makeCallbacks();

    await loadMarketplaceRecommendations(client, cb);

    expect(cb.onStateChange).toHaveBeenCalledWith(
      expect.objectContaining({ recommendations: recs }),
    );
  });

  it("does nothing with null client", async () => {
    const cb = makeCallbacks();
    await loadMarketplaceRecommendations(null, cb);

    expect(cb.onStateChange).not.toHaveBeenCalled();
  });

  it("silently ignores RPC failure", async () => {
    const client = makeFailingClient("mcp.marketplace.recommend", new Error("fail"));
    const cb = makeCallbacks();

    await loadMarketplaceRecommendations(client, cb);

    // No error thrown, no state change
    expect(cb.onStateChange).not.toHaveBeenCalled();
  });
});

// ── installMarketplaceItem ──────────────────────────────────

describe("installMarketplaceItem", () => {
  const item = makeItem({ serverId: "fs", installStatus: "not_installed" });
  const currentItems = [item, makeItem({ serverId: "other" })];

  it("optimistically sets installStatus to 'installing'", async () => {
    const client = makeClient({ "mcp.marketplace.install": { ok: true } });
    const cb = makeCallbacks();

    await installMarketplaceItem(client, item, undefined, {
      ...cb,
      currentItems,
    });

    // First patch: optimistic "installing"
    const firstPatch = cb.patches[0];
    expect(firstPatch.items).toBeDefined();
    const fsItem = firstPatch.items!.find((i) => i.serverId === "fs");
    expect(fsItem?.installStatus).toBe("installing");
  });

  it("sets installStatus to 'installed' on success", async () => {
    const client = makeClient({ "mcp.marketplace.install": { ok: true } });
    const cb = makeCallbacks();

    await installMarketplaceItem(client, item, undefined, {
      ...cb,
      currentItems,
    });

    // Last patch: success "installed"
    const lastPatch = cb.patches[cb.patches.length - 1];
    const fsItem = lastPatch.items!.find((i) => i.serverId === "fs");
    expect(fsItem?.installStatus).toBe("installed");
  });

  it("rolls back to 'error' on RPC failure", async () => {
    const client = makeFailingClient("mcp.marketplace.install", new Error("npm failed"));
    const cb = makeCallbacks();

    await installMarketplaceItem(client, item, undefined, {
      ...cb,
      currentItems,
    });

    // Last patch: error rollback
    const lastPatch = cb.patches[cb.patches.length - 1];
    const fsItem = lastPatch.items!.find((i) => i.serverId === "fs");
    expect(fsItem?.installStatus).toBe("error");
  });

  it("does not modify other items during optimistic update", async () => {
    const client = makeClient({ "mcp.marketplace.install": { ok: true } });
    const cb = makeCallbacks();

    await installMarketplaceItem(client, item, undefined, {
      ...cb,
      currentItems,
    });

    // Other item should remain unchanged
    const firstPatch = cb.patches[0];
    const otherItem = firstPatch.items!.find((i) => i.serverId === "other");
    expect(otherItem?.installStatus).toBe("not_installed");
  });

  it("passes env vars to RPC", async () => {
    const client = makeClient({ "mcp.marketplace.install": { ok: true } });
    const cb = makeCallbacks();

    await installMarketplaceItem(
      client,
      makeItem({ serverId: "brave", requiresApiKey: true }),
      { BRAVE_API_KEY: "key123" },
      { ...cb, currentItems: [makeItem({ serverId: "brave" })] },
    );

    expect(client.request).toHaveBeenCalledWith(
      "mcp.marketplace.install",
      expect.objectContaining({
        serverId: "brave",
        env: { BRAVE_API_KEY: "key123" },
      }),
    );
  });

  it("does nothing with null client", async () => {
    const cb = makeCallbacks();

    await installMarketplaceItem(null, item, undefined, {
      ...cb,
      currentItems,
    });

    expect(cb.onStateChange).not.toHaveBeenCalled();
  });
});

// ── loadMarketplaceDetail ───────────────────────────────────

describe("loadMarketplaceDetail", () => {
  it("sets detailItem on success", async () => {
    const detailItem = makeItem({
      serverId: "fs",
      capabilities: ["Read files", "Write files"],
      examplePrompts: ["读一下 README.md"],
      toolNames: ["read_file", "write_file"],
    });
    const client = makeClient({ "mcp.marketplace.detail": detailItem });
    const cb = makeCallbacks();

    await loadMarketplaceDetail(client, "fs", cb);

    expect(cb.onStateChange).toHaveBeenCalledWith(expect.objectContaining({ detailItem }));
  });

  it("does nothing with null client", async () => {
    const cb = makeCallbacks();
    await loadMarketplaceDetail(null, "fs", cb);

    expect(cb.onStateChange).not.toHaveBeenCalled();
  });

  it("logs error on RPC failure", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const client = makeFailingClient("mcp.marketplace.detail", new Error("not found"));
    const cb = makeCallbacks();

    await loadMarketplaceDetail(client, "nonexistent", cb);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("[mcp-lifecycle]"),
      "nonexistent",
      expect.any(Error),
    );
    consoleSpy.mockRestore();
  });
});
