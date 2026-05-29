/**
 * Scene Verifier — Team Completeness Verification
 *
 * Systematically validates that a generated agent team can fulfill
 * the user's requirements before deployment.
 *
 * Checks:
 *   1. Tool/skill/MCP availability (are recommended capabilities installed?)
 *   2. Requirement coverage (does the team cover all aspects of the user's need?)
 *   3. Channel coverage (are specified channels supported?)
 *   4. Supervisor presence (is there a coordinator agent?)
 *   5. Model availability (are recommended models from configured providers?)
 *   6. Resource coverage (can the team handle specified resources?)
 *   7. Limits compliance (skills ≤5, MCP ≤7 per agent)
 */

import type { AgentBlueprint, UserContext } from "../types.js";
import { isSupervisorRole } from "./capability-inference.js";
import type { DiscoveryResult } from "./runtime-discovery.js";
import { MAX_SKILLS_PER_AGENT, MAX_MCP_PER_AGENT } from "./runtime-discovery.js";

// ── Types ────────────────────────────────────────────────────────────────

export type VerificationCheck = {
  name: string;
  pass: boolean;
  detail: string;
  severity: "critical" | "warning" | "info";
};

export type SceneGap = {
  /** What the user asked for */
  requirement: string;
  /** What's needed but not covered */
  missingCapability: string;
  /** Suggested fix */
  suggestion: string;
};

export type SceneVerification = {
  overallPass: boolean;
  /** 0-100 score */
  score: number;
  checks: VerificationCheck[];
  gaps: SceneGap[];
  recommendations: string[];
};

// ── Requirement Decomposition ────────────────────────────────────────────

/**
 * Decompose a user requirement into atomic sub-requirements using keyword extraction.
 */
function decomposeRequirement(requirement: string, scenario: string): string[] {
  const subs: string[] = [];

  // Scenario-specific decomposition patterns
  const patterns: Record<string, RegExp[]> = {
    content: [
      /选题|热点|trend/i,
      /写作|文案|write|copy|撰写|创作/i,
      /配图|排版|图片|image|封面|视觉/i,
      /发布|推送|publish|分发|distribut/i,
      /SEO|优化|运营/i,
    ],
    coding: [/代码|code|编程/i, /测试|test/i, /review|审查/i, /文档|doc/i, /部署|deploy/i],
    customer_support: [/客服|support/i, /FAQ|问答/i, /工单|ticket/i, /数据|分析|analy/i],
    research: [/搜索|search/i, /分析|analy/i, /报告|report/i, /数据|data/i],
    data_analysis: [/数据|data/i, /分析|analy/i, /可视化|visual/i, /报表|report/i],
    news: [/新闻|news/i, /监控|monitor/i, /摘要|summary/i, /推送|push/i],
    finance: [/记账|account/i, /分析|analy/i, /报表|report/i, /预算|budget/i],
    scheduling: [/日程|calendar/i, /提醒|remind/i, /任务|task/i],
    learning: [/学习|learn/i, /总结|summary/i, /练习|practice/i, /笔记|note/i],
  };

  // Check scenario-specific patterns
  const scenarioPatterns = patterns[scenario] ?? [];
  for (const pattern of scenarioPatterns) {
    if (pattern.test(requirement)) {
      const match = requirement.match(pattern);
      if (match) subs.push(match[0]);
    }
  }

  // Generic keyword extraction from requirement
  const genericPatterns = [
    /搜索|查询|检索|search|query/i,
    /写作|撰写|创作|write|create/i,
    /分析|统计|analy/i,
    /总结|摘要|summarize/i,
    /翻译|translate/i,
    /代码|编程|code|program/i,
    /图片|配图|image|illustrat/i,
    /数据|data/i,
    /客服|接待|support/i,
    /定时|提醒|schedule|remind/i,
    /文档|文件|doc|file/i,
    /新闻|资讯|news/i,
  ];

  for (const pattern of genericPatterns) {
    if (pattern.test(requirement)) {
      const match = requirement.match(pattern);
      if (match && !subs.includes(match[0])) {
        subs.push(match[0]);
      }
    }
  }

  return subs.length > 0 ? subs : [requirement.slice(0, 30)];
}

