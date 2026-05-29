# MCP 扩展能力页面完整梳理文档

> 用于 UI 改版参考。梳理 `/extensions`（"扩展 MCP"）页面的所有功能区块、控制器逻辑、Gateway 接口、子组件和事件系统。
> **注意：本文档仅覆盖 Extensions 页面（MCP），不含 Skills 技能页面（`/skills`），两者是完全独立的页面。**
> 生成日期：2026-03-09

---

## 一、页面定位

| 属性       | 值                                              |
| ---------- | ----------------------------------------------- |
| 导航栏名称 | **扩展 MCP**                                    |
| 副标题     | 你的 AI 助手的扩展能力。管理 MCP 服务器与工具。 |
| 路由       | `/extensions`                                   |
| 导航分组   | Agent（与 agents、skills 同组）                 |
| 内部子 Tab | `my`（我的能力）/ `store`（能力商店）           |

### 设计原则

- **永远不提 "MCP"** — 面向用户称为 "扩展能力" / "AI 能力"（导航栏例外）
- **新手友好** — 99% 用户停留在 Level 0-1，渐进式披露
- **乐观更新** — 安装/卸载立即更新 UI，失败回退

---

## 二、页面结构（HTML 布局）

```
<div class="extensions-page">
│
├── 【首次访问引导】 marketplace.showFirstVisit
│   └── 新手引导浮层（一次性，点击关闭）
│
├── 【顶部栏】 — Tab 切换 + 统计信息
│   ├── Tab 按钮组
│   │   ├── "我的能力" (my)
│   │   └── "能力商店" (store) — 带「试运行」Badge
│   └── 统计信息（仅 my tab 显示）
│       ├── 🟢 {n} 运行中  （ready 数量）
│       ├── ⏸️ {n} 已停止  （paused + unavailable）
│       └── 🔧 {n} 工具    （所有进程的 toolCount 之和）
│
├── 【Tab 1: 我的能力（my）】
│   │
│   ├── 更新通知条 — "{n} 个能力有更新"
│   │   └── 查看更新按钮
│   │
│   ├── 能力卡片网格 — 3 列自适应
│   │   └── extensions-card（每张卡片）
│   │       ├── [New] 标签（右上角，isNew 时显示）
│   │       ├── 头部行
│   │       │   ├── 能力名称（friendlyName）
│   │       │   └── 状态药丸：
│   │       │       ├── 🟢 就绪     ready      — 绿色圆点+发光
│   │       │       ├── 🟡 需配置   needs_config — 黄色
│   │       │       ├── ⏸️ 已暂停   paused      — 灰色
│   │       │       ├── 🔧 修复中   fixing      — 蓝色
│   │       │       └── 🔴 不可用   unavailable — 红色
│   │       ├── "它能帮你" + 功能描述列表（bullet points）
│   │       ├── 配置提示（needs_config 时）
│   │       │   └── "需要 API 密钥: {configNeeded}"
│   │       ├── 操作按钮行
│   │       │   ├── "配置并启用" 按钮（needs_config 时，黄色渐变）
│   │       │   │   └── 启用中 → 旋转 spinner
│   │       │   └── "卸载" 按钮（非内置能力，红色边框）
│   │       └── "试一试" 行
│   │           └── 💬 试试说: "{examplePrompt}" — 点击发送到 chat
│   │
│   ├── 高级设置折叠区 (advancedOpen)
│   │   ├── 进程列表表格
│   │   │   └── 每行：名称 / 状态(🟢running/🔴stopped/⚠️error) /
│   │   │         内存MB / 工具数 / 错误信息 /
│   │   │         操作按钮（重启/禁用/启用/测试）
│   │   └── 运行上限提示（MCP_MAX_RUNNING = 7）
│   │
│   └── 手动添加 MCP Server（高级用户）
│       └── 表单：id / command / args / transport(stdio|sse) / env / url / headers
│
├── 【Tab 2: 能力商店（store）】
│   │
│   ├── 搜索栏 — 300ms 防抖
│   │
│   ├── 分类筛选 Chips — 11 个分类（每个带 emoji）
│   │   ├── 🌟 全部(all)      📁 文件系统(filesystem)    🗃️ 数据库(database)
│   │   ├── 🔍 搜索(search)   ⚡ 生产力(productivity)    🛠️ 开发(development)
│   │   ├── 🌐 网络(network)  🏠 智能家居(smarthome)     🤖 AI(ai)
│   │   └── 📱 社交(social)   🔧 其他(other)
│   │
│   ├── 排序选择器
│   │   └── recommended(推荐) / newest(最新) / name(名称) / popular(热门)
│   │
│   ├── 推荐区（可选，个性化推荐）
│   │
│   ├── 商品卡片网格 — 3 列自适应
│   │   └── mcp-marketplace-card（每张卡片）
│   │       ├── 头部行
│   │       │   ├── 分类 emoji 图标（36x36 圆角方块）
│   │       │   ├── 名称（friendlyName，最宽 160px 截断）
│   │       │   ├── 版本号 (v{version})
│   │       │   ├── 版本升级提示 (v1.0 → v1.1)
│   │       │   └── 安全分数盾牌 (🛡️ 85)
│   │       ├── npm 包名 / serverId
│   │       ├── 描述文字（2 行截断）
│   │       ├── 标签 tags（最多 3 个）
│   │       ├── 配置提示 (configHint，1 行截断)
│   │       ├── Badge 标签行 + 安装按钮
│   │       │   ├── Badge 排列：
│   │       │   │   ├── 安装方式：npm(红) / pypi(蓝) / sse(橙) / none(灰)
│   │       │   │   ├── 官方(紫) / 零配置(绿) / 需要Key(黄)
│   │       │   │   ├── SSE 风险(红"高风险"/橙"远程服务")
│   │       │   │   ├── 最新(蓝) / 可更新(黄)
│   │       │   │   └── 不可安装项 → opacity:0.5 + grayscale
│   │       │   └── 安装按钮状态机：
│   │       │       ├── not_installed → "安装"(紫) 或 "配置并安装"(黄)
│   │       │       ├── installing   → 旋转 spinner + "安装中"
│   │       │       ├── installed    → "✓ 已安装"(绿)
│   │       │       ├── error        → "安装失败"(红) + 错误摘要
│   │       │       └── 平台不兼容  → "Windows / macOS"(灰，不可点)
│   │       └── Hover: 上移 2px + 蓝色边框 + 阴影
│   │
│   ├── 无限滚动哨兵（IntersectionObserver，rootMargin: 200px）
│   │
│   ├── 重试同步按钮（加载失败或返回空时）
│   │
│   └── 批量配置入口
│       └── "批量配置 API Key" 按钮
│
├── 【详情弹窗】 mcp-detail-modal
│   ├── Backdrop（半透明黑，z-index: 9000）
│   └── Modal（540px，居中，缩放进入动画）
│       ├── 关闭按钮 (×)
│       ├── 头部：emoji + 名称 + 版本 + Badge(官方/零配置/需Key/安全分)
│       ├── 分割线
│       ├── 能力列表（"它能帮你"）
│       ├── SSE 远程服务风险警告（installMethod=sse 时）
│       │   └── 域名 + 未验证警告
│       ├── API Key 警告（需配置时）
│       │   ├── 需要的环境变量列表 (code)
│       │   └── "什么是 API 密钥" 折叠说明
│       ├── 分割线
│       ├── "试一试" 快速提问（examplePrompts 数组）
│       │   └── 点击 → 发送到 chat + 关闭弹窗
│       ├── 分割线
│       ├── 详细信息折叠区（来源/分类/平台/传输方式/工具数/安全审计）
│       ├── 工具列表折叠区（toolNames 用 · 分隔）
│       ├── 分割线
│       └── 底部操作按钮
│           ├── 未安装：  "安装"(紫) 或 "配置并安装"(黄) 或 "手动配置"(黄)+查看源码
│           ├── 安装中：  spinner + "安装中"
│           ├── 已安装：  "已安装 ✓"(绿) + "卸载"(红边)
│           └── 可更新：  "⬆️ 更新"(紫渐变) + "卸载"(红边)
│
├── 【API Key 配置向导】 mcp-config-wizard
│   ├── Backdrop（z-index: 9100）
│   └── Wizard Panel（520px，居中）
│       ├── 关闭按钮
│       ├── 标题 "配置 {name}"
│       ├── 安装方式选择（仅 installable=false 时）
│       │   ├── 单选：SSE / npm / PyPI
│       │   └── 对应输入框（URL / 包名）
│       ├── API Key 注册引导
│       │   ├── configHint 说明
│       │   └── apiKeyGuideUrl 外链
│       ├── 环境变量表单（动态，基于 envSchema）
│       │   ├── 每个字段：key(monospace) + required/optional 标签 + 描述 + password输入框
│       │   └── 🔒 "密钥仅保存在本地"
│       ├── 或：无 env → 提示"查看文档了解配置方式"
│       ├── 连接测试结果（testing/success/error 三态）
│       ├── 操作按钮行
│       │   ├── "测试连接" 按钮
│       │   └── "保存并启用" 按钮
│       └── 高级配置折叠区
│           ├── 额外环境变量表格（KEY + VALUE + 删除 + 添加行）
│           └── 超时时间输入（默认 30s，范围 5-300）
│
├── 【批量 API Key 配置】 mcp-batch-config
│   ├── Backdrop（z-index: 9200）
│   └── Panel（680px，居中）
│       ├── 关闭按钮
│       ├── 标题 + 说明
│       ├── 表格（5 列网格）
│       │   ├── 表头：服务名 / API Key 变量 / 值 / 指南 / 状态
│       │   └── 每行（排序：未配置 → 已配置）
│       │       ├── 名称 + (未安装提示)
│       │       ├── 环境变量名 (monospace, 青色)
│       │       ├── password 输入框 + 明文切换 👁️
│       │       ├── 指南外链 ↗
│       │       └── 状态点（🟢已配置 / 🟡未配置）
│       ├── 保存结果提示（✓ n 已保存 / ✗ n 失败）
│       └── 操作按钮：取消 + 批量保存
│
└── 【Toast 通知】（临时，自动消失）
    └── 安装成功/失败/更新完成 等提示
```

