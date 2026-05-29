# Skills 技能页面完整梳理文档

> 用于 UI 改版参考。梳理现有 skills 技能页面的所有功能区块、控制器逻辑、Gateway 接口、子组件和事件系统。
> 生成日期：2026-03-09

---

## 一、页面整体结构（HTML 布局）

```
<section class="card skills">
│
├── 【Tab 切换栏】
│   ├── Tab: 技能管理 (local)    — 本地技能列表 + 分层管理
│   ├── Tab: 技能市场 (market)   — SQLite FTS5 搜索 + 分页
│   └── Tab 右侧统计摘要          — 核心/就绪/待配置 计数
│
├── 【技能管理 Tab (local)】
│   ├── 搜索栏                    — 本地过滤输入框 + 已过滤计数
│   ├── 错误通知                  — skillsError 提示
│   ├── 三层分组列表
│   │   ├── ⭐ 核心技能 (core)   — 注入 LLM prompt 的技能
│   │   │   ├── 计数器            — coreCount/coreMax (50上限)
│   │   │   ├── 限制/警告提示      — 达上限红色 / 超30黄色提醒
│   │   │   ├── Drop Zone         — 拖放目标（从就绪拖入）
│   │   │   └── 技能卡片网格      — 可拖拽卡片（drag handle + 内容）
│   │   │       ├── 图标+名称+Badge
│   │   │       ├── 描述（2行截断）
│   │   │       ├── 缺失依赖列表
│   │   │       ├── 操作栏（移出核心/禁用/安装）
│   │   │       ├── 安装进度条（实时WS推送）
│   │   │       ├── 消息提示（成功/错误）
│   │   │       └── API Key 输入（primaryEnv 时显示）
│   │   │
│   │   ├── ✅ 就绪技能 (ready)  — 依赖满足，可激活
│   │   │   ├── Drop Zone         — 拖放目标（从核心拖回）
│   │   │   └── 技能卡片网格      — 可拖拽卡片
│   │   │       └── 操作栏（加入核心/禁用/安装）
│   │   │
│   │   ├── 🔧 需要配置 (needs-config) — 缺少依赖/被禁用
│   │   │   └── 技能卡片网格      — 静态卡片
│   │   │       └── 操作栏（启用/安装依赖）
│   │   │
│   │   └── 🚫 不兼容 (incompatible) — OS 不支持
│   │       └── <details> 折叠      — 默认收起
│   │           └── 技能卡片网格
│   │
│   ├── 分页按钮                  — 每层50条，点「加载更多」
│   ├── 空状态                    — 无技能时引导去市场
│   └── 导入弹窗 (modal)          — 本地技能导入
│       ├── 路径输入               — 支持手动输入 + Enter 跳转
│       ├── Windows 盘符快捷       — C:\, D:\ 等
│       ├── 目录浏览列表           — 含 SKILL.md 标记
│       ├── 技能检测结果           — 单技能/多技能/无技能
│       └── 导入操作               — 引用模式 / 复制模式
│
├── 【技能市场 Tab (market)】
│   ├── ClawHub 官方链接 Banner
│   ├── 工具栏
│   │   ├── 搜索框                 — 300ms 防抖搜索
│   │   ├── 分类标签 (Chips)       — 11类（全部/生产力/AI/开发/数据/...）
│   │   └── 刷新按钮               — 强制从远程拉取
│   ├── 技能卡片网格 (4列响应式)
│   │   └── 市场卡片
│   │       ├── Emoji + 名称 + 质量等级 (S/A/B/C)
│   │       ├── 分类标签
│   │       ├── 描述（2行截断）
│   │       ├── Tags（最多3个）
│   │       ├── CN 不可用提示 + 替代推荐
│   │       └── 安装按钮 / 已安装标记 / 安装进度
│   ├── 无限滚动哨兵              — IntersectionObserver 自动加载
│   ├── 加载中状态                — 骨架屏占位
│   └── 错误/空状态               — 友好提示
│
├── 【全局覆盖层】
│   ├── 技能安装确认弹框           — skill-install-approval
│   │   ├── 技能名称 + 描述
│   │   ├── 缺失依赖清单（bins/env/config）
│   │   ├── 安装步骤预览
│   │   ├── 预估时间
│   │   ├── 国内镜像提示
│   │   └── 操作按钮（安装并继续/仅安装/取消）
│   │
│   ├── 安装进度覆盖层             — skill-install-progress
│   │   ├── CN 镜像 Badge
│   │   ├── 阶段图标 + 阶段标签
│   │   ├── 进度条（shimmer 动画）
│   │   ├── 百分比 + 下载详情（速度/ETA/大小）
│   │   ├── 当前依赖名称
│   │   ├── 安装日志（最多50条）
│   │   └── 完成/失败操作按钮
│   │
│   └── 批量安装系统               — skills-batch-*
│       ├── Banner（缺失技能检测通知）
│       ├── 确认对话框（三层分组：核心/推荐/可选）
│       ├── 批量下载进度
│       │   ├── 整体进度（速度/活跃镜像）
│       │   └── 单技能进度（状态/进度/镜像切换）
│       ├── 完成/部分失败结果
│       └── 失败上报按钮
│
└── 【Agent 技能面板】            — agents-panels-tools-skills
    ├── 工具访问控制（profile 预设 + 单独开关）
    └── 技能白名单管理（分组显示 + 单独开关）
```

