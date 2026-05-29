import { html, nothing } from "lit";
import { clampText } from "../format";
import { t, tMaybe } from "../i18n/index.js";
import type { SkillStatusEntry, SkillStatusReport } from "../types";

export type PlaygroundCategory = {
  id: string;
  emoji: string;
  labelKey: string;
  descKey: string;
};

// ============================================================================
// 中国境内网络不可用的技能列表（依赖被 GFW 封锁的海外服务）
// 数据来源：src/config/region-cn.ts cnDeprioritizedSkills + skills-3000-overview.md §4
// ============================================================================
const CN_DEPRIORITIZED_SKILLS = new Set([
  // ── 依赖 Google API（被墙） ──
  "gemini",
  "nano-banana-pro",
  "gog",
  "goplaces",
  "local-places",
  "google-search",
  "google-calendar",
  "google-drive",
  "google-docs",
  "nest-devices",
  "research",
  // ── 依赖 OpenAI API（被墙） ──
  "oracle",
  "openai-image-gen",
  "openai-whisper-api",
  "summarize",
  "coding-agent",
  "openai-chat",
  "openai-tts",
  "gpt",
  "sora-video-gen",
  // ── 依赖海外社交平台 ──
  "slack",
  "discord",
  "wacli",
  "bluebubbles",
  "trello",
  "linear",
  "notion",
  "messenger",
  "pinterest",
  "signal-cli",
  // ── 依赖海外媒体/服务 ──
  "sag",
  "spotify-player",
  "spotify-applescript",
  "voice-call",
  "gifgrep",
  "food-order",
  "ordercli",
  "bird",
  "eightctl",
  "youtube-search",
  "youtube-summarizer",
  // ── 依赖海外金融/支付 ──
  "monarch-money",
  "plaid",
  "stripe",
  "paypal",
  "moonpay",
  "transak",
  // ── 其他海外专属 ──
  "comfy",
  "homekit",
  "substack-formatter",
  "typefully",
  "gmail-client",
  "gmail-manager",
]);

// ============================================================================
// 中国特色技能列表（国内服务优先排序加分）
// 数据来源：skills-3000-overview.md §4 CN 特色技能
// ============================================================================
const CN_NATIVE_SKILLS = new Set([
  // ── 国内搜索 ──
  "zhipu-web-search",
  "baidu-search",
  "baidu-scholar-search",
  "aliyun-search",
  // ── 国内社交 ──
  "wechat",
  "wecom",
  "zhihu",
  "xiaohongshu",
  "weread",
  // ── 国内智能家居 ──
  "mijia",
  "midea-ac",
  // ── 国内 AI ──
  "qwen-image",
  "qwen-tts",
  "minimax-tts",
  "seedream-image-gen",
  // ── 飞书/钉钉 ──
  "feishu-memory-recall",
  "dingtalk",
  // ── 本地离线工具（中国可用） ──
  "edge-tts",
  "sherpa-onnx-tts",
  "openai-whisper",
  "ollama-local",
  // ── 天工系列 ──
  "tiangong-notebooklm",
  "tiangong-ppt",
  "tiangong-word",
]);