---

## 三、功能区块清单

### 3.1 我的能力（Tab 1: My）

| 功能            | 说明                                                            | 涉及文件                     |
| --------------- | --------------------------------------------------------------- | ---------------------------- |
| 能力初始化      | 5 个内置能力 + `mcp.status` RPC 合并                            | controllers/mcp-lifecycle.ts |
| 内置能力        | filesystem / sqlite / fetch / time / thinking                   | controllers/mcp-lifecycle.ts |
| 状态合并        | 默认能力 + 服务端活跃状态 → mergeCapabilities()                 | controllers/mcp-lifecycle.ts |
| 卡片状态指示    | 5 色圆点 + 标签（ready/needs_config/paused/fixing/unavailable） | views/extensions-card.ts     |
| 卡片点击        | needs_config → 配置向导；ready → 发送 examplePrompt 到 chat     | views/extensions-card.ts     |
| 配置并启用      | 打开 mcp-config-wizard + 启用中 spinner                         | views/extensions-card.ts     |
| 卸载            | confirm 确认 → onUninstall（仅非内置能力）                      | views/extensions-card.ts     |
| 试一试          | 点击发送 examplePrompt 或 fallback 提示到 chat                  | views/extensions-card.ts     |
| 更新通知        | 检测 isNew 能力 → 显示数量 + 名称                               | controllers/mcp-lifecycle.ts |
| 进程监控        | 状态/内存/工具数/错误                                           | views/extensions-page.ts     |
| 重启 MCP Server | `mcp.restart` RPC + 刷新状态                                    | controllers/mcp-lifecycle.ts |
| 禁用/启用       | `mcp.disable` / `mcp.enable` RPC                                | controllers/mcp-lifecycle.ts |
| 测试连接        | `mcp.marketplace.testConnection` RPC → success/failed           | controllers/mcp-lifecycle.ts |
| 检查更新        | `mcp.sync` RPC + 重新初始化                                     | controllers/mcp-lifecycle.ts |
| 运行上限        | MCP_MAX_RUNNING = 7，超限提示                                   | views/mcp-shared.ts          |
| 手动添加        | 高级用户：id/command/args/transport/env/url/headers             | views/extensions-page.ts     |

