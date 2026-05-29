import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { saveGeneratedVideo, loadChatVideos, resolveChatVideoPath } from "../chat-video-store.js";
import { openMediaDbMemory, closeMediaDb, queryBySession } from "../media-db.js";

let tmpDir: string;

beforeEach(async () => {
  openMediaDbMemory();
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "cn-video-test-"));
  vi.stubEnv("OPENCLAW_STATE_DIR", tmpDir);
});

afterEach(async () => {
  closeMediaDb();
  vi.unstubAllEnvs();
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
});

// Fake video data (just some bytes — not a real mp4)
const FAKE_VIDEO_BUF = Buffer.from("fakevideodatafakevideodatafakevideo");

describe("chat-video-store", () => {
  describe("saveGeneratedVideo", () => {
    it("saves a video to disk and SQLite", async () => {
      const entry = await saveGeneratedVideo({
        sessionKey: "vid-session",
        data: FAKE_VIDEO_BUF,
        mimeType: "video/mp4",
        meta: {
          prompt: "a sunset timelapse",
          model: "kling",
          provider: "zhipu",
          size: "1280x720",
          durationSeconds: 10,
          coverImageUrl: "https://example.com/cover.jpg",
        },
      });

      expect(entry).not.toBeNull();
      expect(entry!.id).toMatch(/^gen-/);
      expect(entry!.file).toMatch(/\.mp4$/);
      expect(entry!.mimeType).toBe("video/mp4");
      expect(entry!.sizeBytes).toBe(FAKE_VIDEO_BUF.length);
      expect(entry!.source).toBe("generated");
      expect(entry!.generationMeta.prompt).toBe("a sunset timelapse");
      expect(entry!.generationMeta.model).toBe("kling");
      expect(entry!.generationMeta.durationSeconds).toBe(10);

      // Verify file on disk
      const dir = path.join(tmpDir, "media", "chat-videos", "vid-session");
      const files = await fs.readdir(dir);
      expect(files.length).toBe(1);
      expect(files[0]).toMatch(/\.mp4$/);

      // Verify SQLite
      const rows = queryBySession("vid-session");
      expect(rows).toHaveLength(1);
      expect(rows[0].type).toBe("video");
      expect(rows[0].source).toBe("generated");
      expect(rows[0].model).toBe("kling");
      expect(rows[0].provider).toBe("zhipu");
      expect(rows[0].duration_secs).toBe(10);
      expect(rows[0].cover_url).toBe("https://example.com/cover.jpg");
    });

    it("truncates messageText (prompt) to 100 chars", async () => {
      const longPrompt = "B".repeat(200);
      const entry = await saveGeneratedVideo({
        sessionKey: "trunc-vid",
        data: FAKE_VIDEO_BUF,
        mimeType: "video/mp4",
        meta: {
          prompt: longPrompt,
          model: "kling",
          provider: "zhipu",
          size: "1080p",
        },
      });

      expect(entry!.messageText).toHaveLength(100);
    });

    it("sanitizes sessionKey for filesystem safety", async () => {
      const entry = await saveGeneratedVideo({
        sessionKey: "../../../tmp/evil",
        data: FAKE_VIDEO_BUF,
        mimeType: "video/mp4",
        meta: {
          prompt: "test",
          model: "test",
          provider: "test",
          size: "720p",
        },
      });

      expect(entry).not.toBeNull();
      const sanitized = ".._.._.._tmp_evil";
      const dir = path.join(tmpDir, "media", "chat-videos", sanitized);
      const exists = await fs
        .stat(dir)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);
    });
  });

  describe("loadChatVideos", () => {
    it("loads videos from SQLite", async () => {
      await saveGeneratedVideo({
        sessionKey: "load-vid",
        data: FAKE_VIDEO_BUF,
        mimeType: "video/mp4",
        meta: {
          prompt: "video 1",
          model: "kling",
          provider: "zhipu",
          size: "720p",
        },
      });
      await saveGeneratedVideo({
        sessionKey: "load-vid",
        data: Buffer.from("different-video-data"),
        mimeType: "video/mp4",
        meta: {
          prompt: "video 2",
          model: "stable-video",
          provider: "siliconflow",
          size: "1080p",
        },
      });

      const videos = loadChatVideos("load-vid");
      expect(videos).toHaveLength(2);
      expect(videos.every((v) => v.source === "generated")).toBe(true);
    });

    it("returns empty array for unknown session", () => {
      expect(loadChatVideos("nonexistent")).toEqual([]);
    });

    it("reconstructs generationMeta from SQLite row", async () => {
      await saveGeneratedVideo({
        sessionKey: "meta-test",
        data: FAKE_VIDEO_BUF,
        mimeType: "video/mp4",
        meta: {
          prompt: "ocean waves",
          model: "kling",
          provider: "zhipu",
          size: "1280x720",
          durationSeconds: 15,
          coverImageUrl: "https://example.com/thumb.jpg",
        },
      });

      const videos = loadChatVideos("meta-test");
      expect(videos).toHaveLength(1);
      const meta = videos[0].generationMeta;
      expect(meta.prompt).toBe("ocean waves");
      expect(meta.model).toBe("kling");
      expect(meta.provider).toBe("zhipu");
      expect(meta.size).toBe("1280x720");
      expect(meta.durationSeconds).toBe(15);
      expect(meta.coverImageUrl).toBe("https://example.com/thumb.jpg");
    });
  });

  describe("resolveChatVideoPath", () => {
    it("resolves path for existing video file", async () => {
      const entry = await saveGeneratedVideo({
        sessionKey: "resolve-vid",
        data: FAKE_VIDEO_BUF,
        mimeType: "video/mp4",
        meta: {
          prompt: "test",
          model: "test",
          provider: "test",
          size: "720p",
        },
      });

      const resolved = resolveChatVideoPath("resolve-vid", entry!.file);
      expect(resolved).not.toBeNull();
      expect(resolved).toContain("resolve-vid");
      expect(resolved).toMatch(/\.mp4$/);
    });

    it("returns null for non-existent file", () => {
      expect(resolveChatVideoPath("nope", "nope.mp4")).toBeNull();
    });

    it("sanitizes video filename", () => {
      // Path traversal attempt
      const resolved = resolveChatVideoPath("test", "../../etc/passwd");
      expect(resolved).toBeNull();
    });
  });

  describe("expiry metadata", () => {
    it("sets 365-day expiry for generated videos", async () => {
      await saveGeneratedVideo({
        sessionKey: "expiry-vid",
        data: FAKE_VIDEO_BUF,
        mimeType: "video/mp4",
        meta: {
          prompt: "test",
          model: "kling",
          provider: "zhipu",
          size: "720p",
        },
      });

      const rows = queryBySession("expiry-vid");
      expect(rows[0].expires_at).not.toBeNull();
      const expiresAt = new Date(rows[0].expires_at!).getTime();
      const expectedExpiry = Date.now() + 365 * 86400000;
      // Allow 5s tolerance
      expect(Math.abs(expiresAt - expectedExpiry)).toBeLessThan(5000);
    });
  });
});