// ============================================================================
// 分类关键词规则（按用户兴趣场景划分）
// 顺序 = 用户感兴趣度排序：财经 > 娱乐 > 工作 > 生活 > 创意 > 通讯 > 开发 > 系统
// ============================================================================
const SKILL_CATEGORY_RULES: Array<{ keywords: string[]; category: string }> = [
  // 💰 财经理财 — A股、炒股、记账、加密货币、预测市场 (~25+ skills)
  {
    keywords: [
      "stock",
      "finance",
      "budget",
      "accounting",
      "investment",
      "crypto",
      "banking",
      "hyperliquid",
      "trading",
      "sec-filing",
      "monarch",
      "a-stock",
      "coin",
      "wallet",
      "ledger",
      "portfolio",
      // 加密货币 (§7.11)
      "solana",
      "onchain",
      "okx",
      "moonpay",
      "transak",
      "ethereum",
      "blockchain",
      "defi",
      // 预测市场 (§7.11)
      "polymarket",
      "pm-odds",
      // 传统金融 (§7.11)
      "plaid",
      "stripe",
      "paypal",
    ],
    category: "finance",
  },
  // 🎮 娱乐休闲 — 音乐、游戏、视频、GIF、播客 (~45+ skills)
  {
    keywords: [
      "spotify",
      "songsee",
      "music",
      "game",
      "canvas",
      "gifgrep",
      "video-frames",
      "podcast",
      "media-player",
      "sonoscli",
      "entertainment",
      "fun",
      "play",
      "trivia",
      "quiz",
      // 音乐控制 (§7.9)
      "blucli",
      "roon-controller",
      // 游戏 (§7.18)
      "steam",
      "pokemon",
      "sudoku",
      "riddle",
      "magic-8-ball",
      "xkcd",
      "strands",
      "mtg-edh",
      "spacemolt",
      "moltbot-arena",
      // 多媒体 (§7.9)
      "media-converter",
      "sound-fx",
      "subtitles",
      "video-subtitles",
      "svg-draw",
      "vhs-recorder",
      "remotion",
    ],
    category: "entertainment",
  },
  // 💼 工作效率 — 笔记、邮件、日历、待办、密码管理 (~60+ skills)
  {
    keywords: [
      "1password",
      "obsidian",
      "apple-notes",
      "apple-reminders",
      "things-mac",
      "bear-notes",
      "himalaya",
      "calendar",
      "todo",
      "4todo",
      "task",
      "notion",
      "trello",
      "linear",
      "imap-email",
      "daily-recap",
      "session-logs",
      "meeting",
      "schedule",
      "agenda",
      "note",
      // 任务管理 (§7.8)
      "todoist",
      "omnifocus",
      "ticktick",
      "microsoft-todo",
      "taskmaster",
      "no-nonsense-tasks",
      // 笔记与知识库 (§7.8)
      "logseq",
      "workflowy",
      "obsidian-daily",
      // 邮件 (§7.7)
      "fastmail",
      "imap-smtp",
      "send-email",
      "email-send",
      "apple-mail",
      "mailgun",
      // 日历 (§7.8)
      "brainz-calendar",
      "email-to-calendar",
      "ms365",
      // 文档处理 (§7.8)
      "nano-pdf",
      "pdf",
      "md-2-pdf",
      "xlsx",
      "markdown-converter",
      // 微信读书 (CN)
      "weread",
    ],
    category: "work",
  },
  // 🌤️ 生活服务 — 天气、外卖、地图、智能家居、健康 (~50+ skills)
  {
    keywords: [
      "weather",
      "local-places",
      "food-order",
      "goplaces",
      "openhue",
      "ordercli",
      "plan2meal",
      "recipe",
      "fitness",
      "health",
      "smart-home",
      "homekit",
      "bambu",
      "sports-ticker",
      "flight",
      "pollen",
      // 智能家居 (§7.10)
      "homeassistant",
      "switchbot",
      "nanoleaf",
      "wled",
      "nest-devices",
      "samsung-smartthings",
      "tado",
      "sensibo",
      "midea-ac",
      "mijia",
      "mqtt-client",
      "unifi",
      "pihole",
      // 健康 (§7.15)
      "whoop",
      "oura",
      "strava",
      "withings",
      "workout",
      "weight-loss",
      "muscle-gain",
      "morning-routine",
      "night-routine",
      "mindfulness",
      "meditation",
      "sleep",
      "stress",
      "quit-smoking",
      "quit-vaping",
      "quit-alcohol",
      // 出行 (§7.15)
      "travel-concierge",
      "travel-manager",
      "surfline",
      "swiss-transport",
      "uk-trains",
      "ns-trains",
    ],
    category: "lifestyle",
  },
  // 🎨 创意设计 — AI 绘图、文案、TTS、翻译 (~50+ skills)
  {
    keywords: [
      "openai-image",
      "nano-banana",
      "comfyui",
      "image-gen",
      "summarize",
      "gemini",
      "oracle",
      "edge-tts",
      "sherpa-onnx",
      "openai-whisper",
      "pptx",
      "marketing",
      "elevenlabs",
      "tts",
      "translate",
      "draw",
      "design",
      // AI 图像 (§7.1)
      "nvidia-image-gen",
      "seedream",
      "qwen-image",
      "fal-ai",
      "falai",
      "pollinations",
      "ai-picture-book",
      // AI 语音 (§7.1)
      "piper-tts",
      "mac-tts",
      "sapi-tts",
      "minimax-tts",
      "qwen-tts",
      "mlx-stt",
      "mlx-whisper",
      "parakeet",
      "voice-transcribe",
      "transcribe",
      "transcribee",
      // 内容创作 (§7.16)
      "blogwatcher",
      "newsletter",
      "social-content",
      "social-post",
      "seo-audit",
      "seo-optimizer",
      "marketing-ideas",
      "marketing-mode",
      "podcast-generation",
      "tiangong",
      // 教育 (§7.17)
      "academic-deep-research",
      "overleaf",
      "study-habits",
      "readwise",
      "agentarxiv",
      "tldr",
      "tldw",
    ],
    category: "creative",
  },
  // 💬 通讯社交 — 微信、钉钉、飞书、Telegram、Discord (~50+ skills)
  {
    keywords: [
      "discord",
      "slack",
      "imsg",
      "wacli",
      "bluebubbles",
      "voice-call",
      "telegram",
      "wechat",
      "dingtalk",
      "feishu",
      "qqbot",
      "message",
      "chat",
      "sms",
      // 国内平台 (§4 CN 特色)
      "wecom",
      "zhihu",
      "xiaohongshu",
      // 海外社交 (§7.7)
      "bluesky",
      "reddit",
      "hackernews",
      "twitter",
      "mastodon",
      "linkedin",
      "pinchedin",
      "tiktok",
      // 邮件 (只放 Gmail 等社交性邮件)
      "gmail",
      // 聊天平台 (§7.7)
      "beeper",
      "signal",
      "messenger",
    ],
    category: "communication",
  },
  // 💻 开发工具 — GitHub、代码、调试、搜索引擎、Agent、数据库 (~200+ skills)
  {
    keywords: [
      "github",
      "coding",
      "tmux",
      "skill-creator",
      "skills-troubleshoot",
      "self-troubleshoot",
      "mcporter",
      "context7",
      "clawddocs",
      "git",
      "npm",
      "code",
      "debug",
      "lint",
      "docker",
      "deploy",
      "brave-search",
      "web-search",
      "search-x",
      "x-trends",
      "model-usage",
      "relay",
      // Git (§7.2)
      "gitlab",
      "gitea",
      "gitflow",
      "git-essentials",
      "git-summary",
      // API 开发 (§7.2)
      "api-dev",
      "test-patterns",
      "test-runner",
      "openapi",
      "openspec",
      // 代码质量 (§7.2)
      "pr-reviewer",
      "perf-profiler",
      "log-analyzer",
      "sentry",
      "ripgrep",
      // 搜索引擎 (§7.4)
      "tavily",
      "exa-search",
      "serpapi",
      "serper",
      "searxng",
      "duckduckgo",
      "ddg-search",
      "kagi",
      "zhipu-web-search",
      "baidu-search",
      "baidu-scholar",
      "aliyun-search",
      // 浏览器自动化 (§7.3)
      "clawbrowser",
      "fast-browser",
      "playwright",
      "puppeteer",
      "stagehand",
      "browser",
      // Agent 框架 (§7.5)
      "agent-builder",
      "agent-orchestrat",
      "claw-swarm",
      "agent-protocol",
      "agent-memory",
      "agentmemory",
      // 记忆系统 (§7.6)
      "memory",
      "vector-memory",
      "chromadb",
      "lancedb",
      "sequential-thinking",
      // 数据库 (§7.13)
      "postgres",
      "database",
      "sqlite",
      "redis",
      "mongodb",
      "nocodb",
      "duckdb",
      "supabase",
      "snowflake",
      // DevOps (§7.14)
      "kubernetes",
      "n8n",
      "portainer",
      "proxmox",
      "pm2",
      "vercel",
      "netlify",
      "railway",
      "nginx",
      "uptime-kuma",
      "digital-ocean",
      // 编程语言专用 (§7.2)
      "python",
      "nextjs",
      "trpc",
      "swift",
      "php",
      "noir-developer",
      // MCP/技能 (§7.2)
      "mcp-builder",
      "skill-scaffold",
      "skill-evaluator",
      // 深度研究 (§7.1)
      "deep-research",
      "perplexity",
    ],
    category: "development",
  },
  // 🔧 系统工具 — 截图、文件管理、备份、安全、桌面控制 (~55+ skills)
  {
    keywords: [
      "peekaboo",
      "camsnap",
      "screenshot",
      "filesystem",
      "backup",
      "simple-backup",
      "packaging",
      "eightctl",
      "clawdbot-skill-update",
      "clawdlink",
      "anyone-proxy",
      "verify-on-browser",
      // 安全 (§7.12)
      "security",
      "clawsec",
      "clawguard",
      "clawscan",
      "praesidia",
      "virustotal",
      "nmap",
      "nordvpn",
      "tailscale",
      "openssl",
      "proton-pass",
      // 桌面控制 (§7.14)
      "desktop-commander",
      "desktop-control",
      "windows-control",
      "everything-search",
      // 文件管理
      "clawdbot-filesystem",
      "file-search",
      "dropbox",
      // 系统工具
      "mactop",
      "unraid",
    ],
    category: "system",
  },
];

