/**
 * Project ID Generation & Validation
 *
 * Format: "proj-{YYYYMMDD}-{8hex}"
 *
 * Migrated from clawdbot extensions/agent-team/src/project-id.ts
 */

import { randomUUID } from "node:crypto";

const VALID_ID_RE = /^[a-zA-Z0-9_-]+$/;

/**
 * Generate a unique project ID.
 * Format: proj-{date}-{random}  e.g. "proj-20260227-a3f7bc12"
 */
export function generateProjectId(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rand = randomUUID().slice(0, 8);
  return `proj-${date}-${rand}`;
}

/**
 * Validate projectId to prevent path traversal attacks.
 * Only allows: alphanumeric, hyphens, underscores.
 * Throws on invalid input.
 */
export function sanitizeProjectId(projectId: string): string {
  if (!VALID_ID_RE.test(projectId)) {
    throw new Error(
      `Invalid projectId: "${projectId}" — must contain only alphanumeric, hyphens, underscores`,
    );
  }
  return projectId;
}

/**
 * Non-throwing validation predicate.
 */
export function isValidProjectId(projectId: string): boolean {
  return VALID_ID_RE.test(projectId);
}
