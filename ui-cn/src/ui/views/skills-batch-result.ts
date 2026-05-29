/**
 * Skills Batch Result - Screen 4
 * Shows succeeded/failed breakdown with error details and report option.
 */

import { html, nothing, type TemplateResult } from "lit";
import type { FailedSkillItem } from "../controllers/skills-batch.js";
import { formatDuration } from "../controllers/skills-batch.js";

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

function renderSucceededPills(succeeded: string[], expanded: boolean): TemplateResult {
  const visible = expanded ? succeeded : succeeded.slice(0, 8);
  const hasMore = !expanded && succeeded.length > 8;
  return html`
    <div style="display:flex;flex-wrap:wrap;gap:8px;">
      ${visible.map(
        (name) => html`
          <span style="display:inline-flex;align-items:center;gap:5px;padding:6px 14px;background:var(--ok-subtle);border:1px solid rgba(52,211,153,0.15);border-radius:100px;font-size:13px;color:var(--ok);">${SKILL_FRIENDLY_NAMES[name] || name}</span>
        `,
      )}
      ${hasMore ? html`<span style="padding:6px 14px;background:var(--secondary);border-radius:100px;font-size:13px;color:var(--muted);">+${succeeded.length - 8} 更多</span>` : nothing}
    </div>
  `;
}

function renderFailedCard(item: FailedSkillItem): TemplateResult {
  const friendlyName = SKILL_FRIENDLY_NAMES[item.name];
  return html`
    <div style="background:var(--bg-accent, var(--secondary));border:1px solid var(--danger-muted, rgba(248,113,113,0.15));border-left:3px solid var(--danger);border-radius:10px;padding:14px 18px;margin-bottom:10px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <div style="display:flex;align-items:center;gap:8px;">
          ${item.icon ? html`<span style="font-size:16px;">${item.icon}</span>` : nothing}
          <span style="font-size:15px;font-weight:700;color:var(--text-strong, var(--text));">${friendlyName || item.name}</span>
          ${friendlyName ? html`<span style="font-size:12px;color:var(--muted);">${item.name}</span>` : nothing}
        </div>
        <span style="padding:3px 10px;background:var(--danger-subtle);border-radius:100px;font-size:11px;color:var(--danger);">${item.mirrorsTried.length > 0 ? `${item.mirrorsTried.length}\u6E90\u5747\u5931\u8D25` : "\u5931\u8D25"}</span>
      </div>
      <div style="font-size:13px;color:var(--muted);font-family:monospace;margin-bottom:8px;">${item.error}</div>
      ${
        item.mirrorsTried.length > 0
          ? html`
        <div style="display:flex;flex-wrap:wrap;gap:4px;">
          ${item.mirrorsTried.map(
            (m) =>
              html`<span style="padding:2px 6px;background:var(--secondary);border-radius:4px;font-size:10px;color:var(--muted);text-decoration:line-through;">${m.name} \u2715</span>`,
          )}
        </div>
      `
          : nothing
      }
    </div>
  `;
}