// ============================================================================
// 分类定义（按用户兴趣度排序，最感兴趣的放前面）
// ============================================================================
export const CATEGORIES: PlaygroundCategory[] = [
  {
    id: "finance",
    emoji: "💰",
    labelKey: "playground.category.finance",
    descKey: "playground.category.financeDesc",
  },
  {
    id: "entertainment",
    emoji: "🎮",
    labelKey: "playground.category.entertainment",
    descKey: "playground.category.entertainmentDesc",
  },
  {
    id: "work",
    emoji: "💼",
    labelKey: "playground.category.work",
    descKey: "playground.category.workDesc",
  },
  {
    id: "lifestyle",
    emoji: "🌤️",
    labelKey: "playground.category.lifestyle",
    descKey: "playground.category.lifestyleDesc",
  },
  {
    id: "creative",
    emoji: "🎨",
    labelKey: "playground.category.creative",
    descKey: "playground.category.creativeDesc",
  },
  {
    id: "communication",
    emoji: "💬",
    labelKey: "playground.category.communication",
    descKey: "playground.category.communicationDesc",
  },
  {
    id: "development",
    emoji: "💻",
    labelKey: "playground.category.development",
    descKey: "playground.category.developmentDesc",
  },
  {
    id: "system",
    emoji: "🔧",
    labelKey: "playground.category.system",
    descKey: "playground.category.systemDesc",
  },
  {
    id: "other",
    emoji: "✨",
    labelKey: "playground.category.other",
    descKey: "playground.category.otherDesc",
  },
];

