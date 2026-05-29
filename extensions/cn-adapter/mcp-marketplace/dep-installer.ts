/**
 * Dependency Installer — uv 自动安装 + fallback 链
 * CN-ONLY FILE — 不影响上游 OpenClaw
 */

import { execFileSync, execSync, spawn } from "node:child_process";
import { getMirrorList, recordMirrorSuccess } from "./cn-mirrors.js";
import { isCommandAvailable } from "./runtime-check.js";

/**
 * 尝试自动安装 uv (Python 包管理器)。
 * Fallback 链:
 *   Win:  pip install uv → winget → PowerShell(gh-proxy)
 *   Mac/Linux: pip install uv → curl(gh-proxy)
 */
export async function installUv(): Promise<{ success: boolean; method?: string; error?: string }> {
  // 已经有了
  if (isCommandAvailable("uv") || isCommandAvailable("uvx")) {
    return { success: true, method: "already-installed" };
  }

  // 方法 1: pip install uv
  if (isCommandAvailable("pip") || isCommandAvailable("pip3")) {
    const pipCmd = isCommandAvailable("pip3") ? "pip3" : "pip";
    try {
      execFileSync(pipCmd, ["install", "uv"], {
        stdio: "pipe",
        timeout: 120000,
      });
      if (isCommandAvailable("uvx")) {
        return { success: true, method: "pip" };
      }
    } catch {
      // fall through
    }
  }

  if (process.platform === "win32") {
    // 方法 2 (Windows): winget
    if (isCommandAvailable("winget")) {
      try {
        execSync(
          "winget install --id=astral-sh.uv -e --accept-source-agreements --accept-package-agreements",
          {
            stdio: "pipe",
            timeout: 120000,
          },
        );
        if (isCommandAvailable("uvx")) {
          return { success: true, method: "winget" };
        }
      } catch {
        // fall through
      }
    }

    // 方法 3 (Windows): PowerShell + GitHub mirror
    const ghMirrors = getMirrorList("github");
    for (const mirror of ghMirrors) {
      try {
        const installUrl = `${mirror}/https://github.com/astral-sh/uv/releases/latest/download/uv-installer.ps1`;
        execSync(`powershell -ExecutionPolicy Bypass -Command "irm '${installUrl}' | iex"`, {
          stdio: "pipe",
          timeout: 120000,
        });
        if (isCommandAvailable("uvx")) {
          recordMirrorSuccess("github", mirror);
          return { success: true, method: "powershell" };
        }
      } catch {
        continue;
      }
    }
  } else {
    // 方法 2 (Mac/Linux): curl + GitHub mirror
    const ghMirrors = getMirrorList("github");
    for (const mirror of ghMirrors) {
      try {
        const installUrl = `${mirror}/https://github.com/astral-sh/uv/releases/latest/download/uv-installer.sh`;
        execSync(`curl -fsSL '${installUrl}' | sh`, {
          stdio: "pipe",
          timeout: 120000,
          shell: "/bin/sh",
        });
        if (isCommandAvailable("uvx")) {
          recordMirrorSuccess("github", mirror);
          return { success: true, method: "curl" };
        }
      } catch {
        continue;
      }
    }
  }

  return {
    success: false,
    error: "无法自动安装 uv。请手动安装：https://docs.astral.sh/uv/getting-started/installation/",
  };
}

/**
 * 用指定 registry 预拉取 npm 包到本地缓存。
 * 内部单次尝试，由 prefetchNpmPackage 负责镜像轮转。
 */