### 3.2 能力商店（Tab 2: Store）

| 功能            | 说明                                                | 涉及文件                      |
| --------------- | --------------------------------------------------- | ----------------------------- |
| 加载列表        | `mcp.marketplace.list` RPC（分页）                  | controllers/mcp-lifecycle.ts  |
| 搜索            | 300ms 防抖，search 参数传服务端                     | views/extensions-page.ts      |
| 分类筛选        | 11 个 Chips（含 all），传服务端 category            | views/mcp-shared.ts           |
| 排序            | 4 种（recommended/newest/name/popular）客户端排序   | views/mcp-shared.ts           |
| 个性化推荐      | `mcp.marketplace.recommend` RPC（可选）             | controllers/mcp-lifecycle.ts  |
| 安装            | `mcp.marketplace.install` RPC + 乐观更新            | controllers/mcp-lifecycle.ts  |
| 需 API Key 安装 | 先打开 config-wizard 填 env → 安装                  | views/extensions-page.ts      |
| 手动配置安装    | installable=false → 选 SSE/npm/pypi → 填地址 → 安装 | views/mcp-config-wizard.ts    |
| 卸载            | `mcp.marketplace.uninstall` RPC + 乐观回退          | controllers/mcp-lifecycle.ts  |
| 更新            | `mcp.marketplace.update` RPC + 清 hasUpdate 标记    | controllers/mcp-lifecycle.ts  |
| 详情查看        | `mcp.marketplace.detail` RPC → 弹窗                 | controllers/mcp-lifecycle.ts  |
| 无限滚动        | IntersectionObserver + loadMore 追加下一页          | views/extensions-page.ts      |
| 平台兼容        | 检测当前 OS，不兼容项显示灰色不可安装               | views/mcp-marketplace-card.ts |
| SSE 风险提示    | 未验证 → "高风险"红标；已验证 → "远程服务"橙标      | views/mcp-marketplace-card.ts |
| 批量配置        | `mcp.servers.batchUpdateEnv` RPC                    | controllers/mcp-lifecycle.ts  |
| 服务器列表      | `mcp.servers.list` RPC（env 配置状态）              | controllers/mcp-lifecycle.ts  |
| 重试同步        | 加载失败/空结果时显示重试按钮                       | views/extensions-page.ts      |

---

## 四、控制器层

### 4.1 状态属性

```typescript
// === Tab 1: 能力管理 ===
mcpCapabilities: McpCapability[]              // 能力列表（内置 + 用户安装）
mcpAdvancedOpen: boolean                      // 高级设置展开
mcpUpdateNotice: { count; names[] } | null    // 更新通知
mcpProcesses: McpProcessInfo[]                // 进程列表
mcpTestingServerId: string | null             // 正在测试的 server
mcpTestResults: Record<string, "success" | "failed"> // 测试结果缓存
mcpEnablingServerId: string | null            // 正在启用的 server
mcpManualFormTrigger: number                  // 手动添加表单触发计数

// === Tab 切换 ===
mcpExtTab: McpExtensionsTab                   // "my" | "store"

// === Tab 2: 能力商店 ===
mcpMarketplace: McpMarketplaceState
// McpMarketplaceState 展开：
{
  items: McpMarketplaceItem[]                 // 当前页商品列表
  loading: boolean                            // 首次加载中
  loadingMore: boolean                        // 加载下一页中
  error: string | null                        // 错误信息
  search: string                              // 搜索关键词
  activeCategory: string                      // 当前分类
  sort: "recommended" | "newest" | "name" | "popular"
  page: number                                // 当前页码
  pageSize: number                            // 每页条数
  total: number                               // 商品总数
  totalPages: number                          // 总页数
  recommendations: McpMarketplaceItem[]       // 个性化推荐
  detailItem: McpMarketplaceItem | null       // 详情弹窗当前项
  configTarget: McpMarketplaceItem | null     // 配置向导当前项
  showBatchConfig: boolean                    // 批量配置弹窗
  showFirstVisit: boolean                     // 首次访问引导
}
```

### 4.2 核心方法

