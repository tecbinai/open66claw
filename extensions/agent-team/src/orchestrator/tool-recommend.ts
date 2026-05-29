/**
 * Tool Recommendation Module
 *
 * Given an agent's role description, recommends appropriate tools,
 * skills, and MCP servers.
 *
 * Design: Pure mapping based on keyword analysis.
 * Future: integrate with tool-discovery pipeline for LLM-powered selection.
 */

import type { AgentToolRecommendation } from "./types.js";

// ── Intent → Tool Group Mapping ──────────────────────────────────────────

type IntentPattern = {
  /** Keywords that trigger this recommendation */
  keywords: string[];
  /** Recommended tool groups */
  toolGroups: string[];
  /** Individual tools */
  tools?: string[];
  /** Skills */
  skills?: string[];
  /** MCP server suggestions */
  mcpServers?: string[];
};

const INTENT_PATTERNS: IntentPattern[] = [
  {
    keywords: [
      "搜索",
      "查询",
      "查找",
      "信息",
      "资料",
      "调研",
      "search",
      "query",
      "research",
      "internet",
      "web",
    ],
    toolGroups: ["group:web"],
    skills: ["web-researcher"],
  },
  {
    keywords: [
      "新闻",
      "资讯",
      "热点",
      "情报",
      "简报",
      "news",
      "briefing",
      "intelligence",
      "trending",
    ],
    toolGroups: ["group:web"],
    skills: ["ai-daily-news", "news-briefing", "web-researcher"],
  },
  {
    keywords: [
      "文件",
      "读取",
      "写入",
      "保存",
      "下载",
      "file",
      "read",
      "write",
      "save",
      "download",
      "fs",
      "storage",
    ],
    toolGroups: ["group:fs"],
  },
  {
    keywords: ["记忆", "记录", "笔记", "备忘", "知识", "memory", "note", "remember", "knowledge"],
    toolGroups: ["group:memory"],
    skills: ["summarize"],
  },
  {
    keywords: [
      "日程",
      "日历",
      "提醒",
      "预约",
      "会议",
      "schedule",
      "calendar",
      "remind",
      "appointment",
      "meeting",
    ],
    toolGroups: ["group:memory"],
    tools: ["cron", "message"],
    skills: ["calendar"],
  },
  {
    keywords: [
      "代码",
      "编程",
      "开发",
      "编译",
      "调试",
      "code",
      "program",
      "develop",
      "compile",
      "debug",
      "git",
    ],
    toolGroups: ["group:fs", "group:web", "group:runtime"],
    skills: ["coding-agent", "github"],
  },
  {
    keywords: ["浏览器", "网页", "截图", "browser", "webpage", "screenshot", "scrape"],
    toolGroups: ["group:web"],
    tools: ["browser"],
  },
  {
    keywords: ["邮件", "消息", "通知", "发送", "email", "message", "notify", "send", "alert"],
    toolGroups: ["group:memory"],
    tools: ["cron", "message"],
  },
  {
    keywords: [
      "数据",
      "分析",
      "统计",
      "报表",
      "图表",
      "data",
      "analyze",
      "statistics",
      "report",
      "chart",
    ],
    toolGroups: ["group:fs", "group:web", "group:memory"],
    skills: ["nano-pdf", "summarize"],
  },
  {
    keywords: ["表格", "excel", "csv", "spreadsheet", "sheets"],
    toolGroups: ["group:fs"],
    mcpServers: ["@anthropic/mcp-google-sheets"],
  },
  {
    keywords: [
      "图片",
      "图像",
      "画",
      "设计",
      "image",
      "picture",
      "draw",
      "design",
      "photo",
      "配图",
      "封面",
      "生成图",
    ],
    toolGroups: ["group:web"],
    tools: ["image_gen", "image_edit"],
    skills: ["openai-image-gen"],
  },
  {
    keywords: ["视频", "短视频", "video", "vlog", "clip", "剪辑", "动画", "animation"],
    toolGroups: ["group:web"],
    tools: ["video_gen", "image_gen"],
  },
  {
    keywords: ["语音", "播报", "朗读", "voice", "tts", "speech", "播音", "配音"],
    toolGroups: ["group:memory"],
    tools: ["tts"],
  },
  {
    keywords: [
      "语音转文字",
      "音频识别",
      "转录",
      "听写",
      "asr",
      "transcribe",
      "speech-to-text",
      "dictation",
    ],
    toolGroups: ["group:memory"],
    tools: ["asr"],
  },
  {
    keywords: [
      "客服",
      "客户",
      "服务",
      "问答",
      "faq",
      "咨询",
      "support",
      "customer",
      "service",
      "helpdesk",
    ],
    toolGroups: ["group:fs", "group:memory"],
    tools: ["message"],
    skills: ["self-troubleshoot", "summarize"],
  },
  {
    keywords: ["pdf", "文档", "论文", "paper", "document"],
    toolGroups: ["group:fs"],
    skills: ["nano-pdf"],
  },
  {
    keywords: [
      "小红书",
      "公众号",
      "自媒体",
      "内容",
      "创作",
      "文案",
      "xiaohongshu",
      "content",
      "creator",
      "copywrite",
    ],
    toolGroups: ["group:web", "group:memory"],
    skills: ["xiaohongshu", "summarize"],
  },
  {
    keywords: ["总结", "摘要", "归纳", "整理", "summarize", "summary", "digest"],
    toolGroups: ["group:memory"],
    skills: ["summarize"],
  },
  {
    keywords: ["财务", "记账", "预算", "收支", "finance", "budget", "accounting", "ledger"],
    toolGroups: ["group:fs", "group:memory"],
    skills: ["nano-pdf"],
  },
  {
    keywords: [
      "学习",
      "教育",
      "课程",
      "复习",
      "考试",
      "备考",
      "learning",
      "study",
      "education",
      "exam",
    ],
    toolGroups: ["group:web", "group:memory"],
    skills: ["web-researcher", "summarize"],
  },
  {
    keywords: ["github", "仓库", "repo", "pr", "issue", "pull request"],
    toolGroups: ["group:fs", "group:web"],
    skills: ["github"],
    mcpServers: ["@modelcontextprotocol/server-github"],
  },
];

