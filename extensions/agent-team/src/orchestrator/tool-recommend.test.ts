import { describe, it, expect } from "vitest";
import {
  recommendToolsForRole,
  mergeToolRecommendations,
  estimateToolTokens,
} from "./tool-recommend.js";

describe("tool-recommend", () => {
  describe("recommendToolsForRole", () => {
    it("recommends web tools for search-related roles", () => {
      const rec = recommendToolsForRole("搜索互联网、查询资料");
      expect(rec.allow).toContain("group:web");
      expect(rec.allow).toContain("group:memory");
    });

    it("recommends fs tools for file-related roles", () => {
      const rec = recommendToolsForRole("读取文件和保存数据");
      expect(rec.allow).toContain("group:fs");
      expect(rec.allow).toContain("group:memory");
    });

    it("recommends cron and calendar for schedule roles", () => {
      const rec = recommendToolsForRole("管理日程和会议提醒");
      expect(rec.allow).toContain("cron");
      expect(rec.skills).toContain("calendar");
    });

    it("recommends browser for web scraping roles", () => {
      const rec = recommendToolsForRole("浏览器网页截图");
      expect(rec.allow).toContain("browser");
      expect(rec.allow).toContain("group:web");
    });

    it("always includes group:memory", () => {
      const rec = recommendToolsForRole("generic assistant");
      expect(rec.allow).toContain("group:memory");
    });

    it("uses agentName in keyword matching", () => {
      const rec = recommendToolsForRole("general role", "日程管理员");
      // "日程" keyword should trigger calendar match
      expect(rec.allow).toContain("cron");
    });

    it("sets profile to minimal", () => {
      const rec = recommendToolsForRole("any role");
      expect(rec.profile).toBe("minimal");
    });

    it("recommends MCP servers for spreadsheet roles", () => {
      const rec = recommendToolsForRole("处理excel表格和csv数据");
      expect(rec.mcpServers).toContain("@anthropic/mcp-google-sheets");
      expect(rec.allow).toContain("group:fs");
    });
  });

  describe("mergeToolRecommendations", () => {
    it("unions allow lists", () => {
      const merged = mergeToolRecommendations(
        { allow: ["group:web"] },
        { allow: ["group:fs", "group:memory"] },
      );
      expect(merged.allow).toContain("group:web");
      expect(merged.allow).toContain("group:fs");
      expect(merged.allow).toContain("group:memory");
    });

    it("unions skills", () => {
      const merged = mergeToolRecommendations(
        { skills: ["calendar"] },
        { skills: ["translation", "calendar"] },
      );
      expect(merged.skills).toHaveLength(2);
      expect(merged.skills).toContain("calendar");
      expect(merged.skills).toContain("translation");
    });

    it("template deny takes priority", () => {
      const merged = mergeToolRecommendations(
        { deny: ["dangerous-tool"] },
        { deny: ["other-tool"] },
      );
      expect(merged.deny).toEqual(["dangerous-tool"]);
    });
  });

  describe("estimateToolTokens", () => {
    it("calculates base tokens for empty recommendation", () => {
      expect(estimateToolTokens({})).toBe(2000);
    });

    it("adds tokens for groups", () => {
      const estimate = estimateToolTokens({ allow: ["group:web", "group:fs"] });
      expect(estimate).toBe(2000 + 2 * 800);
    });

    it("adds tokens for individual tools", () => {
      const estimate = estimateToolTokens({ allow: ["cron", "browser"] });
      expect(estimate).toBe(2000 + 2 * 200);
    });

    it("adds tokens for skills", () => {
      const estimate = estimateToolTokens({ allow: ["group:web"], skills: ["calendar"] });
      expect(estimate).toBe(2000 + 800 + 400);
    });

    it("distinguishes groups from tools by prefix", () => {
      const estimate = estimateToolTokens({
        allow: ["group:web", "group:memory", "cron"],
      });
      // 2 groups * 800 + 1 tool * 200
      expect(estimate).toBe(2000 + 2 * 800 + 200);
    });
  });
});
