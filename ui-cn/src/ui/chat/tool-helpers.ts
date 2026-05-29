/**
 * Helper functions for tool card rendering.
 */

import { PREVIEW_MAX_CHARS, PREVIEW_MAX_LINES } from "./constants";

// ============ Command summarizer ============

/** Map of command patterns to user-friendly Chinese labels */
const COMMAND_LABELS: Array<[RegExp, string]> = [
  [/^Get-ChildItem\b|^ls\b|^dir\b|^ll\b/i, "列出文件"],
  [/^Get-Content\b|^cat\b|^type\b|^head\b|^tail\b/i, "读取文件"],
  [/^Set-Content\b|^Out-File\b|^Write-Output\b/i, "写入文件"],
  [/^Remove-Item\b|^rm\b|^del\b|^rmdir\b/i, "删除文件"],
  [/^Rename-Item\b|^ren\b|^mv\b/i, "重命名文件"],
  [/^Copy-Item\b|^cp\b|^copy\b|^xcopy\b/i, "复制文件"],
  [/^Move-Item\b|^move\b/i, "移动文件"],
  [/^New-Item\b|^mkdir\b|^md\b/i, "创建目录"],
  [/^Invoke-WebRequest\b|^curl\b|^wget\b|^fetch\b/i, "网络请求"],
  [/^npm\b/, "运行 npm"],
  [/^node\b/, "运行 Node.js"],
  [/^python\b|^python3\b|^py\b/i, "运行 Python"],
  [/^pip\b|^pip3\b/i, "安装 Python 包"],
  [/^git\s+clone\b/i, "克隆仓库"],
  [/^git\s+pull\b/i, "拉取更新"],
  [/^git\s+push\b/i, "推送代码"],
  [/^git\s+commit\b/i, "提交代码"],
  [/^git\s+status\b/i, "查看状态"],
  [/^git\b/, "Git 操作"],
  [/^docker\b/, "Docker 操作"],
  [/^cd\b/, "切换目录"],
  [/^echo\b|^Write-Host\b/i, "输出文本"],
  [/^ping\b/, "网络测试"],
  [/^ssh\b/, "远程连接"],
  [/^chmod\b|^chown\b/i, "修改权限"],
  [/^tar\b|^zip\b|^unzip\b|^Compress-Archive\b|^Expand-Archive\b/i, "压缩/解压"],
  [/^systemctl\b|^service\b/i, "管理服务"],
  [/^apt\b|^yum\b|^brew\b|^choco\b|^winget\b/i, "安装软件"],
];

/**
 * Extract a meaningful target path or argument from a command string.
 */
function extractCommandTarget(cmd: string): string | undefined {
  // Try to extract -Path parameter (PowerShell)
  const pathMatch = cmd.match(/-Path\s+["']?([^\s"'|;]+)/i);
  if (pathMatch) return shortenPath(pathMatch[1]);

  // Try to extract path-like arguments after the command
  const parts = cmd.split(/\s+/);
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    if (part.startsWith("-") || part.startsWith("/")) continue;
    if (/[/\\.]/.test(part) || /^[~$%]/.test(part)) {
      return shortenPath(part);
    }
  }
  return undefined;
}

/** Shorten a file path for display */
function shortenPath(p: string): string {
  const cleaned = p
    .replace(/\$env:USERPROFILE\\?/gi, "~/")
    .replace(/%USERPROFILE%\\?/gi, "~/")
    .replace(/\$HOME\/?/gi, "~/")
    .replace(/~\/\\?/g, "~/");
  if (cleaned.length > 40) {
    const parts = cleaned.split(/[/\\]/);
    if (parts.length > 3) {
      return `…/${parts.slice(-2).join("/")}`;
    }
    return cleaned.slice(0, 37) + "…";
  }
  return cleaned;
}

/**
 * Summarize a raw shell command into a user-friendly Chinese description.
 * e.g., "Get-ChildItem -Path $env:USERPROFILE\Desktop" → "列出文件: ~/Desktop"
 */
export function summarizeCommand(command: string): string {
  const firstCmd = command.split(/[|;&]/, 1)[0].trim();
  for (const [pattern, label] of COMMAND_LABELS) {
    if (pattern.test(firstCmd)) {
      const target = extractCommandTarget(firstCmd);
      return target ? `${label}: ${target}` : label;
    }
  }
  const exe = firstCmd.split(/\s+/)[0];
  if (exe && exe.length <= 30) {
    return `运行 ${exe}`;
  }
  return "执行命令";
}

// ============ Error output detection ============

const ERROR_PATTERNS =
  /\b(error|exception|failed|denied|not found|could not|cannot|无法|失败|错误|拒绝)\b/i;

/**
 * Detect whether tool output text likely contains an error.
 * Only flags short outputs to avoid false positives on large successful outputs.
 */
export function isErrorOutput(text: string): boolean {
  if (!text || text.length > 2000) return false;
  return ERROR_PATTERNS.test(text);
}

/**
 * Format tool output content for display in the sidebar.
 * Detects JSON and wraps it in a code block with formatting.
 */
export function formatToolOutputForSidebar(text: string): string {
  const trimmed = text.trim();
  // Try to detect and format JSON
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      return "```json\n" + JSON.stringify(parsed, null, 2) + "\n```";
    } catch {
      // Not valid JSON, return as-is
    }
  }
  return text;
}

/**
 * Get a truncated preview of tool output text.
 * Truncates to first N lines or first N characters, whichever is shorter.
 */
export function getTruncatedPreview(text: string): string {
  const allLines = text.split("\n");
  const lines = allLines.slice(0, PREVIEW_MAX_LINES);
  const preview = lines.join("\n");
  if (preview.length > PREVIEW_MAX_CHARS) {
    return preview.slice(0, PREVIEW_MAX_CHARS) + "…";
  }
  return lines.length < allLines.length ? preview + "…" : preview;
}
