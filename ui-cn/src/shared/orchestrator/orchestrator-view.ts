/**
 * Orchestrator Main View
 *
 * Renders the orchestrator UI based on the current state.
 * Assembles all sub-components (welcome, thread, compose, etc.)
 */

import { html, nothing, type TemplateResult } from "lit";
import type {
  CommunityTemplate,
  DeployReportAgent,
  DeployReportSummary,
  OrchestratorState,
  ProposingStep,
  TeamProposal,
} from "./orchestrator-state.js";
import type { SceneTemplate } from "./types.js";

// ── Tooltip Icon ────────────────────────────────────────────────────────

const infoIcon = html`
  <span class="orch-info-icon" title="">ⓘ</span>
`;

// ── Handler Types ────────────────────────────────────────────────────────

export type OrchestratorHandlers = {
  onClose: () => void;
  onSend: () => void;
  onInput: (e: Event) => void;
  onKeydown: (e: KeyboardEvent) => void;
  onTemplateClick: (templateId: string) => void;
  onExampleClick: (text: string) => void;
  onActionClick: (action: string, data?: unknown) => void;
  onAnswerQuestion: (questionIndex: number, answer: string) => void;
  onDeployProposal: (planId: string) => void;
  onPreviewDeploy?: (templateId: string) => void;
};

// ── SVG Icons ────────────────────────────────────────────────────────────

const arrowIcon = html`
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <line x1="5" y1="12" x2="19" y2="12"></line>
    <polyline points="12 5 19 12 12 19"></polyline>
  </svg>
`;

const checkIcon = html`
  <svg
    width="28"
    height="28"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2.5"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <polyline points="20 6 9 17 4 12"></polyline>
  </svg>
`;

const backArrow = html`
  &larr;
`;

// ── Main Render ──────────────────────────────────────────────────────────

export function renderOrchestrator(
  state: OrchestratorState,
  handlers: OrchestratorHandlers,
  t: (key: string, params?: Record<string, string | number>) => string,
): TemplateResult {
  return html`
    <div class="orch-container">
      ${renderHeader(handlers, t)}
      <div class="orch-thread">
        ${state.phase === "welcome" ? renderWelcome(state, handlers, t) : nothing}
        ${state.messages.length > 0 ? renderMessages(state, handlers, t) : nothing}
        ${
          state.phase === "gathering" && state.gatheringQuestions.length > 0
            ? renderGatheringQuestions(state, handlers, t)
            : nothing
        }
        ${
          state.phase === "proposed" && state.proposal
            ? renderTeamProposal(state.proposal, handlers, t)
            : nothing
        }
        ${
          state.phase === "previewing" && state.previewTemplate
            ? renderTemplatePreview(state.previewTemplate, handlers, t)
            : nothing
        }
        ${state.phase === "deploying" ? renderDeployProgress(state, handlers, t) : nothing}
        ${state.phase === "success" ? renderSuccess(state, handlers, t) : nothing}
        ${state.phase === "error" ? renderError(state, handlers, t) : nothing}
        ${
          state.phase === "proposing" || state.phase === "refining"
            ? state.proposingSteps.length > 0
              ? renderProposingSteps(state.proposingSteps, t)
              : renderThinking(t)
            : nothing
        }
      </div>
      ${renderCompose(state, handlers, t)}
    </div>
  `;
}

// ── Header ───────────────────────────────────────────────────────────────

function renderHeader(handlers: OrchestratorHandlers, t: (key: string) => string): TemplateResult {
  return html`
    <div class="orch-header">
      <button class="orch-header-back" @click=${handlers.onClose}>
        ${backArrow} ${t("orch.back")}
      </button>
      <span class="orch-header-title">${t("orch.headerTitle")}</span>
      <span></span>
    </div>
  `;
}

// ── Welcome ──────────────────────────────────────────────────────────────

