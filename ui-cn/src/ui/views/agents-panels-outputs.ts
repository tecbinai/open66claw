/**
 * Agent Outputs Panel — two-column view for browsing agent-generated workspace files.
 *
 * Left column: flat file list (with directory grouping).
 * Right column: read-only file preview with copy button.
 *
 * Follows the same layout pattern as renderAgentFiles() in agents-panels-status-files.ts.
 */

import { html, nothing } from "lit";
import { formatRelativeTimestamp } from "../format.ts";
import { t } from "../i18n/index.js";
import type { AgentOutputEntry, AgentOutputsListResult } from "../types.ts";
import { formatBytes } from "./agents-utils.ts";

/* ── Collapsed directories (keyed by agentId to prevent cross-agent leak) ── */
const collapsedDirsMap = new Map<string, Set<string>>();

function getCollapsedDirs(agentId: string): Set<string> {
  let set = collapsedDirsMap.get(agentId);
  if (!set) {
    set = new Set();
    collapsedDirsMap.set(agentId, set);
  }
  return set;
}

export function renderAgentOutputs(params: {
  agentId: string;
  agentOutputsList: AgentOutputsListResult | null;
  agentOutputsLoading: boolean;
  agentOutputsError: string | null;
  agentOutputActive: string | null;
  agentOutputContent: string | null;
  agentOutputContentLoading: boolean;
  onLoadOutputs: (agentId: string) => void;
  onSelectOutput: (agentId: string, filePath: string, relativeName: string) => void;
  requestUpdate: () => void;
}) {
  const list = params.agentOutputsList?.agentId === params.agentId ? params.agentOutputsList : null;
  const entries = list?.entries ?? [];
  const active = params.agentOutputActive ?? null;
  const activeEntry = active ? (entries.find((e) => e.name === active) ?? null) : null;

  // Build directory tree for grouping
  const { dirs, rootFiles } = groupByDirectory(entries);

  return html`
    <section class="card">
      <div class="row" style="justify-content: space-between;">
        <div>
          <div class="card-title">${t("agents.outputFiles")}</div>
          <div class="card-sub">${t("agents.outputFilesSub")}</div>
        </div>
        <button
          class="btn btn--sm"
          ?disabled=${params.agentOutputsLoading}
          @click=${() => params.onLoadOutputs(params.agentId)}
        >
          ${params.agentOutputsLoading ? t("agents.loading") : t("overview.refresh")}
        </button>
      </div>
      ${
        list
          ? html`<div class="muted mono" style="margin-top: 8px;">
              ${t("agents.workspaceLabel")} ${list.workspace}
            </div>`
          : nothing
      }
      ${
        params.agentOutputsError
          ? html`<div class="callout danger" style="margin-top: 12px;">
              ${params.agentOutputsError}
            </div>`
          : nothing
      }
      ${
        !list
          ? html`
              <div class="callout info" style="margin-top: 12px">
                ${t("agents.loadOutputsHint")}
              </div>
            `
          : entries.length === 0
            ? html`
                <div class="callout info" style="margin-top: 12px">
                  ${t("agents.noOutputs")}
                </div>
              `
            : html`
                <div class="agent-files-grid" style="margin-top: 16px;">
                  <div class="agent-files-list">
                    ${rootFiles.map((entry) =>
                      renderOutputFileRow(entry, active, () =>
                        params.onSelectOutput(params.agentId, entry.path, entry.name),
                      ),
                    )}
                    ${Array.from(dirs.entries()).map(([dirName, dirEntries]) =>
                      renderOutputDir(dirName, dirEntries, active, params),
                    )}
                  </div>
                  <div class="agent-files-editor">
                    ${
                      !activeEntry
                        ? html`<div class="muted">${t("agents.selectOutputHint")}</div>`
                        : html`
                            <div class="agent-file-header">
                              <div>
                                <div class="agent-file-title mono">${activeEntry.name}</div>
                                <div class="agent-file-sub mono">
                                  ${formatBytes(activeEntry.size)}
                                  · ${formatRelativeTimestamp(activeEntry.updatedAtMs)}
                                </div>
                              </div>
                              <div class="agent-file-actions">
                                <button
                                  class="btn btn--sm"
                                  ?disabled=${params.agentOutputContent === null}
                                  @click=${() => copyOutputContent(params.agentOutputContent)}
                                >
                                  ${t("agents.outputCopy")}
                                </button>
                              </div>
                            </div>
                            ${
                              params.agentOutputContentLoading
                                ? html`<div class="muted" style="margin-top: 12px;">
                                    ${t("agents.loading")}…
                                  </div>`
                                : params.agentOutputContent != null
                                  ? html`<pre class="agent-output-preview">${params.agentOutputContent}</pre>`
                                  : html`<div class="muted" style="margin-top: 12px;">
                                      ${t("agents.selectOutputHint")}
                                    </div>`
                            }
                          `
                    }
                  </div>
                </div>
              `
      }
    </section>
  `;
}

