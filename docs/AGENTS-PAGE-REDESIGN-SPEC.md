# 智能体页面交互优化体验文档

> 版本：v1.0 | 日期：2026-03-10
> 目标用户：中国小白用户 | 参考基准：Chat 页面设计语言

---

## 一、现有功能完整清单

### 1.1 页面总体结构

```
.agents-wrapper
├── .orch-overlay          ← 智能组队编排器全屏覆盖层
└── .agents-layout         ← 双列网格 280px + 1fr
    ├── .agents-sidebar    ← 左侧智能体列表
    └── .agents-main       ← 右侧主内容区
```

### 1.2 左侧栏功能清单（13 项）

| #   | 功能                                           | 源码位置                   | 说明                           |
| --- | ---------------------------------------------- | -------------------------- | ------------------------------ |
| L1  | 标题行「智能体 试运行」+ 刷新按钮              | agents.ts:209-217          | 「试运行」红色标签             |
| L2  | 错误提示 callout                               | agents.ts:218-222          | 加载失败时显示                 |
| L3  | **智能组队入口**（orchestratorEntryHtml 插槽） | agents.ts:223              | CN 专属，渲染智能组队卡片      |
| L4  | **普通模式**：智能体列表（头像+名称+ID+徽章）  | agents.ts:242-259          | 无团队项目时                   |
| L5  | **团队模式**：项目分组侧栏                     | agents.ts:228-241          | 有 teamProjects 时             |
| L5a | ├─ 项目组（状态点+图标+名称+成员数+折叠箭头）  | team-projects.ts:202-275   | 可折叠展开                     |
| L5b | ├─ 嵌套智能体行（小头像+名称+监督者标识）      | team-projects.ts:254-271   | 监督者有 👑/🎯 标识            |
| L5c | ├─ 孤儿编排组（warn 状态点+删除按钮）          | team-projects.ts:133-175   | orch- 前缀孤儿分组             |
| L5d | └─ 独立智能体分割线 + 列表                     | team-projects.ts:176-199   | 不属于任何项目的智能体         |
| L6  | **添加智能体表单**（+ 号展开）                 | agents.ts:1004-1100        | 3 字段：ID/名称/工作区         |
| L6a | ├─ ID 格式校验（字母数字开头）                 | agents.ts:1002 AGENT_ID_RE | 实时提示                       |
| L6b | ├─ 创建中状态 + 错误提示                       | agents.ts:1085-1094        | agentCreating/agentCreateError |
| L7  | 空状态「暂无智能体」                           | agents.ts:227              | agents.length === 0 时         |

### 1.3 右侧主内容区功能清单

#### 1.3.1 条件渲染逻辑（3 种视图）

| 条件                       | 渲染内容                               | 源码位置          |
| -------------------------- | -------------------------------------- | ----------------- |
| teamProjectSelectedId 存在 | **项目详情面板**（独立子系统）         | agents.ts:267-292 |
| selectedAgent 不存在       | **空选择提示**「请选择一个智能体」     | agents.ts:293-298 |
| selectedAgent 存在         | **智能体详情**（Header + Tabs + 面板） | agents.ts:300-466 |

#### 1.3.2 智能体 Header（5 项）

| #   | 功能                                                   | 源码位置          |
| --- | ------------------------------------------------------ | ----------------- |
| H1  | 大头像（48px）+ 名称 + 副标题（theme）                 | agents.ts:508-515 |
| H2  | agent ID（mono 字体）                                  | agents.ts:518     |
| H3  | 徽章 pill（「默认」等）                                | agents.ts:519     |
| H4  | 「对话」按钮（primary，跳转聊天）                      | agents.ts:520-526 |
| H5  | 「删除智能体」按钮（非默认智能体才显示）+ confirm 弹框 | agents.ts:527-541 |
| H6  | 删除错误提示                                           | agents.ts:543-545 |

#### 1.3.3 多智能体引导页（仅 1 个智能体时显示）

| #   | 功能            | 源码位置            |
| --- | --------------- | ------------------- |
| G1  | 引导标题 + 介绍 | agents.ts:1106-1107 |
| G2  | 3 步创建引导    | agents.ts:1108-1110 |
| G3  | 路由配置说明    | agents.ts:1111-1112 |
| G4  | CLI 命令提示    | agents.ts:1113      |

#### 1.3.4 Tab 导航栏（8 个 Tab）

