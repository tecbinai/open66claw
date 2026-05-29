/**
 * OpenClawCN: Embedded Agent Chat Panel
 *
 * Lightweight chat panel rendered inside the agents page "chat" tab.
 * Reuses renderComposeCard for input and renderMessageGroup/
 * renderStreamingGroup for message display.
 */
import { html, nothing, type TemplateResult } from "lit";
import { renderComposeCard, type ComposeCardProps } from "../chat/compose-card.js";
import {
  renderMessageGroup,
  renderStreamingGroup,
  renderReadingIndicatorGroup,
} from "../chat/grouped-render.js";
import { normalizeRoleForGrouping } from "../chat/message-normalizer";
import { t } from "../i18n/index.js";
import type { MessageGroup } from "../types/chat-types";
import type { ChatAttachment } from "../ui-types";

export type AgentChatPanelProps = {
  agentId: string;
  agentName: string;
  agentEmoji: string;
  connected: boolean;
  loading: boolean;
  messages: unknown[];
  stream: string | null;
  streamStartedAt: number | null;
  sending: boolean;
  runId: string | null;
  draft: string;
  attachments: ChatAttachment[];
  error: string | null;
  onDraftChange: (next: string) => void;
  onSend: () => void;
  onAbort: () => void;
  onAttachmentsChange: (attachments: ChatAttachment[]) => void;
  onPaste: (e: ClipboardEvent) => void;
  onScroll?: (e: Event) => void;
};

/** Group consecutive messages by role (simplified version for embedded chat). */
function groupRawMessages(messages: unknown[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  let current: MessageGroup | null = null;

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i] as Record<string, unknown>;
    const role = normalizeRoleForGrouping(typeof msg.role === "string" ? msg.role : "unknown");
    const ts = typeof msg.timestamp === "number" ? msg.timestamp : Date.now();

    if (!current || current.role !== role) {
      if (current) groups.push(current);
      current = {
        kind: "group",
        key: `ag:${role}:${i}`,
        role,
        messages: [{ message: msg, key: `ag:msg:${i}` }],
        timestamp: ts,
        isStreaming: false,
      };
    } else {
      current.messages.push({ message: msg, key: `ag:msg:${i}` });
    }
  }
  if (current) groups.push(current);
  return groups;
}

export function renderAgentChatPanel(props: AgentChatPanelProps): TemplateResult {
  const hasStream = typeof props.stream === "string" && props.stream.length > 0;
  const canAbort = !!(props.runId && (props.sending || hasStream));
  const groups = groupRawMessages(props.messages);
  const assistantIdentity = {
    name: props.agentName,
    avatar: props.agentEmoji || null,
  };

  return html`
    <div class="agent-chat-panel">
      <div class="agent-chat-messages" @scroll=${props.onScroll}>
        <div class="agent-chat-messages__spacer"></div>
        ${
          props.loading
            ? html`<div class="muted" style="padding: 24px; text-align: center;">
              ${t("chat.loading")}
            </div>`
            : nothing
        }
        ${
          groups.length === 0 && !props.loading && !hasStream
            ? html`<div class="muted" style="padding: 24px; text-align: center;">
              ${t("agents.chatEmpty")}
            </div>`
            : nothing
        }
        ${groups.map((group) =>
          renderMessageGroup(group, {
            showReasoning: false,
            assistantName: props.agentName,
            assistantAvatar: props.agentEmoji || null,
          }),
        )}
        ${
          hasStream
            ? renderStreamingGroup(
                props.stream!,
                props.streamStartedAt ?? Date.now(),
                undefined,
                assistantIdentity,
              )
            : nothing
        }
        ${
          props.sending && !hasStream
            ? renderReadingIndicatorGroup(assistantIdentity, props.streamStartedAt)
            : nothing
        }
      </div>
      ${
        props.error
          ? html`<div class="callout danger" style="margin: 0 16px 8px;">${props.error}</div>`
          : nothing
      }
      <div class="agent-chat-compose">
        ${renderComposeCard({
          draft: props.draft,
          connected: props.connected,
          sending: props.sending,
          canAbort,
          hasStream,
          placeholder: t("agents.chatPlaceholder", { name: props.agentName }),
          attachments: props.attachments,
          onDraftChange: props.onDraftChange,
          onSend: props.onSend,
          onAbort: props.onAbort,
          onAttachmentsChange: props.onAttachmentsChange,
          onPaste: props.onPaste,
          voiceAvailable: false,
          voiceRecording: false,
          voiceProcessing: false,
        } satisfies ComposeCardProps)}
      </div>
    </div>
  `;
}