/**
 * Recommend tools for an agent based on its role description.
 *
 * Scans the role description for intent keywords and aggregates
 * matching tool groups, individual tools, skills, and MCP servers.
 */
export function recommendToolsForRole(role: string, agentName?: string): AgentToolRecommendation {
  const text = `${agentName ?? ""} ${role}`.toLowerCase();

  const allowGroups = new Set<string>();
  const allowTools = new Set<string>();
  const skills = new Set<string>();
  const mcpServers = new Set<string>();

  for (const pattern of INTENT_PATTERNS) {
    const matched = pattern.keywords.some((kw) => text.includes(kw));
    if (matched) {
      for (const group of pattern.toolGroups) allowGroups.add(group);
      for (const tool of pattern.tools ?? []) allowTools.add(tool);
      for (const skill of pattern.skills ?? []) skills.add(skill);
      for (const mcp of pattern.mcpServers ?? []) mcpServers.add(mcp);
    }
  }

  // Include memory for inter-agent knowledge sharing by default.
  // (The caller can still put "group:memory" in deny to override.)
  allowGroups.add("group:memory");

  const allow = [...allowGroups, ...allowTools];

  return {
    allow: allow.length > 0 ? allow : undefined,
    profile: "minimal",
    skills: skills.size > 0 ? [...skills] : undefined,
    mcpServers: mcpServers.size > 0 ? [...mcpServers] : undefined,
  };
}

/**
 * Merge a template's tool recommendation with the auto-detected one.
 * Template values take priority for `allow` (more curated).
 */
export function mergeToolRecommendations(
  template: AgentToolRecommendation,
  autoDetected: AgentToolRecommendation,
): AgentToolRecommendation {
  const allow = new Set<string>([...(template.allow ?? []), ...(autoDetected.allow ?? [])]);
  const skills = new Set<string>([...(template.skills ?? []), ...(autoDetected.skills ?? [])]);
  const mcpServers = new Set<string>([
    ...(template.mcpServers ?? []),
    ...(autoDetected.mcpServers ?? []),
  ]);

  return {
    allow: allow.size > 0 ? [...allow] : undefined,
    deny: template.deny ?? autoDetected.deny,
    profile: template.profile ?? autoDetected.profile,
    skills: skills.size > 0 ? [...skills] : undefined,
    mcpServers: mcpServers.size > 0 ? [...mcpServers] : undefined,
  };
}

/**
 * Estimate token overhead of tools for display purposes.
 *
 * Rough estimates:
 *   - Each tool group: ~800 tokens in system prompt
 *   - Each individual tool: ~200 tokens
 *   - Each skill: ~400 tokens
 *   - Base agent prompt: ~2000 tokens (minimal mode)
 */
export function estimateToolTokens(recommendation: AgentToolRecommendation): number {
  const groupCount = (recommendation.allow ?? []).filter((t) => t.startsWith("group:")).length;
  const toolCount = (recommendation.allow ?? []).filter((t) => !t.startsWith("group:")).length;
  const skillCount = (recommendation.skills ?? []).length;

  return 2000 + groupCount * 800 + toolCount * 200 + skillCount * 400;
}