| #   | Tab              | i18n Key           | 特殊逻辑                                   |
| --- | ---------------- | ------------------ | ------------------------------------------ |
| T1  | 概览 overview    | agents.tabOverview | 默认 Tab                                   |
| T2  | 对话 chat        | agents.tabChat     | -                                          |
| T3  | 工具 tools       | agents.tabTools    | -                                          |
| T4  | 技能 skills      | agents.tabSkills   | -                                          |
| T5  | 渠道 channels    | agents.tabChannels | **团队子成员自动隐藏**（isTeamChildAgent） |
| T6  | 定时任务 cron    | agents.tabCron     | -                                          |
| T7  | 输出文件 outputs | agents.tabOutputs  | -                                          |
| T8  | 提示词文件 files | agents.tabFiles    | -                                          |

#### 1.3.5 概览面板 Overview（5 个卡片）

| #   | 卡片                          | 功能明细                                                                                | 源码位置          |
| --- | ----------------------------- | --------------------------------------------------------------------------------------- | ----------------- |
| O1  | **团队横幅 SupervisorBanner** | 监督者模式：👑标识 + 项目名 + 状态点 + 成员头像(最多4个) + 暂停/恢复按钮 + 查看团队按钮 | agents.ts:621-676 |
| O1b |                               | 成员模式：紧凑横幅「属于X项目」+ 状态 + 查看团队按钮                                    | agents.ts:680-694 |
| O2  | **身份设置**                  | 名称输入框 + Emoji 输入框 + 脏检测 + 保存/还原按钮                                      | agents.ts:811-861 |
| O3  | **角色定义 SOUL.md**          | 异步加载 + textarea 编辑 + 脏检测 + 保存/还原按钮                                       | agents.ts:863-903 |
| O4  | **模型选择**                  | 主模型下拉（支持继承默认值） + 备选模型逗号分隔输入 + 重载/保存按钮                     | agents.ts:905-956 |
| O5  | **高级配置**（默认折叠）      | 3列信息网格：工作区/主模型/是否默认/技能过滤/会话隔离 + dmScope 警告 pill               | agents.ts:958-997 |

#### 1.3.6 对话面板 Chat

| #   | 功能                                  | 源码位置                    |
| --- | ------------------------------------- | --------------------------- |
| C1  | 嵌入式聊天面板（复用 compose-card）   | agent-chat-panel.ts         |
| C2  | 消息分组渲染（user/assistant/system） | groupRawMessages            |
| C3  | 流式输出 streaming + 打字光标         | renderStreamingGroup        |
| C4  | 等待指示器（3 点跳动）                | renderReadingIndicatorGroup |
| C5  | 空状态「还没有对话记录」              | -                           |

#### 1.3.7 工具面板 Tools

| #   | 功能                                         | 源码位置                      |
| --- | -------------------------------------------- | ----------------------------- |
| W1  | 工具配置元信息（来源：agent/global/default） | agents-panels-tools-skills.ts |
| W2  | 快速预设按钮（精简/编程/消息/完整/继承）     | PROFILE_OPTIONS               |
| W3  | 10 分类工具网格（auto-fill 280px 列）        | TOOL_SECTIONS                 |
| W3a | 每分类：标题头 + 工具行列表 + toggle 开关    | agent-tools-section/row       |
| W4  | 保存/重载配置按钮                            | configDirty                   |

#### 1.3.8 技能面板 Skills

| #   | 功能                                                   | 源码位置                    |
| --- | ------------------------------------------------------ | --------------------------- |
| S1  | 搜索过滤框                                             | skillsFilter                |
| S2  | 全部启用/全部禁用/清除白名单按钮                       | onClear/onDisableAll        |
| S3  | 技能分组（workspace/built-in/community）               | groupSkills                 |
| S3a | 每组：可折叠 details + 技能行列表                      | agent-skills-group          |
| S3b | 每行：emoji + 名称 + 中文名 + 描述 + 状态芯片 + toggle | agent-skill-row             |
| S4  | 缺失依赖/禁用原因提示                                  | computeSkillMissing/Reasons |

#### 1.3.9 渠道面板 Channels

| #   | 功能                                           | 源码位置                      |
| --- | ---------------------------------------------- | ----------------------------- |
| CH1 | 上下文卡片（工作区/模型/名称等 3 列网格）      | renderAgentContextCard        |
| CH2 | 渠道列表（每条：标签/ID/连接数/配置数/启用数） | agents-panels-status-files.ts |
| CH3 | dmScope 会话隔离警告 + 一键修复按钮            | dmScopeStatus/onDmScopeApply  |
| CH4 | 上次刷新时间 + 刷新按钮                        | channelsLastSuccess           |

