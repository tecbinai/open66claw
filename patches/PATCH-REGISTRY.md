# OpenClawCN Patch 登记表

> 原则：能用插件 hook 解决的不 patch，patch 了的要记录、要追踪、要尝试 PR 回上游。
> 每个 patch 必须回答 5 个问题：改了哪里、为什么、什么时候改的、能不能消除、谁负责。

---

## Patch 总览

| # | 名称 | 文件 | 状态 | 上游 PR | 能否消除 |
|---|------|------|------|---------|---------|
| 1 | safe-stream | attempt.ts ~L1780 | 待实施 | 待提交 | 能（需上游加 `llm_stream_error` hook） |
| 2 | mcp-on-demand | attempt.ts ~L1150 | 待实施 | 待提交 | 能（需上游加 `before_session_create` hook） |
| 3 | agent-route | 待定 | 待设计 | 待提交 | 能（需上游加 `before_agent_route` hook） |
| 4 | ws-origin | ws-connection.ts ~L129 | 已实施 | 待提交 | 能（需上游原生支持 Origin 白名单配置） |

**当前 patch 数：4（目标上限 5，超过必须架构评审）**

---

## Patch #1: safe-stream

### 基本信息

| 字段 | 值 |
|------|---|
| 名称 | safe-stream |
| 文件 | `src/agents/pi-embedded-runner/run/attempt.ts` |
| 位置 | ~L1780（`activeSession.prompt()` 调用处） |
| 登记日期 | 2026-03-08 |
| 实施日期 | — |
| 负责人 | — |

### 为什么要改？

`activeSession.prompt()` 流式调用出错时，`llm_output` hook 只在成功时触发（L2005），流式中断没有任何 hook 可以捕获。插件无法：
- 自定义错误处理（如自动重试、切换 provider）
- 记录失败的 LLM 调用（可观测性盲区）
- 向用户返回友好的降级响应

### 改了什么？

在 `activeSession.prompt()` 的 try-catch 中增加错误包装 + 插件通知能力。

```typescript
// BEFORE (上游原始)
try {
  await abortable(activeSession.prompt(effectivePrompt, options));
} catch (err) {
  promptError = err;
  promptErrorSource = "prompt";
}

// AFTER (patch)
try {
  await abortable(activeSession.prompt(effectivePrompt, options));
} catch (err) {
  // PATCH: CN safe-stream — graceful error handling + plugin notification
  promptError = err;
  promptErrorSource = "prompt";
  // 通知插件流式错误（如果 hook 存在）
  // 允许插件决定：重试 / 降级响应 / 抑制错误
}
```

### 消除条件

上游接受新增 `llm_stream_error` hook（在 attempt.ts L1784 catch 块内触发）。
一旦上游合并，此 patch 可完全删除，改用 hook 实现。

### 上游 PR 策略

- PR 标题：`feat(hooks): add llm_stream_error hook for streaming failure handling`
- 卖点：通用能力，任何插件都可能需要处理流式错误
- 接受概率：**高**（不涉及安全，纯扩展能力）

### 应用与验证

| 操作 | 命令 |
|------|------|
| 检查可否应用 | `git apply --check patches/001-safe-stream.patch` |
| 应用 | `git apply patches/001-safe-stream.patch` |
| 撤销 | `git apply --reverse patches/001-safe-stream.patch` |
| 验证生效 | `grep -n "llm_stream_error" src/agents/pi-embedded-runner/run/attempt.ts` |
| 批量应用 | `bash scripts/apply-patches.sh` |

### 冲突风险评估

| 风险等级 | 说明 |
|----------|------|
| **中** | attempt.ts 是上游高频改动文件 |
| 关注区域 | L1780-L1810（`activeSession.prompt()` catch 块） |
| 触发条件 | 上游修改 catch 块结构、重构 prompt 调用方式、或自己加了 stream error 处理 |
| 检测方式 | CI 中 `git apply --check` + 编译 + 运行 smoke test |
| 历史频率 | 该区域近 3 个月改动 2 次（错误消息格式调整） |

### 上游 PR 文档

- 描述：`dev/upstream-prs/pr-a-llm-stream-error-hook/PR-DESCRIPTION.md`
- 实现指南：`dev/upstream-prs/pr-a-llm-stream-error-hook/implementation-guide.md`
- 测试方案：`dev/upstream-prs/pr-a-llm-stream-error-hook/test-plan.md`

