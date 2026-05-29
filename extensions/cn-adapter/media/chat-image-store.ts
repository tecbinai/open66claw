/**
 * Chat Image Store — persists webchat image attachments to disk (SQLite-only metadata).
 *
 * Images are stored under:
 *   ~/.openclaw/media/chat-images/{sessionKey}/{timestamp}-{hash}.{ext}
 *
 * Metadata is tracked exclusively in media-metadata.sqlite (no JSON manifest).
 */

import crypto from "node:crypto";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { createCnLogger } from "../utils/logger.js";
import { insertMediaAsset, queryBySession } from "./media-db.js";
import type { ChatImageEntry, ImageGenerationMeta, MediaAssetRow } from "./types.js";
import { DEFAULT_IMAGE_RETENTION_DAYS, GENERATED_IMAGE_RETENTION_DAYS } from "./types.js";

const log = createCnLogger("chat-image-store");

const CHAT_IMAGES_SUBDIR = "chat-images";

// Simple MIME → extension mapping (avoids importing upstream src/media/mime.ts)
const MIME_TO_EXT: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/svg+xml": ".svg",
  "image/bmp": ".bmp",
  "image/tiff": ".tiff",
};

function extensionForMime(mime: string): string {
  return MIME_TO_EXT[mime] ?? ".bin";
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

function resolveMediaRoot(): string {
  const home = process.env.HOME || process.env.USERPROFILE || "";
  const stateDir = process.env.OPENCLAW_STATE_DIR || path.join(home, ".openclaw");
  return path.join(stateDir, "media", CHAT_IMAGES_SUBDIR);
}

function sanitizeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9_\-.]/g, "_");
}

function resolveSessionDir(sessionKey: string): string {
  return path.join(resolveMediaRoot(), sanitizeKey(sessionKey));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Save a user-uploaded chat image to disk + SQLite.
 */
export async function saveChatImage(params: {
  sessionKey: string;
  base64: string;
  mimeType: string;
  timestamp: number;
  messageText?: string;
}): Promise<ChatImageEntry | null> {
  try {
    const { sessionKey, base64, mimeType, timestamp } = params;
    const safeSession = sanitizeKey(sessionKey);
    const buf = Buffer.from(base64, "base64");
    const hash = crypto.createHash("sha256").update(buf).digest("hex").slice(0, 8);
    const ext = extensionForMime(mimeType);
    const id = `${timestamp}-${hash}`;
    const file = `${id}${ext}`;

    const dir = resolveSessionDir(sessionKey);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, file), buf);

    const entry: ChatImageEntry = {
      id,
      file,
      mimeType,
      sizeBytes: buf.length,
      timestamp,
      messageText: (params.messageText ?? "").slice(0, 100),
      createdAt: new Date().toISOString(),
      source: "upload",
    };

    try {
      insertMediaAsset({
        id,
        session_key: sessionKey,
        type: "image",
        file,
        url: `/api/media/chat-images/${safeSession}/${file}`,
        mime_type: mimeType,
        size_bytes: buf.length,
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
        message_text: entry.messageText,
        created_at: entry.createdAt,
        expires_at: new Date(Date.now() + DEFAULT_IMAGE_RETENTION_DAYS * 86400000).toISOString(),
      });
    } catch (err) {
      log.warn(`SQLite write failed for image ${id}: ${String(err).slice(0, 100)}`);
    }

    return entry;
  } catch (err) {
    log.warn(`saveChatImage failed: ${String(err).slice(0, 200)}`);
    return null;
  }
}

/**
 * Save an AI-generated image to disk + SQLite.
 */
export async function saveGeneratedImage(params: {
  sessionKey: string;
  data: Buffer | string;
  mimeType: string;
  meta: ImageGenerationMeta;
  /** Original remote CDN URL for gallery/sidebar display (avoids data URI bloat). */
  remoteUrl?: string;
}): Promise<ChatImageEntry | null> {
  try {
    const { sessionKey, mimeType, meta } = params;
    const safeSession = sanitizeKey(sessionKey);
    const buf = typeof params.data === "string" ? Buffer.from(params.data, "base64") : params.data;
    const hash = crypto.createHash("sha256").update(buf).digest("hex").slice(0, 8);
    const ext = extensionForMime(mimeType);
    const ts = Date.now();
    const id = `gen-${ts}-${hash}`;
    const file = `${id}${ext}`;

    const dir = resolveSessionDir(sessionKey);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, file), buf);

    const entry: ChatImageEntry = {
      id,
      file,
      mimeType,
      sizeBytes: buf.length,
      timestamp: ts,
      messageText: meta.prompt.slice(0, 100),
      createdAt: new Date().toISOString(),
      source: "generated",
      generationMeta: meta,
    };

    try {
      insertMediaAsset({
        id,
        session_key: sessionKey,
        type: "image",
        file,
        url: params.remoteUrl || `/api/media/chat-images/${safeSession}/${file}`,
        mime_type: mimeType,
        size_bytes: buf.length,
        source: "generated",
        prompt: meta.prompt,
        revised_prompt: meta.revisedPrompt ?? null,
        model: meta.model,
        provider: meta.provider,
        image_size: meta.size,
        style: meta.style ?? null,
        seed: meta.seed ?? null,
        duration_ms: meta.durationMs ?? null,
        duration_secs: null,
        cover_url: null,
        message_text: meta.prompt.slice(0, 100),
        created_at: entry.createdAt,
        expires_at: new Date(Date.now() + GENERATED_IMAGE_RETENTION_DAYS * 86400000).toISOString(),
      });
    } catch (err) {
      log.warn(`SQLite write failed for generated image ${id}: ${String(err).slice(0, 100)}`);
    }

    return entry;
  } catch (err) {
    log.warn(`saveGeneratedImage failed: ${String(err).slice(0, 200)}`);
    return null;
  }
}

