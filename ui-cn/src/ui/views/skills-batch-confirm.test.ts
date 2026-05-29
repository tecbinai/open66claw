/**
 * Tests for skills-batch-confirm.ts
 * Covers: tier-based grouping, checkbox defaults, core skills locked,
 *         optional section collapsed, confirm sends selected skills
 */

import { render } from "lit";
import { describe, expect, it, vi } from "vitest";
import type { BatchCheckResult } from "../controllers/skills-batch";
import { renderSkillsBatchConfirm } from "./skills-batch-confirm";

function createCheckResult(overrides: Partial<BatchCheckResult> = {}): BatchCheckResult {
  return {
    missing: [
      {
        name: "weather",
        icon: "🌤",
        category: "lifestyle",
        size_bytes: 20_000_000,
        method: "npm",
        tier: "core",
        description: "天气查询",
      },
      {
        name: "summarize",
        icon: "📝",
        category: "productivity",
        size_bytes: 20_000_000,
        method: "npm",
        tier: "core",
        description: "网页摘要",
      },
      {
        name: "gemini",
        icon: "✨",
        category: "creative",
        size_bytes: 20_000_000,
        method: "npm",
        tier: "recommended",
        description: "Gemini AI",
      },
      {
        name: "songsee",
        icon: "🎵",
        category: "lifestyle",
        size_bytes: 25_000_000,
        method: "download",
        tier: "recommended",
        description: "音乐识别",
      },
      {
        name: "gifgrep",
        icon: "🎬",
        category: "creative",
        size_bytes: 15_000_000,
        method: "npm",
        tier: "optional",
        description: "",
      },
    ],
    total_size_bytes: 100_000_000,
    estimated_seconds: 60,
    disk_available_bytes: 10_000_000_000,
    disk_ok: true,
    ...overrides,
  };
}

