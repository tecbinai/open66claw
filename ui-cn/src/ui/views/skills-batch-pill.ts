/**
 * Skills Batch Pill — Floating minimized indicator
 * Shows download progress, completion, or failure in a compact pill at bottom-left.
 */

import { html, nothing, type TemplateResult } from "lit";
import type {
  SkillsBatchPhase,
  BatchProgress,
  SkillBatchItem,
  FailedSkillItem,
} from "../controllers/skills-batch.js";
import { formatSpeed } from "../controllers/skills-batch.js";

export type SkillsBatchPillProps = {
  phase: SkillsBatchPhase;
  progress: BatchProgress;
  skills: SkillBatchItem[];
  result: { succeeded: string[]; failed: FailedSkillItem[]; durationMs: number } | null;
  onExpand: () => void;
  onDismiss: () => void;
};

function renderDownloadingPill(props: SkillsBatchPillProps): TemplateResult {
  const { progress, skills } = props;
  const pct = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;
  const activeSkill = skills.find((s) => s.status === "downloading" || s.status === "verifying");
  const skillName = activeSkill?.name ?? "";
  const radius = 10;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  return html`
    <div class="batch-pill" @click=${props.onExpand}
      style="display:inline-flex;align-items:center;gap:8px;padding:8px 16px 8px 10px;
        background:var(--card);border:1px solid var(--accent-muted, rgba(108,140,255,0.2));border-radius:100px;
        cursor:pointer;box-shadow:var(--shadow-lg, 0 4px 20px rgba(0,0,0,0.15));
        animation:batchPillIn 0.35s cubic-bezier(0.34,1.3,0.64,1);transition:transform 0.15s ease;user-select:none;">
      <svg width="28" height="28" viewBox="0 0 28 28" style="flex-shrink:0;transform:rotate(-90deg);">
        <circle cx="14" cy="14" r="${radius}" fill="none" stroke="var(--border)" stroke-width="2.5"/>
        <circle cx="14" cy="14" r="${radius}" fill="none" stroke="var(--accent, #6c8cff)" stroke-width="2.5"
          stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
          stroke-linecap="round" style="transition:stroke-dashoffset 0.3s ease;"/>
      </svg>
      <span style="font-size:14px;font-weight:700;color:var(--accent, #6c8cff);font-family:monospace;min-width:32px;">${pct}%</span>
      ${skillName ? html`<span style="font-size:12px;color:var(--muted);max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${skillName}</span>` : nothing}
      ${progress.speedBps > 0 ? html`<span style="font-size:11px;color:var(--ok, #22c55e);font-family:monospace;">${formatSpeed(progress.speedBps)}</span>` : nothing}
    </div>
  `;
}

function renderCompletePill(props: SkillsBatchPillProps): TemplateResult {
  const count = props.result?.succeeded.length ?? 0;
  return html`
    <div class="batch-pill" @click=${props.onExpand}
      style="display:inline-flex;align-items:center;gap:6px;padding:8px 16px;
        background:var(--card);border:1px solid rgba(34,197,94,0.25);border-radius:100px;
        cursor:pointer;box-shadow:var(--shadow-lg, 0 4px 20px rgba(0,0,0,0.15));
        animation:batchPillIn 0.35s cubic-bezier(0.34,1.3,0.64,1);transition:transform 0.15s ease;user-select:none;">
      <span style="width:20px;height:20px;border-radius:50%;background:var(--ok-subtle, rgba(34,197,94,0.1));display:inline-flex;align-items:center;justify-content:center;font-size:11px;color:var(--ok, #22c55e);">\u2713</span>
      <span style="font-size:13px;font-weight:600;color:var(--ok, #22c55e);">${count} \u4E2A\u6280\u80FD\u914D\u7F6E\u5B8C\u6210</span>
    </div>
  `;
}

function renderResultPill(props: SkillsBatchPillProps): TemplateResult {
  const failedCount = props.result?.failed.length ?? 0;
  return html`
    <div class="batch-pill" @click=${props.onExpand}
      style="display:inline-flex;align-items:center;gap:6px;padding:8px 16px;
        background:var(--card);border:1px solid rgba(245,158,11,0.25);border-radius:100px;
        cursor:pointer;box-shadow:var(--shadow-lg, 0 4px 20px rgba(0,0,0,0.15));
        animation:batchPillIn 0.35s cubic-bezier(0.34,1.3,0.64,1);transition:transform 0.15s ease;user-select:none;">
      <span style="width:20px;height:20px;border-radius:50%;background:rgba(245,158,11,0.1);display:inline-flex;align-items:center;justify-content:center;font-size:11px;color:var(--warning, #f59e0b);font-weight:700;">!</span>
      <span style="font-size:13px;font-weight:600;color:var(--warning, #f59e0b);">${failedCount} \u9879\u5931\u8D25</span>
    </div>
  `;
}

export function renderSkillsBatchPill(props: SkillsBatchPillProps): TemplateResult {
  if (props.phase === "downloading") return renderDownloadingPill(props);
  if (props.phase === "complete") return renderCompletePill(props);
  if (props.phase === "result") return renderResultPill(props);
  return html`${nothing}`;
}
