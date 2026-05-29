# CN Adapter — OpenClawCN 中国区适配插件

> 版本：0.1.0 | 许可：MIT | 包名：`@openclaw-cn/cn-adapter`

## 简介

CN Adapter 是 OpenClawCN 的核心插件，为中国区用户提供模型适配、安全控制、本地化、语音等定制化功能。采用**最小 Patch + 最大插件化**的架构，通过 OpenClaw 插件 API（hooks / gateway / CLI / provider）实现，不修改上游源码。

## 功能清单

| 功能             | 模块                         | 说明                                                                                         |
| ---------------- | ---------------------------- | -------------------------------------------------------------------------------------------- |
| 中文 Prompt 注入 | `hooks/prompt-inject`        | 自动识别 zh-CN/zh-TW，在 prompt 构建前注入中文系统指令                                       |
| 国产模型支持     | `cn-providers/`              | 硅基流动 SiliconFlow + 火山引擎 Embedding（上游已覆盖 MiniMax/Moonshot/Qwen/豆包/千帆/小米） |
| 模型路由         | `hooks/model-resolve`        | 按配置覆盖默认模型 provider + model                                                          |
| 安全三档控制     | `hooks/security-tier`        | full / balanced / safe 三级安全策略，默认 full（满血模式）                                   |
| 工具过滤         | `hooks/tool-filter`          | 基于意图的 dispatch 引擎，按需启用                                                           |
| 搜索降级         | `hooks/search-fallback`      | 无 API Key 时自动 fallback 到替代搜索方案                                                    |
| 代理路由         | `hooks/proxy-router`         | HTTP 代理自动配置，支持 noProxy 白名单                                                       |
| 记忆系统         | `hooks/memory-hooks`         | CN profile 注入 + 压缩归档 + 对话摘要                                                        |
| 配置迁移         | `cn-defaults/migration`      | v1→v2→v3 自动升级，3 级合并策略（fill-empty / deep-merge / force-overwrite）                 |
| 数据迁移         | `cn-defaults/data-migration` | 旧用户数据自动迁移 + 旧版安装检测                                                            |
| Dispatch 引擎    | `dispatch/`                  | 意图分类 + 工具发现 + DAG 编排执行 + 结果合并                                                |
| 语音系统         | `voice/`                     | 火山引擎 ASR + OpenAI Whisper + 本地引擎，硬件检测 + 分级路由                                |
| 媒体存储         | `media/`                     | SQLite 元数据 + 磁盘文件管理（图片 + 视频）                                                  |
| Copilot 代理     | `copilot-compat/`            | IDE Copilot 插件走国产模型的兼容代理层                                                       |
| OEM 品牌系统     | `oem/`                       | 多品牌定制（logo / 名称 / 主题），动态加载                                                   |
| 匿名遥测         | `telemetry/cn-telemetry`     | agent_end hook，本地 JSONL 文件存储，可通过配置关闭                                          |
| OpenTelemetry    | `telemetry/`                 | OTLP HTTP 导出，兼容 Jaeger / Grafana Tempo                                                  |

## 注册流程

插件在 `register()` 中按 6 步顺序注册：

```
Step 1  API 兼容性检测     验证 7 个必需方法（on/registerGatewayMethod/registerTool/...）
Step 2  Gateway methods    注册所有 gateway 端点（见下表）
Step 3  Hook 注册          注册 9 个 hook 处理器（见下表）
Step 4  CLI 注册           注册 5 组 CLI 命令
Step 5  配置版本检查        检测并提示配置升级
Step 6  数据迁移           运行数据迁移 + 旧版安装检测
```

## Hook 注册表

| Hook 事件              | 处理器                | 优先级 | 说明                     |
| ---------------------- | --------------------- | ------ | ------------------------ |
| `before_prompt_build`  | prompt-inject         | 100    | 中文系统指令注入         |
| `before_prompt_build`  | memory-profile-inject | 80     | CN profile 记忆注入      |
| `before_model_resolve` | model-resolve         | 100    | 模型 provider/model 覆盖 |
| `before_tool_call`     | security-tier         | **50** | 安全策略过滤（最先执行） |
| `before_tool_call`     | search-fallback       | 90     | 搜索降级处理             |
| `before_tool_call`     | tool-filter           | 100    | 意图工具过滤             |
| `before_compaction`    | compaction-archive    | —      | 压缩时归档记忆           |
| `agent_end`            | session-summary       | —      | 对话结束时生成摘要       |
| `agent_end`            | telemetry             | —      | 匿名遥测收集             |