### 后续跟踪

- [ ] 实施 patch
- [ ] 提交上游 PR
- [ ] 上游合并后删除 patch

---

## Patch #2: mcp-on-demand

### 基本信息

| 字段 | 值 |
|------|---|
| 名称 | mcp-on-demand |
| 文件 | `src/agents/pi-embedded-runner/run/attempt.ts` |
| 位置 | ~L1150（`splitSdkTools()` 前，`createAgentSession()` 前） |
| 登记日期 | 2026-03-08 |
| 实施日期 | — |
| 负责人 | — |

### 为什么要改？

MCP server 需要按需加载（用户配了 50 个 MCP server，但每次对话只用 2-3 个）。
上游的 tool 注册时序决定了 **没有任何 hook 能在 tool 冻结前注入新工具**：

```
L1148  hookRunner = getGlobalHookRunner()
L1150  splitSdkTools()          ← tool 收集
L1177  allCustomTools = [...]   ← tool 合并
L1179  createAgentSession()     ← tool 冻结 ════════ 此后不可再注入
L1631  before_prompt_build      ← 太晚了
```

代码验证确认：
- `before_model_resolve`：只返回 modelOverride/providerOverride，不能返回 tools
- `before_prompt_build`：L1631 触发，session 已创建，tools 已冻结
- `before_tool_call`：只能拦截已注册的 tool，不能注册新 tool

### 改了什么？

在 `splitSdkTools()` 之前，根据上下文按需加载 MCP server，将其 tool 注入到后续的 tool 列表中。

```typescript
// PATCH: CN mcp-on-demand — tool 构造前按需加载 MCP server
await loadOnDemandMcpServers(toolRequest, session);
// ... 然后正常执行 splitSdkTools()
```

### 消除条件

上游接受新增 `before_session_create` hook（在 L1150 和 L1179 之间触发），允许插件返回 `additionalTools`。

### 上游 PR 策略

- PR 标题：`feat(hooks): add before_session_create hook for dynamic tool injection`
- 卖点：MCP on-demand 是通用需求，EasyClaw 也有类似实现
- 接受概率：**低-中**（涉及 tool 安全边界，上游可能有顾虑）

### 应用与验证

| 操作 | 命令 |
|------|------|
| 检查可否应用 | `git apply --check patches/002-mcp-on-demand.patch` |
| 应用 | `git apply patches/002-mcp-on-demand.patch` |
| 撤销 | `git apply --reverse patches/002-mcp-on-demand.patch` |
| 验证生效 | `grep -n "before_session_create" src/agents/pi-embedded-runner/run/attempt.ts` |
| 批量应用 | `bash scripts/apply-patches.sh` |

### 冲突风险评估

| 风险等级 | 说明 |
|----------|------|
| **高** | 修改 tool 组装逻辑，attempt.ts 该区域变动频繁 |
| 关注区域 | L1150-L1179（`splitSdkTools` → `createAgentSession` 之间） |
| 触发条件 | 上游重构 tool 收集流程、修改 `allCustomTools` 变量、改动 `createAgentSession` 签名 |
| 检测方式 | CI 中 `git apply --check` + 编译 + 验证 tool 注入 e2e |
| 历史频率 | 该区域近 3 个月改动 3 次（MCP 集成、tool 类型重构） |

### 上游 PR 文档

- 描述：`dev/upstream-prs/pr-b-before-session-create-hook/PR-DESCRIPTION.md`
- 实现指南：`dev/upstream-prs/pr-b-before-session-create-hook/implementation-guide.md`
- 测试方案：`dev/upstream-prs/pr-b-before-session-create-hook/test-plan.md`

### 后续跟踪

- [ ] 实施 patch
- [ ] 提交上游 PR
- [ ] 上游合并后删除 patch
- [ ] 如上游长期不接受，维护为永久 patch

---

## Patch #3: agent-route

### 基本信息

| 字段 | 值 |
|------|---|
| 名称 | agent-route |
| 文件 | 待定（可能是 `src/agents/` 下的消息路由入口） |
| 位置 | 待定 |
| 登记日期 | 2026-03-08 |
| 实施日期 | — |
| 负责人 | — |

### 为什么要改？

