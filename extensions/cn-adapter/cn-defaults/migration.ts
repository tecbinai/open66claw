import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { randomBytes } from "node:crypto";

// ============================================================
// Types
// ============================================================

/** 3 级合并策略 */
export type MergeStrategy = "fill-empty" | "deep-merge" | "force-overwrite";

/** 单个配置变更 */
export type ConfigChange = {
  /** dot-separated 路径，如 "tools.exec.host" */
  path: string;
  /** 要设置的值 */
  value: unknown;
  /** 合并策略 */
  strategy: MergeStrategy;
};

/** 一次迁移步骤 */
export type MigrationStep = {
  /** 目标版本号 */
  version: number;
  /** 可读标签 */
  label: string;
  /** 配置变更列表 */
  changes: ConfigChange[];
};

/** 迁移结果 */
export type MigrationResult = {
  /** 迁移后的配置 */
  config: Record<string, unknown>;
  /** 已应用的版本号列表 */
  applied: number[];
  /** 跳过的版本号列表（已经超过当前版本） */
  skipped: number[];
};

// ============================================================
// 迁移表
// ============================================================

/**
 * 按版本号排列的迁移步骤。
 * 每次新增配置项时，添加一个新的 MigrationStep，version +1。
 * 不要修改已有的迁移步骤！
 */
