# 66Claw

给普通用户的一键安装版 OpenClaw。

66Claw 是基于 [OpenClaw](https://github.com/openclaw/openclaw) 的中文桌面端二开项目，从 2026 年 2 月开始开发。它面向不熟悉 AI、不想折腾命令行、不想研究复杂模型配置的朋友，把 OpenClaw 的 gateway、模型、skills、MCP、智能体能力整理成更容易上手的 Windows 桌面应用。

如果这个项目对你有帮助，欢迎在 GitHub 右上角点一个 Star。Star 越多，项目越容易被更多中文 AI 用户看到。

[下载 Windows 安装包](https://github.com/tecbinai/open66claw/releases/latest)

## 66Claw 解决什么问题

很多人不是不用 AI agent，而是卡在第一步：

- 不知道该选哪个模型
- 不知道 API Key 填在哪里
- 不知道 gateway、skills、MCP 是什么
- 不想安装 Node、pnpm 和一堆依赖
- 不想看英文控制台和报错
- 只想下载安装，打开配置，然后开始用

66Claw 做的事情很简单：把 OpenClaw 这套强大的 AI agent 底座，变成更适合中文用户的一键安装桌面入口。

## 主要特性

- Windows 一键安装包
- 66Claw 中文 UI 和品牌界面
- 更友好的模型设置页
- 支持国内常用模型和 Coding Plan 入口
- API Key 配置、测试、保存流程优化
- skills、MCP、智能体页面中文化整理
- 桌面端自动启动本地 gateway
- 打包时带入本地运行所需 npm 依赖
- 已移除激活码、云端校验、自动更新 URL、代码混淆等闭源分发逻辑
- 本地运行优先，不依赖 66Claw 云端服务器

## 快速开始

1. 下载并安装 66Claw Windows 安装包。
2. 打开 66Claw。
3. 进入“模型设置”。
4. 选择一个你已有账号或 API Key 的模型服务。
5. 填入 API Key，测试连接。
6. 回到对话页开始使用。

默认本地配置目录：

```text
C:\Users\<你的用户名>\.openclaw
```

## 适合谁

- 第一次接触 AI agent 的个人用户
- 想快速体验 OpenClaw，但不想先折腾安装流程的用户
- 想用 DeepSeek、通义、Kimi、GLM、硅基流动、Aliyun Code 等模型服务的人
- 希望用桌面应用管理模型、skills、MCP、智能体的人
- 需要做企业内部分发、教学演示、私有化部署的团队

如果你已经熟悉 OpenClaw、Node、MCP、agent runtime，也可以直接使用上游 OpenClaw。66Claw 更偏向开箱即用和中文产品化体验。

## 源码构建

```powershell
pnpm install
pnpm build
```

Windows 桌面安装包请使用脚本构建：

```powershell
powershell -ExecutionPolicy Bypass -File apps\desktop\build-release.ps1
```

构建成功后，安装包会复制到：

```text
build\
```

开源版本应通过脚本自动构建。构建失败就修脚本或源码，不建议手工拼装安装包。

## SkillHub 中国镜像

如果你在国内安装 skills 较慢，可以参考：

[https://skillhub.cn/install/skillhub.md](https://skillhub.cn/install/skillhub.md)

## 项目状态

66Claw 当前处于维护期。

个人使用免费。商业化部署、企业内部分发、二开支持、模型网关整合、私有化交付，可联系：

- WeChat: `sunshineonly1314`
- 抖音 / 小红书 / 视频号 / B 站：`tecbinAI进化`

企业如需定制或者 OEM，可直接联系。

## 和 OpenClaw 的关系

66Claw 是 OpenClaw 的二开项目。

感谢 OpenClaw 提供 gateway、插件体系、skills、MCP、agent runtime、模型与多通道能力等底层能力。

上游项目：[https://github.com/openclaw/openclaw](https://github.com/openclaw/openclaw)

本仓库保留上游许可和 NOTICE 信息。具体许可请以仓库内 [LICENSE](LICENSE) 和 [NOTICE](NOTICE) 为准。

## 给项目点个 Star

如果 66Claw 帮你少踩了一些安装、配置、模型选择的坑，请帮忙点一个 Star。

你的 Star 会让这个项目在 GitHub 上被更多人看到，也会帮助我们判断哪些方向值得继续维护。

## 支持维护

个人使用免费，打赏完全自愿。

<p align="center">
  <img src="docs/assets/wechat-payment.png" alt="微信收款码" width="260">
</p>