clawdbot 的 agent-team 扩展（2530 行 + 22 模块）依赖 `resolve_agent` hook 实现三层快速路由：
1. Session Affinity（<5ms）— 粘性路由到上次对话的 agent
2. Keyword Match（<10ms）— CJK 感知的关键词匹配
3. Supervisor LLM fallback — 交给上级 agent 决策

**上游在 v2026.3.x 移除了 `resolve_agent` hook**，没有提供等价替代。

现有 hook 能力分析：
- `subagent_spawning`：只做线程绑定，Result 只有 ok/error，不能改路由目标
- `message_received`：void hook，无返回值，不能影响路由
- `before_prompt_build`：可以注入指令让 LLM 自己 spawn，但从 <5ms 退化到 ~500ms

**这不是我们的改动导致的**，是上游自己删了这个 hook。

### 改了什么？

（待设计）新增一个路由决策点，在消息分发到 agent 之前，允许插件返回目标 agentId。

```typescript
// 伪代码 — 具体位置待定
// PATCH: CN agent-route — 消息级路由决策
const routeResult = await hookRunner.runBeforeAgentRoute({
  from: message.from,
  content: message.content,
  channel: message.channel,
  metadata: message.metadata,
});
if (routeResult?.agentId) {
  targetAgentId = routeResult.agentId;  // 路由到插件指定的 agent
}
```

### 消除条件

上游恢复类似 `resolve_agent` 的 hook，或新增 `before_agent_route` hook。

### 上游 PR 策略

- PR 标题：`feat(hooks): add before_agent_route hook for message-level routing`
- 卖点：多 agent 团队是企业级刚需，上游自己砍了但没提供替代
- 接受概率：**中**（功能有价值，但上游可能认为 LLM 自主 spawn 才是正确方向）

### 应用与验证

> ⚠️ Patch #3 尚未实施，以下为预计命令。

| 操作 | 命令 |
|------|------|
| 检查可否应用 | `git apply --check patches/003-agent-route.patch` |
| 应用 | `git apply patches/003-agent-route.patch` |
| 撤销 | `git apply --reverse patches/003-agent-route.patch` |
| 验证生效 | `grep -n "before_agent_route" src/agents/（待定文件）` |
| 批量应用 | `bash scripts/apply-patches.sh` |

### 冲突风险评估

| 风险等级 | 说明 |
|----------|------|
| **未知** | 具体改动文件和位置待定 |
| 触发条件 | 上游修改 agent 消息分发逻辑 |
| 缓解措施 | Phase 5 前先定位代码位置，再评估 |

### 设计约束

- Phase 5 才需要（agent-team 搬迁阶段），不阻塞 Phase 0-4
- 先试 0 patch 方案（`before_prompt_build` 注入指令），效果不好再启用此 patch
- 需要先定位上游消息路由入口的具体代码位置

### 后续跟踪

- [ ] Phase 5 前：定位上游消息路由入口代码
- [ ] Phase 5 前：先试 0 patch 方案（LLM 指令转交），评估延迟和可靠性
- [ ] 如 0 patch 不满足要求：设计并实施 patch
- [ ] 提交上游 PR
- [ ] 上游合并后删除 patch

---

## Patch #4: ws-origin

### 基本信息

| 字段 | 值 |
|------|---|
| 名称 | ws-origin |
| 文件 | `src/gateway/server/ws-connection.ts` |
| 位置 | ~L129（`wss.on("connection")` 内，headers 提取完毕后，`canvasHostPortForWs` 赋值前） |
| 登记日期 | 2026-03-13 |
| 实施日期 | 2026-03-13 |
| 负责人 | CN Security Team |

### 为什么要改？

WebSocket 连接缺乏 Origin 校验，恶意网页可通过浏览器向本地 Gateway 发起 WebSocket 连接，
读取对话内容、注入指令（类 CSRF 攻击）。

上游现有检查（`requestOrigin` 已提取但仅用于日志），没有任何 hook 能在握手阶段拒绝连接：
- `before_agent_start`：握手已完成，太晚
- `message_received`：void hook，无返回值，不能关闭连接

### 改了什么？

在 header 提取后（L128）、业务逻辑开始前（L130），插入 Origin 白名单校验：

