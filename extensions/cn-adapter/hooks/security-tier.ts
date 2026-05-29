import { realpathSync } from "node:fs";
import { resolve, relative, isAbsolute } from "node:path";
import { createCnLogger } from "../utils/index.js";
import type { CnPluginConfig } from "./cn-config.js";

const log = createCnLogger("security");

/**
 * safe 档白名单：只允许只读/搜索/记忆查询工具
 */
const SAFE_TOOL_ALLOWLIST = [
  "read_file",
  "list_files",
  "search",
  "web_search",
  "memory_get",
  "memory_search",
] as const;

/**
 * 危险工具：可执行系统命令
 */
const DANGEROUS_TOOLS = ["exec", "shell", "bash", "terminal"] as const;

/**
 * E2: safe 档敏感路径黑名单
 * 即使 read_file 在白名单，这些路径也必须拒绝访问
 */
const SENSITIVE_PATH_PATTERNS = [
  /[/\\]\.ssh[/\\]/i,
  /[/\\]\.aws[/\\]/i,
  /[/\\]\.kube[/\\]/i,
  /\/etc\/(passwd|shadow|hosts)$/i,
  /\.(pem|key|p12|pfx|crt|cer|env)$/i,
  /openclaw\.json$/i,
  /secrets?\.(json|ya?ml)$/i,
  /credentials?(\.json)?$/i,
];

function isSensitivePath(filePath: string): boolean {
  const p = filePath.replace(/\\/g, "/");
  return SENSITIVE_PATH_PATTERNS.some((re) => re.test(p));
}

/**
 * 创建安全三档拦截 handler。
 *
 * - full：满血模式，不拦截任何工具
 * - balanced：工作目录限制 + 危险工具提示确认
 * - safe：严格白名单 + 危险工具完全禁用
 *
 * @param getConfig - 返回当前 CnPluginConfig
 */
export function createSecurityTierHandler(getConfig: () => CnPluginConfig) {
  return async (event: { toolName: string; params: Record<string, unknown> }) => {
    const tier = getConfig().securityTier ?? "full";

    // full 档：不拦截
    if (tier === "full") return undefined;

    const toolName = event.toolName;

    if (tier === "safe") {
      // E2: safe 档下 read_file 须检查敏感路径黑名单（在白名单判断之前）
      if (toolName === "read_file") {
        const fp = extractFilePath(event.params);
        if (fp && isSensitivePath(fp)) {
          log.warn(`safe 档拦截敏感路径: ${fp}`);
          return { block: true, blockReason: `safe 档禁止访问敏感路径: ${fp}` };
        }
      }

      // safe 档：危险工具完全禁用
      if ((DANGEROUS_TOOLS as readonly string[]).includes(toolName)) {
        log.warn(`safe 档拦截危险工具: ${toolName}`);
        return {
          block: true,
          blockReason: `当前安全档位为 safe，工具 ${toolName} 被完全禁用`,
        };
      }
      // safe 档：非白名单工具拦截
      if (!(SAFE_TOOL_ALLOWLIST as readonly string[]).includes(toolName)) {
        log.warn(`safe 档拦截非白名单工具: ${toolName}`);
        return {
          block: true,
          blockReason: `当前安全档位为 safe，工具 ${toolName} 不在白名单中`,
        };
      }
      return undefined;
    }

    // balanced 档
    if (tier === "balanced") {
      // 危险工具提示确认
      if ((DANGEROUS_TOOLS as readonly string[]).includes(toolName)) {
        log.info(`balanced 档提示确认危险工具: ${toolName}`);
        return {
          block: true,
          blockReason: `当前安全档位为 balanced，工具 ${toolName} 属于危险工具，需要确认后才能执行`,
        };
      }

      // 工作目录限制：检查工具操作路径是否在项目目录内
      const filePath = extractFilePath(event.params);
      if (filePath && !isWithinProjectDir(filePath)) {
        log.warn(`balanced 档拦截项目外路径: ${filePath}`);
        return {
          block: true,
          blockReason: `当前安全档位为 balanced，工具 ${toolName} 的操作路径 ${filePath} 不在项目目录内`,
        };
      }

      return undefined;
    }

    return undefined;
  };
}

/**
 * 从工具参数中提取文件路径
 */
function extractFilePath(params: Record<string, unknown>): string | undefined {
  for (const key of ["path", "file_path", "filePath", "directory", "dir", "target"]) {
    const val = params[key];
    if (typeof val === "string" && val.length > 0) {
      return val;
    }
  }
  return undefined;
}

/**
 * 判断路径是否在当前工作目录内。
 * E1: 使用 realpathSync 解析符号链接，防止 symlink 穿越攻击。
 * 路径不存在时降级为字符串比较（更保守的安全策略）。
 */
function isWithinProjectDir(filePath: string): boolean {
  try {
    // E1: realpathSync 解析真实路径，符号链接不能用于穿越
    const resolved = realpathSync(resolve(filePath));
    const cwd = realpathSync(resolve(process.cwd()));
    const rel = relative(cwd, resolved);
    return rel !== "" ? !rel.startsWith("..") && !isAbsolute(rel) : true;
  } catch {
    // 路径不存在时 realpathSync 抛出，降级为普通字符串路径比较
    const resolved = resolve(filePath);
    const cwd = resolve(process.cwd());
    const rel = relative(cwd, resolved);
    return rel !== "" ? !rel.startsWith("..") && !isAbsolute(rel) : true;
  }
}
