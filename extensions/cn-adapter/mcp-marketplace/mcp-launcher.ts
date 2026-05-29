/**
 * MCP Launcher — spawn MCP 进程 + handshake 验证
 * CN-ONLY FILE — 不影响上游 OpenClaw
 */

import { spawn } from "node:child_process";
import type { McpServerConfig } from "./types.js";

const DEFAULT_TIMEOUT_MS = 60000;

export interface LaunchResult {
  success: boolean;
  toolCount?: number;
  error?: string;
}

/**
 * 把技术错误翻译成小白能看懂的提示。
 */
function friendlyError(rawError: string, command: string): string {
  const lower = rawError.toLowerCase();

  // spawn ENOENT — 找不到命令
  if (lower.includes("enoent") || lower.includes("not found") || lower.includes("不是内部或外部命令")) {
    if (command === "npx" || command === "node") {
      return "未检测到 Node.js 环境，请先安装 Node.js（https://nodejs.org）";
    }
    if (command === "uvx" || command === "uv") {
      return "未检测到 Python uv 环境，请先安装 uv（https://docs.astral.sh/uv）";
    }
    return `未找到命令 "${command}"，请确认已安装对应的运行环境`;
  }

  // npm 网络错误
  if (lower.includes("npm err") || lower.includes("fetch failed") || lower.includes("econnrefused")) {
    return "npm 包下载失败，请检查网络连接或尝试使用代理";
  }

  // ETIMEOUT / ETIMEDOUT
  if (lower.includes("etimedout") || lower.includes("etimeout") || lower.includes("timeout")) {
    return "连接超时，可能是网络不稳定，请稍后重试";
  }

  // EACCES / EPERM — 权限问题
  if (lower.includes("eacces") || lower.includes("eperm") || lower.includes("permission denied")) {
    return "权限不足，请尝试以管理员身份运行";
  }

  // 进程退出码
  const exitCodeMatch = rawError.match(/进程退出码\s*(\d+)/);
  if (exitCodeMatch) {
    return `MCP 启动异常（错误码 ${exitCodeMatch[1]}），该能力可能不兼容当前系统`;
  }

  // capabilities 未返回
  if (lower.includes("未返回 capabilities") || lower.includes("capabilities")) {
    return "MCP 启动成功但未正确响应，该能力可能版本不兼容";
  }

  // stdin 写入失败
  if (lower.includes("无法写入 stdin") || lower.includes("stdin")) {
    return "无法与 MCP 进程通信，请重试";
  }

  // MCP 自身初始化失败 — 数据库/目录/配置文件缺失
  if (lower.includes("failed to initialize") || lower.includes("initialization failed") || lower.includes("初始化失败")) {
    if (lower.includes("database") || lower.includes("db")) {
      return "该能力初始化失败：数据库目录不存在。请检查配置或联系能力开发者";
    }
    if (lower.includes("directory does not exist") || lower.includes("no such file")) {
      return "该能力初始化失败：所需目录不存在。请检查配置路径是否正确";
    }
    return "该能力初始化失败，可能缺少必要的配置或依赖，请联系能力开发者";
  }

  // 目录/文件不存在（非初始化上下文）
  if (lower.includes("directory does not exist") || lower.includes("no such file or directory") || lower.includes("cannot open database")) {
    return "该能力所需的文件或目录不存在，请检查配置路径是否正确";
  }

  // 模块/依赖缺失
  if (lower.includes("cannot find module") || lower.includes("module not found") || lower.includes("importerror") || lower.includes("modulenotfounderror")) {
    return "该能力缺少必要的依赖模块，请尝试重新安装";
  }

  // 端口被占用
  if (lower.includes("eaddrinuse") || lower.includes("address already in use")) {
    return "端口被占用，请关闭占用该端口的程序后重试";
  }

  // 兜底：截取前 200 字符，加上通用提示
  const short = rawError.length > 200 ? rawError.slice(0, 200) + "..." : rawError;
  return `启动失败：${short}`;
}

/**
 * Spawn an MCP server process and verify it starts correctly.
 *
 * We send a JSON-RPC "initialize" request and check for a valid response.
 * This is a simplified MCP handshake — we don't maintain a full session,
 * just verify the server is responding.
 */
export async function testMcpServer(
  config: McpServerConfig,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<LaunchResult> {
  return new Promise<LaunchResult>((resolve) => {
    const cmd = config.command;

    const timer = setTimeout(() => {
      child.kill();
      resolve({ success: false, error: "连接超时，可能是网络不稳定或该能力启动较慢，请稍后重试" });
    }, timeoutMs);

    const child = spawn(config.command, config.args ?? [], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...config.env },
      windowsHide: true,
      shell: process.platform === "win32",
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
      // Try to parse MCP JSON-RPC response
      try {
        const lines = stdout.split("\n");
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          const msg = JSON.parse(trimmed);
          if (msg.result?.capabilities) {
            clearTimeout(timer);
            const tools = msg.result.capabilities.tools;
            const toolCount = Array.isArray(tools) ? tools.length : tools ? 1 : 0;
            child.kill();
            resolve({ success: true, toolCount });
            return;
          }
        }
      } catch {
        // Not valid JSON yet, keep accumulating
      }
    });

    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ success: false, error: friendlyError(err.message, cmd) });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        const rawMsg = stderr.trim() || `进程退出码 ${code}`;
        resolve({ success: false, error: friendlyError(rawMsg, cmd) });
      } else {
        // Process exited cleanly but without sending capabilities response
        resolve({ success: false, error: "MCP 启动成功但未正确响应，该能力可能版本不兼容" });
      }
    });

    // Send MCP initialize request (JSON-RPC 2.0)
    const initRequest = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "openclawcn-test", version: "1.0.0" },
      },
    });

    try {
      child.stdin.write(initRequest + "\n");
    } catch {
      clearTimeout(timer);
      resolve({ success: false, error: "无法与 MCP 进程通信，请重试" });
    }
  });
}