function renderWelcome(
  state: OrchestratorState,
  handlers: OrchestratorHandlers,
  t: (key: string, params?: Record<string, string | number>) => string,
): TemplateResult {
  const examples = [
    "帮我做一个每天总结行业新闻的团队",
    "我开淘宝店，需要AI帮我处理售前咨询",
    "我想要一个帮我管理微信社群的助手",
  ];

  return html`
    <div class="orch-welcome">
      <div class="orch-welcome-title">${t("orch.welcomeTitle")}</div>
      <div class="orch-welcome-sub">${t("orch.welcomeSub")}</div>

      ${
        state.hasProvider === false
          ? html`
        <div class="orch-provider-warn">
          <div class="orch-provider-warn-icon">⚠️</div>
          <div class="orch-provider-warn-body">
            <div class="orch-provider-warn-title">${t("orch.noProviderTitle")}</div>
            <div class="orch-provider-warn-desc">${t("orch.noProviderDesc")}</div>
            <button class="btn btn--sm primary" @click=${() => handlers.onActionClick("goto-model-config")}>
              ${t("orch.noProviderAction")}
            </button>
          </div>
        </div>
      `
          : nothing
      }

      ${
        state.templates.length > 0
          ? html`
        <div class="orch-section">
          <div class="orch-section-title">${t("orch.sectionTemplates")}</div>
          <div class="orch-tpl-grid">
            ${state.templates.map(
              (tpl, i) => html`
              <div class="orch-tpl orch-tpl--${i % 9}">
                <div class="orch-tpl-name">${tpl.name}</div>
                <div class="orch-tpl-desc">${tpl.description}</div>
                ${
                  (tpl as Record<string, unknown>).highlights
                    ? html`
                  <ul class="orch-tpl-highlights">
                    ${((tpl as Record<string, unknown>).highlights as string[]).map(
                      (h) => html`
                      <li class="orch-tpl-highlight">${h}</li>
                    `,
                    )}
                  </ul>
                `
                    : nothing
                }
                <div class="orch-tpl-meta">
                  <span class="orch-tpl-count">
                    ${t("orch.templateCount", { count: tpl.agents.length })}
                  </span>
                </div>
                <button
                  class="btn btn--sm primary orch-tpl-action"
                  ?disabled=${state.phase === "deploying"}
                  @click=${() => handlers.onTemplateClick(tpl.id)}
                >
                  ${t("orch.templateCreate")}
                </button>
              </div>
            `,
            )}
          </div>
        </div>
      `
          : nothing
      }

      ${renderCommunitySection(state, handlers, t)}

      <div class="orch-section">
        <div class="orch-section-title">${t("orch.sectionCustom")}</div>
        <div class="orch-examples">
          ${examples.map(
            (ex) => html`
            <button class="orch-example" @click=${() => handlers.onExampleClick(ex)}>
              ${ex}
            </button>
          `,
          )}
        </div>
      </div>
    </div>
  `;
}

// ── Community Templates Section ──────────────────────────────────────

function renderCommunitySection(
  state: OrchestratorState,
  handlers: OrchestratorHandlers,
  t: (key: string, params?: Record<string, string | number>) => string,
): TemplateResult | typeof nothing {
  // Show loading skeleton while fetching
  if (state.communityLoading) {
    return html`
      <div class="orch-section">
        <div class="orch-section-title">${t("orch.communitySectionTitle")}</div>
        <div class="orch-community-grid">
          ${[0, 1, 2].map(
            () => html`
              <div class="orch-community-card orch-community-card--skeleton">
                <div class="orch-skel orch-skel--title"></div>
                <div class="orch-skel orch-skel--text"></div>
                <div class="orch-skel orch-skel--text orch-skel--short"></div>
                <div class="orch-skel orch-skel--btn"></div>
              </div>
            `,
          )}
        </div>
      </div>
    `;
  }

  // Don't show section if empty and no error
  if (state.communityTemplates.length === 0 && !state.communityError) {
    return nothing;
  }

  // Show error with retry
  if (state.communityError) {
    return html`
      <div class="orch-section">
        <div class="orch-section-title">${t("orch.communitySectionTitle")}</div>
        <div class="orch-community-error">
          <span>${t("orch.communityLoadError")}</span>
          <button class="btn btn--sm" @click=${() => handlers.onActionClick("reload-community")}>
            ${t("orch.communityRetry")}
          </button>
        </div>
      </div>
    `;
  }

  return html`
    <div class="orch-section">
      <div class="orch-section-title">${t("orch.communitySectionTitle")}</div>
      <div class="orch-community-grid">
        ${state.communityTemplates.map((tpl, i) => renderCommunityCard(tpl, i, handlers, t))}
      </div>
    </div>
  `;
}

function renderCommunityCard(
  tpl: CommunityTemplate,
  index: number,
  handlers: OrchestratorHandlers,
  t: (key: string, params?: Record<string, string | number>) => string,
): TemplateResult {
  return html`
    <div class="orch-community-card" style="animation-delay: ${index * 0.06}s">
      <div class="orch-community-card-top">
        <div class="orch-community-card-name">${tpl.name}</div>
        ${
          tpl.author
            ? html`
          <span class="orch-community-card-author">${tpl.author}</span>
        `
            : nothing
        }
      </div>
      <div class="orch-community-card-desc">${tpl.description}</div>
      ${
        tpl.highlights?.length
          ? html`
        <ul class="orch-tpl-highlights">
          ${tpl.highlights.map(
            (h) => html`
            <li class="orch-tpl-highlight">${h}</li>
          `,
          )}
        </ul>
      `
          : nothing
      }
      <div class="orch-community-card-footer">
        <span class="orch-community-card-meta">
          ${t("orch.templateCount", { count: tpl.agents.length })}
          ${
            tpl.downloads != null
              ? html`
            <span class="orch-community-card-dl">${tpl.downloads} ${t("orch.communityDownloads")}</span>
          `
              : nothing
          }
        </span>
        <button
          class="btn btn--sm primary orch-tpl-action"
          @click=${() => handlers.onActionClick("deploy-community", tpl.id)}
        >
          ${t("orch.templateCreate")}
        </button>
      </div>
    </div>
  `;
}

