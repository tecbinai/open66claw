import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { Command } from "commander";
import { createCnLogger } from "../utils/index.js";
import { getTelemetryFilePath } from "../telemetry/cn-telemetry.js";

const log = createCnLogger("compliance");

type CheckResult = {
  id: string;
  label: string;
  status: "pass" | "warn" | "fail" | "info";
  detail: string;
};

/**
 * 工信部"六要六不要"对照检查。
 * 输出自查报告，帮助企业快速评估 OpenClawCN 合规状态。
 */
export function registerCnCompliance(program: Command): void {
  program
    .command("cn-compliance")
    .description("工信部 AI Claw 安全合规自查报告（六要六不要对照）")
    .option("--json", "以 JSON 格式输出报告")
    .option("--config-path <path>", "指定配置文件路径")
    .action(async (opts) => {
      const configPath = opts.configPath || join(homedir(), ".openclaw", "openclaw.json");
      const results = await runComplianceChecks(configPath);

      if (opts.json) {
        console.log(JSON.stringify({ timestamp: new Date().toISOString(), checks: results }, null, 2));
        return;
      }

      printComplianceReport(results);
    });
}

async function runComplianceChecks(configPath: string): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // ── 读取配置 ───────────────────────────────────────────────
  let config: Record<string, unknown> = {};
  if (existsSync(configPath)) {
    try {
      config = JSON.parse(readFileSync(configPath, "utf-8"));
    } catch {
      log.warn("配置文件解析失败，将使用空配置检查");
    }
  }

  const cnConfig = extractPluginConfig(config);

  // ════════════════════════════════════════════════════════
  // 工信部"六要"检查
  // ════════════════════════════════════════════════════════

  // ① 要：使用最小权限原则
  const tier = cnConfig.securityTier ?? "full";
  results.push({
    id: "MIIT-1",
    label: "六要①：最小权限原则（安全档位）",
    status: tier === "balanced" ? "pass" : tier === "safe" ? "pass" : "warn",
    detail:
      tier === "full"
        ? `当前安全档位为 full（满血），建议改为 balanced。命令：cn-setup --security balanced`
        : `✓ 安全档位为 ${tier}，符合最小权限要求`,
  });

  // ② 要：网关仅监听本机（127.0.0.1/localhost）
  const bindAddr = getNestedString(config, "gateway.bindAddress") ?? "127.0.0.1";
  const isLocalOnly = bindAddr === "127.0.0.1" || bindAddr === "localhost" || bindAddr === "::1";
  results.push({
    id: "MIIT-2",
    label: "六要②：网关仅监听本机地址",
    status: isLocalOnly ? "pass" : "fail",
    detail: isLocalOnly
      ? `✓ 网关绑定地址: ${bindAddr}（仅本机访问）`
      : `❌ 网关绑定到 ${bindAddr}，存在公网暴露风险！请设置 gateway.bindAddress=127.0.0.1`,
  });

  // ③ 要：使用非默认端口
  const port = getNestedNumber(config, "gateway.port") ?? 18789;
  const isDefaultPort = port === 18789;
  results.push({
    id: "MIIT-3",
    label: "六要③：使用随机/非默认端口（非18789）",
    status: isDefaultPort ? "warn" : "pass",
    detail: isDefaultPort
      ? `当前端口为默认 18789，建议使用随机端口（10000-40000）以减少攻击面。升级后自动生效`
      : `✓ 当前端口: ${port}（非默认端口）`,
  });

  // ④ 要：启用审计日志
  const telemetryEnabled = cnConfig.telemetry !== false; // 默认 true
  const telemetryFile = getTelemetryFilePath();
  const hasAuditLog = existsSync(telemetryFile);
  results.push({
    id: "MIIT-4",
    label: "六要④：启用审计日志（本地 JSONL）",
    status: telemetryEnabled ? (hasAuditLog ? "pass" : "info") : "fail",
    detail: telemetryEnabled
      ? hasAuditLog
        ? `✓ 审计日志已启用，文件: ${telemetryFile}`
        : `✓ 审计日志已启用，尚无记录（文件将在首次 agent 运行后创建）`
      : `❌ 审计日志已关闭（cnPlugin.telemetry=false），请删除此配置项以恢复默认开启`,
  });

  // ⑤ 要：Skills 安装前人工审查
  results.push({
    id: "MIIT-5",
    label: "六要⑤：Skills/MCP 安装前人工审查",
    status: "info",
    detail:
      "woclaw 提供 cn.security.mcpInstallCheck API，UI 可在安装前展示风险警告。" +
      "请确保您的 UI 流程在安装 Skills 前调用此接口并获得用户确认",
  });

  // ⑥ 要：使用企业身份认证（设备认证）
  const devAuthDisabled = getNestedBool(config, "gateway.controlUi.dangerouslyDisableDeviceAuth") === true;
  results.push({
    id: "MIIT-6",
    label: "六要⑥：启用设备/身份认证",
    status: devAuthDisabled ? "warn" : "pass",
    detail: devAuthDisabled
      ? `当前已关闭设备认证（dangerouslyDisableDeviceAuth=true）。本地单机使用可接受，企业多用户部署请启用`
      : `✓ 设备认证已启用`,
  });

  // ════════════════════════════════════════════════════════
  // 工信部"六不要"检查
  // ════════════════════════════════════════════════════════

  // ⑦ 不要：不要在公网直接暴露网关端口
  // （已由 MIIT-2 覆盖，这里补充检查 HTTPS 配置）
  const httpEnabled = getNestedBool(config, "gateway.http.enabled") === true;
  results.push({
    id: "MIIT-7",
    label: "六不要①：不要公网暴露（HTTPS 配置）",
    status: httpEnabled ? "warn" : "pass",
    detail: httpEnabled
      ? `已启用 HTTP 端点，请确保通过反向代理（nginx/caddy）配置 HTTPS 后再对外暴露`
      : `✓ HTTP 端点未对外暴露`,
  });

  // ⑧ 不要：不要使用 root/管理员权限运行
  const isRoot = process.getuid?.() === 0;
  results.push({
    id: "MIIT-8",
    label: "六不要②：不要以 root/管理员权限运行",
    status: isRoot ? "fail" : "pass",
    detail: isRoot
      ? `❌ 当前进程以 root 权限运行！请切换到普通用户账户`
      : `✓ 当前进程非 root 权限运行`,
  });

  // ⑨ 不要：不要安装来源不明的 Skills
  results.push({
    id: "MIIT-9",
    label: "六不要③：不要安装来源不明的 Skills",
    status: "info",
    detail: "建议仅通过 woclaw 官方市场或经过代码审查的渠道安装 Skills/MCP 插件",
  });

  // ⑩ 不要：不要关闭审计功能
  results.push({
    id: "MIIT-10",
    label: "六不要④：不要关闭审计功能",
    status: telemetryEnabled ? "pass" : "fail",
    detail: telemetryEnabled
      ? `✓ 审计功能已开启`
      : `❌ 审计功能已关闭，违反工信部要求。请删除 cnPlugin.telemetry=false 配置项`,
  });

  // ────────────────────────────────────────────────────────
  // 补充信息
  // ────────────────────────────────────────────────────────
  results.push({
    id: "INFO-1",
    label: "配置文件路径",
    status: "info",
    detail: existsSync(configPath) ? `✓ ${configPath}` : `⚠️ 配置文件不存在: ${configPath}`,
  });

  results.push({
    id: "INFO-2",
    label: "cn-adapter 版本",
    status: "info",
    detail: "0.1.0（woclaw 工信部合规版）",
  });

  return results;
}

