import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createCnLogger } from "./logger.js";

const log = createCnLogger("install-cli");

/**
 * macOS / Linux：自动将 openclaw CLI wrapper 注册到用户 PATH。
 *
 * 策略：
 * 1. 找到 _dist/openclaw wrapper 脚本（与 dist/entry.js 同级上一层）
 * 2. 创建 ~/.local/bin/openclaw 符号链接（无需 sudo）
 * 3. 若 ~/.zshrc / ~/.bash_profile / ~/.profile 未包含 ~/.local/bin，则追加 export PATH
 * 4. 每次启动都验证符号链接是否有效（处理 app 更新/移动后断链问题）
 *    只有链接目标不变时才跳过（用 flag 文件记录上次链接目标路径）
 *
 * Windows：由 NSIS installer 的 PATH 注册处理，此函数直接 return。
 */
export async function autoInstallCliWrapper(): Promise<void> {
  // 只在 macOS / Linux 执行
  if (process.platform === "win32") return;

  try {
    // 找到 wrapper 脚本：entry.js 在 _dist/dist/entry.js，wrapper 在 _dist/openclaw
    const entryPath = path.resolve(process.argv[1] ?? "");
    const entryDir = path.dirname(entryPath);        // _dist/dist
    const distRoot = path.dirname(entryDir);         // _dist
    const wrapperPath = path.join(distRoot, "openclaw");

    const wrapperStat = await fs.stat(wrapperPath).catch(() => null);
    if (!wrapperStat || !wrapperStat.isFile()) {
      log.debug(`CLI wrapper 未找到：${wrapperPath}，跳过自动安装`);
      return;
    }

    // 确保 ~/.local/bin 存在
    const localBin = path.join(os.homedir(), ".local", "bin");
    await fs.mkdir(localBin, { recursive: true });
    const linkPath = path.join(localBin, "openclaw");

    // 检查现有符号链接是否指向当前 wrapper（每次启动都验证，处理 app 更新）
    let needInstall = true;
    try {
      const currentTarget = await fs.readlink(linkPath);
      if (currentTarget === wrapperPath) {
        // 链接目标一致，再验证链接是否可访问（防止断链）
        const targetStat = await fs.stat(linkPath).catch(() => null);
        if (targetStat) {
          needInstall = false; // 链接有效且目标一致，跳过
        }
        // target 无法访问（断链）→ needInstall = true，重新创建
      }
      // 链接目标不同（app 更新后路径变了）→ needInstall = true，重新创建
    } catch {
      // 不是符号链接或不存在 → needInstall = true
    }

    if (!needInstall) {
      log.debug("CLI wrapper 已是最新，跳过");
      return;
    }

    // 创建或更新符号链接
    try {
      await fs.unlink(linkPath);
    } catch {
      // 不存在则忽略
    }
    await fs.symlink(wrapperPath, linkPath);
    log.info(`CLI wrapper 已链接：${linkPath} -> ${wrapperPath}`);

    // 追加 PATH 到 shell 配置文件（如果还没有）
    const pathExport = `\nexport PATH="$HOME/.local/bin:$PATH"  # added by 66Claw\n`;
    const shellFiles = [
      path.join(os.homedir(), ".zshrc"),
      path.join(os.homedir(), ".bash_profile"),
      path.join(os.homedir(), ".profile"),
    ];

    for (const shellFile of shellFiles) {
      try {
        const content = await fs.readFile(shellFile, "utf-8").catch(() => "");
        // 检查是否已包含 ~/.local/bin（避免重复追加）
        if (!content.includes(".local/bin")) {
          await fs.appendFile(shellFile, pathExport, "utf-8");
          log.info(`已追加 PATH 到 ${shellFile}`);
        }
      } catch {
        // 文件不存在或无权限，跳过
      }
    }

    log.info("CLI 注册完成，重开终端后可使用 `openclaw` 命令");
  } catch (err) {
    // 静默失败，不影响主进程
    log.debug(`CLI 自动注册失败（可忽略）：${String(err)}`);
  }
}