export const MIGRATIONS: MigrationStep[] = [
  {
    version: 1,
    label: "Phase 0: 初始 CN 默认值",
    changes: [
      { path: "tools.exec.host", value: "gateway", strategy: "fill-empty" },
      { path: "tools.exec.security", value: "full", strategy: "fill-empty" },
      { path: "cnPlugin.configVersion", value: 1, strategy: "force-overwrite" },
      { path: "cnPlugin.locale", value: "zh-CN", strategy: "fill-empty" },
      {
        path: "cnPlugin.mirror.npm",
        value: "https://registry.npmmirror.com",
        strategy: "fill-empty",
      },
      {
        path: "cnPlugin.mirror.pip",
        value: "https://pypi.tuna.tsinghua.edu.cn/simple",
        strategy: "fill-empty",
      },
      { path: "cnPlugin.securityTier", value: "full", strategy: "fill-empty" },
    ],
  },
  {
    version: 2,
    label: "Phase 1: Hook 功能配置",
    changes: [
      { path: "cnPlugin.models", value: {}, strategy: "fill-empty" as const },
      { path: "cnPlugin.configVersion", value: 2, strategy: "force-overwrite" as const },
    ],
  },
  {
    version: 3,
    label: "Phase 5: 升级体系配置",
    changes: [
      { path: "cnPlugin.proxy", value: { enabled: false }, strategy: "fill-empty" },
      { path: "cnPlugin.telemetry", value: false, strategy: "fill-empty" },
      { path: "cnPlugin.updateChannel", value: "stable", strategy: "fill-empty" },
      { path: "cnPlugin.configVersion", value: 3, strategy: "force-overwrite" },
    ],
  },
  {
    version: 4,
    label: "Phase 6: 默认启用 cn-adapter + agent-team 插件，gateway.mode=local",
    changes: [
      { path: "plugins.entries.cn-adapter.enabled", value: true, strategy: "fill-empty" },
      { path: "plugins.entries.agent-team.enabled", value: true, strategy: "fill-empty" },
      { path: "gateway.mode", value: "local", strategy: "fill-empty" },
      { path: "cnPlugin.configVersion", value: 4, strategy: "force-overwrite" },
    ],
  },
  {
    version: 5,
    label: "Phase 7: 默认启用常用渠道插件（未配置凭证不会建连接，无性能影响）",
    changes: [
      { path: "plugins.entries.feishu.enabled", value: true, strategy: "fill-empty" },
      { path: "plugins.entries.dingtalk.enabled", value: true, strategy: "fill-empty" },
      { path: "plugins.entries.wecom.enabled", value: true, strategy: "fill-empty" },
      { path: "plugins.entries.telegram.enabled", value: true, strategy: "fill-empty" },
      { path: "plugins.entries.discord.enabled", value: true, strategy: "fill-empty" },
      { path: "plugins.entries.slack.enabled", value: true, strategy: "fill-empty" },
      { path: "cnPlugin.configVersion", value: 5, strategy: "force-overwrite" },
    ],
  },
  {
    version: 6,
    label: "Phase 8: 满血默认值 — exec 免确认、并发 6、超时防护、搜索开启",
    changes: [
      // ── exec 免确认 ──────────────────────────────────────────
      // 上游默认 ask 未定义（运行时 fallback "on-miss"），每次未见命令都弹确认框。
      // CN 满血模式下设为 "off"，配合 security=full 实现零打扰体验。
      // 用户可随时在 UI Config Tab → tools.exec.ask 调回 "on-miss"。
      { path: "tools.exec.ask", value: "off", strategy: "fill-empty" },

      // ── safeBins 白名单 ──────────────────────────────────────
      // balanced 模式下 exec 只放行白名单命令。
      // full 模式下此字段不生效（security=full 跳过白名单检查），
      // 但预写入可让用户切换到 balanced 后立即可用。
      {
        path: "tools.exec.safeBins",
        value: [
          "ls", "cat", "head", "tail", "wc", "sort", "uniq", "cut", "tr",
          "grep", "rg", "find", "fd", "which", "file", "stat", "du", "df",
          "echo", "printf", "date", "env", "printenv", "whoami", "uname",
          "pwd", "cd", "mkdir", "cp", "mv", "rm", "touch", "chmod",
          "git", "gh", "svn",
          "node", "npm", "npx", "pnpm", "yarn", "bun", "deno", "tsx",
          "python", "python3", "pip", "pip3", "uv", "poetry", "conda",
          "go", "cargo", "rustc", "make", "cmake",
          "docker", "docker-compose",
          "curl", "wget", "ssh", "scp", "rsync",
        ],
        strategy: "fill-empty",
      },

      // ── agent 并发 & 超时 ────────────────────────────────────
      // 上游 applyAgentDefaults 只在 undefined 时填 maxConcurrent=4。
      // CN 满血设为 6（power profile 级别）。
      // timeoutSeconds 上游无默认值（无限制），CN 设 1800s 防止失控消耗。
      { path: "agents.defaults.maxConcurrent", value: 6, strategy: "fill-empty" },
      { path: "agents.defaults.timeoutSeconds", value: 1800, strategy: "fill-empty" },

      // ── web 搜索 & 抓取超时 ──────────────────────────────────
      // CN 用户跨境访问延迟较高，给更宽裕的超时。
      // 上游默认 30s，CN 设 60s。
      { path: "tools.web.search.timeoutSeconds", value: 60, strategy: "fill-empty" },
      { path: "tools.web.fetch.timeoutSeconds", value: 60, strategy: "fill-empty" },

      // ── web 搜索开关 ─────────────────────────────────────────
      // 显式开启搜索（上游默认已 true，但写入配置文件让用户可见）。
      { path: "tools.web.search.enabled", value: true, strategy: "fill-empty" },

      // ── configVersion ────────────────────────────────────────
      { path: "cnPlugin.configVersion", value: 6, strategy: "force-overwrite" },
    ],
  },
  {
    version: 7,
    label: "CN 出厂即用：通道 open + 群组 open + 设备认证跳过",
    changes: [
      // CN 版用户通过 UI 自行配置 bot 凭证，不需要 CLI 配对/审批。
      // 只用 fill-empty：用户若已手动设过则不覆盖。

      // ═══ 1. 所有通道 dmPolicy=open（跳过 DM 配对审批） ═══
      // ── 飞书 ──
      { path: "channels.feishu.dmPolicy", value: "open", strategy: "fill-empty" },
      { path: "channels.feishu.allowFrom", value: ["*"], strategy: "fill-empty" },
      { path: "channels.feishu.groupPolicy", value: "open", strategy: "fill-empty" },
      { path: "channels.feishu.groupAllowFrom", value: ["*"], strategy: "fill-empty" },
      // ── 钉钉 ──
      { path: "channels.dingtalk.dmPolicy", value: "open", strategy: "fill-empty" },
      { path: "channels.dingtalk.allowFrom", value: ["*"], strategy: "fill-empty" },
      { path: "channels.dingtalk.groupPolicy", value: "open", strategy: "fill-empty" },
      { path: "channels.dingtalk.groupAllowFrom", value: ["*"], strategy: "fill-empty" },
      // ── 企业微信 ──
      { path: "channels.wecom.dmPolicy", value: "open", strategy: "fill-empty" },
      { path: "channels.wecom.allowFrom", value: ["*"], strategy: "fill-empty" },
      { path: "channels.wecom.groupPolicy", value: "open", strategy: "fill-empty" },
      { path: "channels.wecom.groupAllowFrom", value: ["*"], strategy: "fill-empty" },
      // ── Telegram ──
      { path: "channels.telegram.dmPolicy", value: "open", strategy: "fill-empty" },
      { path: "channels.telegram.allowFrom", value: ["*"], strategy: "fill-empty" },
      { path: "channels.telegram.groupPolicy", value: "open", strategy: "fill-empty" },
      { path: "channels.telegram.groupAllowFrom", value: ["*"], strategy: "fill-empty" },
      // ── Discord ──（schema 无 groupAllowFrom，用 guilds 级别管理群组权限）
      { path: "channels.discord.dmPolicy", value: "open", strategy: "fill-empty" },
      { path: "channels.discord.allowFrom", value: ["*"], strategy: "fill-empty" },
      { path: "channels.discord.groupPolicy", value: "open", strategy: "fill-empty" },
      // ── Slack ──（schema 无 groupAllowFrom，用 channels 级别管理）
      { path: "channels.slack.dmPolicy", value: "open", strategy: "fill-empty" },
      { path: "channels.slack.allowFrom", value: ["*"], strategy: "fill-empty" },
      { path: "channels.slack.groupPolicy", value: "open", strategy: "fill-empty" },
      // ── WhatsApp ──
      { path: "channels.whatsapp.dmPolicy", value: "open", strategy: "fill-empty" },
      { path: "channels.whatsapp.allowFrom", value: ["*"], strategy: "fill-empty" },
      { path: "channels.whatsapp.groupPolicy", value: "open", strategy: "fill-empty" },
      { path: "channels.whatsapp.groupAllowFrom", value: ["*"], strategy: "fill-empty" },

      // ═══ 2. 桌面版跳过设备配对（本机使用无需设备认证） ═══
      { path: "gateway.controlUi.dangerouslyDisableDeviceAuth", value: true, strategy: "fill-empty" },

      { path: "cnPlugin.configVersion", value: 7, strategy: "force-overwrite" },
    ],
  },
  {
    version: 8,
    label: "CN 满血出厂：所有工具 & 能力默认全开",
    changes: [
      // ═══ 1. 浏览器控制（全功能） ═══
      { path: "browser.enabled", value: true, strategy: "fill-empty" },
      { path: "browser.evaluateEnabled", value: true, strategy: "fill-empty" },
      { path: "browser.headless", value: false, strategy: "fill-empty" },
      { path: "nodeHost.browserProxy.enabled", value: true, strategy: "fill-empty" },

      // ═══ 2. Web 搜索 & 抓取 ═══
      { path: "tools.web.search.enabled", value: true, strategy: "fill-empty" },
      { path: "tools.web.fetch.enabled", value: true, strategy: "fill-empty" },

      // ═══ 3. 多媒体理解（图片/音频/视频） ═══
      { path: "tools.media.image.enabled", value: true, strategy: "fill-empty" },
      { path: "tools.media.audio.enabled", value: true, strategy: "fill-empty" },
      { path: "tools.media.video.enabled", value: true, strategy: "fill-empty" },

      // ═══ 4. 链接预处理 ═══
      { path: "tools.links.enabled", value: true, strategy: "fill-empty" },

      // ═══ 5. 记忆系统（全量开启） ═══
      { path: "agents.defaults.memorySearch.enabled", value: true, strategy: "fill-empty" },
      { path: "agents.defaults.memorySearch.store.vector.enabled", value: true, strategy: "fill-empty" },
      { path: "agents.defaults.memorySearch.query.hybrid.enabled", value: true, strategy: "fill-empty" },
      { path: "agents.defaults.memorySearch.cache.enabled", value: true, strategy: "fill-empty" },
      { path: "agents.defaults.memorySearch.remote.batch.enabled", value: true, strategy: "fill-empty" },

      // ═══ 6. 上下文压缩增强 ═══
      { path: "agents.defaults.compaction.memoryFlush.enabled", value: true, strategy: "fill-empty" },

      // ═══ 7. 定时任务 ═══
      { path: "cron.enabled", value: true, strategy: "fill-empty" },

      // ═══ 8. 诊断 ═══
      { path: "diagnostics.enabled", value: true, strategy: "fill-empty" },

      // ═══ 9. 网关控制面板 ═══
      { path: "gateway.controlUi.enabled", value: true, strategy: "fill-empty" },

      // ═══ 10. HTTP 兼容端点（OpenAI 格式） ═══
      { path: "gateway.http.endpoints.chatCompletions.enabled", value: true, strategy: "fill-empty" },
      { path: "gateway.http.endpoints.responses.enabled", value: true, strategy: "fill-empty" },

      // ═══ 11. 消息广播 & 跨上下文 ═══
      { path: "tools.message.broadcast.enabled", value: true, strategy: "fill-empty" },
      { path: "tools.message.crossContext.marker.enabled", value: true, strategy: "fill-empty" },

      // ═══ 12. 智能体间通信 ═══
      { path: "tools.agentToAgent.enabled", value: true, strategy: "fill-empty" },

      // ═══ 13. 命令 & 技能 ═══
      { path: "commands.native", value: "auto", strategy: "fill-empty" },
      { path: "commands.nativeSkills", value: "auto", strategy: "fill-empty" },
      { path: "commands.restart", value: true, strategy: "fill-empty" },

      // ═══ 14. ACP（智能体计算平台） ═══
      { path: "acp.enabled", value: true, strategy: "fill-empty" },
      { path: "acp.dispatch.enabled", value: true, strategy: "fill-empty" },

      // ═══ 15. Canvas 协作编辑 ═══
      { path: "canvasHost.enabled", value: true, strategy: "fill-empty" },

      // ═══ 16. 插件系统 ═══
      { path: "plugins.enabled", value: true, strategy: "fill-empty" },

      // ═══ 17. Hook 系统 ═══
      { path: "hooks.enabled", value: true, strategy: "fill-empty" },

      // ═══ 18. 跨渠道消息（飞书→钉钉 等） ═══
      { path: "tools.message.crossContext.allowAcrossProviders", value: true, strategy: "fill-empty" },

      // ═══ 19. 工具循环检测（防 agent 死循环） ═══
      { path: "tools.loopDetection.enabled", value: true, strategy: "fill-empty" },

      // ═══ 20. apply_patch 工具（OpenAI 兼容模型需要） ═══
      { path: "tools.exec.applyPatch.enabled", value: true, strategy: "fill-empty" },

      // ═══ 21. 浏览器允许访问局域网（本地 Ollama/服务不被 SSRF 拦截） ═══
      { path: "browser.ssrfPolicy.dangerouslyAllowPrivateNetwork", value: true, strategy: "fill-empty" },

      // ═══ 22. 跨上下文消息发送（agent 可以主动给用户发消息） ═══
      { path: "tools.message.allowCrossContextSend", value: true, strategy: "fill-empty" },

      { path: "cnPlugin.configVersion", value: 8, strategy: "force-overwrite" },
    ],
  },
  {
    version: 9,
    label: "CN 出厂插件全量条目：中国用户推荐的默认开，海外的默认关（Config 页可见可切换）",
    changes: [
      // ═══════════════════════════════════════════════════════════
      // 默认开启（true）— 中国用户核心 + 推荐
      // ═══════════════════════════════════════════════════════════

      // ── 核心基础 ──
      { path: "plugins.entries.memory-core.enabled", value: true, strategy: "fill-empty" },
      { path: "plugins.entries.memory-lancedb.enabled", value: true, strategy: "fill-empty" },
      { path: "plugins.entries.diffs.enabled", value: true, strategy: "fill-empty" },
      { path: "plugins.entries.diagnostics-otel.enabled", value: true, strategy: "fill-empty" },

      // ── 中国本土渠道 ──
      { path: "plugins.entries.openclawwechat.enabled", value: true, strategy: "fill-empty" },
      { path: "plugins.entries.qqbot.enabled", value: true, strategy: "fill-empty" },
      { path: "plugins.entries.feishu-cn-enhance.enabled", value: true, strategy: "fill-empty" },

      // ── 国内模型 OAuth ──
      { path: "plugins.entries.minimax-portal-auth.enabled", value: true, strategy: "fill-empty" },
      { path: "plugins.entries.qwen-portal-auth.enabled", value: true, strategy: "fill-empty" },

      // ═══════════════════════════════════════════════════════════
      // 默认关闭（false）— 海外渠道 & 特殊用途，用户在 Config 页自行开启
      // ═══════════════════════════════════════════════════════════

      // ── 海外 IM 渠道（需翻墙或海外服务器） ──
      { path: "plugins.entries.bluebubbles.enabled", value: false, strategy: "fill-empty" },
      { path: "plugins.entries.googlechat.enabled", value: false, strategy: "fill-empty" },
      { path: "plugins.entries.imessage.enabled", value: false, strategy: "fill-empty" },
      { path: "plugins.entries.irc.enabled", value: false, strategy: "fill-empty" },
      { path: "plugins.entries.line.enabled", value: false, strategy: "fill-empty" },
      { path: "plugins.entries.matrix.enabled", value: false, strategy: "fill-empty" },
      { path: "plugins.entries.mattermost.enabled", value: false, strategy: "fill-empty" },
      { path: "plugins.entries.msteams.enabled", value: false, strategy: "fill-empty" },
      { path: "plugins.entries.nextcloud-talk.enabled", value: false, strategy: "fill-empty" },
      { path: "plugins.entries.nostr.enabled", value: false, strategy: "fill-empty" },
      { path: "plugins.entries.signal.enabled", value: false, strategy: "fill-empty" },
      { path: "plugins.entries.synology-chat.enabled", value: false, strategy: "fill-empty" },
      { path: "plugins.entries.tlon.enabled", value: false, strategy: "fill-empty" },
      { path: "plugins.entries.twitch.enabled", value: false, strategy: "fill-empty" },
      { path: "plugins.entries.whatsapp.enabled", value: false, strategy: "fill-empty" },
      { path: "plugins.entries.zalo.enabled", value: false, strategy: "fill-empty" },
      { path: "plugins.entries.zalouser.enabled", value: false, strategy: "fill-empty" },

      // ── 海外工具 & 特殊用途 ──
      { path: "plugins.entries.acpx.enabled", value: false, strategy: "fill-empty" },
      { path: "plugins.entries.copilot-proxy.enabled", value: false, strategy: "fill-empty" },
      { path: "plugins.entries.google-gemini-cli-auth.enabled", value: false, strategy: "fill-empty" },
      { path: "plugins.entries.llm-task.enabled", value: false, strategy: "fill-empty" },
      { path: "plugins.entries.lobster.enabled", value: false, strategy: "fill-empty" },
      { path: "plugins.entries.open-prose.enabled", value: false, strategy: "fill-empty" },
      { path: "plugins.entries.phone-control.enabled", value: false, strategy: "fill-empty" },
      { path: "plugins.entries.thread-ownership.enabled", value: false, strategy: "fill-empty" },
      { path: "plugins.entries.voice-call.enabled", value: false, strategy: "fill-empty" },

      // ── 本地模型推理 ──
      { path: "plugins.entries.ollama.enabled", value: true, strategy: "fill-empty" },  // 国内本地模型主流方案
      { path: "plugins.entries.vllm.enabled", value: false, strategy: "fill-empty" },
      { path: "plugins.entries.sglang.enabled", value: false, strategy: "fill-empty" },

      // ── 语音（按需开启） ──
      { path: "plugins.entries.talk-voice.enabled", value: false, strategy: "fill-empty" },

      { path: "cnPlugin.configVersion", value: 9, strategy: "force-overwrite" },
    ],
  },
  {
    version: 10,
    label: "MIIT 合规：随机端口（10000-40000）避免默认 18789 暴露攻击面",
    changes: [
      // 工信部安全要求：禁止使用已知默认端口暴露服务
      // 腾讯 ClawPro 方案：随机端口 10000-40000，不走默认 18789
      // 此迁移只做 fill-empty，不覆盖用户已配置的端口
      {
        path: "gateway.port",
        value: Math.floor(10000 + Math.random() * 30000),
        strategy: "fill-empty",
      },
      { path: "cnPlugin.configVersion", value: 10, strategy: "force-overwrite" },
    ],
  },
  // 后续版本在这里追加新的迁移步骤
];