// ── Messages ─────────────────────────────────────────────────────────────

function renderMessages(
  state: OrchestratorState,
  handlers: OrchestratorHandlers,
  t: (key: string, params?: Record<string, string | number>) => string,
): TemplateResult {
  return html`
    ${state.messages.map(
      (msg) => html`
      <div class="orch-msg--${msg.role}">
        <div class="orch-msg-content">${msg.content}</div>
        ${msg.widget === "proposal" ? renderProposalWidget(msg.widgetData, handlers, t) : nothing}
        ${msg.widget === "questions" ? renderQuestionsWidget(msg.widgetData, handlers) : nothing}
        ${msg.widget === "soul-preview" ? renderSoulPreviewWidget(msg.widgetData, handlers, t) : nothing}
      </div>
    `,
    )}
  `;
}

// ── Proposal Widget ─────────────────────────────────────────────────────

type ProposalData = {
  teamName: string;
  agents: Array<{ id: string; name: string; role: string }>;
  costEstimate?: string;
  planId?: string;
};

function renderProposalWidget(
  data: unknown,
  handlers: OrchestratorHandlers,
  t: (key: string, params?: Record<string, string | number>) => string,
): TemplateResult {
  const proposal = data as ProposalData | undefined;
  if (!proposal) return html``;

  return html`
    <div class="orch-proposal">
      <div class="orch-proposal-head">
        <span class="orch-proposal-name">${proposal.teamName}</span>
        <span class="orch-proposal-badge">
          ${t("orch.templateCount", { count: proposal.agents.length })}
        </span>
      </div>
      <div class="orch-proposal-divider"></div>
      <div class="orch-proposal-list">
        ${proposal.agents.map(
          (agent, i) => html`
          <div class="orch-agent-row">
            <div class="orch-avatar orch-avatar--${i % 6}">${(agent.name || "?").charAt(0)}</div>
            <div class="orch-agent-body">
              <div class="orch-agent-name">${agent.name || "?"}</div>
              <div class="orch-agent-desc">${agent.role}</div>
            </div>
          </div>
        `,
        )}
      </div>
      ${
        proposal.costEstimate
          ? html`
        <div class="orch-proposal-footer">
          <span class="orch-proposal-cost">${proposal.costEstimate}</span>
        </div>
      `
          : nothing
      }
      <div class="orch-actions" style="padding: 0 22px 20px;">
        <button class="btn primary" @click=${() => handlers.onActionClick("approve-proposal", proposal.planId)}>
          ${t("orch.templateDeploy")}
        </button>
        <button class="btn" @click=${() => handlers.onActionClick("adjust-proposal", proposal.planId)}>
          ${t("orch.back")}
        </button>
      </div>
    </div>
  `;
}

// ── Questions Widget ────────────────────────────────────────────────────

type QuestionData = {
  questions: Array<{
    text: string;
    options?: string[];
  }>;
};

function renderQuestionsWidget(data: unknown, handlers: OrchestratorHandlers): TemplateResult {
  const qData = data as QuestionData | undefined;
  if (!qData?.questions?.length) return html``;

  return html`
    ${qData.questions.map(
      (q, i) => html`
      <div class="orch-question">
        <div class="orch-question-num">${i + 1}</div>
        <div class="orch-question-text">${q.text}</div>
        ${
          q.options
            ? html`
          <div class="orch-options">
            ${q.options.map(
              (opt) => html`
              <button
                class="orch-chip"
                @click=${() => handlers.onActionClick("answer-question", { index: i, answer: opt })}
              >${opt}</button>
            `,
            )}
          </div>
        `
            : nothing
        }
      </div>
    `,
    )}
  `;
}

// ── SOUL Preview Widget ─────────────────────────────────────────────────

type SoulPreviewData = {
  agents: Array<{
    id: string;
    name: string;
    soulContent: string;
  }>;
};

function renderSoulPreviewWidget(
  data: unknown,
  handlers: OrchestratorHandlers,
  t: (key: string) => string,
): TemplateResult {
  const soulData = data as SoulPreviewData | undefined;
  if (!soulData?.agents?.length) return html``;

  return html`
    ${soulData.agents.map(
      (agent, i) => html`
      <div class="orch-soul">
        <div class="orch-soul-head" @click=${(e: Event) => {
          const body = (e.currentTarget as HTMLElement).nextElementSibling;
          body?.classList.toggle("collapsed");
        }}>
          <div class="orch-soul-head-left">
            <div class="orch-avatar orch-avatar--${i % 6}" style="width:28px;height:28px;font-size:13px;">
              ${(agent.name || "?").charAt(0)}
            </div>
            <span class="orch-soul-head-name">${agent.name || "?"}</span>
          </div>
          <span class="orch-soul-toggle">${t("orch.soulToggle")}</span>
        </div>
        <div class="orch-soul-body collapsed">
          <div class="orch-soul-content">${agent.soulContent}</div>
          <div class="orch-soul-actions">
            <button class="btn btn--sm" @click=${() => handlers.onActionClick("edit-soul", agent.id)}>
              ${t("orch.soulEdit")}
            </button>
          </div>
        </div>
      </div>
    `,
    )}
    <div class="orch-actions" style="margin-top: 16px;">
      <button class="btn primary" @click=${() => handlers.onActionClick("confirm-souls")}>
        ${t("orch.templateDeploy")}
      </button>
    </div>
  `;
}

