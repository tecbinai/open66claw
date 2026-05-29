# 桌面端图标规格指南

Tauri 打包 Windows (NSIS) + macOS (DMG) 所需的全部图标规格。

## 图标文件总览

| 文件 | 尺寸 | 用途 |
|------|------|------|
| `icon.png` | 1024x1024 | 源文件，用于自动生成其他格式 |
| `icon.icns` | 多尺寸合一 | macOS 专用，Dock / Finder / 应用程序文件夹 |
| `icon.ico` | 多尺寸合一 | Windows 专用，桌面 / 任务栏 / Alt+Tab / NSIS 安装程序 |
| `128x128.png` | 128x128 | macOS Finder / Dock 标准分辨率 |
| `128x128@2x.png` | 256x256 | macOS Retina Finder / Dock |
| `32x32.png` | 32x32 | 小图标场景（标题栏、列表视图） |
| `64x64.png` | 64x64 | 中等图标场景 |

文件位置：`apps/desktop/src-tauri/icons/`

## macOS 图标详解

macOS 使用 `.icns` 格式，内部包含以下尺寸变体：

| 尺寸 (px) | @2x Retina | 使用场景 |
|-----------|------------|----------|
| 16x16 | 32x32 | Finder 列表视图、Spotlight 搜索结果 |
| 32x32 | 64x64 | Finder 列表视图 (Retina 屏幕) |
| 128x128 | 256x256 | Finder 图标视图、Dock 默认大小 |
| 256x256 | 512x512 | Finder 大图标视图、Dock 放大悬停 |
| 512x512 | 1024x1024 | Finder 最大图标视图 |

### macOS 菜单栏图标 (Tray Icon)

菜单栏图标不在 `tauri.conf.json` 的 bundle icons 中，需要在 Rust 代码中通过 `tauri::tray::TrayIcon` 单独设置。

| 尺寸 | 说明 |
|------|------|
| 22x22 | 标准分辨率 |
| 44x44 | @2x Retina |

设计要求：
- 使用**单色 / 模板图标**风格（macOS 会自动适配亮色/暗色模式）
- PNG 格式，背景透明
- 线条粗细建议 1-2px（标准分辨率下）

## Windows 图标详解

Windows 使用 `.ico` 格式，单文件内嵌多种尺寸：

| 内嵌尺寸 (px) | 使用场景 |
|---------------|----------|
| 16x16 | 窗口标题栏图标、小任务栏图标 |
| 24x24 | 快速启动栏 |
| 32x32 | 桌面快捷方式（标准 DPI 96） |
| 48x48 | 资源管理器中等图标视图 |
| 64x64 | 高 DPI 任务栏 |
| 256x256 | 资源管理器大 / 超大图标视图、高 DPI 桌面 |

### NSIS 安装程序图标

NSIS 安装程序复用 `icon.ico`，在 `tauri.conf.json` 中通过 `bundle.windows.nsis.installerIcon` 配置。

### Windows 系统托盘图标

与 macOS tray 类似，在代码中设置。Windows 会自动缩放，推荐提供：

| 尺寸 | 说明 |
|------|------|
| 16x16 | 标准 DPI 托盘图标 |
| 32x32 | 高 DPI 托盘图标 |

## 快速生成所有图标

只需准备 **一张 1024x1024 的 PNG 源图**，然后使用 Tauri CLI 自动生成：

```bash
cd apps/desktop
npx tauri icon src-tauri/icons/icon.png
```

该命令会自动生成 `.icns`、`.ico` 以及各尺寸 PNG 文件到 `src-tauri/icons/` 目录。

> 注意：Tray 图标（菜单栏/系统托盘）需要单独设计，`tauri icon` 不会生成。

## 不需要的图标

以下图标用于 Windows UWP / Microsoft Store，NSIS 打包方式不需要：

- `Square*.png`（30x30 ~ 310x310 系列）
- `StoreLogo.png`

以下图标用于移动端，桌面打包不需要：

- `android/` 目录（mipmap 系列）
- `ios/` 目录（AppIcon 系列）
