/**
 * Tests for skills-batch-pill.ts
 * Covers: pill rendering for downloading/complete/result phases,
 *         correct content display, click handlers
 */

import { render } from "lit";
import { describe, expect, it, vi } from "vitest";
import { renderSkillsBatchPill, type SkillsBatchPillProps } from "./skills-batch-pill";

function createProps(overrides: Partial<SkillsBatchPillProps> = {}): SkillsBatchPillProps {
  return {
    phase: "downloading",
    progress: { completed: 3, total: 10, bytesDownloaded: 1024, bytesTotal: 10240, speedBps: 2048 },
    skills: [
      { name: "weather", icon: "🌤", status: "downloading", progress: 60 },
      { name: "github", icon: "🐙", status: "queued" },
    ],
    result: null,
    onExpand: vi.fn(),
    onDismiss: vi.fn(),
    ...overrides,
  };
}

describe("skills-batch-pill", () => {
  it("renders downloading pill with percentage", () => {
    const container = document.createElement("div");
    render(renderSkillsBatchPill(createProps()), container);

    expect(container.textContent).toContain("30%"); // 3/10 = 30%
  });

  it("renders downloading pill with current skill name", () => {
    const container = document.createElement("div");
    render(renderSkillsBatchPill(createProps()), container);

    expect(container.textContent).toContain("weather");
  });

  it("renders downloading pill with speed indicator", () => {
    const container = document.createElement("div");
    render(renderSkillsBatchPill(createProps()), container);

    expect(container.textContent).toContain("2.0 KB/s");
  });

  it("renders SVG circular progress in downloading pill", () => {
    const container = document.createElement("div");
    render(renderSkillsBatchPill(createProps()), container);

    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("width")).toBe("28");
  });

  it("renders complete pill with success count", () => {
    const container = document.createElement("div");
    render(
      renderSkillsBatchPill(
        createProps({
          phase: "complete",
          result: { succeeded: ["a", "b", "c"], failed: [], durationMs: 5000 },
        }),
      ),
      container,
    );

    expect(container.textContent).toContain("3");
    expect(container.textContent).toContain("配置完成");
  });

  it("renders result pill with failure count", () => {
    const container = document.createElement("div");
    render(
      renderSkillsBatchPill(
        createProps({
          phase: "result",
          result: {
            succeeded: ["a"],
            failed: [
              { name: "b", icon: "", error: "fail", mirrorsTried: [] },
              { name: "c", icon: "", error: "fail", mirrorsTried: [] },
            ],
            durationMs: 3000,
          },
        }),
      ),
      container,
    );

    expect(container.textContent).toContain("2");
    expect(container.textContent).toContain("失败");
  });

  it("renders nothing for idle phase", () => {
    const container = document.createElement("div");
    render(renderSkillsBatchPill(createProps({ phase: "idle" })), container);

    expect(container.querySelector(".batch-pill")).toBeNull();
  });

  it("calls onExpand when pill is clicked", () => {
    const onExpand = vi.fn();
    const container = document.createElement("div");
    render(renderSkillsBatchPill(createProps({ onExpand })), container);

    const pill = container.querySelector(".batch-pill") as HTMLElement;
    expect(pill).not.toBeNull();
    pill.click();

    expect(onExpand).toHaveBeenCalledTimes(1);
  });

  it("pill has transition property for smooth hover animation", () => {
    const container = document.createElement("div");
    render(renderSkillsBatchPill(createProps()), container);

    const pill = container.querySelector(".batch-pill") as HTMLElement;
    expect(pill).not.toBeNull();
    expect(pill.style.cssText).toContain("transition");
  });
});
