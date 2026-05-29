/**
 * Tool Discovery — 纯内存关键词匹配工具发现
 *
 * 从用户 prompt 中提取关键词，与已注册工具的名称/描述匹配，
 * 返回 top-N 最相关的工具摘要。
 *
 * 性能目标：< 20ms（200 工具以内，纯内存计算）
 *
 * 参考 clawdbot auto-discovery.ts 的精简版，砍掉了：
 * - Skills/MCP marketplace 搜索（插件层不需要）
 * - 向量搜索 / embedding API（过重）
 * - SQLite FTS5 索引（大炮打蚊子）
 */

import { createCnLogger } from "../utils/index.js";

const log = createCnLogger("dispatch:discovery");

// ============================================================================
// Types
// ============================================================================

export type ToolMeta = {
  name: string;
  description?: string;
  tags?: string[];
};

export type DiscoveryResult = {
  /** 按相关度排序的工具名 */
  toolHints: string[];
  /** 整体匹配置信度 0-1 */
  confidence: number;
  /** 调试摘要（可注入 prompt） */
  summary: string;
  /** 耗时 ms */
  latencyMs: number;
};

type ScoredTool = {
  name: string;
  score: number;
  matchedTerms: string[];
};

// ============================================================================
// 中英文停用词
// ============================================================================

const STOP_WORDS = new Set([
  // Chinese
  "的",
  "了",
  "是",
  "在",
  "我",
  "有",
  "和",
  "就",
  "不",
  "人",
  "都",
  "一",
  "一个",
  "帮我",
  "帮忙",
  "请",
  "能不能",
  "可以",
  "想要",
  "需要",
  "这个",
  "那个",
  "什么",
  "怎么",
  "为什么",
  "吗",
  "呢",
  "把",
  "被",
  "对",
  "让",
  // English function words (< 4 chars filtered anyway, but explicit)
  "the",
  "for",
  "and",
  "not",
  "but",
  "all",
  "any",
  "get",
  "set",
  "run",
  "use",
  "new",
  "try",
  "let",
  "how",
  "why",
  "what",
  "that",
  "this",
  "with",
  "from",
  "they",
  "them",
  "than",
  "then",
  "also",
  "just",
  "like",
  "make",
  "want",
  "some",
  "into",
  "only",
  "very",
  "when",
  "come",
  "here",
  "there",
  "about",
  "have",
  "been",
  "will",
  "would",
  "should",
  "could",
  "might",
  "must",
]);

// ============================================================================
// 内置工具元数据（核心工具 + 中文关键词）
// ============================================================================

const BUILTIN_TOOLS: ToolMeta[] = [
  { name: "web_search", description: "网页搜索 search google bing query", tags: ["搜索", "查询"] },
  { name: "web_fetch", description: "网页抓取 fetch url crawl", tags: ["抓取", "获取", "爬虫"] },
  {
    name: "image_gen",
    description: "图像生成 image draw dalle generate picture",
    tags: ["画图", "生成图", "图片", "画画"],
  },
  {
    name: "desktop_control",
    description: "桌面控制 gui click mouse keyboard",
    tags: ["桌面", "操作"],
  },
  { name: "open_app", description: "打开应用 launch open start", tags: ["打开", "启动"] },
  { name: "bash", description: "命令执行 shell terminal command", tags: ["命令", "执行", "终端"] },
  { name: "read", description: "读取文件 read file cat view", tags: ["读取", "查看"] },
  { name: "write", description: "写入文件 write create file", tags: ["写入", "创建"] },
  { name: "edit", description: "编辑文件 edit modify change", tags: ["编辑", "修改"] },
  { name: "glob", description: "查找文件 glob find pattern", tags: ["查找", "搜索文件"] },
  { name: "grep", description: "搜索内容 grep search content", tags: ["搜索内容", "grep"] },
  { name: "browser", description: "浏览器控制 browser chrome web", tags: ["浏览器", "chrome"] },
  { name: "sessions_spawn", description: "创建会话 spawn session", tags: ["创建会话"] },
  { name: "message", description: "消息通知 message notification", tags: ["消息", "通知"] },
  { name: "tts", description: "语音合成 text to speech speak", tags: ["语音", "朗读"] },
  { name: "wechat_send", description: "微信发送 wechat weixin send", tags: ["微信", "发微信"] },
];

// ============================================================================
// 关键词提取（中英文分词）
// ============================================================================

/**
 * 从用户 prompt 中提取关键词。
 * - 中文：2-3 字滑动窗口
 * - 英文：>= 4 字符的单词，去停用词
 */