#### 1.3.10 定时任务面板 Cron

| #   | 功能                                                    | 源码位置               |
| --- | ------------------------------------------------------- | ---------------------- |
| CR1 | 上下文卡片                                              | renderAgentContextCard |
| CR2 | 统计卡片（启用状态/任务数/下次唤醒）                    | cronStatus             |
| CR3 | 任务列表（名称/描述/Cron 表达式/状态/目标会话/payload） | cronJobs               |
| CR4 | 刷新按钮                                                | onCronRefresh          |

#### 1.3.11 输出文件面板 Outputs

| #   | 功能                                | 源码位置                 |
| --- | ----------------------------------- | ------------------------ |
| OF1 | 工作区路径显示                      | agents-panels-outputs.ts |
| OF2 | 目录分组 + 可折叠                   | groupByDirectory         |
| OF3 | 文件行（名称/大小/修改时间）        | renderOutputFileRow      |
| OF4 | 文件内容预览（只读 pre） + 复制按钮 | agentOutputContent       |
| OF5 | 两列布局（220px 文件列表 + 预览区） | agent-files-grid         |

#### 1.3.12 提示词文件面板 Files

| #   | 功能                                    | 源码位置                      |
| --- | --------------------------------------- | ----------------------------- |
| PF1 | 工作区路径显示                          | agents-panels-status-files.ts |
| PF2 | 文件列表（名称/大小/修改时间/缺失标记） | renderAgentFileRow            |
| PF3 | 文件编辑（textarea + 脏检测）           | agentFileDrafts               |
| PF4 | 保存/还原按钮                           | onFileSave/onFileReset        |
| PF5 | 两列布局（220px 文件列表 + 编辑区）     | agent-files-grid              |

### 1.4 团队项目子系统（完整独立系统）

#### 1.4.1 项目详情 Header

| #   | 功能                                      | 源码位置                 |
| --- | ----------------------------------------- | ------------------------ |
| PH1 | 项目头像（users 图标）+ 名称 + 描述       | team-projects.ts:324-333 |
| PH2 | 状态 pill（active/paused/error 不同颜色） | team-projects.ts:336     |
| PH3 | 暂停/恢复按钮（根据状态显示）             | team-projects.ts:337-346 |
| PH4 | 删除项目按钮 + confirm 弹框               | team-projects.ts:347-356 |
| PH5 | 全局错误提示 + 关闭按钮                   | team-projects.ts:295-302 |

#### 1.4.2 项目 Tab 导航（6 个 Tab）

| #   | Tab           | i18n Key      |
| --- | ------------- | ------------- |
| PT1 | 成员 members  | team.members  |
| PT2 | 活动 activity | team.activity |
| PT3 | 统计 stats    | team.stats    |
| PT4 | 设置 settings | team.settings |
| PT5 | 记忆 memory   | team.memory   |
| PT6 | 文件 files    | team.files    |

#### 1.4.3 各 Tab 功能

| Tab      | 功能                                                                                       |
| -------- | ------------------------------------------------------------------------------------------ |
| **成员** | 成员列表（头像+名称+角色+健康状态+在线指示）+ 移除成员 + 添加成员选择器 + 跳转到智能体详情 |
| **活动** | 活动事件流（时间戳+事件类型+描述+智能体头像）+ 加载/刷新                                   |
| **统计** | 项目统计数据 + 加载按钮                                                                    |
| **设置** | 项目设置修改（名称/描述/策略等）+ 保存                                                     |
| **记忆** | 共享记忆条目列表 + 清除全部记忆 + 加载/刷新                                                |
| **文件** | 按成员智能体分组的工作区文件浏览 + 加载                                                    |

### 1.5 Orchestrator 编排器

| #   | 功能                                      | 源码位置                      |
| --- | ----------------------------------------- | ----------------------------- |
| OR1 | 全屏覆盖层（z-index 浮层）                | agents.ts:206 `.orch-overlay` |
| OR2 | 编排器 UI（由 orchestratorHtml 插槽注入） | 外部组件提供                  |

---

## 二、Chat 页面设计语言基准

### 2.1 色彩体系

