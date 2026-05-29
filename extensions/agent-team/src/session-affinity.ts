/**
 * Session Affinity — Sticky routing for agent teams.
 *
 * Once a peer is routed to a specific team member, subsequent messages
 * from the same peer stick to that member until the affinity expires.
 *
 * Storage: in-memory Map with debounced disk persistence.
 *
 * Migrated from clawdbot extensions/agent-team/src/session-affinity.ts
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { SessionAffinityRecord } from "./types.js";

// ── In-Memory Store ──────────────────────────────────────────────────────

const MAX_AFFINITY_ENTRIES = 50_000;
const store = new Map<string, SessionAffinityRecord>();

let persistDir = "";
let persistTimer: ReturnType<typeof setTimeout> | undefined;
const PERSIST_DEBOUNCE_MS = 5_000;
let persistDirty = false;

function compositeKey(projectId: string, peerId: string): string {
  return `${projectId}:${peerId}`;
}

// ── Persistence ─────────────────────────────────────────────────────────

export function initAffinityPersistence(dir: string): void {
  persistDir = dir;
}

function affinityFilePath(): string {
  return path.join(persistDir, "affinity-cache.json");
}

function schedulePersist(): void {
  if (!persistDir) return;
  persistDirty = true;
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = undefined;
    if (!persistDirty) return;
    persistDirty = false;
    persistToDisk().catch(() => {});
  }, PERSIST_DEBOUNCE_MS);
}

async function persistToDisk(): Promise<void> {
  if (!persistDir) return;
  const cutoff = Date.now() - 24 * 60 * 60_000;
  const entries: Array<[string, SessionAffinityRecord]> = [];
  for (const [key, record] of store) {
    const ts = new Date(record.lastActiveAt).getTime();
    if (!Number.isNaN(ts) && ts > cutoff) {
      entries.push([key, record]);
    }
  }
  const data = JSON.stringify(entries);
  const filePath = affinityFilePath();
  const tmpPath = `${filePath}.tmp`;
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(tmpPath, data, "utf-8");
    try {
      await fs.rename(tmpPath, filePath);
    } catch {
      try {
        await fs.copyFile(tmpPath, filePath);
      } finally {
        try {
          await fs.unlink(tmpPath);
        } catch {
          /* ignore */
        }
      }
    }
  } catch {
    // Disk save is best-effort
  }
}

const AFFINITY_RESTORE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export async function restoreAffinitiesFromDisk(validAgentIds?: Set<string>): Promise<number> {
  if (!persistDir) return 0;
  try {
    const raw = await fs.readFile(affinityFilePath(), "utf-8");
    const entries = JSON.parse(raw) as Array<[string, SessionAffinityRecord]>;
    if (!Array.isArray(entries)) return 0;
    let restored = 0;
    const now = Date.now();
    for (const [key, record] of entries) {
      if (
        typeof key === "string" &&
        record &&
        typeof record.peerId === "string" &&
        typeof record.agentId === "string" &&
        typeof record.lastActiveAt === "string"
      ) {
        if (validAgentIds && !validAgentIds.has(record.agentId)) continue;
        const lastActive = new Date(record.lastActiveAt).getTime();
        if (!Number.isFinite(lastActive) || now - lastActive > AFFINITY_RESTORE_MAX_AGE_MS) {
          continue;
        }
        store.set(key, record);
        restored++;
      }
    }
    return restored;
  } catch {
    return 0;
  }
}

export async function flushAffinityToDisk(): Promise<void> {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = undefined;
  }
  if (persistDirty) {
    persistDirty = false;
    await persistToDisk();
  }
}

// ── Core API ─────────────────────────────────────────────────────────────

export function getAffinity(projectId: string, peerId: string): SessionAffinityRecord | null {
  return store.get(compositeKey(projectId, peerId)) ?? null;
}

export function setAffinity(projectId: string, peerId: string, agentId: string): void {
  const key = compositeKey(projectId, peerId);
  const existing = store.get(key);

  if (existing && existing.agentId === agentId) {
    store.set(key, {
      ...existing,
      lastActiveAt: new Date().toISOString(),
      messageCount: existing.messageCount + 1,
    });
  } else {
    if (!existing && store.size >= MAX_AFFINITY_ENTRIES) {
      const evictCount = Math.max(1, Math.floor(MAX_AFFINITY_ENTRIES * 0.1));
      const entries: Array<[string, number]> = [];
      for (const [k, v] of store) {
        entries.push([k, new Date(v.lastActiveAt).getTime()]);
      }
      entries.sort((a, b) => a[1] - b[1]);
      for (let i = 0; i < evictCount && i < entries.length; i++) {
        store.delete(entries[i][0]);
      }
    }

    store.set(key, {
      peerId,
      agentId,
      lastActiveAt: new Date().toISOString(),
      messageCount: 1,
    });
  }

  schedulePersist();
}

export function clearAffinity(projectId: string, peerId: string): void {
  store.delete(compositeKey(projectId, peerId));
  schedulePersist();
}

export function clearProjectAffinities(projectId: string): void {
  const prefix = `${projectId}:`;
  let deleted = false;
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) {
      store.delete(key);
      deleted = true;
    }
  }
  if (deleted) schedulePersist();
}

export function isAffinityExpired(record: SessionAffinityRecord, timeoutMinutes: number): boolean {
  if (timeoutMinutes <= 0) return true;
  const lastActive = new Date(record.lastActiveAt).getTime();
  if (Number.isNaN(lastActive)) return true;
  const expiresAt = lastActive + timeoutMinutes * 60_000;
  return Date.now() > expiresAt;
}

export function resolveAffinityAgent(
  projectId: string,
  peerId: string,
  timeoutMinutes: number,
): string | null {
  const record = getAffinity(projectId, peerId);
  if (!record) return null;
  if (isAffinityExpired(record, timeoutMinutes)) {
    clearAffinity(projectId, peerId);
    return null;
  }
  return record.agentId;
}

export function purgeExpiredAffinities(timeoutMinutes: number): number {
  let purged = 0;
  for (const [key, record] of store) {
    if (isAffinityExpired(record, timeoutMinutes)) {
      store.delete(key);
      purged++;
    }
  }
  if (purged > 0) schedulePersist();
  return purged;
}

export function getAllAffinities(): Map<string, SessionAffinityRecord> {
  return new Map(store);
}

export function resetAllAffinities(): void {
  store.clear();
}
