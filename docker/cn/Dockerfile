# OpenClawCN Docker 覆盖层
# 基于上游 Dockerfile 构建的基础镜像，叠加 CN 定制化配置。
#
# 前置步骤 — 先构建基础镜像（在项目根目录）：
#   docker build -t openclaw:local \
#     --build-arg OPENCLAW_EXTENSIONS="cn-adapter dingtalk wecom feishu" .
#
# 构建 CN 覆盖层：
#   docker build -f docker/cn/Dockerfile -t openclawcn:local .
#
# 运行：
#   docker compose -f docker-compose.yml -f docker/cn/docker-compose.cn.yml up

# ── 覆盖层，基于上游构建产物 ──
ARG OPENCLAW_BASE_IMAGE="openclaw:local"
FROM ${OPENCLAW_BASE_IMAGE}

LABEL org.opencontainers.image.title="OpenClawCN" \
  org.opencontainers.image.description="OpenClaw with CN adapter, DingTalk, WeCom, Feishu channels"

# CN 环境变量默认值
ENV NPM_CONFIG_REGISTRY=https://registry.npmmirror.com \
    OPENCLAW_CN_ENABLED=1

# 验证 cn-adapter 扩展已就位
RUN test -d /app/extensions/cn-adapter || \
    (echo "ERROR: cn-adapter extension missing. Build base image with OPENCLAW_EXTENSIONS including cn-adapter" >&2 && exit 1)

USER node
CMD ["node", "openclaw.mjs", "gateway", "--allow-unconfigured"]