// ── Gathering Questions ──────────────────────────────────────────────────

function renderGatheringQuestions(
  state: OrchestratorState,
  handlers: OrchestratorHandlers,
  t: (key: string) => string,
): TemplateResult {
  const questions = state.gatheringQuestions;
  const allAnswered = questions.every((q) => q.answer);

  return html`
    <div class="orch-gathering">
      <div class="orch-gathering-title">${t("orch.gatheringTitle")}</div>
      <div class="orch-gathering-sub">${t("orch.gatheringSub")}</div>
      <div class="orch-gathering-list">
        ${questions.map(
          (q, i) => html`
          <div class="orch-gq ${q.answer ? "orch-gq--answered" : ""}">
            <div class="orch-gq-num">${i + 1}</div>
            <div class="orch-gq-body">
              <div class="orch-gq-text">${q.text}</div>
              <div class="orch-gq-options">
                ${q.options.map(
                  (opt) => html`
                  <button
                    class="orch-gq-chip ${q.answer === opt ? "selected" : ""}"
                    @click=${() => handlers.onAnswerQuestion(i, opt)}
                  >${opt}</button>
                `,
                )}
              </div>
            </div>
          </div>
        `,
        )}
      </div>
      ${
        allAnswered
          ? html`
        <div class="orch-gathering-confirm">
          <button class="btn primary" @click=${() => handlers.onActionClick("submit-answers")}>
            ${t("orch.gatheringConfirm")}
          </button>
        </div>
      `
          : nothing
      }
    </div>
  `;
}

// ── Team Proposal (Preview) ─────────────────────────────────────────────

function renderTeamProposal(
  proposal: TeamProposal,
  handlers: OrchestratorHandlers,
  t: (key: string, params?: Record<string, string | number>) => string,
): TemplateResult {
  return html`
    <div class="orch-preview">
      <div class="orch-preview-header">
        <div class="orch-preview-title">${proposal.teamName}</div>
        <div class="orch-preview-desc">${proposal.teamDescription}</div>
        ${
          proposal.coverageScore != null || proposal.feasibilityScore != null
            ? html`
          <div class="orch-preview-scores">
            ${
              proposal.coverageScore != null
                ? html`
              <span class="orch-score-badge">${t("orch.coverageScore")}: ${proposal.coverageScore}%</span>
            `
                : nothing
            }
            ${
              proposal.feasibilityScore != null
                ? html`
              <span class="orch-score-badge">${t("orch.feasibilityScore")}: ${proposal.feasibilityScore}%</span>
            `
                : nothing
            }
          </div>
        `
            : nothing
        }
      </div>

      <div class="orch-preview-agents">
        ${proposal.agents.map(
          (agent, i) => html`
          <div class="orch-preview-agent orch-ability-card">
            <div class="orch-preview-agent-top">
              <div class="orch-avatar orch-avatar--${i % 6}" style="width:36px;height:36px;font-size:14px;">
                ${agent.emoji ?? (agent.name || "?").charAt(0)}
              </div>
              <div class="orch-preview-agent-info">
                <div class="orch-preview-agent-name">${agent.name || "?"}</div>
                <div class="orch-preview-agent-role">${agent.role}</div>
              </div>
            </div>

            ${
              agent.abilities?.length
                ? html`
              <div class="orch-ability-section">
                <div class="orch-ability-label">${t("orch.abilitiesLabel")}</div>
                <div class="orch-ability-list">
                  ${agent.abilities.map((a) => html`<span class="orch-ability-item">${a}</span>`)}
                </div>
              </div>
            `
                : nothing
            }

            ${
              agent.skills?.length
                ? html`
              <div class="orch-ability-section">
                <div class="orch-ability-label">
                  ${t("orch.skillsLabel")}
                  <span class="orch-info-tip" title="${t("orch.helpSkills")}">${infoIcon}</span>
                </div>
                <div class="orch-skill-list">
                  ${agent.skills.map(
                    (skill) => html`
                    <span class="orch-skill-chip">${skill}</span>
                  `,
                  )}
                </div>
              </div>
            `
                : nothing
            }

            <div class="orch-preview-agent-tags">
              <span class="orch-preview-tag orch-preview-tag--tier">${
                agent.modelName ??
                (agent.modelTier === "sota"
                  ? t("orch.tierSota")
                  : agent.modelTier === "mid"
                    ? t("orch.tierMid")
                    : t("orch.tierCheap"))
              }</span>
              ${agent.tools.slice(0, 3).map(
                (tool) => html`
                <span class="orch-preview-tag">${formatToolName(tool)}</span>
              `,
              )}
            </div>
          </div>
        `,
        )}
      </div>

      <div class="orch-supervisor-note">
        <span class="orch-supervisor-icon">👑</span>
        <div class="orch-supervisor-body">
          <div class="orch-supervisor-title">Supervisor
            <span class="orch-info-tip" title="${t("orch.helpSupervisor")}">${infoIcon}</span>
          </div>
          <div class="orch-supervisor-desc">${t("orch.supervisorDesc")}</div>
        </div>
      </div>

      ${
        proposal.costEstimate
          ? html`
        <div class="orch-preview-cost">${proposal.costEstimate}</div>
      `
          : nothing
      }

      <div class="orch-preview-actions">
        <button class="btn primary" @click=${() => handlers.onDeployProposal(proposal.planId)}>
          ${t("orch.deployNow")}
        </button>
        <button class="btn" @click=${() => handlers.onActionClick("adjust-proposal")}>
          ${t("orch.adjustTeam")}
        </button>
      </div>
    </div>
  `;
}