---

## 二、功能区块清单

### 2.1 技能管理 (Local Tab)

| 功能         | 说明                                                    | 涉及文件              |
| ------------ | ------------------------------------------------------- | --------------------- |
| 四层分组     | core/ready/needs-config/incompatible 自动分类           | skills-grouping.ts    |
| 拖拽排序     | core ↔ ready 之间拖放，设置/取消核心技能                | views/skills.ts       |
| 核心技能限制 | 最多50个，超30个警告 token 开销                         | controllers/skills.ts |
| 本地搜索     | name/nameZh/description/descriptionZh/source 全字段匹配 | views/skills.ts       |
| 分页加载     | 每层50条，点击加载更多                                  | views/skills.ts       |
| 启用/禁用    | 切换 skill.disabled 状态                                | controllers/skills.ts |
| API Key 管理 | primaryEnv 字段存在时显示密钥输入                       | controllers/skills.ts |
| 安装依赖     | 一键安装缺失依赖（brew/node/go/uv）                     | controllers/skills.ts |
| 安装进度     | 实时 WebSocket 推送进度（stage/percent/message）        | app-gateway.ts        |
| 本地导入     | 浏览文件系统，引用或复制导入 SKILL.md                   | controllers/skills.ts |
| 中文翻译     | 从 skill-translations.json 注入 nameZh/descZh           | data/skill-i18n.ts    |
| 操作消息     | 每个技能独立的 success/error 消息提示                   | controllers/skills.ts |

### 2.2 技能市场 (Market Tab)

| 功能           | 说明                                                                      | 涉及文件              |
| -------------- | ------------------------------------------------------------------------- | --------------------- |
| FTS5 全文搜索  | SQLite 后端搜索，支持中英文                                               | controllers/skills.ts |
| 分类筛选       | 11 个分类标签（全部/生产力/AI/开发/数据/通信/系统/安全/内容/家居/多媒体） | views/skills.ts       |
| 无限滚动       | IntersectionObserver 自动加载下一页（每页20条）                           | views/skills.ts       |
| 质量等级       | S/A/B/C 四档，按 overall_score 降序排列                                   | controllers/skills.ts |
| CN 兼容标记    | cnBlocked=true 时显示警告+替代推荐                                        | views/skills.ts       |
| 乐观更新       | 安装成功后立即标记 installed=true（不等服务端刷新）                       | controllers/skills.ts |
| 安装后自动跳转 | 安装完成1.5s后自动切到「技能管理」Tab                                     | controllers/skills.ts |
| 远程刷新       | 手动触发从远程拉取最新索引                                                | controllers/skills.ts |
| 安装进度动画   | 模拟下载进度（500ms递增10%到80%） + 后端真实进度                          | controllers/skills.ts |
| 300ms 防抖搜索 | 输入框 300ms 延迟触发搜索                                                 | views/skills.ts       |

### 2.3 技能安装审批 (Skill Install Approval)

| 功能         | 说明                                   | 涉及文件                        |
| ------------ | -------------------------------------- | ------------------------------- |
| 安装请求队列 | 多个请求排队，按先进先出处理           | controllers/skill-install.ts    |
| 过期清理     | 自动移除过期的安装请求                 | controllers/skill-install.ts    |
| 缺失依赖展示 | bins/env/config 三类分组展示           | views/skill-install-approval.ts |
| 安装步骤预览 | 有序列表展示安装计划                   | views/skill-install-approval.ts |
| 三选一操作   | 安装并继续对话/仅安装/取消             | views/skill-install-approval.ts |
| 国内镜像提示 | brand.skillMirrorHint 显示镜像提速信息 | views/skill-install-approval.ts |

### 2.4 批量安装系统 (Batch Install)

| 功能          | 说明                                                                | 涉及文件                      |
| ------------- | ------------------------------------------------------------------- | ----------------------------- |
| 缺失检测      | 登录后自动检测缺失核心技能（每 session 一次）                       | controllers/skills-batch.ts   |
| 三层分组确认  | core/recommended/optional 分组，可勾选                              | views/skills-batch-confirm.ts |
| 磁盘空间检查  | 不足时禁用确认按钮                                                  | controllers/skills-batch.ts   |
| 实时进度追踪  | 每技能独立状态（queued/downloading/retrying/verifying/done/failed） | controllers/skills-batch.ts   |
| 镜像切换      | 下载失败自动切换备用镜像                                            | controllers/skills-batch.ts   |
| 速度/大小/ETA | 整体下载速度 + 已下载/总大小                                        | controllers/skills-batch.ts   |
| 失败上报      | 将失败详情上报给后端                                                | controllers/skills-batch.ts   |
| 最小化        | 可最小化为 Pill 悬浮球                                              | views/skills-batch-pill.ts    |
| Banner 持久化 | 关闭 Banner 后后端记住，不再重复弹出                                | controllers/skills-batch.ts   |

