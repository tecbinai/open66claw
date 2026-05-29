/**
 * Skills Batch Confirm - Screen 2
 * Tier-based selection: core (locked) / recommended (default on) / optional (collapsed, off).
 */

import { html, nothing, type TemplateResult } from "lit";
import { brand } from "../brand";
import type { BatchCheckResult } from "../controllers/skills-batch.js";
import { formatBytes, formatEstimate } from "../controllers/skills-batch.js";
import { t } from "../i18n/index.js";

type MissingSkill = BatchCheckResult["missing"][number];
type InstalledSkill = NonNullable<BatchCheckResult["installed"]>[number];

function getTierMeta(): Record<
  string,
  { label: string; badge: string; badgeBg: string; badgeColor: string }
> {
  return {
    core: {
      label: t("batch.confirm.tierCore"),
      badge: t("batch.confirm.badgeCore"),
      badgeBg: "var(--ok-subtle)",
      badgeColor: "var(--ok)",
    },
    recommended: {
      label: t("batch.confirm.tierRecommended"),
      badge: t("batch.confirm.badgeRecommended"),
      badgeBg: "var(--accent-subtle)",
      badgeColor: "var(--accent)",
    },
    optional: {
      label: t("batch.confirm.tierOptional"),
      badge: t("batch.confirm.badgeOptional"),
      badgeBg: "var(--secondary)",
      badgeColor: "var(--muted)",
    },
  };
}

