# OpenClawCN 架构概览

## 项目整体结构

OpenClawCN 由以下几个核心部分组成：

- **OpenClaw Gateway** — Node.js 后端服务，提供 HTTP API、WebSocket、插件系统等全部业务逻辑
- **ui-cn** — CN 版本的前端控制界面（纯前端 SPA）
- **Tauri 桌面壳** — 基于 Tauri v2 的桌面应用包装层（Rust）
- **cn-adapter 插件** — CN 特有的适配层，包括 Setup Wizard 等

---

## Gateway（核心服务）

Gateway 是整个系统的核心，只有一个，就是 OpenClaw 上游的 gateway 代码。

- 入口文件：`dist/entry.js`
- 启动命令：`node dist/entry.js gateway --port <端口号>`
- 功能：HTTP 服务（API + 静态文件 serve）、WebSocket、插件系统、消息渠道管理等

### 端口约定

| 端口 | 场景 | 由谁启动 |
|------|------|----------|
| **18789** | CLI 模式（终端手动启动） | 开发者在终端执行 `pnpm gateway:dev` |
| **19002** | 桌面 app 模式（Tauri 壳启动） | Tauri 壳通过 `Command::spawn` 启动 |

两个端口跑的是**完全相同的 gateway 代码**，区别仅在于：
- 谁拉起它（终端 vs Tauri）
- 监听哪个端口
- 附带的环境变量（Tauri 会注入 token、插件目录等）

19002 不是"生产端口"，18789 也不是"开发端口"——只是为了让两种启动方式可以**同时运行、互不冲突**而选了不同端口。

默认端口 18789 定义在上游代码 `src/config/paths.ts`：
```ts
export const DEFAULT_GATEWAY_PORT = 18789;
```

---

## Tauri 桌面壳

桌面壳是一个 Tauri v2 应用，角色是**窗口容器 + 进程管理器**，本身不包含业务逻辑。

### 代码位置

| 文件 | 作用 |
|------|------|
| `apps/desktop/src-tauri/tauri.conf.json` | Tauri 配置（产品名、版本、打包目标等） |
| `apps/desktop/src-tauri/src/main.rs` | 主入口 — 窗口创建、sidecar 管理、健康轮询、自动更新 |
| `apps/desktop/src-tauri/src/sidecar.rs` | sidecar 进程管理（启动/停止/重启 gateway） |
| `apps/desktop/src-tauri/src/commands.rs` | Tauri invoke 命令（启停服务、检修、更新等） |
| `apps/desktop/src-tauri/src/tray.rs` | 系统托盘菜单 |

### 启动流程

```
┌──────────────────────────────────────────────────┐
│  Tauri 壳 (Rust)                                 │
│                                                  │
│  1. 创建窗口 → 显示 splash.html（深色加载动画）     │
│  2. ensure_cn_defaults() → 写入默认配置            │
│  3. start_sidecar() → 启动 Node.js 子进程          │
│     → node dist/entry.js gateway --port 19002     │
│  4. poll_and_navigate() → 轮询 /health 等待就绪    │
│  5. 根据 needsSetup 决定导航目标：                  │
│     - true  → http://127.0.0.1:19002/setup        │
│     - false → http://127.0.0.1:19002/#token=...   │
│  6. start_sidecar_watchdog() → 崩溃自动重启        │
│  7. 后台检查自动更新（Sparkle/NSIS）                │
└──────────────────────────────────────────────────┘
```

### 桌面壳对 Gateway 的管理

- **启动前**：`ensure_cn_defaults()` 写入 `~/.openclaw/openclaw.json` 默认配置（启用 cn-adapter 插件、设置 gateway.mode=local）
- **启动**：以 sidecar 方式 spawn 子进程，传入 token、插件目录、状态目录等环境变量
- **健康检查**：轮询 `/health`，最多等 90 秒
- **崩溃恢复**：watchdog 每 5 秒检测，gateway 挂了自动清理孤儿进程并重启（最多 5 次）
- **退出清理**：关闭窗口时 kill 掉 gateway 及其所有子进程