### 2.5 Agent 技能面板

| 功能           | 说明                                        | 涉及文件                            |
| -------------- | ------------------------------------------- | ----------------------------------- |
| Agent 技能加载 | 按 agentId 加载技能列表                     | controllers/agent-skills.ts         |
| 技能白名单     | 允许/禁用特定技能（写入 agent config）      | views/agents-panels-tools-skills.ts |
| 工具访问控制   | profile 预设（full/standard 等） + 单独开关 | views/agents-panels-tools-skills.ts |
| 分组显示       | workspace/built-in/installed/extra/other    | views/skills-grouping.ts            |

---

## 三、控制器层（数据 + 逻辑）

### 3.1 主要状态属性 (SkillsState)

```typescript
// === 本地技能 ===
skillsLoading: boolean; // 技能列表加载中
skillsReport: SkillStatusReport | null; // 技能状态报告（skills 数组）
skillsError: string | null; // 错误信息
skillsBusyKey: string | null; // 当前操作中的技能 key
skillEdits: Record<string, string>; // API Key 编辑缓存
skillMessages: SkillMessageMap; // 每技能独立消息 {kind, message}
skillsInstallProgress: Record<string, InstallProgress>; // 安装进度

// === Tab / 过滤 / 分页 ===
skillsActiveTab: SkillsTab; // "active"|"library"|"blocked"|"market"|"mcp-store"
skillsFilter: string; // 本地搜索关键词
skillsMarketKeyword: string; // 市场搜索关键词（与本地分离）
skillsActiveCategory: string; // 市场分类过滤
skillsVisibleCount: number; // 分页可见数量
skillsTierGroupFilter: SkillsTierGroup; // 层级筛选 ("all"|"core"|...)

// === 远程技能 ===
skillsRemoteLoading: boolean;
skillsRemoteIndex: RemoteSkillsIndex | null;
skillsRemoteError: string | null;

// === 技能市场 (JSON 索引) ===
skillsMarketLoading: boolean;
skillsMarketResponse: SkillsMarketResponse | null;
skillsMarketSyncing: boolean;
skillsMarketLastSyncedAt: string | null;
skillsMarketError: string | null;

// === 技能市场 (SQLite 搜索) ===
skillsMarketSearchResult: SkillsMarketSearchResult | null;
skillsMarketPage: number;

// === 本地导入 ===
skillsImportOpen: boolean;
skillsImportPath: string;
skillsImportBrowseResult: BrowseResult | null;
skillsImportLoading: boolean;
skillsImportError: string | null;
skillsImportSuccess: string | null;
```

### 3.2 批量安装状态 (SkillsBatchState)

```typescript
batchPhase: SkillsBatchPhase;        // "idle"|"banner"|"confirm"|"downloading"|"result"|"complete"
batchId: string | null;              // 当前批量任务 ID
batchSkills: SkillBatchItem[];       // 每个技能的安装状态
batchProgress: BatchProgress;        // 整体进度（completed/total/speed/mirror）
batchResult: {                       // 完成结果
  succeeded: string[];
  failed: FailedSkillItem[];
  durationMs: number;
} | null;
batchCheckResult: BatchCheckResult | null; // 缺失检测结果
reportSent: boolean;                 // 失败已上报
batchMinimized: boolean;             // 最小化状态
```

### 3.3 核心方法

| 方法                     | 文件                        | 功能                                                |
| ------------------------ | --------------------------- | --------------------------------------------------- |
| `loadSkills()`           | controllers/skills.ts       | 加载技能列表（skills.status RPC）+ 注入中文翻译     |
| `updateSkillEnabled()`   | controllers/skills.ts       | 启用/禁用技能（skills.update RPC）                  |
| `saveSkillApiKey()`      | controllers/skills.ts       | 保存 API 密钥（skills.update RPC）                  |
| `installSkill()`         | controllers/skills.ts       | 安装技能依赖（skills.install RPC, 120s 超时）       |
| `promoteSkillToCore()`   | controllers/skills.ts       | 置顶为核心技能（50上限校验 + skills.update pinned） |
| `demoteSkillFromCore()`  | controllers/skills.ts       | 取消核心技能（skills.update pinned=false）          |
| `loadRemoteSkills()`     | controllers/skills.ts       | 加载远程技能索引（skills.remote.list RPC）          |
| `installRemoteSkill()`   | controllers/skills.ts       | 安装远程技能（模拟进度 + skills.install + 刷新）    |
| `loadMarketSkills()`     | controllers/skills.ts       | 加载市场列表（skills.market.list RPC, 本地缓存）    |
| `refreshMarketSkills()`  | controllers/skills.ts       | 强制刷新市场（skills.market.refresh RPC）           |
| `searchMarketSkills()`   | controllers/skills.ts       | 搜索市场（skills_marketplace.search RPC, FTS5）     |
| `loadMoreMarketSkills()` | controllers/skills.ts       | 无限滚动追加（累积 items）                          |
| `openSkillImport()`      | controllers/skills.ts       | 打开导入弹窗 + 浏览默认目录                         |
| `browseSkillDir()`       | controllers/skills.ts       | 浏览指定目录（skills.browse RPC）                   |
| `importSkill()`          | controllers/skills.ts       | 导入技能（skills.import RPC, copy/reference 模式）  |
| `checkBatchSkills()`     | controllers/skills-batch.ts | 检测缺失技能（skills.batch.check RPC）              |
| `startBatchInstall()`    | controllers/skills-batch.ts | 启动批量安装（skills.batch.install RPC）            |
| `cancelBatchInstall()`   | controllers/skills-batch.ts | 取消批量安装（skills.batch.cancel RPC）             |
| `handleBatchEvent()`     | controllers/skills-batch.ts | 处理批量安装 WS 事件（progress/complete/error）     |
| `loadAgentSkills()`      | controllers/agent-skills.ts | 加载 Agent 专属技能列表                             |

