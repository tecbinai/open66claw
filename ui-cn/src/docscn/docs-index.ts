/**
 * 文档中心索引
 * 定义所有文档的元数据、分类和搜索关键词
 */

export interface DocMeta {
  id: string;
  title: string;
  summary: string;
  keywords: string[];
  category: string;
  related: string[];
  icon?: string;
  file?: string; // Markdown 文件路径（如果是外部文件）
  content?: string; // 内联内容（用于快速入门等）
}

export interface DocCategory {
  id: string;
  title: string;
  icon: string;
  description: string;
  color: string;
  docs: string[];
}

export interface DocsIndex {
  categories: DocCategory[];
  docs: Record<string, DocMeta>;
}

/**
 * 文档索引数据
 */
export const docsIndex: DocsIndex = {
  categories: [
    {
      id: "quickstart",
      title: "快速开始",
      icon: "🚀",
      description: "5 分钟快速上手 Clawdbot",
      color: "#10b981",
      docs: ["getting-started", "wizard", "setup", "first-chat"],
    },
    {
      id: "channels",
      title: "消息通道",
      icon: "💬",
      description: "连接微信、Telegram、飞书等",
      color: "#3b82f6",
      docs: ["whatsapp", "telegram", "wechat", "feishu", "dingtalk", "discord"],
    },
    {
      id: "models",
      title: "AI 模型",
      icon: "🤖",
      description: "配置 Claude、GPT、国产模型",
      color: "#8b5cf6",
      docs: ["model-config", "anthropic", "openai", "deepseek", "qwen", "moonshot"],
    },
    {
      id: "security",
      title: "安全设置",
      icon: "🛡️",
      description: "三种安全模式详解",
      color: "#f59e0b",
      docs: ["security-modes", "sandbox", "permissions", "approval"],
    },
    {
      id: "automation",
      title: "自动化",
      icon: "⚡",
      description: "定时任务、Webhook、轮询",
      color: "#ec4899",
      docs: ["cron-jobs", "webhook", "heartbeat", "gmail-pubsub"],
    },
    {
      id: "advanced",
      title: "进阶配置",
      icon: "⚙️",
      description: "多 Agent、网关、远程访问",
      color: "#6366f1",
      docs: ["multi-agent", "gateway-config", "remote-access", "tailscale"],
    },
  ],

  docs: {
    // === 快速开始 ===
    "getting-started": {
      id: "getting-started",
      title: "快速入门",
      summary: "从零开始安装配置 Clawdbot，5 分钟搞定",
      keywords: ["安装", "入门", "开始", "新手", "教程"],
      category: "quickstart",
      related: ["wizard", "setup"],
      content: `# 快速入门

欢迎使用 Clawdbot！只需三步即可开始：

## 1. 安装

\`\`\`bash
# 使用 npm 全局安装
npm install -g clawdbot@latest

# 或使用 pnpm
pnpm add -g clawdbot@latest
\`\`\`

## 2. 初始化配置

\`\`\`bash
clawdbot onboard
\`\`\`

按照向导提示完成配置：
- 选择 AI 模型提供商
- 配置 API 密钥
- 选择安全模式

## 3. 连接消息通道

\`\`\`bash
# 扫码连接 WhatsApp
clawdbot channels login

# 启动网关
clawdbot gateway
\`\`\`

打开 http://localhost:18789 即可开始聊天！

## 下一步

- [配置向导详解](/docs/wizard)
- [连接更多通道](/docs/channels)
- [了解安全模式](/docs/security-modes)
`,
    },

    wizard: {
      id: "wizard",
      title: "配置向导",
      summary: "交互式配置向导，一步步引导完成设置",
      keywords: ["向导", "配置", "onboard", "设置"],
      category: "quickstart",
      related: ["getting-started", "setup"],
      content: `# 配置向导

\`clawdbot onboard\` 命令启动交互式配置向导。

## 向导步骤

### 1. AI 模型配置
选择你的 AI 提供商：
- **Anthropic Claude** - 推荐，能力最强
- **OpenAI GPT** - 经典选择
- **国产模型** - DeepSeek、通义千问等

### 2. 安全模式选择

| 模式 | 适用场景 | 权限级别 |
|------|----------|----------|
| 🛡️ 安全模式 | 共用电脑 | 最低 |
| ⚖️ 平衡模式 | 日常使用 | 中等 |
| ⚡ 专家模式 | 独立设备 | 完全 |

### 3. 消息通道

选择要连接的消息平台，可以稍后再配置。

## 常见问题

**Q: 可以跳过某些步骤吗？**
A: 可以，按 Enter 使用默认值或稍后配置。

**Q: 如何重新运行向导？**
A: 运行 \`clawdbot onboard --force\`
`,
    },

    setup: {
      id: "setup",
      title: "手动配置",
      summary: "直接编辑配置文件进行高级设置",
      keywords: ["配置文件", "json", "手动", "高级"],
      category: "quickstart",
      related: ["getting-started", "gateway-config"],
      content: `# 手动配置

配置文件位于 \`~/.clawdbot/clawdbot.json\`

## 配置结构

\`\`\`json
{
  "agent": {
    "model": "claude-sonnet-4-20250514",
    "provider": "anthropic"
  },
  "channels": {
    "whatsapp": {
      "enabled": true,
      "allowFrom": ["+86138xxxx"]
    }
  },
  "security": {
    "mode": "balanced"
  }
}
\`\`\`

## 常用配置项

- \`agent.model\` - AI 模型名称
- \`agent.provider\` - 模型提供商
- \`channels.*\` - 各通道配置
- \`security.mode\` - 安全模式

## 重载配置

修改配置后运行：
\`\`\`bash
clawdbot gateway reload
\`\`\`
`,
    },

    "first-chat": {
      id: "first-chat",
      title: "发送第一条消息",
      summary: "测试 Clawdbot 是否正常工作",
      keywords: ["测试", "聊天", "消息", "验证"],
      category: "quickstart",
      related: ["getting-started"],
      content: `# 发送第一条消息

配置完成后，让我们验证一切正常。

## 方式一：Web 控制台

1. 打开 http://localhost:18789
2. 点击左侧 "Chat" 标签
3. 输入消息并发送

## 方式二：命令行

\`\`\`bash
clawdbot message send --target "+86138xxxx" --message "你好，Clawdbot！"
\`\`\`

## 方式三：直接发消息

在已连接的通道（如 WhatsApp）中直接发送消息。

## 常见问题

**没有收到回复？**
1. 检查网关是否运行：\`clawdbot status\`
2. 检查通道连接：\`clawdbot channels status\`
3. 查看日志：\`clawdbot logs\`
`,
    },

    // === 消息通道 ===
    whatsapp: {
      id: "whatsapp",
      title: "WhatsApp 配置",
      summary: "通过 WhatsApp Web 连接，扫码即用",
      keywords: ["whatsapp", "微信", "扫码", "二维码"],
      category: "channels",
      related: ["telegram", "wechat"],
      content: `# WhatsApp 配置

Clawdbot 通过 WhatsApp Web 协议连接。

## 快速连接

\`\`\`bash
clawdbot channels login
\`\`\`

扫描终端中显示的二维码即可。

## 配置选项

\`\`\`json
{
  "channels": {
    "whatsapp": {
      "enabled": true,
      "allowFrom": ["+86138xxxx"],
      "groups": {
        "*": { "requireMention": true }
      }
    }
  }
}
\`\`\`

## 常用配置

- \`allowFrom\` - 允许的发送者白名单
- \`groups.requireMention\` - 群聊是否需要 @ 才回复

## 注意事项

- WhatsApp 可能会限制频繁登录
- 建议使用专用手机号
- 保持手机网络连接
`,
    },

    telegram: {
      id: "telegram",
      title: "Telegram 配置",
      summary: "创建 Bot 并连接到 Clawdbot",
      keywords: ["telegram", "电报", "bot", "机器人"],
      category: "channels",
      related: ["whatsapp", "discord"],
      content: `# Telegram 配置

使用 Telegram Bot API 连接。

## 创建 Bot

1. 在 Telegram 中找到 @BotFather
2. 发送 \`/newbot\`
3. 按提示设置名称
4. 获取 Bot Token

## 配置 Token

\`\`\`bash
clawdbot config set channels.telegram.token "YOUR_BOT_TOKEN"
\`\`\`

或编辑配置文件：

\`\`\`json
{
  "channels": {
    "telegram": {
      "enabled": true,
      "token": "123456:ABC-DEF..."
    }
  }
}
\`\`\`

## 启用 Bot

\`\`\`bash
clawdbot gateway reload
\`\`\`

然后在 Telegram 中搜索你的 Bot 并开始聊天。
`,
    },

    wechat: {
      id: "wechat",
      title: "微信配置",
      summary: "通过微信公众号或企业微信连接",
      keywords: ["微信", "wechat", "公众号", "企业微信"],
      category: "channels",
      related: ["feishu", "dingtalk"],
      content: `# 微信配置

> ⚠️ 微信个人号无法直接连接，需要使用公众号或企业微信。

## 方式一：企业微信应用

1. 登录企业微信管理后台
2. 创建自建应用
3. 获取 CorpID 和 Secret
4. 配置回调 URL

## 方式二：微信公众号

1. 注册微信公众号
2. 开启开发者模式
3. 配置服务器 URL
4. 获取 AppID 和 Secret

## 配置示例

\`\`\`json
{
  "channels": {
    "wechat": {
      "enabled": true,
      "type": "work",
      "corpId": "your_corp_id",
      "agentId": "your_agent_id",
      "secret": "your_secret"
    }
  }
}
\`\`\`
`,
    },

    feishu: {
      id: "feishu",
      title: "飞书配置",
      summary: "创建飞书机器人并连接",
      keywords: ["飞书", "feishu", "lark", "字节"],
      category: "channels",
      related: ["dingtalk", "wechat"],
      content: `# 飞书配置

## 创建应用

1. 访问 [飞书开放平台](https://open.feishu.cn)
2. 创建企业自建应用
3. 添加"机器人"能力
4. 获取 App ID 和 App Secret

## 配置

\`\`\`json
{
  "channels": {
    "feishu": {
      "enabled": true,
      "appId": "cli_xxx",
      "appSecret": "xxx"
    }
  }
}
\`\`\`

## 事件订阅

配置事件回调 URL：
\`http://your-server:18789/__clawdbot__/webhook/feishu\`

订阅事件：
- 接收消息
- 机器人进群
`,
    },

    dingtalk: {
      id: "dingtalk",
      title: "钉钉配置",
      summary: "创建钉钉机器人并连接",
      keywords: ["钉钉", "dingtalk", "阿里"],
      category: "channels",
      related: ["feishu", "wechat"],
      content: `# 钉钉配置

## 创建机器人

1. 访问 [钉钉开放平台](https://open.dingtalk.com)
2. 创建企业内部应用
3. 添加"机器人"能力
4. 获取 AppKey 和 AppSecret

## 配置

\`\`\`json
{
  "channels": {
    "dingtalk": {
      "enabled": true,
      "appKey": "xxx",
      "appSecret": "xxx"
    }
  }
}
\`\`\`

## Webhook 配置

消息接收地址：
\`http://your-server:18789/__clawdbot__/webhook/dingtalk\`
`,
    },

    discord: {
      id: "discord",
      title: "Discord 配置",
      summary: "创建 Discord Bot 并添加到服务器",
      keywords: ["discord", "游戏", "社区"],
      category: "channels",
      related: ["telegram", "slack"],
      content: `# Discord 配置

## 创建 Bot

1. 访问 [Discord Developer Portal](https://discord.com/developers/applications)
2. 创建 New Application
3. 在 Bot 页面创建 Bot
4. 复制 Token

## 配置

\`\`\`json
{
  "channels": {
    "discord": {
      "enabled": true,
      "token": "your_bot_token"
    }
  }
}
\`\`\`

## 添加到服务器

使用 OAuth2 URL 邀请 Bot 到你的服务器。
`,
    },

    // === AI 模型 ===
    "model-config": {
      id: "model-config",
      title: "模型配置",
      summary: "配置 AI 模型和提供商",
      keywords: ["模型", "AI", "配置", "provider"],
      category: "models",
      related: ["anthropic", "openai"],
      content: `# 模型配置

## 基本配置

\`\`\`json
{
  "agent": {
    "model": "claude-sonnet-4-20250514",
    "provider": "anthropic"
  }
}
\`\`\`

## 支持的模型

| 提供商 | 推荐模型 |
|--------|----------|
| Anthropic | claude-sonnet-4-20250514 |
| OpenAI | gpt-4o |
| DeepSeek | deepseek-chat |
| 通义 | qwen-max |

## 模型切换

\`\`\`bash
clawdbot config set agent.model "gpt-4o"
clawdbot config set agent.provider "openai"
\`\`\`
`,
    },

    anthropic: {
      id: "anthropic",
      title: "Anthropic Claude",
      summary: "配置 Anthropic Claude 模型",
      keywords: ["claude", "anthropic", "sonnet", "opus"],
      category: "models",
      related: ["openai", "model-config"],
      content: `# Anthropic Claude

Claude 是目前最强大的 AI 助手之一。

## 获取 API Key

1. 访问 [Anthropic Console](https://console.anthropic.com)
2. 创建 API Key

## 配置

\`\`\`bash
clawdbot config set credentials.anthropic.apiKey "sk-ant-xxx"
\`\`\`

## 可用模型

- \`claude-sonnet-4-20250514\` - 推荐，性价比最高
- \`claude-opus-4-20250514\` - 最强能力
- \`claude-3-5-haiku-20241022\` - 快速响应

## 成本估算

| 模型 | 输入 | 输出 |
|------|------|------|
| Sonnet | $3/M | $15/M |
| Opus | $15/M | $75/M |
`,
    },

    openai: {
      id: "openai",
      title: "OpenAI GPT",
      summary: "配置 OpenAI GPT 模型",
      keywords: ["openai", "gpt", "chatgpt", "gpt4"],
      category: "models",
      related: ["anthropic", "model-config"],
      content: `# OpenAI GPT

## 获取 API Key

1. 访问 [OpenAI Platform](https://platform.openai.com)
2. 创建 API Key

## 配置

\`\`\`bash
clawdbot config set credentials.openai.apiKey "sk-xxx"
\`\`\`

## 可用模型

- \`gpt-4o\` - 推荐，多模态
- \`gpt-4-turbo\` - 长上下文
- \`gpt-3.5-turbo\` - 经济实惠
`,
    },

    deepseek: {
      id: "deepseek",
      title: "DeepSeek",
      summary: "配置 DeepSeek 深度求索模型",
      keywords: ["deepseek", "深度求索", "国产"],
      category: "models",
      related: ["qwen", "moonshot"],
      content: `# DeepSeek

国产大模型，性价比极高。

## 获取 API Key

访问 [DeepSeek 开放平台](https://platform.deepseek.com)

## 配置

\`\`\`bash
clawdbot config set credentials.deepseek.apiKey "sk-xxx"
clawdbot config set agent.provider "deepseek"
clawdbot config set agent.model "deepseek-chat"
\`\`\`
`,
    },

    qwen: {
      id: "qwen",
      title: "通义千问",
      summary: "配置阿里通义千问模型",
      keywords: ["通义", "千问", "qwen", "阿里"],
      category: "models",
      related: ["deepseek", "moonshot"],
      content: `# 通义千问

阿里云通义千问大模型。

## 获取 API Key

访问 [阿里云百炼](https://bailian.console.aliyun.com)

## 配置

\`\`\`bash
clawdbot config set credentials.dashscope.apiKey "sk-xxx"
clawdbot config set agent.provider "dashscope"
clawdbot config set agent.model "qwen-max"
\`\`\`
`,
    },

    moonshot: {
      id: "moonshot",
      title: "月之暗面 Kimi",
      summary: "配置 Moonshot Kimi 模型",
      keywords: ["moonshot", "kimi", "月之暗面"],
      category: "models",
      related: ["deepseek", "qwen"],
      content: `# 月之暗面 Kimi

超长上下文能力的国产模型。

## 获取 API Key

访问 [Moonshot AI 开放平台](https://platform.moonshot.cn)

## 配置

\`\`\`bash
clawdbot config set credentials.moonshot.apiKey "sk-xxx"
clawdbot config set agent.provider "moonshot"
clawdbot config set agent.model "moonshot-v1-128k"
\`\`\`
`,
    },

    // === 安全设置 ===
    "security-modes": {
      id: "security-modes",
      title: "安全模式详解",
      summary: "了解三种安全模式的区别和适用场景",
      keywords: ["安全", "模式", "权限", "sandbox"],
      category: "security",
      related: ["sandbox", "permissions"],
      content: `# 安全模式详解

Clawdbot 提供三种安全模式，满足不同场景需求。

## 快速选择

| 你的情况 | 推荐模式 |
|----------|----------|
| 电脑有重要文件 | 🛡️ 安全模式 |
| 日常工作电脑 | ⚖️ 平衡模式 |
| 专用测试设备 | ⚡ 专家模式 |

## 🛡️ 安全模式

**适合：** 共用电脑、有重要文件

- ✅ 只能聊天和回答问题
- ❌ 不能执行命令
- ❌ 不能读写文件
- ❌ 不能访问网络

## ⚖️ 平衡模式 (推荐)

**适合：** 大多数用户

- ✅ 可以读取文件
- ✅ 可以执行安全命令
- ⚠️ 危险操作需要审批
- ❌ 不能删除系统文件

## ⚡ 专家模式

**适合：** 技术专家、独立设备

- ✅ 完全信任 AI
- ✅ 可以执行任何命令
- ⚠️ 风险自负

## 切换模式

\`\`\`bash
clawdbot config set security.mode "balanced"
\`\`\`
`,
    },

    sandbox: {
      id: "sandbox",
      title: "沙箱模式",
      summary: "在隔离环境中运行 AI 操作",
      keywords: ["沙箱", "sandbox", "隔离", "docker"],
      category: "security",
      related: ["security-modes", "permissions"],
      content: `# 沙箱模式

在 Docker 容器中隔离运行 AI 操作。

## 启用沙箱

\`\`\`bash
clawdbot config set sandbox.enabled true
\`\`\`

## 要求

- Docker 已安装并运行
- 足够的磁盘空间

## 工作原理

1. AI 的所有文件操作在容器内执行
2. 只有指定目录可以映射到容器
3. 网络访问可以限制

## 配置示例

\`\`\`json
{
  "sandbox": {
    "enabled": true,
    "image": "clawdbot/sandbox:latest",
    "mounts": ["/home/user/workspace"]
  }
}
\`\`\`
`,
    },

    permissions: {
      id: "permissions",
      title: "权限管理",
      summary: "细粒度控制 AI 可以做什么",
      keywords: ["权限", "permission", "allow", "deny"],
      category: "security",
      related: ["security-modes", "approval"],
      content: `# 权限管理

细粒度控制 AI 的能力。

## 工具权限

\`\`\`json
{
  "tools": {
    "bash": true,
    "file_read": true,
    "file_write": false,
    "web_search": true
  }
}
\`\`\`

## 路径权限

\`\`\`json
{
  "paths": {
    "allow": ["/home/user/projects"],
    "deny": ["/etc", "/root"]
  }
}
\`\`\`
`,
    },

    approval: {
      id: "approval",
      title: "操作审批",
      summary: "危险操作需要人工确认",
      keywords: ["审批", "approval", "确认", "危险"],
      category: "security",
      related: ["security-modes", "permissions"],
      content: `# 操作审批

某些操作需要你确认后才会执行。

## 查看待审批

打开 http://localhost:18789 查看审批请求。

或使用命令：
\`\`\`bash
clawdbot approvals list
\`\`\`

## 审批操作

\`\`\`bash
# 批准
clawdbot approvals approve <id>

# 拒绝
clawdbot approvals reject <id>
\`\`\`

## 配置审批规则

\`\`\`json
{
  "approvals": {
    "required": ["file_delete", "sudo"],
    "auto_approve": ["file_read"]
  }
}
\`\`\`
`,
    },

    // === 自动化 ===
    "cron-jobs": {
      id: "cron-jobs",
      title: "定时任务",
      summary: "配置 AI 定时执行任务",
      keywords: ["定时", "cron", "任务", "调度"],
      category: "automation",
      related: ["webhook", "heartbeat"],
      content: `# 定时任务

让 AI 定时执行任务。

## 创建任务

\`\`\`bash
clawdbot cron add --name "daily-report" --schedule "0 9 * * *" --message "生成今日报告"
\`\`\`

## Cron 表达式

| 表达式 | 含义 |
|--------|------|
| \`0 9 * * *\` | 每天 9:00 |
| \`*/30 * * * *\` | 每 30 分钟 |
| \`0 0 * * 1\` | 每周一 0:00 |

## 管理任务

\`\`\`bash
# 查看任务
clawdbot cron list

# 删除任务
clawdbot cron remove --name "daily-report"
\`\`\`
`,
    },

    webhook: {
      id: "webhook",
      title: "Webhook",
      summary: "通过 HTTP 触发 AI 执行任务",
      keywords: ["webhook", "http", "触发", "api"],
      category: "automation",
      related: ["cron-jobs", "heartbeat"],
      content: `# Webhook

通过 HTTP 请求触发 AI。

## 创建 Webhook

\`\`\`bash
clawdbot webhooks add --name "deploy" --secret "your-secret"
\`\`\`

## 调用

\`\`\`bash
curl -X POST http://localhost:18789/__clawdbot__/webhook/deploy \\
  -H "X-Webhook-Secret: your-secret" \\
  -d '{"message": "部署到生产环境"}'
\`\`\`
`,
    },

    heartbeat: {
      id: "heartbeat",
      title: "心跳任务",
      summary: "周期性执行的后台任务",
      keywords: ["心跳", "heartbeat", "周期", "后台"],
      category: "automation",
      related: ["cron-jobs", "webhook"],
      content: `# 心跳任务

与 Cron 类似，但更适合高频任务。

## 配置

\`\`\`json
{
  "heartbeat": {
    "enabled": true,
    "intervalMs": 60000,
    "message": "检查系统状态"
  }
}
\`\`\`

## 与 Cron 的区别

| 特性 | Cron | Heartbeat |
|------|------|-----------|
| 精度 | 分钟级 | 毫秒级 |
| 适用 | 定时任务 | 高频轮询 |
`,
    },

    "gmail-pubsub": {
      id: "gmail-pubsub",
      title: "Gmail 监控",
      summary: "监控 Gmail 收件箱并自动处理",
      keywords: ["gmail", "邮件", "google", "pubsub"],
      category: "automation",
      related: ["webhook", "cron-jobs"],
      content: `# Gmail 监控

实时监控 Gmail 并让 AI 处理邮件。

## 设置步骤

1. 在 Google Cloud 创建项目
2. 启用 Gmail API
3. 配置 Pub/Sub
4. 设置 OAuth 凭证

## 配置

\`\`\`json
{
  "gmail": {
    "enabled": true,
    "watchLabels": ["INBOX"],
    "credentials": "path/to/credentials.json"
  }
}
\`\`\`
`,
    },

    // === 进阶配置 ===
    "multi-agent": {
      id: "multi-agent",
      title: "多 Agent 配置",
      summary: "配置多个 AI Agent 处理不同任务",
      keywords: ["多agent", "multi", "路由", "分工"],
      category: "advanced",
      related: ["gateway-config", "remote-access"],
      content: `# 多 Agent 配置

为不同场景配置专门的 Agent。

## 配置示例

\`\`\`json
{
  "agents": {
    "coder": {
      "model": "claude-sonnet-4-20250514",
      "systemPrompt": "你是一个编程助手"
    },
    "writer": {
      "model": "gpt-4o",
      "systemPrompt": "你是一个写作助手"
    }
  },
  "routing": {
    "default": "coder",
    "rules": [
      { "pattern": "写作|文章", "agent": "writer" }
    ]
  }
}
\`\`\`

## 手动切换

发送 \`/agent coder\` 切换到指定 Agent。
`,
    },

    "gateway-config": {
      id: "gateway-config",
      title: "网关配置",
      summary: "配置网关端口、绑定地址等",
      keywords: ["网关", "gateway", "端口", "bind"],
      category: "advanced",
      related: ["remote-access", "tailscale"],
      content: `# 网关配置

## 基本配置

\`\`\`json
{
  "gateway": {
    "port": 18789,
    "bind": "127.0.0.1",
    "token": "your-secret-token"
  }
}
\`\`\`

## 启动选项

\`\`\`bash
# 指定端口
clawdbot gateway --port 8080

# 绑定所有接口
clawdbot gateway --bind 0.0.0.0

# 使用 token 认证
clawdbot gateway --token "secret"
\`\`\`
`,
    },

    "remote-access": {
      id: "remote-access",
      title: "远程访问",
      summary: "从外部网络访问 Clawdbot",
      keywords: ["远程", "remote", "外网", "访问"],
      category: "advanced",
      related: ["gateway-config", "tailscale"],
      content: `# 远程访问

## 方式一：SSH 隧道

\`\`\`bash
ssh -L 18789:localhost:18789 user@your-server
\`\`\`

## 方式二：Tailscale (推荐)

1. 安装 Tailscale
2. 配置 Clawdbot

\`\`\`bash
clawdbot gateway --bind tailnet
\`\`\`

## 方式三：反向代理

使用 Nginx/Caddy 配置 HTTPS 反向代理。

## 安全提醒

- 始终使用 token 认证
- 建议启用 HTTPS
- 限制访问 IP
`,
    },

    tailscale: {
      id: "tailscale",
      title: "Tailscale 配置",
      summary: "使用 Tailscale 安全访问",
      keywords: ["tailscale", "vpn", "安全", "远程"],
      category: "advanced",
      related: ["remote-access", "gateway-config"],
      content: `# Tailscale 配置

Tailscale 是最简单的远程访问方案。

## 安装 Tailscale

\`\`\`bash
# macOS
brew install tailscale

# Linux
curl -fsSL https://tailscale.com/install.sh | sh
\`\`\`

## 配置 Clawdbot

\`\`\`bash
clawdbot gateway --bind tailnet --token "secret"
\`\`\`

## 访问

在任何 Tailscale 网络内的设备上访问：
\`http://your-machine:18789\`
`,
    },
  },
};

/**
 * 获取所有文档列表（用于搜索）
 */
export function getAllDocs(): DocMeta[] {
  return Object.values(docsIndex.docs);
}

/**
 * 根据 ID 获取文档
 */
export function getDocById(id: string): DocMeta | null {
  return docsIndex.docs[id] ?? null;
}

/**
 * 获取分类下的所有文档
 */
export function getDocsByCategory(categoryId: string): DocMeta[] {
  const category = docsIndex.categories.find((c) => c.id === categoryId);
  if (!category) return [];
  return category.docs.map((id) => docsIndex.docs[id]).filter(Boolean);
}

/**
 * 获取相关文档
 */
export function getRelatedDocs(docId: string): DocMeta[] {
  const doc = docsIndex.docs[docId];
  if (!doc) return [];
  return doc.related.map((id) => docsIndex.docs[id]).filter(Boolean);
}
