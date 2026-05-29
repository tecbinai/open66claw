/**
 * agent-wizard.ts
 * Main wizard orchestrator: step router, layout, navigation
 */

import { html, nothing, type TemplateResult } from "lit";
import { t, type TranslationKey } from "../i18n/index.js";
import type { ChannelsStatusSnapshot } from "../types.js";

/* ── Helper: dynamic key t() ── */
const dt = (key: string) => t(key as TranslationKey);
import {
  AGENT_TEMPLATES,
  isAgentIdValid,
  renderWizardStep1,
  renderWizardStep1Guide,
} from "./agent-wizard-templates.js";

// Re-export for external consumers
export { AGENT_TEMPLATES };
import { renderWizardStep5, renderWizardStep5Guide } from "./agent-wizard-review.js";

/* ── Types ───────────────────────────────────────────────── */

export type AgentWizardStep = 1 | 2 | 3 | 4 | 5;

export type AgentWizardState = {
  open: boolean;
  step: AgentWizardStep;
  // Step 1: Template + Identity
  templateId: string | null;
  agentId: string;
  agentName: string;
  agentEmoji: string;
  // Step 2: SOUL.md
  userDescription: string;
  soulMdDraft: string;
  soulGenerating: boolean;
  soulGenerated: boolean;
  soulError: string | null;
  /** Internal: sessionKey used for AI soul generation streaming */
  _soulSessionKey: string;
  // Step 3: Tools + Model + Env
  toolProfile: string;
  modelPrimary: string | null;
  modelFallbacks: string[];
  envAnswers: string;
  // Step 4: Channels
  channelBindings: Record<string, boolean>;
  skipChannels: boolean;
  // Step 5: Create
  creating: boolean;
  createError: string | null;
};

export function createWizardInitialState(): AgentWizardState {
  return {
    open: false,
    step: 1,
    templateId: null,
    agentId: "",
    agentName: "",
    agentEmoji: "",
    userDescription: "",
    soulMdDraft: "",
    soulGenerating: false,
    soulGenerated: false,
    soulError: null,
    _soulSessionKey: "",
    toolProfile: "full",
    modelPrimary: null,
    modelFallbacks: [],
    envAnswers: "",
    channelBindings: {},
    skipChannels: false,
    creating: false,
    createError: null,
  };
}

/* ── Props ───────────────────────────────────────────────── */

export type AgentWizardProps = {
  state: AgentWizardState;
  existingAgentIds: string[];
  channelsSnapshot: ChannelsStatusSnapshot | null;
  modelOptions: Array<{ value: string; label: string }>;
  connected: boolean;
  // Navigation
  onClose: () => void;
  onStepChange: (step: AgentWizardStep) => void;
  // Step 1
  onTemplateSelect: (tplId: string) => void;
  onAgentIdChange: (id: string) => void;
  onAgentNameChange: (name: string) => void;
  onAgentEmojiChange: (emoji: string) => void;
  // Step 2
  onUserDescriptionChange: (desc: string) => void;
  onGenerateSoul: () => void;
  onSoulDraftChange: (content: string) => void;
  // Step 3
  onToolProfileChange: (profile: string) => void;
  onModelChange: (modelId: string | null) => void;
  onEnvAnswersChange: (answers: string) => void;
  // Step 4
  onChannelToggle: (key: string, bound: boolean) => void;
  onSkipChannels: () => void;
  // Step 5
  onCreateAgent: () => Promise<void>;
};

/* ── Step validation ─────────────────────────────────────── */

function canProceedFromStep(state: AgentWizardState, step: AgentWizardStep, existingIds: Set<string>): boolean {
  switch (step) {
    case 1:
      return (
        state.templateId !== null &&
        state.agentId.trim().length > 0 &&
        isAgentIdValid(state.agentId.trim()) &&
        !existingIds.has(state.agentId.trim()) &&
        state.agentName.trim().length > 0
      );
    case 2:
      return true; // SOUL is optional
    case 3:
      return state.toolProfile.length > 0;
    case 4:
      return true; // Channels are optional
    case 5:
      return !state.creating;
    default:
      return false;
  }
}

/* ── Step titles ─────────────────────────────────────────── */

const STEP_TITLE_KEYS: Record<AgentWizardStep, string> = {
  1: "wizard.stepTitle.1",
  2: "wizard.stepTitle.2",
  3: "wizard.stepTitle.3",
  4: "wizard.stepTitle.4",
  5: "wizard.stepTitle.5",
};

/* ── Placeholder renderers for steps 2-4 (will be replaced) */