---

## 四、Gateway 接口清单

### 4.1 RPC 方法（request/response）

| 方法                           | 参数                                                               | 返回值                     | 用途                                       |
| ------------------------------ | ------------------------------------------------------------------ | -------------------------- | ------------------------------------------ |
| `skills.status`                | `{ agentId? }`                                                     | `SkillStatusReport`        | 获取本地技能列表（含状态/依赖/安装选项）   |
| `skills.update`                | `{ skillKey, enabled?, apiKey?, pinned? }`                         | void                       | 更新技能状态（启用/禁用/密钥/置顶）        |
| `skills.install`               | `{ name, installId, timeoutMs:120000 }`                            | `{ ok?, message? }`        | 安装技能依赖                               |
| `skills.browse`                | `{ path? }`                                                        | `BrowseResult`             | 浏览文件系统目录                           |
| `skills.import`                | `{ path, mode:"copy"\|"reference" }`                               | `{ ok, imported[], mode }` | 导入本地技能                               |
| `skills.remote.list`           | `{}`                                                               | `RemoteSkillsIndex`        | 获取远程技能索引                           |
| `skills.market.list`           | `{}`                                                               | `SkillsMarketResponse`     | 获取市场列表（本地缓存索引）               |
| `skills.market.refresh`        | `{}`                                                               | `SkillsMarketResponse`     | 强制刷新市场索引（从远程拉取）             |
| `skills_marketplace.search`    | `{ keyword?, category?, page, pageSize, orderBy, orderDirection }` | `SkillsMarketSearchResult` | SQLite FTS5 搜索市场技能                   |
| `skills.batch.check`           | `{}`                                                               | `BatchCheckResult`         | 检测缺失技能（missing/installed/磁盘空间） |
| `skills.batch.install`         | `{ skills: string[] }`                                             | `{ batch_id? }`            | 启动批量安装任务                           |
| `skills.batch.cancel`          | `{ batch_id }`                                                     | void                       | 取消批量安装                               |
| `skills.batch.report-failures` | `{ failed[]? \| dismiss_banner? }`                                 | void                       | 上报安装失败 / 持久化关闭 Banner           |

### 4.2 WebSocket 事件（broadcast，服务端推送）

| 事件名                                        | payload 结构                                                                                              | 处理逻辑                            |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `skill.install.progress`                      | `{ skillName, stage, message, percent?, downloadInfo? }`                                                  | 更新 skillsInstallProgress 实时进度 |
| `skills.batch.progress` (type=skill.progress) | `{ skill, stage, percent, bytes_downloaded, bytes_total, mirror, retry_mirror, error }`                   | 更新单技能批量安装进度              |
| `skills.batch.progress` (type=batch.progress) | `{ completed, total, bytes_downloaded, bytes_total, speed_bps, active_mirror, active_mirror_latency_ms }` | 更新整体批量进度                    |
| `skills.batch.complete`                       | `{ succeeded[], failed[{skill,error,mirrors_tried}], duration_ms }`                                       | 完成批量安装，显示结果              |
| `skills.batch.error`                          | `{ error }`                                                                                               | 批量安装全局错误                    |
| `skill.install.requested`                     | `{ id, request, createdAtMs, expiresAtMs }`                                                               | 新增安装审批请求到队列              |
| `skill.install.resolved`                      | `{ id, decision, resolvedBy, ts }`                                                                        | 安装请求已被处理（从队列移除）      |

---

## 五、核心类型定义

### 5.1 SkillStatusEntry（单技能状态）

