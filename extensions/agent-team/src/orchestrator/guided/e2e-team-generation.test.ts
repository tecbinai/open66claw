/**
 * E2E Team Generation Quality Tests
 *
 * 刁钻测试：从一个随机想法输入，测试整条链路的 agent team 生成质量。
 * 覆盖：generateDefaultTeam → inferAgentCapabilities → verifyScene → executePlanningPipeline
 *
 * 每个测试场景模拟真实用户输入，验证：
 * 1. Agent 划分是否合理（角色不重叠、职责清晰）
 * 2. Skills/MCP 推荐是否精准（不会推一堆无关的）
 * 3. Model 选择是否匹配复杂度
 * 4. Scene verification 能否发现问题
 * 5. Pipeline refinement 能否自动修复
 */
import { describe, it, expect } from "vitest";
import {
  inferAgentCapabilities,
  estimateRoleComplexity,
  isSupervisorRole,
} from "../guided/capability-inference.js";
import { executePlanningPipeline, type PipelineResult } from "../guided/planning-pipeline.js";
import { verifyScene, type SceneVerification } from "../guided/scene-verifier.js";
import type { AgentBlueprint, UserContext, InferredCapabilities } from "../types.js";

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Import the real generateDefaultTeam via performGuidedPropose's internal path.
 * Since generateDefaultTeam is not exported, we replicate the latest logic here
 * to test in isolation. This MUST stay in sync with orchestrate-tool.ts.
 */
function generateTestTeam(requirement: string, userContext: UserContext): AgentBlueprint[] {
  const lower = requirement.toLowerCase();

  type RoleCandidate = {
    name: string;
    id: string;
    pattern: RegExp;
    priority: number;
    baseRole: string;
    modelTier: "cheap" | "mid" | "sota";
    tools: { allow: string[]; profile?: string };
  };

  const ROLE_CANDIDATES: RoleCandidate[] = [
    {
      name: "文案写手",
      id: "copywriter",
      pattern: /写|文案|内容|创作|copy|writing|content/i,
      priority: 20,
      baseRole: "撰写和优化各类文案内容",
      modelTier: "mid",
      tools: { allow: ["group:web", "group:memory"] },
    },
    {
      name: "编程助手",
      id: "code-assistant",
      pattern: /代码|开发|编程|code|dev|program/i,
      priority: 15,
      baseRole: "编写、审查和调试代码",
      modelTier: "mid",
      tools: { allow: ["group:web", "group:fs", "group:memory"], profile: "coding" },
    },
    {
      name: "数据分析师",
      id: "data-analyst",
      pattern: /数据|分析|报表|data|analy|统计/i,
      priority: 25,
      baseRole: "分析数据、生成报表和可视化",
      modelTier: "mid",
      tools: { allow: ["group:web", "group:memory", "group:fs"] },
    },
    {
      name: "客服专员",
      id: "support-agent",
      pattern: /客服|support|答疑|咨询|接待|helpdesk/i,
      priority: 20,
      baseRole: "自动回答客户常见问题，处理咨询",
      modelTier: "cheap",
      tools: { allow: ["group:web", "group:memory"] },
    },
    {
      name: "研究员",
      id: "researcher",
      pattern: /研究|调研|research|报告|论文|paper/i,
      priority: 20,
      baseRole: "搜索资料、整理信息、撰写研究报告",
      modelTier: "mid",
      tools: { allow: ["group:web", "group:memory"] },
    },
    {
      name: "翻译专员",
      id: "translator",
      pattern: /翻译|translate|双语|多语|本地化|locali[sz]/i,
      priority: 25,
      baseRole: "翻译和本地化各类文档内容",
      modelTier: "mid",
      tools: { allow: ["group:web", "group:memory"] },
    },
    {
      name: "配图助手",
      id: "image-helper",
      pattern: /配图|图片|封面|插图|image|illustrat|画图|设计图/i,
      priority: 30,
      baseRole: "生成配图、封面和视觉素材",
      modelTier: "mid",
      tools: { allow: ["group:web", "group:memory"] },
    },
    {
      name: "新闻采编",
      id: "news-editor",
      pattern: /新闻|资讯|热点|简报|news|briefing|早报/i,
      priority: 25,
      baseRole: "采集新闻资讯、编辑简报",
      modelTier: "mid",
      tools: { allow: ["group:web", "group:memory"] },
    },
    {
      name: "日程管家",
      id: "scheduler",
      pattern: /日程|日历|提醒|预约|schedule|calendar|remind|会议/i,
      priority: 30,
      baseRole: "管理日程安排和定时提醒",
      modelTier: "cheap",
      tools: { allow: ["group:memory"] },
    },
  ];

  const matched: Array<RoleCandidate & { contextRole: string }> = [];
  for (const c of ROLE_CANDIDATES) {
    if (c.pattern.test(lower)) {
      matched.push({ ...c, contextRole: c.baseRole });
    }
  }
  matched.sort((a, b) => a.priority - b.priority);

  const team: AgentBlueprint[] = [];
  if (matched.length === 0) {
    team.push({
      name: "主力助手",
      id: "primary-assistant",
      role: "核心任务处理，负责响应用户需求和执行主要工作",
      soul: "",
      modelTier: userContext.budget === "cheap" ? "cheap" : "mid",
      tools: { allow: ["group:web", "group:memory"], profile: "minimal" },
    });
  } else {
    for (const m of matched) {
      team.push({
        name: m.name,
        id: m.id,
        role: m.contextRole,
        soul: "",
        modelTier: userContext.budget === "cheap" && m.modelTier === "mid" ? "cheap" : m.modelTier,
        tools: m.tools,
      });
    }
  }

  const maxAgents = Math.min(6, Math.max(1, matched.length));
  return team.slice(0, maxAgents);
}