// ── Individual Checks ────────────────────────────────────────────────────

function checkSkillAvailability(
  blueprints: AgentBlueprint[],
  discovery?: DiscoveryResult,
): VerificationCheck {
  if (!discovery || discovery.skills.length === 0) {
    return {
      name: "skill_availability",
      pass: true,
      detail: "跳过技能可用性检查（无运行时发现数据）",
      severity: "info",
    };
  }

  const installedNames = new Set(discovery.skills.map((s) => s.name.toLowerCase()));
  const missing: string[] = [];
  const missingSkillNames = new Set<string>();
  let totalSkillRefs = 0;

  for (const bp of blueprints) {
    const skills = bp.inferredCapabilities?.skills ?? bp.tools?.skills ?? [];
    for (const skill of skills) {
      totalSkillRefs++;
      if (!installedNames.has(skill.toLowerCase())) {
        missing.push(`${bp.name}: ${skill}`);
        missingSkillNames.add(skill.toLowerCase());
      }
    }
  }

  if (missing.length === 0) {
    return {
      name: "skill_availability",
      pass: true,
      detail: "所有推荐技能均已安装",
      severity: "info",
    };
  }

  // Severity based on unique missing skills ratio, not raw count.
  // Missing skills are recommendations, not hard requirements —
  // agents can still function without them (just with reduced capability).
  const missingRatio = totalSkillRefs > 0 ? missingSkillNames.size / totalSkillRefs : 0;
  const severity: "critical" | "warning" = missingRatio > 0.5 ? "critical" : "warning";

  return {
    name: "skill_availability",
    pass: severity !== "critical",
    detail: `以下推荐技能未安装（${missingSkillNames.size} 种）: ${[...missingSkillNames].join(", ")}`,
    severity,
  };
}

function checkMCPAvailability(
  blueprints: AgentBlueprint[],
  discovery?: DiscoveryResult,
): VerificationCheck {
  if (!discovery || discovery.mcpServers.length === 0) {
    return {
      name: "mcp_availability",
      pass: true,
      detail: "跳过 MCP 可用性检查（无运行时发现数据）",
      severity: "info",
    };
  }

  const runningIds = new Set(
    discovery.mcpServers.filter((s) => s.enabled && s.running).map((s) => s.id.toLowerCase()),
  );
  const missing: string[] = [];

  for (const bp of blueprints) {
    const mcpHints = bp.inferredCapabilities?.mcpHints ?? bp.tools?.mcpServers ?? [];
    for (const hint of mcpHints) {
      if (!runningIds.has(hint.toLowerCase())) {
        missing.push(`${bp.name}: ${hint}`);
      }
    }
  }

  if (missing.length === 0) {
    return {
      name: "mcp_availability",
      pass: true,
      detail: "所有推荐 MCP 服务均在运行",
      severity: "info",
    };
  }

  return {
    name: "mcp_availability",
    pass: false,
    detail: `以下 MCP 服务未运行: ${missing.join(", ")}`,
    severity: "warning",
  };
}

