/**
 * Gathering Questions Generator
 *
 * Given a user's raw requirement text, generates 2-3 clarifying questions
 * with clickable options. This runs purely client-side (no LLM call needed).
 *
 * Logic: keyword analysis → scenario detection → gap identification → questions
 */

import type { GatheringQuestion } from "../types.js";

// ── Scenario Detection ──────────────────────────────────────────────────

type DetectedScenario = {
  scenario: string;
  confidence: number;
};

const SCENARIO_KEYWORDS: Record<string, string[]> = {
  customer_support: ["客服", "客户", "售前", "售后", "咨询", "服务", "工单", "FAQ", "接待"],
  content: ["内容", "自媒体", "文案", "小红书", "公众号", "抖音", "写作", "创作", "运营", "文章"],
  coding: ["代码", "编程", "开发", "程序", "bug", "技术", "项目", "code", "dev"],
  research: ["新闻", "情报", "资讯", "追踪", "监控", "简报", "调研", "动态"],
  data_analysis: ["数据", "分析", "报表", "统计", "Excel", "趋势", "可视化"],
  scheduling: ["会议", "日程", "日历", "安排", "提醒", "待办", "纪要"],
  finance: ["财务", "记账", "收支", "预算", "消费", "理财"],
  learning: ["学习", "备考", "课程", "复习", "笔记", "知识", "考试"],
};

function detectScenario(requirement: string): DetectedScenario {
  const lower = requirement.toLowerCase();
  let best = { scenario: "general", confidence: 0 };

  for (const [scenario, keywords] of Object.entries(SCENARIO_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      if (lower.includes(kw.toLowerCase())) score++;
    }
    if (score > best.confidence) {
      best = { scenario, confidence: score };
    }
  }

  return best;
}

// ── Question Templates ──────────────────────────────────────────────────

type QuestionTemplate = {
  key: string;
  text: string;
  options: string[];
  /** Only show this question for these scenarios (empty = always show) */
  scenarios?: string[];
  /** Skip if this keyword is already in the requirement */
  skipIfMentioned?: string[];
};

const ALL_QUESTIONS: QuestionTemplate[] = [
  // Universal: scenario clarification (only when detection is low confidence)
  {
    key: "scenario",
    text: "你主要想用来做什么？",
    options: ["内容创作", "客户服务", "数据分析", "编程辅助", "学习备考", "信息追踪", "日程管理"],
  },
  // Universal: volume
  {
    key: "volume",
    text: "预计每天大概多少条消息？",
    options: ["偶尔用用 (10条以内)", "日常使用 (10~50条)", "高频使用 (50条以上)"],
    skipIfMentioned: ["偶尔", "每天", "高频", "频率"],
  },
  // Universal: budget
  {
    key: "budget",
    text: "模型选择偏好？",
    options: ["便宜够用就行", "性价比均衡", "效果最好的"],
    skipIfMentioned: ["便宜", "免费", "预算", "效果好", "最强"],
  },
  // Scenario-specific
  {
    key: "platform",
    text: "主要发布在哪个平台？",
    options: ["小红书", "微信公众号", "抖音", "B站", "多个平台"],
    scenarios: ["content"],
    skipIfMentioned: ["小红书", "公众号", "抖音", "B站"],
  },
  {
    key: "channel",
    text: "客服消息从哪个渠道过来？",
    options: ["微信", "钉钉", "飞书", "网页", "暂时不接渠道"],
    scenarios: ["customer_support"],
    skipIfMentioned: ["微信", "钉钉", "飞书", "网页"],
  },
  {
    key: "language",
    text: "主要用什么编程语言？",
    options: ["Python", "JavaScript/TypeScript", "Java", "Go", "多种语言"],
    scenarios: ["coding"],
    skipIfMentioned: ["python", "javascript", "typescript", "java", "go", "rust"],
  },
  {
    key: "domain",
    text: "关注哪个领域的信息？",
    options: ["AI / 科技", "金融 / 财经", "电商 / 消费", "教育", "其他行业"],
    scenarios: ["research"],
    skipIfMentioned: ["AI", "科技", "金融", "电商", "教育"],
  },
  {
    key: "data_source",
    text: "数据主要来自什么格式？",
    options: ["Excel / CSV", "数据库 / SQL", "API 接口", "网页采集"],
    scenarios: ["data_analysis"],
    skipIfMentioned: ["excel", "csv", "数据库", "sql", "api"],
  },
  {
    key: "exam",
    text: "在准备什么考试或学什么技能？",
    options: ["英语考试", "计算机/编程", "考研/考公", "职业技能", "兴趣爱好"],
    scenarios: ["learning"],
    skipIfMentioned: ["英语", "考研", "考公", "四级", "六级"],
  },
];

// ── Main Generator ──────────────────────────────────────────────────────

/**
 * Generate 2-3 clarifying questions based on the user's requirement text.
 */
export function generateGatheringQuestions(requirement: string): GatheringQuestion[] {
  const detected = detectScenario(requirement);
  const questions: GatheringQuestion[] = [];

  for (const tpl of ALL_QUESTIONS) {
    // Already have enough questions
    if (questions.length >= 3) break;

    // Skip scenario question if we already detected confidently
    if (tpl.key === "scenario" && detected.confidence >= 2) continue;

    // Skip scenario-specific questions that don't match
    if (tpl.scenarios && tpl.scenarios.length > 0) {
      if (!tpl.scenarios.includes(detected.scenario)) continue;
    }

    // Skip if the user already mentioned the answer
    if (tpl.skipIfMentioned?.some((kw) => requirement.toLowerCase().includes(kw.toLowerCase()))) {
      continue;
    }

    questions.push({
      key: tpl.key,
      text: tpl.text,
      options: tpl.options,
    });
  }

  // Ensure at least 2 questions
  if (questions.length < 2) {
    const missing = ALL_QUESTIONS.filter(
      (tpl) =>
        tpl.key !== "scenario" && !tpl.scenarios && !questions.some((q) => q.key === tpl.key),
    );
    for (const tpl of missing) {
      if (questions.length >= 2) break;
      questions.push({ key: tpl.key, text: tpl.text, options: tpl.options });
    }
  }

  return questions;
}

/**
 * Build a UserContext-compatible answers map from answered questions.
 */
export function buildAnswersMap(
  questions: GatheringQuestion[],
  requirement: string,
): Record<string, string> {
  const map: Record<string, string> = { requirement };
  for (const q of questions) {
    if (q.answer) {
      map[q.key] = q.answer;
    }
  }
  return map;
}