```typescript
type SkillStatusEntry = {
  name: string; // 技能标识名
  nameZh?: string; // 中文名称（从 skill-translations.json 注入）
  description: string; // 英文描述
  descriptionZh?: string; // 中文描述
  source: string; // 来源（openclawcn-bundled/managed/workspace/extra/private）
  filePath: string; // SKILL.md 文件路径
  baseDir: string; // 技能根目录
  skillKey: string; // 唯一标识键
  bundled?: boolean; // 是否内置
  primaryEnv?: string; // 主 API Key 环境变量名
  emoji?: string; // 图标 emoji
  homepage?: string; // 技能主页
  always: boolean; // 系统级强制注入
  pinned: boolean; // 用户置顶（核心技能）
  disabled: boolean; // 是否已禁用
  eligible: boolean; // 是否满足全部条件可激活
  activeInPrompt: boolean; // 是否已注入 LLM prompt
  cnDeprioritized?: boolean; // CN 降级标记
  // 依赖声明
  requirements: { bins: string[]; env: string[]; config: string[]; os: string[] };
  // 缺失依赖
  missing: { bins: string[]; env: string[]; config: string[]; os: string[] };
  configChecks: SkillsStatusConfigCheck[];
  install: SkillInstallOption[]; // 可选安装方式（brew/node/go/uv）
};
```

### 5.2 SkillsMarketSearchResult（市场搜索结果）

```typescript
type SkillsMarketSearchResult = {
  items: Array<{
    skillId: string;
    name: string;
    nameCn?: string; // 中文名
    friendlyName?: string; // MCP 兼容名
    friendlyNameCn?: string; // MCP 兼容中文名
    description: string;
    descriptionCn?: string;
    category?: string;
    tags?: string[];
    emoji?: string;
    tier?: string; // S/A/B/C 质量等级
    overallScore?: number; // 综合评分（排序依据）
    cnBlocked?: boolean; // CN 不可用
    cnAlternative?: string; // CN 替代推荐
    installed?: boolean; // 是否已安装
    path: string;
    source?: string;
  }>;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};
```

### 5.3 BatchCheckResult（批量检测结果）

```typescript
type BatchCheckResult = {
  missing: Array<{
    name: string;
    icon: string;
    category: string;
    size_bytes: number;
    method: string;
    tier: "core" | "recommended" | "optional";
    description: string;
  }>;
  installed?: Array<{ name: string; icon: string; tier: string }>;
  total_size_bytes: number;
  estimated_seconds: number;
  disk_available_bytes: number;
  disk_ok: boolean;
};
```

---

## 六、子组件清单

### 6.1 视图组件（ui-cn/src/ui/views/）

| 文件                          | 导出函数                       | 功能                                               |
| ----------------------------- | ------------------------------ | -------------------------------------------------- |
| skills.ts                     | `renderSkills()`               | 主入口：Tab + 本地/市场切换                        |
|                               | `renderLocalSkills()`          | 本地技能管理页面                                   |
|                               | `renderMarketplace()`          | 技能市场页面                                       |
|                               | `renderSkillMarketCard()`      | 市场卡片渲染                                       |
|                               | `renderSkillImportModal()`     | 导入弹窗                                           |
|                               | `renderDashboard()`            | 环形图 + 3 统计卡片                                |
| skills-grouping.ts            | `groupByTier()`                | 按层级分组（core/ready/needs-config/incompatible） |
|                               | `groupSkills()`                | 按来源分组（workspace/built-in/installed/extra）   |
| skills-shared.ts              | `computeSkillMissing()`        | 计算缺失依赖列表                                   |
|                               | `computeSkillReasons()`        | 计算禁用原因                                       |
|                               | `renderSkillStatusChips()`     | 状态标签（来源/可用/禁用）                         |
|                               | `renderCoreBadge()`            | 核心技能 Badge（金色）                             |
|                               | `renderTierBadge()`            | 等级 Badge（S/A/B/C）                              |
|                               | `renderIncompatibleBadge()`    | 不兼容 Badge（灰色）                               |
| skill-install-approval.ts     | `renderSkillInstallApproval()` | 安装确认弹框                                       |
| skill-install-progress.ts     | `renderSkillInstallProgress()` | 安装进度覆盖层                                     |
| agents-panels-tools-skills.ts | `renderAgentTools()`           | Agent 工具访问控制                                 |
|                               | `renderAgentSkills()`          | Agent 技能白名单                                   |
| skills-batch-banner.ts        | (batch banner)                 | 缺失技能检测通知条                                 |
| skills-batch-confirm.ts       | (batch confirm)                | 批量安装确认对话框                                 |
| skills-batch-progress.ts      | (batch progress)               | 批量下载进度面板                                   |
| skills-batch-result.ts        | (batch result)                 | 安装结果展示                                       |
| skills-batch-complete.ts      | (batch complete)               | 全部成功完成页面                                   |
| skills-batch-pill.ts          | (batch pill)                   | 最小化悬浮球                                       |
| skills-batch-animations.ts    | (animations)                   | 批量安装动画                                       |

### 6.2 数据组件

| 文件                         | 功能                                  |
| ---------------------------- | ------------------------------------- |
| data/skill-i18n.ts           | 技能中文翻译查找服务（O(1) Map 查找） |
| data/skill-translations.json | 技能中文翻译字典（静态打包）          |

### 6.3 控制器

| 文件                         | 功能                                    |
| ---------------------------- | --------------------------------------- |
| controllers/skills.ts        | 主控制器：加载/搜索/安装/导入/市场      |
| controllers/skills-batch.ts  | 批量安装控制器：检测/安装/取消/事件处理 |
| controllers/skill-install.ts | 安装审批控制器：解析/队列/进度          |
| controllers/agent-skills.ts  | Agent 技能控制器                        |