const SKILL_FRIENDLY_NAMES: Record<string, string> = {
  // Core & recommended
  weather: "天气查询",
  summarize: "网页摘要",
  github: "GitHub 操作",
  oracle: "多模型对比",
  gog: "搜索引擎",
  sag: "搜索聚合",
  himalaya: "邮件管理",
  "1password": "密码管理",
  camsnap: "摄像头截图",
  "nano-pdf": "PDF 阅读",
  "openai-whisper": "语音转文字",
  "openai-image-gen": "AI 绘图",
  canvas: "画布工具",
  songsee: "音乐识别",
  openhue: "智能灯光",
  goplaces: "附近搜索",
  "coding-agent": "编程助手",
  gemini: "Gemini AI",
  obsidian: "笔记管理",
  "video-frames": "视频处理",
  "nano-banana-pro": "AI 模型调用",
  bird: "Twitter 管理",
  gifgrep: "GIF 搜索",
  "local-places": "本地搜索",
  mcporter: "MCP 工具",
  "apple-notes": "Apple 备忘录",
  "apple-reminders": "Apple 提醒事项",
  slack: "Slack 消息",
  trello: "Trello 看板",
  "bear-notes": "Bear 笔记",
  "sherpa-onnx-tts": "语音合成",
  "voice-call": "语音通话",
  bluebubbles: "iMessage 消息",
  blucli: "蓝牙管理",
  blogwatcher: "博客监控",
  "model-usage": "模型用量",
  "skill-creator": "功能创建器",
  "spotify-player": "Spotify 播放",
  "things-mac": "Things 待办",
  // CN search & AI
  "baidu-search": "百度搜索",
  "baidu-scholar-search": "百度学术",
  "bocha-skill": "博查搜索",
  "zhipu-web-search": "智谱搜索",
  "aliyun-search": "阿里云搜索",
  "kimi-integration": "Kimi AI",
  "ollama-local": "Ollama 本地模型",
  clscli: "CLS 命令行",
  // CN TTS & STT
  "doubao-open-tts": "豆包语音合成",
  "doubao-api-open-tts": "豆包语音合成",
  "qwen-tts": "通义语音合成",
  "aliyun-tts": "阿里云语音",
  "kokoro-tts": "Kokoro 语音",
  "piper-tts": "Piper 语音",
  "chichi-speech": "吱吱语音",
  "mac-tts": "Mac 语音",
  "sapi-tts": "SAPI 语音",
  "mlx-audio-server": "MLX 音频服务",
  "faster-whisper": "Whisper 语音识别",
  "local-whisper": "本地 Whisper",
  "mlx-whisper": "MLX Whisper",
  "mlx-stt": "MLX 语音转文字",
  "parakeet-mlx": "Parakeet 语音",
  "parakeet-stt": "Parakeet 识别",
  "local-stt": "本地语音识别",
  "openai-whisper-api": "Whisper API",
  "edge-tts": "Edge 语音合成",
  // CN image & media
  "seedream-image-gen": "SEEDREAM 绘图",
  "qwen-image": "通义绘图",
  "qwen-image-plus-sophnet": "通义绘图增强",
  "amap-traffic": "高德路况",
  "conversation-summary-api": "对话摘要",
  // Social & messaging
  discord: "Discord 消息",
  wechat: "微信",
  wecom: "企业微信",
  zhihu: "知乎",
  "xiaohongshu-mcp": "小红书",
  channel: "频道管理",
  weread: "微信读书",
  imsg: "iMessage 消息",
  // Feishu / Lark
  "feishu-api-docs": "飞书文档 API",
  "feishu-attendance": "飞书考勤",
  "feishu-doc": "飞书文档",
  "feishu-doc-reader": "飞书文档阅读",
  "feishu-file-fetch": "飞书文件获取",
  "feishu-interactive-cards": "飞书卡片",
  "feishu-leave-request": "飞书请假",
  "feishu-messaging": "飞书消息",
  "feishu-native-emoji": "飞书表情",
  "feishu-sticker": "飞书贴纸",
  "lark-calendar": "飞书日历",
  "lark-integration": "飞书集成",
  "larksuite-wiki": "飞书知识库",
  // Productivity
  "apple-contacts": "Apple 通讯录",
  "apple-calendar": "Apple 日历",
  "apple-mail": "Apple 邮件",
  "apple-mail-search": "Apple 邮件搜索",
  "apple-photos": "Apple 照片",
  "apple-music": "Apple 音乐",
  notion: "Notion 笔记",
  pdf: "PDF 工具",
  "pdf-2": "PDF 工具",
  "mineru-pdf-parser-clawdbot-skill": "MinerU PDF 解析",
  // Media & smart home
  "ffmpeg-cli": "FFmpeg 工具",
  "ffmpeg-master": "FFmpeg 高级",
  "ffmpeg-video-editor": "FFmpeg 视频编辑",
  "image-resize": "图片缩放",
  clonev: "CloneV 工具",
  sonoscli: "Sonos 音响",
  switchbot: "SwitchBot 智能家居",
  mijia: "米家智能家居",
  nanoleaf: "Nanoleaf 灯光",
  "govee-lights": "Govee 灯光",
  wled: "WLED 灯光",
  "dirigera-control": "宜家智能家居",
  homeassistant: "Home Assistant",
  "home-assistant": "Home Assistant",
  chromecast: "投屏工具",
  // Dev tools
  "git-essentials": "Git 基础",
  "git-helper": "Git 助手",
  "git-workflows": "Git 工作流",
  tmux: "Tmux 终端",
  "session-logs": "会话日志",
  ripgrep: "Ripgrep 搜索",
  "fd-find": "Fd 文件搜索",
  "bat-cat": "Bat 文件查看",
  jq: "JSON 处理",
  "docker-ctl": "Docker 控制",
  "docker-essentials": "Docker 基础",
  kubectl: "Kubernetes 管理",
  kubernetes: "Kubernetes 集群",
  "markdown-converter": "Markdown 转换",
  "markdown-formatter": "Markdown 格式化",
  // System & utilities
  "open-app": "打开应用",
  "desktop-control": "桌面控制",
  peekaboo: "屏幕截图",
  "system-info": "系统信息",
  "system-monitor": "系统监控",
  "network-scanner": "网络扫描",
  "dns-lookup": "DNS 查询",
  "file-organizer": "文件整理",
  "file-search": "文件搜索",
  wacli: "WhatsApp 管理",
  eightctl: "8x8 管理",
  "food-order": "美食点餐",
  ordercli: "订单管理",
  weathercli: "天气命令行",
  // Clawdbot ecosystem
  clawdhub: "技能市场",
  clawflows: "自动化流程",
  "comfy-cli": "ComfyUI 工具",
  // Finance & other
  "china-market-gateway": "中国市场数据",
  "ai-ppt-generate": "AI PPT 生成",
  "local-rag-search": "本地 RAG 搜索",
  packaging: "打包工具",
  "build-packaging": "构建打包",
  "skills-troubleshoot": "技能诊断",
  "self-troubleshoot": "自我排障",
  "software-protection": "软件保护",
  // Additional optional skills
  roku: "Roku 遥控",
  salesforce: "Salesforce CRM",
  slopesniper: "Solana 交易",
  sog: "SOG 邮件工具",
  taskleef: "任务看板",
  treeline: "Treeline 财务",
  trein: "荷兰铁路查询",
  vibetunnel: "VibeTunnel 终端",
  ynab: "YNAB 预算",
  confluence: "Confluence 文档",
  "linear-app": "Linear 项目管理",
  todoist: "Todoist 待办",
  airtable: "Airtable 数据表",
  asana: "Asana 项目管理",
  jira: "Jira 工单",
  "google-calendar": "Google 日历",
  "google-drive": "Google 云盘",
  "google-maps": "Google 地图",
  telegram: "Telegram 消息",
  "x-twitter": "X/Twitter 社交",
  reddit: "Reddit 论坛",
  hackernews: "Hacker News",
  "stock-market": "股票行情",
  coinmarketcap: "加密货币行情",
  "aws-cli": "AWS 命令行",
  "azure-cli": "Azure 命令行",
  "gcloud-cli": "GCloud 命令行",
  vercel: "Vercel 部署",
  netlify: "Netlify 部署",
  supabase: "Supabase 数据库",
  firebase: "Firebase 服务",
  stripe: "Stripe 支付",
  twilio: "Twilio 通信",
  sendgrid: "SendGrid 邮件",
  "youtube-dl": "YouTube 下载",
  "bilibili-dl": "B站下载",
  "screen-recorder": "录屏工具",
  "qr-code": "二维码工具",
  translator: "翻译工具",
  "text-to-image": "文字转图片",
  "image-to-text": "图片转文字",
  ocr: "OCR 识别",
  calculator: "计算器",
  "unit-converter": "单位换算",
  timer: "计时器",
  pomodoro: "番茄钟",
  "password-gen": "密码生成器",
  "lorem-ipsum": "占位文本生成",
};