// ============================================================================
// 预定义的 skill 玩法示例（按分类排列）
// 小白用户可以直接复制使用的示例对话
// ============================================================================
const SKILL_EXAMPLES: Record<string, { example: string; tips?: string }> = {
  // ── 💰 财经理财 ──
  "a-stock-analysis": {
    example: "帮我分析一下今天 A 股大盘走势",
    tips: "支持沪深个股、板块分析",
  },
  "stock-analysis": {
    example: "分析一下贵州茅台最近的走势",
    tips: "支持个股技术分析",
  },
  "crypto-tracker": {
    example: "查看比特币和以太坊的最新价格",
    tips: "支持主流加密货币实时行情",
  },
  polymarket: {
    example: "查看美国大选最新预测赔率",
    tips: "Polymarket 预测市场，支持政治/加密/体育",
  },
  "hyperliquid-trading": {
    example: "查看我在 Hyperliquid 上的持仓",
    tips: "需要配置 API key",
  },
  okx: {
    example: "查看 OKX 上 BTC/USDT 的最新价格",
    tips: "需要配置 OKX API key",
  },
  "sec-filing-watcher": {
    example: "帮我监控 Tesla 最新的 SEC 财报",
  },
  // ── 🎮 娱乐休闲 ──
  canvas: {
    example: "在我的 Mac 上展示一个贪吃蛇游戏",
    tips: "需要连接 Clawdbot 节点（Mac/iOS/Android）",
  },
  "spotify-player": {
    example: "播放周杰伦的歌曲",
    tips: "需要安装 spotify_player CLI（需海外网络）",
  },
  songsee: {
    example: "帮我识别这首歌是什么歌",
  },
  "video-frames": {
    example: "从这个视频中提取关键帧",
    tips: "支持常见视频格式，需要安装 ffmpeg",
  },
  gifgrep: {
    example: "帮我找一个表示开心的 GIF",
    tips: "需要海外网络",
  },
  sonoscli: {
    example: "在 Sonos 音箱上播放音乐",
    tips: "需要 Sonos 设备在同一网络",
  },
  steam: {
    example: "查看我的 Steam 游戏库里有什么游戏",
    tips: "需要配置 Steam API key",
  },
  sudoku: {
    example: "来一局数独游戏吧",
    tips: "纯文字游戏，无需配置",
  },
  riddle: {
    example: "给我出一个谜语",
    tips: "无需配置",
  },
  "media-converter": {
    example: "把这个 MP4 视频转换成 GIF",
    tips: "需要安装 ffmpeg",
  },
  blucli: {
    example: "查看局域网内的 Bluesound 音乐设备",
    tips: "需要 Go 编译运行",
  },
  // ── 💼 工作效率 ──
  "1password": {
    example: "从 1Password 获取我的 GitHub token",
    tips: "需要安装 1Password CLI 并解锁",
  },
  obsidian: {
    example: "在 Obsidian 中搜索关于 AI 的笔记",
    tips: "需要配置 Obsidian vault 路径",
  },
  "apple-notes": {
    example: "帮我在备忘录里记录今天的会议要点",
    tips: "仅支持 macOS",
  },
  "apple-reminders": {
    example: "提醒我明天下午3点开会",
    tips: "仅支持 macOS",
  },
  "things-mac": {
    example: "在 Things 里添加一个待办事项",
    tips: "仅支持 macOS，需要安装 Things 3",
  },
  "bear-notes": {
    example: "在 Bear 中创建一个新笔记",
    tips: "仅支持 macOS，需要安装 Bear",
  },
  himalaya: {
    example: "检查我的邮箱有没有新邮件",
    tips: "需要配置邮箱 IMAP/SMTP",
  },
  "4todo": {
    example: "添加一个待办：周五之前提交报告",
  },
  "daily-recap": {
    example: "帮我生成今天的工作日报",
  },
  "session-logs": {
    example: "查看最近的对话历史",
  },
  trello: {
    example: "在我的 Trello 看板上创建一个新任务",
    tips: "需要配置 Trello API key（需海外网络）",
  },
  notion: {
    example: "在我的 Notion 中创建一个新笔记",
    tips: "需要配置 Notion API key（需海外网络）",
  },
  todoist: {
    example: "在 Todoist 中添加一个新任务：完成周报",
    tips: "需要安装 Todoist CLI",
  },
  ticktick: {
    example: "查看我的滴答清单里今天的待办",
    tips: "需要配置 TickTick API",
  },
  weread: {
    example: "查看我微信读书最近的阅读记录",
    tips: "中国用户专属，需要配置微信读书 API",
  },
  logseq: {
    example: "在 Logseq 中搜索关于项目管理的笔记",
    tips: "需要配置 Logseq 知识库路径",
  },
  ms365: {
    example: "查看我 Microsoft 365 的日历安排",
    tips: "需要配置 Microsoft Graph API",
  },
  // ── 🌤️ 生活服务 ──
  weather: {
    example: "今天北京天气怎么样？",
    tips: "可以查询任何城市的天气，支持中英文城市名",
  },
  "weather-pollen": {
    example: "今天北京花粉指数高吗？",
    tips: "适合过敏人群查看",
  },
  openhue: {
    example: "把客厅的灯调成暖白色",
    tips: "需要配置 Philips Hue 桥接器",
  },
  plan2meal: {
    example: "帮我制定这周的健康食谱",
  },
  "sports-ticker": {
    example: "查看今天的 NBA 比分",
  },
  "flight-tracker": {
    example: "查看 CA1234 航班的实时状态",
  },
  "local-places": {
    example: "帮我找附近评分高的咖啡店",
    tips: "需要 Google Places API（需海外网络）",
  },
  "food-order": {
    example: "帮我查看附近的外卖选项",
    tips: "Foodora 平台（需海外网络）",
  },
  mijia: {
    example: "打开卧室的米家台灯",
    tips: "需要配置米家账号，中国用户专属",
  },
  "midea-ac": {
    example: "把美的空调调到 26 度制冷模式",
    tips: "需要配置美的账号，中国用户专属",
  },
  homeassistant: {
    example: "查看家里所有智能设备的状态",
    tips: "需要 Home Assistant 实例",
  },
  switchbot: {
    example: "打开 SwitchBot 控制的客厅灯",
    tips: "需要 SwitchBot API key",
  },
  strava: {
    example: "查看我上周跑步的统计数据",
    tips: "需要配置 Strava API key",
  },
  workout: {
    example: "帮我制定一个每周三次的健身计划",
  },
  "travel-concierge": {
    example: "帮我规划一个三天的杭州旅行",
  },
  // ── 🎨 创意设计 ──
  "openai-image-gen": {
    example: "帮我生成一张可爱的猫咪图片",
    tips: "需要 OpenAI API key（需海外网络）",
  },
  "nano-pdf": {
    example: "帮我把这个 PDF 转成文字摘要",
  },
  "edge-tts": {
    example: "用中文女声朗读这段文字",
    tips: "微软 Edge TTS，中国可用，无需 API key",
  },
  "sherpa-onnx-tts": {
    example: "帮我把这段文字转成语音文件",
    tips: "本地离线 TTS，无需联网",
  },
  "openai-whisper": {
    example: "把这段音频转换成文字",
    tips: "本地离线运行，中国可用",
  },
  "pptx-creator": {
    example: "帮我做一个关于 AI 趋势的 PPT",
  },
  summarize: {
    example: "帮我总结这篇文章的要点",
    tips: "需要 Google/OpenAI API（需海外网络）",
  },
  gemini: {
    example: "用 Gemini 分析这张图片",
    tips: "需要 Gemini API key（需海外网络）",
  },
  "qwen-image": {
    example: "用通义万相生成一张中国山水画",
    tips: "需要通义千问 API key，中国可用",
  },
  "seedream-image-gen": {
    example: "生成一张赛博朋克风格的城市图片",
    tips: "Seedream 图像生成，中国可用",
  },
  pollinations: {
    example: "生成一张日落海滩的风景图片",
    tips: "开源图像生成，无需 API key",
  },
  "minimax-tts": {
    example: "用 MiniMax 中文女声朗读这段文字",
    tips: "需要 MiniMax API key，中国可用",
  },
  "qwen-tts": {
    example: "用通义千问语音合成朗读这篇文章",
    tips: "需要通义千问 API key，中国可用",
  },
  "tiangong-ppt": {
    example: "用天工帮我做一个关于 AI 趋势的 PPT",
    tips: "天工系列工具，中国可用",
  },
  overleaf: {
    example: "帮我编辑 Overleaf 上的 LaTeX 论文",
    tips: "需要 Overleaf 账号",
  },
  "seo-audit": {
    example: "帮我检查网站的 SEO 评分",
  },
  "academic-deep-research": {
    example: "帮我深度调研 Transformer 架构的最新进展",
    tips: "学术深度研究，支持 APA 引用",
  },
  // ── 💬 通讯社交 ──
  discord: {
    example: "发送一条消息到我的 Discord 服务器",
    tips: "需要 Discord bot token（需海外网络）",
  },
  slack: {
    example: "在 Slack 的 #general 频道发送消息",
    tips: "需要 Slack bot token（需海外网络）",
  },
  "voice-call": {
    example: "帮我给这个号码拨打电话",
    tips: "需要 Twilio API（需海外网络）",
  },
  wechat: {
    example: "查看我微信最近的聊天记录",
    tips: "读取本地微信数据，支持 macOS/Windows",
  },
  wecom: {
    example: "通过企业微信给团队发送一条消息",
    tips: "需要配置企业微信 API",
  },
  dingtalk: {
    example: "在钉钉群里发送一条工作通知",
    tips: "需要配置钉钉 API",
  },
  "feishu-memory-recall": {
    example: "查看飞书中的工作记录和回忆",
    tips: "需要飞书 API 配置",
  },
  zhihu: {
    example: "在知乎圈子发布一条想法",
    tips: "需要配置知乎 API key",
  },
  xiaohongshu: {
    example: "查看小红书上关于旅游的热门笔记",
    tips: "需要配置小红书 API",
  },
  hackernews: {
    example: "查看 Hacker News 今日热门文章",
    tips: "无需配置，中国可用",
  },
  "telegram-bot": {
    example: "通过 Telegram Bot 发送一条消息",
    tips: "需要 Bot Token（需海外网络）",
  },
  bluesky: {
    example: "在 Bluesky 上发布一条动态",
    tips: "需要 AT Protocol 认证（需海外网络）",
  },
  // ── 💻 开发工具 ──
  github: {
    example: "帮我查看 clawdbot/clawdbot 这个仓库最近的 PR",
    tips: "需要先安装 gh CLI 并登录",
  },
  tmux: {
    example: "列出所有 tmux 会话",
    tips: "需要安装 tmux",
  },
  "skill-creator": {
    example: "帮我创建一个新的自定义技能",
  },
  "model-usage": {
    example: "显示我这个月的 API 使用量统计",
  },
  context7: {
    example: "查找 React 最新文档中关于 Hooks 的内容",
  },
  "brave-search": {
    example: "帮我搜索最新的 AI 新闻",
    tips: "需要 Brave Search API key",
  },
  blogwatcher: {
    example: "监控这些博客有没有更新",
  },
  "zhipu-web-search": {
    example: "用智谱搜索最新的 AI 论文",
    tips: "需要智谱 API key，中国可用",
  },
  "baidu-search": {
    example: "用百度搜索关于 TypeScript 的教程",
    tips: "百度搜索接口，中国可用",
  },
  "duckduckgo-search": {
    example: "用 DuckDuckGo 搜索 Python 教程",
    tips: "无需 API key，中国可用",
  },
  "tavily-search": {
    example: "用 Tavily 搜索最新技术趋势",
    tips: "需要 Tavily API key",
  },
  clawbrowser: {
    example: "打开浏览器截取这个网页的截图",
    tips: "需要安装 Playwright",
  },
  "docker-essentials": {
    example: "列出所有正在运行的 Docker 容器",
    tips: "需要安装 Docker",
  },
  n8n: {
    example: "查看 n8n 工作流的运行状态",
    tips: "需要配置 n8n API key",
  },
  postgres: {
    example: "查询 PostgreSQL 数据库中的用户表",
    tips: "需要配置数据库连接",
  },
  "ollama-local": {
    example: "用本地 Ollama 模型回答问题",
    tips: "需要安装 Ollama，完全离线可用",
  },
  "git-essentials": {
    example: "帮我用 Git 最佳实践提交代码",
  },
  "pr-reviewer": {
    example: "帮我审查这个 Pull Request 的代码",
    tips: "需要安装 gh CLI",
  },
  // ── 🔧 系统工具 ──
  peekaboo: {
    example: "截取我当前屏幕的截图",
    tips: "仅支持 macOS",
  },
  camsnap: {
    example: "用摄像头拍一张照片",
    tips: "需要摄像头权限",
  },
  "simple-backup": {
    example: "帮我备份当前项目文件夹",
  },
  "clawdbot-filesystem": {
    example: "列出桌面上的所有文件",
  },
  "verify-on-browser": {
    example: "打开浏览器验证这个网页是否正常",
  },
  "windows-control": {
    example: "截取当前 Windows 桌面的截图",
    tips: "需要 Python 3.11+ 和 pyautogui（仅 Windows）",
  },
  "desktop-commander": {
    example: "帮我打开计算器应用",
    tips: "桌面自动化控制",
  },
  "everything-search": {
    example: "用 Everything 搜索名为 config 的文件",
    tips: "需要安装 Everything（仅 Windows）",
  },
  virustotal: {
    example: "扫描这个文件是否有病毒",
    tips: "需要 VirusTotal API key",
  },
  tailscale: {
    example: "查看 Tailscale VPN 节点列表",
    tips: "需要安装 Tailscale",
  },
  "clawsec-suite": {
    example: "运行安全扫描检查系统漏洞",
  },
};