---

## 七、事件系统

### 7.1 DOM 事件绑定

| 元素                | 事件            | 处理逻辑                                       |
| ------------------- | --------------- | ---------------------------------------------- |
| Tab 按钮            | @click          | 切换 local/market Tab                          |
| 本地搜索 input      | @input          | 更新 skillsFilter                              |
| 市场搜索 input      | @input          | 300ms 防抖触发 searchMarketSkills              |
| 技能卡片            | @dragstart      | 设置拖拽数据（skillKey + tier）                |
| 技能卡片            | @dragend        | 移除拖拽样式                                   |
| Core Drop Zone      | @dragover       | 允许 drop + 高亮样式                           |
| Core Drop Zone      | @drop           | promoteSkillToCore                             |
| Ready Drop Zone     | @drop           | demoteSkillFromCore                            |
| 加入核心按钮        | @click          | promoteSkillToCore                             |
| 移出核心按钮        | @click          | demoteSkillFromCore                            |
| 启用/禁用按钮       | @click          | updateSkillEnabled                             |
| 安装按钮            | @click          | installSkill                                   |
| API Key input       | @input          | updateSkillEdit                                |
| 保存密钥按钮        | @click          | saveSkillApiKey                                |
| 加载更多按钮        | @click          | showMoreInTier + onTierRenderBump              |
| 导入打开按钮        | @click          | openSkillImport                                |
| 导入关闭按钮        | @click          | closeSkillImport                               |
| 导入路径 input      | @input          | 更新 importPath                                |
| 导入路径 input      | @keydown(Enter) | browseSkillDir                                 |
| 目录条目            | @click          | browseSkillDir(path)                           |
| 引用导入按钮        | @click          | importSkill(path, "reference")                 |
| 复制导入按钮        | @click          | importSkill(path, "copy")                      |
| 分类标签            | @click          | onMarketCategoryChange                         |
| 市场刷新按钮        | @click          | refreshMarketSkills                            |
| 市场安装按钮        | @click          | installRemoteSkill                             |
| 安装确认-安装并继续 | @click          | handleSkillInstallDecision("install-continue") |
| 安装确认-仅安装     | @click          | handleSkillInstallDecision("install")          |
| 安装确认-取消       | @click          | handleSkillInstallDecision("deny")             |
| 进度-完成按钮       | @click          | dismissSkillInstallProgress                    |
| 进度-重试按钮       | @click          | retrySkillInstall                              |
| Batch Banner-安装   | @click          | 进入 confirm 阶段                              |
| Batch Banner-关闭   | @click          | dismissBanner                                  |
| Batch 确认-开始     | @click          | startBatchInstall                              |
| Batch 确认-取消     | @click          | cancelBatchInstall                             |
| Batch 结果-上报     | @click          | reportBatchFailures                            |

### 7.2 回调接口 (SkillsProps)

```typescript
// ---- 本地技能 ----
onFilterChange: (next: string) => void;
onRefresh: () => void;
onToggle: (skillKey: string, enabled: boolean) => void;
onEdit: (skillKey: string, value: string) => void;
onSaveKey: (skillKey: string) => void;
onInstall: (skillKey: string, name: string, installId: string) => void;
onPromoteToCore: (skillKey: string) => void;
onDemoteFromCore: (skillKey: string) => void;
onTierRenderBump: () => void;

// ---- 市场 ----
onTabChange: (tab: "local" | "market") => void;
onMarketSearch: (keyword: string) => void;
onMarketCategoryChange: (category: string) => void;
onMarketLoadMore: () => void;
onMarketInstall: (skillName: string) => void;
onMarketRefresh: () => void;

// ---- 导入 ----
onImportOpen: () => void;
onImportClose: () => void;
onImportBrowse: (path?: string) => void;
onImportPathChange: (path: string) => void;
onImportExecute: (path: string, mode: "copy" | "reference") => void;
```

---

## 八、CSS 样式文件

```
styles/skills.css                     — 技能页面主样式
├── Page Layout (.skills-page)
├── Header Bar (.skills-header-bar)
├── Dashboard (.skills-dashboard)       — 环形图 + 3 统计卡片
│   ├── Ring Chart (.skills-ring-*)
│   └── Stat Cards (.skills-stat-card)
├── Search Bar (.skills-search-bar)
├── Category Chips (.skills-category-*)
├── Tab Content Header (.skills-tab-header)
├── Section Divider (.skills-section-divider)
├── Skills Grid (.skills-grid)
├── Empty State (.skills-empty-state)
├── Skill Card V2 (.skill-card-v2)      — 统一卡片组件
│   ├── Icon (core/ready/blocked/disabled)
│   ├── Body (title-row, name, source, desc)
│   ├── Actions (action-btn, unload, add, install, enable)
│   ├── Missing Dependencies
│   ├── API Key field
│   └── Message (success/error)
├── Spinner (.skill-spinner)
├── Tier Section Accents
│   ├── --core (amber #f59e0b)
│   ├── --ready (green #34d399)
│   ├── --needs-config (orange #f97316)
│   └── --incompatible (gray)
├── Drop Zone (.skills-drop-zone)       — 拖放目标区域
│   ├── Pulse Animation
│   └── Tier-specific colors
├── Card Footer (.skills-card-footer)
├── Drag Handle (.skills-drag-handle)
└── Legacy Batch Install Progress styles
    ├── CN Badge (红金渐变)
    ├── Progress Fill (shimmer动画)
    └── Installing Card (pulse动画)
```