| 方法                               | 文件                         | 功能                                   |
| ---------------------------------- | ---------------------------- | -------------------------------------- |
| `initMcpCapabilities()`            | controllers/mcp-lifecycle.ts | 初始化（5 内置 + 服务端合并）          |
| `restartMcpServer()`               | controllers/mcp-lifecycle.ts | 重启 + 刷新                            |
| `disableMcpServer()`               | controllers/mcp-lifecycle.ts | 禁用                                   |
| `enableMcpServer()`                | controllers/mcp-lifecycle.ts | 启用                                   |
| `testMcpServer()`                  | controllers/mcp-lifecycle.ts | 测试连接（可传 env）                   |
| `checkMcpUpdate()`                 | controllers/mcp-lifecycle.ts | 同步 + 刷新                            |
| `handleConfigClick()`              | controllers/mcp-lifecycle.ts | 跳转配置页                             |
| `loadMarketplaceItems()`           | controllers/mcp-lifecycle.ts | 加载商店列表（page 1）                 |
| `loadMoreMarketplaceItems()`       | controllers/mcp-lifecycle.ts | 追加下一页                             |
| `loadMarketplaceRecommendations()` | controllers/mcp-lifecycle.ts | 个性化推荐                             |
| `installMarketplaceItem()`         | controllers/mcp-lifecycle.ts | 安装（乐观更新，支持 env + overrides） |
| `uninstallMarketplaceItem()`       | controllers/mcp-lifecycle.ts | 卸载（乐观回退）                       |
| `updateMarketplaceItem()`          | controllers/mcp-lifecycle.ts | 更新到最新版                           |
| `loadMarketplaceDetail()`          | controllers/mcp-lifecycle.ts | 加载详情数据                           |
| `batchUpdateMcpServerEnv()`        | controllers/mcp-lifecycle.ts | 批量更新 env                           |
| `fetchServerEnvStatus()`           | controllers/mcp-lifecycle.ts | 获取 env 配置状态                      |

### 4.3 控制器回调模式

```typescript
// MCP Lifecycle 采用回调模式，不直接修改状态：
type McpLifecycleCallbacks = {
  onStateChange: (patch: Partial<McpLifecycleState>) => void;
};

// Marketplace 同理：
type MarketplaceCallbacks = {
  onStateChange: (patch: Partial<McpMarketplaceState>) => void;
};

// 宿主（app.ts）收到 patch 后合并到 @state 触发重渲染
```

---

## 五、Gateway 接口清单

### 5.1 MCP 生命周期 RPC

| 方法          | 参数     | 返回值                            | 实现状态                                 |
| ------------- | -------- | --------------------------------- | ---------------------------------------- |
| `mcp.status`  | `{}`     | `{ capabilities[], processes[] }` | ⚠️ 未实现（catch 降级到 5 个内置默认值） |
| `mcp.restart` | `{ id }` | void                              | ⚠️ 未实现                                |
| `mcp.disable` | `{ id }` | void                              | ⚠️ 未实现                                |
| `mcp.enable`  | `{ id }` | void                              | ⚠️ 未实现                                |
| `mcp.sync`    | `{}`     | void                              | ⚠️ 未实现                                |

### 5.2 MCP 商店 RPC

| 方法                             | 参数                                                                             | 返回值                                           | 实现状态  |
| -------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------ | --------- |
| `mcp.marketplace.list`           | `{ page, pageSize, search?, category? }`                                         | `{ items[], total, page, pageSize, totalPages }` | ⚠️ 未实现 |
| `mcp.marketplace.recommend`      | `{}`                                                                             | `{ items[] }`                                    | ⚠️ 未实现 |
| `mcp.marketplace.install`        | `{ serverId, env?, overrideSseUrl?, overrideNpmPackage?, overridePypiPackage? }` | `{ ok, connected?, connectError? }`              | ⚠️ 未实现 |
| `mcp.marketplace.uninstall`      | `{ serverId }`                                                                   | void                                             | ⚠️ 未实现 |
| `mcp.marketplace.update`         | `{ serverId }`                                                                   | void                                             | ⚠️ 未实现 |
| `mcp.marketplace.detail`         | `{ serverId }`                                                                   | `McpMarketplaceItem`                             | ⚠️ 未实现 |
| `mcp.marketplace.testConnection` | `{ serverId, env? }`                                                             | `{ ok, toolCount?, error? }`                     | ⚠️ 未实现 |

### 5.3 MCP Server 管理 RPC

| 方法                         | 参数                         | 返回值                                 | 实现状态  |
| ---------------------------- | ---------------------------- | -------------------------------------- | --------- |
| `mcp.servers.list`           | `{}`                         | `{ servers: [{ id, envConfigured }] }` | ⚠️ 未实现 |
| `mcp.servers.batchUpdateEnv` | `{ updates: [{ id, env }] }` | `{ results: [{ id, ok }] }`            | ⚠️ 未实现 |

### 5.4 WebSocket 事件

（MCP 页面当前无专属 WS 事件，状态通过 RPC 轮询获取。）

---

## 六、核心数据类型