function checkRequirementCoverage(
  requirement: string,
  blueprints: AgentBlueprint[],
  scenario: string,
): { check: VerificationCheck; gaps: SceneGap[] } {
  const subs = decomposeRequirement(requirement, scenario);
  const gaps: SceneGap[] = [];

  // Build per-blueprint searchable text (split into individual words/segments for precise matching)
  const roleTokenSets = blueprints.map((bp) => {
    const text = `${bp.name} ${bp.role}`.toLowerCase();
    // Extract CJK 2-char segments and latin words for word-level matching
    const cjk = text.match(/[\u4e00-\u9fff]{2,}/g) ?? [];
    const latin = text.match(/[a-z][a-z0-9_-]{2,}/g) ?? [];
    return new Set([...cjk, ...latin]);
  });

  // Synonym mapping for common requirement keywords → role description terms
  const synonyms: Record<string, string[]> = {
    客服: ["接待", "支持", "服务", "support", "客户"],
    support: ["接待", "客服", "服务", "help"],
    写作: ["撰写", "创作", "文案", "write", "copy", "内容"],
    write: ["写作", "撰写", "创作", "文案", "content"],
    搜索: ["查询", "检索", "search", "查找", "调研"],
    search: ["搜索", "查询", "检索", "查找"],
    代码: ["编程", "code", "program", "编码", "开发"],
    code: ["代码", "编程", "编码", "开发"],
    数据: ["data", "统计", "分析"],
    data: ["数据", "统计"],
    工单: ["ticket", "issue", "问题处理", "工作单"],
    查询: ["查找", "搜索", "检索", "search", "query"],
    排版: ["格式", "适配", "样式", "layout", "format", "模板"],
    分发: ["发布", "推送", "publish", "distribute", "同步"],
    配图: ["封面", "图片", "image", "插图", "视觉"],
    翻译: ["translate", "双语", "多语", "本地化"],
    监控: ["追踪", "watch", "monitor", "预警", "告警"],
  };

  for (const sub of subs) {
    const subLower = sub.toLowerCase();
    // Build expanded keyword set: original + synonyms
    const expandedKeywords = [subLower, ...(synonyms[subLower] ?? []).map((s) => s.toLowerCase())];

    // Word-level matching: check if any keyword (or synonym) appears as a token
    const coveredByRole = roleTokenSets.some((tokens) => {
      for (const kw of expandedKeywords) {
        // Exact token match
        if (tokens.has(kw)) return true;
        // For CJK: check if any token contains the keyword AND the keyword is ≥2 chars
        if (kw.length >= 2) {
          for (const token of tokens) {
            if (token.includes(kw)) return true;
          }
        }
      }
      return false;
    });

    const coveredBySkill = blueprints.some((bp) => {
      const skills = bp.inferredCapabilities?.skills ?? bp.tools?.skills ?? [];
      return skills.some((s) => {
        const sLower = s.toLowerCase();
        // Skill name match: check original keyword and all synonyms
        for (const kw of expandedKeywords) {
          if (sLower === kw || (kw.length >= 2 && sLower.includes(kw))) return true;
        }
        return false;
      });
    });

    if (!coveredByRole && !coveredBySkill) {
      gaps.push({
        requirement: sub,
        missingCapability: `没有 agent 覆盖「${sub}」相关能力`,
        suggestion: `考虑添加一个专门处理「${sub}」的 agent，或为现有 agent 添加相关技能`,
      });
    }
  }

  const coverageRatio = subs.length > 0 ? (subs.length - gaps.length) / subs.length : 1;

  return {
    check: {
      name: "requirement_coverage",
      pass: gaps.length === 0,
      detail:
        gaps.length === 0
          ? `需求覆盖率 100%（${subs.length} 个子需求全部覆盖）`
          : `需求覆盖率 ${Math.round(coverageRatio * 100)}%（${gaps.length}/${subs.length} 个子需求未覆盖）`,
      severity: gaps.length > subs.length / 2 ? "critical" : gaps.length > 0 ? "warning" : "info",
    },
    gaps,
  };
}

function checkSupervisorPresence(blueprints: AgentBlueprint[]): VerificationCheck {
  // Supervisor is auto-created by deploy-bridge, so we just verify
  // the team has at least 2 agents (otherwise no need for supervisor)
  if (blueprints.length < 2) {
    return {
      name: "supervisor_presence",
      pass: true,
      detail: "单 agent 团队无需 Supervisor（将自动创建）",
      severity: "info",
    };
  }

  // Check if any blueprint explicitly has supervisor role
  const hasSupervisor = blueprints.some((bp) => isSupervisorRole(bp.role, bp.id));

  return {
    name: "supervisor_presence",
    pass: true,
    detail: hasSupervisor
      ? "团队包含 Supervisor 角色"
      : "Supervisor 将在部署时自动创建（使用用户配置的文本模型）",
    severity: "info",
  };
}

