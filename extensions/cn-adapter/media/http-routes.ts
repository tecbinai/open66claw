/**
 * HTTP routes for serving persisted chat images and videos from disk.
 *
 * Routes:
 *   GET /api/media/chat-images/{sessionKey}/{filename} → image file
 *   GET /api/media/videos/{sessionKey}/{filename}      → video file (supports Range)
 */

import fs from "node:fs";
import path from "node:path";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { createCnLogger } from "../utils/logger.js";

const log = createCnLogger("media:http");

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
  ".tiff": "image/tiff",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
};

function resolveMediaRoot(): string {
  const home = process.env.HOME || process.env.USERPROFILE || "";
  const stateDir = process.env.OPENCLAW_STATE_DIR || path.join(home, ".openclaw");
  return path.join(stateDir, "media");
}

/** Sanitize path segment to prevent directory traversal. */
function safeName(name: string): string | null {
  if (!name || name.includes("..") || name.includes("\0")) return null;
  const sanitized = name.replace(/[^a-zA-Z0-9_\-.]/g, "_");
  if (!sanitized || sanitized.startsWith(".")) return null;
  return sanitized;
}

/**
 * Register HTTP routes for serving media files.
 * Must be called with an API that supports `registerHttpRoute`.
 */
export function registerMediaHttpRoutes(api: OpenClawPluginApi): void {
  if (typeof (api as any).registerHttpRoute !== "function") {
    log.warn("registerHttpRoute not available, media HTTP routes skipped");
    return;
  }

  (api as any).registerHttpRoute({
    path: "/api/media/",
    match: "prefix",
    auth: "plugin",
    handler: (req: any, res: any) => {
      const url = new URL(req.url ?? "/", "http://localhost");
      const pathname = url.pathname;

      // Match: /api/media/chat-images/{sessionKey}/{filename}
      const imageMatch = pathname.match(/^\/api\/media\/chat-images\/([^/]+)\/([^/]+)$/);
      if (imageMatch) {
        return serveFile(res, "chat-images", imageMatch[1], imageMatch[2]);
      }

      // Match: /api/media/videos/{sessionKey}/{filename}
      const videoMatch = pathname.match(/^\/api\/media\/videos\/([^/]+)\/([^/]+)$/);
      if (videoMatch) {
        return serveFile(res, "chat-videos", videoMatch[1], videoMatch[2], req);
      }

      // Not matched — 404
      res.statusCode = 404;
      res.end("Not Found");
      return true;
    },
  });

  log.info("Media HTTP routes registered");
}

function serveFile(
  res: any,
  subdir: string,
  rawSession: string,
  rawFile: string,
  req?: any,
): true {
  const session = safeName(rawSession);
  const file = safeName(rawFile);
  if (!session || !file) {
    res.statusCode = 400;
    res.end("Bad Request");
    return true;
  }

  const filePath = path.join(resolveMediaRoot(), subdir, session, file);

  // Ensure resolved path is still under media root (defense-in-depth)
  const resolved = path.resolve(filePath);
  const mediaRoot = path.resolve(resolveMediaRoot());
  if (!resolved.startsWith(mediaRoot)) {
    res.statusCode = 403;
    res.end("Forbidden");
    return true;
  }

  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch {
    res.statusCode = 404;
    res.end("Not Found");
    return true;
  }

  if (!stat.isFile()) {
    res.statusCode = 404;
    res.end("Not Found");
    return true;
  }

  const ext = path.extname(file).toLowerCase();
  const mime = MIME_BY_EXT[ext] ?? "application/octet-stream";

  // Video: support Range requests for streaming playback
  if (req && mime.startsWith("video/")) {
    return serveVideoWithRange(req, res, filePath, stat, mime);
  }

  // Image: serve full file
  res.statusCode = 200;
  res.setHeader("Content-Type", mime);
  res.setHeader("Content-Length", stat.size);
  res.setHeader("Cache-Control", "private, max-age=86400");
  const stream = fs.createReadStream(filePath);
  stream.pipe(res);
  return true;
}

function serveVideoWithRange(
  req: any,
  res: any,
  filePath: string,
  stat: fs.Stats,
  mime: string,
): true {
  const range = req.headers?.range as string | undefined;
  const total = stat.size;

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : total - 1;

    if (isNaN(start) || isNaN(end) || start >= total || end >= total || start > end) {
      res.statusCode = 416;
      res.setHeader("Content-Range", `bytes */${total}`);
      res.end();
      return true;
    }

    res.statusCode = 206;
    res.setHeader("Content-Range", `bytes ${start}-${end}/${total}`);
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Length", end - start + 1);
    res.setHeader("Content-Type", mime);
    res.setHeader("Cache-Control", "private, max-age=86400");
    const stream = fs.createReadStream(filePath, { start, end });
    stream.pipe(res);
  } else {
    res.statusCode = 200;
    res.setHeader("Content-Type", mime);
    res.setHeader("Content-Length", total);
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Cache-Control", "private, max-age=86400");
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  }
  return true;
}