### 关键动画

| 动画名                  | 用途                      |
| ----------------------- | ------------------------- |
| skills-drop-pulse       | 拖放区域脉冲（accent 色） |
| skills-drop-pulse-core  | 核心区域拖放脉冲（amber） |
| skills-drop-pulse-ready | 就绪区域拖放脉冲（green） |
| skill-spin              | 加载旋转图标              |
| shimmer                 | 进度条闪光效果            |
| pulse-icon              | 安装中图标脉冲            |
| skillImportOverlayIn    | 导入弹窗遮罩渐入          |
| skillImportModalIn      | 导入弹窗弹性进入          |
| skillImportSpin         | 导入加载旋转              |
| skillsSpin              | 市场安装旋转              |

---

## 九、完整数据流

### 9.1 页面初始化流程

```
页面加载 / WebSocket 连接成功
    ↓
loadSkills() [controllers/skills.ts]
├─ client.request("skills.status", {})
├─ 注入中文翻译（getSkillTranslation）
└─ state.skillsReport = res
    ↓
checkBatchSkills() [controllers/skills-batch.ts]
├─ client.request("skills.batch.check", {})
└─ 有缺失 → batchPhase = "banner"
    ↓
searchMarketSkills() [controllers/skills.ts]（切到市场 Tab 时）
├─ client.request("skills_marketplace.search", {})
└─ state.skillsMarketSearchResult = result
```

### 9.2 技能安装流程（单个）

```
用户点击 Install
    ↓
installSkill() [controllers/skills.ts]
├─ skillsBusyKey = skillKey
├─ 显示初始进度 {stage:"downloading", percent:5}
└─ client.request("skills.install", { name, installId, timeoutMs:120000 })
    ↓
WebSocket: skill.install.progress
├─ 实时更新 skillsInstallProgress[skillName]
├─ 阶段: downloading → installing → verifying
└─ 带 percent/message/downloadInfo
    ↓
RPC 返回结果
├─ 成功 → {stage:"done", percent:100}
│   ├─ loadSkills() 刷新列表
│   └─ 1.5s 后清除进度
└─ 失败 → {stage:"done", percent:0}
    ├─ 显示错误消息
    └─ 1.5s 后清除进度
```

### 9.3 市场技能安装流程

```
用户点击 Install（市场卡片）
    ↓
installRemoteSkill() [controllers/skills.ts]
├─ 阶段1: {stage:"downloading", percent:20}
├─ 模拟进度计时器（500ms +10%, 上限80%）
└─ client.request("skills.install", { name, installId:"gitee", timeoutMs:120000 })
    ↓
RPC 返回成功
├─ 清除进度计时器
├─ 阶段2: {stage:"verifying", percent:90}
├─ 乐观更新: item.installed = true
├─ 并行刷新: loadSkills() + loadMarketSkills() + searchMarketSkills()
├─ 阶段3: {stage:"done", percent:100}
└─ 1.5s 后清除进度 + 自动切到「技能管理」Tab
```

### 9.4 批量安装流程

```
页面加载 → checkBatchSkills()
├─ 有缺失技能 → batchPhase = "banner"
├─ 用户点击安装 → batchPhase = "confirm"
├─ 用户确认 → startBatchInstall() → batchPhase = "downloading"
│   ├─ client.request("skills.batch.install", { skills })
│   ├─ WebSocket: skills.batch.progress (type=skill.progress)
│   │   └─ 更新每个技能状态
│   ├─ WebSocket: skills.batch.progress (type=batch.progress)
│   │   └─ 更新整体进度（速度/大小）
│   └─ WebSocket: skills.batch.complete
│       ├─ 全部成功 → batchPhase = "complete"
│       └─ 部分失败 → batchPhase = "result"
│           └─ 可选: reportBatchFailures() 上报
└─ 用户关闭 → dismissBanner() → batchPhase = "idle"
```

### 9.5 拖拽操作流程

```
用户拖拽 Ready 卡片到 Core 区域
    ↓
dragstart → setData("text/plain", skillKey) + setData("application/x-skill-tier", "ready")
    ↓
dragover (Core Drop Zone) → preventDefault + 添加高亮样式
    ↓
drop (Core Drop Zone)
├─ 检查 atLimit（≥50 时阻止）
├─ getData → skillKey, sourceTier
├─ sourceTier === "ready" → promoteSkillToCore(skillKey)
│   ├─ 前端限制检查（countCoreSkills ≥ CORE_SKILLS_MAX）
│   └─ client.request("skills.update", { skillKey, pinned: true })
└─ 刷新列表 → 技能从 Ready 移到 Core
```

