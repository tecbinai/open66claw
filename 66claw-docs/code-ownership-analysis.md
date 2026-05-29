# 66claw vs OpenClaw 代码归属分析

> 本文档梳理仓库中所有代码的归属关系：哪些是 OpenClaw 上游原生代码，哪些是 66claw 新增或修改的代码，以及二者的边界和耦合点。

---

## 一、总览

仓库采用 **"最小补丁 + 最大插件"** 的架构策略：

- **~90% 的 66claw 代码** 位于独立目录中，与上游代码物理隔离
- **~10% 的改动** 散落在上游文件中，主要是 CLI dev 模式清理和配置调整
- 上游 OpenClaw 核心业务逻辑几乎未被修改

---

## 二、OpenClaw 上游原生代码

以下目录和文件属于 OpenClaw 上游，66claw 未做修改或仅做极少量改动：

| 目录/文件 | 说明 |
|-----------|------|
| `src/` (大部分) | CLI、Gateway、消息渠道、路由、媒体管线等核心逻辑 |
| `extensions/` (非 cn-adapter/feishu-cn-enhance) | 上游扩展插件（msteams, matrix, zalo 等） |
| `docs/` | 上游文档（含 zh-CN 翻译管线） |
| `ui/` | 上游原生 Control UI |
| `apps/ios/`, `apps/android/`, `apps/macos/` | 上游移动端和 macOS 原生应用 |
| `dist/` | 构建产物 |
| `.github/` (非 cn-* workflow) | 上游 CI/CD、Issue/PR 模板 |
| `scripts/` (非 dev-cn-setup.sh) | 上游构建/发布/工具脚本 |
| 根目录配置文件 | `tsconfig.json`, `vitest.config.ts`, `pnpm-lock.yaml` 等 |

---

## 三、66claw 独立新增代码

### 3.1 核心模块

| 目录 | 文件数 | 说明 |
|------|--------|------|
| `ui-cn/` | ~600 | 完整的 CN 定制前端 UI（LitElement + Vite 独立构建） |
| `extensions/cn-adapter/` | ~161 TS | CN 核心适配插件 |
| `extensions/feishu-cn-enhance/` | ~17 TS | 飞书增强插件 |
| `apps/desktop/src-tauri/` | ~546 | Tauri 2.0 桌面壳（替代上游 Electron） |

#### ui-cn（CN 前端）

独立于上游 `ui/` 的完整前端实现：
- `src/ui/views/` — 页面视图（chat, config, cron, skills, model-config 等）
- `src/ui/controllers/` — 状态管理与业务逻辑
- `src/shared/` — 共享工具与类型
- `src/docscn/` — CN 文档集成
- `src/styles/` — 样式表
- `public/` — 静态资源（logo、OEM 品牌图、背景图等）
- 独立 `package.json`（不在 pnpm workspace 中）
- 独立 `vite.config.ts` 构建配置

#### cn-adapter（核心适配插件）

通过 OpenClaw 插件系统注册，包含：

| 子模块 | 功能 |
|--------|------|
| `hooks/` (9 个) | before_prompt_build, before_model_resolve, before_tool_call 等 |
| `gateway/` | Marketplace/Support 等 RPC 方法 |
| `cli/` | cn-setup, cn-migrate, cn-uninstall, cn-rule 等命令 |
| `cn-providers/` | SiliconFlow 等国产 LLM 提供商适配 |
| `cn-defaults/` | 配置迁移（v1 → v2 → v3） |
| `dispatch/` | 意图分类 + DAG 执行引擎 |
| `voice/` | 火山引擎 ASR / Whisper / 本地语音 |
| `media/` | SQLite + 磁盘文件管理 |
| `copilot-compat/` | IDE Copilot 代理层 |
| `oem/` | OEM 白标品牌系统 |
| `security/` | 反调试 / 内容保险箱 / 运行时加固 |
| `setup/` | Setup Wizard（首次配置向导） |
| `config-templates/` | 默认配置模板 |

