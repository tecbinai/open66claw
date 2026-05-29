/**
 * Task Coordinator — Template workflows for common multi-step tasks.
 *
 * Provides workflow hints that the supervisor can follow for recognized
 * task patterns. The matched workflow instructions are injected into
 * the supervisor's system prompt via the `before_agent_start` hook.
 *
 * Note: step dependencies (`dependsOn`) are expressed as hints to the
 * supervisor LLM — they are NOT enforced programmatically. The supervisor
 * is instructed to wait for dependent steps before proceeding.
 *
 * Migrated from clawdbot extensions/agent-team/src/task-coordinator.ts
 */

import type { MemberInfo } from "./types.js";

// ── Types ──────────────────────────────────────────────────────────────

export type TaskStep = {
  /** Step identifier (used by dependsOn references) */
  stepId: string;
  /** Target role keyword (matched against member role descriptions) */
  targetRole: string;
  /** Instruction to send to the member */
  instruction: string;
  /** Wait for these steps to complete first (by stepId) */
  dependsOn?: string[];
  /** If true, failure of this step doesn't block synthesis */
  optional?: boolean;
};

export type TaskWorkflow = {
  /** Unique workflow identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Regex patterns that trigger this workflow (tested against user message) */
  triggerPatterns: string[];
  /** Ordered steps to execute */
  steps: TaskStep[];
  /** Instruction for the supervisor on how to combine results */
  synthesisInstruction: string;
};

// ── Pre-compiled Regex Cache ──────────────────────────────────────────

let compiledPatternsCache: Array<{ workflow: TaskWorkflow; regexes: RegExp[] }> | null = null;

function getCompiledPatterns(): Array<{ workflow: TaskWorkflow; regexes: RegExp[] }> {
  if (compiledPatternsCache) return compiledPatternsCache;
  compiledPatternsCache = BUILTIN_WORKFLOWS.map((wf) => ({
    workflow: wf,
    regexes: wf.triggerPatterns.flatMap((p) => {
      try {
        return [new RegExp(p, "i")];
      } catch {
        return [];
      }
    }),
  }));
  return compiledPatternsCache;
}

// ── Built-in Workflows ─────────────────────────────────────────────────
// Trigger patterns use anchored multi-character sequences to reduce false positives.
// Chinese patterns require both action + object to avoid matching casual text.

const BUILTIN_WORKFLOWS: TaskWorkflow[] = [
  {
    id: "content-with-images",
    name: "Content + Images",
    triggerPatterns: [
      // Requires explicit "写/撰写" + "配图/插图" together
      "(?:写|撰写).{0,20}(?:配图|插图|配上图)",
      "(?:文章|内容).{0,20}(?:配图|插图|配上图片)",
      "(?:article|write|create).{0,30}(?:with|include).{0,10}(?:image|picture|illustration)",
    ],
    steps: [
      {
        stepId: "write",
        targetRole: "writ|写作|撰写|编辑",
        instruction: "Write the article/content as requested by the user",
      },
      {
        stepId: "illustrate",
        targetRole: "image|图片|绘画|绘图|设计",
        instruction:
          "Generate images/illustrations for the article. The article content will be provided.",
        dependsOn: ["write"],
        optional: true,
      },
    ],
    synthesisInstruction:
      "Combine the article text with generated images. Present article first, then images.",
  },
  {
    id: "research-and-summarize",
    name: "Research + Summary",
    triggerPatterns: [
      // Requires explicit research action + summarize action
      "(?:调研|调查研究).{0,20}(?:总结|汇总|整理)",
      "(?:搜索|查找).{0,20}(?:整理|汇总|总结)",
      "(?:research|investigate).{0,30}(?:summarize|summary|compile)",
      "查.{0,5}资料.{0,10}(?:总结|汇总)",
    ],
    steps: [
      {
        stepId: "research",
        targetRole: "research|搜索|调研|检索",
        instruction: "Research the topic and gather relevant information",
      },
      {
        stepId: "summarize",
        targetRole: "writ|写作|总结|整理|编辑",
        instruction: "Organize and summarize the research results into a clear report",
        dependsOn: ["research"],
      },
    ],
    synthesisInstruction: "Present the organized summary with key findings highlighted.",
  },
  {
    id: "translate-and-polish",
    name: "Translate + Polish",
    triggerPatterns: [
      "(?:翻译).{0,15}(?:润色|修改|优化|校对)",
      "(?:translate).{0,20}(?:polish|edit|proofread|refine)",
      "(?:翻译).{0,10}(?:然后|并|再).{0,5}(?:编辑|润色)",
    ],
    steps: [
      {
        stepId: "translate",
        targetRole: "翻译|translat",
        instruction: "Translate the content as requested",
      },
      {
        stepId: "polish",
        targetRole: "writ|写作|编辑|润色|校对",
        instruction: "Polish and improve the translated text for naturalness",
        dependsOn: ["translate"],
      },
    ],
    synthesisInstruction: "Present the final polished translation.",
  },
];

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Match a user message against built-in template workflows.
 * Returns the first matching workflow, or null if no match.
 */
export function matchWorkflow(message: string): TaskWorkflow | null {
  const compiled = getCompiledPatterns();
  for (const { workflow, regexes } of compiled) {
    for (const re of regexes) {
      if (re.test(message)) return workflow;
    }
  }
  return null;
}

/**
 * Find the best-matching member for a role pattern.
 * Returns the member whose role description matches the pattern,
 * or undefined if no match.
 */
function findMemberForRole(rolePattern: string, members: MemberInfo[]): MemberInfo | undefined {
  if (members.length === 0) return undefined;
  const parts = rolePattern.split("|");
  for (const part of parts) {
    try {
      const re = new RegExp(part, "i");
      const match = members.find((m) => re.test(m.role) || re.test(m.name));
      if (match) return match;
    } catch {
      // Invalid regex part — skip
    }
  }
  return undefined;
}

/**
 * Generate supervisor instructions for a matched workflow.
 * These instructions are injected into the supervisor's system prompt
 * to guide task decomposition without requiring LLM reasoning.
 */
export function generateWorkflowInstructions(
  workflow: TaskWorkflow,
  members: MemberInfo[],
): string {
  if (members.length === 0) return "";

  const lines: string[] = [
    `<task-workflow id="${workflow.id}">`,
    `Detected multi-step task pattern: "${workflow.name}".`,
    `Execute the following steps in order:`,
    ``,
  ];

  // Build a stepId→step index for dependency references
  const stepMap = new Map(workflow.steps.map((s, i) => [s.stepId, i + 1]));

  for (let i = 0; i < workflow.steps.length; i++) {
    const step = workflow.steps[i];
    const member = findMemberForRole(step.targetRole, members);
    const target = member ? `${member.name} (\`${member.id}\`)` : `[any available member]`;

    // Precise dependency annotation
    let depNote = "";
    if (step.dependsOn?.length) {
      const depRefs = step.dependsOn
        .map((id) => stepMap.get(id))
        .filter(Boolean)
        .map((n) => `step ${n}`);
      depNote =
        depRefs.length > 0
          ? ` (wait for ${depRefs.join(" and ")} to complete first)`
          : ` (wait for previous steps to complete first)`;
    }
    const optNote = step.optional ? " [optional]" : "";

    lines.push(`${i + 1}. Send to **${target}**${depNote}${optNote}: "${step.instruction}"`);
  }

  lines.push(``);
  lines.push(`Synthesis: ${workflow.synthesisInstruction}`);
  lines.push(`</task-workflow>`);

  return lines.join("\n");
}