function renderWizardStep2(props: AgentWizardProps): TemplateResult {
  const { state } = props;
  const tpl = AGENT_TEMPLATES.find((t) => t.id === state.templateId);
  const placeholder = tpl ? dt(tpl.soulHintKey) : t("wizard.soul.customHint");

  return html`
    <div class="aw-field">
      <label class="aw-field__label">${t("wizard.soul.descLabel")}</label>
      <textarea
        class="aw-field__input aw-soul-desc"
        rows="4"
        placeholder=${placeholder}
        .value=${state.userDescription}
        @input=${(e: Event) => props.onUserDescriptionChange((e.target as HTMLTextAreaElement).value)}
      ></textarea>
    </div>

    <button
      class="aw-soul-generate-btn"
      ?disabled=${state.soulGenerating || !state.userDescription.trim()}
      @click=${() => props.onGenerateSoul()}
    >
      ${state.soulGenerating ? t("wizard.soul.generating") : t("wizard.soul.generateBtn")}
    </button>

    ${state.soulError ? html`<div class="callout danger" style="font-size: 13px;">${state.soulError}</div>` : nothing}

    ${state.soulMdDraft || state.soulGenerated ? html`
      <div class="aw-field">
        <label class="aw-field__label">${t("wizard.soul.previewLabel")}</label>
        <textarea
          class="aw-field__input aw-soul-preview"
          rows="8"
          .value=${state.soulMdDraft}
          @input=${(e: Event) => props.onSoulDraftChange((e.target as HTMLTextAreaElement).value)}
        ></textarea>
      </div>
      ${state.soulGenerated && !state.soulGenerating ? html`
        <div class="aw-soul-actions">
          <span class="aw-soul-success">${t("wizard.soul.done")}</span>
          <button class="aw-soul-regen" @click=${() => props.onGenerateSoul()}>${t("wizard.soul.regen")}</button>
        </div>
      ` : nothing}
    ` : nothing}
  `;
}

function renderWizardStep2Guide(): TemplateResult {
  return html`
    <div class="aw-guide__text">${t("wizard.guide.step2")}</div>
    <div class="aw-guide__hint">${t("wizard.guide.step2Hint")}</div>
  `;
}

function renderWizardStep3(props: AgentWizardProps): TemplateResult {
  const { state } = props;
  const tpl = AGENT_TEMPLATES.find((t) => t.id === state.templateId);
  const profiles = [
    { id: "minimal", icon: "\u{1F4D6}", nameKey: "wizard.profile.minimal", descKey: "wizard.profile.minimalDesc" },
    { id: "coding", icon: "\u{1F4BB}", nameKey: "wizard.profile.coding", descKey: "wizard.profile.codingDesc" },
    { id: "messaging", icon: "\u{1F4AC}", nameKey: "wizard.profile.messaging", descKey: "wizard.profile.messagingDesc" },
    { id: "full", icon: "\u26A1", nameKey: "wizard.profile.full", descKey: "wizard.profile.fullDesc" },
  ];

  return html`
    <div class="aw-field">
      <label class="aw-field__label">${t("wizard.config.toolTitle")}</label>
    </div>
    <div class="aw-profiles">
      ${profiles.map(
        (p) => html`
          <button
            class="aw-profile-card ${state.toolProfile === p.id ? "aw-profile-card--selected" : ""}"
            @click=${() => props.onToolProfileChange(p.id)}
          >
            <div class="aw-profile-card__head">
              <span class="aw-profile-card__icon">${p.icon}</span>
              <span class="aw-profile-card__name">${dt(p.nameKey)}</span>
            </div>
            <div class="aw-profile-card__desc">${dt(p.descKey)}</div>
          </button>
        `,
      )}
    </div>

    <div class="aw-field" style="margin-top: 8px;">
      <label class="aw-field__label">${t("wizard.config.modelTitle")}</label>
      <select
        class="aw-field__input"
        @change=${(e: Event) => {
          const val = (e.target as HTMLSelectElement).value;
          props.onModelChange(val || null);
        }}
      >
        <option value="">${t("wizard.config.modelDefault")}</option>
        ${props.modelOptions.map(
          (opt) => html`<option value=${opt.value} ?selected=${state.modelPrimary === opt.value}>${opt.label}</option>`,
        )}
      </select>
    </div>

    ${tpl && tpl.envQuestionKey ? html`
      <div class="aw-env-section">
        <div class="aw-env-section__title">${t("wizard.config.envTitle")}</div>
        <div class="aw-field">
          <label class="aw-field__label">${dt(tpl.envQuestionKey)}</label>
          <input
            class="aw-field__input"
            type="text"
            .value=${state.envAnswers}
            placeholder=${t("wizard.config.envPlaceholder")}
            @input=${(e: Event) => props.onEnvAnswersChange((e.target as HTMLInputElement).value)}
          />
        </div>
      </div>
    ` : nothing}
  `;
}

function renderWizardStep3Guide(): TemplateResult {
  return html`
    <div class="aw-guide__text">${t("wizard.guide.step3")}</div>
    <div class="aw-guide__hint">${t("wizard.guide.step3Hint")}</div>
  `;
}