export function extractKeywords(text: string): string[] {
  const lower = text.toLowerCase();

  // 中文分词（2-3 字滑动窗口）
  const cjkTerms: string[] = [];
  const cjkChars = lower.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g) || [];
  if (cjkChars.length >= 2) {
    for (let i = 0; i < cjkChars.length - 1; i++) {
      const bi = cjkChars[i]! + cjkChars[i + 1]!;
      if (!STOP_WORDS.has(bi)) cjkTerms.push(bi);
      if (i < cjkChars.length - 2) {
        const tri = cjkChars[i]! + cjkChars[i + 1]! + cjkChars[i + 2]!;
        if (!STOP_WORDS.has(tri)) cjkTerms.push(tri);
      }
    }
  }

  // 英文分词：>= 4 字符，去停用词
  const asciiTerms = lower
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOP_WORDS.has(w));

  return [...new Set([...cjkTerms, ...asciiTerms])];
}

// ============================================================================
// 评分算法
// ============================================================================

/**
 * 关键词匹配评分。
 * - 名称/描述包含关键词 → +1 分
 * - 标签完全匹配 → +2 分（更精准）
 * - 反向匹配（工具标签出现在 prompt 中）→ +1 分
 *
 * 归一化：matched / keywords.length → 0-1
 */
function scoreTool(
  keywords: string[],
  tool: ToolMeta,
  lowerPrompt: string,
): ScoredTool | undefined {
  if (keywords.length === 0) return undefined;

  const searchText = [tool.name, tool.description ?? ""].join(" ").toLowerCase();
  const tags = (tool.tags ?? []).map((t) => t.toLowerCase());

  let matched = 0;
  const matchedTerms: string[] = [];

  // 正向匹配：关键词出现在工具元数据中
  for (const kw of keywords) {
    if (searchText.includes(kw)) {
      matched++;
      matchedTerms.push(kw);
    } else if (tags.some((tag) => tag.includes(kw))) {
      matched += 2; // 标签匹配权重更高
      matchedTerms.push(`tag:${kw}`);
    }
  }

  // 反向匹配：工具标签出现在用户 prompt 中
  for (const tag of tags) {
    if (lowerPrompt.includes(tag) && !matchedTerms.includes(`rev:${tag}`)) {
      matched++;
      matchedTerms.push(`rev:${tag}`);
    }
  }

  const score = Math.min(1.0, matched / keywords.length);
  if (score < 0.08) return undefined;

  return { name: tool.name, score, matchedTerms };
}

// ============================================================================
// 主入口
// ============================================================================

/**
 * 从用户 prompt 发现最相关的工具。
 *
 * @param prompt - 用户输入
 * @param registeredTools - 运行时已注册的工具（可选，用于补充内置列表）
 * @param topN - 返回前 N 个结果
 */
export function discoverTools(
  prompt: string,
  registeredTools?: ToolMeta[],
  topN = 5,
): DiscoveryResult {
  const startTime = performance.now();
  const keywords = extractKeywords(prompt);

  if (keywords.length === 0) {
    return {
      toolHints: [],
      confidence: 0,
      summary: "",
      latencyMs: performance.now() - startTime,
    };
  }

  const lowerPrompt = prompt.toLowerCase();

  // 合并内置工具 + 运行时注册工具（去重，运行时覆盖内置）
  const allTools = mergeTools(BUILTIN_TOOLS, registeredTools ?? []);

  // 评分
  const scored: ScoredTool[] = [];
  for (const tool of allTools) {
    const result = scoreTool(keywords, tool, lowerPrompt);
    if (result) scored.push(result);
  }

  // 按分数降序排列
  scored.sort((a, b) => b.score - a.score);
  const topResults = scored.slice(0, topN);

  const latencyMs = performance.now() - startTime;
  const toolHints = topResults.map((r) => r.name);
  const confidence = topResults.length > 0 ? topResults[0]!.score : 0;

  // 生成可注入 prompt 的摘要
  const summary =
    topResults.length > 0
      ? `推荐工具: ${topResults.map((r) => `${r.name}(${r.score.toFixed(2)})`).join(", ")}`
      : "";

  if (topResults.length > 0) {
    log.debug(`discovery [${latencyMs.toFixed(0)}ms] ${summary}`);
  }

  return { toolHints, confidence, summary, latencyMs };
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * 合并内置工具和运行时工具，运行时同名工具覆盖内置。
 */
function mergeTools(builtins: ToolMeta[], runtime: ToolMeta[]): ToolMeta[] {
  const byName = new Map<string, ToolMeta>();
  for (const t of builtins) byName.set(t.name, t);
  for (const t of runtime) byName.set(t.name, t);
  return Array.from(byName.values());
}
