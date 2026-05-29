/**
 * Agent Team State Manager
 *
 * Manages Project lifecycle: creation, update, deletion, listing.
 * Storage: JSON files under ~/.openclaw/agent-team/projects/{projectId}/
 *
 * Migrated from clawdbot extensions/agent-team/src/state.ts
 * Changes: ~/.openclawcn → ~/.openclaw
 */

import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { sanitizeProjectId } from "./project-id.js";
import type { Project, ProjectState } from "./types.js";

function isFileNotFound(err: unknown): boolean {
  return err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT";
}

// ── State Directory ──────────────────────────────────────────────────────

let stateDir = "";

export async function initProjectStateDir(dir: string): Promise<void> {
  stateDir = dir;
  try {
    await fs.mkdir(path.join(dir, "projects"), { recursive: true });
  } catch {
    console.warn(`[agent-team] Could not pre-create state directory: ${dir}`);
  }
}

function ensureStateDir(): string {
  if (!stateDir) {
    throw new Error(
      "Agent-team state directory not initialized. Call initProjectStateDir() first.",
    );
  }
  return stateDir;
}

// ── Path Helpers ─────────────────────────────────────────────────────────

function projectDir(projectId: string): string {
  return path.join(ensureStateDir(), "projects", sanitizeProjectId(projectId));
}

export function resolveProjectDir(projectId: string): string {
  return projectDir(projectId);
}

function projectPath(projectId: string): string {
  return path.join(projectDir(projectId), "project.json");
}

function statePath(projectId: string): string {
  return path.join(projectDir(projectId), "state.json");
}

// ── Atomic Write Helper ──────────────────────────────────────────────────

async function atomicWriteJson(filePath: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${randomUUID().slice(0, 8)}.tmp`;
  const content = JSON.stringify(data, null, 2);
  await fs.writeFile(tmpPath, content, "utf-8");
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
}

// ── Project CRUD ─────────────────────────────────────────────────────────

export async function saveProject(project: Project): Promise<void> {
  await atomicWriteJson(projectPath(project.projectId), project);
}

export async function loadProject(projectId: string): Promise<Project | null> {
  try {
    const raw = await fs.readFile(projectPath(projectId), "utf-8");
    return JSON.parse(raw) as Project;
  } catch (err: unknown) {
    if (isFileNotFound(err)) return null;
    console.error(`[agent-team] failed to load project "${projectId}":`, err);
    return null;
  }
}

export async function deleteProject(projectId: string): Promise<void> {
  const dir = projectDir(projectId);
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch (err: unknown) {
    if (!isFileNotFound(err)) {
      console.error(`[agent-team] failed to delete project "${projectId}":`, err);
    }
  }
}

export async function listProjectIds(): Promise<string[]> {
  const dir = path.join(ensureStateDir(), "projects");
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

export async function loadAllProjects(): Promise<Project[]> {
  const ids = await listProjectIds();
  const results = await Promise.all(ids.map((id) => loadProject(id)));
  return results.filter((p): p is Project => p !== null);
}

// ── Activity Persistence ──────────────────────────────────────────────────

function activityPath(projectId: string): string {
  return path.join(projectDir(projectId), "activity.json");
}

export async function saveActivity(projectId: string, events: unknown[]): Promise<void> {
  await atomicWriteJson(activityPath(projectId), events);
}

export async function loadActivity(projectId: string): Promise<unknown[]> {
  try {
    const raw = await fs.readFile(activityPath(projectId), "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ── Runtime State ────────────────────────────────────────────────────────

export async function saveProjectState(state: ProjectState): Promise<void> {
  await atomicWriteJson(statePath(state.projectId), state);
}

export async function loadProjectState(projectId: string): Promise<ProjectState | null> {
  try {
    const raw = await fs.readFile(statePath(projectId), "utf-8");
    return JSON.parse(raw) as ProjectState;
  } catch (err: unknown) {
    if (isFileNotFound(err)) return null;
    console.error(`[agent-team] failed to load state for "${projectId}":`, err);
    return null;
  }
}
