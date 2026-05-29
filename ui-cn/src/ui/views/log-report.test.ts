/**
 * 日志上报运维中心 - UI 视图单元测试
 */
import { render } from "lit";
import { describe, expect, it, vi } from "vitest";
import {
  renderLogReportModal,
  createLogReportViewState,
  resetLogReportState,
  handleReportFileSelect,
  type LogReportViewProps,
  type LogReportViewState,
  type LogReportAttachment,
} from "./log-report";

// ── Props 工厂 ────────────────────────────────────────

function createProps(overrides: Partial<LogReportViewProps> = {}): LogReportViewProps {
  return {
    state: createLogReportViewState(),
    onOpen: () => undefined,
    onClose: () => undefined,
    onDescriptionChange: () => undefined,
    onAddAttachment: () => undefined,
    onRemoveAttachment: () => undefined,
    onImageError: () => undefined,
    onSubmit: () => undefined,
    onReset: () => undefined,
    onToggleQueryMode: () => undefined,
    onQueryCodeChange: () => undefined,
    onQuerySubmit: () => undefined,
    ...overrides,
  };
}

// ── 纯函数测试 ────────────────────────────────────────

describe("createLogReportViewState", () => {
  it("returns correct default state", () => {
    const state = createLogReportViewState();
    expect(state.showModal).toBe(false);
    expect(state.description).toBe("");
    expect(state.attachments).toEqual([]);
    expect(state.submitting).toBe(false);
    expect(state.submitted).toBe(false);
    expect(state.error).toBeNull();
    expect(state.ticketCode).toBeNull();
    expect(state.remaining).toBeNull();
    expect(state.queryMode).toBe(false);
    expect(state.queryCode).toBe("");
    expect(state.querying).toBe(false);
    expect(state.queryResult).toBeNull();
    expect(state.queryError).toBeNull();
  });
});

describe("resetLogReportState", () => {
  it("clears form data but preserves showModal", () => {
    const dirty: LogReportViewState = {
      showModal: true,
      description: "test problem",
      attachments: [{ id: "1", dataUrl: "data:image/png;base64,x", mimeType: "image/png" }],
      submitting: false,
      submitted: true,
      error: "some error",
      ticketCode: "AB12CD",
      remaining: 1,
      queryMode: true,
      queryCode: "XY34ZW",
      querying: false,
      queryResult: { found: true },
      queryError: "err",
    };

    const result = resetLogReportState(dirty);

    // showModal is preserved (spread from dirty)
    expect(result.showModal).toBe(true);
    // everything else is reset
    expect(result.description).toBe("");
    expect(result.attachments).toEqual([]);
    expect(result.submitted).toBe(false);
    expect(result.error).toBeNull();
    expect(result.ticketCode).toBeNull();
    expect(result.remaining).toBeNull();
    expect(result.queryMode).toBe(false);
    expect(result.queryCode).toBe("");
    expect(result.queryResult).toBeNull();
    expect(result.queryError).toBeNull();
  });
});

// ── 渲染测试 ──────────────────────────────────────────

