/**
 * Skills Batch Progress - Screen 3
 * Real-time download progress with task cards and mirror indicator.
 */

import { html, nothing, type TemplateResult } from "lit";
import type { SkillBatchItem, BatchProgress } from "../controllers/skills-batch.js";
import { formatBytes, formatSpeed } from "../controllers/skills-batch.js";

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
};

const STATUS_STYLES: Record<string, { color: string; icon: string; border: string }> = {
  done: {
    color: "var(--ok, #22c55e)",
    icon: "\u2713",
    border: "var(--ok-subtle, rgba(34,197,94,0.15))",
  },
  downloading: {
    color: "var(--accent, #6c8cff)",
    icon: "",
    border: "var(--accent-subtle, rgba(108,140,255,0.25))",
  },
  retrying: { color: "var(--warning, #f59e0b)", icon: "\u21BB", border: "rgba(245,158,11,0.25)" },
  verifying: {
    color: "var(--accent, #6c8cff)",
    icon: "",
    border: "var(--accent-subtle, rgba(108,140,255,0.15))",
  },
  queued: {
    color: "var(--muted, #9ca3af)",
    icon: "\u2026",
    border: "var(--border, rgba(0,0,0,0.06))",
  },
  failed: { color: "var(--danger, #ef4444)", icon: "\u2715", border: "rgba(239,68,68,0.2)" },
};