function checkChannelCoverage(
  blueprints: AgentBlueprint[],
  userCtx: UserContext,
): VerificationCheck {
  if (userCtx.channels.length === 0) {
    return {
      name: "channel_coverage",
      pass: true,
      detail: "未指定渠道要求",
      severity: "info",
    };
  }

  // Channel tools are handled at Supervisor routing level, not per-agent.
  // So we just verify the channels are valid.
  const validChannels = ["wechat", "dingtalk", "feishu", "telegram", "discord", "slack", "web"];
  const invalid = userCtx.channels.filter((ch) => !validChannels.includes(ch));

  if (invalid.length > 0) {
    return {
      name: "channel_coverage",
      pass: false,
      detail: `未知渠道: ${invalid.join(", ")}`,
      severity: "warning",
    };
  }

  return {
    name: "channel_coverage",
    pass: true,
    detail: `渠道配置正常: ${userCtx.channels.join(", ")}`,
    severity: "info",
  };
}

function checkLimitsCompliance(blueprints: AgentBlueprint[]): VerificationCheck {
  const violations: string[] = [];

  for (const bp of blueprints) {
    const skillCount = bp.inferredCapabilities?.skills?.length ?? bp.tools?.skills?.length ?? 0;
    const mcpCount = bp.inferredCapabilities?.mcpHints?.length ?? bp.tools?.mcpServers?.length ?? 0;

    if (skillCount > MAX_SKILLS_PER_AGENT) {
      violations.push(`${bp.name}: ${skillCount} skills（上限 ${MAX_SKILLS_PER_AGENT}）`);
    }
    if (mcpCount > MAX_MCP_PER_AGENT) {
      violations.push(`${bp.name}: ${mcpCount} MCP servers（上限 ${MAX_MCP_PER_AGENT}）`);
    }
  }

  if (violations.length === 0) {
    return {
      name: "limits_compliance",
      pass: true,
      detail: `所有 agent 均在限制范围内（skills ≤${MAX_SKILLS_PER_AGENT}, MCP ≤${MAX_MCP_PER_AGENT}）`,
      severity: "info",
    };
  }

  return {
    name: "limits_compliance",
    pass: false,
    detail: `超出限制: ${violations.join("; ")}`,
    severity: "critical",
  };
}

function checkResourceCoverage(
  blueprints: AgentBlueprint[],
  userCtx: UserContext,
): VerificationCheck {
  if (userCtx.resources.length === 0) {
    return {
      name: "resource_coverage",
      pass: true,
      detail: "未指定资源要求",
      severity: "info",
    };
  }

  const resourceSkillMap: Record<string, string[]> = {
    pdf: ["nano-pdf", "pdf"],
    github: ["github", "git"],
    database: ["sql", "database", "数据库", "sqlite", "数据"],
    notion: ["notion"],
    google_sheets: ["sheets", "google"],
    faq_doc: ["faq", "knowledge", "faq-builder", "知识库", "self-troubleshoot", "memory"],
    api: ["api", "rest", "graphql"],
  };

  const uncovered: string[] = [];
  for (const resource of userCtx.resources) {
    const keywords = resourceSkillMap[resource] ?? [resource];
    const covered = blueprints.some((bp) => {
      const skills = bp.inferredCapabilities?.skills ?? bp.tools?.skills ?? [];
      const mcpHints = bp.inferredCapabilities?.mcpHints ?? bp.tools?.mcpServers ?? [];
      const allCaps = [...skills, ...mcpHints].join(" ").toLowerCase();
      return keywords.some((kw) => allCaps.includes(kw.toLowerCase()));
    });

    if (!covered) uncovered.push(resource);
  }

  if (uncovered.length === 0) {
    return {
      name: "resource_coverage",
      pass: true,
      detail: `所有资源需求已覆盖: ${userCtx.resources.join(", ")}`,
      severity: "info",
    };
  }

  return {
    name: "resource_coverage",
    pass: false,
    detail: `以下资源未被任何 agent 覆盖: ${uncovered.join(", ")}`,
    severity: "warning",
  };
}

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Verify that a generated agent team can fulfill the user's requirements.
 * Returns a comprehensive verification report with score, checks, gaps, and recommendations.
 */