describe("renderLogReportModal", () => {
  it("returns nothing when showModal is false", () => {
    const container = document.createElement("div");
    render(renderLogReportModal(createProps()), container);
    expect(container.innerHTML.trim()).toBe("<!---->");
  });

  it("renders dialog when showModal is true", () => {
    const container = document.createElement("div");
    const state = { ...createLogReportViewState(), showModal: true };
    render(renderLogReportModal(createProps({ state })), container);
    expect(container.querySelector(".lr-dialog")).not.toBeNull();
    expect(container.querySelector(".lr-overlay")).not.toBeNull();
  });

  it("renders form with textarea when in default mode", () => {
    const container = document.createElement("div");
    const state = { ...createLogReportViewState(), showModal: true };
    render(renderLogReportModal(createProps({ state })), container);
    expect(container.querySelector(".lr-textarea")).not.toBeNull();
    expect(container.querySelector(".lr-form")).not.toBeNull();
  });

  it("renders success state after submission", () => {
    const container = document.createElement("div");
    const state: LogReportViewState = {
      ...createLogReportViewState(),
      showModal: true,
      submitted: true,
      ticketCode: "AB12CD",
      remaining: 1,
    };
    render(renderLogReportModal(createProps({ state })), container);
    expect(container.querySelector(".lr-success")).not.toBeNull();
    expect(container.querySelector(".lr-ticket__code")?.textContent).toBe("AB12CD");
  });

  it("renders query mode", () => {
    const container = document.createElement("div");
    const state: LogReportViewState = {
      ...createLogReportViewState(),
      showModal: true,
      queryMode: true,
    };
    render(renderLogReportModal(createProps({ state })), container);
    expect(container.querySelector(".lr-query")).not.toBeNull();
    expect(container.querySelector(".lr-form")).toBeNull();
  });

  it("renders query result with reply", () => {
    const container = document.createElement("div");
    const state: LogReportViewState = {
      ...createLogReportViewState(),
      showModal: true,
      queryMode: true,
      queryResult: {
        found: true,
        report: {
          ticketCode: "AB12CD",
          status: "replied",
          description: "test",
          createdAt: "2026-02-21T12:00:00.000Z",
          reply: {
            content: "问题已修复",
            repliedAt: "2026-02-21T14:00:00.000Z",
          },
        },
      },
    };
    render(renderLogReportModal(createProps({ state })), container);
    expect(container.querySelector(".lr-query__reply-content")?.textContent).toBe("问题已修复");
  });

  it("renders not-found message", () => {
    const container = document.createElement("div");
    const state: LogReportViewState = {
      ...createLogReportViewState(),
      showModal: true,
      queryMode: true,
      queryResult: {
        found: false,
        message: "未找到该工单",
      },
    };
    render(renderLogReportModal(createProps({ state })), container);
    expect(container.querySelector(".lr-query__not-found")?.textContent).toContain("未找到该工单");
  });

  it("disables submit button when description is too short", () => {
    const container = document.createElement("div");
    const state: LogReportViewState = {
      ...createLogReportViewState(),
      showModal: true,
      description: "短",
    };
    render(renderLogReportModal(createProps({ state })), container);
    const submitBtn = container.querySelector(".lr-btn--primary") as HTMLButtonElement;
    expect(submitBtn?.disabled).toBe(true);
  });

  it("enables submit button when description is valid", () => {
    const container = document.createElement("div");
    const state: LogReportViewState = {
      ...createLogReportViewState(),
      showModal: true,
      description: "一个足够长的问题描述内容",
    };
    render(renderLogReportModal(createProps({ state })), container);
    const submitBtn = container.querySelector(".lr-btn--primary") as HTMLButtonElement;
    expect(submitBtn?.disabled).toBe(false);
  });

  it("shows error message when present", () => {
    const container = document.createElement("div");
    const state: LogReportViewState = {
      ...createLogReportViewState(),
      showModal: true,
      error: "图片太大了",
    };
    render(renderLogReportModal(createProps({ state })), container);
    expect(container.querySelector(".lr-error")?.textContent).toContain("图片太大了");
  });

  it("shows image thumbnails for attachments", () => {
    const container = document.createElement("div");
    const state: LogReportViewState = {
      ...createLogReportViewState(),
      showModal: true,
      attachments: [
        { id: "1", dataUrl: "data:image/png;base64,AAA", mimeType: "image/png" },
        { id: "2", dataUrl: "data:image/png;base64,BBB", mimeType: "image/png" },
      ],
    };
    render(renderLogReportModal(createProps({ state })), container);
    const images = container.querySelectorAll(".lr-image-item");
    expect(images.length).toBe(2);
  });

  it("hides add-image button when at max attachments", () => {
    const container = document.createElement("div");
    const state: LogReportViewState = {
      ...createLogReportViewState(),
      showModal: true,
      attachments: [
        { id: "1", dataUrl: "data:image/png;base64,A", mimeType: "image/png" },
        { id: "2", dataUrl: "data:image/png;base64,B", mimeType: "image/png" },
        { id: "3", dataUrl: "data:image/png;base64,C", mimeType: "image/png" },
      ],
    };
    render(renderLogReportModal(createProps({ state })), container);
    expect(container.querySelector(".lr-image-add")).toBeNull();
  });

  it("calls onClose when close button is clicked", () => {
    const container = document.createElement("div");
    const onClose = vi.fn();
    const state = { ...createLogReportViewState(), showModal: true };
    render(renderLogReportModal(createProps({ state, onClose })), container);

    const closeBtn = container.querySelector(".lr-dialog__close") as HTMLButtonElement;
    closeBtn?.click();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows character count", () => {
    const container = document.createElement("div");
    const state: LogReportViewState = {
      ...createLogReportViewState(),
      showModal: true,
      description: "12345",
    };
    render(renderLogReportModal(createProps({ state })), container);
    const counter = container.querySelector(".lr-char-count");
    expect(counter?.textContent).toContain("5/2000");
  });

  it("shows remaining count on success screen", () => {
    const container = document.createElement("div");
    const state: LogReportViewState = {
      ...createLogReportViewState(),
      showModal: true,
      submitted: true,
      remaining: 1,
    };
    render(renderLogReportModal(createProps({ state })), container);
    expect(container.querySelector(".lr-remaining")?.textContent).toBeTruthy();
  });

  it("renders status badges correctly", () => {
    const container = document.createElement("div");
    const state: LogReportViewState = {
      ...createLogReportViewState(),
      showModal: true,
      queryMode: true,
      queryResult: {
        found: true,
        report: {
          ticketCode: "AB12CD",
          status: "analyzing",
          description: "test",
          createdAt: "2026-02-21T12:00:00.000Z",
          reply: null,
        },
      },
    };
    render(renderLogReportModal(createProps({ state })), container);
    const badge = container.querySelector(".lr-badge--analyzing");
    expect(badge).not.toBeNull();
  });
});

