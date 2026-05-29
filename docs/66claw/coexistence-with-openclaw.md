# 66Claw 与 OpenClaw 共存说明

## 安装兼容性

66Claw 和 OpenClaw 是**独立的 macOS 应用**，Tauri bundle identifier 不同（`com.66claw.desktop` vs OpenClaw 的原始 identifier），安装互不影响，可以同时存在于系统中。

## 共存冲突点

### 1. 共享配置目录 `~/.openclaw/`

两个应用读写**同一个** `~/.openclaw/openclaw.json` 配置文件。

66Claw 启动时通过 `ensure_cn_defaults()`（`apps/desktop/src-tauri/src/sidecar.rs:909`）自动写入 CN 特有配置：

| 配置项 | 值 | 说明 |
|--------|------|------|
| `gateway.mode` | `"local"` | 本地模式 |
| `gateway.bind` | `"loopback"` | 仅监听 127.0.0.1 |
| `plugins.entries.cn-adapter.enabled` | `true` | CN 适配器插件 |
| `plugins.entries.agent-team.enabled` | `true` | Agent Team 插件 |

这些配置采用 **fill-empty 语义**（只补缺不覆盖已有值），不会破坏 OpenClaw 的现有配置，但新增的 CN 插件配置会在 OpenClaw 启动时被读取。

### 2. 端口冲突

| 场景 | 66Claw 端口 | OpenClaw 默认端口 | 是否冲突 |
|------|------------|------------------|---------|
| 桌面端 gateway | **19002**（硬编码） | 视版本而定 | 可能 |
| CLI gateway（`pnpm cn:gateway`） | **18789** | **18789** | **冲突** |

66Claw 启动时会**自动杀死占用端口的进程**（`sidecar.rs:144 kill_port_occupant()`），如果 OpenClaw 正在使用相同端口，其 gateway 进程会被误杀。

### 3. 锁文件冲突

两者都在 `$TMPDIR/openclaw-<uid>/` 下创建 `gateway.*.lock` 文件。66Claw 启动时会清理这些锁文件（`sidecar.rs:221 cleanup_gateway_locks()`），可能导致正在运行的 OpenClaw 实例认为锁已失效。

### 4. 孤儿进程误杀

`kill_orphaned_gateway_processes()`（`sidecar.rs:256`）使用以下模式匹配进程：

- `entry.js gateway`
- `openclawcn.mjs gateway`

其中 `entry.js gateway` 会匹配到所有 OpenClaw 的 gateway 进程，导致误杀。

## 使用建议

### 不同时运行（推荐）

1. 完全退出 OpenClaw（包括托盘图标/菜单栏图标）
2. 再启动 66Claw
3. 反之亦然

这种方式下基本无问题。CN 默认配置的 fill-empty 语义不会破坏 OpenClaw 已有配置。

### 需要同时运行

当前架构**不支持同时运行**。如需支持，需要以下改造：

1. **隔离状态目录**：为 66Claw 设置独立的状态目录（如 `~/.66claw/`），通过 `OPENCLAW_STATE_DIR` 环境变量实现
2. **端口隔离**：确保桌面端和 CLI 使用不同端口
3. **进程匹配隔离**：孤儿进程清理的 `pgrep` 模式需要区分两个应用的进程
4. **锁文件隔离**：使用不同的临时目录前缀

## 故障排查

| 现象 | 原因 | 解决方法 |
|------|------|---------|
| 启动 66Claw 后 OpenClaw 断连 | 端口被抢占，OpenClaw gateway 被杀 | 先退出 OpenClaw 再启动 66Claw |
| OpenClaw 启动后出现未知插件警告 | 66Claw 写入了 cn-adapter 等插件配置 | 在 `~/.openclaw/openclaw.json` 中删除对应插件配置 |
| gateway 启动失败提示端口占用 | 另一个应用的 gateway 正在运行 | 关闭另一个应用，或手动 `lsof -ti :19002` / `lsof -ti :18789` 查看并终止占用进程 |
| 66Claw 启动后 OpenClaw 的锁文件丢失 | `cleanup_gateway_locks()` 清理了所有锁 | 重启 OpenClaw |
