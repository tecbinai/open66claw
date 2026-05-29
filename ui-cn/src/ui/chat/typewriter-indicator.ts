/**
 * 等待指示器打字机效果
 * 逐字显示等待状态文案，配合光标闪烁，给用户"系统正在工作"的视觉反馈
 *
 * 特性：
 * - 使用 requestAnimationFrame 实现 60fps 流畅逐字揭示
 * - 标点符号处自动停顿，模拟自然输入节奏
 * - 阶段切换时自动重置并重新打字
 * - 闪烁光标：输入中快闪，完成后慢闪
 */
import { html, nothing } from "lit";
import { AsyncDirective } from "lit/async-directive.js";
import { directive } from "lit/directive.js";

// ============ 打字机配置 ============

/** 每秒显示的字符数（CJK 友好速度，约人类自然输入的 1.5 倍） */
const CHARS_PER_SECOND = 10;

/** 标点符号额外停顿（毫秒），模拟自然节奏 */
const PUNCTUATION_PAUSE_MS = 160;

/** 阶段切换后、开始打字前的短暂停顿（毫秒） */
const PHASE_PAUSE_MS = 250;

/** 需要额外停顿的标点符号集合 */
const PAUSE_CHARS = new Set("，。、！？…；：,.!?;:");

class TypewriterIndicatorDirective extends AsyncDirective {
  private rafId = 0;
  private phaseKey = "";
  private startTime = 0;
  private text = "";
  private cssClass = "";
  /** 每个字符应该在什么时间点（相对于阶段开始）显示 */
  private charTimings: number[] = [];

  override render(_text: string, _phaseKey: string, _cssClass: string) {
    return nothing;
  }

  override update(
    _part: import("lit/directive.js").Part,
    [text, phaseKey, cssClass]: [string, string, string],
  ) {
    const isNewPhase = phaseKey !== this.phaseKey;
    this.text = text ?? "";
    this.cssClass = cssClass ?? "";

    if (isNewPhase) {
      // 取消旧阶段残留的 RAF，避免单帧空白闪烁
      if (this.rafId) {
        cancelAnimationFrame(this.rafId);
        this.rafId = 0;
      }
      this.phaseKey = phaseKey;
      this.startTime = performance.now();
      this.computeTimings();
    }

    if (!this.text) return nothing;

    // 如果还没揭示完且没有 RAF 在跑，启动动画循环
    if (!this.rafId && this.getVisibleCount() < this.text.length) {
      this.scheduleFrame();
    }

    return this.buildOutput();
  }

  /**
   * 预计算每个字符的显示时间点
   * 遇到标点符号后自动加停顿，让节奏更自然
   */
  private computeTimings() {
    this.charTimings = [];
    let accMs = PHASE_PAUSE_MS;
    const interval = 1000 / CHARS_PER_SECOND;

    for (let i = 0; i < this.text.length; i++) {
      accMs += interval;
      // 前一个字符是标点 → 当前字符延迟出现
      if (i > 0 && PAUSE_CHARS.has(this.text[i - 1])) {
        accMs += PUNCTUATION_PAUSE_MS;
      }
      this.charTimings.push(accMs);
    }
  }

  /** 根据当前时间计算应该显示多少个字符 */
  private getVisibleCount(): number {
    const elapsed = performance.now() - this.startTime;
    let count = 0;
    for (const t of this.charTimings) {
      if (elapsed >= t) count++;
      else break;
    }
    return count;
  }

  private scheduleFrame() {
    this.rafId = requestAnimationFrame(() => {
      this.rafId = 0;
      if (!this.isConnected) return;

      const count = this.getVisibleCount();
      this.setValue(this.buildOutput());

      // 还没显示完，继续下一帧
      if (count < this.text.length) {
        this.scheduleFrame();
      }
    });
  }

  private buildOutput() {
    const count = this.getVisibleCount();
    const visible = this.text.slice(0, count);
    const isComplete = count >= this.text.length;
    const cursorCls = isComplete ? "tw-cursor tw-cursor--idle" : "tw-cursor";

    return html`<span class="tw-indicator ${this.cssClass}">${visible}<span class="${cursorCls}"></span></span>`;
  }

  override disconnected() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }
}

export const typewriterIndicator = directive(TypewriterIndicatorDirective);
