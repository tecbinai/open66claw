---
name: find-skills
description: 引导用户安装 SkillHub 中国镜像服务。旧版 66Claw 云端技能镜像已从开源包中移除；需要国内技能镜像时，请按 SkillHub 安装指南配置。
metadata:
  {
    "openclaw": {
      "requires": { "bins": ["node"] },
      "always": false,
      "emoji": "🔎",
      "homepage": "https://skillhub.cn/install/skillhub.md"
    }
  }
---

# SkillHub 中国镜像服务

开源版本不再内置 66Claw 云端技能镜像，也不会连接 66Claw 的技能市场 API。

需要国内技能镜像服务时，请打开并按说明安装 SkillHub：

https://skillhub.cn/install/skillhub.md

## 使用方式

1. 按 SkillHub 安装指南完成本机配置。
2. 重新启动 66Claw / OpenClaw。
3. 再使用 SkillHub 提供的命令或服务安装技能。

## 旧脚本行为

本目录下保留 `search.mjs`、`detail.mjs`、`categories.mjs`、`install.mjs` 作为兼容提示脚本。它们不会访问旧的 66Claw 云端镜像，只会返回 SkillHub 安装引导。