#### feishu-cn-enhance（飞书增强）

扩展上游 feishu 插件：
- `src/tools/` — 日历、任务、审批、会议纪要（妙记）工具
- `src/hooks/` — 上下文注入、权限检查

#### Tauri 桌面壳

替代上游 Electron 的桌面包装：
- `src/main.rs` — 窗口创建、sidecar 管理、健康轮询
- `src/sidecar.rs` — Node.js 子进程管理
- `src/commands.rs` — Tauri invoke 命令
- `src/tray.rs` — 系统托盘
- `icons/` — 品牌图标（含 Windows/macOS/iOS/Android 多种规格）
- `nsis/` — Windows 安装器脚本

### 3.2 文档

| 路径 | 说明 |
|------|------|
| `66claw-docs/` | CN 专属文档（架构概览、自定义清单、UI 功能对比等） |

### 3.3 部署与运维

| 路径 | 说明 |
|------|------|
| `docker/cn/Dockerfile` | CN Docker 镜像（上游基础镜像 + cn-adapter 覆盖层） |
| `docker/cn/docker-compose.cn.yml` | CN 服务编排 |
| `docker/cn/seccomp-profile.json` | 容器安全策略 |
| `docker/cn/README.md` | 部署说明 |

### 3.4 安装/升级脚本（根目录散落）

| 路径 | 说明 |
|------|------|
| `install-cn.sh` | Linux/macOS 安装脚本 |
| `install-cn.ps1` | Windows 安装脚本 |
| `upgrade-cn.sh` | Linux/macOS 升级脚本 |
| `upgrade-cn.ps1` | Windows 升级脚本 |
| `openclaw.podman.env` | Podman 容器环境变量 |

### 3.5 开发脚本

| 路径 | 说明 |
|------|------|
| `scripts/dev-cn-setup.sh` | 本地开发环境一键初始化 |

### 3.6 CI/CD

| 路径 | 说明 |
|------|------|
| `.github/workflows/cn-adapter-publish.yml` | cn-adapter npm 发布（`cn-adapter-v*` 标签触发） |
| `.github/workflows/cn-security-scan.yml` | CN 代码安全扫描 |
| `.github/workflows/cn-upstream-watch.yml` | 上游变更监控 |

---

## 四、对上游文件的修改（Patch 层）

以下上游文件被 66claw 直接修改。这些改动会在每次 merge upstream 时可能产生冲突。

### 4.1 CLI dev 模式移除（主要改动）

| 文件 | 改动内容 |
|------|----------|
| `src/cli/gateway-cli/run.ts` | 移除 `dev` / `reset` 选项、`ensureDevGatewayConfig` 调用、dev profile 检测 |
| `src/cli/gateway-cli/dev.ts` | **整个文件删除**（dev workspace 创建、dev 配置初始化、C3-PO dev identity） |
| `src/infra/cli-root-options.ts` | `ROOT_BOOLEAN_FLAGS` 移除 `"--dev"` |
| `src/cli/command-format.ts` | 移除 `DEV_FLAG_RE` 正则 |
| `src/cli/program/help.ts` | 移除 `--dev` 选项说明和示例 |
| `src/cli/profile.ts` | 移除 `--dev` flag 相关逻辑 |

### 4.2 构建与脚本改动

| 文件 | 改动内容 |
|------|----------|
| `package.json` | `gateway:dev` / `gateway:dev:reset` / `tui:dev` 脚本移除 `--dev` 参数 |
| `scripts/ui.js` | 移除 `dev` action，仅保留 `install\|build\|test` |

### 4.3 文档/配置改动

| 文件 | 改动内容 |
|------|----------|
| `AGENTS.md` | 添加「CN 版本本地开发」章节（~34 行） |
| `CLAUDE.md` | 同步添加 CN 开发指南 |

### 4.4 测试文件改动