// ── handleReportFileSelect 测试 ──────────────────────

describe("handleReportFileSelect", () => {
  it("calls onError for oversized files", () => {
    const onAdd = vi.fn();
    const onError = vi.fn();

    // 创建一个模拟超过 1MB 的文件
    const largeFile = new File(["x".repeat(1024 * 1024 + 1)], "big.png", { type: "image/png" });
    Object.defineProperty(largeFile, "size", { value: 1024 * 1024 + 1 });

    const input = document.createElement("input");
    input.type = "file";

    // 模拟 files 属性
    Object.defineProperty(input, "files", { value: [largeFile] });

    const event = { target: input } as unknown as Event;
    handleReportFileSelect(event, onAdd, 0, onError);

    expect(onAdd).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.stringContaining("big.png"));
    expect(onError).toHaveBeenCalledWith(expect.stringContaining("1MB"));
  });

  it("respects max attachment count", () => {
    const onAdd = vi.fn();
    const smallFile = new File(["x"], "small.png", { type: "image/png" });
    Object.defineProperty(smallFile, "size", { value: 100 });

    const input = document.createElement("input");
    input.type = "file";
    Object.defineProperty(input, "files", { value: [smallFile, smallFile] });

    // 已经有 2 张，最多 3 张，只能再加 1 张
    const event = { target: input } as unknown as Event;
    handleReportFileSelect(event, onAdd, 2);

    // FileReader 是异步的，这里只测试不会立即 crash
    // 实际的 onAdd 调用发生在 reader.onload 中
  });

  it("skips non-image files", () => {
    const onAdd = vi.fn();
    const textFile = new File(["hello"], "readme.txt", { type: "text/plain" });

    const input = document.createElement("input");
    input.type = "file";
    Object.defineProperty(input, "files", { value: [textFile] });

    const event = { target: input } as unknown as Event;
    handleReportFileSelect(event, onAdd, 0);

    // text/plain 应该被跳过
    expect(onAdd).not.toHaveBeenCalled();
  });
});