function inferAll(blueprints: AgentBlueprint[], ctx: UserContext): AgentBlueprint[] {
  for (const bp of blueprints) {
    bp.inferredCapabilities = inferAgentCapabilities(bp, ctx);
  }
  return blueprints;
}

function runPipeline(
  requirement: string,
  blueprints: AgentBlueprint[],
  ctx: UserContext,
): PipelineResult {
  return executePlanningPipeline({
    blueprints,
    requirement,
    userCtx: ctx,
  });
}

function defaultCtx(overrides: Partial<UserContext> = {}): UserContext {
  return {
    scenario: "general",
    channels: [],
    resources: [],
    volume: "medium",
    budget: "balanced",
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST SCENARIO 1: 跨境电商客服 + 数据分析
// 刁钻点：需求横跨两个场景（客服 + 分析），测试系统是否会合理拆分
// ═══════════════════════════════════════════════════════════════════════════

describe("场景1: 跨境电商客服+数据分析", () => {
  const requirement = "我要搭建一个跨境电商客服系统，能自动回答客户咨询，同时分析客户数据生成报表";
  const ctx = defaultCtx({
    scenario: "customer_support",
    channels: ["wechat"],
    resources: ["faq_doc"],
  });

  it("应该生成包含客服和分析的团队（无primary占位）", () => {
    const team = generateTestTeam(requirement, ctx);
    const ids = team.map((a) => a.id);
    expect(ids).toContain("support-agent");
    expect(ids).toContain("data-analyst");
    // 有具体角色匹配时不再有 primary-assistant
    expect(ids).not.toContain("primary-assistant");
  });

  it("客服agent应该推荐客服相关skills", () => {
    const team = generateTestTeam(requirement, ctx);
    inferAll(team, ctx);
    const support = team.find((a) => a.id === "support-agent");
    expect(support?.inferredCapabilities?.skills).toBeDefined();
    const skills = support!.inferredCapabilities!.skills;
    // 客服场景应该有 self-troubleshoot 或 summarize
    expect(skills.some((s) => /troubleshoot|summarize|faq|wechat-cs/i.test(s))).toBe(true);
  });

  it("数据分析agent应该推荐分析相关skills", () => {
    const team = generateTestTeam(requirement, ctx);
    inferAll(team, ctx);
    const analyst = team.find((a) => a.id === "data-analyst");
    const skills = analyst!.inferredCapabilities!.skills;
    // 数据分析应该有 csv-analyzer 或 nano-pdf
    expect(skills.some((s) => /csv|data|nano-pdf|sql/i.test(s))).toBe(true);
  });

  it("客服agent不应该用sota模型（浪费钱）", () => {
    const team = generateTestTeam(requirement, ctx);
    inferAll(team, ctx);
    const support = team.find((a) => a.id === "support-agent");
    const model = support!.inferredCapabilities!.model.primary;
    // 客服是简单角色，不应该用 claude-opus 或 o3
    expect(model).not.toMatch(/opus|o3/);
  });

  it("pipeline应该通过scene verification", () => {
    const team = generateTestTeam(requirement, ctx);
    const result = runPipeline(requirement, team, ctx);
    // 需求覆盖 "客服" 和 "分析" 都在team中
    expect(result.coverageScore).toBeGreaterThanOrEqual(50);
    expect(result.verification.overallPass).toBe(true);
  });

  it("需求中的faq_doc资源应该被覆盖", () => {
    const team = generateTestTeam(requirement, ctx);
    inferAll(team, ctx);
    const verification = verifyScene({
      requirement,
      blueprints: team,
      userCtx: ctx,
    });
    const resourceCheck = verification.checks.find((c) => c.name === "resource_coverage");
    expect(resourceCheck?.pass).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST SCENARIO 2: 模糊需求 — "帮我搞个AI助手"
// 刁钻点：用户需求极其模糊，系统如何应对？不应崩溃也不应过度推测
// ═══════════════════════════════════════════════════════════════════════════

describe("场景2: 模糊需求「帮我搞个AI助手」", () => {
  const requirement = "帮我搞个AI助手";
  const ctx = defaultCtx();

  it("不应崩溃，至少生成primary assistant", () => {
    const team = generateTestTeam(requirement, ctx);
    expect(team.length).toBeGreaterThanOrEqual(1);
    expect(team[0].id).toBe("primary-assistant");
  });

  it("不应过度生成agent（模糊需求不应生成多个）", () => {
    const team = generateTestTeam(requirement, ctx);
    // "帮我搞个AI助手" 没有触发任何特定关键词，应该只有primary-assistant
    expect(team.length).toBe(1);
    expect(team[0].id).toBe("primary-assistant");
  });

  it("pipeline对单agent团队也应该正常工作", () => {
    const team = generateTestTeam(requirement, ctx);
    const result = runPipeline(requirement, team, ctx);
    // 单agent团队场景下 scene verification 可能产生 coverage warning
    // 但不应有 critical 级别的 structural error（如重复ID、超限等）
    const structuralErrors = result.rounds.flatMap((r) =>
      r.issues.filter((i) => i.severity === "error" && i.category !== "coverage"),
    );
    expect(structuralErrors.length).toBe(0);
  });

  it("单agent不应触发Supervisor缺失警告", () => {
    const team = generateTestTeam(requirement, ctx);
    inferAll(team, ctx);
    const verification = verifyScene({
      requirement,
      blueprints: team,
      userCtx: ctx,
    });
    const supCheck = verification.checks.find((c) => c.name === "supervisor_presence");
    expect(supCheck?.pass).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST SCENARIO 3: 复杂科研团队
// 刁钻点：需求涉及多种高级能力（代码+研究+数据），测试模型tier是否合理
// ═══════════════════════════════════════════════════════════════════════════

describe("场景3: 复杂科研需求", () => {
  const requirement =
    "我要搭建一个AI科研团队，能帮我调研论文、写代码做实验、分析实验数据，最后写研究报告";
  const ctx = defaultCtx({
    scenario: "research",
    resources: ["pdf", "github"],
    budget: "premium",
  });

  it("应该生成包含代码、研究、数据分析的完整团队", () => {
    const team = generateTestTeam(requirement, ctx);
    const ids = team.map((a) => a.id);
    // 优化后：无primary占位，动态上限=matched.length(最多6)
    // 需求触发: 写(copywriter) + 代码(code-assistant) + 调研(researcher) + 分析(data-analyst) + 报告(researcher已覆盖)
    expect(ids).toContain("code-assistant");
    expect(ids).toContain("data-analyst");
    expect(ids).toContain("researcher");
    // 不再因为4个上限被截断
    expect(team.length).toBeGreaterThanOrEqual(3);
  });

  it("编程助手应该有coding相关的tools和skills", () => {
    const team = generateTestTeam(requirement, ctx);
    inferAll(team, ctx);
    const coder = team.find((a) => a.id === "code-assistant");
    expect(coder).toBeDefined();
    const caps = coder!.inferredCapabilities!;
    // 应该有 coding-agent skill
    expect(caps.skills.some((s) => /coding|github/i.test(s))).toBe(true);
    // 应该有 group:fs 的 tool access
    expect(
      caps.tools.alsoAllow?.some((t) => /fs|runtime/i.test(t)) ||
        coder!.tools.allow?.includes("group:fs"),
    ).toBe(true);
  });

  it("研究员应该有web搜索和pdf相关能力", () => {
    const team = generateTestTeam(requirement, ctx);
    inferAll(team, ctx);
    const researcher = team.find((a) => a.id === "researcher");
    expect(researcher).toBeDefined();
    const caps = researcher!.inferredCapabilities!;
    // research场景应该有 web-researcher 和 nano-pdf
    expect(caps.skills.some((s) => /researcher|web-research|nano-pdf|summarize/i.test(s))).toBe(
      true,
    );
  });

  it("premium预算下不应该用cheap模型做复杂任务", () => {
    const team = generateTestTeam(requirement, ctx);
    inferAll(team, ctx);
    for (const agent of team) {
      const complexity = estimateRoleComplexity(agent.role);
      if (complexity === "complex") {
        const model = agent.inferredCapabilities!.model.primary;
        // 复杂角色+premium预算，不应该是cheap tier模型
        expect(model).not.toMatch(/qwen-turbo|glm-4-plus|doubao.*lite/);
      }
    }
  });

  it("pdf和github资源应该被覆盖", () => {
    const team = generateTestTeam(requirement, ctx);
    inferAll(team, ctx);
    const verification = verifyScene({
      requirement,
      blueprints: team,
      userCtx: ctx,
    });
    const resCheck = verification.checks.find((c) => c.name === "resource_coverage");
    expect(resCheck?.pass).toBe(true);
  });

  it("cap限制在4个agent之内", () => {
    const team = generateTestTeam(requirement, ctx);
    expect(team.length).toBeLessThanOrEqual(4);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST SCENARIO 4: 中文关键词边界 — 同义词陷阱
// 刁钻点：用户用不同说法表达同一需求，测试是否都能命中
// ═══════════════════════════════════════════════════════════════════════════

describe("场景4: 中文同义词边界测试", () => {
  it("「编程」「代码」「开发」都应该触发编程助手", () => {
    const variants = ["帮我编程", "帮我写代码", "我需要一个开发助手"];
    for (const req of variants) {
      const team = generateTestTeam(req, defaultCtx());
      const ids = team.map((a) => a.id);
      expect(ids).toContain("code-assistant");
    }
  });

  it("「调研」「研究」「报告」都应该触发研究员", () => {
    const variants = ["帮我做调研", "我需要做研究", "帮我写报告"];
    for (const req of variants) {
      const team = generateTestTeam(req, defaultCtx());
      const ids = team.map((a) => a.id);
      expect(ids).toContain("researcher");
    }
  });

  it("「客服」「咨询」「答疑」「接待」都应该触发客服", () => {
    const variants = ["搭建客服系统", "处理客户咨询", "在线答疑", "做一个接待机器人"];
    for (const req of variants) {
      const team = generateTestTeam(req, defaultCtx());
      const ids = team.map((a) => a.id);
      expect(ids).toContain("support-agent");
    }
  });

  it("「写」应该触发文案写手（且无primary占位）", () => {
    // 注意："写" 是单字符关键词，regex是 /写/ 应该命中
    const team = generateTestTeam("帮我写东西", defaultCtx());
    const ids = team.map((a) => a.id);
    expect(ids).toContain("copywriter");
    // 优化后：有具体角色匹配时不再有 primary-assistant
    expect(ids).not.toContain("primary-assistant");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST SCENARIO 5: 对抗性输入 — 超长需求 + 噪声
// 刁钻点：用户输入一大段废话，中间夹杂关键词
// ═══════════════════════════════════════════════════════════════════════════

describe("场景5: 对抗性输入", () => {
  it("超长噪声中的关键词仍应被提取", () => {
    const noise = "嗯嗯嗯其实吧我也不知道要做什么，就是最近有个想法吧，感觉挺好的，";
    const requirement = noise.repeat(5) + "想搞个客服系统帮我处理咨询" + noise.repeat(5);
    const team = generateTestTeam(requirement, defaultCtx());
    const ids = team.map((a) => a.id);
    expect(ids).toContain("support-agent");
  });

  it("纯英文需求也应该正常工作", () => {
    const team = generateTestTeam(
      "I need a team that can write content, analyze data, and provide customer support",
      defaultCtx(),
    );
    const ids = team.map((a) => a.id);
    expect(ids).toContain("copywriter");
    expect(ids).toContain("data-analyst");
    expect(ids).toContain("support-agent");
  });

  it("空白需求不应崩溃", () => {
    const team = generateTestTeam("", defaultCtx());
    expect(team.length).toBeGreaterThanOrEqual(1);
    expect(team[0].id).toBe("primary-assistant");
  });

  it("特殊字符需求不应崩溃", () => {
    const team = generateTestTeam("!!!@@@###$$$%%%^^^&&&***", defaultCtx());
    expect(team.length).toBeGreaterThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST SCENARIO 6: 能力推断精准度深度审计
// 刁钻点：验证 inferAgentCapabilities 对不同角色的推荐不会「撒胡椒面」
// ═══════════════════════════════════════════════════════════════════════════

describe("场景6: 能力推断精准度审计", () => {
  it("客服agent不应该推荐coding-agent skill", () => {
    const bp: AgentBlueprint = {
      name: "客服专员",
      id: "cs",
      role: "自动回答客户常见问题，处理咨询",
      soul: "",
      modelTier: "cheap",
      tools: { allow: ["group:web", "group:memory"] },
    };
    const caps = inferAgentCapabilities(bp, defaultCtx({ scenario: "customer_support" }));
    expect(caps.skills).not.toContain("coding-agent");
    expect(caps.skills).not.toContain("github");
  });

  it("编程助手不应该推荐xiaohongshu skill", () => {
    const bp: AgentBlueprint = {
      name: "编程助手",
      id: "coder",
      role: "编写、审查和调试代码",
      soul: "",
      modelTier: "mid",
      tools: { allow: ["group:fs", "group:web", "group:memory"], profile: "coding" },
    };
    const caps = inferAgentCapabilities(bp, defaultCtx({ scenario: "coding" }));
    expect(caps.skills).not.toContain("xiaohongshu");
    expect(caps.skills).not.toContain("calendar");
  });

  it("客服scenario应该推荐memory_search工具", () => {
    const bp: AgentBlueprint = {
      name: "客服",
      id: "cs",
      role: "客户服务接待",
      soul: "",
      modelTier: "cheap",
      tools: { allow: [] },
    };
    const caps = inferAgentCapabilities(bp, defaultCtx({ scenario: "customer_support" }));
    expect(caps.tools.alsoAllow).toContain("memory_search");
  });

  it("简单转发角色应该用cheap模型", () => {
    const bp: AgentBlueprint = {
      name: "消息转发",
      id: "fwd",
      role: "转发消息通知到指定渠道",
      soul: "",
      modelTier: "mid",
      tools: { allow: [] },
    };
    const caps = inferAgentCapabilities(bp, defaultCtx());
    const model = caps.model.primary;
    // 转发是simple角色，budget=balanced时应该被降级到cheap
    const cheapModels = [
      "deepseek/deepseek-chat",
      "qwen/qwen-turbo",
      "qwen/qwen-plus",
      "zhipu/glm-4-plus",
    ];
    expect(cheapModels.some((m) => model.includes(m.split("/")[1]))).toBe(true);
  });

  it("研究角色应该有heartbeat=undefined（非定时任务）", () => {
    const bp: AgentBlueprint = {
      name: "研究员",
      id: "researcher",
      role: "搜索资料、整理信息、撰写研究报告",
      soul: "",
      modelTier: "mid",
      tools: { allow: [] },
    };
    const caps = inferAgentCapabilities(bp, defaultCtx({ scenario: "research" }));
    // 研究不是定时任务，不应该有 heartbeat
    expect(caps.heartbeat).toBeUndefined();
  });

  it("定时提醒角色应该有heartbeat", () => {
    const bp: AgentBlueprint = {
      name: "提醒助手",
      id: "reminder",
      role: "定时提醒用户完成待办事项",
      soul: "",
      modelTier: "cheap",
      tools: { allow: [] },
    };
    const caps = inferAgentCapabilities(bp, defaultCtx({ scenario: "scheduling" }));
    expect(caps.heartbeat).toBeDefined();
    expect(caps.heartbeat?.every).toBe("24h");
  });

  it("知识库角色应该启用memorySearch", () => {
    const bp: AgentBlueprint = {
      name: "知识管家",
      id: "kb",
      role: "管理知识库，检索历史记录",
      soul: "",
      modelTier: "mid",
      tools: { allow: [] },
    };
    const caps = inferAgentCapabilities(bp, defaultCtx());
    expect(caps.memorySearch.enabled).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST SCENARIO 7: Pipeline多轮优化质量测试
// 刁钻点：构造有意义的问题蓝图，验证pipeline能否自动修复
// ═══════════════════════════════════════════════════════════════════════════

describe("场景7: Pipeline多轮优化质量", () => {
  it("应该修复complexity-model mismatch（复杂角色用cheap模型）", () => {
    const blueprints: AgentBlueprint[] = [
      {
        name: "代码架构师",
        id: "architect",
        role: "负责系统架构设计、代码审查和技术选型",
        soul: "",
        modelTier: "cheap", // 故意错误：complex角色用cheap
        tools: { allow: ["group:fs"] },
      },
    ];
    const result = runPipeline(
      "我需要一个架构师帮我做代码审查",
      blueprints,
      defaultCtx({ scenario: "coding" }),
    );
    // Pipeline应该检测到复杂度-模型不匹配并升级
    const refined = result.blueprints.find((a) => a.id === "architect");
    // 要么pipeline直接升级了modelTier，要么至少发出了warning
    const hasWarning = result.rounds.some((r) =>
      r.issues.some((i) => i.category === "feasibility" && i.agentId === "architect"),
    );
    const wasTierUpgraded = refined!.modelTier !== "cheap";
    expect(hasWarning || wasTierUpgraded).toBe(true);
  });

  it("应该检测重复agent ID", () => {
    const blueprints: AgentBlueprint[] = [
      {
        name: "助手A",
        id: "helper",
        role: "做事A",
        soul: "",
        modelTier: "mid",
        tools: { allow: [] },
      },
      {
        name: "助手B",
        id: "helper",
        role: "做事B",
        soul: "",
        modelTier: "mid",
        tools: { allow: [] },
      },
    ];
    const result = runPipeline("需要两个助手", blueprints, defaultCtx());
    // 应该有重复ID的error
    const hasIdError = result.rounds.some((r) =>
      r.issues.some((i) => i.category === "structure" && i.message.includes("helper")),
    );
    expect(hasIdError).toBe(true);
    // Pipeline应该自动去重
    const uniqueIds = new Set(result.blueprints.map((a) => a.id));
    expect(uniqueIds.size).toBe(result.blueprints.length);
  });

  it("应该检测团队规模过大（>8个成员）", () => {
    const blueprints: AgentBlueprint[] = [];
    for (let i = 0; i < 9; i++) {
      blueprints.push({
        name: `Agent ${i}`,
        id: `agent-${i}`,
        role: `处理任务 ${i}`,
        soul: "",
        modelTier: "cheap",
        tools: { allow: [] },
      });
    }
    const result = runPipeline("大团队", blueprints, defaultCtx());
    const hasSizeWarning = result.rounds.some((r) =>
      r.issues.some((i) => i.category === "structure" && i.message.includes("规模过大")),
    );
    expect(hasSizeWarning).toBe(true);
  });

  it("一次通过的蓝图不应产生多余refinement", () => {
    const blueprints: AgentBlueprint[] = [
      {
        name: "助手",
        id: "helper",
        role: "通用辅助任务",
        soul: "",
        modelTier: "mid",
        tools: { allow: ["group:web"] },
      },
    ];
    const result = runPipeline("我需要一个通用助手", blueprints, defaultCtx());
    // 没问题的蓝图，第一轮就应该通过
    expect(result.totalRounds).toBe(1);
    expect(result.refinementSummary).toContain("一次通过");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST SCENARIO 8: Supervisor角色检测准确性
// ═══════════════════════════════════════════════════════════════════════════

describe("场景8: Supervisor角色检测", () => {
  it("中文Supervisor关键词应该全部命中", () => {
    const supervisorRoles = [
      "负责分发用户消息到对应处理agent",
      "路由和调度团队任务",
      "协调各个agent的工作",
      "管理整个团队的运行",
      "作为总管统筹全局",
    ];
    for (const role of supervisorRoles) {
      expect(isSupervisorRole(role)).toBe(true);
    }
  });

  it("普通角色不应被误判为Supervisor", () => {
    const normalRoles = [
      "撰写和优化各类文案内容",
      "分析数据、生成报表和可视化",
      "编写、审查和调试代码",
      "搜索资料、整理信息",
    ];
    for (const role of normalRoles) {
      expect(isSupervisorRole(role)).toBe(false);
    }
  });

  it("id包含supervisor的应该命中", () => {
    expect(isSupervisorRole("普通角色描述", "team-supervisor")).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST SCENARIO 9: 角色复杂度估算准确性
// ═══════════════════════════════════════════════════════════════════════════

describe("场景9: 角色复杂度估算", () => {
  it("编程/分析/研究角色应该是complex", () => {
    expect(estimateRoleComplexity("编写代码和架构设计")).toBe("complex");
    expect(estimateRoleComplexity("数据分析和推理")).toBe("complex");
    expect(estimateRoleComplexity("深度调研和研究")).toBe("complex");
    expect(estimateRoleComplexity("Code review and debugging")).toBe("complex");
  });

  it("转发/通知/监控角色应该是simple", () => {
    expect(estimateRoleComplexity("转发消息到微信")).toBe("simple");
    expect(estimateRoleComplexity("定时提醒用户")).toBe("simple");
    expect(estimateRoleComplexity("监控系统状态")).toBe("simple");
    expect(estimateRoleComplexity("签到打卡")).toBe("simple");
  });

  it("写作/搜索/客服角色应该是moderate", () => {
    expect(estimateRoleComplexity("撰写和优化各类文案内容")).toBe("moderate");
    expect(estimateRoleComplexity("回答客户常见问题")).toBe("moderate");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST SCENARIO 10: MCP推荐精准度
// ═══════════════════════════════════════════════════════════════════════════

describe("场景10: MCP Server推荐精准度", () => {
  it("数据库相关角色应该推荐sqlite MCP", () => {
    const bp: AgentBlueprint = {
      name: "数据管理",
      id: "db",
      role: "管理数据库和执行SQL查询",
      soul: "",
      modelTier: "mid",
      tools: { allow: [] },
    };
    const caps = inferAgentCapabilities(bp, defaultCtx({ resources: ["database"] }));
    expect(caps.mcpHints.some((m) => /sqlite/i.test(m))).toBe(true);
  });

  it("github相关角色应该推荐github MCP", () => {
    const bp: AgentBlueprint = {
      name: "代码管理",
      id: "git",
      role: "管理github仓库和PR",
      soul: "",
      modelTier: "mid",
      tools: { allow: [] },
    };
    const caps = inferAgentCapabilities(bp, defaultCtx({ resources: ["github"] }));
    expect(caps.mcpHints.some((m) => /github/i.test(m))).toBe(true);
  });

  it("notion相关角色应该推荐notion MCP", () => {
    const bp: AgentBlueprint = {
      name: "笔记管理",
      id: "note",
      role: "管理notion文档和知识库",
      soul: "",
      modelTier: "mid",
      tools: { allow: [] },
    };
    const caps = inferAgentCapabilities(bp, defaultCtx({ resources: ["notion"] }));
    expect(caps.mcpHints.some((m) => /notion/i.test(m))).toBe(true);
  });

  it("纯文案角色不应推荐数据库MCP", () => {
    const bp: AgentBlueprint = {
      name: "文案写手",
      id: "writer",
      role: "撰写小红书文案和公众号文章",
      soul: "",
      modelTier: "mid",
      tools: { allow: [] },
    };
    const caps = inferAgentCapabilities(bp, defaultCtx({ scenario: "content" }));
    expect(caps.mcpHints.every((m) => !/sqlite|postgres/i.test(m))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST SCENARIO 11: 完整E2E — 「我要做一个小红书内容工厂」
// 刁钻点：这个需求非常具体，验证从团队生成到pipeline全流程
// ═══════════════════════════════════════════════════════════════════════════

describe("场景11: 小红书内容工厂E2E", () => {
  const requirement = "我要做一个小红书内容工厂，需要选题、写文案、配图";
  const ctx = defaultCtx({ scenario: "content" });

  it("应该触发文案写手（有'写'和'内容'关键词）", () => {
    const team = generateTestTeam(requirement, ctx);
    const ids = team.map((a) => a.id);
    expect(ids).toContain("copywriter");
  });

  it("文案agent应该有xiaohongshu skill", () => {
    // 虽然generateDefaultTeam的role比较笼统，但是inferAgentCapabilities
    // 基于scenario=content应该推荐xiaohongshu
    const team = generateTestTeam(requirement, ctx);
    inferAll(team, ctx);

    // 检查是否有任何agent被推荐了xiaohongshu skill
    const hasXiaohongshu = team.some((a) =>
      a.inferredCapabilities?.skills.some((s) => /xiaohongshu/i.test(s)),
    );
    // 这里是个重要的测试点：generateDefaultTeam的文案写手role是
    // "撰写和优化各类文案内容"，可能不会被inferSkills匹配到xiaohongshu
    // 但scenario=content的SCENARIO_SKILL_MAP包含xiaohongshu
    expect(hasXiaohongshu).toBe(true);
  });

  it("pipeline完整流程应该一次通过或最多2轮", () => {
    const team = generateTestTeam(requirement, ctx);
    const result = runPipeline(requirement, team, ctx);
    expect(result.totalRounds).toBeLessThanOrEqual(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST SCENARIO 12: generateDefaultTeam 缺陷审计
// 根据代码审查发现的问题设计的测试
// ═══════════════════════════════════════════════════════════════════════════

describe("场景12: generateDefaultTeam 改进验证", () => {
  it("【已修复】翻译需求现在能生成翻译agent", () => {
    const team = generateTestTeam("帮我做翻译工作", defaultCtx());
    const ids = team.map((a) => a.id);
    expect(ids).toContain("translator");
  });

  it("【已修复】新闻需求能生成新闻采编agent", () => {
    const team = generateTestTeam("帮我写新闻简报", defaultCtx());
    const ids = team.map((a) => a.id);
    // "新闻" 触发 news-editor, "写" 触发 copywriter
    expect(ids).toContain("news-editor");
    expect(ids).toContain("copywriter");
  });

  it("【已修复】动态上限不再丢失重要角色", () => {
    const requirement = "需要写文案、分析数据、做客服、写代码、做调研";
    const team = generateTestTeam(requirement, defaultCtx());
    const ids = team.map((a) => a.id);
    // 5个角色全部匹配，上限=min(6, 5)=5，不会截断
    expect(ids).toContain("copywriter");
    expect(ids).toContain("data-analyst");
    expect(ids).toContain("support-agent");
    expect(ids).toContain("code-assistant");
    expect(ids).toContain("researcher");
    expect(team.length).toBe(5);
  });

  it("【已修复】不再有无用的primary-assistant占位", () => {
    const team = generateTestTeam("帮我做翻译和写代码", defaultCtx());
    const ids = team.map((a) => a.id);
    // 有具体角色匹配时，不再添加通用primary-assistant
    expect(ids).not.toContain("primary-assistant");
    expect(ids).toContain("translator");
    expect(ids).toContain("code-assistant");
  });

  it("日程管理需求能生成日程管家", () => {
    const team = generateTestTeam("帮我管理日程和会议提醒", defaultCtx());
    const ids = team.map((a) => a.id);
    expect(ids).toContain("scheduler");
  });

  it("配图需求能生成配图助手", () => {
    const team = generateTestTeam("帮我做文案配图和封面设计", defaultCtx());
    const ids = team.map((a) => a.id);
    expect(ids).toContain("image-helper");
  });

  it("上限不超过6个agent", () => {
    // 触发尽可能多的角色
    const requirement = "写文案、写代码、分析数据、做客服、调研、翻译、配图、新闻简报、日程提醒";
    const team = generateTestTeam(requirement, defaultCtx());
    expect(team.length).toBeLessThanOrEqual(6);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST SCENARIO 13: Skills推荐上限和去重
// ═══════════════════════════════════════════════════════════════════════════

describe("场景13: Skills推荐上限控制", () => {
  it("每个agent的skills不应超过5个", () => {
    // 构造一个role触发尽可能多的skill keywords
    const bp: AgentBlueprint = {
      name: "全能助手",
      id: "all",
      role: "新闻搜索总结翻译代码编程pdf文档小红书数据分析客服",
      soul: "",
      modelTier: "mid",
      tools: { allow: [] },
    };
    const caps = inferAgentCapabilities(bp, defaultCtx({ scenario: "general" }));
    expect(caps.skills.length).toBeLessThanOrEqual(5);
  });

  it("每个agent的MCP hints不应超过7个", () => {
    const bp: AgentBlueprint = {
      name: "全能助手",
      id: "all",
      role: "数据库sql文件github git浏览器爬虫notion slack知识库pdf docker postgres搜索引擎",
      soul: "",
      modelTier: "mid",
      tools: { allow: [] },
    };
    const caps = inferAgentCapabilities(
      bp,
      defaultCtx({ resources: ["database", "github", "notion", "pdf"] }),
    );
    expect(caps.mcpHints.length).toBeLessThanOrEqual(7);
  });

  it("skills不应有重复项", () => {
    const bp: AgentBlueprint = {
      name: "研究员",
      id: "r",
      role: "搜索资料、整理信息、调研报告、研究论文",
      soul: "",
      modelTier: "mid",
      tools: { allow: [] },
    };
    const caps = inferAgentCapabilities(bp, defaultCtx({ scenario: "research" }));
    const uniqueSkills = new Set(caps.skills);
    expect(uniqueSkills.size).toBe(caps.skills.length);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST SCENARIO 14: Budget影响的全链路验证
// ═══════════════════════════════════════════════════════════════════════════

describe("场景14: Budget对模型选择的影响", () => {
  it("cheap预算应该把mid tier降级到cheap", () => {
    const bp: AgentBlueprint = {
      name: "助手",
      id: "h",
      role: "通用辅助",
      soul: "",
      modelTier: "mid",
      tools: { allow: [] },
    };
    const caps = inferAgentCapabilities(bp, defaultCtx({ budget: "cheap" }));
    // mid tier被降级到cheap，模型应该是cheap tier的
    const cheapModels = ["deepseek-chat", "qwen-turbo", "qwen-plus", "glm-4-plus"];
    expect(cheapModels.some((m) => caps.model.primary.includes(m))).toBe(true);
  });

  it("premium预算应该把cheap tier升级到mid", () => {
    const bp: AgentBlueprint = {
      name: "助手",
      id: "h",
      role: "通用辅助",
      soul: "",
      modelTier: "cheap",
      tools: { allow: [] },
    };
    const caps = inferAgentCapabilities(bp, defaultCtx({ budget: "premium" }));
    // cheap tier被升级到mid
    const midModels = ["deepseek-reasoner", "gpt-4o", "claude-sonnet", "glm-5"];
    expect(midModels.some((m) => caps.model.primary.includes(m))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST SCENARIO 11: Blueprint tools merge — 模板/蓝图定义的工具不应被丢弃
// ═══════════════════════════════════════════════════════════════════════════

describe("场景11: Blueprint tools merge into inferredCapabilities", () => {
  it("blueprint中定义的image_gen/image_edit应该出现在alsoAllow中", () => {
    const bp: AgentBlueprint = {
      name: "配图助手",
      id: "image-helper",
      role: "生成配图、封面和视觉素材",
      soul: "",
      modelTier: "mid",
      tools: { allow: ["group:web", "group:memory", "image_gen", "image_edit"] },
    };
    const caps = inferAgentCapabilities(bp, defaultCtx());
    const also = caps.tools.alsoAllow ?? [];
    expect(also).toContain("image_gen");
    expect(also).toContain("image_edit");
  });

  it("blueprint中定义的video_gen应该出现在alsoAllow中", () => {
    const bp: AgentBlueprint = {
      name: "视频创作",
      id: "video-creator",
      role: "生成和编辑短视频内容",
      soul: "",
      modelTier: "mid",
      tools: { allow: ["group:web", "group:memory", "video_gen", "image_gen"] },
    };
    const caps = inferAgentCapabilities(bp, defaultCtx());
    const also = caps.tools.alsoAllow ?? [];
    expect(also).toContain("video_gen");
    expect(also).toContain("image_gen");
  });

  it("blueprint中定义的cron/message应该出现在alsoAllow中", () => {
    const bp: AgentBlueprint = {
      name: "日程管家",
      id: "scheduler",
      role: "管理日程安排和定时提醒",
      soul: "",
      modelTier: "cheap",
      tools: { allow: ["group:memory", "cron", "message"] },
    };
    const caps = inferAgentCapabilities(bp, defaultCtx());
    const also = caps.tools.alsoAllow ?? [];
    expect(also).toContain("cron");
    expect(also).toContain("message");
  });

  it("blueprint中定义的tts应该出现在alsoAllow中", () => {
    const bp: AgentBlueprint = {
      name: "语音播报",
      id: "voice-artist",
      role: "语音合成与播报",
      soul: "",
      modelTier: "cheap",
      tools: { allow: ["group:memory", "tts"] },
    };
    const caps = inferAgentCapabilities(bp, defaultCtx());
    const also = caps.tools.alsoAllow ?? [];
    expect(also).toContain("tts");
  });

  it("blueprint skills应该被合并到inferredCapabilities.skills中", () => {
    const bp: AgentBlueprint = {
      name: "配图助手",
      id: "image-helper",
      role: "生成配图、封面和视觉素材",
      soul: "",
      modelTier: "mid",
      tools: {
        allow: ["group:web", "group:memory", "image_gen"],
        skills: ["openai-image-gen", "tongyi-image-gen"],
      },
    };
    const caps = inferAgentCapabilities(bp, defaultCtx());
    expect(caps.skills).toContain("openai-image-gen");
    expect(caps.skills).toContain("tongyi-image-gen");
  });

  it("inferTools关键词推断和bp.tools应该去重合并", () => {
    // role含"图片"触发inferTools推image_gen/image_edit，bp.tools也含image_gen
    const bp: AgentBlueprint = {
      name: "图片设计",
      id: "img",
      role: "图片设计与制作",
      soul: "",
      modelTier: "mid",
      tools: { allow: ["image_gen", "group:web"] },
    };
    const caps = inferAgentCapabilities(bp, defaultCtx());
    const also = caps.tools.alsoAllow ?? [];
    // 应该有image_gen（来自两个来源，去重后只出现一次）
    expect(also.filter((t) => t === "image_gen")).toHaveLength(1);
    // 应该也有image_edit（来自inferTools关键词推断）
    expect(also).toContain("image_edit");
    // group:web 应该在merged列表中
    expect(also).toContain("group:web");
  });

  it("空blueprint tools不应该影响inferTools结果", () => {
    const bp: AgentBlueprint = {
      name: "研究员",
      id: "researcher",
      role: "搜索资料、整理信息",
      soul: "",
      modelTier: "mid",
      tools: { allow: [] },
    };
    const caps = inferAgentCapabilities(bp, defaultCtx());
    // 即使bp.tools.allow为空，inferTools仍应正常工作
    expect(caps.tools.alsoAllow).toBeDefined();
    expect(caps.tools.alsoAllow!.length).toBeGreaterThan(0);
  });
});