```typescript
// ── 能力状态 ──
type McpCapabilityStatus = "ready" | "needs_config" | "paused" | "fixing" | "unavailable";

// ── 单个能力（"我的能力"卡片） ──
type McpCapability = {
  id: string; // 稳定标识（如 "filesystem"）
  friendlyName: string; // 显示名称
  status: McpCapabilityStatus;
  description: string[]; // 功能描述列表（bullet points）
  examplePrompt: string; // "试一试" 提示语
  configNeeded?: string; // 需要配置的 env key 名
  isNew?: boolean; // 是否新发现
  isBuiltin?: boolean; // 是否内置（不可卸载）
};

// ── 进程信息 ──
type McpProcessInfo = {
  id: string;
  friendlyName: string;
  status: "running" | "stopped" | "error";
  memoryMB: number;
  toolCount: number;
  error?: string;
};

// ── 商店商品 ──
type McpMarketplaceItem = {
  serverId: string; // 唯一标识
  friendlyName: string; // 显示名称
  friendlyNameCn?: string; // [CN] 中文名
  description: string;
  descriptionCn?: string; // [CN] 中文描述
  category: string; // 分类 key
  tags: string[]; // 标签数组
  version: string; // 当前版本
  npmPackage?: string; // npm 包名
  pypiPackage?: string; // pypi 包名
  sseUrl?: string; // SSE 端点 URL
  sourceUrl?: string; // 源码地址
  securityScore: number; // 安全分数 (0-100)
  requiresApiKey: boolean; // 是否需要 API Key
  apiKeyName?: string; // API Key 环境变量名
  apiKeyGuideUrl?: string; // API Key 申请指南 URL
  envSchema?: Record<
    string,
    {
      // 多环境变量表单定义
      description?: string;
      placeholder?: string;
      required?: boolean;
    }
  >;
  envRequired?: string[]; // 必填环境变量列表
  platforms: string[]; // 支持平台 ["windows", "macos", "linux"]
  isOfficial: boolean; // 官方认证
  isNew: boolean; // 新上架
  isVerified?: boolean; // SSE 已验证
  isHosted?: boolean; // 托管服务
  installable?: boolean; // false = 不可自动安装（需手动配置）
  toolCount: number; // 提供的工具数量
  toolNames?: string[]; // 工具名称列表
  capabilities?: string[]; // 能力描述列表
  examplePrompts?: string[]; // "试一试" 提示语数组
  configHint?: string; // 配置说明提示
  installStatus: "not_installed" | "installing" | "installed" | "error";
  installMethod: "npm" | "pypi" | "sse" | "none";
  hasUpdate?: boolean; // 有新版本
  installedVersion?: string; // 已安装版本
  errorMessage?: string; // 安装错误信息
};

// ── Tab 类型 ──
type McpExtensionsTab = "my" | "store";

// ── Toast ──
type McpToast = {
  message: string;
  type: "success" | "error" | "info";
};
```

---

## 七、子组件清单

| 组件             | 文件                          | 导出函数                                     | 功能                        |
| ---------------- | ----------------------------- | -------------------------------------------- | --------------------------- |
| **主页面**       | views/extensions-page.ts      | `renderExtensions()`                         | 双 Tab 布局 + 弹窗入口      |
| **能力卡片**     | views/extensions-card.ts      | `renderExtensionsCard()`                     | 单个已安装能力              |
| **商品卡片**     | views/mcp-marketplace-card.ts | `renderMarketplaceCard()`                    | 商店单个商品                |
| **详情弹窗**     | views/mcp-detail-modal.ts     | `renderMcpDetailModal()`                     | 商品详情 + 安装/卸载        |
| **配置向导**     | views/mcp-config-wizard.ts    | `renderMcpConfigWizard()`                    | API Key 配置 + 测试连接     |
| **批量配置**     | views/mcp-batch-config.ts     | `renderMcpBatchConfig()`                     | 多 Server 统一配 Key        |
| **共享常量**     | views/mcp-shared.ts           | `MCP_CATEGORIES`, `filterMarketplaceItems()` | 11 分类 + 排序逻辑          |
| **工具调用卡片** | views/mcp-tool-card.ts        | —                                            | 聊天中 MCP 工具调用结果展示 |

---

## 八、事件系统

### 8.1 页面事件绑定

| 元素          | 事件                 | 处理逻辑                                                      |
| ------------- | -------------------- | ------------------------------------------------------------- |
| Tab 按钮      | @click               | 切换 mcpExtTab("my"/"store") + 懒加载商店数据                 |
| 能力卡片      | @click               | needs_config → 配置向导 / 其他 → 试一试                       |
| 配置按钮      | @click               | onConfigClick → 打开配置向导                                  |
| 卸载按钮      | @click               | confirm() → onUninstall                                       |
| 试一试按钮    | @click               | onTrySay(prompt) → 跳转 chat                                  |
| 高级设置      | @click               | onToggleAdvanced                                              |
| 进程-重启     | @click               | onRestart(serverId)                                           |
| 进程-禁用     | @click               | onDisable(serverId)                                           |
| 进程-启用     | @click               | onEnable(serverId)                                            |
| 进程-测试     | @click               | onTest(serverId)                                              |
| 检查更新      | @click               | onCheckUpdate()                                               |
| 商店搜索      | @input               | debouncedSearch(300ms) → onSearchChange                       |
| 分类 Chip     | @click               | onCategoryChange(category)                                    |
| 排序选择      | @change              | onSortChange(sort)                                            |
| 商品卡片      | @click               | onOpenDetail(item) → 打开详情弹窗                             |
| 安装按钮      | @click               | onInstall(item)（零配置）或 onOpenConfigWizard(item)（需Key） |
| 详情-安装     | @click               | onInstall                                                     |
| 详情-卸载     | @click               | confirm → onUninstall + 关闭弹窗                              |
| 详情-更新     | @click               | onUpdate + 关闭弹窗                                           |
| 详情-试一试   | @click               | onTrySay + 关闭弹窗                                           |
| 详情-关闭     | @click / backdrop    | onCloseDetail                                                 |
| 向导-测试     | @click               | 收集 env → onTestConnection                                   |
| 向导-保存     | @click               | 收集 env+overrides → onSaveAndEnable + 关闭                   |
| 向导-关闭     | @click / backdrop    | onCloseConfigWizard                                           |
| 批量-保存     | @click               | collectUpdates() → onSaveAll                                  |
| 批量-关闭     | @click / backdrop    | onCloseBatchConfig                                            |
| 滚动哨兵      | IntersectionObserver | onLoadMore()                                                  |
| 首次引导-关闭 | @click               | onDismissFirstVisit                                           |

### 8.2 回调接口 (ExtensionsPageProps)