describe("skills-batch-confirm", () => {
  it("renders three tier groups: core, recommended, optional", () => {
    const container = document.createElement("div");
    render(
      renderSkillsBatchConfirm({
        checkResult: createCheckResult(),
        onConfirm: vi.fn(),
        onCancel: vi.fn(),
      }),
      container,
    );

    expect(container.textContent).toContain("核心");
    expect(container.textContent).toContain("推荐");
    expect(container.textContent).toContain("更多选择");
  });

  it("core skills have disabled checkboxes that are checked", () => {
    const container = document.createElement("div");
    render(
      renderSkillsBatchConfirm({
        checkResult: createCheckResult(),
        onConfirm: vi.fn(),
        onCancel: vi.fn(),
      }),
      container,
    );

    const checkboxes = container.querySelectorAll<HTMLInputElement>("input[name='batch-skill']");
    // weather and summarize are core → disabled + checked
    const weatherCb = Array.from(checkboxes).find((cb) => cb.value === "weather");
    const summarizeCb = Array.from(checkboxes).find((cb) => cb.value === "summarize");

    expect(weatherCb?.disabled).toBe(true);
    expect(weatherCb?.checked).toBe(true);
    expect(summarizeCb?.disabled).toBe(true);
    expect(summarizeCb?.checked).toBe(true);
  });

  it("recommended skills have enabled checkboxes that are checked by default", () => {
    const container = document.createElement("div");
    render(
      renderSkillsBatchConfirm({
        checkResult: createCheckResult(),
        onConfirm: vi.fn(),
        onCancel: vi.fn(),
      }),
      container,
    );

    const checkboxes = container.querySelectorAll<HTMLInputElement>("input[name='batch-skill']");
    const geminiCb = Array.from(checkboxes).find((cb) => cb.value === "gemini");

    expect(geminiCb?.disabled).toBe(false);
    expect(geminiCb?.checked).toBe(true);
  });

  it("optional skills have unchecked checkboxes by default", () => {
    const container = document.createElement("div");
    render(
      renderSkillsBatchConfirm({
        checkResult: createCheckResult(),
        onConfirm: vi.fn(),
        onCancel: vi.fn(),
      }),
      container,
    );

    const checkboxes = container.querySelectorAll<HTMLInputElement>("input[name='batch-skill']");
    const gifgrepCb = Array.from(checkboxes).find((cb) => cb.value === "gifgrep");

    expect(gifgrepCb?.disabled).toBe(false);
    expect(gifgrepCb?.checked).toBe(false);
  });

  it("optional section is inside a collapsed <details> element", () => {
    const container = document.createElement("div");
    render(
      renderSkillsBatchConfirm({
        checkResult: createCheckResult(),
        onConfirm: vi.fn(),
        onCancel: vi.fn(),
      }),
      container,
    );

    const details = container.querySelector("details");
    expect(details).not.toBeNull();
    // Should not be open by default
    expect(details?.open).toBe(false);
  });

  it("confirm button sends only checked skills", () => {
    const onConfirm = vi.fn();
    const container = document.createElement("div");
    render(
      renderSkillsBatchConfirm({
        checkResult: createCheckResult(),
        onConfirm,
        onCancel: vi.fn(),
      }),
      container,
    );

    // Uncheck gemini (recommended) before confirming
    const checkboxes = container.querySelectorAll<HTMLInputElement>("input[name='batch-skill']");
    const geminiCb = Array.from(checkboxes).find((cb) => cb.value === "gemini");
    if (geminiCb) geminiCb.checked = false;

    // Click confirm button
    const confirmBtn = Array.from(container.querySelectorAll("button")).find((btn) =>
      btn.textContent?.includes("开始安装"),
    );
    expect(confirmBtn).not.toBeUndefined();
    confirmBtn?.click();

    expect(onConfirm).toHaveBeenCalledTimes(1);
    const selectedSkills = onConfirm.mock.calls[0][0] as string[];
    // weather, summarize (core, locked+checked), songsee (recommended, checked)
    // gemini was unchecked, gifgrep was never checked
    expect(selectedSkills).toContain("weather");
    expect(selectedSkills).toContain("summarize");
    expect(selectedSkills).toContain("songsee");
    expect(selectedSkills).not.toContain("gemini");
    expect(selectedSkills).not.toContain("gifgrep");
  });

  it("shows disk warning when disk_ok is false", () => {
    const container = document.createElement("div");
    render(
      renderSkillsBatchConfirm({
        checkResult: createCheckResult({ disk_ok: false }),
        onConfirm: vi.fn(),
        onCancel: vi.fn(),
      }),
      container,
    );

    expect(container.textContent).toContain("磁盘空间不足");
  });

  it("confirm button is disabled when disk_ok is false", () => {
    const container = document.createElement("div");
    render(
      renderSkillsBatchConfirm({
        checkResult: createCheckResult({ disk_ok: false }),
        onConfirm: vi.fn(),
        onCancel: vi.fn(),
      }),
      container,
    );

    const confirmBtn = Array.from(container.querySelectorAll("button")).find((btn) =>
      btn.textContent?.includes("开始安装"),
    );
    expect(confirmBtn?.disabled).toBe(true);
  });

  it("shows skill description as display name", () => {
    const container = document.createElement("div");
    render(
      renderSkillsBatchConfirm({
        checkResult: createCheckResult(),
        onConfirm: vi.fn(),
        onCancel: vi.fn(),
      }),
      container,
    );

    // weather has description "天气查询"
    expect(container.textContent).toContain("天气查询");
    // gifgrep has empty description → falls back to SKILL_FRIENDLY_NAMES or name
    expect(container.textContent).toContain("GIF 搜索"); // from SKILL_FRIENDLY_NAMES
  });

  it("renders with empty missing list without errors", () => {
    const container = document.createElement("div");
    render(
      renderSkillsBatchConfirm({
        checkResult: createCheckResult({ missing: [] }),
        onConfirm: vi.fn(),
        onCancel: vi.fn(),
      }),
      container,
    );

    // Should render the modal shell without crashing
    expect(container.textContent).toContain("安装 AI 功能");
  });
});