export function renderSkillsBatchResult(props: {
  succeeded: string[];
  failed: FailedSkillItem[];
  durationMs: number;
  totalCount: number;
  onContinue: () => void;
  onRetryFailed: () => void;
  onReport: () => void;
  reportSent: boolean;
}): TemplateResult {
  const allFailed = props.succeeded.length === 0;
  const title = allFailed ? "\u26A0\uFE0F 部分技能需要重试" : "\u26A0\uFE0F 配置基本完成";
  const subtitle = allFailed
    ? "所有技能安装失败，请检查网络后重试"
    : "大部分技能已配置成功，少数需处理";

  return html`
    <div style="position:fixed;inset:0;z-index:9000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.7);backdrop-filter:blur(6px);">
      <div style="width:92%;max-width:680px;max-height:85vh;background:var(--card);border:1px solid var(--border);border-radius:18px;overflow:hidden;display:flex;flex-direction:column;animation:batchResultIn 0.4s ease;">
        <!-- Header -->
        <div style="padding:32px 32px 0;flex-shrink:0;text-align:center;">
          <div style="font-size:24px;font-weight:700;color:var(--text-strong, var(--text));margin-bottom:6px;">${title}</div>
          <div style="font-size:15px;color:var(--muted);">${subtitle}</div>
        </div>

        <!-- Stats -->
        <div style="display:flex;gap:10px;padding:20px 32px 0;flex-shrink:0;justify-content:center;">
          <div style="background:var(--bg-accent, var(--secondary));border:1px solid var(--border);border-radius:10px;padding:16px 28px;text-align:center;flex:1;">
            <div style="font-size:26px;font-weight:700;color:var(--ok);font-family:monospace;">${props.succeeded.length}</div>
            <div style="font-size:12px;color:var(--muted);margin-top:3px;">安装成功</div>
          </div>
          <div style="background:var(--bg-accent, var(--secondary));border:1px solid var(--border);border-radius:10px;padding:16px 28px;text-align:center;flex:1;">
            <div style="font-size:26px;font-weight:700;color:var(--danger);font-family:monospace;">${props.failed.length}</div>
            <div style="font-size:12px;color:var(--muted);margin-top:3px;">安装失败</div>
          </div>
          <div style="background:var(--bg-accent, var(--secondary));border:1px solid var(--border);border-radius:10px;padding:16px 28px;text-align:center;flex:1;">
            <div style="font-size:26px;font-weight:700;color:var(--text-strong, var(--text));font-family:monospace;">${formatDuration(props.durationMs)}</div>
            <div style="font-size:12px;color:var(--muted);margin-top:3px;">总耗时</div>
          </div>
        </div>

        <!-- Scrollable content -->
        <div style="flex:1;overflow-y:auto;padding:20px 32px;min-height:0;">
          <!-- Succeeded -->
          ${
            props.succeeded.length > 0
              ? html`
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
              <span style="color:var(--ok);font-size:15px;font-weight:600;">\u2713 安装成功</span>
              <span style="font-size:14px;color:var(--muted);">${props.succeeded.length}</span>
            </div>
            ${renderSucceededPills(props.succeeded, false)}
          `
              : nothing
          }

          <!-- Failed -->
          ${
            props.failed.length > 0
              ? html`
            <div style="display:flex;align-items:center;gap:8px;margin:20px 0 12px;">
              <span style="color:var(--danger);font-size:15px;font-weight:600;">\u2715 安装失败</span>
              <span style="font-size:14px;color:var(--muted);">${props.failed.length}</span>
            </div>
            ${props.failed.map((f) => renderFailedCard(f))}
          `
              : nothing
          }

          <!-- Report section -->
          ${
            props.failed.length > 0
              ? html`
            <div style="background:var(--bg-accent, var(--secondary));border:1px solid rgba(255,171,0,0.15);border-left:3px solid #ffab00;border-radius:10px;padding:14px;margin-top:14px;">
              <div style="font-size:13px;font-weight:600;color:var(--text-strong, var(--text));margin-bottom:8px;">\u{1F4EE} 上报问题帮助改进</div>
              <div style="font-size:12px;color:var(--muted);margin-bottom:12px;">可按 SkillHub 安装指南配置国内镜像服务：https://skillhub.cn/install/skillhub.md</div>
              <div style="display:flex;gap:8px;">
                <button @click=${props.onReport} ?disabled=${props.reportSent}
                  style="padding:8px 16px;background:${props.reportSent ? "var(--ok-subtle)" : "rgba(255,171,0,0.1)"};border:1px solid ${props.reportSent ? "rgba(52,211,153,0.2)" : "rgba(255,171,0,0.2)"};border-radius:8px;color:${props.reportSent ? "var(--ok)" : "#ffab00"};font-size:12px;cursor:${props.reportSent ? "default" : "pointer"};font-weight:600;">
                  ${props.reportSent ? "\u2713 已上报" : "\u{1F4EE} 一键上报"}
                </button>
                <button @click=${props.onRetryFailed}
                  style="padding:8px 16px;background:transparent;border:1px solid var(--border);border-radius:8px;color:var(--muted);font-size:12px;cursor:pointer;">
                  \u21BB 重试失败项
                </button>
              </div>
            </div>
          `
              : nothing
          }
        </div>

        <!-- Footer -->
        <div style="padding:18px 32px 24px;flex-shrink:0;">
          <button @click=${props.onContinue}
            style="width:100%;padding:15px;background:var(--accent);border:none;border-radius:10px;color:var(--accent-foreground, #fff);font-size:16px;font-weight:700;cursor:pointer;box-shadow:0 2px 12px var(--accent-subtle, rgba(108,140,255,0.25));">
            继续使用 66Claw（已配置 ${props.succeeded.length} 个技能）\u2192
          </button>
          <div style="text-align:center;margin-top:10px;font-size:13px;color:var(--muted);">失败的技能可在「技能管理」中重新安装，或稍后自动重试</div>
        </div>
      </div>
    </div>
    <style>
      @keyframes batchResultIn { from { opacity:0;transform:translateY(15px); } to { opacity:1;transform:translateY(0); } }
    </style>
  `;
}
