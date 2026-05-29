/**
 * CN Mirrors — 国内镜像地址 + 轮转 + 成功记忆
 * CN-ONLY FILE — 不影响上游 OpenClaw
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { MirrorType, MirrorConfig, MirrorMemory } from "./types.js";

// ============================================================================
// Mirror Definitions
// ============================================================================

const NPM_MIRRORS: MirrorConfig[] = [
  { type: "npm", url: "https://registry.npmmirror.com", label: "npmmirror" },
  { type: "npm", url: "https://mirrors.cloud.tencent.com/npm", label: "腾讯云" },
  { type: "npm", url: "https://repo.huaweicloud.com/repository/npm", label: "华为云" },
];

const PYPI_MIRRORS: MirrorConfig[] = [
  { type: "pypi", url: "https://pypi.tuna.tsinghua.edu.cn/simple", label: "清华" },
  { type: "pypi", url: "https://mirrors.aliyun.com/pypi/simple", label: "阿里" },
  { type: "pypi", url: "https://pypi.mirrors.ustc.edu.cn/simple", label: "中科大" },
];

const GITHUB_MIRRORS: MirrorConfig[] = [
  { type: "github", url: "https://gh-proxy.com", label: "gh-proxy" },
  { type: "github", url: "https://ghfast.top", label: "ghfast" },
  { type: "github", url: "https://ghproxy.cn", label: "ghproxy" },
];

const ALL_MIRRORS: Record<MirrorType, MirrorConfig[]> = {
  npm: NPM_MIRRORS,
  pypi: PYPI_MIRRORS,
  github: GITHUB_MIRRORS,
};

// ============================================================================
// Memory File
// ============================================================================

const MEMORY_TTL_MS = 30 * 60 * 1000; // 30 minutes

function getMemoryPath(): string {
  return path.join(os.homedir(), ".openclawcn", "mirror-memory.json");
}

function readMemory(): MirrorMemory {
  try {
    const raw = fs.readFileSync(getMemoryPath(), "utf-8");
    const parsed = JSON.parse(raw);
    // Validate structure — old clawdbot format lacks the "mirrors" wrapper
    if (parsed && typeof parsed === "object" && parsed.mirrors && typeof parsed.mirrors === "object") {
      return parsed as MirrorMemory;
    }
    return { mirrors: {} as MirrorMemory["mirrors"] };
  } catch {
    return { mirrors: {} as MirrorMemory["mirrors"] };
  }
}

function writeMemory(memory: MirrorMemory): void {
  try {
    const dir = path.dirname(getMemoryPath());
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(getMemoryPath(), JSON.stringify(memory, null, 2));
  } catch {
    // best-effort
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * 获取指定类型的最佳镜像 URL。
 * 优先使用环境变量覆盖 → 成功记忆 → 列表第一个。
 */
export function getBestMirror(type: MirrorType): string {
  // 环境变量覆盖
  const envKey =
    type === "npm"
      ? "OPENCLAWCN_NPM_MIRROR"
      : type === "pypi"
        ? "OPENCLAWCN_PYPI_MIRROR"
        : "OPENCLAWCN_GITHUB_MIRROR";
  const envVal = process.env[envKey];
  if (envVal) return envVal;

  // 成功记忆
  const memory = readMemory();
  const remembered = memory.mirrors?.[type];
  if (remembered && Date.now() - remembered.timestamp < MEMORY_TTL_MS) {
    return remembered.url;
  }

  // 默认第一个
  return ALL_MIRRORS[type][0].url;
}

/**
 * 记录某个镜像成功使用。
 */
export function recordMirrorSuccess(type: MirrorType, url: string): void {
  const memory = readMemory();
  memory.mirrors[type] = { url, timestamp: Date.now() };
  writeMemory(memory);
}

/**
 * 获取指定类型的所有镜像 URL（按优先级排序，成功记忆的排最前）。
 */
export function getMirrorList(type: MirrorType): string[] {
  const mirrors = ALL_MIRRORS[type].map((m) => m.url);
  const best = getBestMirror(type);
  if (best && !mirrors.includes(best)) {
    return [best, ...mirrors];
  }
  // 把 best 提到最前
  return [best, ...mirrors.filter((m) => m !== best)];
}

/**
 * 获取 npm 安装时需要注入的 env。
 */
export function getNpmMirrorEnv(): Record<string, string> {
  return { npm_config_registry: getBestMirror("npm") };
}

/**
 * 获取 pypi/uv 安装时需要注入的 env。
 */
export function getPypiMirrorEnv(): Record<string, string> {
  return {
    UV_INDEX_URL: getBestMirror("pypi"),
    PIP_INDEX_URL: getBestMirror("pypi"),
  };
}