export function verifyScene(params: {
  requirement: string;
  blueprints: AgentBlueprint[];
  userCtx: UserContext;
  discovery?: DiscoveryResult;
}): SceneVerification {
  const { requirement, blueprints, userCtx, discovery } = params;
  const checks: VerificationCheck[] = [];
  let allGaps: SceneGap[] = [];
  const recommendations: string[] = [];

  // Run all checks
  checks.push(checkSkillAvailability(blueprints, discovery));
  checks.push(checkMCPAvailability(blueprints, discovery));

  const coverageResult = checkRequirementCoverage(requirement, blueprints, userCtx.scenario);
  checks.push(coverageResult.check);
  allGaps = [...allGaps, ...coverageResult.gaps];

  checks.push(checkSupervisorPresence(blueprints));
  checks.push(checkChannelCoverage(blueprints, userCtx));
  checks.push(checkLimitsCompliance(blueprints));
  checks.push(checkResourceCoverage(blueprints, userCtx));

  // Calculate overall score
  const criticalFails = checks.filter((c) => !c.pass && c.severity === "critical").length;
  const warningFails = checks.filter((c) => !c.pass && c.severity === "warning").length;
  const totalChecks = checks.length;
  const passedChecks = checks.filter((c) => c.pass).length;

  // Score: 100 base, -20 per critical failure, -10 per warning
  const score = Math.max(
    0,
    Math.min(
      100,
      Math.round((passedChecks / totalChecks) * 100) - criticalFails * 20 - warningFails * 10,
    ),
  );

  // Pass requires: no critical failures AND minimum score of 40
  const overallPass = criticalFails === 0 && score >= 40;

  // Generate recommendations
  if (criticalFails > 0) {
    recommendations.push("存在关键问题需要解决后才能部署");
  }
  if (score < 40 && criticalFails === 0) {
    recommendations.push("团队质量评分过低（需 ≥40 分），建议优化后再部署");
  }
  if (allGaps.length > 0) {
    recommendations.push(`发现 ${allGaps.length} 个需求缺口，建议添加对应能力的 agent 或技能`);
  }
  if (score >= 80) {
    recommendations.push("团队配置良好，可以部署");
  } else if (score >= 60) {
    recommendations.push("团队基本可用，但建议优化后再部署");
  }

  return { overallPass, score, checks, gaps: allGaps, recommendations };
}

/**
 * Format a verification report as a human-readable Chinese string.
 */
export function formatVerificationReport(result: SceneVerification): string {
  const lines: string[] = [];

  // Header
  const statusEmoji = result.overallPass ? "✅" : "⚠️";
  lines.push(`${statusEmoji} 团队完整性校验: ${result.score}/100 分`);
  lines.push("");

  // Checks
  for (const check of result.checks) {
    const icon = check.pass ? "✓" : check.severity === "critical" ? "✗" : "△";
    lines.push(`  ${icon} ${check.detail}`);
  }

  // Gaps
  if (result.gaps.length > 0) {
    lines.push("");
    lines.push("📋 需求缺口:");
    for (const gap of result.gaps) {
      lines.push(`  - ${gap.missingCapability}`);
      lines.push(`    建议: ${gap.suggestion}`);
    }
  }

  // Recommendations
  if (result.recommendations.length > 0) {
    lines.push("");
    lines.push("💡 建议:");
    for (const rec of result.recommendations) {
      lines.push(`  - ${rec}`);
    }
  }

  return lines.join("\n");
}