```typescript
{
  // Tab 1: 我的能力
  capabilities: McpCapability[];
  processes: McpProcessInfo[];
  updateNotice: { count: number; names: string[] } | null;
  advancedOpen: boolean;
  testingServerId: string | null;
  testResults: Record<string, "success" | "failed">;
  enablingServerId?: string | null;
  runningCount: number;
  onRestart: (serverId: string) => void;
  onDisable: (serverId: string) => void;
  onEnable: (serverId: string) => void;
  onTest: (serverId: string, env?: Record<string, string>) => void;
  onCheckUpdate: () => void;
  onToggleAdvanced: () => void;
  onConfigClick: (capabilityId: string) => void;
  onTrySay: (prompt: string) => void;
  onViewUpdate?: () => void;
  onUninstall: (serverId: string) => void;
  onManualAdd?: (config: { id, command, args, transport, env?, url?, headers? }) => Promise<boolean>;

  // Tab 切换
  activeTab: McpExtensionsTab;
  onTabChange: (tab: McpExtensionsTab) => void;

  // Tab 2: 能力商店
  marketplace: McpMarketplaceState;
  onSearchChange: (search: string) => void;
  onCategoryChange: (category: string) => void;
  onSortChange: (sort: string) => void;
  onOpenDetail: (item: McpMarketplaceItem) => void;
  onCloseDetail: () => void;
  onInstall: (item: McpMarketplaceItem) => void;
  onUpdate: (serverId: string) => void;
  onOpenConfigWizard: (item: McpMarketplaceItem) => void;
  onCloseConfigWizard: () => void;
  onLoadMore?: () => void;
  onRetrySync?: () => void;
  onDismissFirstVisit: () => void;
  onDismissRecommendation: () => void;

  // 批量配置
  onOpenBatchConfig?: () => void;
  onCloseBatchConfig?: () => void;
  onSaveBatchConfig?: (updates: Array<{ serverId: string; env: Record<string, string> }>) => void;
  batchConfigSaving?: boolean;
  batchConfigResult?: { success: number; failed: number } | null;
  serverEnvStatus?: Record<string, Record<string, boolean>>;

  // 已安装 Server 的 env 更新
  onUpdateServerEnv?: (serverId: string, env: Record<string, string>) => void;

  // Toast
  toast: McpToast | null;
}
```

---

## 九、完整数据流

### 9.1 能力初始化流程

```
Gateway 连接成功（onHello）
    ↓
initMcpCapabilities(client, callbacks)
├─ buildDefaultCapabilities()
│   └─ 5 个内置：filesystem / sqlite / fetch / time / thinking
│      每个带 i18n 翻译的 friendlyName + description + examplePrompt
├─ client.request("mcp.status")
│   ├─ 成功 → mergeCapabilities(defaults, live)
│   │   ├─ 内置能力：用 live.status 覆盖默认 status
│   │   └─ 用户安装：追加到列表（isBuiltin=false）
│   └─ 失败 → 静默降级到 5 个默认（不报错）
├─ 检测 isNew → updateNotice = { count, names }
└─ callbacks.onStateChange({ capabilities, processes, updateNotice })
```

### 9.2 商店安装流程（零配置）

```
用户在商店点击 "安装"
    ↓
installMarketplaceItem(client, item, undefined, callbacks)
├─ 乐观更新：item.installStatus = "installing"
├─ client.request("mcp.marketplace.install", { serverId })
│   ├─ 成功：item.installStatus = "installed"
│   │   └─ 返回 { ok:true, connected?, connectError? }
│   └─ 失败：item.installStatus = "error" + errorMessage
│       └─ 返回 { ok:false, connectError }
└─ 宿主刷新能力列表：initMcpCapabilities()
```

### 9.3 商店安装流程（需 API Key）

```
用户在商店点击 "配置并安装"
    ↓
onOpenConfigWizard(item) → marketplace.configTarget = item
    ↓
mcp-config-wizard 渲染
├─ 用户填写 env fields
├─ 可选：点击 "测试连接"
│   └─ testMcpServer(client, serverId, env) → { ok, toolCount?, error? }
└─ 点击 "保存并启用"
    ↓
收集 env + overrides
    ↓
已安装？→ onUpdateServerEnv(serverId, env) → 更新 env + 重启
未安装？→ onInstall({ ...item, _env: env, _overrides: overrides })
    ↓
installMarketplaceItem(client, item, env, callbacks, overrides)
├─ 同 9.2 流程
└─ 关闭向导
```

### 9.4 卸载流程

```
用户在详情弹窗点击 "卸载"
    ↓
confirm("确定卸载 {name}？")
    ↓ 确认
uninstallMarketplaceItem(client, serverId, callbacks)
├─ 乐观更新：item.installStatus = "not_installed"
├─ client.request("mcp.marketplace.uninstall", { serverId })
│   ├─ 成功：保持 not_installed 状态
│   └─ 失败：回退到 "installed" + re-throw
└─ 关闭弹窗
```

### 9.5 懒加载商店

```
用户切换到 "能力商店" tab
    ↓
onTabChange("store")
├─ mcpExtTab = "store"
├─ 检查 marketplace.items.length === 0 && !loading
│   └─ true → loadMarketplaceItems(client, callbacks, { pageSize: 50 })
│           + loadMarketplaceRecommendations(client, callbacks)
└─ 后续滚动 → IntersectionObserver → loadMoreMarketplaceItems()
```

---

## 十、性能优化点

