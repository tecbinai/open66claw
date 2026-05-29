import { describe, expect, it } from "vitest";
import {
  buildRoutesFromMembers,
  extractKeywordsFromRole,
  matchKeywordRoute,
} from "../keyword-router.js";

describe("keyword-router", () => {
  describe("matchKeywordRoute", () => {
    const routes = [
      { pattern: "weather", agentId: "weather-bot", priority: 50 },
      { pattern: "booking", agentId: "booking-bot", priority: 50 },
      { pattern: "account", agentId: "account-bot", priority: 50 },
    ];

    it("matches exact keyword", () => {
      const result = matchKeywordRoute("What's the weather today?", routes);
      expect(result).not.toBeNull();
      expect(result!.agentId).toBe("weather-bot");
    });

    it("matches case-insensitively", () => {
      const result = matchKeywordRoute("BOOKING please", routes);
      expect(result).not.toBeNull();
      expect(result!.agentId).toBe("booking-bot");
    });

    it("returns null for no match", () => {
      const result = matchKeywordRoute("Hello world", routes);
      expect(result).toBeNull();
    });

    it("respects priority ordering", () => {
      const priorityRoutes = [
        { pattern: "help", agentId: "general", priority: 100 },
        { pattern: "help", agentId: "urgent", priority: 10 },
      ];
      const result = matchKeywordRoute("I need help", priorityRoutes);
      expect(result).not.toBeNull();
      expect(result!.agentId).toBe("urgent");
    });

    it("handles CJK keywords", () => {
      const cjkRoutes = [
        { pattern: "天气", agentId: "weather-cn", priority: 50 },
        { pattern: "订单", agentId: "order-cn", priority: 50 },
      ];
      const result = matchKeywordRoute("今天天气怎么样", cjkRoutes);
      expect(result).not.toBeNull();
      expect(result!.agentId).toBe("weather-cn");
    });

    it("returns null for empty message", () => {
      expect(matchKeywordRoute("", routes)).toBeNull();
    });

    it("returns null for empty routes", () => {
      expect(matchKeywordRoute("hello", [])).toBeNull();
    });

    it("picks longer match with same priority for higher confidence", () => {
      const overlapRoutes = [
        { pattern: "book", agentId: "short", priority: 50 },
        { pattern: "booking", agentId: "long", priority: 50 },
      ];
      const result = matchKeywordRoute("I want booking", overlapRoutes);
      expect(result).not.toBeNull();
      expect(result!.agentId).toBe("long");
    });
  });

  describe("extractKeywordsFromRole", () => {
    it("extracts meaningful keywords from Chinese role", () => {
      // "和" splits: ["负责客户订单查询", "售后服务"]
      // "负责" is a stop word but only matches whole tokens
      const keywords = extractKeywordsFromRole("负责客户订单查询和售后服务");
      expect(keywords.length).toBeGreaterThan(0);
      expect(keywords).toContain("售后服务");
    });

    it("filters stop words", () => {
      const keywords = extractKeywordsFromRole("负责管理和处理日常工作");
      for (const kw of keywords) {
        expect(["的", "了", "是", "和"]).not.toContain(kw);
      }
    });

    it("handles English roles", () => {
      const keywords = extractKeywordsFromRole("Handle customer support tickets");
      expect(keywords).toContain("Handle");
      expect(keywords).toContain("customer");
      expect(keywords).toContain("support");
      expect(keywords).toContain("tickets");
    });

    it("returns empty array for empty input", () => {
      expect(extractKeywordsFromRole("")).toEqual([]);
    });

    it("deduplicates keywords", () => {
      const keywords = extractKeywordsFromRole("天气查询，天气预报");
      const uniqueCheck = new Set(keywords);
      expect(keywords.length).toBe(uniqueCheck.size);
    });
  });

  describe("buildRoutesFromMembers", () => {
    it("builds routes from member info", () => {
      const members = [
        { id: "weather", name: "天气助手", role: "天气查询和预报", emoji: "🌤" },
        { id: "finance", name: "财务助手", role: "记账和报销", emoji: "💰" },
      ];
      const routes = buildRoutesFromMembers(members);
      expect(routes.length).toBeGreaterThan(0);

      // Member names should be high-priority routes
      const nameRoutes = routes.filter((r) => r.priority === 10);
      expect(nameRoutes.map((r) => r.pattern)).toContain("天气助手");
      expect(nameRoutes.map((r) => r.pattern)).toContain("财务助手");

      // Role keywords should be lower-priority routes
      const kwRoutes = routes.filter((r) => r.priority === 50);
      expect(kwRoutes.length).toBeGreaterThan(0);
    });
  });
});
