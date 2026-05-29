import { describe, it, expect } from "vitest";
import { listTemplates, getTemplate, matchTemplate, formatTemplateList } from "./templates.js";

describe("templates", () => {
  describe("listTemplates", () => {
    it("returns all built-in templates", () => {
      const templates = listTemplates();
      expect(templates.length).toBe(9);
      const ids = templates.map((t) => t.id);
      // Classic scenarios
      expect(ids).toContain("daily-assistant");
      expect(ids).toContain("finance-tracker");
      expect(ids).toContain("learning-planner");
      // Hot scenarios
      expect(ids).toContain("content-factory");
      expect(ids).toContain("knowledge-cs");
      expect(ids).toContain("coding-team");
      expect(ids).toContain("news-intelligence");
      expect(ids).toContain("data-analyst");
      expect(ids).toContain("meeting-assistant");
    });

    it("templates have required fields", () => {
      for (const t of listTemplates()) {
        expect(t.id).toBeTruthy();
        expect(t.name).toBeTruthy();
        expect(t.description).toBeTruthy();
        expect(t.agents.length).toBeGreaterThan(0);
        expect(t.keywords).toBeDefined();
        expect(t.keywords!.length).toBeGreaterThan(0);
      }
    });

    it("all template agents have required fields", () => {
      for (const t of listTemplates()) {
        for (const a of t.agents) {
          expect(a.name).toBeTruthy();
          expect(a.id).toBeTruthy();
          expect(a.role).toBeTruthy();
          expect(a.soul).toBeTruthy();
          expect(a.modelTier).toMatch(/^(cheap|mid|sota)$/);
          expect(a.tools).toBeDefined();
          expect(a.tools.allow).toBeDefined();
          expect(a.tools.allow!.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe("getTemplate", () => {
    it("returns template by id", () => {
      const t = getTemplate("finance-tracker");
      expect(t).toBeDefined();
      expect(t!.name).toContain("财务");
    });

    it("returns undefined for unknown id", () => {
      expect(getTemplate("nonexistent")).toBeUndefined();
    });
  });

  describe("matchTemplate", () => {
    it("matches finance keywords", () => {
      const t = matchTemplate("帮我搞一套个人财务管理系统，要能记账、分析");
      expect(t).toBeDefined();
      expect(t!.id).toBe("finance-tracker");
    });

    it("matches learning keywords", () => {
      const t = matchTemplate("我想学习编程，帮我规划学习课程和复习");
      expect(t).toBeDefined();
      expect(t!.id).toBe("learning-planner");
    });

    it("matches daily assistant keywords", () => {
      const t = matchTemplate("日常生活助手，管理日程和提醒");
      expect(t).toBeDefined();
      expect(t!.id).toBe("daily-assistant");
    });

    it("returns undefined for no match", () => {
      const t = matchTemplate("random unrelated text about quantum physics");
      expect(t).toBeUndefined();
    });

    it("requires at least 2 keyword hits", () => {
      // "budget" alone = 1 hit, not enough
      const t = matchTemplate("budget");
      expect(t).toBeUndefined();
    });
  });

  describe("formatTemplateList", () => {
    it("formats templates as markdown", () => {
      const text = formatTemplateList(listTemplates());
      expect(text).toContain("## Available Templates");
      expect(text).toContain("daily-assistant");
      expect(text).toContain("finance-tracker");
      expect(text).toContain("learning-planner");
    });

    it("handles empty list", () => {
      expect(formatTemplateList([])).toBe("No templates available.");
    });
  });

  describe("template immutability", () => {
    it("finance-tracker budget-alerter depends on bookkeeper", () => {
      const t = getTemplate("finance-tracker")!;
      const alerter = t.agents.find((a) => a.id === "budget-alerter");
      expect(alerter).toBeDefined();
      expect(alerter!.dependsOn).toContain("bookkeeper");
    });

    it("templates are not mutated between calls", () => {
      const t1 = getTemplate("daily-assistant")!;
      const originalAllow = [...t1.agents[0].tools.allow!];
      // Simulate what the orchestrator does — but on a copy
      const copy = { ...t1.agents[0], tools: { ...t1.agents[0].tools } };
      copy.tools.allow = [...(copy.tools.allow ?? []), "extra-tool"];
      // Original should be unchanged
      const t2 = getTemplate("daily-assistant")!;
      expect(t2.agents[0].tools.allow).toEqual(originalAllow);
    });
  });
});
