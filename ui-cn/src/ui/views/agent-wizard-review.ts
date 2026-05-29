/**
 * agent-wizard-review.ts
 * Step 5: Review summary + create button
 */

import { html, nothing, type TemplateResult } from "lit";
import { t } from "../i18n/index.js";
import type { AgentWizardState, AgentWizardStep } from "./agent-wizard.js";
import { AGENT_TEMPLATES } from "./agent-wizard-templates.js";

/* ── Tool profile labels ────────────────────────────────── */

const PROFILE_LABELS: Record<string, string> = {
  minimal: "\u{1F4D6} \u7CBE\u7B80",
  coding: "\u{1F4BB} \u7F16\u7A0B",
  messaging: "\u{1F4AC} \u6D88\u606F",
  full: "\u26A1 \u5168\u80FD",
};

/* ── Step 5 renderer ────────────────────────────────────── */

export type Step5Props = {
  state: AgentWizardState;
  onGoToStep: (step: AgentWizardStep) => void;
};

export function renderWizardStep5(props: Step5Props): TemplateResult {
  const { state } = props;
  const tpl = AGENT_TEMPLATES.find((t) => t.id === state.templateId);

  const soulPreview = state.soulMdDraft.trim()
    ? state.soulMdDraft.split("\n").slice(0, 3).join("\n")
    : t("wizard.review.noSoul");

  return html`
    <div class="aw-review">
      <!-- Identity -->
      <div class="aw-review-card">
        <div class="aw-review-card__header">
          <span class="aw-review-card__title">${state.agentEmoji || tpl?.emoji || "\u{1F916}"} ${state.agentName || state.agentId}</span>
          <button class="aw-review-card__edit" @click=${() => props.onGoToStep(1)}>${t("wizard.review.edit")}</button>
        </div>
        <div class="aw-review-card__body">
          <div class="aw-review-card__row">
            <span class="aw-review-card__label">ID</span>
            <span class="aw-review-card__value">${state.agentId}</span>
          </div>
          ${tpl ? html`
            <div class="aw-review-card__row">
              <span class="aw-review-card__label">${t("wizard.review.creature")}</span>
              <span class="aw-review-card__value">${tpl.creature}</span>
            </div>
            <div class="aw-review-card__row">
              <span class="aw-review-card__label">${t("wizard.review.vibe")}</span>
              <span class="aw-review-card__value">${tpl.vibe}</span>
            </div>
          ` : nothing}
        </div>
      </div>

      <!-- SOUL.md -->
      <div class="aw-review-card">
        <div class="aw-review-card__header">
          <span class="aw-review-card__title">${t("wizard.review.soul")}</span>
          <button class="aw-review-card__edit" @click=${() => props.onGoToStep(2)}>${t("wizard.review.edit")}</button>
        </div>
        <div class="aw-review-card__body">
          <pre style="white-space: pre-wrap; margin: 0; font-size: 12px; color: var(--text);">${soulPreview}${state.soulMdDraft.split("\n").length > 3 ? "\n..." : ""}</pre>
        </div>
      </div>

      <!-- Capabilities -->
      <div class="aw-review-card">
        <div class="aw-review-card__header">
          <span class="aw-review-card__title">${t("wizard.review.capabilities")}</span>
          <button class="aw-review-card__edit" @click=${() => props.onGoToStep(3)}>${t("wizard.review.edit")}</button>
        </div>
        <div class="aw-review-card__body">
          <div class="aw-review-card__row">
            <span class="aw-review-card__label">${t("wizard.review.toolProfile")}</span>
            <span class="aw-review-card__value">${PROFILE_LABELS[state.toolProfile] || state.toolProfile}</span>
          </div>
          <div class="aw-review-card__row">
            <span class="aw-review-card__label">${t("wizard.review.model")}</span>
            <span class="aw-review-card__value">${state.modelPrimary || t("wizard.review.modelDefault")}</span>
          </div>
          ${state.envAnswers.trim() ? html`
            <div class="aw-review-card__row">
              <span class="aw-review-card__label">${t("wizard.review.env")}</span>
              <span class="aw-review-card__value">${state.envAnswers}</span>
            </div>
          ` : nothing}
        </div>
      </div>

      <!-- Channels -->
      ${Object.values(state.channelBindings).some((v) => v) ? html`
        <div class="aw-review-card">
          <div class="aw-review-card__header">
            <span class="aw-review-card__title">${t("wizard.review.channels")}</span>
            <button class="aw-review-card__edit" @click=${() => props.onGoToStep(4)}>${t("wizard.review.edit")}</button>
          </div>
          <div class="aw-review-card__body">
            ${Object.entries(state.channelBindings)
              .filter(([, v]) => v)
              .map(([k]) => html`<div style="padding: 2px 0;">\u2713 ${k}</div>`)}
          </div>
        </div>
      ` : nothing}

      <!-- Auto-generated files info -->
      <div class="aw-review-auto">
        ${t("wizard.review.autoFiles")}
      </div>
    </div>
  `;
}

/* ── Step 5 guide (left pane) ────────────────────────────── */

export function renderWizardStep5Guide(): TemplateResult {
  return html`
    <div class="aw-guide__text">${t("wizard.guide.step5")}</div>
  `;
}
