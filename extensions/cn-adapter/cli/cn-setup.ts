import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Command } from "commander";
import { migrateConfig, createBackup, separateCnPluginFromConfig } from "../cn-defaults/migration.js";
import { setConfigVersionInState } from "../cn-defaults/data-migration.js";
import { createCnLogger, resolveDefaultConfigPath } from "../utils/index.js";

const log = createCnLogger("setup");

export function registerCnSetup(program: Command): void {
  program
    .command("cn-setup")
    .description("OpenClawCN 首次配置向导")
    .option(
      "--provider <name>",
      "模型提供商 (volcengine-plan/siliconflow/dashscope/doubao/zhipu/moonshot)",
    )
    .option("--model <name>", "默认模型名称")
    .option("--security <tier>", "安全档位 (full/balanced/safe)", "full")
    .option("--config-path <path>", "指定配置文件路径")
    .option("--non-interactive", "非交互模式，使用默认值")
    .action(async (opts) => {
      log.info("开始 OpenClawCN 配置...");

      const configPath = opts.configPath || resolveDefaultConfigPath();

      // If no provider/model specified, show template guidance
      if (!opts.provider && !opts.model) {
        printConfigTemplate(opts.security || "full");
        return;
      }

      // Read existing config
      let config: Record<string, unknown> = {};
      if (existsSync(configPath)) {
        try {
          config = JSON.parse(readFileSync(configPath, "utf-8"));
          log.info(`读取现有配置: ${configPath}`);
        } catch {
          log.warn("现有配置解析失败，将创建新配置");
        }
      }

      // Merge CN config
      const cnConfig: Record<string, unknown> = {
        locale: "zh-CN",
        securityTier: opts.security || "full",
      };
      if (opts.provider && opts.model) {
        cnConfig.models = {
          default: { provider: opts.provider, model: opts.model },
        };
      }

      // Ensure plugins.entries structure + enable cn-adapter & agent-team
      if (!config.plugins) config.plugins = {};
      const plugins = config.plugins as Record<string, unknown>;
      if (!plugins.entries) plugins.entries = {};
      const entries = plugins.entries as Record<string, unknown>;
      if (!entries["cn-adapter"]) entries["cn-adapter"] = {};
      const cnAdapter = entries["cn-adapter"] as Record<string, unknown>;
      cnAdapter.enabled = cnAdapter.enabled ?? true;
      cnAdapter.config = { ...((cnAdapter.config as Record<string, unknown>) || {}), ...cnConfig };
      if (!entries["agent-team"]) entries["agent-team"] = {};
      const agentTeam = entries["agent-team"] as Record<string, unknown>;
      agentTeam.enabled = agentTeam.enabled ?? true;

      // Resolve gateway.controlUi.root → ui-cn/dist (if it exists)
      if (!config.gateway) config.gateway = {};
      const gw = config.gateway as Record<string, unknown>;
      if (!gw.controlUi) gw.controlUi = {};
      const controlUi = gw.controlUi as Record<string, unknown>;
      if (!controlUi.root) {
        const __dirname = dirname(fileURLToPath(import.meta.url));
        const uiCnDist = resolve(__dirname, "../../../ui-cn/dist");
        if (existsSync(resolve(uiCnDist, "index.html"))) {
          controlUi.root = uiCnDist;
          log.info(`controlUi.root → ${uiCnDist}`);
        }
      }

      // Apply migration — 分离 cnPlugin.* 和上游配置
      const migrated = migrateConfig(config);
      const { upstreamConfig, configVersion } = separateCnPluginFromConfig(migrated.config);

      // Backup + write
      if (existsSync(configPath)) {
        const backupPath = createBackup(configPath);
        log.info(`备份: ${backupPath}`);
      }
      writeFileSync(configPath, JSON.stringify(upstreamConfig, null, 2));
      setConfigVersionInState(configVersion);
      log.info(`配置已写入: ${configPath}`);

      // Print summary
      console.log("\n=== 配置完成 ===");
      console.log(`  Provider: ${opts.provider}`);
      console.log(`  Model: ${opts.model}`);
      console.log(`  安全档位: ${opts.security || "full"}`);
      console.log(`  配置文件: ${configPath}`);
    });
}

function printConfigTemplate(security: string): void {
  console.log("\n=== OpenClawCN 配置向导 ===\n");
  console.log("请在 OpenClaw 配置文件中添加以下内容：\n");
  console.log(
    JSON.stringify(
      {
        plugins: {
          entries: {
            "cn-adapter": {
              config: {
                locale: "zh-CN",
                securityTier: security,
                models: {
                  default: {
                    provider: "<your-provider>",
                    model: "<your-model>",
                  },
                },
              },
            },
          },
        },
      },
      null,
      2,
    ),
  );

  console.log("\n支持的模型提供商：");
  console.log("  - volcengine-plan (火山 CodePlan，推荐)");
  console.log("  - siliconflow     (硅基流动)");
  console.log("  - dashscope       (通义千问)");
  console.log("  - doubao          (豆包)");
  console.log("  - zhipu           (智谱)");
  console.log("  - moonshot        (月之暗面)");
  console.log("\n使用 --provider <name> --model <name> 直接配置");
}