> 优先级数字越小越先执行。security-tier(50) 在所有 `before_tool_call` 中最先执行。

## Gateway 方法

### 核心方法（cn-adapter/index.ts 直接注册）

| 方法名          | 说明                                                 |
| --------------- | ---------------------------------------------------- |
| `cn.status`     | 插件状态（版本 / pluginId / status / configVersion） |
| `cn.config.get` | 获取当前 CN 配置快照                                 |

### 业务方法（gateway/handlers.ts）

| 方法名                     | 说明                          |
| -------------------------- | ----------------------------- |
| `cn.marketplace.search`    | 插件市场搜索                  |
| `cn.marketplace.recommend` | 插件推荐                      |
| `cn.support.qrcode`        | 技术支持二维码                |

### 内部 RPC 方法（gateway/internal.ts）

| 方法名                        | 说明                        |
| ----------------------------- | --------------------------- |
| `cn.internal.adapter.version` | 适配器版本 + API 版本       |
| `cn.internal.adapter.health`  | 健康检查（status + uptime） |
| `cn.internal.config.snapshot` | 配置快照（插件间通信用）    |

> 此外 voice / media / copilot-compat / oem 模块各自注册额外的 gateway method。

## 配置说明

配置通过 OpenClaw 插件配置系统管理，所有字段可选：

| 字段                    | 类型                                  | 默认值    | 说明                            |
| ----------------------- | ------------------------------------- | --------- | ------------------------------- |
| `configVersion`         | `number`                              | —         | 配置 schema 版本号              |
| `locale`                | `string`                              | `"zh-CN"` | 语言区域                        |
| `securityTier`          | `"full" \| "balanced" \| "safe"`      | `"full"`  | 安全等级                        |
| `toolFilterMode`        | `"off" \| "intent"`                   | —         | 工具过滤模式                    |
| `models.default`        | `{ provider, model }`                 | —         | 默认模型覆盖                    |
| `mirror.npm`            | `string`                              | —         | npm 镜像地址                    |
| `mirror.pip`            | `string`                              | —         | pip 镜像地址                    |
| `proxy.enabled`         | `boolean`                             | —         | 启用 HTTP 代理                  |
| `proxy.noProxy`         | `string[]`                            | —         | 代理白名单                      |
| `telemetry`             | `boolean`                             | —         | 匿名遥测开关                    |
| `updateChannel`         | `"stable" \| "beta" \| "dev"`         | —         | 更新通道                        |
| `searchApiKey`          | `string`                              | —         | 搜索服务 API Key                |
| `voice.engine`          | `"local" \| "volcengine" \| "openai"` | —         | 语音引擎                        |
| `voice.language`        | `string`                              | —         | 语音语言                        |
| `voice.kwsEnabled`      | `boolean`                             | —         | 关键词唤醒                      |
| `copilotProxy.enabled`  | `boolean`                             | —         | 启用 Copilot 代理               |
| `copilotProxy.provider` | `string`                              | —         | Copilot 代理 provider           |
| `copilotProxy.baseUrl`  | `string`                              | —         | Copilot 代理 URL                |
| `copilotProxy.apiKey`   | `string`                              | —         | Copilot 代理 Key                |
| `copilotProxy.model`    | `string`                              | —         | Copilot 代理模型                |
| `otel.enabled`          | `boolean`                             | —         | 启用 OpenTelemetry              |
| `otel.endpoint`         | `string`                              | —         | OTLP HTTP 端点（仅 http/https） |

### 安全等级说明

| 等级       | 行为                                                                                         |
| ---------- | -------------------------------------------------------------------------------------------- |
| `full`     | 满血模式，所有工具可用（默认，兼容 clawdbot 老用户习惯）                                     |
| `balanced` | 工作目录限制 + 执行类工具需确认                                                              |
| `safe`     | 白名单模式，仅允许 read_file / list_files / search / web_search / memory_get / memory_search |

## CLI 命令

