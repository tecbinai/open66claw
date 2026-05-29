import type { Command } from "commander";

export function registerCnCommands(program: Command): void {
  program
    .command("帮助")
    .description("显示帮助信息")
    .action(() => {
      program.help();
    });

  program
    .command("状态")
    .description("显示当前状态")
    .action(async () => {
      const statusCmd = program.commands.find((c) => c.name() === "status");
      if (statusCmd) {
        await statusCmd.parseAsync([], { from: "user" });
      } else {
        console.log("status 命令不可用");
      }
    });

  program
    .command("配置")
    .description("显示或修改配置")
    .action(async () => {
      const configCmd = program.commands.find((c) => c.name() === "config");
      if (configCmd) {
        await configCmd.parseAsync([], { from: "user" });
      } else {
        console.log("config 命令不可用");
      }
    });

  program
    .command("升级")
    .description("自动升级 CN 配置")
    .action(async () => {
      const migrateCmd = program.commands.find((c) => c.name() === "cn-migrate");
      if (migrateCmd) {
        await migrateCmd.parseAsync(["--auto"], { from: "user" });
      } else {
        console.log("cn-migrate 命令不可用");
      }
    });
}
