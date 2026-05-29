/**
 * Skills Batch Banner - Screen 1
 * Centered welcome card shown on the chat page when skills are missing.
 */

import { html, nothing, type TemplateResult } from "lit";
import { brand } from "../brand";
import type { BatchCheckResult } from "../controllers/skills-batch.js";
import { formatBytes, formatEstimate } from "../controllers/skills-batch.js";
import { t } from "../i18n/index.js";

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

export function renderSkillsBatchBanner(props: {
  missingSkills: BatchCheckResult["missing"];
  totalSizeBytes: number;
  estimatedSeconds: number;
  onInstall: () => void;
  onDismiss: () => void;
  onClose: () => void;
}): TemplateResult {
  const count = props.missingSkills.length;
  if (count === 0) return html`${nothing}`;

  const sizeLabel = formatBytes(props.totalSizeBytes);
  const timeLabel = formatEstimate(props.estimatedSeconds);

  return html`
    <div class="batch-banner">
      <!-- Top accent line -->
      <div class="batch-banner__accent"></div>
      <!-- Close -->
      <button @click=${props.onClose} class="batch-banner__close" title="${t("common.close")}">&#x2715;</button>

      <!-- Icon -->
      <div class="batch-banner__icon">&#x26A1;</div>

      <!-- Title -->
      <div class="batch-banner__title">${t("batch.banner.title", { count })}</div>
      <div class="batch-banner__subtitle">${t("batch.banner.subtitle")}</div>

      <!-- Mirror badge -->
      ${
        brand.batchMirrorBadge
          ? html`
      <div class="batch-banner__mirror">
        <span class="batch-banner__mirror-dot"></span>
        ${brand.batchMirrorBadge}
      </div>
      `
          : nothing
      }

      <!-- Stats -->
      <div class="batch-banner__stats">
        <div class="batch-banner__stat">
          <div class="batch-banner__stat-value batch-banner__stat-value--accent">${count}</div>
          <div class="batch-banner__stat-label">${t("batch.banner.statSkills")}</div>
        </div>
        <div class="batch-banner__stat-divider"></div>
        <div class="batch-banner__stat">
          <div class="batch-banner__stat-value">${sizeLabel}</div>
          <div class="batch-banner__stat-label">${t("batch.banner.statSize")}</div>
        </div>
        <div class="batch-banner__stat-divider"></div>
        <div class="batch-banner__stat">
          <div class="batch-banner__stat-value">${timeLabel}</div>
          <div class="batch-banner__stat-label">${t("batch.banner.statTime")}</div>
        </div>
      </div>

      <!-- Skill pills -->
      <div class="batch-banner__pills">
        ${props.missingSkills.slice(0, 10).map(
          (skill) => html`
            <span class="batch-banner__pill">
              ${skill.icon ? html`<span class="batch-banner__pill-icon">${skill.icon}</span>` : nothing}
              ${SKILL_FRIENDLY_NAMES[skill.name] || skill.name}
            </span>
          `,
        )}
        ${
          count > 10
            ? html`<span class="batch-banner__pill batch-banner__pill--more">${t("batch.banner.more", { count: count - 10 })}</span>`
            : nothing
        }
      </div>

      <!-- Actions -->
      <button @click=${props.onInstall} class="batch-banner__install-btn">
        <span>&#x26A1;</span> ${t("batch.banner.installBtn")}
      </button>

      <!-- Footer -->
      <div class="batch-banner__footer">${t("batch.banner.footer")}</div>
    </div>
    <style>
      .batch-banner {
        position: relative;
        max-width: 680px;
        margin: 32px auto 16px;
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: var(--radius-xl, 16px);
        padding: 40px 36px 32px;
        text-align: center;
        overflow: hidden;
        animation: batchBannerIn 0.4s var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1));
        box-shadow: var(--shadow-lg, 0 12px 28px rgba(0,0,0,0.2));
      }
      .batch-banner__accent {
        position: absolute;
        top: 0; left: 0; right: 0;
        height: 3px;
        background: linear-gradient(90deg, var(--accent) 0%, transparent 80%);
      }
      .batch-banner__close {
        position: absolute;
        top: 12px; right: 12px;
        background: none;
        border: none;
        cursor: pointer;
        color: var(--muted);
        font-size: 16px;
        line-height: 1;
        padding: 4px 6px;
        border-radius: var(--radius-sm, 6px);
        opacity: 0.5;
        transition: opacity var(--duration-fast, 120ms);
      }
      .batch-banner__close:hover { opacity: 1; }
      .batch-banner__icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 64px; height: 64px;
        border-radius: var(--radius-lg, 12px);
        background: var(--accent-subtle);
        color: var(--accent);
        font-size: 30px;
        margin-bottom: 18px;
      }
      .batch-banner__title {
        font-size: 24px;
        font-weight: 700;
        color: var(--text-strong, var(--text));
        line-height: 1.3;
        margin-bottom: 8px;
      }
      .batch-banner__subtitle {
        font-size: 15px;
        color: var(--muted);
        margin-bottom: 18px;
      }
      .batch-banner__mirror {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 5px 14px;
        background: var(--ok-subtle);
        border: 1px solid rgba(52, 211, 153, 0.2);
        border-radius: var(--radius-full, 9999px);
        font-size: 13px;
        color: var(--ok);
        font-weight: 500;
        margin-bottom: 18px;
      }
      .batch-banner__mirror-dot {
        width: 6px; height: 6px;
        border-radius: 50%;
        background: var(--ok);
        display: inline-block;
      }
      .batch-banner__stats {
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--bg-accent, var(--secondary));
        border-radius: var(--radius-lg, 12px);
        border: 1px solid var(--border);
        padding: 12px 0;
        margin-bottom: 16px;
      }
      .batch-banner__stat {
        flex: 1;
        text-align: center;
        padding: 0 12px;
      }
      .batch-banner__stat-divider {
        width: 1px;
        height: 28px;
        background: var(--border);
        flex-shrink: 0;
      }
      .batch-banner__stat-value {
        font-size: 22px;
        font-weight: 700;
        color: var(--text);
        font-family: var(--mono);
        line-height: 1.2;
      }
      .batch-banner__stat-value--accent {
        color: var(--accent);
      }
      .batch-banner__stat-label {
        font-size: 13px;
        color: var(--muted);
        margin-top: 4px;
      }
      .batch-banner__pills {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 6px;
        margin-bottom: 20px;
      }
      .batch-banner__pill {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 5px 14px;
        background: var(--secondary, rgba(255,255,255,0.04));
        border-radius: var(--radius-full, 9999px);
        font-size: 13px;
        color: var(--muted);
        border: 1px solid var(--border);
      }
      .batch-banner__pill--more {
        color: var(--muted-strong, var(--muted));
      }
      .batch-banner__pill-icon {
        font-size: 14px;
      }
      .batch-banner__install-btn {
        width: 100%;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 14px 24px;
        background: var(--accent);
        border: none;
        border-radius: var(--radius-lg, 12px);
        color: var(--accent-foreground, #fff);
        font-size: 16px;
        font-weight: 600;
        cursor: pointer;
        box-shadow: 0 2px 12px var(--accent-subtle, rgba(108,140,255,0.25));
        transition: transform var(--duration-fast, 120ms), box-shadow var(--duration-fast, 120ms);
      }
      .batch-banner__install-btn:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 16px var(--accent-subtle, rgba(108,140,255,0.35));
      }
      .batch-banner__install-btn:active {
        transform: translateY(0);
      }
      .batch-banner__footer {
        margin-top: 14px;
        font-size: 11px;
        color: var(--muted);
        opacity: 0.7;
      }
      @keyframes batchBannerIn {
        from { opacity: 0; transform: translateY(-12px) scale(0.96); }
        to   { opacity: 1; transform: translateY(0) scale(1); }
      }
    </style>
  `;
}