function formatToolName(tool: string): string {
  const TOOL_NAMES: Record<string, string> = {
    "group:web": "联网搜索",
    "group:fs": "文件读写",
    "group:memory": "记忆",
    "group:runtime": "代码执行",
    web_search: "网页搜索",
    web_fetch: "网页抓取",
    image_gen: "图片生成",
    image_edit: "图片编辑",
    video_gen: "视频生成",
    tts: "语音合成",
    asr: "语音识别",
    cron: "定时任务",
    message: "消息推送",
    memory_search: "记忆检索",
    sessions_spawn: "子任务",
    sessions_send: "消息转发",
    browser: "浏览器",
  };
  return TOOL_NAMES[tool] ?? tool;
}

// ── Template Preview ─────────────────────────────────────────────────────

function renderTemplatePreview(
  tpl: SceneTemplate,
  handlers: OrchestratorHandlers,
  t: (key: string, params?: Record<string, string | number>) => string,
): TemplateResult {
  return html`
    <div class="orch-preview">
      <div class="orch-preview-header">
        <div class="orch-preview-title">${tpl.name}</div>
        <div class="orch-preview-desc">${tpl.description}</div>
      </div>

      ${
        tpl.highlights?.length
          ? html`
        <div class="orch-preview-highlights">
          ${tpl.highlights.map(
            (h) => html`
            <div class="orch-preview-highlight-item">${h}</div>
          `,
          )}
        </div>
      `
          : nothing
      }

      <div class="orch-preview-section-title">${t("orch.previewAgents")}</div>
      <div class="orch-preview-agents">
        ${tpl.agents.map(
          (agent, i) => html`
          <div class="orch-preview-agent">
            <div class="orch-preview-agent-top">
              <div class="orch-avatar orch-avatar--${i % 6}" style="width:36px;height:36px;font-size:14px;">
                ${agent.emoji ?? (agent.name || "?").charAt(0)}
              </div>
              <div class="orch-preview-agent-info">
                <div class="orch-preview-agent-name">${agent.name || "?"}</div>
                <div class="orch-preview-agent-role">${agent.role}</div>
              </div>
            </div>
            <div class="orch-preview-agent-tags">
              <span class="orch-preview-tag orch-preview-tag--tier">${
                agent.modelTier === "sota"
                  ? t("orch.tierSota")
                  : agent.modelTier === "mid"
                    ? t("orch.tierMid")
                    : t("orch.tierCheap")
              }</span>
              ${
                agent.tools?.profile
                  ? html`
                <span class="orch-preview-tag orch-preview-tag--profile">${formatProfileName(agent.tools.profile, t)}</span>
              `
                  : nothing
              }
              ${(agent.tools?.allow ?? []).slice(0, 3).map(
                (tool) => html`
                <span class="orch-preview-tag">${formatToolName(tool)}</span>
              `,
              )}
            </div>
            ${
              agent.routingKeywords?.length
                ? html`
              <div class="orch-preview-agent-keywords">
                ${agent.routingKeywords.slice(0, 6).map(
                  (kw) => html`
                  <span class="orch-preview-kw">${kw}</span>
                `,
                )}
              </div>
            `
                : nothing
            }
          </div>
        `,
        )}
      </div>

      <div class="orch-preview-actions">
        <button class="btn primary" @click=${() => handlers.onPreviewDeploy?.(tpl.id)}>
          ${t("orch.deployNow")}
        </button>
        <button class="btn" @click=${() => handlers.onActionClick("back-from-preview")}>
          ${t("orch.back")}
        </button>
      </div>
    </div>
  `;
}