function renderTaskCard(skill: SkillBatchItem): TemplateResult {
  const st = STATUS_STYLES[skill.status] ?? STATUS_STYLES.queued;
  const isActive = skill.status === "downloading" || skill.status === "verifying";
  const isDone = skill.status === "done";
  const isFailed = skill.status === "failed";
  const isRetrying = skill.status === "retrying";

  const sizeInfo =
    skill.bytesTotal && skill.bytesTotal > 0
      ? `${formatBytes(skill.bytesDownloaded ?? 0)}/${formatBytes(skill.bytesTotal)}`
      : "";

  return html`
    <div style="padding:12px 16px;background:${isActive ? "var(--accent-subtle, rgba(108,140,255,0.04))" : "var(--bg-accent, var(--secondary))"};border:1px solid ${st.border};border-radius:10px;margin-bottom:8px;transition:all 0.25s ease;${isDone ? "opacity:0.6;" : ""}">
      <div style="display:flex;align-items:center;gap:12px;">
        <!-- Status icon -->
        <div style="width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;${isDone ? `background:var(--ok-subtle, rgba(34,197,94,0.1));color:var(--ok, #22c55e);` : isFailed ? `background:rgba(239,68,68,0.1);color:var(--danger, #ef4444);` : isRetrying ? `color:var(--warning, #f59e0b);` : isActive ? `color:var(--accent, #6c8cff);` : `color:var(--muted, #9ca3af);`}">
          ${
            isActive
              ? html`
                  <span
                    style="
                      display: inline-block;
                      width: 16px;
                      height: 16px;
                      border: 2px solid var(--accent, #6c8cff);
                      border-top-color: transparent;
                      border-radius: 50%;
                      animation: batchSpin 0.8s linear infinite;
                    "
                  ></span>
                `
              : html`${st.icon}`
          }
        </div>
        <!-- Skill name -->
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:8px;">
            ${skill.icon ? html`<span style="font-size:15px;">${skill.icon}</span>` : nothing}
            <span style="font-size:15px;font-weight:600;color:${isDone ? "var(--muted, #9ca3af)" : isFailed ? "var(--danger, #ef4444)" : "var(--text-strong, var(--text))"};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${SKILL_FRIENDLY_NAMES[skill.name] || skill.name}</span>
            ${SKILL_FRIENDLY_NAMES[skill.name] ? html`<span style="font-size:12px;color:var(--muted);margin-left:4px;">${skill.name}</span>` : nothing}
          </div>
        </div>
        <!-- Right info -->
        <div style="font-size:12px;color:var(--muted);font-family:monospace;flex-shrink:0;text-align:right;">
          ${isDone && skill.bytesTotal ? html`${formatBytes(skill.bytesTotal)}` : nothing}
          ${isActive && sizeInfo ? html`${sizeInfo}` : nothing}
          ${isRetrying && skill.retryMirror ? html`<span style="color:var(--warning, #f59e0b);">切换 ${skill.retryMirror}</span>` : nothing}
          ${isFailed && skill.error ? html`<span style="color:var(--danger, #ef4444);">${skill.error.slice(0, 30)}</span>` : nothing}
          ${
            skill.status === "queued"
              ? html`
                  等待中...
                `
              : nothing
          }
        </div>
      </div>
      <!-- Mini progress bar for active items -->
      ${
        isActive && typeof skill.progress === "number"
          ? html`
        <div style="margin-top:8px;height:3px;background:var(--border, rgba(0,0,0,0.06));border-radius:2px;overflow:hidden;">
          <div style="height:100%;width:${Math.min(skill.progress, 100)}%;background:linear-gradient(90deg,var(--accent, #6c8cff),var(--accent-hover, #5a7aee));border-radius:2px;transition:width 0.3s ease;"></div>
        </div>
      `
          : nothing
      }
    </div>
  `;
}

export function renderSkillsBatchProgress(props: {
  skills: SkillBatchItem[];
  progress: BatchProgress;
  onCancel: () => void;
  onMinimize: () => void;
}): TemplateResult {
  const { progress } = props;
  const pct = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;
  const bytesInfo =
    progress.bytesTotal > 0
      ? `${formatBytes(progress.bytesDownloaded)}/${formatBytes(progress.bytesTotal)}`
      : "";

  return html`
    <div style="position:fixed;inset:0;z-index:9000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.35);backdrop-filter:blur(6px);">
      <div style="width:92%;max-width:680px;max-height:85vh;background:var(--card);border:1px solid var(--border);border-radius:18px;overflow:hidden;display:flex;flex-direction:column;animation:batchModalIn 0.3s ease;">
        <!-- Header -->
        <div style="padding:32px 32px 0;flex-shrink:0;text-align:center;">
          <div style="font-size:24px;font-weight:700;color:var(--text-strong, var(--text));margin-bottom:6px;">
            &#x2B07;\uFE0F 正在为您配置 AI 技能...
          </div>
          <div style="font-size:15px;color:var(--muted);">SkillHub 镜像通道 \u00B7 多线程下载中</div>
        </div>

        <!-- Overall progress bar -->
        <div style="padding:24px 32px 0;flex-shrink:0;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
            <span style="font-size:28px;font-weight:700;color:var(--accent, #6c8cff);font-family:monospace;">${pct}%</span>
          </div>
          <div style="height:8px;background:var(--border, rgba(0,0,0,0.06));border-radius:4px;overflow:hidden;position:relative;">
            <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,var(--accent, #6c8cff),var(--accent-hover, #5a7aee));border-radius:4px;transition:width 0.3s ease;position:relative;">
              <div style="position:absolute;right:0;top:0;bottom:0;width:40px;background:linear-gradient(90deg,transparent,rgba(255,255,255,0.3));animation:batchShimmer 1.5s infinite;border-radius:4px;"></div>
            </div>
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-top:10px;font-size:14px;color:var(--muted);font-family:monospace;">
            <span>${progress.completed}/${progress.total}</span>
            ${bytesInfo ? html`<span>${bytesInfo}</span>` : nothing}
            ${progress.speedBps > 0 ? html`<span style="color:var(--ok, #22c55e);">\u2193 ${formatSpeed(progress.speedBps)}</span>` : nothing}
          </div>
        </div>

        <!-- Mirror indicator -->
        ${
          progress.activeMirror
            ? html`
          <div style="padding:12px 32px 0;flex-shrink:0;">
            <div style="display:inline-flex;align-items:center;gap:8px;font-size:13px;color:var(--muted);">
              <span style="width:7px;height:7px;border-radius:50%;background:var(--ok, #22c55e);display:inline-block;animation:batchPulse 2s infinite;"></span>
              当前镜像源: ${progress.activeMirror}
              ${progress.activeMirrorLatency ? html`<span style="color:var(--muted);">\u00B7 ${progress.activeMirrorLatency}ms</span>` : nothing}
            </div>
          </div>
        `
            : nothing
        }

        <!-- Task list -->
        <div style="flex:1;overflow-y:auto;padding:18px 32px;min-height:0;">
          ${props.skills.map((s) => renderTaskCard(s))}
        </div>

        <!-- Footer -->
        <div style="padding:14px 32px 22px;flex-shrink:0;text-align:center;">
          <div style="font-size:13px;color:var(--muted);margin-bottom:12px;">下载过程中可以最小化，后台继续安装</div>
          <div style="display:flex;align-items:center;justify-content:center;gap:18px;">
            <button @click=${props.onMinimize}
              style="display:inline-flex;align-items:center;gap:5px;padding:8px 20px;background:var(--accent-subtle, rgba(108,140,255,0.08));border:1px solid var(--accent-muted, rgba(108,140,255,0.15));border-radius:8px;color:var(--accent, #6c8cff);font-size:14px;font-weight:500;cursor:pointer;">
              \u2B07 最小化
            </button>
            <button @click=${props.onCancel} style="background:none;border:none;color:var(--muted);font-size:14px;cursor:pointer;">取消安装</button>
          </div>
        </div>
      </div>
    </div>
    <style>
      @keyframes batchSpin { to { transform: rotate(360deg); } }
      @keyframes batchShimmer { 0%,100% { opacity:0.3; } 50% { opacity:0.8; } }
      @keyframes batchPulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
      @keyframes batchModalIn { from { opacity:0;transform:scale(0.95) translateY(10px); } to { opacity:1;transform:scale(1) translateY(0); } }
    </style>
  `;
}