---

## 十、性能优化点

| 优化                   | 说明                                                        |
| ---------------------- | ----------------------------------------------------------- |
| contain: layout style  | skills-page 使用 CSS containment 隔离重排                   |
| 分页 50 条/层          | 每层最多渲染 50 条，避免大列表卡顿                          |
| 防抖搜索 300ms         | 市场搜索延迟触发，减少请求                                  |
| 模块懒加载             | 市场 Tab 切换时才加载 searchMarketSkills                    |
| 安装进度竞态保护       | done 后忽略迟到的 WS 事件（\_finishedInstalls Set）         |
| 重入保护               | loadSkills 执行中新请求排队（\_pendingReload）              |
| 乐观更新               | 安装后立即标记 installed=true，减少感知延迟                 |
| Session 级 Banner 防抖 | 每 session 只检查一次缺失技能（\_bannerCheckedThisSession） |
| 静态翻译 Map           | O(1) 中文翻译查找，零网络请求                               |
| IntersectionObserver   | 市场无限滚动，仅滚到底部时加载                              |
| 响应式网格             | 4列→3列→2列→1列 自适应                                      |

---

## 十一、安全机制

| 机制          | 说明                               |
| ------------- | ---------------------------------- |
| 安装超时      | 120s 超时保护                      |
| 核心技能上限  | 前后端双重校验，最多 50 个         |
| 安装审批      | 需用户确认才安装，带过期时间       |
| 过期清理      | 安装请求超时自动从队列移除         |
| 磁盘空间检查  | 批量安装前检测可用空间             |
| 连接检查      | 每个操作前检查 client && connected |
| 错误友好化    | formatGeneralError 转为中文提示    |
| WS 竞态保护   | done 后忽略迟到的 progress 事件    |
| Banner 持久化 | 关闭通知后后端记录，避免重复弹出   |

---

## 十二、改版注意事项

### ✅ 可以安全替换的（仅视觉）

- skills.css 全部样式
- skills.ts 中的 HTML 模板结构
- 卡片布局、图标、颜色、动画
- Tab 样式、搜索框样式
- 分类标签 (Chips) 样式
- 市场卡片网格布局
- 导入弹窗视觉

### ⚠️ 替换时需保留接线的

- 所有 `@click`, `@input`, `@dragstart`, `@dragover`, `@drop` 事件绑定
- 所有 `${props.xxx}` 数据绑定
- 分组逻辑（groupByTier 的调用和结果使用）
- 分页状态（getTierVisibleCount, showMoreInTier）
- 条件渲染（loading/error/empty/installed 等状态判断）
- 防抖搜索逻辑（\_skillSearchTimer）
- IntersectionObserver 哨兵元素

### ❌ 不能动的（核心逻辑）

- controllers/skills.ts 的所有 RPC 调用
- controllers/skills-batch.ts 的批量安装逻辑
- controllers/skill-install.ts 的审批队列
- controllers/agent-skills.ts 的 Agent 技能加载
- app-gateway.ts 的 skill.install.progress 事件处理
- data/skill-i18n.ts 的翻译注入
- skills-grouping.ts 的分组算法

---

## 十三、Figma 改版对接检查清单

改完新 UI 后，逐项确认：

- [ ] Tab 切换正常（local ↔ market）
- [ ] Tab 右侧统计摘要显示正确
- [ ] 本地搜索过滤正常
- [ ] 四层分组渲染正确（core/ready/needs-config/incompatible）
- [ ] 核心技能计数器（x/50）显示
- [ ] 拖拽 Ready→Core 正常（drag handle + drop zone）
- [ ] 拖拽 Core→Ready 正常（demote）
- [ ] 达上限(50)时阻止拖入
- [ ] 超30时显示 token 警告
- [ ] 启用/禁用切换正常
- [ ] API Key 输入 + 保存正常
- [ ] 安装依赖按钮正常
- [ ] 安装实时进度条显示
- [ ] 操作消息（成功/错误）正确显示
- [ ] 分页「加载更多」正常
- [ ] 不兼容区域默认折叠
- [ ] 空状态引导去市场
- [ ] 导入弹窗打开/关闭
- [ ] 目录浏览 + SKILL.md 标记
- [ ] 引用/复制导入正常
- [ ] 市场搜索（防抖 300ms）
- [ ] 分类标签切换
- [ ] 市场卡片渲染（名称/等级/标签/描述）
- [ ] CN 不可用标记 + 替代推荐
- [ ] 市场安装按钮 + 进度动画
- [ ] 安装成功后自动切 Tab
- [ ] 无限滚动加载更多
- [ ] 强制刷新市场
- [ ] 安装确认弹框
- [ ] 安装进度覆盖层
- [ ] 批量安装 Banner
- [ ] 批量安装确认 + 进度 + 结果
- [ ] 批量最小化 Pill
- [ ] 响应式布局（手机/平板/桌面）