// ============================================================
// 核心函数
// ============================================================

/**
 * 读取配置的当前版本号。
 *
 * @deprecated 请使用 data-migration.ts 的 getCurrentConfigVersion()，
 * 它优先读 cn-adapter-state.json，回退读 cnPlugin.configVersion。
 * 此函数保留仅用于向后兼容（只读 openclaw.json 的 cnPlugin）。
 */
export function getCurrentConfigVersion(config: Record<string, unknown>): number {
  const cnPlugin = config.cnPlugin as Record<string, unknown> | undefined;
  if (!cnPlugin || typeof cnPlugin.configVersion !== "number") {
    return 0;
  }
  return cnPlugin.configVersion;
}

/**
 * 将 migrateConfig 的结果分离为两部分：
 * - upstreamConfig: 不含 cnPlugin 的配置（可安全通过上游 schema 校验）
 * - cnPluginValues: cnPlugin.* 下的所有值（应写入 cn-adapter-state.json）
 * - configVersion: 最终的 configVersion 值
 */
export function separateCnPluginFromConfig(config: Record<string, unknown>): {
  upstreamConfig: Record<string, unknown>;
  cnPluginValues: Record<string, unknown>;
  configVersion: number;
} {
  const result = structuredClone(config);
  const cnPlugin = result.cnPlugin as Record<string, unknown> | undefined;
  const configVersion = cnPlugin && typeof cnPlugin.configVersion === "number"
    ? cnPlugin.configVersion
    : 0;
  const cnPluginValues = cnPlugin ? structuredClone(cnPlugin) : {};
  delete result.cnPlugin;
  return { upstreamConfig: result, cnPluginValues, configVersion };
}

