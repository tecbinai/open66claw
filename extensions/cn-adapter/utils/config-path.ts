import { join } from "node:path";

/** 解析默认配置文件路径，支持环境变量覆盖 */
export function resolveDefaultConfigPath(): string {
  if (process.env.OPENCLAW_CONFIG_PATH) {
    return process.env.OPENCLAW_CONFIG_PATH;
  }
  const home = process.env.HOME || process.env.USERPROFILE || "";
  const stateDir = process.env.OPENCLAW_STATE_DIR || join(home, ".openclaw");
  return join(stateDir, "openclaw.json");
}