export type PlaygroundProps = {
  loading: boolean;
  report: SkillStatusReport | null;
  error: string | null;
  activeCategory: string | null;
  // 搜索
  filter: string;
  onFilterChange: (next: string) => void;
  // 安装状态
  installingSkill: string | null;
  installMessage: string | null;
  // 回调
  onCategoryChange: (category: string | null) => void;
  onTrySkill: (skillName: string, example: string) => void;
  onInstallSkill: (skill: SkillStatusEntry) => void;
  onRefresh: () => void;
  onGoToSkills?: () => void;
};

// 预构建关键词 → 分类查找表（模块加载时一次性构建，O(1) 精确匹配 + O(k) 子串兜底）
const _keywordExactMap = new Map<string, string>();
const _keywordSubstrings: Array<{ keyword: string; category: string }> = [];

for (const rule of SKILL_CATEGORY_RULES) {
  for (const kw of rule.keywords) {
    const lower = kw.toLowerCase();
    // 精确匹配表：keyword 本身就是完整 skill 名称时直接命中
    _keywordExactMap.set(lower, rule.category);
    // 子串匹配表：用于 skill 名称包含 keyword 的情况
    _keywordSubstrings.push({ keyword: lower, category: rule.category });
  }
}

// 根据 skill 名称判断分类
export function categorizeSkill(skillName: string): string {
  const lowerName = skillName.toLowerCase();
  // 快速路径：精确匹配
  const exact = _keywordExactMap.get(lowerName);
  if (exact) return exact;
  // 慢速路径：短关键词用 segment 边界匹配，长关键词用子串匹配
  // 避免 "play" 匹配 "playwright"、"git" 匹配 "digital" 等误分类
  const segments = lowerName.split("-");
  for (const entry of _keywordSubstrings) {
    if (entry.keyword.length <= 4) {
      // 短关键词：仅匹配完整的 kebab-case 段
      if (segments.includes(entry.keyword)) {
        return entry.category;
      }
    } else {
      if (lowerName.includes(entry.keyword)) {
        return entry.category;
      }
    }
  }
  return "other";
}

// ============================================================================
// 技能推荐排序（5 维权重）
//
// 排序维度（分数越低越靠前）：
//   维度 1: 中国网络可用性     — CN 可用 0 分，CN 不可用 +1000
//   维度 2: 依赖完整性         — 全部满足 0 分，缺依赖但可装 +100, 需手动 +200, OS 不兼容 +300
//   维度 3: 官方/高质量优先    — bundled 0 分，managed +10, workspace +20, extra/other +30
//   维度 4: 同分时按名称排序
// ============================================================================
function getSkillScore(skill: SkillStatusEntry): number {
  let score = 0;

  // ── 维度 1: 中国网络可用性（权重最大） ──
  if (CN_DEPRIORITIZED_SKILLS.has(skill.name)) {
    score += 1000; // 被墙，排到最后
  } else if (CN_NATIVE_SKILLS.has(skill.name)) {
    score -= 5; // 中国特色技能加分，同条件下排更前
  }

  // ── 维度 2: 依赖完整性 ──
  const isAvailable = skill.eligible && !skill.disabled;
  const isOsCompatible = !skill.missing.os || skill.missing.os.length === 0;
  const hasMissingDeps =
    skill.missing.bins.length > 0 ||
    skill.missing.env.length > 0 ||
    skill.missing.config.length > 0;
  const canAutoInstall =
    isOsCompatible && skill.install && skill.install.length > 0 && skill.missing.bins.length > 0;

  if (isAvailable && !hasMissingDeps) {
    score += 0; // 依赖完全满足，可直接使用
  } else if (isAvailable) {
    score += 50; // eligible 但仍有部分 missing（边缘情况）
  } else if (canAutoInstall) {
    score += 100; // 缺依赖但可以一键安装
  } else if (isOsCompatible) {
    score += 200; // 需要手动配置（如 API key）
  } else {
    score += 300; // OS 不兼容
  }

  // ── 维度 3: 官方/高质量优先 ──
  const source = skill.source || "";
  if (source === "clawdbot-bundled") {
    score += 0; // 官方 bundled — 最高优先
  } else if (source === "clawdbot-managed") {
    score += 10; // 从技能市场安装的
  } else if (source === "clawdbot-workspace") {
    score += 20; // 工作区本地技能
  } else {
    score += 30; // extra / unknown
  }

  return score;
}