/**
 * 执行配置迁移。
 * 从当前版本逐步迁移到目标版本（默认最新）。
 *
 * @param config - 当前配置对象（不会被修改，返回新对象）
 * @param targetVersion - 目标版本号（默认 = 最新迁移版本号）
 * @returns 迁移结果
 */
export function migrateConfig(
  config: Record<string, unknown>,
  targetVersion?: number,
): MigrationResult {
  const currentVersion = getCurrentConfigVersion(config);
  const maxVersion = targetVersion ?? Math.max(0, ...MIGRATIONS.map((m) => m.version));

  let result = structuredClone(config);
  const applied: number[] = [];
  const skipped: number[] = [];

  for (const migration of MIGRATIONS) {
    if (migration.version <= currentVersion) {
      skipped.push(migration.version);
      continue;
    }
    if (migration.version > maxVersion) {
      continue;
    }

    for (const change of migration.changes) {
      result = applyMergeStrategy(result, change.path, change.value, change.strategy);
    }
    applied.push(migration.version);
  }

  // hooks.enabled=true 必须有 hooks.token，否则 gateway 启动失败。
  // 如果迁移启用了 hooks 但没有 token，自动生成一个随机 token。
  const hooksSection = result.hooks as Record<string, unknown> | undefined;
  if (hooksSection?.enabled === true && !hooksSection?.token) {
    result = applyMergeStrategy(result, "hooks.token", randomBytes(24).toString("hex"), "fill-empty");
  }

  return { config: result, applied, skipped };
}