function formatProfileName(profile: string, t: (key: string) => string): string {
  const PROFILE_NAMES: Record<string, string> = {
    minimal: "minimal",
    coding: "coding",
    messaging: "messaging",
    research: "research",
    creative: "creative",
    data: "data",
    full: "full",
  };
  return t(`orch.profile.${profile}`) || PROFILE_NAMES[profile] || profile;
}

// ── Deploy Progress ──────────────────────────────────────────────────────

const STATUS_I18N_KEYS: Record<string, string> = {
  pending: "orch.deployStatusPending",
  creating: "orch.deployStatusCreating",
  configuring: "orch.deployStatusConfiguring",
  writing_soul: "orch.deployStatusConfiguring",
  ready: "orch.deployStatusReady",
  failed: "orch.deployStatusFailed",
};

function renderDeployProgress(
  state: OrchestratorState,
  handlers: OrchestratorHandlers,
  t: (key: string, params?: Record<string, string | number>) => string,
): TemplateResult {
  const progress = state.deployProgress;
  if (!progress?.agents || !Array.isArray(progress.agents)) return html``;

  const pct = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;

  const hasFailed = progress.agents.some((a) => a.status === "failed");

  return html`
    <div class="orch-deploy">
      <div class="orch-deploy-title">${t("orch.deployTitle")}</div>
      <div class="orch-deploy-bar">
        <div class="orch-deploy-fill" style="width: ${pct}%"></div>
      </div>
      <div class="orch-deploy-stat">${progress.completed}/${progress.total}</div>
      <div class="orch-deploy-cards">
        ${progress.agents.map((agent, i) => {
          const cls =
            agent.status === "ready"
              ? "done"
              : agent.status === "failed"
                ? "failed"
                : agent.status === "pending"
                  ? "pending"
                  : "active";
          const labelKey = STATUS_I18N_KEYS[agent.status];
          const label = labelKey ? t(labelKey) : agent.status;
          return html`
            <div class="orch-deploy-card orch-deploy-card--${cls}" style="animation-delay: ${i * 0.1}s">
              <div class="orch-deploy-card-avatar orch-avatar--${i % 6}">
                ${(agent.name || "?").charAt(0)}
              </div>
              <div class="orch-deploy-card-name">${agent.name}</div>
              <div class="orch-deploy-card-status">
                ${cls === "done" ? checkIcon : nothing}
                ${
                  cls === "active"
                    ? html`
                        <div class="orch-deploy-card-spinner"></div>
                      `
                    : nothing
                }
                ${
                  cls === "failed"
                    ? html`
                        <span class="orch-deploy-card-fail">!</span>
                      `
                    : nothing
                }
                <span>${label}</span>
              </div>
              ${
                agent.error
                  ? html`
                <div class="orch-deploy-card-error-box">
                  <div class="orch-deploy-card-error-msg">${humanizeDeployError(agent.error, t)}</div>
                </div>
              `
                  : nothing
              }
            </div>
          `;
        })}
      </div>
      ${
        hasFailed
          ? html`
        <div class="orch-deploy-retry-bar">
          <button
            class="btn btn--sm primary"
            ?disabled=${state.retryingFailed}
            @click=${() => handlers.onActionClick("retry-failed")}
          >
            ${state.retryingFailed ? t("orch.retryingFailed") : t("orch.retryFailed")}
          </button>
          <button class="btn btn--sm" @click=${() => handlers.onActionClick("skip-failed")}>
            ${t("orch.skipFailed")}
          </button>
        </div>
      `
          : nothing
      }
    </div>
  `;
}

/** Map technical deploy errors to user-friendly messages */
function humanizeDeployError(error: string, t: (key: string) => string): string {
  if (/permission|EACCES/i.test(error)) return t("orch.errPermission");
  if (/timeout|ETIMEDOUT/i.test(error)) return t("orch.errTimeout");
  if (/not found|ENOENT/i.test(error)) return t("orch.errNotFound");
  if (/conflict|冲突/i.test(error)) return t("orch.errConflict");
  if (/connection|ECONNREFUSED/i.test(error)) return t("orch.errConnection");
  // Device token mismatch — distinct from real API key errors
  if (/device.token.mismatch/i.test(error)) return t("orch.errDeviceToken");
  if (/API key|apikey|unauthorized|401/i.test(error)) return t("orch.errApiKey");
  return error;
}

// ── Success ──────────────────────────────────────────────────────────────