function renderWizardStep4(props: AgentWizardProps): TemplateResult {
  const { state } = props;
  const snapshot = props.channelsSnapshot;
  const channelOrder = snapshot?.channelOrder ?? [];
  const channelLabels = snapshot?.channelLabels ?? {};
  const channelAccounts = snapshot?.channelAccounts ?? {};

  // Collect configured channel:account pairs
  const configuredPairs: Array<{ channelId: string; label: string; accountId: string }> = [];
  for (const chId of channelOrder) {
    const accounts = channelAccounts[chId] ?? [];
    for (const acc of accounts) {
      if (acc.configured) {
        configuredPairs.push({ channelId: chId, label: channelLabels[chId] ?? chId, accountId: acc.accountId });
      }
    }
  }

  return html`
    <button class="aw-skip-btn" @click=${() => props.onSkipChannels()}>
      ${t("wizard.channels.skip")}
    </button>

    ${configuredPairs.length === 0 ? html`
      <div class="callout info" style="margin-top: 12px; font-size: 13px;">
        ${t("wizard.channels.none")}
      </div>
    ` : html`
      <div class="aw-channels" style="margin-top: 12px;">
        ${configuredPairs.map((pair) => {
          const key = `${pair.channelId}:${pair.accountId}`;
          return html`
            <label class="aw-channel-row">
              <div class="aw-channel-row__info">
                <span>${pair.label}</span>
                <span class="aw-channel-row__account">${pair.accountId}</span>
              </div>
              <input
                type="checkbox"
                ?checked=${state.channelBindings[key] ?? false}
                @change=${(e: Event) =>
                  props.onChannelToggle(key, (e.target as HTMLInputElement).checked)}
              />
            </label>
          `;
        })}
      </div>
    `}
  `;
}

function renderWizardStep4Guide(): TemplateResult {
  return html`
    <div class="aw-guide__text">${t("wizard.guide.step4")}</div>
    <div class="aw-guide__hint">${t("wizard.guide.step4Hint")}</div>
  `;
}

/* ── Main wizard renderer ────────────────────────────────── */

export function renderAgentWizard(props: AgentWizardProps): TemplateResult | typeof nothing {
  if (!props.state.open) return nothing;

  const { state } = props;
  const existingIds = new Set(props.existingAgentIds);
  const canNext = canProceedFromStep(state, state.step, existingIds);
  const isLastStep = state.step === 5;

  // Route steps
  let formContent: TemplateResult;
  let guideContent: TemplateResult;

  switch (state.step) {
    case 1:
      formContent = renderWizardStep1({
        state,
        existingIds,
        onTemplateSelect: props.onTemplateSelect,
        onAgentIdChange: props.onAgentIdChange,
        onAgentNameChange: props.onAgentNameChange,
        onAgentEmojiChange: props.onAgentEmojiChange,
      });
      guideContent = renderWizardStep1Guide();
      break;
    case 2:
      formContent = renderWizardStep2(props);
      guideContent = renderWizardStep2Guide();
      break;
    case 3:
      formContent = renderWizardStep3(props);
      guideContent = renderWizardStep3Guide();
      break;
    case 4:
      formContent = renderWizardStep4(props);
      guideContent = renderWizardStep4Guide();
      break;
    case 5:
      formContent = renderWizardStep5({ state, onGoToStep: props.onStepChange });
      guideContent = renderWizardStep5Guide();
      break;
    default:
      formContent = html``;
      guideContent = html``;
  }

  return html`
    <div class="aw-overlay" @click=${(e: Event) => { if (e.target === e.currentTarget) props.onClose(); }}>
      <div class="aw-modal" role="dialog">
        <!-- Header -->
        <div class="aw-header">
          <div class="aw-header__left">
            <span class="aw-header__title">${t("wizard.title")}</span>
            <span class="aw-header__step">${dt(STEP_TITLE_KEYS[state.step])} (${state.step}/5)</span>
          </div>
          <button class="aw-header__close" @click=${props.onClose}>\u2715</button>
        </div>

        <!-- Body -->
        <div class="aw-body">
          <div class="aw-guide">
            ${guideContent}
            <div class="aw-steps">
              ${([1, 2, 3, 4, 5] as const).map(
                (s) => html`<div class="aw-steps__dot ${
                  s === state.step ? "aw-steps__dot--active" : s < state.step ? "aw-steps__dot--done" : ""
                }"></div>`,
              )}
            </div>
          </div>
          <div class="aw-form">
            ${formContent}
            ${state.createError ? html`<div class="callout danger" style="font-size: 13px;">${state.createError}</div>` : nothing}
          </div>
        </div>

        <!-- Footer -->
        <div class="aw-footer">
          ${state.step > 1 ? html`
            <button class="aw-footer__btn aw-footer__btn--back" @click=${() => props.onStepChange((state.step - 1) as AgentWizardStep)}>
              ${t("wizard.back")}
            </button>
          ` : nothing}
          ${isLastStep ? html`
            <button
              class="aw-footer__btn aw-footer__btn--create"
              ?disabled=${state.creating}
              @click=${() => props.onCreateAgent()}
            >
              ${state.creating ? t("wizard.creating") : t("wizard.createBtn")}
            </button>
          ` : html`
            <button
              class="aw-footer__btn aw-footer__btn--next"
              ?disabled=${!canNext}
              @click=${() => props.onStepChange((state.step + 1) as AgentWizardStep)}
            >
              ${t("wizard.next")}
            </button>
          `}
        </div>
      </div>
    </div>
  `;
}
