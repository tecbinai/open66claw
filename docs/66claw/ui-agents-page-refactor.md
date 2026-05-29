# 智能体页面 UI 改造文档

基于 IM 渠道页（channels）的布局规范，对智能体页（agents）进行统一风格改造。

## 改造目标

将智能体页面从"单卡片包裹"布局改为与 IM 渠道页一致的"双独立卡片 + 间距"布局，统一视觉语言。

## 涉及文件

| 文件 | 作用 |
|------|------|
| `ui-cn/src/styles/agents.css` | 智能体页面样式（主要改动） |
| `ui-cn/src/ui/views/agents.ts` | 智能体页面模板（标题/试运行标签） |
| `ui-cn/src/styles/components.css` | IM 渠道页样式（参考基准，行 6063+） |
| `ui-cn/src/styles/layout.css` | `.content` 基础样式及 `.content--channels` 覆盖 |

## 改造要点

### 1. 外层容器：去除父级 padding

**问题：** `.content` 基类有 `padding: 8px 16px 24px`，IM 渠道页通过 `.content--channels` 覆盖为 `padding: 0`。智能体页原来用 `.agents-wrapper { margin: -16px }` 做负边距补偿，不够干净。

**做法：** `.content--agents` 直接覆盖为 `padding: 0; gap: 0; overflow: hidden;`，与 `.content--channels` 保持一致。同时去除 `.agents-wrapper` 的负 margin。

```css
/* 改造前 */
.content--agents { padding-top: 2px; gap: 8px; }
.agents-wrapper { margin: -16px; }

/* 改造后 */
.content--agents { padding: 0; gap: 0; overflow: hidden; }
.agents-wrapper { margin: 0; }
```

### 2. 布局容器：从单卡片拆为透明网格

**问题：** 原 `.agents-layout` 是一个带 border/background/box-shadow 的大卡片，侧边栏和详情区作为其内部区域，没有独立的卡片边框和圆角。

**做法：** `.agents-layout` 改为透明容器，只负责网格布局和间距，不承担视觉装饰。

```css
/* 改造前 */
.agents-layout {
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(10,14,20,0.45);
  backdrop-filter: blur(4px);
  box-shadow: 0 1px 3px rgba(0,0,0,0.2), 0 8px 32px rgba(0,0,0,0.15);
  gap: 0;
}

/* 改造后（对齐 .ch-layout） */
.agents-layout {
  border: none;
  background: transparent;
  box-shadow: none;
  gap: 24px;
  padding: 36px;
}
```

**关键属性对齐 `.ch-layout`：**

| 属性 | 值 | 说明 |
|------|----|------|
| `grid-template-columns` | `380px minmax(0, 1fr)` | 侧边栏 380px，详情弹性填充 |
| `grid-template-rows` | `minmax(0, 1fr)` | 行高撑满 |
| `flex` | `1 1 0` | 在 flex 父容器中撑满 |
| `min-height` | `0` | 允许收缩，防溢出 |
| `box-sizing` | `border-box` | padding 计入宽高 |
| `gap` | `24px` | 两卡片间距 |
| `padding` | `36px` | 四周留白 |

### 3. Wrapper 必须是 flex 容器

**问题：** 智能体页比渠道页多一层 `.agents-wrapper`（用于放置 `.orch-overlay`）。渠道页的 `.ch-layout` 直接位于 `.content--channels`（flex column）内，`flex: 1 1 0` 自然生效。但 `.agents-layout` 位于 `.agents-wrapper` 内，wrapper 原本不是 flex 容器，导致 layout 的 `flex: 1 1 0` 无效，高度无法撑满。

**做法：** `.agents-wrapper` 加上 `display: flex; flex-direction: column;`。

```css
.agents-wrapper {
  display: flex;
  flex-direction: column;
  flex: 1 1 0;
  min-height: 0;
  height: 100%;
}
```

**经验：** 当页面结构比参考页多一层包裹时，必须确保中间层也是 flex 容器，否则子元素的 `flex: 1 1 0` 会静默失效，高度不撑满（底部出现空白）。

### 4. 侧边栏和详情区：独立卡片样式

**问题：** 原来 `.agents-sidebar` 和 `.agents-main` 共享外层卡片边框，侧边栏只有 `border-right`，没有独立圆角。

**做法：** 每个区域各自拥有完整的卡片样式，直接复用渠道页的视觉参数。

```css
/* 侧边栏（对齐 .ch-sidebar） */
:root[data-theme="light"] .agents-sidebar {
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(24px);
  border: 1.5px solid rgba(255, 255, 255, 0.75);
  border-radius: 24px;
  box-shadow: 0 6px 30px rgba(91, 181, 222, 0.1),
              inset 0 2px 0 rgba(255, 255, 255, 0.6);
  padding: 16px;
}

/* 详情区（对齐 .ch-main） */
:root[data-theme="light"] .agents-main {
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(24px);
  border: 1.5px solid rgba(255, 255, 255, 0.75);
  border-radius: 24px;
  box-shadow: 0 6px 30px rgba(91, 181, 222, 0.1),
              inset 0 2px 0 rgba(255, 255, 255, 0.6);
}
```

