# 66Claw

一个面向普通用户的一键安装版 OpenClaw 二开项目。

66Claw 从 2026 年 2 月开始开发，目标很直接：让不熟悉 AI、不想折腾命令行、不想研究一堆模型参数的朋友，也能把本地 AI 助手真正用起来。

它基于 [OpenClaw](https://github.com/openclaw/openclaw) 构建，保留 OpenClaw 的本地 gateway、插件、skills、MCP、模型能力等底层框架，同时重新整理了中文桌面端体验、模型配置流程、国内模型入口和一键打包安装方式。

当前项目已经进入维护期。个人使用免费。商业化部署、企业内部分发、定制模型接入、私有化安装支持，可联系：

- WeChat: `sunshineonly1314`
- 全网自媒体：抖音 / 小红书 / 视频号 / B 站搜索 `tecbinAI进化`

## 为什么做 66Claw

AI 工具越来越强，但真正挡住很多人的不是模型能力，而是第一步：

- 不知道该选哪个模型
- 不知道 API Key 填在哪里
- 不知道 gateway、MCP、skills 分别是什么
- 不想反复装 Node、pnpm、依赖包
- 不想看一堆英文控制台和报错
- 只想下载安装，然后打开就能配置和使用

66Claw 解决的是这个第一步。

它不是重新发明 OpenClaw，而是把 OpenClaw 这类强大的 AI agent 框架，整理成更适合中文用户和普通电脑用户上手的桌面产品。

## 66Claw 做了什么

相比上游 OpenClaw，66Claw 重点做了这些本地化和产品化工作：

- Windows 桌面端一键安装包
- 66Claw 中文 UI 和品牌界面
- 更友好的模型设置页
- 国内常用模型和 Coding Plan 入口
- API Key 配置、测试、保存流程优化
- skills、MCP、智能体等页面的中文体验整理
- 桌面端启动 gateway，用户无需手动启动后台服务
- 打包时带入本地运行所需的 npm 依赖
- 移除激活码、云端校验、自动更新 URL、代码混淆等闭源分发逻辑
- 保持本地运行优先，不依赖 66Claw 云端服务器

一句话：OpenClaw 是强大的底座，66Claw 把它做成更容易安装、更容易配置、更适合中文用户的桌面入口。

## 适合谁

66Claw 适合：

- 第一次接触 AI agent 的个人用户
- 想用国产模型、Coding Plan、DeepSeek、通义、Kimi、GLM 等服务的用户
- 希望用桌面应用管理模型、skills、MCP、智能体的人
- 想研究 OpenClaw，但不想先被复杂安装流程劝退的开发者
- 需要做企业内部分发、教学演示、私有化部署的团队

如果你已经非常熟悉 OpenClaw、Node、MCP、agent runtime，也可以直接使用上游 OpenClaw。66Claw 更偏向“开箱即用”和“中文产品化体验”。

## 下载安装

Windows 安装包发布在 GitHub Releases：

[下载 66Claw Windows 安装包](https://github.com/tecbinai/open66claw/releases/latest)

安装后直接打开 66Claw。桌面端会自动启动本地 gateway，并进入 66Claw 中文界面。

如果启动失败，优先检查：

- 是否已有旧的 66Claw / OpenClaw gateway 占用端口
- 是否被安全软件拦截本地 Node 进程
- 是否有旧配置文件影响当前模型或插件设置

默认本地配置目录：

```text
C:\Users\<你的用户名>\.openclaw
```

## 快速开始

1. 打开 66Claw。
2. 进入“模型设置”。
3. 选择一个 AI 服务，例如 Aliyun Code、DeepSeek、Kimi、GLM、硅基流动或 OpenAI 兼容服务。
4. 填入 API Key。
5. 点击测试连接。
6. 回到对话页开始使用。

如果你不知道选哪个，优先选你已经有账号、已经有 API Key 的服务。对普通用户来说，先跑通比一次性配完所有模型更重要。

## 本地运行与开源边界

这个开源版本的目标是让 66Claw 可以在本地独立运行。

已经移除或关闭：

- 激活码校验
- 云端授权验证
- 打包加密
- 代码混淆
- 66Claw 自动更新 URL
- 必须连接 66Claw 云端服务器才能使用的逻辑

保留：

- OpenClaw 本地 gateway
- 66Claw 中文 UI
- 模型配置页面
- skills / MCP / 智能体相关页面
- 本地插件和扩展能力
- 可自行构建的 Windows 桌面包脚本

注意：模型服务本身仍需要你自己的 API Key。66Claw 不提供免费模型额度，也不会替你绕过第三方平台的授权。

## SkillHub 中国镜像

如果你在国内安装 skills 较慢，可以参考 SkillHub 中国镜像：

[https://skillhub.cn/install/skillhub.md](https://skillhub.cn/install/skillhub.md)

66Claw 先保留本地和开源生态的 skills 机制，不再依赖 66Claw 私有云端 skill mirror。

## 从源码构建

项目使用 pnpm workspace。

```powershell
pnpm install
pnpm build
```

Windows 桌面安装包请使用脚本构建：

```powershell
powershell -ExecutionPolicy Bypass -File apps\desktop\build-release.ps1
```

构建成功后，安装包会复制到项目根目录：

```text
build\
```

不要手工拼装安装包。开源版本应当通过脚本构建，构建失败就修脚本或源码。

## 项目状态

66Claw 当前处于维护期：

- 会继续修复影响本地使用的问题
- 会尽量跟进上游 OpenClaw 的重要更新
- 会保留 66Claw 中文 UI 和一键安装体验
- 不承诺新增大型商业功能

个人使用免费。商业化部署、企业内部分发、二开支持、模型网关整合、私有化交付，请联系 `sunshineonly1314`。

## 和 OpenClaw 的关系

66Claw 是 OpenClaw 的二开项目。

感谢 OpenClaw 项目提供的底层能力，包括 gateway、插件体系、skills、MCP、agent runtime、模型与多通道能力等。

上游项目：

[https://github.com/openclaw/openclaw](https://github.com/openclaw/openclaw)

本仓库保留上游许可和 NOTICE 信息。具体许可请以仓库内 [LICENSE](LICENSE) 和 [NOTICE](NOTICE) 为准。

## 参与贡献

欢迎提交 Issue 和 PR，尤其是：

- Windows 安装和启动问题
- gateway 连接问题
- 模型配置页问题
- skills / MCP 页面兼容问题
- 中文文案和新手引导优化
- 上游 OpenClaw 合并适配

提交前建议先说明复现路径、系统版本、日志位置和期望行为。

## 联系方式

商业化部署、私有化支持、企业 AI agent 落地、模型服务整合：

- WeChat: `sunshineonly1314`
- 抖音 / 小红书 / 视频号 / B 站：`tecbinAI进化`

如果你是个人用户，直接下载使用即可。

## 支持项目

66Claw 面向个人用户免费开放。如果它帮你节省了安装、配置和踩坑时间，也欢迎自愿支持后续维护。

<p align="center">
  <img src="docs/assets/wechat-payment.png" alt="微信收款码" width="260">
</p>
