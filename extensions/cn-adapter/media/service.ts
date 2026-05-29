/**
 * Media Cleanup Service — registers a plugin service for periodic media maintenance.
 *
 * Uses registerService (start/stop lifecycle):
 * - on start: run initial cleanup + start interval timer (every 6 hours)
 * - on stop: clear interval timer + close SQLite connection
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { createCnLogger } from "../utils/logger.js";
import { cleanExpiredChatImages } from "./chat-image-store.js";
import { cleanExpiredChatVideos } from "./chat-video-store.js";
import { runMediaDbMaintenance, closeMediaDb } from "./media-db.js";

const log = createCnLogger("media:service");

/** Cleanup interval: 6 hours */
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;

let _cleanupTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Run a full cleanup cycle: SQLite maintenance + disk cleanup.
 */
async function runCleanupCycle(): Promise<void> {
  try {
    // 1. SQLite: delete expired rows + enforce row cap + vacuum
    const dbResult = runMediaDbMaintenance();
    if (dbResult.expired > 0 || dbResult.capped > 0) {
      log.info(`DB maintenance: expired=${dbResult.expired}, capped=${dbResult.capped}`);
    }

    // 2. Disk: delete expired image/video session directories
    const expiredImages = await cleanExpiredChatImages();
    const expiredVideos = await cleanExpiredChatVideos();
    if (expiredImages > 0 || expiredVideos > 0) {
      log.info(`Disk cleanup: expired images=${expiredImages}, videos=${expiredVideos}`);
    }
  } catch (err) {
    log.warn(`Cleanup cycle failed: ${String(err).slice(0, 200)}`);
  }
}

/**
 * Register the media-cleanup service with the plugin API.
 */
export function registerMediaService(api: OpenClawPluginApi): void {
  api.registerService({
    id: "cn-media-cleanup",

    async start(_ctx) {
      log.info("cn-media-cleanup service starting...");

      // Initial cleanup on startup (fire-and-forget to avoid blocking plugin load)
      runCleanupCycle().catch(() => {});

      // Schedule periodic cleanup
      _cleanupTimer = setInterval(() => {
        runCleanupCycle().catch(() => {});
      }, CLEANUP_INTERVAL_MS);

      // Unref so the timer doesn't prevent process exit
      if (_cleanupTimer && typeof _cleanupTimer === "object" && "unref" in _cleanupTimer) {
        (_cleanupTimer as NodeJS.Timeout).unref();
      }

      log.info("cn-media-cleanup service started (interval: 6h)");
    },

    async stop(_ctx) {
      log.info("cn-media-cleanup service stopping...");
      if (_cleanupTimer) {
        clearInterval(_cleanupTimer);
        _cleanupTimer = null;
      }
      closeMediaDb();
      log.info("cn-media-cleanup service stopped");
    },
  });

  log.info("cn-media-cleanup service registered");
}