function groupByTier(skills: MissingSkill[]): Map<string, MissingSkill[]> {
  const order: string[] = ["core", "recommended", "optional"];
  const g = new Map<string, MissingSkill[]>();
  for (const tier of order) g.set(tier, []);
  for (const s of skills) {
    const tier = s.tier ?? "optional";
    const list = g.get(tier) ?? [];
    list.push(s);
    g.set(tier, list);
  }
  // Remove empty tiers
  for (const tier of order) {
    if (g.get(tier)!.length === 0) g.delete(tier);
  }
  return g;
}

function groupInstalledByTier(skills: InstalledSkill[]): Map<string, InstalledSkill[]> {
  const g = new Map<string, InstalledSkill[]>();
  for (const s of skills) {
    const tier = s.tier ?? "optional";
    const list = g.get(tier) ?? [];
    list.push(s);
    g.set(tier, list);
  }
  return g;
}

function getDisplayName(skill: MissingSkill | InstalledSkill): string {
  return (
    SKILL_FRIENDLY_NAMES[skill.name] ||
    ("description" in skill ? skill.description : "") ||
    skill.name
  );
}

function renderStatCell(icon: string, value: string, label: string, color: string): TemplateResult {
  return html`
    <div style="background:var(--bg-accent, var(--secondary));padding:12px 10px;text-align:center;">
      <div style="font-size:13px;margin-bottom:3px;">${icon}</div>
      <div style="font-size:20px;font-weight:700;color:${color};font-family:var(--mono, monospace);line-height:1.2;">${value}</div>
      <div style="font-size:11px;color:var(--muted);margin-top:3px;">${label}</div>
    </div>
  `;
}

function renderSkillRow(skill: MissingSkill, tier: string): TemplateResult {
  const isCore = tier === "core";
  const isChecked = tier !== "optional";
  const displayName = getDisplayName(skill);
  const showTechName = displayName !== skill.name;

  return html`
    <label style="display:flex;align-items:center;gap:12px;padding:10px 0;cursor:${isCore ? "default" : "pointer"};">
      <input type="checkbox" name="batch-skill" value="${skill.name}"
        ?checked=${isChecked} ?disabled=${isCore}
        style="width:18px;height:18px;accent-color:var(--accent);flex-shrink:0;cursor:${isCore ? "default" : "pointer"};" />
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:center;gap:8px;">
          ${skill.icon ? html`<span style="font-size:15px;">${skill.icon}</span>` : nothing}
          <span style="font-size:15px;font-weight:500;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${displayName}</span>
          ${showTechName ? html`<span style="font-size:12px;color:var(--muted-strong, var(--muted));">${skill.name}</span>` : nothing}
        </div>
      </div>
      <span style="font-size:12px;color:var(--muted-strong, var(--muted));font-family:var(--mono, monospace);flex-shrink:0;">${formatBytes(skill.size_bytes)}</span>
    </label>
  `;
}

