import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  openMediaDbMemory,
  closeMediaDb,
  insertMediaAsset,
  insertMediaAssets,
  queryBySession,
  queryById,
  queryByIds,
  deleteBySession,
  deleteExpired,
  countAll,
  capMediaRows,
  runMediaDbMaintenance,
} from "../media-db.js";
import type { MediaAssetRow } from "../types.js";

function makeRow(overrides: Partial<MediaAssetRow> = {}): MediaAssetRow {
  return {
    id: `test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    session_key: "sess-1",
    type: "image",
    file: "test.png",
    url: "/api/media/test.png",
    mime_type: "image/png",
    size_bytes: 1024,
    source: "upload",
    prompt: null,
    revised_prompt: null,
    model: null,
    provider: null,
    image_size: null,
    style: null,
    seed: null,
    duration_ms: null,
    duration_secs: null,
    cover_url: null,
    message_text: null,
    created_at: new Date().toISOString(),
    expires_at: null,
    ...overrides,
  };
}

describe("media-db", () => {
  beforeEach(() => {
    openMediaDbMemory();
  });

  afterEach(() => {
    closeMediaDb();
  });

  describe("schema creation", () => {
    it("creates cn_media_assets table and indexes", () => {
      // If we got here without errors, schema was created successfully
      expect(countAll()).toBe(0);
    });
  });

  describe("insertMediaAsset", () => {
    it("inserts a single row", () => {
      const row = makeRow({ id: "img-1" });
      insertMediaAsset(row);
      expect(countAll()).toBe(1);
    });

    it("INSERT OR IGNORE skips duplicate id", () => {
      const row = makeRow({ id: "img-dup" });
      insertMediaAsset(row);
      insertMediaAsset(row);
      expect(countAll()).toBe(1);
    });

    it("stores all fields correctly", () => {
      const row = makeRow({
        id: "gen-123-abc",
        session_key: "sess-full",
        type: "image",
        file: "gen-123.png",
        url: "/api/media/gen-123.png",
        mime_type: "image/png",
        size_bytes: 2048,
        source: "generated",
        prompt: "a cat in space",
        revised_prompt: "a cute cat floating in space",
        model: "dall-e-3",
        provider: "openai",
        image_size: "1024x1024",
        style: "vivid",
        seed: 42,
        duration_ms: 3500,
        duration_secs: null,
        cover_url: null,
        message_text: "draw a cat",
        created_at: "2026-03-01T00:00:00.000Z",
        expires_at: "2026-04-01T00:00:00.000Z",
      });
      insertMediaAsset(row);

      const result = queryById("gen-123-abc");
      expect(result).not.toBeNull();
      expect(result!.prompt).toBe("a cat in space");
      expect(result!.model).toBe("dall-e-3");
      expect(result!.seed).toBe(42);
      expect(result!.image_size).toBe("1024x1024");
    });
  });

  describe("insertMediaAssets (batch)", () => {
    it("inserts multiple rows in a transaction", () => {
      const rows = [
        makeRow({ id: "batch-1" }),
        makeRow({ id: "batch-2" }),
        makeRow({ id: "batch-3" }),
      ];
      insertMediaAssets(rows);
      expect(countAll()).toBe(3);
    });

    it("handles empty array gracefully", () => {
      insertMediaAssets([]);
      expect(countAll()).toBe(0);
    });
  });

  describe("queryBySession", () => {
    it("returns rows for a session ordered by created_at DESC", () => {
      insertMediaAsset(
        makeRow({
          id: "s1-old",
          session_key: "sess-A",
          created_at: "2026-01-01T00:00:00.000Z",
        }),
      );
      insertMediaAsset(
        makeRow({
          id: "s1-new",
          session_key: "sess-A",
          created_at: "2026-03-01T00:00:00.000Z",
        }),
      );
      insertMediaAsset(
        makeRow({
          id: "s2-x",
          session_key: "sess-B",
          created_at: "2026-02-01T00:00:00.000Z",
        }),
      );

      const results = queryBySession("sess-A");
      expect(results).toHaveLength(2);
      expect(results[0].id).toBe("s1-new");
      expect(results[1].id).toBe("s1-old");
    });

    it("returns empty array for unknown session", () => {
      expect(queryBySession("nonexistent")).toEqual([]);
    });
  });

  describe("queryById", () => {
    it("returns the row if found", () => {
      insertMediaAsset(makeRow({ id: "find-me" }));
      expect(queryById("find-me")).not.toBeNull();
    });

    it("returns null if not found", () => {
      expect(queryById("nope")).toBeNull();
    });
  });

  describe("queryByIds", () => {
    it("returns matching rows in created_at DESC order", () => {
      insertMediaAsset(
        makeRow({
          id: "multi-1",
          created_at: "2026-01-01T00:00:00.000Z",
        }),
      );
      insertMediaAsset(
        makeRow({
          id: "multi-2",
          created_at: "2026-02-01T00:00:00.000Z",
        }),
      );
      insertMediaAsset(makeRow({ id: "multi-3" }));

      const results = queryByIds(["multi-1", "multi-2"]);
      expect(results).toHaveLength(2);
      // DESC order: multi-2 first
      expect(results[0].id).toBe("multi-2");
    });

    it("returns empty array for empty ids", () => {
      expect(queryByIds([])).toEqual([]);
    });
  });

  describe("deleteBySession", () => {
    it("deletes all rows for a session", () => {
      insertMediaAsset(makeRow({ id: "del-1", session_key: "del-sess" }));
      insertMediaAsset(makeRow({ id: "del-2", session_key: "del-sess" }));
      insertMediaAsset(makeRow({ id: "keep", session_key: "keep-sess" }));

      const deleted = deleteBySession("del-sess");
      expect(deleted).toBe(2);
      expect(countAll()).toBe(1);
    });
  });

  describe("deleteExpired", () => {
    it("deletes rows whose expires_at is in the past", () => {
      insertMediaAsset(
        makeRow({
          id: "expired",
          expires_at: "2020-01-01T00:00:00.000Z",
        }),
      );
      insertMediaAsset(
        makeRow({
          id: "future",
          expires_at: "2099-01-01T00:00:00.000Z",
        }),
      );
      insertMediaAsset(
        makeRow({
          id: "no-expiry",
          expires_at: null,
        }),
      );

      const deleted = deleteExpired();
      expect(deleted).toBe(1);
      expect(countAll()).toBe(2);
      expect(queryById("expired")).toBeNull();
      expect(queryById("future")).not.toBeNull();
      expect(queryById("no-expiry")).not.toBeNull();
    });
  });

  describe("capMediaRows", () => {
    it("deletes oldest rows when exceeding cap", () => {
      for (let i = 0; i < 5; i++) {
        insertMediaAsset(
          makeRow({
            id: `cap-${i}`,
            created_at: `2026-01-0${i + 1}T00:00:00.000Z`,
          }),
        );
      }
      expect(countAll()).toBe(5);

      const deleted = capMediaRows(3);
      expect(deleted).toBe(2);
      expect(countAll()).toBe(3);
      // Oldest two (cap-0, cap-1) should be deleted
      expect(queryById("cap-0")).toBeNull();
      expect(queryById("cap-1")).toBeNull();
      expect(queryById("cap-2")).not.toBeNull();
    });

    it("does nothing when under cap", () => {
      insertMediaAsset(makeRow({ id: "under-cap" }));
      const deleted = capMediaRows(100);
      expect(deleted).toBe(0);
    });
  });

  describe("runMediaDbMaintenance", () => {
    it("runs expired cleanup and cap enforcement", () => {
      insertMediaAsset(
        makeRow({
          id: "maint-expired",
          expires_at: "2020-01-01T00:00:00.000Z",
        }),
      );
      insertMediaAsset(
        makeRow({
          id: "maint-keep",
          expires_at: "2099-01-01T00:00:00.000Z",
        }),
      );

      const result = runMediaDbMaintenance();
      expect(result.expired).toBe(1);
      expect(result.capped).toBe(0);
      expect(countAll()).toBe(1);
    });
  });
});