/**
 * 按指定策略在 config 对象上设置一个 dot-path 值。
 *
 * @param config - 配置对象（不修改，返回新对象）
 * @param path - dot-separated 路径，如 "tools.exec.host"
 * @param value - 要设置的值
 * @param strategy - 合并策略
 * @returns 新的配置对象
 */
export function applyMergeStrategy(
  config: Record<string, unknown>,
  path: string,
  value: unknown,
  strategy: MergeStrategy,
): Record<string, unknown> {
  const keys = path.split(".");
  const result = structuredClone(config);

  // 导航到倒数第二层
  let current: any = result;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (current[key] === undefined || current[key] === null || typeof current[key] !== "object") {
      current[key] = {};
    }
    current = current[key];
  }

  const lastKey = keys[keys.length - 1];
  const existing = current[lastKey];

  switch (strategy) {
    case "fill-empty":
      // 只在目标路径无值时设置
      if (existing === undefined) {
        current[lastKey] = value;
      }
      break;

    case "deep-merge":
      // 递归合并对象，叶节点覆盖
      if (
        typeof existing === "object" &&
        existing !== null &&
        !Array.isArray(existing) &&
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value)
      ) {
        current[lastKey] = deepMerge(
          existing as Record<string, unknown>,
          value as Record<string, unknown>,
        );
      } else {
        current[lastKey] = value;
      }
      break;

    case "force-overwrite":
      // 无条件覆盖
      current[lastKey] = value;
      break;
  }

  return result;
}

