import type { Command } from "commander";
import { createCnLogger } from "../utils/index.js";

const log = createCnLogger("rule");

type RuleType = "guard" | "policy" | "skill";

type GuardRule = { type: "guard"; pattern: string; action: "block" };
type PolicyRule = { type: "policy"; content: string };
type SkillRule = { type: "skill"; trigger: string; action: string };
type CompiledRule = GuardRule | PolicyRule | SkillRule;

const GUARD_KEYWORDS = ["禁止", "不允许", "阻止", "block"];
const POLICY_KEYWORDS = ["总是", "always", "每次"];
const SKILL_KEYWORDS = ["技能", "skill", "当"];

/**
 * 关键词启发式分类：根据自然语言描述推断规则类型。
 */
export function classifyRule(description: string): RuleType {
  const lower = description.toLowerCase();
  if (GUARD_KEYWORDS.some((kw) => lower.includes(kw))) return "guard";
  if (POLICY_KEYWORDS.some((kw) => lower.includes(kw))) return "policy";
  if (SKILL_KEYWORDS.some((kw) => lower.includes(kw))) return "skill";
  // 默认当 policy 处理
  return "policy";
}

/**
 * 将自然语言描述编译为结构化规则 JSON。
 */
export function compileRule(description: string, type: RuleType): CompiledRule {
  switch (type) {
    case "guard":
      return { type: "guard", pattern: description, action: "block" };
    case "policy":
      return { type: "policy", content: description };
    case "skill": {
      // 尝试从"当...时，..."模式中提取 trigger 和 action
      const match = description.match(/当(.+?)时[，,]\s*(.+)/);
      if (match) {
        return { type: "skill", trigger: match[1]!.trim(), action: match[2]!.trim() };
      }
      return { type: "skill", trigger: description, action: description };
    }
  }
}

function isValidRuleType(v: string): v is RuleType {
  return v === "guard" || v === "policy" || v === "skill";
}

/**
 * 注册 `openclaw cn-rule` CLI 命令。
 *
 * 用法：
 *   openclaw cn-rule "禁止删除 /etc 下的文件"
 *   openclaw cn-rule --type guard "不要执行 rm -rf"
 *   openclaw cn-rule --apply "总是用中文回复"
 */
export function registerCnRule(program: Command): void {
  program
    .command("cn-rule <description>")
    .description("将自然语言描述编译为结构化规则")
    .option("--type <type>", "手动指定规则类型: guard|policy|skill")
    .option("--apply", "将规则写入配置（骨架版）")
    .action((description: string, opts: { type?: string; apply?: boolean }) => {
      // 确定规则类型
      let ruleType: RuleType;
      if (opts.type) {
        if (!isValidRuleType(opts.type)) {
          console.error(`无效的规则类型: ${opts.type}，可选: guard, policy, skill`);
          return;
        }
        ruleType = opts.type;
      } else {
        ruleType = classifyRule(description);
      }

      // 编译规则
      const rule = compileRule(description, ruleType);

      // 输出 JSON
      console.log(JSON.stringify(rule, null, 2));

      if (opts.apply) {
        // 骨架版：暂不写入配置
        log.info("规则已生成，请手动添加到配置文件");
        console.log("\n规则已生成，请手动添加到配置文件");
      }
    });
}