function sortSkillsByPriority(skills: SkillStatusEntry[]): SkillStatusEntry[] {
  // 预计算分数 — 避免 sort 的 O(n log n) 比较中重复调用 getSkillScore
  const scores = new Map<SkillStatusEntry, number>();
  for (const skill of skills) {
    scores.set(skill, getSkillScore(skill));
  }
  return [...skills].sort((a, b) => {
    const scoreDiff = scores.get(a)! - scores.get(b)!;
    if (scoreDiff !== 0) return scoreDiff;
    return a.name.localeCompare(b.name);
  });
}

// 将 skills 按分类整理
// 注意：调用方须传入已排序的数组，分组操作保持相对顺序（稳定分组），无需内部再排
function organizeSkillsByCategory(
  sortedSkills: SkillStatusEntry[],
): Map<string, SkillStatusEntry[]> {
  const result = new Map<string, SkillStatusEntry[]>();
  for (const category of CATEGORIES) {
    result.set(category.id, []);
  }
  for (const skill of sortedSkills) {
    const categoryId = categorizeSkill(skill.name);
    const list = result.get(categoryId);
    if (list) list.push(skill);
    else result.set(categoryId, [skill]);
  }
  return result;
}

// 获取 skill 的示例玩法
function getSkillExample(skillName: string): { example: string; tips?: string } {
  return (
    SKILL_EXAMPLES[skillName] || {
      example: `使用 ${skillName} 技能`,
    }
  );
}

// 获取技能的中文名称
function getSkillDisplayName(skillName: string): string {
  // 尝试获取翻译后的名称
  const translationKey = `skillName.${skillName}`;
  const translated = tMaybe(translationKey);
  // 如果翻译存在且不是原始的 key，则使用翻译
  if (translated && translated !== translationKey) {
    return translated;
  }
  // 否则返回原始名称（美化显示）
  return beautifySkillName(skillName);
}

// 获取技能的中文描述
function getSkillDisplayDesc(skill: SkillStatusEntry): string {
  // 尝试获取翻译后的描述
  const translationKey = `skillDesc.${skill.name}`;
  const translated = tMaybe(translationKey);
  // 如果翻译存在且不是原始的 key，则使用翻译
  if (translated && translated !== translationKey) {
    return translated;
  }
  // 否则返回原始描述
  return skill.description;
}

// 美化技能名称（kebab-case 转 Title Case）
const _upperWords = new Set([
  "api",
  "cli",
  "ui",
  "ai",
  "id",
  "url",
  "http",
  "https",
  "ssh",
  "ftp",
  "sql",
  "pdf",
  "csv",
  "json",
  "xml",
  "html",
  "css",
  "js",
  "ts",
  "md",
  "jwt",
  "oauth",
  "smtp",
  "imap",
  "rss",
  "rpc",
  "sdk",
  "iot",
  "vpn",
  "dns",
  "ip",
]);