```typescript
// CN-PATCH: ws-origin (G1) — 当 OPENCLAW_CN_STRICT_ORIGIN=1 时拒绝非本机 Origin
if (process.env.OPENCLAW_CN_STRICT_ORIGIN === "1" && requestOrigin) {
  let originAllowed = false;
  try {
    const originHost = new URL(requestOrigin).hostname;
    originAllowed = originHost === "localhost" || originHost === "127.0.0.1" || originHost === "::1";
  } catch { /* URL 解析失败 → 拒绝 */ }
  if (!originAllowed) {
    socket.close(1008, "Origin not allowed");
    return;
  }
}
```

激活条件：环境变量 `OPENCLAW_CN_STRICT_ORIGIN=1`（Docker CN overlay 默认开启）。

### 消除条件

上游在 WS 握手处原生支持 `allowedOrigins` 配置项，插件可通过 config 传入白名单。

### 上游 PR 策略

- PR 标题：`feat(gateway): add configurable WebSocket origin allowlist for CSRF protection`
- 卖点：安全加固，防止恶意网页 CSRF 攻击本地 Gateway，对所有部署场景均有价值
- 接受概率：**中-高**（纯安全加固，不破坏现有功能，可选开启）

### 应用与验证

| 操作 | 命令 |
|------|------|
| 检查可否应用 | `git apply --check patches/004-ws-origin.patch` |
| 应用 | `git apply patches/004-ws-origin.patch` |
| 撤销 | `git apply --reverse patches/004-ws-origin.patch` |
| 验证生效 | `OPENCLAW_CN_STRICT_ORIGIN=1` 下非 localhost Origin 的 WS 握手应返回 1008 |
| 批量应用 | `bash scripts/apply-patches.sh` |

### 冲突风险评估

| 风险等级 | 说明 |
|----------|------|
| **低** | 插入点紧跟 header 提取逻辑，该区域稳定 |
| 关注区域 | L122-L130（headerValue 辅助函数 + header 提取） |
| 触发条件 | 上游重构 WS 连接初始化、重命名 requestOrigin 变量 |
| 检测方式 | CI 中 `git apply --check` + 编译 + WS smoke test |
| 历史频率 | 该区域近 3 个月无改动 |

### 后续跟踪

- [x] 实施 patch（2026-03-13）
- [ ] 提交上游 PR
- [ ] 上游合并后删除 patch

---

## Patch 管理规范

### 1. 新增 patch 流程

```
发现 hook 覆盖不了的需求
    ↓
先尝试 workaround（hook 组合、LLM 指令、配置）
    ↓
workaround 不可接受（性能/可靠性/用户体验）
    ↓
在本文档登记 patch（填写 5 个问题）
    ↓
实施 patch → patches/ 目录维护 .patch 文件
    ↓
提交上游 PR（附带建议新增的 hook）
    ↓
CI 每次上游发版自动 git apply + 编译 + smoke test
    ↓
上游合并 → 删除 patch → 改用 hook
```

### 2. patch 文件命名

```
patches/
├── 001-safe-stream.patch
├── 002-mcp-on-demand.patch
├── 003-agent-route.patch       (待实施)
├── 004-ws-origin.patch         (已实施)
└── PATCH-REGISTRY.md           (本文档)
```

### 3. CI 护栏

```yaml
# .github/workflows/cn-upstream-watch.yml 中的 verify-compat job
- run: |
    git apply patches/*.patch
    # 失败 → 自动创建 issue + 告警
    # 成功 → 继续 build + smoke test
```

### 4. 红线

- **patch 总数上限 5 个**：超过必须做架构评审，说明插件化方案有系统性缺口
- **禁止修改 config 加载管线**：config 相关全部用安装器/升级脚本解决
- **禁止修改 plugin 加载机制**：loader/discovery/registry 是信任基座，不能动
- **每个 patch 必须有上游 PR**：不接受"偷偷改了不说"

### 5. 定期审查

每个 Phase 结束时审查本文档：
- 已消除的 patch → 标记为 `已删除`，保留记录
- 新发现的需求 → 先走 workaround，不行再登记
- 上游 PR 进展 → 更新状态

---

## 变更记录

| 日期 | 变更 | 说明 |
|------|------|------|
| 2026-03-08 | 创建文档 | 登记 3 个 patch（#1 #2 待实施，#3 待设计） |
| 2026-03-09 | 补充运维信息 | 每个 patch 增加应用/验证命令 + 冲突风险评估 + 上游 PR 文档链接 |