function renderSuccess(
  state: OrchestratorState,
  handlers: OrchestratorHandlers,
  t: (key: string, params?: Record<string, string | number>) => string,
): TemplateResult {
  const data = state.successData;
  if (!data) return html``;

  const report = data.report;

  return html`
    <div class="orch-success">
      <div class="orch-success-mark">${checkIcon}</div>
      <div class="orch-success-title">${t("orch.successTitle")}</div>
      <div class="orch-success-sub">
        ${t("orch.successSub", { team: data.teamDescription })}
      </div>

      ${report ? renderDeployReportSummary(report.summary, t) : nothing}

      <div class="orch-deployed-grid">
        ${data.agents.map((agent, i) => {
          const agentReport = report?.agents.find((r) => r.agentId === agent.id);
          return html`
            <div class="orch-deployed-card">
              <div class="orch-deployed-card-head">
                <div class="orch-avatar orch-avatar--${i % 6}">
                  ${agent.emoji ?? (agent.name || "?").charAt(0)}
                </div>
                <span class="orch-deployed-card-name">${agent.name || "?"}</span>
              </div>
              <div class="orch-deployed-card-desc">${agent.role}</div>
              ${
                agent.modelTier || agent.toolProfile
                  ? html`
                <div class="orch-deployed-card-meta">
                  ${
                    agent.modelTier
                      ? html`
                    <span class="orch-preview-tag orch-preview-tag--tier">${
                      agent.modelTier === "sota"
                        ? t("orch.tierSota")
                        : agent.modelTier === "mid"
                          ? t("orch.tierMid")
                          : t("orch.tierCheap")
                    }</span>
                  `
                      : nothing
                  }
                  ${
                    agent.toolProfile
                      ? html`
                    <span class="orch-preview-tag orch-preview-tag--profile">${formatProfileName(agent.toolProfile, t)}</span>
                  `
                      : nothing
                  }
                </div>
              `
                  : nothing
              }
              ${agentReport ? renderAgentStepBadges(agentReport, t) : nothing}
              <button
                class="btn btn--sm primary"
                @click=${() => handlers.onActionClick("start-chat", agent.id)}
              >
                ${t("orch.startChat")}
              </button>
            </div>
          `;
        })}
      </div>

      <div class="orch-tryit">
        <div class="orch-tryit-label">${t("orch.tryItLabel")}</div>
        <div class="orch-tryit-input-row">
          <input
            class="orch-tryit-input"
            placeholder=${t("orch.tryItPlaceholder")}
            @keydown=${(e: KeyboardEvent) => {
              if (e.key === "Enter") {
                const val = (e.target as HTMLInputElement).value.trim();
                if (val) handlers.onActionClick("try-it-send", val);
              }
            }}
          />
          <button class="btn btn--sm primary" @click=${(e: Event) => {
            const input = (e.target as HTMLElement).previousElementSibling as HTMLInputElement;
            const val = input?.value?.trim();
            if (val) handlers.onActionClick("try-it-send", val);
          }}>
            ${t("orch.tryItSend")}
          </button>
        </div>
      </div>

      ${
        data.usageGuide
          ? html`
        <div class="orch-guide">
          <div class="orch-guide-label">${t("orch.guideLabel")}</div>
          <div class="orch-guide-list">
            ${data.usageGuide
              .split("\n")
              .filter((l) => l.startsWith("  "))
              .map(
                (line, idx) => html`
              <div class="orch-guide-item">
                <span class="orch-guide-num">${idx + 1}</span>
                ${line.trim()}
              </div>
            `,
              )}
          </div>
        </div>
      `
          : nothing
      }

      <div class="orch-success-actions">
        <button class="btn" @click=${() => handlers.onActionClick("back-to-list")}>
          ${t("orch.backToList")}
        </button>
        <button class="btn primary" @click=${() => handlers.onActionClick("create-more")}>
          ${t("orch.createMore")}
        </button>
      </div>
    </div>
  `;
}

// ── Deploy Report Summary ─────────────────────────────────────────────

function renderDeployReportSummary(
  summary: DeployReportSummary,
  t: (key: string, params?: Record<string, string | number>) => string,
): TemplateResult {
  return html`
    <div class="orch-report-summary">
      <div class="orch-report-stat">
        <span class="orch-report-stat-num">${summary.readyAgents}/${summary.totalAgents}</span>
        <span class="orch-report-stat-label">${t("orch.reportAgentsReady")}</span>
      </div>
      <div class="orch-report-stat">
        <span class="orch-report-stat-num">${summary.soulsWritten}</span>
        <span class="orch-report-stat-label">${t("orch.reportSoulsWritten")}</span>
      </div>
      <div class="orch-report-stat">
        <span class="orch-report-stat-num">${summary.toolPoliciesWritten}</span>
        <span class="orch-report-stat-label">${t("orch.reportToolPolicies")}</span>
      </div>
      <div class="orch-report-stat">
        <span class="orch-report-stat-num">${summary.keywordsPopulated}</span>
        <span class="orch-report-stat-label">${t("orch.reportKeywords")}</span>
      </div>
    </div>
  `;
}