function printComplianceReport(results: CheckResult[]): void {
  console.log("\n╔═══════════════════════════════════════════════════════════╗");
  console.log("║         woclaw 工信部安全合规自查报告                     ║");
  console.log("║         参考：工信部《AI Claw 六要六不要》安全指引       ║");
  console.log("╚═══════════════════════════════════════════════════════════╝");
  console.log(`\n检查时间: ${new Date().toLocaleString("zh-CN")}\n`);

  let passCount = 0;
  let warnCount = 0;
  let failCount = 0;

  for (const r of results) {
    const icon =
      r.status === "pass" ? "✅" : r.status === "warn" ? "⚠️ " : r.status === "fail" ? "❌" : "ℹ️ ";
    if (r.status === "pass") passCount++;
    else if (r.status === "warn") warnCount++;
    else if (r.status === "fail") failCount++;
    console.log(`${icon} [${r.id}] ${r.label}`);
    console.log(`     ${r.detail}`);
    console.log();
  }

  console.log("─────────────────────────────────────────────────────────────");
  console.log(`汇总: ✅ 通过 ${passCount} | ⚠️  警告 ${warnCount} | ❌ 失败 ${failCount}`);

  if (failCount > 0) {
    console.log("\n⚠️  存在合规失败项，建议立即修复后再部署至生产环境！");
  } else if (warnCount > 0) {
    console.log("\n✅ 无严重合规问题，建议处理警告项以提升安全等级。");
  } else {
    console.log("\n✅ 恭喜！所有合规检查通过。");
  }
  console.log();
}

// ── 配置提取工具函数 ────────────────────────────────────────

function extractPluginConfig(config: Record<string, unknown>): Record<string, unknown> {
  try {
    // 优先读新路径：plugins.entries["cn-adapter"].config
    const entries = (config?.plugins as any)?.entries ?? {};
    const newPath = (entries["cn-adapter"]?.config as Record<string, unknown>) ?? {};
    // 回退读旧路径：cnPlugin.*（migration v1-v3 写入位置）
    const oldPath = (config?.cnPlugin as Record<string, unknown>) ?? {};
    // 新路径优先，缺失字段从旧路径补充
    return { ...oldPath, ...newPath };
  } catch {
    return {};
  }
}

function getNestedString(obj: Record<string, unknown>, dotPath: string): string | undefined {
  const val = getNestedValue(obj, dotPath);
  return typeof val === "string" ? val : undefined;
}

function getNestedNumber(obj: Record<string, unknown>, dotPath: string): number | undefined {
  const val = getNestedValue(obj, dotPath);
  return typeof val === "number" ? val : undefined;
}

function getNestedBool(obj: Record<string, unknown>, dotPath: string): boolean | undefined {
  const val = getNestedValue(obj, dotPath);
  return typeof val === "boolean" ? val : undefined;
}

function getNestedValue(obj: Record<string, unknown>, dotPath: string): unknown {
  const parts = dotPath.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}