// ============================================================
// 备份/恢复
// ============================================================

/**
 * 创建配置文件备份。
 * 备份存放在 configPath 同目录下的 .config-backups/ 子目录。
 *
 * @param configPath - 配置文件完整路径
 * @returns 备份文件路径
 */
export function createBackup(configPath: string): string {
  const backupDir = join(dirname(configPath), ".config-backups");
  mkdirSync(backupDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const version = getCurrentConfigVersionFromFile(configPath);
  const backupPath = join(backupDir, `config-v${version}-${timestamp}.json5`);

  copyFileSync(configPath, backupPath);
  return backupPath;
}

/**
 * 从备份恢复配置文件。
 */
export function restoreBackup(backupPath: string, configPath: string): void {
  copyFileSync(backupPath, configPath);
}

/**
 * 验证配置对象可以安全序列化（round-trip 检查）。
 */
export function validateConfigRoundTrip(config: Record<string, unknown>): boolean {
  try {
    const json = JSON.stringify(config);
    JSON.parse(json);
    return true;
  } catch {
    return false;
  }
}

// ============================================================
// Internal helpers
// ============================================================

function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const targetVal = result[key];
    const sourceVal = source[key];
    if (
      typeof targetVal === "object" &&
      targetVal !== null &&
      !Array.isArray(targetVal) &&
      typeof sourceVal === "object" &&
      sourceVal !== null &&
      !Array.isArray(sourceVal)
    ) {
      result[key] = deepMerge(
        targetVal as Record<string, unknown>,
        sourceVal as Record<string, unknown>,
      );
    } else {
      result[key] = sourceVal;
    }
  }
  return result;
}

function getCurrentConfigVersionFromFile(configPath: string): number {
  try {
    if (!existsSync(configPath)) return 0;
    const content = readFileSync(configPath, "utf-8");
    // 简单提取 configVersion（避免依赖 JSON5 解析器）
    const match = content.match(/"configVersion"\s*:\s*(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  } catch {
    return 0;
  }
}