function renderInstalledSkillRow(skill: InstalledSkill): TemplateResult {
  const displayName = getDisplayName(skill);
  return html`
    <div style="display:flex;align-items:center;gap:10px;padding:6px 0;opacity:0.5;">
      <span style="width:16px;height:16px;display:flex;align-items:center;justify-content:center;color:var(--ok);font-size:12px;flex-shrink:0;">&#x2713;</span>
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:center;gap:6px;">
          ${skill.icon ? html`<span style="font-size:13px;">${skill.icon}</span>` : nothing}
          <span style="font-size:13px;font-weight:500;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${displayName}</span>
        </div>
      </div>
      <span style="font-size:10px;color:var(--muted);background:var(--secondary);padding:2px 8px;border-radius:var(--radius-full, 9999px);">${t("batch.confirm.alreadyInstalled")}</span>
    </div>
  `;
}

function renderTierSection(
  tier: string,
  skills: MissingSkill[],
  installedInTier: InstalledSkill[],
): TemplateResult {
  const tierMeta = getTierMeta();
  const meta = tierMeta[tier] ?? tierMeta.optional;
  const isOptional = tier === "optional";
  const totalCount = skills.length + installedInTier.length;

  const header = html`
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;margin-top:14px;">
      <span style="font-size:13px;font-weight:600;color:var(--text);">${meta.label}</span>
      <span style="padding:2px 8px;background:${meta.badgeBg};border-radius:var(--radius-full, 9999px);font-size:10px;color:${meta.badgeColor};font-weight:600;">${meta.badge}</span>
      <span style="font-size:11px;color:var(--muted-strong, var(--muted));">${t("batch.confirm.itemCount", { count: totalCount })}</span>
    </div>
  `;

  const content = html`
    <div style="padding-left:2px;">
      ${installedInTier.map((s) => renderInstalledSkillRow(s))}
      ${skills.map((s) => renderSkillRow(s, tier))}
    </div>
  `;

  if (isOptional) {
    return html`
      <details style="margin-top:8px;">
        <summary style="display:flex;align-items:center;gap:8px;cursor:pointer;list-style:none;padding:6px 0;">
          ${header}
          <span class="batch-expand-hint" style="font-size:11px;color:var(--muted);margin-left:auto;"></span>
        </summary>
        ${content}
      </details>
    `;
  }

  return html`
    ${header}
    ${content}
  `;
}

