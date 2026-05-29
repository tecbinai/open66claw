/**
 * CLI 命令模板 — 替换 "my-cmd" 为你的命令名称
 *
 * 使用方法：
 * 1. 复制此文件到 cli/my-cmd.ts
 * 2. 替换所有 "my-cmd" / "myCmd" 标记
 * 3. 在 index.ts 中注册：
 *
 *   import { registerMyCmd } from "./cli/my-cmd.js";
 *   api.registerCli(
 *     ({ program }) => registerMyCmd(program),
 *     { commands: ["my-cmd"] },
 *   );
 */

import type { Command } from "commander";

export function registerMyCmd(program: Command): void {
  program
    .command("cn-my-cmd") // ← 替换命令名（建议 cn- 前缀）
    .description("我的自定义命令描述") // ← 替换描述
    .option("-d, --dry-run", "预览模式，不执行实际操作")
    .option("-v, --verbose", "详细输出")
    .action(async (opts: { dryRun?: boolean; verbose?: boolean }) => {
      // ← 替换为实际逻辑

      if (opts.dryRun) {
        console.log("[cn-my-cmd] 预览模式，不执行实际操作");
        return;
      }

      try {
        // 你的命令逻辑
        console.log("[cn-my-cmd] 执行成功");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[cn-my-cmd] 执行失败: ${msg}`);
        process.exitCode = 1;
      }
    });
}