```css
/* 深色主题（默认） */
--bg: #0f1419 /* 主背景 */ --bg-accent: #151b23 /* 侧栏背景 */ --bg-elevated: #1c242e /* 浮起面板 */
  --bg-hover: #2a3544 /* 悬停 */ --card: #1a2332 /* 卡片 */ --text: #e8ecf1 /* 主文字 */
  --text-strong: #ffffff /* 重点 */ --muted: #8b9caf /* 辅助 */ --accent: #6c8cff /* 主色蓝紫 */
  --accent-hover: #89a5ff /* hover 态 */ --accent-glow: rgba(108, 140, 255, 0.3) /* 发光 */
  --accent-subtle: rgba(108, 140, 255, 0.18) /* 淡底 */ --border: #2d3a4d --ok: #34d399 /* 成功绿 */
  --warn: #fbbf24 /* 警告金 */ --danger: #f87171 /* 危险红 */ /* 品牌橙（用户头像、品牌点缀） */
  品牌橙: #f5a623 → #e8915a 渐变;
```

### 2.2 设计规范

| 属性         | Chat 页面值                   | 当前智能体页面值    | 优化方向               |
| ------------ | ----------------------------- | ------------------- | ---------------------- |
| 卡片圆角     | 12-16px (`--radius-lg`)       | 8px (`--radius-md`) | → 12px                 |
| 阴影         | `shadow-md` + 发光 glow       | 几乎无              | → 加 hover 阴影 + 发光 |
| 毛玻璃       | `backdrop-filter: blur(12px)` | 无                  | → 关键区域加毛玻璃     |
| 动画         | rise/shimmer/glow/pulse       | 无                  | → 加入场动画           |
| 按钮最小触控 | 32px 高                       | 28px                | → 32px                 |
| 字体大小     | 14px body / 16px input        | 12.5-13px           | → 适度放大             |
| 间距         | 16-24px                       | 10-16px             | → 适度加大             |
| 圆角按钮     | `border-radius: 20-24px`      | `radius-sm` 6px     | → 提升到 8-12px        |

### 2.3 动画体系

```css
/* 入场 */
@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 弹簧 */
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
--ease-out: cubic-bezier(0.16, 1, 0.3, 1);

/* 时长 */
--duration-fast: 120ms;
--duration-normal: 200ms;
--duration-slow: 350ms;
```

---

## 三、交互优化方案

### 3.1 左侧栏优化

#### 3.1.1 智能体行 `.agent-row`

**当前问题**：头像单色扁平、选中态只有 inset 阴影不够醒目、徽章颜色与整体色调不搭

**优化**：

```css
/* 头像加渐变背景 */
.agent-avatar {
  border-radius: var(--radius-md); /* 保持 8px */
  background: linear-gradient(
    135deg,
    rgba(108, 140, 255, 0.15),
    rgba(139, 92, 246, 0.1)
  ); /* 蓝紫渐变底 */
  border: 1px solid rgba(108, 140, 255, 0.2);
  font-size: 18px;
}

/* 选中态升级 */
.agent-row.active {
  background: var(--accent-subtle);
  border-color: rgba(var(--accent-rgb), 0.3);
  box-shadow:
    inset 3px 0 0 var(--accent),
    var(--shadow-sm); /* 加外阴影 */
}

/* hover 态 */
.agent-row:hover:not(.active) {
  background: var(--bg-hover);
  border-color: var(--border);
  transform: translateX(2px); /* 微位移反馈 */
  transition: all 150ms var(--ease-out);
}

/* 徽章统一为蓝紫调 */
.agent-pill {
  background: var(--accent-subtle);
  color: var(--accent);
  /* 去掉红色，统一为品牌色 */
}
```

#### 3.1.2 智能组队入口卡片

**优化**：加品牌渐变边框 + 呼吸动画，使其视觉上区分于普通智能体行

```css
/* 智能组队入口 */
.orch-entry-card {
  border: 1px solid rgba(108, 140, 255, 0.25);
  border-radius: var(--radius-lg);
  background: linear-gradient(135deg, rgba(108, 140, 255, 0.08) 0%, rgba(139, 92, 246, 0.05) 100%);
  padding: 14px 16px;
  margin: 8px 8px 4px;
  transition:
    border-color 200ms,
    box-shadow 200ms;
}
.orch-entry-card:hover {
  border-color: var(--accent);
  box-shadow: 0 0 12px var(--accent-glow);
}
```

#### 3.1.3 团队项目分组

**优化**：项目组头部加左侧色条 + 展开/折叠动画

