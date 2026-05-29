/**
 * SOUL Structure Validator
 *
 * Validates that a SOUL.md file contains the required sections
 * for quality assurance before deployment.
 */

// Required sections in a SOUL.md file
const REQUIRED_SECTIONS = [
  { key: "role", patterns: [/^#+\s*角色/m, /^#+\s*role/im, /^#+\s*定义/m] },
  { key: "duties", patterns: [/^#+\s*职责/m, /^#+\s*核心/m, /^#+\s*dut/im, /^#+\s*responsib/im] },
  {
    key: "rules",
    patterns: [/^#+\s*准则/m, /^#+\s*行为/m, /^#+\s*规则/m, /^#+\s*rule/im, /^#+\s*behav/im],
  },
  {
    key: "boundaries",
    patterns: [/^#+\s*边界/m, /^#+\s*能力.*边界/m, /^#+\s*boundar/im, /^#+\s*limit/im],
  },
  {
    key: "collaboration",
    patterns: [/^#+\s*协作/m, /^#+\s*协同/m, /^#+\s*collab/im, /^#+\s*handoff/im],
  },
] as const;

const SECTION_NAMES: Record<string, string> = {
  role: "角色定义",
  duties: "核心职责",
  rules: "行为准则",
  boundaries: "能力边界",
  collaboration: "协作指令",
};

export type SoulValidationResult = {
  valid: boolean;
  missing: string[];
  /** Ratio of sections found (0-1) */
  completeness: number;
};

/**
 * Validate that a SOUL.md content contains the required structural sections.
 *
 * Returns { valid: true } if at least 3 of 5 required sections are present.
 * Returns details about missing sections if not.
 */
export function validateSoulStructure(content: string): SoulValidationResult {
  if (!content || content.trim().length < 30) {
    return {
      valid: false,
      missing: Object.values(SECTION_NAMES),
      completeness: 0,
    };
  }

  const found: string[] = [];
  const missing: string[] = [];

  for (const section of REQUIRED_SECTIONS) {
    const hasSection = section.patterns.some((p) => p.test(content));
    if (hasSection) {
      found.push(section.key);
    } else {
      missing.push(SECTION_NAMES[section.key]);
    }
  }

  const completeness = found.length / REQUIRED_SECTIONS.length;

  // Valid if at least 3 of 5 sections present
  return {
    valid: found.length >= 3,
    missing,
    completeness,
  };
}

/**
 * Generate a SOUL generation prompt for the LLM.
 * This is returned as tool output to guide the outer LLM.
 */
export function buildSoulGenerationPrompt(
  agentName: string,
  agentRole: string,
  scenario: string,
  teammates: Array<{ name: string; role: string }>,
): string {
  const teammateList =
    teammates.length > 0
      ? teammates.map((t) => `- ${t.name}: ${t.role}`).join("\n")
      : "（独立工作，无团队成员）";

  return [
    `请为 "${agentName}" 编写 SOUL.md 工作指南。`,
    "",
    `角色: ${agentRole}`,
    `场景: ${scenario}`,
    `团队成员:`,
    teammateList,
    "",
    "SOUL.md 必须包含以下章节：",
    "",
    "## 角色定义",
    "2-3 句话说明「你是谁」「你负责什么」",
    "",
    "## 核心职责",
    "3-5 条具体可操作的职责",
    "",
    "## 行为准则",
    "3-5 条具体规则：输入格式、输出格式、异常处理",
    "",
    "## 能力边界",
    "2-3 条「不该做的事」，指明应转交给谁",
    "",
    "## 协作指令",
    "与团队成员的协作规则",
    "",
    "约束：全部用中文，300-600 字，用「你」不用「您」，不说模糊承诺。",
  ].join("\n");
}