| 优化                | 说明                                                        |
| ------------------- | ----------------------------------------------------------- |
| 懒加载商店          | 切到 store tab 才加载，my tab 不触发商店请求                |
| 搜索防抖            | 300ms debounce，避免每按键触发 RPC                          |
| 乐观更新            | 安装/卸载/更新立即更新 UI，失败回退                         |
| 无限滚动            | IntersectionObserver（rootMargin: 200px），替代 scroll 事件 |
| 分页限制            | pageSize=50，按需加载下一页                                 |
| mcp.status 静默降级 | 未实现时用默认值，不阻塞页面渲染                            |
| 客户端排序          | 服务端返回后客户端排序，避免重复 RPC                        |
| WeakMap 观察者      | IntersectionObserver 用 WeakMap 管理，防止内存泄漏          |

---

## 十一、安全机制

| 机制         | 说明                                                 |
| ------------ | ---------------------------------------------------- |
| API Key 脱敏 | 所有 env 输入框 type="password"                      |
| 本地存储声明 | 向导底部显示 🔒 "密钥仅保存在本地"                   |
| 安全分数     | 卡片显示 securityScore 盾牌（≥60 才显示）            |
| 平台兼容检查 | 安装前校验 platforms 包含当前 OS                     |
| SSE 风险警告 | 未验证 SSE → 红色"高风险"标签 + 详情中域名警告       |
| 卸载确认     | confirm() 二次确认                                   |
| 环境变量隔离 | env 通过 Gateway RPC 传递，不暴露到前端持久存储      |
| 连接测试     | 安装前后可测试，验证功能正常                         |
| 进程内存监控 | processes 列表显示 memoryMB                          |
| 运行上限     | MCP_MAX_RUNNING=7，防止资源耗尽                      |
| DOM 安全创建 | 额外 env 行用 createElement 而非 innerHTML（防 XSS） |

---

## 十二、CSS 样式结构

```
styles/ 中相关样式（具体位置需确认）
├── .extensions-page              — 页面容器
├── .ext-cap-card                 — 能力卡片（内联样式为主）
│   ├── :hover → translateY(-1px) + shadow-md + border-strong
│   └── :active → translateY(0)
├── .mcp-store-card               — 商店卡片
│   └── :hover → translateY(-2px) + accent 边框
├── .ext-try-say-btn              — "试一试"按钮
│   └── :hover → 加深背景 + 加深边框
├── .mcp-modal-close              — 弹窗关闭按钮 :hover
├── .mcp-prompt-btn               — 详情弹窗"试一试"按钮 :hover
├── .mcp-wiz-close                — 向导关闭按钮 :hover
├── .batch-cfg-close              — 批量配置关闭按钮 :hover
├── .batch-key-input:focus        — 焦点边框色
└── .mcp-key-input:focus          — 焦点边框色

关键动画：
├── extCardSpin       — 能力卡片启用中旋转
├── mcpSpin           — 商品安装中旋转
├── mcpModalBgIn      — 详情弹窗背景淡入
├── mcpModalIn        — 详情弹窗缩放进入
├── mcpWizBgIn        — 向导背景淡入
├── mcpWizIn          — 向导缩放进入
├── batchCfgBgIn      — 批量配置背景淡入
├── batchCfgIn        — 批量配置缩放进入
└── batchCfgSpin      — 批量保存旋转

注：当前组件大量使用内联 style，CSS 文件较少。
    改版时可以抽取为独立 CSS 类以便管理。
```

---

## 十三、改版注意事项

### ✅ 可以安全替换的（仅视觉）

- 能力卡片样式（ext-cap-card 的内联样式）
- 商品卡片样式（mcp-store-card 的内联样式）
- Tab 按钮样式
- 分类 Chips 样式和 emoji
- 搜索框、按钮、Badge 外观
- 弹窗外观（保留结构）
- 统计信息栏布局
- 颜色主题、图标、间距
- 动画效果
- 网格列数和响应式断点

### ⚠️ 替换时需保留接线的

- 所有 `@click`, `@input`, `@change` 事件绑定
- 所有 `${props.xxx}` 数据绑定
- 安装状态机逻辑（not_installed/installing/installed/error 四态）
- 能力状态判断（ready/needs_config/paused/fixing/unavailable）
- IntersectionObserver 哨兵元素（无限滚动）
- debouncedSearch 防抖逻辑
- collectEnvFields() 表单收集（class="mcp-env-field" + data-env-key）
- collectUpdates() 批量收集（data-batch-server-id + data-batch-key-name）
- 弹窗的 backdrop click-to-close + stopPropagation
- 平台兼容检查 isPlatformCompatible()

### ❌ 不能动的（核心逻辑）

- controllers/mcp-lifecycle.ts — 所有 RPC 调用和回调模式
- views/mcp-shared.ts — MCP_CATEGORIES 定义 + filterMarketplaceItems() 排序逻辑
- app-view-state.ts 中所有 Mcp\* 类型定义
- initMcpCapabilities() 的 5 内置能力注册和 mergeCapabilities() 合并逻辑

---

## 十四、接口实现缺口分析

### 现状总结

| 层                  | 状态                                            |
| ------------------- | ----------------------------------------------- |
| **前端视图**        | ✅ 完整（extensions-page.ts + 6 个子组件）      |
| **前端控制器**      | ✅ 完整（controllers/mcp-lifecycle.ts, 724 行） |
| **上游 Gateway**    | ❌ 0/14 方法（上游完全没有 MCP 管理 RPC）       |
| **cn-adapter 桥接** | ❌ 0/14 方法                                    |

### 需要 cn-adapter 实现的 14 个 RPC（按优先级）

#### P0: 基础功能（页面能正常显示已有能力）

| 方法          | 难度 | 说明                                         |
| ------------- | ---- | -------------------------------------------- |
| `mcp.status`  | 低   | 读取 .mcp.json 配置 + 查询各 server 进程状态 |
| `mcp.restart` | 中   | 停止 + 重新启动指定 MCP server 进程          |
| `mcp.disable` | 低   | 标记为 disabled（修改配置）                  |
| `mcp.enable`  | 低   | 标记为 enabled + 启动                        |
| `mcp.sync`    | 低   | 触发配置重新扫描                             |