function renderAgentStepBadges(
  agentReport: DeployReportAgent,
  t: (key: string) => string,
): TemplateResult {
  if (!agentReport.steps.length) return html``;
  const hasWarn = agentReport.steps.some((s) => s.status === "warn");
  const hasFail = agentReport.steps.some((s) => s.status === "fail");
  if (!hasWarn && !hasFail) return html``;

  return html`
    <div class="orch-deployed-card-steps">
      ${agentReport.steps
        .filter((s) => s.status !== "ok")
        .map(
          (s) => html`
          <span class="orch-step-badge orch-step-badge--${s.status}" title=${s.detail}>
            ${
              s.step === "soul"
                ? t("orch.stepSoul")
                : s.step === "tool-policy"
                  ? t("orch.stepToolPolicy")
                  : s.step === "keywords"
                    ? t("orch.stepKeywords")
                    : s.step
            }
          </span>
        `,
        )}
    </div>
  `;
}

// ── Error ────────────────────────────────────────────────────────────────

function renderError(
  state: OrchestratorState,
  handlers: OrchestratorHandlers,
  t: (key: string) => string,
): TemplateResult {
  const rawError = state.error ?? "Unknown error";
  const friendlyError = humanizeDeployError(rawError, t);
  const showRaw = friendlyError !== rawError;

  return html`
    <div class="orch-error">
      <div class="orch-error-icon">⚠️</div>
      <div class="orch-error-text">${friendlyError}</div>
      ${
        showRaw
          ? html`
        <details class="orch-error-details">
          <summary>${t("orch.errorDetails")}</summary>
          <code>${rawError}</code>
        </details>
      `
          : nothing
      }
      <div class="orch-error-hints">
        <div class="orch-error-hint">${t("orch.errorHint1")}</div>
        <div class="orch-error-hint">${t("orch.errorHint2")}</div>
      </div>
      <div class="orch-error-actions">
        <button class="btn btn--sm primary" @click=${() => handlers.onActionClick("retry")}>
          ${t("orch.errorRetry")}
        </button>
        <button class="btn btn--sm" @click=${() => handlers.onActionClick("goto-model-config")}>
          ${t("orch.errorCheckConfig")}
        </button>
        <button class="btn btn--sm" @click=${handlers.onClose}>
          ${t("orch.errorBack")}
        </button>
      </div>
    </div>
  `;
}

// ── Thinking ─────────────────────────────────────────────────────────────

function renderThinking(t: (key: string) => string): TemplateResult {
  return html`
    <div class="orch-thinking">
      <div class="orch-thinking-bar">
        <div class="orch-thinking-bar-inner"></div>
      </div>
      <span class="orch-thinking-text">${t("orch.thinking")}</span>
    </div>
  `;
}

// ── Proposing Steps (animated progress) ─────────────────────────────────

function renderProposingSteps(steps: ProposingStep[], t: (key: string) => string): TemplateResult {
  return html`
    <div class="orch-proposing-steps">
      <div class="orch-proposing-title">${t("orch.proposingTitle")}</div>
      <div class="orch-proposing-list">
        ${steps.map(
          (step, i) => html`
          <div class="orch-proposing-step orch-proposing-step--${step.status}">
            <div class="orch-proposing-step-icon">
              ${
                step.status === "done"
                  ? checkIcon
                  : step.status === "active"
                    ? html`
                        <div class="orch-deploy-card-spinner"></div>
                      `
                    : html`<span class="orch-proposing-step-num">${i + 1}</span>`
              }
            </div>
            <div class="orch-proposing-step-body">
              <div class="orch-proposing-step-label">${step.label}</div>
              ${
                step.detail
                  ? html`
                <div class="orch-proposing-step-detail">${step.detail}</div>
              `
                  : nothing
              }
            </div>
          </div>
        `,
        )}
      </div>
    </div>
  `;
}

// ── Compose ──────────────────────────────────────────────────────────────

function renderCompose(
  state: OrchestratorState,
  handlers: OrchestratorHandlers,
  t: (key: string) => string,
): TemplateResult {
  if (state.phase === "deploying" || state.phase === "success" || state.phase === "previewing") {
    return html``;
  }

  return html`
    <div class="orch-compose">
      <textarea
        class="orch-input"
        .value=${state.inputValue}
        ?disabled=${state.inputDisabled}
        placeholder=${t("orch.inputPlaceholder")}
        @input=${handlers.onInput}
        @keydown=${handlers.onKeydown}
        rows="1"
      ></textarea>
      <button
        class="orch-send"
        ?disabled=${state.inputDisabled || !state.inputValue.trim()}
        @click=${handlers.onSend}
      >
        ${arrowIcon}
      </button>
    </div>
  `;
}

// ── Entry Button (for sidebar) ───────────────────────────────────────────

export function renderOrchestratorEntry(
  onOpen: () => void,
  t: (key: string) => string,
): TemplateResult {
  return html`
    <button class="orch-entry" @click=${onOpen}>
      <div class="orch-entry-mark">
        <div class="orch-entry-mark-inner"></div>
      </div>
      <div>
        <div class="orch-entry-title">${t("orch.entryTitle")}</div>
        <div class="orch-entry-sub">${t("orch.entrySub")}</div>
      </div>
    </button>
  `;
}