**共用视觉参数清单（light 主题）：**

| 参数 | 值 |
|------|----|
| `background` | `rgba(255, 255, 255, 0.72)` |
| `backdrop-filter` | `blur(24px)` |
| `border` | `1.5px solid rgba(255, 255, 255, 0.75)` |
| `border-radius` | `24px` |
| `box-shadow` | `0 6px 30px rgba(91,181,222,0.1), inset 0 2px 0 rgba(255,255,255,0.6)` |

### 5. 侧边栏内边距和标题对齐

**问题：** 原侧边栏 `padding: 0`，标题区 `.row` 的 padding 直接决定标题位置。渠道页侧边栏自身有 `padding: 16px`，标题区 `.ch-sidebar__header` 再加 `padding: 4px 14px 12px`，最终标题距卡片上边 20px、左边 30px。

**做法：**
- `.agents-sidebar` 加 `padding: 16px`（与 `.ch-sidebar` 一致）
- `.agents-sidebar > .row` 保持 `padding: 4px 14px 12px`（与 `.ch-sidebar__header` 一致）
- `.agent-list` 的 padding 从 `8px` 改为 `0`，避免与父级 padding 叠加

**经验：** 给父容器加 padding 后，必须检查内部滚动区域的 padding 是否叠加过大。

### 6. 标题样式统一（全站区域标题规范）

IM 渠道页 `.ch-sidebar__title` 是全站区域标题的样式基准。所有页面的区域标题都应对齐此规范。

**标准样式参数：**

```css
/* IM 渠道标题基准（ch-sidebar__title） */
font-size: 20px;
font-weight: 700;
color: #feb142;
margin: 0;
text-shadow: none;

/* dark 主题回退 */
:root:not([data-theme="light"]) { color: var(--text-strong); }
```

**已对齐的页面和对应 CSS 选择器：**

| 页面 | 标题元素 | CSS 选择器 | 文件 |
|------|---------|-----------|------|
| IM 渠道 | "IM渠道" | `.ch-sidebar__title` | `components.css` |
| 智能体 | "智能体" | `.agents-sidebar__title` | `agents.css` |
| 定时任务 | "定时任务" | `.cron-main__title` | `cron.css` |
| 技能 | Tab 栏（技能管理/技能市场） | `.skills-glass-tab--active` | `skills.css` |
| MCP | "你的 AI 助手有超能力" | 行内 style | `extensions-page.ts` |
| 配置 | "设置" | `.config-sidebar__title` | `config.css` |
| 概览/用量/调试/日志 | 各区域 card-title | `.content--more .card-title` | `layout.css` |
| 用量 | "按时段活动分布" | `.usage-mosaic-title` | `usageStyles-part1.ts` |
| 调试 | "调试工具说明" | `.help-card__summary` | `components.css` |

**模板改动示例（`agents.ts`）：**
```diff
- <div class="card-title">${t("agents.title")} <span style="...">试运行</span></div>
+ <div class="agents-sidebar__title">${t("agents.title")}</div>
```

### 7. 背景色统一

将智能体页 light 主题背景从 `chat-bg-1_15.png` 改为渠道页使用的 `channels-bg.png`：

```css
:root[data-theme="light"] .content--agents {
  background: url("/channels-bg.png") center / cover no-repeat;
}
```

## 改造前后对比

| 维度 | 改造前 | 改造后 |
|------|--------|--------|
| 布局模式 | 单卡片包裹 | 双独立卡片 |
| 卡片间距 | 0（无间隔） | 24px |
| 四周留白 | 无（负 margin 补偿） | 36px |
| 侧边栏宽度 | 280px | 380px |
| 卡片圆角 | 0（继承外层） | 24px |
| 侧边栏内边距 | 0 | 16px |
| 标题大小 | 15px / 600 | 20px / 700 |
| 标题颜色 | var(--text-strong) | #feb142 |
| 背景图 | chat-bg-1_15.png | channels-bg.png |

## 通用经验总结

1. **容器覆盖要彻底：** `.content` 基类有默认 padding/gap/overflow，新页面必须在 `.content--xxx` 中显式覆盖为 `padding: 0; gap: 0; overflow: hidden;`，否则会残留间距。

2. **flex 传递链不能断：** 从 `.content` 到最终的 grid layout，中间每一层包裹元素都必须是 flex 容器并设置 `flex: 1 1 0; min-height: 0;`，任何一层缺失都会导致高度无法撑满。

3. **独立卡片优于共享边框：** 双卡片各自拥有 border/radius/shadow 比共享外层卡片边框更灵活，间距通过 grid gap 控制。

4. **padding 叠加检查：** 给父容器加 padding 后，内部子元素（尤其是滚动区域）的 padding 可能叠加过大，需同步调整。

5. **dark/light 双主题同步：** 改 light 主题样式时，dark 主题的对应规则也要同步调整，避免主题切换后样式断裂。
