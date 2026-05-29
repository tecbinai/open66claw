# OpenClawCN Docker 部署

## 快速开始

### 1. 构建基础镜像（启用 CN 扩展）

```bash
# 在项目根目录执行
docker build -t openclaw:local \
  --build-arg OPENCLAW_EXTENSIONS="cn-adapter dingtalk wecom feishu" .
```

### 2. 构建 CN 覆盖层

```bash
docker build -f docker/cn/Dockerfile -t openclawcn:local .
```

### 3. 启动服务

```bash
# 基础版（使用上游 docker-compose.yml）
OPENCLAW_CONFIG_DIR=~/.openclaw \
OPENCLAW_WORKSPACE_DIR=~/workspace \
docker compose up -d

# CN 增强版（叠加 CN 配置）
OPENCLAW_CONFIG_DIR=~/.openclaw \
OPENCLAW_WORKSPACE_DIR=~/workspace \
docker compose -f docker-compose.yml -f docker/cn/docker-compose.cn.yml up -d
```

### 4. 安全加固（可选）

使用 seccomp profile：

```bash
docker run --security-opt seccomp=docker/cn/seccomp-profile.json openclawcn:local
```

## 环境变量

| 变量                     | 默认值    | 说明             |
| ------------------------ | --------- | ---------------- |
| `OPENCLAW_GATEWAY_PORT`  | `18789`   | Gateway 端口     |
| `OPENCLAW_GATEWAY_TOKEN` | -         | Gateway 认证令牌 |
| `OPENCLAW_CONFIG_DIR`    | -         | 配置目录挂载路径 |
| `OPENCLAW_WORKSPACE_DIR` | -         | 工作空间挂载路径 |
| `OPENCLAW_LOG_LEVEL`     | `info`    | 日志级别         |
| `OPENCLAW_CN_ENABLED`    | `1`       | 启用 CN 适配器   |
| `NPM_CONFIG_REGISTRY`    | npmmirror | npm 镜像源       |

## 架构说明

```
上游 Dockerfile (多阶段构建)
  └── 产出 openclaw:local
        └── docker/cn/Dockerfile (CN 覆盖层)
              └── 产出 openclawcn:local

上游 docker-compose.yml (基础服务定义)
  └── docker/cn/docker-compose.cn.yml (CN 覆盖)
        └── 叠加 CN 环境变量和挂载
```
