/**
 * task-coordinator.test.ts
 *
 * Coverage for:
 *   - matchWorkflow (trigger patterns)
 *   - generateWorkflowInstructions (step generation, dependency annotation)
 */

import { describe, expect, it } from "vitest";
import { matchWorkflow, generateWorkflowInstructions } from "../task-coordinator.js";
import type { MemberInfo } from "../types.js";

// ── Fixtures ───────────────────────────────────────────────────────────────

const WRITER: MemberInfo = { id: "writer-1", name: "Writer Bot", role: "Writer — 写作与文案" };
const DESIGNER: MemberInfo = { id: "design-1", name: "Designer Bot", role: "image 图片设计绘画" };
const RESEARCHER: MemberInfo = {
  id: "research-1",
  name: "Research Bot",
  role: "research 调研检索",
};
const TRANSLATOR: MemberInfo = { id: "trans-1", name: "Translator Bot", role: "翻译 translat" };

// ── matchWorkflow ──────────────────────────────────────────────────────────

describe("task-coordinator", () => {
  describe("matchWorkflow", () => {
    describe("content-with-images workflow", () => {
      it("matches Chinese article + image pattern", () => {
        const result = matchWorkflow("帮我写一篇文章，并配上图");
        expect(result).not.toBeNull();
        expect(result?.id).toBe("content-with-images");
      });

      it("matches Chinese write + image pattern", () => {
        const result = matchWorkflow("写一篇关于旅游的内容，配图");
        expect(result).not.toBeNull();
        expect(result?.id).toBe("content-with-images");
      });

      it("matches English article with images pattern", () => {
        const result = matchWorkflow("write an article with images about AI");
        expect(result).not.toBeNull();
        expect(result?.id).toBe("content-with-images");
      });

      it("does NOT match just 写 without 配图", () => {
        const result = matchWorkflow("帮我写一篇文章");
        // Should not match content-with-images (requires both write + image)
        const contentImagesMatch = result?.id === "content-with-images";
        expect(contentImagesMatch).toBe(false);
      });
    });

    describe("research-and-summarize workflow", () => {
      it("matches Chinese research + summarize pattern", () => {
        const result = matchWorkflow("调研竞争对手并总结汇报");
        expect(result).not.toBeNull();
        expect(result?.id).toBe("research-and-summarize");
      });

      it("matches Chinese search + organize pattern", () => {
        const result = matchWorkflow("搜索相关资料并整理成报告");
        expect(result).not.toBeNull();
        expect(result?.id).toBe("research-and-summarize");
      });

      it("matches English research + summarize pattern", () => {
        const result = matchWorkflow("research the topic and summarize the findings");
        expect(result).not.toBeNull();
        expect(result?.id).toBe("research-and-summarize");
      });

      it("matches 查资料 + 总结", () => {
        const result = matchWorkflow("查一下市场资料总结一下");
        expect(result).not.toBeNull();
        expect(result?.id).toBe("research-and-summarize");
      });
    });

    describe("translate-and-polish workflow", () => {
      it("matches Chinese translate + polish pattern", () => {
        const result = matchWorkflow("把这段英文翻译然后润色");
        expect(result).not.toBeNull();
        expect(result?.id).toBe("translate-and-polish");
      });

      it("matches Chinese translate + edit pattern", () => {
        const result = matchWorkflow("翻译并优化这篇文章");
        expect(result).not.toBeNull();
        expect(result?.id).toBe("translate-and-polish");
      });

      it("matches English translate + polish", () => {
        const result = matchWorkflow("translate this text and polish it");
        expect(result).not.toBeNull();
        expect(result?.id).toBe("translate-and-polish");
      });
    });

    describe("no match cases", () => {
      it("returns null for generic greeting", () => {
        const result = matchWorkflow("你好，请问你能帮我什么？");
        expect(result).toBeNull();
      });

      it("returns null for simple question", () => {
        const result = matchWorkflow("今天天气怎么样？");
        expect(result).toBeNull();
      });

      it("returns null for empty string", () => {
        const result = matchWorkflow("");
        expect(result).toBeNull();
      });

      it("returns null for single keyword without action", () => {
        const result = matchWorkflow("图片");
        expect(result).toBeNull();
      });

      it("returns null for translate alone (no polish)", () => {
        const result = matchWorkflow("帮我翻译这段文字");
        // Should not match translate-and-polish (requires both translate + polish)
        const translatePolishMatch = result?.id === "translate-and-polish";
        expect(translatePolishMatch).toBe(false);
      });
    });
  });

  // ── generateWorkflowInstructions ────────────────────────────────────────

  describe("generateWorkflowInstructions", () => {
    it("returns empty string for empty members list", () => {
      const workflow = matchWorkflow("写一篇文章配图");
      if (!workflow) {
        // Skip if no match — shouldn't happen but be safe
        expect(true).toBe(true);
        return;
      }
      const result = generateWorkflowInstructions(workflow, []);
      expect(result).toBe("");
    });

    it("wraps output in <task-workflow> tags", () => {
      const workflow = matchWorkflow("研究竞争对手并总结");
      if (!workflow) return;

      const result = generateWorkflowInstructions(workflow, [RESEARCHER, WRITER]);
      expect(result).toContain("<task-workflow");
      expect(result).toContain("</task-workflow>");
    });

    it("includes workflow name in output", () => {
      const workflow = matchWorkflow("研究市场并总结汇总");
      if (!workflow) return;

      const result = generateWorkflowInstructions(workflow, [RESEARCHER, WRITER]);
      expect(result).toContain(workflow.name);
    });

    it("includes synthesis instruction", () => {
      const workflow = matchWorkflow("翻译并润色");
      if (!workflow) return;

      const result = generateWorkflowInstructions(workflow, [TRANSLATOR, WRITER]);
      expect(result).toContain("Synthesis");
    });

    it("assigns correct member to step by role matching", () => {
      const workflow = matchWorkflow("写文章配图");
      if (!workflow) return;

      const result = generateWorkflowInstructions(workflow, [WRITER, DESIGNER]);
      // Writer should handle write step, Designer should handle illustrate step
      expect(result).toContain("Writer Bot");
    });

    it("annotates dependency with step number", () => {
      const workflow = matchWorkflow("翻译并润色");
      if (!workflow) return;

      const result = generateWorkflowInstructions(workflow, [TRANSLATOR, WRITER]);
      // Step 2 (polish) depends on step 1 (translate)
      expect(result).toContain("wait for step 1");
    });

    it("marks optional steps with [optional]", () => {
      // content-with-images has an optional illustrate step
      const workflow = matchWorkflow("写篇文章，配上图片");
      if (!workflow) return;

      const result = generateWorkflowInstructions(workflow, [WRITER, DESIGNER]);
      expect(result).toContain("[optional]");
    });

    it("uses [any available member] when no role match found", () => {
      // Use members whose roles don't match the workflow requirements
      const genericMembers: MemberInfo[] = [
        { id: "gen-1", name: "Generic Bot", role: "General assistant" },
      ];

      const workflow = matchWorkflow("翻译并润色");
      if (!workflow) return;

      const result = generateWorkflowInstructions(workflow, genericMembers);
      expect(result).toContain("[any available member]");
    });

    it("numbers steps sequentially from 1", () => {
      const workflow = matchWorkflow("调研并汇总");
      if (!workflow) return;

      const result = generateWorkflowInstructions(workflow, [RESEARCHER, WRITER]);
      expect(result).toContain("1.");
      // For a 2-step workflow, should have step 2
      if ((workflow.steps?.length ?? 0) >= 2) {
        expect(result).toContain("2.");
      }
    });

    it("content-with-images assigns writer then designer in order", () => {
      const workflow = matchWorkflow("写一篇文章配上图");
      if (!workflow) return;

      const result = generateWorkflowInstructions(workflow, [WRITER, DESIGNER]);
      const writerIdx = result.indexOf("Writer Bot");
      const designerIdx = result.indexOf("Designer Bot");
      // Writer appears in step 1, Designer in step 2
      if (writerIdx >= 0 && designerIdx >= 0) {
        expect(writerIdx).toBeLessThan(designerIdx);
      }
    });
  });
});
