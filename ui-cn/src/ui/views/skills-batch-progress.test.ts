/**
 * Tests for skills-batch-progress.ts
 * Covers: minimize button presence and click, cancel button, progress display
 */

import { render } from "lit";
import { describe, expect, it, vi } from "vitest";
import { renderSkillsBatchProgress } from "./skills-batch-progress";

describe("skills-batch-progress", () => {
  it("renders minimize button", () => {
    const container = document.createElement("div");
    render(
      renderSkillsBatchProgress({
        skills: [{ name: "weather", icon: "🌤", status: "downloading", progress: 50 }],
        progress: { completed: 0, total: 1, bytesDownloaded: 512, bytesTotal: 1024, speedBps: 256 },
        onCancel: vi.fn(),
        onMinimize: vi.fn(),
      }),
      container,
    );

    expect(container.textContent).toContain("最小化");
  });

  it("calls onMinimize when minimize button is clicked", () => {
    const onMinimize = vi.fn();
    const container = document.createElement("div");
    render(
      renderSkillsBatchProgress({
        skills: [{ name: "weather", icon: "🌤", status: "downloading", progress: 50 }],
        progress: { completed: 0, total: 1, bytesDownloaded: 512, bytesTotal: 1024, speedBps: 256 },
        onCancel: vi.fn(),
        onMinimize,
      }),
      container,
    );

    const minimizeBtn = Array.from(container.querySelectorAll("button")).find((btn) =>
      btn.textContent?.includes("最小化"),
    );
    expect(minimizeBtn).not.toBeUndefined();
    minimizeBtn?.click();

    expect(onMinimize).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when cancel button is clicked", () => {
    const onCancel = vi.fn();
    const container = document.createElement("div");
    render(
      renderSkillsBatchProgress({
        skills: [],
        progress: { completed: 0, total: 0, bytesDownloaded: 0, bytesTotal: 0, speedBps: 0 },
        onCancel,
        onMinimize: vi.fn(),
      }),
      container,
    );

    const cancelBtn = Array.from(container.querySelectorAll("button")).find((btn) =>
      btn.textContent?.includes("取消安装"),
    );
    expect(cancelBtn).not.toBeUndefined();
    cancelBtn?.click();

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("shows hint about minimization", () => {
    const container = document.createElement("div");
    render(
      renderSkillsBatchProgress({
        skills: [],
        progress: { completed: 0, total: 0, bytesDownloaded: 0, bytesTotal: 0, speedBps: 0 },
        onCancel: vi.fn(),
        onMinimize: vi.fn(),
      }),
      container,
    );

    expect(container.textContent).toContain("可以最小化");
  });

  it("displays overall progress percentage", () => {
    const container = document.createElement("div");
    render(
      renderSkillsBatchProgress({
        skills: [
          { name: "a", icon: "", status: "done" },
          { name: "b", icon: "", status: "downloading", progress: 50 },
        ],
        progress: {
          completed: 1,
          total: 2,
          bytesDownloaded: 1024,
          bytesTotal: 2048,
          speedBps: 512,
        },
        onCancel: vi.fn(),
        onMinimize: vi.fn(),
      }),
      container,
    );

    expect(container.textContent).toContain("50%"); // 1/2 = 50%
    expect(container.textContent).toContain("1/2");
  });
});