/**
 * Resolve the absolute path for a chat image file.
 * Returns null if the file does not exist.
 */
export function resolveChatImagePath(sessionKey: string, imageId: string): string | null {
  const safe = sessionKey.replace(/[^a-zA-Z0-9_\-.]/g, "_");
  const safeImageId = imageId.replace(/[^a-zA-Z0-9_\-.]/g, "_");
  const candidates = [
    path.join(resolveMediaRoot(), safe, safeImageId),
    path.join(resolveMediaRoot(), safe, `${safeImageId}.png`),
    path.join(resolveMediaRoot(), safe, `${safeImageId}.jpg`),
    path.join(resolveMediaRoot(), safe, `${safeImageId}.webp`),
  ];
  for (const p of candidates) {
    try {
      if (fsSync.existsSync(p)) return p;
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Load all image entries for a session (metadata only, from SQLite).
 */
export function loadChatImages(sessionKey: string): ChatImageEntry[] {
  try {
    const rows = queryBySession(sessionKey).filter((r) => r.type === "image");
    return rows.map(sqliteRowToImageEntry);
  } catch (err) {
    log.warn(`Failed to load images for session ${sessionKey}: ${String(err).slice(0, 100)}`);
    return [];
  }
}

/**
 * Load the base64 data for a specific chat image.
 */
export async function loadChatImageData(
  sessionKey: string,
  imageId: string,
): Promise<{ base64: string; mimeType: string } | null> {
  const images = loadChatImages(sessionKey);
  const entry = images.find((e) => e.id === imageId);
  if (!entry) return null;

  try {
    const filePath = path.join(resolveSessionDir(sessionKey), entry.file);
    const buf = await fs.readFile(filePath);
    return { base64: buf.toString("base64"), mimeType: entry.mimeType };
  } catch {
    return null;
  }
}

/**
 * Delete expired image sessions from disk.
 * A session's images are expired if ALL images in it are older than their TTL.
 */
export async function cleanExpiredChatImages(): Promise<number> {
  const root = resolveMediaRoot();
  let deleted = 0;

  let sessionDirs: string[];
  try {
    sessionDirs = await fs.readdir(root);
  } catch {
    return 0;
  }

  const uploadCutoff = Date.now() - DEFAULT_IMAGE_RETENTION_DAYS * 86400000;
  const generatedCutoff = Date.now() - GENERATED_IMAGE_RETENTION_DAYS * 86400000;

  for (const dirName of sessionDirs) {
    const dirPath = path.join(root, dirName);
    const stat = await fs.stat(dirPath).catch(() => null);
    if (!stat?.isDirectory()) continue;

    try {
      // Check SQLite for this session's images
      const images = loadChatImages(dirName);
      if (images.length === 0) {
        // No metadata — use dir mtime as fallback
        if (stat.mtimeMs < uploadCutoff) {
          await fs.rm(dirPath, { recursive: true, force: true });
          deleted++;
        }
        continue;
      }

      const allExpired = images.every((e) => {
        const t = new Date(e.createdAt).getTime();
        return e.source === "generated" ? t < generatedCutoff : t < uploadCutoff;
      });

      if (allExpired) {
        await fs.rm(dirPath, { recursive: true, force: true });
        deleted++;
      }
    } catch {
      // Skip corrupt dirs
    }
  }

  return deleted;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function sqliteRowToImageEntry(row: MediaAssetRow): ChatImageEntry {
  const entry: ChatImageEntry = {
    id: row.id,
    file: row.file,
    mimeType: row.mime_type ?? "image/png",
    sizeBytes: row.size_bytes ?? 0,
    timestamp: new Date(row.created_at).getTime(),
    messageText: row.message_text ?? "",
    createdAt: row.created_at,
    source: row.source as "upload" | "generated" | undefined,
  };
  if (row.source === "generated" && row.model) {
    entry.generationMeta = {
      prompt: row.prompt ?? "",
      revisedPrompt: row.revised_prompt ?? undefined,
      model: row.model,
      provider: row.provider ?? "",
      size: row.image_size ?? "",
      style: row.style ?? undefined,
      seed: row.seed ?? undefined,
      durationMs: row.duration_ms ?? undefined,
    };
  }
  return entry;
}