```css
.project-group {
  border-left: 3px solid var(--accent);
  border-radius: 0 var(--radius-md) var(--radius-md) 0;
  margin: 4px 0;
}
.project-group--selected {
  background: rgba(108, 140, 255, 0.06);
  border-left-color: var(--accent);
}

/* 折叠动画 */
.project-group-agents {
  max-height: 500px;
  overflow: hidden;
  transition: max-height 300ms var(--ease-out);
}
.project-group-agents--collapsed {
  max-height: 0;
}

/* 折叠箭头旋转 */
.project-group-chevron svg {
  transition: transform 200ms ease;
}
.project-group-chevron.collapsed svg {
  transform: rotate(-90deg);
}
```

#### 3.1.4 添加智能体表单

**优化**：展开时有 slide-down 动画、输入框对齐 Chat compose-card 风格

```css
/* 输入框升级 */
.agents-sidebar input[type="text"] {
  border-radius: 8px;
  border: 1.5px solid var(--border);
  padding: 8px 12px;
  font-size: 13px;
  transition:
    border-color 150ms,
    box-shadow 150ms;
}
.agents-sidebar input[type="text"]:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-subtle);
}
```

### 3.2 右侧 Header 优化

#### 3.2.1 头像升级

```css
.agent-avatar--lg {
  width: 52px;
  height: 52px;
  border-radius: var(--radius-lg); /* 12px */
  background: linear-gradient(135deg, rgba(108, 140, 255, 0.15), rgba(139, 92, 246, 0.1));
  border: 1.5px solid rgba(108, 140, 255, 0.25);
  font-size: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}
```

#### 3.2.2 按钮统一

```
当前：[agent-id] [默认]pill [对话]primary [删除]danger
优化：[默认]accent-pill   [对话 →]大号accent按钮   [⚙]灰色图标按钮   [🗑]灰色图标按钮
```

```css
/* 对话按钮 — 主操作 */
.agent-header .btn.primary {
  padding: 8px 20px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 600;
  background: linear-gradient(135deg, var(--accent), var(--accent-hover));
  box-shadow: 0 2px 8px var(--accent-glow);
  transition: all 150ms ease;
}
.agent-header .btn.primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px var(--accent-glow);
}

/* 删除按钮 — 次要，默认不醒目 */
.agent-header .btn--danger {
  opacity: 0.5;
  font-size: 12px;
}
.agent-header .btn--danger:hover {
  opacity: 1;
  color: var(--danger);
}
```

### 3.3 Tab 导航栏优化

**当前问题**：白底圆角按钮紧密排列，8 个 Tab 在小屏溢出，无品牌感

**方案**：改为底部下划线风格 + 高级 Tab 折叠到「更多」

```
常显 Tab：概览  对话  工具  技能  渠道      [更多 ▾]
                                            ├─ 定时任务
                                            ├─ 输出文件
                                            └─ 提示词文件
```

```css
/* Tab 容器：去掉灰色背景框 */
.agent-tabs {
  display: flex;
  gap: 0;
  padding: 0;
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--border);
}

/* 单个 Tab：底部下划线 */
.agent-tab {
  padding: 10px 18px;
  font-size: 13px;
  font-weight: 500;
  color: var(--muted);
  border: none;
  border-bottom: 2px solid transparent;
  border-radius: 0;
  background: transparent;
  transition:
    color 150ms,
    border-color 150ms;
}
.agent-tab:hover {
  color: var(--text);
  background: transparent;
}
.agent-tab.active {
  color: var(--accent);
  border-bottom-color: var(--accent);
  font-weight: 600;
  background: transparent;
  box-shadow: none;
}

/* "更多" 下拉（定时任务/输出/提示词） */
.agent-tab-more {
  position: relative;
}
.agent-tab-more__menu {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 4px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  padding: 4px;
  z-index: 100;
  min-width: 140px;
}
```

**注意**：渠道 Tab 在团队子成员时自动隐藏（`isTeamChildAgent` 逻辑保留）。

### 3.4 概览面板卡片优化

#### 3.4.1 统一卡片风格

```css
/* 所有卡片统一升级 */
.agents-main > .card {
  border-radius: 12px; /* 从 8px 提升 */
  border: 1px solid var(--border);
  background: var(--card);
  padding: 20px 24px; /* 从 16px 加大 */
  transition:
    border-color 200ms,
    box-shadow 200ms;
  animation: rise 0.35s var(--ease-out) backwards;
}
.agents-main > .card:hover {
  border-color: var(--border-strong);
  box-shadow: var(--shadow-sm);
}

/* stagger 入场动画 */
.agents-main > .card:nth-child(1) {
  animation-delay: 0ms;
}
.agents-main > .card:nth-child(2) {
  animation-delay: 50ms;
}
.agents-main > .card:nth-child(3) {
  animation-delay: 100ms;
}
.agents-main > .card:nth-child(4) {
  animation-delay: 150ms;
}
.agents-main > .card:nth-child(5) {
  animation-delay: 200ms;
}
```