```bash
openclaw cn-setup          # 首次设置向导（交互式配置生成）
openclaw cn-migrate        # 旧版配置迁移（支持 --dry-run 预览）
openclaw cn-uninstall      # 卸载清理
openclaw cn-rule           # 自然语言规则编译（将自然语言转为工具过滤规则）

# 中文命令别名
openclaw 帮助              # 等同于 help
openclaw 状态              # 等同于 status
openclaw 配置              # 等同于 config
openclaw 升级              # 等同于 upgrade
```

## 目录结构

```
cn-adapter/
├── index.ts               # 插件入口（6 步注册流程）
├── package.json           # @openclaw-cn/cn-adapter
├── hooks/                 # Hook 处理器
│   ├── prompt-inject.ts   # 中文 prompt 注入
│   ├── model-resolve.ts   # 模型路由
│   ├── security-tier.ts   # 安全三档
│   ├── tool-filter.ts     # 工具过滤
│   ├── search-fallback.ts # 搜索降级
│   ├── proxy-router.ts    # 代理路由
│   ├── memory-hooks.ts    # 记忆系统
│   ├── cn-config.ts       # 配置类型 + 提取
│   └── index.ts           # barrel export
├── cli/                   # CLI 命令
│   ├── cn-setup.ts
│   ├── cn-migrate.ts
│   ├── cn-commands.ts     # 中文别名
│   ├── cn-uninstall.ts
│   └── cn-rule.ts
├── gateway/               # Gateway 方法
│   ├── handlers.ts        # 业务方法（marketplace/support）
│   └── internal.ts        # 内部 RPC（cn.internal.*）
├── cn-providers/          # 国产模型 Provider
│   ├── siliconflow.ts     # 硅基流动
│   └── embedding.ts       # 火山引擎 Embedding
├── cn-defaults/           # 配置 + 数据迁移
│   ├── migration.ts       # 配置迁移 v1→v2→v3
│   └── data-migration.ts  # 数据迁移
├── dispatch/              # Dispatch 编排引擎
│   ├── intent-classifier.ts
│   ├── tool-discovery.ts
│   ├── tool-filter-rules.ts
│   ├── dag-executor.ts    # DAG 拓扑执行
│   ├── step-runner.ts
│   ├── result-merger.ts
│   ├── orchestrator.ts    # 编排入口
│   ├── execution-workspace.ts
│   └── types.ts
├── voice/                 # 语音系统
├── media/                 # 媒体存储
├── copilot-compat/        # Copilot 兼容代理
├── oem/                   # OEM 品牌系统
├── telemetry/             # 遥测 + OTEL
├── utils/                 # 工具函数
│   ├── safe-hook.ts       # hook/gateway 安全包装
│   ├── logger.ts          # CN 日志工具
│   ├── config-path.ts     # 配置路径工具
│   └── index.ts
├── templates/             # 代码生成模板
└── __tests__/             # 测试（16 文件，141 测试）
```

## 开发指南

### 添加新 Hook

1. 在 `hooks/` 下创建 `my-hook.ts`，导出 `createMyHookHandler(getConfig)` 工厂函数
2. 在 `hooks/index.ts` 中添加 export
3. 在 `index.ts` 的 Step 3 中用 `api.on()` 注册，设置合适的 priority
4. 所有 hook 必须用 `safeHook()` 包装（异常不会 crash 宿主）

### 添加新 Gateway Method

1. 在 `gateway/handlers.ts`（业务）或 `gateway/internal.ts`（内部 RPC）中添加
2. 方法名必须以 `cn.` 前缀命名（如 `cn.myFeature.action`）
3. 用 `safeGateway()` 包装
4. 错误码使用 `CN_` 前缀（如 `CN_INVALID_PARAMS`）

### 添加新 CLI 命令

1. 在 `cli/` 下创建 `cn-mycommand.ts`，导出 `registerCnMyCommand(program)` 函数
2. 在 `index.ts` 的 Step 4 中用 `api.registerCli()` 注册

### 添加新 Provider

1. 在 `cn-providers/` 下创建 `my-provider.ts`，导出 `buildMyProvider()` 函数
2. 在 `cn-providers/index.ts` 中导入并在 `registerCnProviders()` 中调用 `api.registerProvider()`

## 兼容性

- 需要 OpenClaw >= 2026.3.2
- 需要 7 个插件 API 方法：`on` / `registerGatewayMethod` / `registerTool` / `registerHook` / `registerService` / `registerCli` / `registerProvider`
- Copilot 代理需要额外的 `registerHttpRoute` API（可选）
