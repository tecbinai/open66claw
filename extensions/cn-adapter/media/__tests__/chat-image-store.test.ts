import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  saveChatImage,
  saveGeneratedImage,
  loadChatImages,
  loadChatImageData,
  resolveChatImagePath,
} from "../chat-image-store.js";
import { openMediaDbMemory, closeMediaDb, queryBySession, countAll } from "../media-db.js";

let tmpDir: string;

beforeEach(async () => {
  openMediaDbMemory();
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "cn-image-test-"));
  // Point media storage to temp directory
  vi.stubEnv("OPENCLAW_STATE_DIR", tmpDir);
});

afterEach(async () => {
  closeMediaDb();
  vi.unstubAllEnvs();
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
});

// Simple 1x1 red PNG as base64
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";

describe("chat-image-store", () => {
  describe("saveChatImage", () => {
    it("saves an uploaded image to disk and SQLite", async () => {
      const entry = await saveChatImage({
        sessionKey: "test-session",
        base64: TINY_PNG_BASE64,
        mimeType: "image/png",
        timestamp: 1700000000000,
        messageText: "Check this image",
      });

      expect(entry).not.toBeNull();
      expect(entry!.id).toMatch(/^1700000000000-/);
      expect(entry!.file).toMatch(/\.png$/);
      expect(entry!.mimeType).toBe("image/png");
      expect(entry!.sizeBytes).toBeGreaterThan(0);
      expect(entry!.messageText).toBe("Check this image");
      expect(entry!.source).toBe("upload");

      // Verify file on disk
      const dir = path.join(tmpDir, "media", "chat-images", "test-session");
      const files = await fs.readdir(dir);
      expect(files.length).toBe(1);
      expect(files[0]).toMatch(/\.png$/);

      // Verify SQLite row
      const rows = queryBySession("test-session");
      expect(rows).toHaveLength(1);
      expect(rows[0].type).toBe("image");
      expect(rows[0].source).toBe("upload");
    });

    it("truncates messageText to 100 chars", async () => {
      const longText = "A".repeat(200);
      const entry = await saveChatImage({
        sessionKey: "trunc-test",
        base64: TINY_PNG_BASE64,
        mimeType: "image/png",
        timestamp: Date.now(),
        messageText: longText,
      });

      expect(entry!.messageText).toHaveLength(100);
    });

    it("sanitizes sessionKey for filesystem safety", async () => {
      const entry = await saveChatImage({
        sessionKey: "../../etc/passwd",
        base64: TINY_PNG_BASE64,
        mimeType: "image/png",
        timestamp: Date.now(),
      });

      expect(entry).not.toBeNull();
      // Verify the directory uses sanitized name
      const sanitized = ".._.._etc_passwd";
      const dir = path.join(tmpDir, "media", "chat-images", sanitized);
      const exists = await fs
        .stat(dir)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);
    });
  });

  describe("saveGeneratedImage", () => {
    it("saves an AI-generated image with metadata", async () => {
      const entry = await saveGeneratedImage({
        sessionKey: "gen-session",
        data: Buffer.from(TINY_PNG_BASE64, "base64"),
        mimeType: "image/png",
        meta: {
          prompt: "a cat in space",
          model: "dall-e-3",
          provider: "openai",
          size: "1024x1024",
          style: "vivid",
          seed: 42,
        },
      });

      expect(entry).not.toBeNull();
      expect(entry!.id).toMatch(/^gen-/);
      expect(entry!.source).toBe("generated");
      expect(entry!.generationMeta).toBeDefined();
      expect(entry!.generationMeta!.prompt).toBe("a cat in space");
      expect(entry!.generationMeta!.model).toBe("dall-e-3");
      expect(entry!.generationMeta!.seed).toBe(42);

      // Verify SQLite row
      const rows = queryBySession("gen-session");
      expect(rows).toHaveLength(1);
      expect(rows[0].source).toBe("generated");
      expect(rows[0].model).toBe("dall-e-3");
      expect(rows[0].prompt).toBe("a cat in space");
    });

    it("accepts base64 string as data", async () => {
      const entry = await saveGeneratedImage({
        sessionKey: "b64-test",
        data: TINY_PNG_BASE64,
        mimeType: "image/png",
        meta: {
          prompt: "test",
          model: "flux",
          provider: "siliconflow",
          size: "512x512",
        },
      });

      expect(entry).not.toBeNull();
      expect(entry!.sizeBytes).toBeGreaterThan(0);
    });
  });

  describe("loadChatImages", () => {
    it("loads images from SQLite", async () => {
      await saveChatImage({
        sessionKey: "load-test",
        base64: TINY_PNG_BASE64,
        mimeType: "image/png",
        timestamp: 1000,
      });
      await saveGeneratedImage({
        sessionKey: "load-test",
        data: TINY_PNG_BASE64,
        mimeType: "image/webp",
        meta: {
          prompt: "test gen",
          model: "dall-e-3",
          provider: "openai",
          size: "1024x1024",
        },
      });

      const images = loadChatImages("load-test");
      expect(images).toHaveLength(2);
      // Should include both upload and generated
      const sources = images.map((i) => i.source);
      expect(sources).toContain("upload");
      expect(sources).toContain("generated");
    });

    it("returns empty array for unknown session", () => {
      const images = loadChatImages("nonexistent");
      expect(images).toEqual([]);
    });
  });

  describe("loadChatImageData", () => {
    it("loads base64 data for a specific image", async () => {
      const entry = await saveChatImage({
        sessionKey: "data-test",
        base64: TINY_PNG_BASE64,
        mimeType: "image/png",
        timestamp: Date.now(),
      });

      const data = await loadChatImageData("data-test", entry!.id);
      expect(data).not.toBeNull();
      expect(data!.base64).toBe(TINY_PNG_BASE64);
      expect(data!.mimeType).toBe("image/png");
    });

    it("returns null for non-existent image", async () => {
      const data = await loadChatImageData("data-test", "nope");
      expect(data).toBeNull();
    });
  });

  describe("resolveChatImagePath", () => {
    it("resolves path for existing image file", async () => {
      const entry = await saveChatImage({
        sessionKey: "resolve-test",
        base64: TINY_PNG_BASE64,
        mimeType: "image/png",
        timestamp: Date.now(),
      });

      // Should resolve with full filename
      const resolved = resolveChatImagePath("resolve-test", entry!.file);
      expect(resolved).not.toBeNull();
      expect(resolved).toContain("resolve-test");
    });

    it("returns null for non-existent file", () => {
      expect(resolveChatImagePath("nope", "nope.png")).toBeNull();
    });
  });

  describe("expiry metadata", () => {
    it("sets 7-day expiry for uploaded images", async () => {
      await saveChatImage({
        sessionKey: "expiry-test",
        base64: TINY_PNG_BASE64,
        mimeType: "image/png",
        timestamp: Date.now(),
      });

      const rows = queryBySession("expiry-test");
      expect(rows[0].expires_at).not.toBeNull();
      const expiresAt = new Date(rows[0].expires_at!).getTime();
      const expectedExpiry = Date.now() + 7 * 86400000;
      // Allow 5s tolerance
      expect(Math.abs(expiresAt - expectedExpiry)).toBeLessThan(5000);
    });

    it("sets 30-day expiry for generated images", async () => {
      await saveGeneratedImage({
        sessionKey: "gen-expiry",
        data: TINY_PNG_BASE64,
        mimeType: "image/png",
        meta: {
          prompt: "test",
          model: "dall-e-3",
          provider: "openai",
          size: "1024x1024",
        },
      });

      const rows = queryBySession("gen-expiry");
      expect(rows[0].expires_at).not.toBeNull();
      const expiresAt = new Date(rows[0].expires_at!).getTime();
      const expectedExpiry = Date.now() + 30 * 86400000;
      expect(Math.abs(expiresAt - expectedExpiry)).toBeLessThan(5000);
    });
  });
});