#### 3.4.2 团队横幅 SupervisorBanner

**优化**：加品牌渐变边框 + 成员头像堆叠

```css
.supervisor-banner {
  border-left: 3px solid var(--accent);
  background: linear-gradient(135deg, rgba(108, 140, 255, 0.06) 0%, rgba(108, 140, 255, 0.02) 100%);
}
.supervisor-banner--member {
  border-left-color: var(--muted);
  background: var(--bg-elevated);
}

/* 成员头像堆叠 */
.supervisor-banner .agent-avatar--sm {
  margin-left: -8px;
  border: 2px solid var(--card);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}
.supervisor-banner .agent-avatar--sm:first-child {
  margin-left: 0;
}
```

#### 3.4.3 身份设置卡片

**优化**：输入框对齐 Chat compose-card 风格

```css
/* 名称/Emoji 输入框 */
.agents-main input[type="text"],
.agents-main textarea,
.agents-main select {
  border-radius: 8px;
  border: 1.5px solid var(--border);
  padding: 10px 14px;
  font-size: 14px;
  background: var(--bg-elevated);
  transition:
    border-color 150ms,
    box-shadow 150ms;
}
.agents-main input[type="text"]:focus,
.agents-main textarea:focus,
.agents-main select:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-subtle);
  outline: none;
}

/* Emoji 输入特大字 */
.agents-main input[style*="text-align: center"] {
  font-size: 22px;
}
```

#### 3.4.4 角色定义 SOUL.md

**优化**：textarea 加左侧装饰条（参考 Chat 工具卡片 `.chat-tool-card::before`）

```css
/* SOUL.md textarea 包装 */
.soul-editor {
  position: relative;
  border-radius: 10px;
  border: 1.5px solid var(--border);
  overflow: hidden;
  transition: border-color 200ms;
}
.soul-editor:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-subtle);
}
.soul-editor::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: linear-gradient(180deg, var(--accent), var(--accent-hover));
  opacity: 0.5;
  transition: opacity 200ms;
}
.soul-editor:focus-within::before {
  opacity: 1;
}
.soul-editor textarea {
  border: none;
  border-radius: 0;
  padding: 14px 16px 14px 12px;
  min-height: 160px;
  line-height: 1.7;
  font-size: 14px;
}
```

#### 3.4.5 模型选择

**优化**：select 下拉框加图标前缀 + 样式统一

```css
.agents-main select {
  appearance: none;
  background-image: url("data:image/svg+xml,...chevron-down...");
  background-repeat: no-repeat;
  background-position: right 12px center;
  padding-right: 36px;
}
```

#### 3.4.6 高级配置 3 列网格

**优化**：圆角提升 + hover 态加亮

```css
.agents-overview-grid {
  border-radius: var(--radius-lg); /* 12px */
  background: var(--bg-elevated);
}
.agent-kv {
  padding: 16px 18px;
}
.agent-kv .label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted);
  margin-bottom: 8px;
}
```

### 3.5 工具面板优化

```css
/* 工具分类卡片 */
.agent-tools-section {
  border-radius: var(--radius-lg); /* 12px */
  overflow: hidden;
}
.agent-tools-header {
  padding: 12px 16px;
  font-size: 13px;
}

/* 工具行增大触控区域 */
.agent-tool-row {
  padding: 10px 16px;
  min-height: 40px;
}

/* toggle 开关对齐 Chat 风格 */
.agent-tool-row input[type="checkbox"] {
  /* 改为 iOS 风格滑块开关 */
  width: 36px;
  height: 20px;
  appearance: none;
  border-radius: 10px;
  background: var(--border);
  transition: background 200ms;
  cursor: pointer;
}
.agent-tool-row input[type="checkbox"]:checked {
  background: var(--accent);
}
```

### 3.6 技能面板优化

```css
/* 技能分组折叠头 */
.agent-skills-header {
  padding: 14px 18px;
  border-radius: var(--radius-md) var(--radius-md) 0 0;
}

/* 技能行 */
.agent-skill-row {
  padding: 10px 18px;
  min-height: 44px; /* 增大触控区域 */
}

/* 状态芯片 */
.chip-ok {
  background: rgba(52, 211, 153, 0.12);
  color: var(--ok);
}
.chip-warn {
  background: rgba(251, 191, 36, 0.12);
  color: var(--warn);
}
.chip-missing {
  background: rgba(248, 113, 113, 0.12);
  color: var(--danger);
}
```

