/**
 * 代码语法高亮模块
 * 使用 highlight.js 实现按需加载的语法高亮
 */
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import css from "highlight.js/lib/languages/css";
import diff from "highlight.js/lib/languages/diff";
import go from "highlight.js/lib/languages/go";
import java from "highlight.js/lib/languages/java";
// 按需注册常用语言（减小包体积）
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import kotlin from "highlight.js/lib/languages/kotlin";
import markdown from "highlight.js/lib/languages/markdown";
import php from "highlight.js/lib/languages/php";
import python from "highlight.js/lib/languages/python";
import ruby from "highlight.js/lib/languages/ruby";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import swift from "highlight.js/lib/languages/swift";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";

// 注册语言及其别名
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("js", javascript);
hljs.registerLanguage("jsx", javascript);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("ts", typescript);
hljs.registerLanguage("tsx", typescript);
hljs.registerLanguage("python", python);
hljs.registerLanguage("py", python);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("sh", bash);
hljs.registerLanguage("shell", bash);
hljs.registerLanguage("zsh", bash);
hljs.registerLanguage("json", json);
hljs.registerLanguage("css", css);
hljs.registerLanguage("scss", css);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("go", go);
hljs.registerLanguage("golang", go);
hljs.registerLanguage("rust", rust);
hljs.registerLanguage("rs", rust);
hljs.registerLanguage("java", java);
hljs.registerLanguage("cpp", cpp);
hljs.registerLanguage("c++", cpp);
hljs.registerLanguage("c", cpp);
hljs.registerLanguage("csharp", csharp);
hljs.registerLanguage("cs", csharp);
hljs.registerLanguage("php", php);
hljs.registerLanguage("ruby", ruby);
hljs.registerLanguage("rb", ruby);
hljs.registerLanguage("swift", swift);
hljs.registerLanguage("kotlin", kotlin);
hljs.registerLanguage("kt", kotlin);
hljs.registerLanguage("yaml", yaml);
hljs.registerLanguage("yml", yaml);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("html", xml);
hljs.registerLanguage("markdown", markdown);
hljs.registerLanguage("md", markdown);
hljs.registerLanguage("diff", diff);

/**
 * 语言显示名称映射
 */
const LANGUAGE_DISPLAY_NAMES: Record<string, string> = {
  javascript: "JavaScript",
  js: "JavaScript",
  jsx: "JSX",
  typescript: "TypeScript",
  ts: "TypeScript",
  tsx: "TSX",
  python: "Python",
  py: "Python",
  bash: "Bash",
  sh: "Shell",
  shell: "Shell",
  zsh: "Zsh",
  json: "JSON",
  css: "CSS",
  scss: "SCSS",
  sql: "SQL",
  go: "Go",
  golang: "Go",
  rust: "Rust",
  rs: "Rust",
  java: "Java",
  cpp: "C++",
  "c++": "C++",
  c: "C",
  csharp: "C#",
  cs: "C#",
  php: "PHP",
  ruby: "Ruby",
  rb: "Ruby",
  swift: "Swift",
  kotlin: "Kotlin",
  kt: "Kotlin",
  yaml: "YAML",
  yml: "YAML",
  xml: "XML",
  html: "HTML",
  markdown: "Markdown",
  md: "Markdown",
  diff: "Diff",
  plaintext: "Text",
  text: "Text",
};

/**
 * 获取语言的显示名称
 */
export function getLanguageDisplayName(lang: string): string {
  const normalized = lang?.toLowerCase().trim() || "";
  return LANGUAGE_DISPLAY_NAMES[normalized] || normalized || "Code";
}

/**
 * HTML 转义
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * 对代码进行语法高亮
 * @param code 原始代码
 * @param lang 语言标识
 * @returns 高亮后的 HTML
 */
export function highlightCode(code: string, lang?: string): string {
  const language = lang?.toLowerCase().trim() || "";

  // 尝试使用指定语言高亮
  if (language && hljs.getLanguage(language)) {
    try {
      return hljs.highlight(code, { language }).value;
    } catch {
      // 高亮失败时继续尝试自动检测
    }
  }

  // 自动检测语言（仅对较短的代码块使用，避免性能问题）
  if (code.length < 5000) {
    try {
      const result = hljs.highlightAuto(code);
      if (result.relevance > 5) {
        return result.value;
      }
    } catch {
      // 自动检测失败，返回转义后的原文
    }
  }

  return escapeHtml(code);
}

/**
 * 生成带复制按钮的代码块 HTML
 * @param code 原始代码
 * @param lang 语言标识
 * @returns 完整的代码块 HTML
 */
export function renderCodeBlock(code: string, lang?: string): string {
  const language = lang?.toLowerCase().trim() || "";
  const displayName = getLanguageDisplayName(language);
  const highlighted = highlightCode(code, language);
  const escapedCode = escapeHtml(code);

  return `<div class="code-block-enhanced" data-lang="${language}">
  <div class="code-block-header">
    <span class="code-block-lang">
      <span class="code-block-lang-dot"></span>
      ${displayName}
    </span>
    <div class="code-block-actions">
      <button type="button" class="code-block-copy-btn" data-code="${encodeURIComponent(code)}" title="复制代码">
        <svg class="code-block-copy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
        <svg class="code-block-check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        <span class="code-block-copy-text">复制</span>
      </button>
    </div>
  </div>
  <pre class="code-block-content"><code class="hljs${language ? ` language-${language}` : ""}">${highlighted}</code></pre>
</div>`;
}

/**
 * 处理代码块复制按钮点击
 * 使用事件委托方式，只需初始化一次
 */
async function handleCodeCopyClick(btn: HTMLButtonElement): Promise<void> {
  const code = decodeURIComponent(btn.dataset.code || "");
  if (!code) return;

  try {
    await navigator.clipboard.writeText(code);

    // 显示成功状态
    btn.classList.add("code-block-copy-btn--copied");
    const textSpan = btn.querySelector(".code-block-copy-text");
    if (textSpan) textSpan.textContent = "已复制";

    // 2秒后恢复
    setTimeout(() => {
      btn.classList.remove("code-block-copy-btn--copied");
      if (textSpan) textSpan.textContent = "复制";
    }, 2000);
  } catch (err) {
    console.error("Failed to copy code:", err);
    // 显示错误状态
    btn.classList.add("code-block-copy-btn--error");
    const textSpan = btn.querySelector(".code-block-copy-text");
    if (textSpan) textSpan.textContent = "失败";

    setTimeout(() => {
      btn.classList.remove("code-block-copy-btn--error");
      if (textSpan) textSpan.textContent = "复制";
    }, 2000);
  }
}

let delegateInitialized = false;

/**
 * 初始化代码块复制功能（事件委托方式）
 * 只需调用一次，会自动处理所有动态添加的代码块
 */
export function initCodeBlockCopyHandlers(): void {
  if (delegateInitialized) return;
  delegateInitialized = true;

  // 使用事件委托，在 document 上监听点击事件
  document.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;

    // 查找最近的复制按钮
    const copyBtn = target.closest<HTMLButtonElement>(".code-block-copy-btn");
    if (!copyBtn) return;

    e.preventDefault();
    e.stopPropagation();

    void handleCodeCopyClick(copyBtn);
  });
}
