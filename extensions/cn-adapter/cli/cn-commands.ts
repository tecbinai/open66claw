import type { Command } from "commander";

export function registerCnCommands(program: Command): void {
  program
    .command("cn-help")
    .description("Show CN adapter help")
    .action(() => {
      program.help();
    });

  program
    .command("cn-status")
    .description("Show current status")
    .action(async () => {
      const statusCmd = program.commands.find((c) => c.name() === "status");
      if (statusCmd) {
        await statusCmd.parseAsync([], { from: "user" });
      } else {
        console.log("status command is unavailable");
      }
    });

  program
    .command("cn-config")
    .description("Show or edit configuration")
    .action(async () => {
      const configCmd = program.commands.find((c) => c.name() === "config");
      if (configCmd) {
        await configCmd.parseAsync([], { from: "user" });
      } else {
        console.log("config command is unavailable");
      }
    });

  program
    .command("cn-upgrade")
    .description("Upgrade CN adapter configuration")
    .action(async () => {
      const migrateCmd = program.commands.find((c) => c.name() === "cn-migrate");
      if (migrateCmd) {
        await migrateCmd.parseAsync(["--auto"], { from: "user" });
      } else {
        console.log("cn-migrate command is unavailable");
      }
    });
}
