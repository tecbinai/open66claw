/**
 * agent-wizard-templates.ts
 * Step 1: Template definitions + template selection card grid + identity form
 */

import { html, nothing, type TemplateResult } from "lit";
import { t, type TranslationKey } from "../i18n/index.js";
import type { AgentWizardState } from "./agent-wizard.js";

/* ── Helper: dynamic key t() ── */
const dt = (key: string) => t(key as TranslationKey);

/* ── Template definitions ──────────────────────────────────── */

export type AgentTemplate = {
  id: string;
  emoji: string;
  labelKey: string;
  descKey: string;
  profile: "minimal" | "coding" | "messaging" | "full";
  defaultId: string;
  creature: string;
  vibe: string;
  soulHintKey: string;
  envQuestionKey: string;
};

export const AGENT_TEMPLATES: AgentTemplate[] = [
  {
    id: "coding",
    emoji: "\u{1F4BB}",
    labelKey: "wizard.tpl.coding",
    descKey: "wizard.tpl.codingDesc",
    profile: "coding",
    defaultId: "coding",
    creature: "\u4EE3\u7801\u7CBE\u7075",
    vibe: "\u4E13\u4E1A\u7B80\u6D01",
    soulHintKey: "wizard.soul.codingHint",
    envQuestionKey: "wizard.env.coding",
  },
  {
    id: "support",
    emoji: "\u{1F3A7}",
    labelKey: "wizard.tpl.support",
    descKey: "wizard.tpl.supportDesc",
    profile: "messaging",
    defaultId: "support",
    creature: "\u5BA2\u670D\u5929\u4F7F",
    vibe: "\u6E29\u548C\u8010\u5FC3",
    soulHintKey: "wizard.soul.supportHint",
    envQuestionKey: "wizard.env.support",
  },
  {
    id: "writer",
    emoji: "\u270D\uFE0F",
    labelKey: "wizard.tpl.writer",
    descKey: "wizard.tpl.writerDesc",
    profile: "minimal",
    defaultId: "writer",
    creature: "\u7075\u611F\u7F2A\u65AF",
    vibe: "\u6D3B\u6CFC\u521B\u610F",
    soulHintKey: "wizard.soul.writerHint",
    envQuestionKey: "wizard.env.writer",
  },
  {
    id: "researcher",
    emoji: "\u{1F50D}",
    labelKey: "wizard.tpl.researcher",
    descKey: "wizard.tpl.researcherDesc",
    profile: "full",
    defaultId: "researcher",
    creature: "\u77E5\u8BC6\u730E\u624B",
    vibe: "\u4E25\u8C28\u5BA2\u89C2",
    soulHintKey: "wizard.soul.researcherHint",
    envQuestionKey: "wizard.env.researcher",
  },
  {
    id: "translator",
    emoji: "\u{1F310}",
    labelKey: "wizard.tpl.translator",
    descKey: "wizard.tpl.translatorDesc",
    profile: "minimal",
    defaultId: "translator",
    creature: "\u8BED\u8A00\u6865\u6881",
    vibe: "\u7CBE\u51C6\u6D41\u7545",
    soulHintKey: "wizard.soul.translatorHint",
    envQuestionKey: "wizard.env.translator",
  },
  {
    id: "ops",
    emoji: "\u{1F527}",
    labelKey: "wizard.tpl.ops",
    descKey: "wizard.tpl.opsDesc",
    profile: "full",
    defaultId: "ops",
    creature: "\u7CFB\u7EDF\u5B88\u62A4\u8005",
    vibe: "\u7A33\u91CD\u9AD8\u6548",
    soulHintKey: "wizard.soul.opsHint",
    envQuestionKey: "wizard.env.ops",
  },
  {
    id: "assistant",
    emoji: "\u{1F3E0}",
    labelKey: "wizard.tpl.assistant",
    descKey: "wizard.tpl.assistantDesc",
    profile: "minimal",
    defaultId: "assistant",
    creature: "\u8D34\u5FC3\u7BA1\u5BB6",
    vibe: "\u4EB2\u5207\u968F\u548C",
    soulHintKey: "wizard.soul.assistantHint",
    envQuestionKey: "wizard.env.assistant",
  },
  {
    id: "custom",
    emoji: "\u{1F916}",
    labelKey: "wizard.tpl.custom",
    descKey: "wizard.tpl.customDesc",
    profile: "full",
    defaultId: "custom",
    creature: "AI\u52A9\u624B",
    vibe: "\u53CB\u597D",
    soulHintKey: "wizard.soul.customHint",
    envQuestionKey: "",
  },
];

