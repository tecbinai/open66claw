# 66Claw Desktop

Tauri 2.x 桌面应用，封装 OpenClawCN gateway 为独立可安装的应用。

## 开发

```bash
pnpm install
pnpm build                    # 构建后端 + CN 前端
cd apps/desktop && npx tauri dev
```

## 本地打包

使用 `release.sh` 打包（推荐）：

```bash
./release.sh                        # 构建 mac-arm64（默认），使用当前版本号
./release.sh mac-x64                # 构建 Intel Mac
./release.sh win-x64                # 构建 Windows x64
./release.sh all                    # 构建所有平台
./release.sh --version 1.1.0        # 更新版本号后构建 mac-arm64
./release.sh win-x64 --version 1.1.0  # 更新版本号后构建指定平台
```

### 版本管理

- **唯一真相**：`apps/desktop/version.json`
- `release.sh` 打包时自动同步版本号到 `tauri.conf.json` 和 `Cargo.toml`
- 通过 `--version` 参数指定新版本号，会同时更新 `version.json` 和同步文件
- 66Claw 版本号独立于上游 OpenClaw（根 `package.json`）

### 产物规范

| 项目 | 说明 |
|------|------|
| 输出目录 | `apps/desktop/releases/{platform}/` |
| 命名格式 | `66Claw-{platform}-{version}-{timestamp}.{ext}` |
| platform | `mac-arm64`、`mac-x64`、`win-x64` |
| version | 取自 `version.json`（唯一真相） |
| timestamp | `YYYYMMDDHHmmss` |
| ext | macOS: `.dmg`，Windows: `.exe` |

示例：`66Claw-mac-arm64-2026.3.9-20260315125729.dmg`

### 手动打包

```bash
pnpm build                                                        # 后端 + CN 前端
cd apps/desktop && npx tauri build                                 # 当前架构
cd apps/desktop && npx tauri build --target x86_64-apple-darwin    # Intel Mac
```

手动打包后需自行将产物从 `src-tauri/target/release/bundle/` 复制到 `releases/` 并按格式命名。

## 目录结构

```
apps/desktop/
├── release.sh                # 打包脚本（构建 + 复制到 releases/）
├── releases/                 # 打包产物输出（.gitignore）
│   ├── mac-arm64/
│   ├── mac-x64/
│   └── win-x64/
├── src-tauri/
│   ├── tauri.conf.json       # Tauri 配置（产品名、版本、打包目标）
│   ├── scripts/
│   │   └── stage-dist.sh     # beforeBuildCommand，staging 后端资源
│   ├── src/                  # Rust 源码（sidecar、tray、窗口管理）
│   └── icons/                # 应用图标
├── _build_tauri.ps1          # Windows 构建脚本
└── build-release.ps1         # Windows 本地构建脚本
```

## 端口

- CLI gateway：**18789**
- 桌面端 gateway：**19002**