### 打包目标

- macOS: `.dmg`
- Windows: NSIS 安装包

前端部分直接用 gateway serve 的 ui-cn 静态文件（`frontendDist` 指向 `ui-cn/dist`）。

---

## Setup Wizard（首次配置向导）

Setup Wizard 不是 ui-cn 导航中的一个 tab，而是 cn-adapter 插件注册的独立 HTTP 路由。

### 代码位置

| 文件 | 作用 |
|------|------|
| `extensions/cn-adapter/setup/setup-wizard.ts` | 主入口，HTTP 路由分发 |
| `extensions/cn-adapter/setup/setup-page.ts` | 页面 HTML 渲染 |
| `extensions/cn-adapter/setup/setup-wizard-handlers.ts` | 各步骤的处理逻辑 |
| `extensions/cn-adapter/setup/setup-wizard-state.ts` | 状态管理 |
| `extensions/cn-adapter/setup/setup-wizard-types.ts` | 类型定义 |
| `extensions/cn-adapter/setup/setup-wizard-utils.ts` | 工具函数 |

### 访问方式

- 地址：`http://localhost:<端口>/setup`
- 前提：cn-adapter 插件已启用

### 配置步骤

1. 配置模型提供商（API key 验证）
2. 配置工作目录
3. 配置安全选项
4. 配置消息渠道

### 安全模型

- Setup 完成后（`config.setup.completedAt` 存在），所有 `/api/setup/*` 端点返回 `410 Gone`
- 所有写操作端点强制 loopback-only（只能从 localhost 访问）
- `/browse-directory` 限制只能浏览用户主目录及指定安全路径

### 自动弹出逻辑

两条路径协同工作：

1. **Tauri 桌面壳路径**：轮询 `/health`，检查响应中的 `needsSetup` 字段，为 `true` 时直接导航到 `/setup`
2. **浏览器路径**：cn-adapter 的 HTTP route handler 在非豁免路径（非 `/api/`、`/assets/` 等）检测到需要 setup 时，302 重定向到 `/setup`

#### 请求处理管线顺序（关键）

Gateway 的 HTTP 请求处理管线中，**插件路由优先于健康探针**：

```
... → Plugin HTTP Routes → Control UI → Gateway Probes (/health)
```

cn-adapter 注册了 `path: "/"`, `match: "prefix"` 的路由，匹配所有路径。因此 `/health` 请求会先经过 cn-adapter 的路由处理，而非上游的 gateway-probes 阶段。cn-adapter 在此处特殊处理健康路径：返回标准健康响应并注入 `needsSetup` 字段。

---

## 本地开发方式

### 方式 1：纯终端（不需要 Tauri 壳）

```bash
pnpm install                   # 安装依赖
pnpm cn:gateway                # 一键启动（自动补配置、构建 ui-cn、启动 gateway 端口 18789）
# 浏览器打开 http://localhost:18789
```

> 注：`scripts/dev-cn-setup.sh` 已不存在，`pnpm cn:gateway` 已包含全部初始化逻辑。

如需 ui-cn 热更新：
- 终端 1：`pnpm gateway:dev`
- 终端 2：`cd ui-cn && npx vite`（端口 5173，代理到 18789）

### 方式 2：Tauri 桌面 app

Tauri 壳会自动启动 gateway（端口 19002）并在 WebView 中展示 UI。

开发模式下如果检测到端口已被占用，Tauri 会跳过 sidecar 启动，直接连接外部 gateway。

---

## 导航系统（ui-cn）

ui-cn 的页面导航定义在 `ui-cn/src/ui/navigation.ts`。

### 主导航标签

chat, model-config, channels, agents, skills, extensions, cron, config

### "更多"区域标签

workspace, overview, usage, network, sessions, debug, logs

### 其他页面（不在导航栏中）

- feedback — 反馈页
- docs — 文档页
- `/setup` — Setup Wizard（cn-adapter 插件路由，不在 ui-cn 导航系统中）
