/**
 * Usage Guide Generator
 *
 * Generates user-friendly usage instructions after deploying a team.
 * No technical jargon — only practical "how to use" examples.
 */

import type { AgentBlueprint, OrchestrationPlan, UserContext } from "../types.js";

// ── Scenario → Example Templates ─────────────────────────────────────────

const SCENARIO_EXAMPLES: Record<string, string[]> = {
  customer_support: [
    "对「接待员」说：帮我回答这个客户的问题——产品保修多久？",
    "对「工单记录员」说：今天处理了多少咨询？",
    "对「专家顾问」说：客户要求退货，该怎么处理？",
  ],
  coding: [
    "对「代码审查员」说：帮我看看这段代码有没有 bug",
    "对「技术调研员」说：React 和 Vue 哪个更适合后台管理系统？",
    "对「项目管理员」说：记一下，登录功能周五前要完成",
  ],
  content: [
    "对「选题雷达」说：帮我看看今天有什么热点适合做科技类内容",
    "对「文案写手」说：根据这个热点写一篇小红书风格的文案",
    "对「配图助手」说：给这篇文案配一张封面图，清新风格",
  ],
  data_analysis: [
    "对「数据清洗员」说：帮我整理一下这份 Excel 销售数据",
    "对「分析师」说：分析一下这个月的销售趋势",
    "对「分析师」说：对比上月数据，哪些品类增长了？",
  ],
  finance: [
    "对「记账助手」说：午餐 28 元",
    "对「财务分析师」说：这周花了多少钱？哪个类别最多？",
    "对「预算提醒员」说：每月餐饮预算设置为 2000 元",
  ],
  scheduling: [
    "对「日程管家」说：帮我安排明天下午 3 点和客户开会",
    "对「纪要员」说：整理一下今天会议讨论的内容",
    "对「纪要员」说：上次会议的待办都完成了吗？",
  ],
  learning: [
    "对「学习规划师」说：我要准备英语四级，帮我做个计划",
    "对「学习导师」说：什么是递归？能举个例子吗？",
    "对「笔记整理员」说：把今天学的数据结构整理成笔记",
  ],
  research: [
    "对「情报采集员」说：帮我追踪 AI 大模型领域的最新动态",
    "对「简报编辑」说：把今天采集的信息整理成一份简报",
    "对「情报采集员」说：加一个新关键词——智能驾驶",
  ],
};

const DEFAULT_EXAMPLES = [
  "直接描述你的需求，助手会自动响应",
  "说「帮我处理XX」分配任务",
  "说「查看进度」了解当前状态",
];

// ── Main Generator ───────────────────────────────────────────────────────

/**
 * Generate a user-friendly usage guide for a deployed team.
 */
export function generateUsageGuide(plan: OrchestrationPlan): string {
  const lines: string[] = [];
  const scenario = plan.userContext?.scenario ?? "general";

  // Team members
  for (const bp of plan.agents) {
    const initial = getInitial(bp.name);
    lines.push(`[${initial}] ${bp.name} — ${bp.role}`);
  }

  lines.push("");
  lines.push("开始使用：");

  // Scenario-specific examples
  const examples = generateExamples(scenario, plan.agents);
  for (const ex of examples.slice(0, 3)) {
    lines.push(`  ${ex}`);
  }

  // Channel hints
  if (plan.userContext?.channels && plan.userContext.channels.length > 0) {
    lines.push("");
    lines.push("渠道接入：");
    lines.push(`  前往「渠道管理」页面完成 ${plan.userContext.channels.join("、")} 的绑定`);
  }

  // Resource hints
  if (plan.userContext?.resources && plan.userContext.resources.length > 0) {
    const hasDoc = plan.userContext.resources.some((r) => ["faq_doc", "pdf"].includes(r));
    if (hasDoc) {
      const kbAgent = plan.agents.find((a) => /知识|文档|kb/i.test(a.role));
      if (kbAgent) {
        lines.push("");
        lines.push("知识库：");
        lines.push(`  把文档放到 ${kbAgent.name} 的工作空间，系统会自动索引`);
      }
    }
  }

  lines.push("");
  lines.push("管理和调整：");
  lines.push("  前往「智能体」页面查看和管理每个成员的配置");

  return lines.join("\n");
}

// ── Helpers ──────────────────────────────────────────────────────────────

function generateExamples(scenario: string, agents: AgentBlueprint[]): string[] {
  const scenarioExamples = SCENARIO_EXAMPLES[scenario];
  if (scenarioExamples) return scenarioExamples;

  // Generate from agent roles
  const roleExamples: string[] = [];
  for (const agent of agents.slice(0, 3)) {
    const verb = extractActionVerb(agent.role);
    if (verb) {
      roleExamples.push(`说「${verb}」→ ${agent.name} 处理`);
    }
  }

  return roleExamples.length > 0 ? roleExamples : DEFAULT_EXAMPLES;
}

function extractActionVerb(role: string): string | null {
  // Try to extract a short action phrase from the role description
  const match = role.match(/(.{2,10}?)(?:、|，|。|$)/);
  return match ? `帮我${match[1]}` : null;
}

function getInitial(name: string): string {
  // Chinese character or first letter
  if (/^[a-zA-Z]/.test(name)) return name.charAt(0).toUpperCase();
  return name.charAt(0);
}