#### P1: 商店功能（能浏览和安装新能力）

| 方法                             | 难度 | 说明                                            |
| -------------------------------- | ---- | ----------------------------------------------- |
| `mcp.marketplace.list`           | 中   | 需要 MCP 索引数据源（Gitee/自建）               |
| `mcp.marketplace.install`        | 高   | npm/pypi/sse 三种安装方式 + 写 .mcp.json + 启动 |
| `mcp.marketplace.uninstall`      | 中   | 停进程 + 清 .mcp.json + 可选清包                |
| `mcp.marketplace.testConnection` | 中   | 启动临时进程 + tools/list 验证                  |
| `mcp.servers.list`               | 低   | 列出所有配置的 servers + env 配置状态           |

#### P2: 进阶功能

| 方法                         | 难度 | 说明                    |
| ---------------------------- | ---- | ----------------------- |
| `mcp.marketplace.detail`     | 低   | 从索引返回单项详情      |
| `mcp.marketplace.update`     | 中   | 版本比对 + 更新安装     |
| `mcp.marketplace.recommend`  | 中   | 基于已安装能力生成推荐  |
| `mcp.servers.batchUpdateEnv` | 低   | 批量写 env 到 .mcp.json |

---

## 十五、Figma 改版对接检查清单

### Tab 1: 我的能力

- [ ] 5 个内置能力卡片渲染正确
- [ ] 状态指示灯 5 色正确（绿/黄/灰/蓝/红）
- [ ] 状态标签文字正确（就绪/需配置/已暂停/修复中/不可用）
- [ ] [New] 标签正确显示
- [ ] "它能帮你" 功能描述列表
- [ ] "配置并启用" 按钮（needs_config 时 + 启用中 spinner）
- [ ] "卸载" 按钮（非内置能力）
- [ ] "试一试" 行（💬 + 提示语 + 点击跳转 chat）
- [ ] 卡片 hover 效果（上移 + 阴影 + 边框）
- [ ] 更新通知条
- [ ] 统计信息（运行中/已停止/工具数）
- [ ] 高级设置折叠（进程列表）
- [ ] 运行上限提示（>7 时）

### Tab 2: 能力商店

- [ ] 搜索框 + 300ms 防抖
- [ ] 11 个分类 Chips（emoji + 文字）
- [ ] 4 种排序切换
- [ ] 商品卡片完整渲染
  - [ ] 分类 emoji 图标
  - [ ] 名称 + 版本 + 安全分数
  - [ ] 描述 2 行截断
  - [ ] 标签 tags（最多 3 个）
  - [ ] Badge 行（安装方式 + 官方 + 零配置/需Key + SSE风险 + 最新 + 可更新）
  - [ ] 安装按钮 4 态（未安装/安装中/已安装/失败）
  - [ ] 平台不兼容 → 灰色不可点
  - [ ] 不可安装项 → opacity:0.5
- [ ] 无限滚动正常
- [ ] 空状态/加载状态/错误状态
- [ ] 重试同步按钮

### 弹窗系统

- [ ] 详情弹窗（backdrop + 540px modal + 缩放动画）
  - [ ] 完整信息展示
  - [ ] SSE 风险警告
  - [ ] API Key 警告 + "什么是 API 密钥" 折叠
  - [ ] "试一试" 快速提问
  - [ ] 详细信息/工具列表折叠
  - [ ] 底部操作按钮（安装/卸载/更新/关闭）
- [ ] 配置向导（520px，API Key 表单）
  - [ ] 安装方式选择（SSE/npm/PyPI）
  - [ ] 动态 env 表单（envSchema 驱动）
  - [ ] 测试连接（testing/success/error 三态）
  - [ ] 保存并启用
  - [ ] 高级配置（额外 env 行 + 超时）
- [ ] 批量配置（680px，5 列表格）
  - [ ] 排序：未配置优先
  - [ ] 明文/密文切换
  - [ ] 指南外链
  - [ ] 状态点（绿/黄）
  - [ ] 批量保存 + 结果

### 通用

- [ ] Tab 切换 + 懒加载商店
- [ ] 首次访问引导
- [ ] Toast 通知
- [ ] Backdrop click-to-close
- [ ] 所有动画流畅（进入/spinner/hover）

---

## 十六、落地流程

### Phase 1: 页面逻辑现状梳理（本文档）✅

### Phase 2: Figma 设计稿引入 + 审核优化

1. 对比本文档第二章布局树，确认设计稿覆盖所有功能区块
2. 重点审核：安装状态机 4 态、5 色能力状态、弹窗系统 3 个
3. 确认空状态/加载态/错误态的设计
4. 输出设计审核报告

### Phase 3: 前端落地（样式替换）

1. 抽取内联样式为独立 CSS 类
2. 替换卡片、弹窗、Chips 样式
3. 保留所有事件绑定和数据绑定（参考第十三章 ⚠️ 列表）
4. 响应式适配

### Phase 4: 接口接入（cn-adapter）

1. 实现 P0 接口（mcp.status/restart/disable/enable/sync）
2. 实现 P1 接口（marketplace.list/install/uninstall/testConnection/servers.list）
3. ui-bridge.ts 注册新方法
4. 联调前端 ↔ Gateway

### Phase 5: 测试

1. 对照第十五章检查清单逐项验证（40+ 检查项）
2. 异常测试（RPC 超时/安装失败/网络断开/卸载回退）
3. Desktop Tauri 壳内测试