function beautifySkillName(name: string): string {
  return name
    .split("-")
    .map((word) => {
      if (_upperWords.has(word.toLowerCase())) return word.toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

// 翻译安装按钮标签
// 将 "Install xxx (go)" 翻译成 "一键安装 xxx"
function translateInstallLabel(label: string): string {
  // 匹配 "Install xxx (go/brew/node/uv)" 格式
  const match = label.match(/^Install\s+(.+?)\s*\((\w+)\)$/i);
  if (match) {
    const [, toolName] = match;
    return `${t("playground.oneClickInstall")} ${toolName}`;
  }
  // 其他格式直接返回
  return label;
}

// 翻译安装消息
// 将英文错误消息翻译成中文 — 按优先级顺序匹配，首条命中即返回
const INSTALL_MESSAGE_RULES: Array<{ pattern: RegExp; transform: (msg: string) => string }> = [
  // 0. 已是中文/CN 专属 — 直接透传
  { pattern: /SkillHub|🇨🇳|安装成功|安装失败|正在安装/, transform: (m) => m },
  // 1. 正在安装
  {
    pattern: /(?:正在.*安装|Installing).*go/i,
    transform: () => "🚀 正在为您安装 Go 语言运行时...",
  },
  {
    pattern: /(?:正在.*安装|Installing).*node/i,
    transform: () => "🚀 正在为您安装 Node.js 运行时...",
  },
  {
    pattern: /(?:正在.*安装|Installing).*uv/i,
    transform: () => "🚀 正在为您安装 Python 包管理器 (uv)...",
  },
  // 2. 未安装错误（必须在「安装成功」之前匹配，否则 "not installed" 包含 "installed"）
  {
    pattern: /go not installed/i,
    transform: () => `❌ ${t("playground.goNotInstalled")}（请访问 https://go.dev/dl/ 下载安装）`,
  },
  {
    pattern: /node(?:js)? not installed|npm not installed/i,
    transform: () =>
      `❌ ${t("playground.nodeNotInstalled")}（请访问 https://nodejs.org/ 下载安装）`,
  },
  {
    pattern: /(?:home)?brew not installed/i,
    transform: () => `❌ ${t("playground.brewNotInstalled")}（请访问 https://brew.sh/ 安装）`,
  },
  {
    pattern: /uv not installed/i,
    transform: () =>
      `❌ ${t("playground.uvNotInstalled")}（请访问 https://docs.astral.sh/uv/ 了解安装方法）`,
  },
  // 3. 安装失败
  {
    pattern: /install.*fail|failed to install/i,
    transform: (m) => {
      const clean = m.replace(/Install failed \(exit \d+\):\s*/i, "").trim();
      return `❌ ${t("playground.installFailed")}: ${clean || m}`;
    },
  },
  // 4. 安装成功
  { pattern: /go installed|Go 安装成功/i, transform: () => "✅ Go 语言运行时安装成功！" },
  { pattern: /node installed|Node.*安装成功/i, transform: () => "✅ Node.js 运行时安装成功！" },
  { pattern: /uv installed|uv 安装成功/i, transform: () => "✅ Python 包管理器 (uv) 安装成功！" },
  { pattern: /^Installed$/i, transform: () => `✅ ${t("playground.installSuccess")}` },
  { pattern: /success|installed/i, transform: () => `✅ ${t("playground.installSuccess")}` },
];

function translateInstallMessage(message: string): string {
  const trimmed = message.trim();
  for (const rule of INSTALL_MESSAGE_RULES) {
    if (rule.pattern.test(trimmed)) {
      return rule.transform(trimmed);
    }
  }
  return message;
}

// 渲染单个 skill 卡片
function renderSkillCard(skill: SkillStatusEntry, props: PlaygroundProps) {
  const example = getSkillExample(skill.name);
  const isAvailable = skill.eligible && !skill.disabled;
  const isInstalling = props.installingSkill === skill.name;

  // 检查 OS 是否兼容
  const hasOsRestriction = skill.missing.os && skill.missing.os.length > 0;

  // 检查是否可以自动安装（必须 OS 兼容才能安装）
  const canAutoInstall =
    !isAvailable &&
    !hasOsRestriction &&
    skill.install &&
    skill.install.length > 0 &&
    skill.missing.bins.length > 0;
  const installOption = skill.install?.[0];

  // OS 不兼容时显示提示
  const osIncompatibleHint = hasOsRestriction
    ? skill.missing.os?.includes("darwin")
      ? t("skills.incompatible.macos")
      : skill.missing.os?.includes("win32")
        ? t("skills.incompatible.windows")
        : t("skills.incompatible")
    : null;

  const missingItems = [
    // OS 不兼容放在最前面
    ...(osIncompatibleHint ? [`⚠️ ${osIncompatibleHint}`] : []),
    ...skill.missing.bins.map((b) => `${t("playground.missing.bin")}: ${b}`),
    ...skill.missing.env.map((e) => `${t("playground.missing.env")}: ${e}`),
    ...skill.missing.config.map((c) => `${t("playground.missing.config")}: ${c}`),
  ];

  // 获取中文显示名称和描述
  const displayName = getSkillDisplayName(skill.name);
  const displayDesc = getSkillDisplayDesc(skill);

  return html`
    <div class="playground-skill-card ${isAvailable ? "" : "playground-skill-unavailable"}">
      <div class="playground-skill-header">
        <span class="playground-skill-emoji">${skill.emoji || "📦"}</span>
        <span class="playground-skill-name">${displayName}</span>
        ${
          isAvailable
            ? html`<span class="playground-skill-status playground-skill-available">${t("playground.available")}</span>`
            : html`<span class="playground-skill-status playground-skill-needs-setup">${t("playground.needsSetup")}</span>`
        }
        ${
          CN_DEPRIORITIZED_SKILLS.has(skill.name)
            ? html`<span class="playground-skill-status playground-skill-cn-blocked">${t("playground.cnBlocked")}</span>`
            : nothing
        }
      </div>
      
      <p class="playground-skill-desc">${clampText(displayDesc, 100)}</p>
      
      <div class="playground-skill-example">
        <div class="playground-example-label">${t("playground.tryThis")}:</div>
        <div
          class="playground-example-text ${isAvailable ? "playground-example-clickable" : ""}"
          @click=${isAvailable ? () => props.onTrySkill(skill.name, example.example) : nothing}
        >"${example.example}"</div>
        ${
          example.tips
            ? html`<div class="playground-example-tips">💡 ${example.tips}</div>`
            : nothing
        }
      </div>
      
      ${
        missingItems.length > 0
          ? html`
            <div class="playground-skill-missing">
              <div class="playground-missing-label">${t("playground.missingDeps")}:</div>
              <ul class="playground-missing-list">
                ${missingItems.slice(0, 3).map((item) => html`<li>${item}</li>`)}
                ${
                  missingItems.length > 3
                    ? html`<li>... ${t("playground.andMore", { count: String(missingItems.length - 3) })}</li>`
                    : nothing
                }
              </ul>
            </div>
          `
          : nothing
      }
      
      <div class="playground-skill-actions">
        ${
          isAvailable
            ? html`
              <button
                class="btn playground-try-btn primary"
                @click=${() => props.onTrySkill(skill.name, example.example)}
              >
                ${t("playground.tryNow")}
              </button>
            `
            : canAutoInstall
              ? html`
                <button
                  class="btn playground-install-btn primary"
                  ?disabled=${isInstalling}
                  @click=${() => props.onInstallSkill(skill)}
                >
                  ${
                    isInstalling
                      ? html`<span class="playground-spinner"></span> ${t("skills.installing")}`
                      : html`🔧 ${installOption?.label ? translateInstallLabel(installOption.label) : t("playground.configureFirst")}`
                  }
                </button>
              `
              : html`
                <button
                  class="btn playground-try-btn playground-btn-incompatible"
                  disabled
                  title="${hasOsRestriction ? osIncompatibleHint : t("playground.configureFirst")}"
                >
                  ${hasOsRestriction ? `🚫 ${osIncompatibleHint}` : t("playground.configureFirst")}
                </button>
              `
        }
        ${
          isInstalling && props.installMessage
            ? html`<div class="playground-card-message">${translateInstallMessage(props.installMessage)}</div>`
            : nothing
        }
      </div>
    </div>
  `;
}

// 渲染分类标签
function renderCategoryTab(
  category: PlaygroundCategory,
  skillCount: number,
  isActive: boolean,
  onClick: () => void,
) {
  if (skillCount === 0) return nothing;

  return html`
    <button
      class="playground-category-tab ${isActive ? "active" : ""}"
      @click=${onClick}
    >
      <span class="playground-category-emoji">${category.emoji}</span>
      <span class="playground-category-label">${tMaybe(category.labelKey)}</span>
      <span class="playground-category-count">${skillCount}</span>
    </button>
  `;
}

// 最大渲染数量 — 超过此值则截断，避免 DOM 爆炸导致页面卡死
// "全部"视图仅渲染 24 个卡片（首屏可见 ~8-12 个），减少初始 DOM 数量
const ALL_VIEW_MAX_RENDER = 24;
const CATEGORY_VIEW_MAX_RENDER = 80;

// 渲染缓存：仅当 report 引用变化时才重新排序/分类（避免每次 Lit render 都 O(n log n)）
let _cachedReportRef: SkillStatusReport | null = null;
let _cachedSorted: SkillStatusEntry[] = [];
let _cachedByCategory: Map<string, SkillStatusEntry[]> = new Map();
let _cachedAvailableCount = 0;

function getProcessedSkills(report: SkillStatusReport | null) {
  if (report === _cachedReportRef) {
    return {
      sorted: _cachedSorted,
      byCategory: _cachedByCategory,
      availableCount: _cachedAvailableCount,
    };
  }
  const skills = report?.skills ?? [];
  _cachedReportRef = report;
  _cachedSorted = sortSkillsByPriority(skills);
  _cachedByCategory = organizeSkillsByCategory(_cachedSorted);
  _cachedAvailableCount = skills.reduce((n, s) => n + (s.eligible && !s.disabled ? 1 : 0), 0);
  return {
    sorted: _cachedSorted,
    byCategory: _cachedByCategory,
    availableCount: _cachedAvailableCount,
  };
}

export function renderPlayground(props: PlaygroundProps) {
  const {
    sorted: sortedSkills,
    byCategory: skillsByCategory,
    availableCount,
  } = getProcessedSkills(props.report);

  // 计算各分类的技能数量
  const categoryCounts = new Map<string, number>();
  for (const category of CATEGORIES) {
    categoryCounts.set(category.id, skillsByCategory.get(category.id)?.length ?? 0);
  }

  // 获取当前激活分类的技能
  const activeCategory = props.activeCategory;
  const preFilterSkills = activeCategory
    ? (skillsByCategory.get(activeCategory) ?? [])
    : sortedSkills;

  // 搜索过滤
  const filter = props.filter.trim().toLowerCase();
  const allSkills = filter
    ? preFilterSkills.filter((s) => {
        const text = [s.name, s.description, s.emoji || ""].join(" ").toLowerCase();
        // 同时搜索 i18n 名称
        const displayName = getSkillDisplayName(s.name).toLowerCase();
        return text.includes(filter) || displayName.includes(filter);
      })
    : preFilterSkills;

  // 截断渲染数量，防止 DOM 爆炸（"全部"视图 60 个，分类视图 150 个）
  const maxRender = activeCategory ? CATEGORY_VIEW_MAX_RENDER : ALL_VIEW_MAX_RENDER;
  const isTruncated = allSkills.length > maxRender;
  const activeSkills = isTruncated ? allSkills.slice(0, maxRender) : allSkills;

  const totalCount = sortedSkills.length;

  return html`
    <!-- 顶部介绍卡片 -->
    <section class="card playground-intro-card">
      <div class="playground-intro-header">
        <div class="playground-intro-icon">🎮</div>
        <div class="playground-intro-content">
          <h2 class="playground-intro-title">${t("playground.title")}</h2>
          <p class="playground-intro-desc">${t("playground.description")}</p>
        </div>
        <button class="btn" ?disabled=${props.loading} @click=${props.onRefresh}>
          ${props.loading ? t("common.loading") : t("common.refresh")}
        </button>
      </div>
      
      <div class="playground-stats">
        <div class="playground-stat">
          <span class="playground-stat-value">${totalCount}</span>
          <span class="playground-stat-label">${t("playground.totalSkills")}</span>
        </div>
        <div class="playground-stat">
          <span class="playground-stat-value playground-stat-available">${availableCount}</span>
          <span class="playground-stat-label">${t("playground.availableSkills")}</span>
        </div>
        <div class="playground-stat">
          <span class="playground-stat-value playground-stat-setup">${totalCount - availableCount}</span>
          <span class="playground-stat-label">${t("playground.needsSetupSkills")}</span>
        </div>
      </div>
    </section>

    ${
      props.error
        ? html`<div class="callout danger" style="margin-bottom: 16px;">${props.error}</div>`
        : nothing
    }

    ${
      props.installMessage && !props.installingSkill
        ? html`<div class="callout ${props.installMessage.includes("失败") || props.installMessage.includes("fail") || props.installMessage.includes("not installed") ? "danger" : "success"}" style="margin-bottom: 16px;">
          ${translateInstallMessage(props.installMessage)}
        </div>`
        : nothing
    }

    <!-- 搜索框 -->
    <div class="playground-search" style="margin-bottom: 12px;">
      <input
        type="text"
        class="playground-search__input"
        .value=${props.filter}
        @input=${(e: Event) => props.onFilterChange((e.target as HTMLInputElement).value)}
        placeholder="${t("playground.searchPlaceholder") || "搜索技能名称..."}"
        autocomplete="off"
      />
      ${
        props.filter
          ? html`
        <button
          class="playground-search__clear"
          @click=${() => props.onFilterChange("")}
        >&times;</button>
      `
          : nothing
      }
    </div>

    <!-- 分类标签栏 -->
    <section class="card playground-categories-card">
      <div class="playground-categories">
        <button
          class="playground-category-tab ${!activeCategory ? "active" : ""}"
          @click=${() => props.onCategoryChange(null)}
        >
          <span class="playground-category-emoji">🌟</span>
          <span class="playground-category-label">${t("playground.allSkills")}</span>
          <span class="playground-category-count">${totalCount}</span>
        </button>
        ${CATEGORIES.map((category) =>
          renderCategoryTab(
            category,
            categoryCounts.get(category.id) ?? 0,
            activeCategory === category.id,
            () => props.onCategoryChange(category.id),
          ),
        )}
      </div>
      
      ${
        activeCategory
          ? html`
            <div class="playground-category-desc">
              ${tMaybe(CATEGORIES.find((c) => c.id === activeCategory)?.descKey ?? "")}
            </div>
          `
          : nothing
      }
    </section>

    <!-- 技能卡片网格 -->
    <section class="playground-skills-grid">
      ${
        activeSkills.length === 0
          ? html`
            <div class="playground-empty">
              <div class="playground-empty-icon">${filter ? "🔍" : "📭"}</div>
              <div class="playground-empty-text">${filter ? t("playground.emptySearch") || "没有找到匹配的技能" : t("playground.noSkillsInCategory")}</div>
              ${filter ? html`<button class="btn btn--sm" style="margin-top: 12px;" @click=${() => props.onFilterChange("")}>${t("skills.clearFilters") || "清除搜索"}</button>` : nothing}
            </div>
          `
          : activeSkills.map((skill) => renderSkillCard(skill, props))
      }
    </section>

    ${
      isTruncated
        ? html`
          <div class="playground-truncation-hint">
            ${t("playground.showingTopN", { count: String(maxRender), total: String(allSkills.length) })}
            ${
              props.onGoToSkills
                ? html` · <button class="playground-truncation-link" @click=${props.onGoToSkills}>${t("playground.goToSkills")}</button>`
                : nothing
            }
          </div>
        `
        : nothing
    }

    <!-- 底部帮助提示 -->
    <section class="card playground-help-card">
      <details>
        <summary class="playground-help-summary">
          ${t("playground.helpTitle")}
        </summary>
        <div class="playground-help-content">
          <div class="playground-help-section">
            <h4>${t("playground.help.whatIsSkill")}</h4>
            <p>${t("playground.help.skillDesc")}</p>
          </div>
          <div class="playground-help-section">
            <h4>${t("playground.help.howToUse")}</h4>
            <p>${t("playground.help.useDesc")}</p>
          </div>
          <div class="playground-help-section">
            <h4>${t("playground.help.needsSetup")}</h4>
            <p>${t("playground.help.setupDesc")}</p>
          </div>
        </div>
      </details>
    </section>
  `;
}