### 3.7 文件面板优化（提示词文件 + 输出文件共用）

```css
/* 两列布局圆角 */
.agent-files-grid {
  border-radius: var(--radius-lg);
  min-height: 360px;
}

/* 文件行 */
.agent-file-row {
  padding: 12px 16px;
  min-height: 44px;
}
.agent-file-row.active {
  background: var(--accent-subtle);
  border-left: 3px solid var(--accent);
}

/* 文件编辑器 textarea */
.agent-files-editor textarea {
  font-family: var(--mono);
  font-size: 13px;
  line-height: 1.6;
  border-radius: 8px;
  border: 1.5px solid var(--border);
}
.agent-files-editor textarea:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-subtle);
}
```

### 3.8 渠道 + 定时任务面板优化

```css
/* 渠道列表项 */
.list-item {
  padding: 14px 18px;
  border-radius: 0;
  border-bottom: 1px solid var(--border);
  transition: background 150ms;
}
.list-item:hover {
  background: var(--bg-hover);
}

/* dmScope 警告卡片 */
.dmscope-warning {
  border: 1px solid rgba(251, 191, 36, 0.3);
  background: linear-gradient(135deg, rgba(251, 191, 36, 0.08) 0%, rgba(251, 191, 36, 0.02) 100%);
  border-radius: var(--radius-lg);
  padding: 14px 18px;
}

/* Cron 任务状态芯片 */
.chip {
  font-size: 11px;
  padding: 3px 10px;
  border-radius: 6px;
  font-weight: 500;
}
```

### 3.9 嵌入式对话面板优化

```css
/* 聊天面板最小高度 */
.agent-chat-panel {
  min-height: 400px; /* 从 360px 增大 */
}

/* 消息区 */
.agent-chat-messages {
  padding: 16px 20px; /* 加大间距 */
}

/* 空状态居中 */
.agent-chat-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: var(--muted);
  font-size: 14px;
}
```

### 3.10 团队项目详情面板优化

```css
/* 项目 Header */
.project-header .agent-avatar--lg {
  background: linear-gradient(135deg, rgba(108, 140, 255, 0.2), rgba(139, 92, 246, 0.15));
  border-color: rgba(108, 140, 255, 0.3);
}

/* 项目 Tab 复用智能体 Tab 新样式 */
/* （底部下划线风格，自动继承） */

/* 成员卡片 */
.team-member-card {
  border-radius: var(--radius-lg);
  padding: 16px;
  border: 1px solid var(--border);
  transition:
    border-color 200ms,
    box-shadow 200ms;
}
.team-member-card:hover {
  border-color: var(--accent);
  box-shadow: var(--shadow-sm);
}

/* 活动事件流 */
.activity-event {
  padding: 12px 16px;
  border-left: 2px solid var(--border);
  margin-left: 12px;
  animation: rise 0.35s var(--ease-out) backwards;
}
.activity-event:hover {
  border-left-color: var(--accent);
  background: var(--bg-hover);
}

/* 共享记忆条目 */
.memory-entry {
  padding: 12px 16px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  font-family: var(--mono);
  font-size: 12px;
}
```

### 3.11 响应式优化

```css
/* 平板 ≤900px */
@media (max-width: 900px) {
  .agents-layout {
    grid-template-columns: 1fr;
  }
  .agents-sidebar {
    max-height: 200px; /* 从 180px 微调 */
    border-bottom: 1px solid var(--border);
  }
  .agent-list {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    padding: 10px 14px;
  }
  .agent-row {
    flex-shrink: 0;
    min-width: 140px;
  }
  /* Tab 横向滚动 */
  .agent-tabs {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }
  .agent-tabs::-webkit-scrollbar {
    display: none;
  }
}

/* 手机 ≤480px */
@media (max-width: 480px) {
  .agents-main {
    padding: 14px 16px;
  }
  .agent-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }
  .agent-header-meta {
    width: 100%;
    justify-content: flex-start;
    flex-wrap: wrap;
  }
  .agents-overview-grid {
    grid-template-columns: repeat(2, 1fr); /* 从 3 列变 2 列 */
  }
  .agent-tools-grid {
    grid-template-columns: 1fr;
  }
  .agent-files-grid {
    grid-template-columns: 1fr;
    grid-template-rows: 180px 1fr;
  }
}
```