export function renderSkillsBatchConfirm(props: {
  checkResult: BatchCheckResult;
  onConfirm: (selectedSkills: string[]) => void;
  onCancel: () => void;
}): TemplateResult {
  const { checkResult } = props;
  const count = checkResult.missing.length;
  const sizeLabel = formatBytes(checkResult.total_size_bytes);
  const timeLabel = formatEstimate(checkResult.estimated_seconds);
  const diskLabel = formatBytes(checkResult.disk_available_bytes);
  const diskOk = checkResult.disk_ok;
  const tierGroups = groupByTier(checkResult.missing);
  const installedGroups = groupInstalledByTier(checkResult.installed ?? []);

  const handleConfirm = (e: Event) => {
    const modal = (e.target as HTMLElement).closest("[data-batch-confirm]");
    if (!modal) return;
    const boxes = modal.querySelectorAll<HTMLInputElement>("input[name='batch-skill']:checked");
    const selected = Array.from(boxes).map((cb) => cb.value);
    if (selected.length > 0) props.onConfirm(selected);
  };

  // Collect all tiers (union of missing + installed)
  const allTiers = ["core", "recommended", "optional"].filter(
    (tier) => tierGroups.has(tier) || (installedGroups.get(tier)?.length ?? 0) > 0,
  );

  return html`
    <div data-batch-confirm style="position:fixed;inset:0;z-index:9000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.7);backdrop-filter:blur(6px);animation:batchOverlayIn 0.25s ease;">
      <div style="width:92%;max-width:640px;max-height:85vh;background:var(--card);border:1px solid var(--border);border-radius:18px;overflow:hidden;display:flex;flex-direction:column;animation:batchModalIn 0.35s cubic-bezier(0.34,1.3,0.64,1);">
        <!-- Header -->
        <div style="padding:32px 32px 0;flex-shrink:0;text-align:center;">
          <div style="display:inline-flex;align-items:center;justify-content:center;width:64px;height:64px;border-radius:16px;background:var(--accent-subtle);color:var(--accent);font-size:30px;margin-bottom:16px;">&#x26A1;</div>
          <div style="font-size:24px;font-weight:700;color:var(--text-strong, var(--text));margin-bottom:6px;">${t("batch.confirm.title")}</div>
          <div style="font-size:15px;color:var(--muted);">${t("batch.confirm.subtitle")}</div>
        </div>

        <!-- Stats 2x2 -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--border);margin:20px 32px 0;border-radius:var(--radius-lg, 12px);overflow:hidden;border:1px solid var(--border);flex-shrink:0;">
          ${renderStatCell("\u{1F4E6}", String(count), t("batch.confirm.statCount"), "var(--accent)")}
          ${renderStatCell("\u{1F4BE}", sizeLabel, t("batch.confirm.statSize"), "var(--text)")}
          ${renderStatCell("\u23F1\uFE0F", timeLabel, t("batch.confirm.statTime"), "var(--text)")}
          ${renderStatCell("\u{1F4BF}", diskLabel, t("batch.confirm.statDisk"), diskOk ? "var(--ok)" : "var(--danger)")}
        </div>

        <!-- Disk warning -->
        ${
          !diskOk
            ? html`
          <div style="margin:12px 24px 0;padding:10px 14px;background:var(--danger-subtle);border:1px solid var(--danger-muted, rgba(248,113,113,0.3));border-radius:var(--radius-md, 8px);display:flex;align-items:center;gap:8px;font-size:13px;color:var(--danger);">
            &#x26A0; ${t("batch.confirm.diskWarning")}
          </div>
        `
            : nothing
        }

        <!-- Mirror badge -->
        <div style="margin:16px 32px 0;display:flex;align-items:center;gap:8px;flex-shrink:0;">
          <span style="display:inline-flex;align-items:center;gap:5px;padding:5px 12px;background:var(--ok-subtle);border:1px solid rgba(52,211,153,0.2);border-radius:var(--radius-full, 9999px);font-size:13px;color:var(--ok);">
            <span style="width:7px;height:7px;border-radius:50%;background:var(--ok);display:inline-block;"></span>
            ${brand.batchMirrorBadge || t("batch.confirm.mirrorBadge")}
          </span>
          <span style="font-size:13px;color:var(--muted);">${t("batch.confirm.mirrorHint")}</span>
        </div>

        <!-- Scrollable tier-based skill list -->
        <div style="flex:1;overflow-y:auto;padding:10px 32px 18px;min-height:0;">
          ${allTiers.map((tier) =>
            renderTierSection(tier, tierGroups.get(tier) ?? [], installedGroups.get(tier) ?? []),
          )}
        </div>

        <!-- Buttons -->
        <div style="padding:18px 32px 24px;flex-shrink:0;">
          <button
            @click=${handleConfirm}
            ?disabled=${!diskOk}
            style="width:100%;padding:15px;background:${diskOk ? "var(--accent)" : "var(--secondary)"};border:none;border-radius:var(--radius-lg, 12px);color:${diskOk ? "var(--accent-foreground, #fff)" : "var(--muted)"};font-size:16px;font-weight:700;cursor:${diskOk ? "pointer" : "not-allowed"};box-shadow:${diskOk ? "0 2px 12px var(--accent-subtle, rgba(108,140,255,0.25))" : "none"};">
            ${t("batch.confirm.startBtn")}
          </button>
          <div style="text-align:center;margin-top:12px;">
            <button @click=${props.onCancel} style="background:none;border:none;color:var(--muted);font-size:14px;cursor:pointer;">${t("batch.confirm.cancelBtn")}</button>
          </div>
        </div>
      </div>
    </div>
    <style>
      @keyframes batchOverlayIn { from { opacity:0; } to { opacity:1; } }
      @keyframes batchModalIn { from { opacity:0;transform:scale(0.92) translateY(20px); } to { opacity:1;transform:scale(1) translateY(0); } }
      [data-batch-confirm] details summary::-webkit-details-marker { display: none; }
      [data-batch-confirm] details[open] .batch-expand-hint::after { content: "▲ 收起"; }
      [data-batch-confirm] details:not([open]) .batch-expand-hint::after { content: "▼ 展开"; }
    </style>
  `;
}
