/**
 * 流式回复即时渲染
 * 直接显示流式接收到的全部文本，不做人为延迟
 */
import { html } from "lit";
import { AsyncDirective } from "lit/async-directive.js";
import { directive } from "lit/directive.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { toSanitizedMarkdownHtml } from "../markdown";

class TypewriterStreamDirective extends AsyncDirective {
  private lastText = "";
  private cachedHtml = "";

  override render(fullText: string, _streamKey: string) {
    return this.buildHtml(fullText ?? "");
  }

  override update(
    _part: import("lit/directive.js").Part,
    [fullText, _streamKey]: [string, string],
  ) {
    return this.buildHtml(fullText ?? "");
  }

  private buildHtml(text: string) {
    if (text === this.lastText && this.cachedHtml) {
      return html`${unsafeHTML(this.cachedHtml)}`;
    }
    const raw = text || "\u00A0";
    const sanitized = toSanitizedMarkdownHtml(raw);
    this.lastText = text;
    this.cachedHtml = sanitized;
    return html`${unsafeHTML(sanitized)}`;
  }
}

export const typewriterStream = directive(TypewriterStreamDirective);
