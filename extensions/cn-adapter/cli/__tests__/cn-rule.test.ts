import { describe, it, expect } from "vitest";
import { classifyRule, compileRule } from "../cn-rule.js";

describe("classifyRule", () => {
  it("classifies '禁止' as guard", () => {
    expect(classifyRule("禁止删除 /etc 下的文件")).toBe("guard");
  });

  it("classifies '不允许' as guard", () => {
    expect(classifyRule("不允许执行 rm -rf")).toBe("guard");
  });

  it("classifies '阻止' as guard", () => {
    expect(classifyRule("阻止访问外部网络")).toBe("guard");
  });

  it("classifies 'block' as guard (case insensitive)", () => {
    expect(classifyRule("Block all DELETE requests")).toBe("guard");
  });

  it("classifies '总是' as policy", () => {
    expect(classifyRule("总是用中文回复")).toBe("policy");
  });

  it("classifies 'always' as policy (case insensitive)", () => {
    expect(classifyRule("Always respond in Chinese")).toBe("policy");
  });

  it("classifies '每次' as policy", () => {
    expect(classifyRule("每次回复前先思考")).toBe("policy");
  });

  it("classifies '技能' as skill", () => {
    expect(classifyRule("技能：翻译英文文档")).toBe("skill");
  });

  it("classifies 'skill' as skill", () => {
    expect(classifyRule("skill: translate documents")).toBe("skill");
  });

  it("classifies '当...时' as skill", () => {
    expect(classifyRule("当用户说翻译时，执行翻译操作")).toBe("skill");
  });

  it("defaults to policy for unmatched descriptions", () => {
    expect(classifyRule("优先使用国内模型")).toBe("policy");
  });

  it("guard takes priority over policy when both keywords present", () => {
    // "禁止" matches guard first (checked before policy)
    expect(classifyRule("禁止总是删除文件")).toBe("guard");
  });
});

describe("compileRule", () => {
  it("compiles guard rule", () => {
    const rule = compileRule("禁止删除 /etc 下的文件", "guard");
    expect(rule).toEqual({
      type: "guard",
      pattern: "禁止删除 /etc 下的文件",
      action: "block",
    });
  });

  it("compiles policy rule", () => {
    const rule = compileRule("总是用中文回复", "policy");
    expect(rule).toEqual({
      type: "policy",
      content: "总是用中文回复",
    });
  });

  it("compiles skill rule with '当...时，...' pattern", () => {
    const rule = compileRule("当用户说翻译时，执行翻译操作", "skill");
    expect(rule).toEqual({
      type: "skill",
      trigger: "用户说翻译",
      action: "执行翻译操作",
    });
  });

  it("compiles skill rule with comma variant", () => {
    const rule = compileRule("当用户问天气时,查询天气API", "skill");
    expect(rule).toEqual({
      type: "skill",
      trigger: "用户问天气",
      action: "查询天气API",
    });
  });

  it("falls back for skill rule without '当...时' pattern", () => {
    const rule = compileRule("翻译用户的文档", "skill");
    expect(rule).toEqual({
      type: "skill",
      trigger: "翻译用户的文档",
      action: "翻译用户的文档",
    });
  });
});

describe("--type manual override", () => {
  it("manual guard overrides heuristic", () => {
    // "总是" would normally be policy, but --type guard overrides
    const rule = compileRule("总是检查安全", "guard");
    expect(rule.type).toBe("guard");
    expect(rule).toHaveProperty("action", "block");
  });

  it("manual skill overrides heuristic", () => {
    // "禁止" would normally be guard, but --type skill overrides
    const rule = compileRule("禁止未授权访问", "skill");
    expect(rule.type).toBe("skill");
  });

  it("manual policy overrides heuristic", () => {
    // "当...时" would normally be skill, but --type policy overrides
    const rule = compileRule("当用户提问时回复", "policy");
    expect(rule.type).toBe("policy");
    expect(rule).toHaveProperty("content", "当用户提问时回复");
  });
});