### 3.12 全局动画

```css
/* 入场动画 — 所有卡片 */
@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Tab 内容切换淡入 */
@keyframes fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

/* 折叠/展开 */
@keyframes slide-down {
  from {
    opacity: 0;
    max-height: 0;
  }
  to {
    opacity: 1;
    max-height: 500px;
  }
}

/* 加载旋转 */
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* 应用动画 */
.agents-main > .card {
  animation: rise 0.35s var(--ease-out) backwards;
}

/* Tab 面板切换 */
.agents-main > section:not(.card):not(.agent-header) {
  animation: fade-in 0.2s ease;
}
```

---

## 四、实施优先级

### P0（视觉统一，改动小收益大）

| #   | 改动                              | 涉及文件   | 预估 |
| --- | --------------------------------- | ---------- | ---- |
| 1   | 所有卡片 border-radius 8px → 12px | agents.css | 5min |
| 2   | 卡片 padding 16px → 20-24px       | agents.css | 5min |
| 3   | 输入框 focus 加 accent 发光边框   | agents.css | 5min |
| 4   | 操作按钮最小高度 32px             | agents.css | 5min |
| 5   | 左侧选中态加 shadow-sm            | agents.css | 2min |
| 6   | 头像加渐变背景                    | agents.css | 5min |
| 7   | 「对话」按钮改为圆角渐变蓝        | agents.css | 5min |
| 8   | pill 徽章颜色统一到 accent 调     | agents.css | 2min |

### P1（交互升级，中等工作量）

| #   | 改动                              | 涉及文件               | 预估  |
| --- | --------------------------------- | ---------------------- | ----- |
| 9   | Tab 栏改为底部下划线风格          | agents.css + agents.ts | 20min |
| 10  | 高级 Tab 折叠到「更多」下拉       | agents.ts              | 30min |
| 11  | 卡片入场 rise 动画 + stagger      | agents.css             | 10min |
| 12  | 工具/技能 toggle 改为滑块开关     | agents.css             | 15min |
| 13  | SOUL.md textarea 加左侧装饰条     | agents.css             | 10min |
| 14  | 团队横幅加渐变边框 + 成员头像堆叠 | agents.css             | 15min |

### P2（体验精细化）

| #   | 改动                            | 涉及文件   | 预估  |
| --- | ------------------------------- | ---------- | ----- |
| 15  | 智能组队入口卡片加发光 hover    | agents.css | 10min |
| 16  | 项目分组折叠/展开动画           | agents.css | 10min |
| 17  | 删除按钮默认低调，hover 才变红  | agents.css | 5min  |
| 18  | 文件面板选中行加左侧色条        | agents.css | 5min  |
| 19  | 活动事件流加时间轴线 + 入场动画 | agents.css | 15min |
| 20  | 响应式 480px 手机适配           | agents.css | 20min |

### P3（锦上添花）

| #   | 改动                   | 涉及文件   | 预估  |
| --- | ---------------------- | ---------- | ----- |
| 21  | Tab 切换 fade-in 过渡  | agents.css | 5min  |
| 22  | 空状态加品牌色渐变插图 | agents.ts  | 15min |
| 23  | 多智能体引导页视觉升级 | agents.ts  | 20min |
| 24  | 毛玻璃效果（关键区域） | agents.css | 10min |

---

## 五、不改动的部分

以下逻辑和功能**只改样式不改行为**，确保零功能回退：

1. 所有 RPC 调用和状态管理逻辑（controllers/）不动
2. 所有 Props 类型和回调签名不动
3. isTeamChildAgent 隐藏渠道 Tab 逻辑不动
4. 拖拽、脏检测、ID 校验等交互逻辑不动
5. i18n 翻译键不动
6. 响应式断点保持 900px / 480px
7. 团队项目子系统功能逻辑不动

---

## 六、文件变更清单

| 文件                                  | 变更类型 | 说明                                     |
| ------------------------------------- | -------- | ---------------------------------------- |
| `ui-cn/src/styles/agents.css`         | **修改** | 主要改动集中在此，更新组件样式           |
| `ui-cn/src/ui/views/agents.ts`        | **修改** | Tab 栏结构调整（更多下拉）、class 名微调 |
| `ui-cn/src/ui/views/team-projects.ts` | **修改** | class 名微调适配新样式                   |
| `ui-cn/src/styles/base.css`           | **不动** | 全局变量已够用                           |
| `ui-cn/src/ui/controllers/*`          | **不动** | 纯逻辑层                                 |