function prefetchNpmOnce(
  packageName: string,
  env?: Record<string, string>,
  timeoutMs = 120000,
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill();
      resolve({ success: false, error: `npm 包下载超时 (${timeoutMs / 1000}s)` });
    }, timeoutMs);

    // npx -y <package> --help 触发下载并缓存
    const child = spawn("npx", ["-y", packageName, "--help"], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ...env },
      windowsHide: true,
      shell: process.platform === "win32",
    });

    let stderr = "";

    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      const msg = err.message.toLowerCase().includes("enoent")
        ? "未检测到 Node.js 环境，请先安装 Node.js（https://nodejs.org）"
        : `包下载失败：${err.message}`;
      resolve({ success: false, error: msg });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      // 检查 exit code + stderr 中的 npm 错误
      if (code !== 0) {
        const lower = stderr.toLowerCase();
        if (lower.includes("npm err") || lower.includes("fetch failed") || lower.includes("econnrefused") || lower.includes("etimedout")) {
          resolve({ success: false, error: "npm 包下载失败，请检查网络连接" });
          return;
        }
      }
      // exit 0 或非网络错误 → 算成功（包已缓存）
      resolve({ success: true });
    });
  });
}

/**
 * 预拉取 npm 包到本地缓存，确保后续 npx -y 能秒启。
 * 自动轮转 CN 镜像：npmmirror → 腾讯云 → 华为云。
 */
export async function prefetchNpmPackage(
  packageName: string,
  env?: Record<string, string>,
  timeoutMs = 120000,
): Promise<{ success: boolean; error?: string }> {
  const mirrors = getMirrorList("npm"); // [npmmirror, 腾讯云, 华为云]
  let lastError = "";

  for (const mirror of mirrors) {
    const mirrorEnv = { ...env, npm_config_registry: mirror };
    const result = await prefetchNpmOnce(packageName, mirrorEnv, timeoutMs);
    if (result.success) {
      recordMirrorSuccess("npm", mirror);
      return { success: true };
    }
    lastError = result.error ?? "下载失败";
    // 网络错误 → 换镜像重试；ENOENT 等非网络错误 → 直接返回
    if (result.error?.includes("Node.js") || result.error?.includes("enoent")) {
      return result; // 运行时缺失，换镜像也没用
    }
  }

  return { success: false, error: `所有镜像均下载失败：${lastError}` };
}

/**
 * 用指定 pypi 镜像预拉取包，内部单次尝试。
 */
function prefetchPypiOnce(
  packageName: string,
  env?: Record<string, string>,
  timeoutMs = 120000,
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill();
      resolve({ success: false, error: `pypi 包下载超时 (${timeoutMs / 1000}s)` });
    }, timeoutMs);

    const child = spawn("uvx", [packageName, "--help"], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ...env },
      windowsHide: true,
      shell: process.platform === "win32",
    });

    let stderr = "";

    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      const msg = err.message.toLowerCase().includes("enoent")
        ? "未检测到 Python uv 环境，请先安装 uv（https://docs.astral.sh/uv）"
        : `包下载失败：${err.message}`;
      resolve({ success: false, error: msg });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        const lower = stderr.toLowerCase();
        if (lower.includes("network") || lower.includes("connection") || lower.includes("timeout") || lower.includes("fetch") || lower.includes("resolve")) {
          resolve({ success: false, error: "pypi 包下载失败，请检查网络连接" });
          return;
        }
      }
      resolve({ success: true });
    });
  });
}

/**
 * 预拉取 pypi 包到本地缓存。
 * 自动轮转 CN 镜像：清华 → 阿里 → 中科大。
 */
export async function prefetchPypiPackage(
  packageName: string,
  env?: Record<string, string>,
  timeoutMs = 120000,
): Promise<{ success: boolean; error?: string }> {
  const mirrors = getMirrorList("pypi");
  let lastError = "";

  for (const mirror of mirrors) {
    const mirrorEnv = { ...env, UV_INDEX_URL: mirror, PIP_INDEX_URL: mirror };
    const result = await prefetchPypiOnce(packageName, mirrorEnv, timeoutMs);
    if (result.success) {
      recordMirrorSuccess("pypi", mirror);
      return { success: true };
    }
    lastError = result.error ?? "下载失败";
    if (result.error?.includes("uv") || result.error?.includes("enoent")) {
      return result; // 运行时缺失，换镜像也没用
    }
  }

  return { success: false, error: `所有镜像均下载失败：${lastError}` };
}