/* ── Agent ID validation ──────────────────────────────────── */

const AGENT_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;

export function isAgentIdValid(id: string): boolean {
  return AGENT_ID_RE.test(id.trim());
}

/* ── Step 1 renderer ──────────────────────────────────────── */

export type Step1Props = {
  state: AgentWizardState;
  existingIds: Set<string>;
  onTemplateSelect: (tplId: string) => void;
  onAgentIdChange: (id: string) => void;
  onAgentNameChange: (name: string) => void;
  onAgentEmojiChange: (emoji: string) => void;
};

export function renderWizardStep1(props: Step1Props): TemplateResult {
  const { state, existingIds } = props;
  const idTrimmed = state.agentId.trim();
  const idValid = idTrimmed.length === 0 || isAgentIdValid(idTrimmed);
  const idDuplicate = existingIds.has(idTrimmed);

  return html`
    <div class="aw-templates">
      ${AGENT_TEMPLATES.map(
        (tpl) => html`
          <button
            class="aw-template-card ${state.templateId === tpl.id ? "aw-template-card--selected" : ""}"
            @click=${() => props.onTemplateSelect(tpl.id)}
          >
            <span class="aw-template-card__emoji">${tpl.emoji}</span>
            <div class="aw-template-card__info">
              <div class="aw-template-card__name">${dt(tpl.labelKey)}</div>
              <div class="aw-template-card__desc">${dt(tpl.descKey)}</div>
            </div>
          </button>
        `,
      )}
    </div>

    ${
      state.templateId
        ? html`
        <div class="aw-identity">
          <div class="aw-field__row">
            <div class="aw-field">
              <label class="aw-field__label">${t("wizard.identity.name")}</label>
              <input
                class="aw-field__input"
                type="text"
                .value=${state.agentName}
                placeholder=${t("wizard.identity.namePh")}
                @input=${(e: Event) => props.onAgentNameChange((e.target as HTMLInputElement).value)}
              />
            </div>
            <div class="aw-field aw-field--emoji">
              <label class="aw-field__label">Emoji</label>
              <input
                class="aw-field__input"
                type="text"
                .value=${state.agentEmoji}
                placeholder="\u{1F916}"
                style="text-align: center; font-size: 18px;"
                @input=${(e: Event) => props.onAgentEmojiChange((e.target as HTMLInputElement).value)}
              />
            </div>
          </div>
          <div class="aw-field">
            <label class="aw-field__label">${t("wizard.identity.id")}</label>
            <input
              class="aw-field__input"
              type="text"
              .value=${state.agentId}
              placeholder=${t("wizard.identity.idPh")}
              @input=${(e: Event) => props.onAgentIdChange((e.target as HTMLInputElement).value)}
            />
            ${!idValid ? html`<div class="aw-field__hint">${t("wizard.identity.idHint")}</div>` : nothing}
            ${idDuplicate ? html`<div class="aw-field__hint">${t("wizard.identity.idDup")}</div>` : nothing}
          </div>
        </div>
      `
        : nothing
    }
  `;
}

/* ── Step 1 guide (left pane) ────────────────────────────── */

export function renderWizardStep1Guide(): TemplateResult {
  return html`
    <div class="aw-guide__text">${t("wizard.guide.step1")}</div>
    <div class="aw-guide__hint">${t("wizard.guide.step1Hint")}</div>
  `;
}
