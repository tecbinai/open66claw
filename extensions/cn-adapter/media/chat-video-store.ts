/**
 * Chat Video Store — persists AI-generated videos to disk (SQLite-only metadata).
 *
 * Videos are stored under:
 *   ~/.openclaw/media/chat-videos/{sessionKey}/{id}.mp4
 *
 * Metadata is tracked exclusively in media-metadata.sqlite (no JSON manifest).
 * TTL: 365 days (1 year) — videos have high production cost.
 */

import crypto from "node:crypto";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { createCnLogger } from "../utils/logger.js";
import { insertMediaAsset, queryBySession } from "./media-db.js";
import type { ChatVideoEntry, VideoGenerationMeta, MediaAssetRow } from "./types.js";
import { VIDEO_RETENTION_DAYS } from "./types.js";

const log = createCnLogger("chat-video-store");

const CHAT_VIDEOS_SUBDIR = "chat-videos";

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

function resolveMediaRoot(): string {
  const home = process.env.HOME || process.env.USERPROFILE || "";
  const stateDir = process.env.OPENCLAW_STATE_DIR || path.join(home, ".openclaw");
  return path.join(stateDir, "media", CHAT_VIDEOS_SUBDIR);
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
 * Save an AI-generated video to disk + SQLite.
 */
export async function saveGeneratedVideo(params: {
  sessionKey: string;
  data: Buffer;
  mimeType: string;
  meta: VideoGenerationMeta;
  /** Original remote CDN URL for gallery/sidebar display. */
  remoteUrl?: string;
}): Promise<ChatVideoEntry | null> {
  try {
    const { sessionKey, mimeType, meta } = params;
    const safeSession = sanitizeKey(sessionKey);
    const buf = params.data;
    const hash = crypto.createHash("sha256").update(buf).digest("hex").slice(0, 8);
    const ts = Date.now();
    const id = `gen-${ts}-${hash}`;
    const file = `${id}.mp4`;

    const dir = resolveSessionDir(sessionKey);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, file), buf);

    const entry: ChatVideoEntry = {
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
        type: "video",
        file,
        url: params.remoteUrl || `/api/media/videos/${safeSession}/${file}`,
        mime_type: mimeType,
        size_bytes: buf.length,
        source: "generated",
        prompt: meta.prompt,
        revised_prompt: null,
        model: meta.model,
        provider: meta.provider,
        image_size: meta.size,
        style: null,
        seed: null,
        duration_ms: null,
        duration_secs: meta.durationSeconds ?? null,
        cover_url: meta.coverImageUrl ?? null,
        message_text: meta.prompt.slice(0, 100),
        created_at: entry.createdAt,
        expires_at: new Date(Date.now() + VIDEO_RETENTION_DAYS * 86400000).toISOString(),
      });
    } catch (err) {
      log.warn(`SQLite write failed for video ${id}: ${String(err).slice(0, 100)}`);
    }

    return entry;
  } catch (err) {
    log.warn(`saveGeneratedVideo failed: ${String(err).slice(0, 200)}`);
    return null;
  }
}

/**
 * Resolve the absolute path for a chat video file.
 * Returns null if the file does not exist.
 */
export function resolveChatVideoPath(sessionKey: string, videoFile: string): string | null {
  const safe = sessionKey.replace(/[^a-zA-Z0-9_\-.]/g, "_");
  const safeVideoFile = videoFile.replace(/[^a-zA-Z0-9_\-.]/g, "_");
  const filePath = path.join(resolveMediaRoot(), safe, safeVideoFile);
  try {
    if (fsSync.existsSync(filePath)) return filePath;
  } catch {
    // ignore
  }
  return null;
}

/**
 * Load all video entries for a session (metadata only, from SQLite).
 */
export function loadChatVideos(sessionKey: string): ChatVideoEntry[] {
  try {
    const rows = queryBySession(sessionKey).filter((r) => r.type === "video");
    return rows.map(sqliteRowToVideoEntry);
  } catch (err) {
    log.warn(`Failed to load videos for session ${sessionKey}: ${String(err).slice(0, 100)}`);
    return [];
  }
}

/**
 * Delete expired video sessions from disk.
 * A session's videos are expired if ALL videos in it are older than maxAgeDays (default 365).
 */
export async function cleanExpiredChatVideos(maxAgeDays = VIDEO_RETENTION_DAYS): Promise<number> {
  const root = resolveMediaRoot();
  let deleted = 0;

  let sessionDirs: string[];
  try {
    sessionDirs = await fs.readdir(root);
  } catch {
    return 0;
  }

  const cutoff = Date.now() - maxAgeDays * 86400000;

  for (const dirName of sessionDirs) {
    const dirPath = path.join(root, dirName);
    const stat = await fs.stat(dirPath).catch(() => null);
    if (!stat?.isDirectory()) continue;

    try {
      const videos = loadChatVideos(dirName);
      if (videos.length === 0) {
        if (stat.mtimeMs < cutoff) {
          await fs.rm(dirPath, { recursive: true, force: true });
          deleted++;
        }
        continue;
      }

      const allExpired = videos.every((e) => {
        const t = new Date(e.createdAt).getTime();
        return t < cutoff;
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

function sqliteRowToVideoEntry(row: MediaAssetRow): ChatVideoEntry {
  return {
    id: row.id,
    file: row.file,
    mimeType: row.mime_type ?? "video/mp4",
    sizeBytes: row.size_bytes ?? 0,
    timestamp: new Date(row.created_at).getTime(),
    messageText: row.message_text ?? "",
    createdAt: row.created_at,
    source: "generated",
    generationMeta: {
      prompt: row.prompt ?? "",
      model: row.model ?? "",
      provider: row.provider ?? "",
      size: row.image_size ?? "",
      durationSeconds: row.duration_secs ?? undefined,
      coverImageUrl: row.cover_url ?? undefined,
    },
  };
}