/* ── Directory grouping ── */

function groupByDirectory(entries: AgentOutputEntry[]) {
  const dirs = new Map<string, AgentOutputEntry[]>();
  const rootFiles: AgentOutputEntry[] = [];

  for (const entry of entries) {
    if (entry.isDirectory) continue; // skip directory entries themselves
    const slash = entry.name.indexOf("/");
    if (slash === -1) {
      rootFiles.push(entry);
    } else {
      const dirName = entry.name.slice(0, slash);
      let list = dirs.get(dirName);
      if (!list) {
        list = [];
        dirs.set(dirName, list);
      }
      list.push(entry);
    }
  }
  return { dirs, rootFiles };
}

/* ── Directory row (collapsible) ── */

function renderOutputDir(
  dirName: string,
  entries: AgentOutputEntry[],
  active: string | null,
  params: {
    agentId: string;
    onSelectOutput: (agentId: string, filePath: string, relativeName: string) => void;
    requestUpdate: () => void;
  },
) {
  const collapsed = getCollapsedDirs(params.agentId).has(dirName);
  return html`
    <button
      type="button"
      class="agent-file-row agent-output-dir"
      @click=${() => {
        const dirs = getCollapsedDirs(params.agentId);
        if (collapsed) dirs.delete(dirName);
        else dirs.add(dirName);
        params.requestUpdate();
      }}
    >
      <div style="display: flex; align-items: center; gap: 6px;">
        <span style="font-size: 10px; color: var(--text-secondary);">
          ${collapsed ? "\u25B6" : "\u25BC"}
        </span>
        <span class="agent-file-name mono">${dirName}/</span>
        <span class="agent-file-meta">${entries.length} files</span>
      </div>
    </button>
    ${
      collapsed
        ? nothing
        : entries.map((entry) =>
            renderOutputFileRow(
              entry,
              active,
              () => params.onSelectOutput(params.agentId, entry.path, entry.name),
              true,
            ),
          )
    }
  `;
}

/* ── Single file row ── */

function renderOutputFileRow(
  entry: AgentOutputEntry,
  active: string | null,
  onSelect: () => void,
  indented = false,
) {
  const displayName = indented ? entry.name.slice(entry.name.indexOf("/") + 1) : entry.name;
  const meta = `${formatBytes(entry.size)} · ${formatRelativeTimestamp(entry.updatedAtMs)}`;
  return html`
    <button
      type="button"
      class="agent-file-row ${active === entry.name ? "active" : ""}"
      style="${indented ? "padding-left: 28px;" : ""}"
      @click=${onSelect}
    >
      <div>
        <div class="agent-file-name mono">${displayName}</div>
        <div class="agent-file-meta">${meta}</div>
      </div>
    </button>
  `;
}

/* ── Copy helper ── */

function copyOutputContent(content: string | null) {
  if (content === null) return;
  navigator.clipboard?.writeText(content)?.catch(() => {});
}
