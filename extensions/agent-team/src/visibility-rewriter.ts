/**
 * Visibility Rewriter — Channel message rewriting for visibility modes.
 *
 * Rewrites outbound messages based on project visibility settings:
 *   - unified:     pass-through (agent already prompted as displayName)
 *   - team:        optional prefix with team displayName
 *   - transparent:  prefix with [@memberName]
 *
 * Migrated from clawdbot extensions/agent-team/src/visibility-rewriter.ts
 */

import type { Project } from "./types.js";

export type RewriteResult = {
  content: string;
  cancel?: boolean;
};

export function rewriteOutboundMessage(params: {
  content: string;
  project: Project;
  agentId: string;
}): RewriteResult {
  const { content, project, agentId } = params;

  if (!content) return { content };

  const mode = project.visibility.mode;

  switch (mode) {
    case "unified":
      return { content };

    case "transparent": {
      const member = project.members.find((m) => m.id === agentId);
      const name = member?.name ?? agentId;
      return { content: `[@${name}] ${content}` };
    }

    case "team":
    default: {
      const displayName = project.visibility.displayName;
      if (displayName) {
        return { content: `[${displayName}] ${content}` };
      }
      return { content };
    }
  }
}
