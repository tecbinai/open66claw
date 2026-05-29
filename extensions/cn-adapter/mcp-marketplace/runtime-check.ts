/**
 * Runtime Check — 检测 npx / uvx / node / python 可用性
 * CN-ONLY FILE — 不影响上游 OpenClaw
 */

import { execFileSync } from "node:child_process";

export type RuntimeName = "npx" | "uvx" | "node" | "python" | "pip" | "uv";

/**
 * 检测指定命令是否可用。
 */
export function isCommandAvailable(cmd: string): boolean {
  try {
    const checkCmd = process.platform === "win32" ? "where" : "which";
    execFileSync(checkCmd, [cmd], { stdio: "pipe", timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * 获取命令版本。
 */
export function getCommandVersion(cmd: string): string | null {
  try {
    const output = execFileSync(cmd, ["--version"], {
      stdio: "pipe",
      timeout: 5000,
      encoding: "utf-8",
    });
    return output.trim().split("\n")[0];
  } catch {
    return null;
  }
}

/**
 * 检测 npm 类 MCP 的运行时依赖。
 * 返回缺失的依赖列表。
 */
export function checkNpmRuntime(): string[] {
  const missing: string[] = [];
  if (!isCommandAvailable("npx")) {
    if (!isCommandAvailable("node")) {
      missing.push("Node.js (https://nodejs.org)");
    } else {
      missing.push("npx (通常随 Node.js 一起安装)");
    }
  }
  return missing;
}

/**
 * 检测 pypi 类 MCP 的运行时依赖。
 * 返回缺失的依赖列表。
 */
export function checkPypiRuntime(): string[] {
  const missing: string[] = [];
  if (!isCommandAvailable("uvx")) {
    if (!isCommandAvailable("uv")) {
      missing.push("uv (Python 包管理器)");
    }
  }
  return missing;
}

/**
 * 检测安装方法对应的运行时。
 */
export function checkRuntime(installMethod: string): {
  ready: boolean;
  missing: string[];
} {
  let missing: string[] = [];
  if (installMethod === "npm") {
    missing = checkNpmRuntime();
  } else if (installMethod === "pypi") {
    missing = checkPypiRuntime();
  }
  return { ready: missing.length === 0, missing };
}