| 文件 | 改动内容 |
|------|----------|
| `src/cli/argv.test.ts` | 测试用例适配（移除 `--dev` 相关断言） |
| `src/cli/gateway-cli/run.option-collisions.test.ts` | 同上 |
| `src/cli/profile.test.ts` | 同上 |
| `src/infra/cli-root-options.test.ts` | 同上 |

---

## 五、代码量统计

| 组件 | 文件数（约） | 归属 |
|------|-------------|------|
| ui-cn | ~600 | 66claw 新增 |
| cn-adapter | ~161 TS | 66claw 新增 |
| feishu-cn-enhance | ~17 TS | 66claw 新增 |
| Tauri 桌面壳 | ~546 | 66claw 新增 |
| Docker CN | 4 | 66claw 新增 |
| CI/CD workflow | 3 | 66claw 新增 |
| 根目录安装/升级脚本 | 5 | 66claw 新增 |
| 开发脚本 | 1 | 66claw 新增 |
| 文档 | 3 | 66claw 新增 |
| **66claw 新增合计** | **~1,340+** | |
| 对上游的直接修改 | ~14 个文件 | 66claw patch |
| OpenClaw 上游其余代码 | 大量 | 未修改 |

---

## 六、耦合点分析

### 低耦合（清晰边界）

- **ui-cn** — 完全独立的前端项目，通过 HTTP/WebSocket 与 Gateway 通信，零代码依赖
- **feishu-cn-enhance** — 标准插件接口，仅依赖上游 feishu 插件的存在
- **Tauri 桌面壳** — 仅通过 HTTP 健康检查和 URL 导航与 Gateway 交互
- **Docker CN** — 纯部署层叠加，不修改源码
- **安装/升级脚本** — 独立脚本，不影响核心代码

### 中等耦合（通过插件系统）

- **cn-adapter** — 通过 OpenClaw 插件 hook 系统集成，依赖 hook API 的稳定性：
  - `before_prompt_build` — 提示词注入
  - `before_model_resolve` — 模型路由
  - `before_tool_call` — 工具过滤
  - `before_compaction` — 压缩前处理
  - `agent_end` — 会话结束处理
  - HTTP route 注册 — 健康检查拦截、Setup Wizard
  - Gateway RPC 方法注册 — Marketplace 等

  上游 hook API 变更会直接影响 cn-adapter。

### 高耦合（直接 patch）

- **CLI dev 模式移除** — 直接修改上游 `src/cli/` 下多个文件，merge upstream 时需要逐文件解决冲突
- **package.json 脚本** — 修改了上游脚本定义，上游更新脚本时会冲突

---

## 七、Merge Upstream 风险评估

| 风险等级 | 涉及文件 | 原因 |
|----------|----------|------|
| 高 | `src/cli/gateway-cli/run.ts` | 上游频繁改动 CLI 逻辑 |
| 高 | `package.json` | 上游频繁增删脚本和依赖 |
| 中 | `src/cli/gateway-cli/dev.ts`（已删除） | 上游可能恢复或重构 |
| 中 | `src/infra/cli-root-options.ts` | 上游可能增加新全局 flag |
| 低 | `src/cli/command-format.ts` | 改动量小，冲突概率低 |
| 低 | `src/cli/program/help.ts` | 改动量小 |
| 低 | `AGENTS.md` / `CLAUDE.md` | 末尾追加，通常不冲突 |
| 无 | 所有 66claw 独立目录 | 上游不存在这些文件 |

---

## 八、总结

66claw 的代码分离做得较好，绝大多数功能通过独立目录和插件系统实现，与上游保持了清晰边界。主要的合并风险集中在 CLI dev 模式移除这一组 patch 上（约 14 个文件）。如果未来能将这些 patch 的效果通过 cn-adapter 的 hook 机制实现（例如在运行时屏蔽 `--dev` 而非删除源码），可以进一步降低与上游的耦合度。
