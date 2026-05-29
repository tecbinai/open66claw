/**
 * Setup Page HTML Generator
 * CN Adapter 安装向导页面
 *
 * Adapted from the upstream gateway setup page for the 66Claw desktop flow.
 *         + setup-page-components.ts + setup-page-utils.ts
 *
 * 适配规则：
 *   - CnProviderConfig → ProviderMeta (from ../gateway/provider-registry.js)
 *   - CN_PROVIDERS → PROVIDERS
 *   - OPENCLAWCN_GATEWAY_TOKEN → OPENCLAW_GATEWAY_TOKEN (两者都支持)
 *   - isOverseas → false (cn-adapter 始终是国内版)
 */

import fs from "node:fs";
import type { ServerResponse } from "node:http";
import os from "node:os";
import path from "node:path";

import { PROVIDERS } from "../gateway/provider-registry.js";
import type { ProviderMeta } from "../gateway/provider-registry.js";

// cn-adapter 始终是国内版，isOverseas 恒为 false
const isOverseas = false;

// ====== Platform Utils (inlined from setup-page-utils.ts) ======

/** detectPlatformInfo 的返回类型 */
interface PlatformInfo {
  os: string;
  variant: "lite" | "pro";
  sandboxType: string;
  icon: string;
  displayName: string;
}

/**
 * 获取 logo 图片的 base64 数据 URL
 * @param oemId OEM 标识，有值时优先查找 OEM logo
 */
function getLogoBase64(oemId?: string): string {
  try {
    const logoCandidates: string[] = [];
    // OEM 模式：优先使用 OEM 专属 logo
    if (oemId) {
      logoCandidates.push(
        path.resolve(import.meta.dirname, `../../dist/control-ui/oem/${oemId}/logo_xy_main.png`),
        path.resolve(import.meta.dirname, `../../resources/dist/control-ui/oem/${oemId}/logo_xy_main.png`),
        path.resolve(import.meta.dirname, `../../../ui-cn/public/oem/${oemId}/logo_xy_main.png`),
      );
    }
    // 标准 66Claw logo
    logoCandidates.push(
      path.resolve(import.meta.dirname, "../../dist/control-ui/logo_66_main.png"),
      path.resolve(import.meta.dirname, "../../resources/dist/control-ui/logo_66_main.png"),
      path.resolve(import.meta.dirname, "../../../ui-cn/public/logo_66_main.png"),
      // 旧版 fallback
      path.resolve(import.meta.dirname, "../../assets/60ad649637d6797ad09120d309408d4c.png"),
      path.resolve(import.meta.dirname, "../assets/60ad649637d6797ad09120d309408d4c.png"),
    );
    for (const logoPath of logoCandidates) {
      if (fs.existsSync(logoPath)) {
        const imageBuffer = fs.readFileSync(logoPath);
        return `data:image/png;base64,${imageBuffer.toString("base64")}`;
      }
    }
    return "";
  } catch {
    // 如果读取失败，返回空字符串，后续会使用 fallback SVG
    return "";
  }
}

/**
 * 获取 Setup 引导页二维码的 base64 数据 URL（zlq.jpg）
 */
function getSetupQrcodeBase64(): string {
  try {
    // 打包后: dist/../../data/qrcodes → <installRoot>/data/qrcodes
    // dev 模式: dist/../data/qrcodes → <repoRoot>/data/qrcodes
    const candidates = [
      path.resolve(import.meta.dirname, "../../data/qrcodes"),
      path.resolve(import.meta.dirname, "../data/qrcodes"),
    ];
    for (const qrDir of candidates) {
      const qrPath = path.join(qrDir, "zlq.jpg");
      if (fs.existsSync(qrPath)) {
        const buf = fs.readFileSync(qrPath);
        return `data:image/jpeg;base64,${buf.toString("base64")}`;
      }
    }
    return "";
  } catch {
    return "";
  }
}

/**
 * 读取 OEM 二维码图片（购买凭证 / 技术支持）的 base64 数据 URL
 * 图片放在 oem/ui/ 目录，构建时由 apply-oem-assets.ts 复制到 ui/public/
 * 运行时从 dist/control-ui/ 或 ui/public/ 读取
 */
function getOemQrcodeBase64(filename: string): string {
  try {
    // 打包后: dist/../../dist/control-ui/<filename>
    // 打包后(tauri): dist/../../resources/dist/control-ui/<filename>
    // dev 模式: dist/../ui/public/<filename>
    const candidates = [
      path.resolve(import.meta.dirname, "../../dist/control-ui", filename),
      path.resolve(import.meta.dirname, "../../resources/dist/control-ui", filename),
      path.resolve(import.meta.dirname, "../ui/public", filename),
    ];
    for (const filePath of candidates) {
      if (fs.existsSync(filePath)) {
        const buf = fs.readFileSync(filePath);
        const ext = path.extname(filename).toLowerCase();
        const mime = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png";
        return `data:${mime};base64,${buf.toString("base64")}`;
      }
    }
    return "";
  } catch {
    return "";
  }
}

/**
 * 检测当前运行平台和版本
 */
function detectPlatformInfo(): PlatformInfo {
  const platform = os.platform();
  // 检测是否有 Docker（Pro 版本）
  const hasDocker = process.env.OPENCLAWCN_DOCKER === "1" || process.env.DOCKER_HOST;
  const variant = hasDocker ? "pro" : "lite";

  if (platform === "darwin") {
    return {
      os: "macOS",
      variant: "lite",
      sandboxType: "软沙盒（目录隔离）",
      icon: "🍎",
      displayName: "macOS Lite 版",
    };
  } else if (platform === "win32") {
    return {
      os: "Windows",
      variant,
      sandboxType: variant === "pro" ? "Docker 容器沙盒" : "轻量沙盒",
      icon: "🪟",
      displayName: `Windows ${variant === "pro" ? "Pro" : "Lite"} 版`,
    };
  } else {
    return {
      os: "Linux",
      variant,
      sandboxType: variant === "pro" ? "Docker 容器沙盒" : "轻量沙盒",
      icon: "🐧",
      displayName: `Linux ${variant === "pro" ? "Pro" : "Lite"} 版`,
    };
  }
}

/**
 * 获取平台默认工作目录
 */
function getDefaultWorkspace(): string {
  const platform = os.platform();
  if (platform === "win32") {
    return "D:\\OpenClawCN\\workspace";
  } else if (platform === "darwin") {
    return "~/.clawbotcn/workspace";
  } else {
    return "/opt/openclawcn/workspace";
  }
}

/**
 * 获取提供商图标
 */
function getProviderIcon(providerId: string): string {
  const icons: Record<string, string> = {
    "aliyun-bailian": "☁️",
    siliconflow: "🔮",
    deepseek: "🔍",
    glm: "🧠",
    "volcengine-ark": "🌋",
    "tencent-hunyuan": "💫",
    minimax: "⚡",
  };
  return icons[providerId] || "🤖";
}

/**
 * 获取平台特定提示
 */
function getPlatformTips(platformInfo: PlatformInfo): string {
  if (platformInfo.os === "macOS") {
    return `
      <li>如遇到「无法验证开发者」提示，请在终端执行：<code>xattr -cr /Applications/66Claw</code></li>
      <li>工作目录位于: <code>~/.clawbotcn/workspace</code></li>
    `;
  } else if (platformInfo.os === "Windows") {
    if (platformInfo.variant === "pro") {
      return `
        <li>请确保 Docker Desktop 正在运行</li>
        <li>首次启动可能需要拉取沙盒镜像（约 80MB）</li>
        <li>工作目录位于: <code>D:\\OpenClawCN\\workspace</code></li>
      `;
    } else {
      return `
        <li>工作目录位于: <code>D:\\OpenClawCN\\workspace</code></li>
        <li>可通过开始菜单或桌面快捷方式启动</li>
      `;
    }
  } else {
    return `
      <li>启动服务: <code>sudo systemctl start openclawcn</code></li>
      <li>开机自启: <code>sudo systemctl enable openclawcn</code></li>
      <li>查看日志: <code>journalctl -u openclawcn -f</code></li>
    `;
  }
}

// ====== Page Context Interface ======

/**
 * ProviderMeta 在 setup 页面 JS 中期望的形状
 * ProviderMeta.providerId → id；models 为空数组（ProviderMeta 无 models 字段）
 */
interface ProviderForSetup {
  id: string;
  name: string;
  models: Array<{ id: string; name: string; description?: string; recommended?: boolean }>;
}

/** 组件渲染所需的上下文 */
interface SetupPageContext {
  logoBase64: string;
  setupQrcodeBase64: string;
  oemPurchaseQrcodeBase64: string;
  oemSupportQrcodeBase64: string;
  platformInfo: PlatformInfo;
  defaultWorkspace: string;
  /** setup 页面 JS 使用 {id, name, models} 形状 */
  providers: ProviderForSetup[];
  /** 品牌名（OEM 时使用 displayName，标准包用 66Claw） */
  brandName: string;
}

// ====== HTML Components (inlined from setup-page-components.ts) ======

function renderBodyContent(
  ctx: SetupPageContext,
  getPlatformTips: (info: PlatformInfo) => string,
): string {
  const {
    logoBase64,
    setupQrcodeBase64,
    oemPurchaseQrcodeBase64,
    oemSupportQrcodeBase64,
    platformInfo,
    defaultWorkspace,
    brandName,
  } = ctx;
  return `
  <!-- 顶部导航栏 -->
  <header class="header">
    <div class="header-logo">
      ${
        logoBase64
          ? `<img src="${logoBase64}" alt="${brandName} Logo" />`
          : `<svg viewBox="0 0 32 32" fill="none">
        <rect width="32" height="32" rx="8" fill="url(#logo-gradient)"/>
        <path d="M8 12h16M8 16h12M8 20h8" stroke="white" stroke-width="2" stroke-linecap="round"/>
        <defs>
          <linearGradient id="logo-gradient" x1="0" y1="0" x2="32" y2="32">
            <stop stop-color="#3c83f6"/>
            <stop offset="1" stop-color="#60a5fa"/>
          </linearGradient>
        </defs>
      </svg>`
      }
      <span>${brandName}</span>
    </div>
  </header>

  <main class="main-container">
    <!-- 步骤进度条 - 3步流程 -->
    <div class="stepper">
      <div class="step-item active" id="stepItem1">
        <div class="step-circle">1</div>
        <div class="step-label">用户协议</div>
      </div>
      <div class="step-connector" id="connector1"></div>
      <div class="step-item" id="stepItem2">
        <div class="step-circle">2</div>
        <div class="step-label">AI服务</div>
      </div>
      <div class="step-connector" id="connector2"></div>
      <div class="step-item" id="stepItem3">
        <div class="step-circle">3</div>
        <div class="step-label">完成初始化</div>
      </div>
    </div>

    <!-- Page 0: 检测到历史配置的欢迎页面 -->
    <div id="page0" class="card hidden">
      <div class="card-header" style="text-align: center;">
        <h2 style="font-size: 1.8em;">👋 欢迎回来！</h2>
        <p>检测到您之前已配置过 openclaw</p>
      </div>

      <div style="text-align: center; padding: 32px 0;">
        <div style="font-size: 4em; margin-bottom: 16px;">🎉</div>
        <p style="color: var(--text-secondary); font-size: 1.1em; margin-bottom: 24px;">
          您的历史配置仍然有效，可以直接开始使用
        </p>
      </div>

      <div style="background: linear-gradient(135deg, rgba(60, 131, 246, 0.08) 0%, rgba(60, 131, 246, 0.02) 100%); border-radius: var(--radius-lg); padding: 20px; margin-bottom: 24px;">
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
          <span class="material-icons" style="color: var(--accent-blue);">info</span>
          <span style="font-weight: 600;">温馨提示</span>
        </div>
        <p style="color: var(--text-secondary); font-size: 0.95em; margin: 0;">
          如果您需要更换 AI 服务、修改工作目录或更新许可证，可以选择「修改配置」重新设置。
        </p>
      </div>

      <div class="btn-group" style="flex-direction: column; gap: 12px;">
        <button class="btn btn-primary btn-lg" onclick="skipToChat()" style="width: 100%;">
          <span class="material-icons">rocket_launch</span>
          开启 openclaw 世界
        </button>
        <button class="btn btn-secondary" onclick="goToStep(1)" style="width: 100%;">
          <span class="material-icons">settings</span>
          修改配置
        </button>
      </div>
    </div>

    <!-- Step 1: 用户协议 -->
    <div id="pageLegal" class="card hidden">
      <div class="card-header" style="text-align: center;">
        <h2>用户协议</h2>
        <p>使用 openclaw 前，请阅读并同意以下协议</p>
      </div>

      <div style="max-height: 420px; overflow-y: auto; border: 1px solid var(--border-default); border-radius: var(--radius-md); padding: 20px; margin-bottom: 20px; background: var(--bg-secondary);">
        <h3 style="margin-bottom: 12px; color: var(--accent-blue);">一、用户服务协议</h3>
        <div style="color: var(--text-secondary); font-size: 0.9em; line-height: 1.8;">
          <p><strong>第一条 总则</strong></p>
          <p>openclaw 是一个社区维护的 AI 辅助编程工具。使用本软件即表示您同意本协议的全部条款。</p>
          <p style="margin-top:8px;"><strong>第二条 软件性质</strong></p>
          <p>本软件为社区维护版本，AI 生成内容不代表本项目立场。本项目不对 AI 输出内容的准确性、合法性和完整性做任何担保。</p>
          <p style="margin-top:8px;"><strong>第三条 用户义务</strong></p>
          <p>用户应当遵守所在地法律法规，不得利用本软件进行任何违法活动。用户对使用本软件产生的一切后果承担全部责任。</p>
          <p style="margin-top:8px;"><strong>第四条 免责声明</strong></p>
          <p>AI 输出可能包含不准确、不完整或有害的内容。用户应自行判断并承担使用 AI 生成内容的风险。</p>
          <p style="margin-top:8px;"><strong>第五条 责任限制</strong></p>
          <p>在法律允许的最大范围内，本项目不对任何间接、附带、特殊或惩罚性损害承担责任。免费版本的赔偿责任上限为零。</p>
        </div>

        <h3 style="margin-top: 20px; margin-bottom: 12px; color: var(--accent-blue);">二、隐私政策</h3>
        <div style="color: var(--text-secondary); font-size: 0.9em; line-height: 1.8;">
          <p><strong>信息收集</strong>：设备标识符（SHA-256 哈希，不可逆）、使用统计（匿名）、用户同意时间戳。</p>
          <p><strong>数据传输</strong>：您输入的内容将发送至您选择的 AI 服务提供商。跨境传输风险由您自行评估。</p>
          <p><strong>本地处理</strong>：所有技能操作均在本地执行，不经过我们的服务器。</p>
          <p><strong>信息共享</strong>：不会与第三方共享您的个人数据（法律要求除外）。</p>
          <p><strong>用户权利</strong>：您有权查阅、更正和删除您的个人数据。</p>
        </div>

        <h3 style="margin-top: 20px; margin-bottom: 12px; color: var(--accent-blue);">三、AI 服务风险告知</h3>
        <div style="color: var(--text-secondary); font-size: 0.9em; line-height: 1.8;">
          <p>1. <strong>内容准确性</strong>：AI 生成内容可能包含事实错误、代码缺陷或过时信息。</p>
          <p>2. <strong>不可用于关键决策</strong>：请勿将 AI 输出作为医疗、法律、金融等关键领域决策的唯一依据。</p>
          <p>3. <strong>数据安全</strong>：请勿向 AI 输入敏感个人信息、商业机密或国家秘密。</p>
          <p>4. <strong>安全模式</strong>：本软件提供多档安全模式，默认为满血模式，允许 AI 执行代码操作。请根据需要调整。</p>
        </div>

        <h3 style="margin-top: 20px; margin-bottom: 12px; color: var(--accent-orange);">四、中国法律合规告知（重要）</h3>
        <div style="color: var(--text-secondary); font-size: 0.9em; line-height: 1.8;">
          <p style="color: var(--text-warning, #f59e0b); font-weight: 600; margin-bottom: 8px;">⚠️ 请务必在使用前了解以下法律风险，违反可能导致法律责任：</p>
          <p style="margin-top:8px;"><strong>1. 数据跨境传输</strong></p>
          <p>您输入的内容将发送至境外 AI 服务商（如 Anthropic、OpenAI 等）。根据《数据安全法》《个人信息保护法》，向境外提供重要数据或个人信息须满足合规要求。<strong>请勿输入涉及国家秘密、政府敏感信息、关键基础设施数据或大量个人信息。</strong></p>
          <p style="margin-top:8px;"><strong>2. AI 生成内容合规</strong></p>
          <p>根据《互联网信息服务深度合成管理规定》《生成式人工智能服务管理暂行办法》，AI 生成内容不得违反法律法规，不得含有违法有害信息。用户须对发布的 AI 生成内容承担相应法律责任。</p>
          <p style="margin-top:8px;"><strong>3. 网络安全义务</strong></p>
          <p>根据《网络安全法》，利用 AI 工具实施网络攻击、入侵他人系统、传播恶意代码等行为属于违法行为。本软件提供代码执行能力，用户须确保所有操作合法合规。</p>
          <p style="margin-top:8px;"><strong>4. 知识产权风险</strong></p>
          <p>AI 生成的代码、文本可能与现有受著作权保护的作品相似。用户在商业使用前应自行进行知识产权核查，本项目不对侵权风险承担责任。</p>
          <p style="margin-top:8px;"><strong>5. 企业/机构用户额外义务</strong></p>
          <p>企业用户在使用本工具处理业务数据时，应确保符合所在行业监管要求（金融、医疗、教育等行业有专项规定），并建立相应的 AI 使用管理制度。</p>
          <p style="margin-top: 12px; padding: 10px; background: var(--bg-primary); border-left: 3px solid var(--accent-orange); border-radius: 0 var(--radius-sm) var(--radius-sm) 0;">
            <strong>免责声明：</strong>本项目为开源社区工具，不提供法律合规服务。上述内容仅供参考，不构成法律建议。如您在特定业务场景中使用，建议咨询专业法律人士。
          </p>
        </div>
      </div>

      <div id="legalAgreementCheckbox" style="display: flex; align-items: center; gap: 10px; padding: 16px; background: var(--bg-tertiary); border-radius: var(--radius-md); margin-bottom: 20px; cursor: pointer;" onclick="document.getElementById('legalAgree').click();">
        <input type="checkbox" id="legalAgree" style="width: 18px; height: 18px; cursor: pointer;" onclick="event.stopPropagation(); updateLegalBtn();" />
        <label for="legalAgree" style="cursor: pointer; font-size: 0.95em;">
          我已阅读并同意
          <a href="javascript:void(0)" onclick="event.stopPropagation();showLegalModal('userAgreement')" style="color:var(--accent-blue);text-decoration:none;">《用户服务协议》</a>
          <a href="javascript:void(0)" onclick="event.stopPropagation();showLegalModal('privacyPolicy')" style="color:var(--accent-blue);text-decoration:none;">《隐私政策》</a>
          <a href="javascript:void(0)" onclick="event.stopPropagation();showLegalModal('riskDisclosure')" style="color:var(--accent-blue);text-decoration:none;">《AI 服务风险告知》</a>
          和
          <a href="javascript:void(0)" onclick="event.stopPropagation();showLegalModal('cnCompliance')" style="color:var(--accent-blue);text-decoration:none;">《中国法律合规告知》</a>
        </label>
      </div>

      <div class="btn-group">
        <button class="btn btn-primary btn-lg" onclick="nextStep(1)" id="legalNextBtn" disabled>
          同意并继续
          <span class="material-icons">arrow_forward</span>
        </button>
      </div>
    </div>

    <!-- Step 2: 选择 AI 服务 -->
    <div id="page1" class="card hidden">
      <!-- 右上角悬浮二维码（构建时内联 base64，OEM overseas 版不显示） -->
      ${
        !isOverseas && setupQrcodeBase64
          ? `<div class="qr-corner">
        <div class="qr-corner-info">
          <div class="qr-corner-title">🎁 免费领取教学视频</div>
          <div class="qr-corner-tags">
            <div class="qr-corner-tag"><span class="material-icons">play_circle</span> 专属安装教学视频</div>
            <div class="qr-corner-tag"><span class="material-icons">school</span> 小白快速上手指南</div>
            <div class="qr-corner-tag"><span class="material-icons">groups</span> 加入技术交流群</div>
          </div>
          <div class="qr-corner-scan">📱 微信扫码 · 立即领取</div>
        </div>
        <div class="qr-corner-img"><img src="${setupQrcodeBase64}" alt="领取专属教学视频二维码"></div>
      </div>`
          : ""
      }
      <div class="card-header">
        <h2>第一步：选择 AI 服务</h2>
        <p>选择你要使用的 AI 平台，或者注册一个新账号</p>
      </div>

      <!-- 小提示 -->
      <div class="provider-tip">
        <span class="provider-tip-icon">💡</span>
        <span>不知道选哪个？选「Aliyun Code」就对了！一个 Key 调多款顶级代码模型，性价比极高。也可以试试 Kimi Code 和 GLM Code！</span>
      </div>
      
      <!-- 模型选择提醒 -->
      <div class="model-reminder" style="background: linear-gradient(135deg, #fff7e6 0%, #fffbe6 100%); border: 1px solid #ffd591; border-radius: 12px; padding: 12px 16px; margin-bottom: 16px; display: flex; align-items: center; gap: 10px;">
        <span style="font-size: 1.5em;">⚠️</span>
        <span style="color: #ad6800; font-size: 0.9em; font-weight: 500;">配置完成后，记得在模型下拉框中选择你需要的模型！每个平台有多种模型可选。</span>
      </div>

      <!-- 推荐服务商 - 大卡片 (代码助手 Coding Plan) -->
      <div class="provider-recommended-section">
        <div class="provider-section-title">🔥 代码助手 (Coding Plan)</div>
        <div class="provider-recommended-grid">
          <div class="provider-card featured selected" data-provider="aliyun-codeplan" onclick="selectProvider('aliyun-codeplan')">
            <div class="provider-card-badge">⭐ 首选推荐</div>
            <div class="provider-card-icon">☁️</div>
            <div class="provider-card-name">Aliyun Code</div>
            <div class="provider-card-desc">一个 Key 调 Qwen3.5/Kimi-K2.5/GLM-5/MiniMax · 模型聚合 · 性价比最高</div>
            <a href="https://www.aliyun.com/benefit?source=5176.29345612&userCode=xsngby7y" target="_blank" class="provider-card-link" onclick="event.stopPropagation()">
              <span class="material-icons">rocket_launch</span>
              免费注册 AI Star
            </a>
            <div class="provider-card-check"><span class="material-icons">check_circle</span></div>
          </div>
          <div class="provider-card" data-provider="kimi-coding" onclick="selectProvider('kimi-coding')">
            <div class="provider-card-icon">💻</div>
            <div class="provider-card-name">Kimi Code</div>
            <div class="provider-card-desc">代码专用模型 · 262K 超长上下文 · 100 Tokens/s 极速 · 性价比极高</div>
            <a href="https://www.kimi.com/code/docs/" target="_blank" class="provider-card-link" onclick="event.stopPropagation()">
              <span class="material-icons">code</span>
              查看文档，获取 API Key
            </a>
            <div class="provider-card-check"><span class="material-icons">check_circle</span></div>
          </div>
          <div class="provider-card" data-provider="glm-codeplan" onclick="selectProvider('glm-codeplan')">
            <div class="provider-card-icon">🧠</div>
            <div class="provider-card-name">GLM Code</div>
            <div class="provider-card-desc">GLM-5 · 智谱 Coding Plan · 代码专用</div>
            <a href="https://www.bigmodel.cn/glm-coding?ic=ZPADWSX0SI" target="_blank" class="provider-card-link" onclick="event.stopPropagation()">
              <span class="material-icons">rocket_launch</span>
              注册获取 Coding Plan Key
            </a>
            <div class="provider-card-check"><span class="material-icons">check_circle</span></div>
          </div>
          <div class="provider-card" data-provider="minimax-codeplan" onclick="selectProvider('minimax-codeplan')">
            <div class="provider-card-icon">⚡</div>
            <div class="provider-card-name">MiniMax Code</div>
            <div class="provider-card-desc">MiniMax-M2.5 · Coding Plan 订阅 · Anthropic 协议</div>
            <a href="https://platform.minimaxi.com/subscribe/coding-plan?code=I5REQrAnfL&source=link" target="_blank" class="provider-card-link" onclick="event.stopPropagation()">
              <span class="material-icons">rocket_launch</span>
              订阅 Coding Plan
            </a>
            <div class="provider-card-check"><span class="material-icons">check_circle</span></div>
          </div>
        </div>
      </div>

      <!-- 其他国内服务商 - 折叠 -->
      <div class="provider-other-section">
        <div class="provider-other-toggle" onclick="toggleOtherProviders()">
          <span class="material-icons" id="providerToggleIcon">expand_more</span>
          <span>🇨🇳 更多国内服务</span>
        </div>
        <div class="provider-other-content hidden" id="providerOtherContent">
          <div class="provider-other-grid">
            <div class="provider-option" data-provider="aliyun-bailian" onclick="selectProvider('aliyun-bailian')">
              <div class="provider-option-icon">☁️</div>
              <div class="provider-option-info">
                <div class="provider-option-name">阿里云百炼 (通义千问)</div>
                <div class="provider-option-desc">阿里出品 · 送100万Token · Qwen系列全家桶 · 多模态</div>
                <a href="https://www.aliyun.com/benefit?source=5176.29345612&userCode=xsngby7y" target="_blank" class="provider-option-link" onclick="event.stopPropagation()">
                  <span class="material-icons">rocket_launch</span>注册领取免费额度
                </a>
              </div>
              <div class="provider-option-check"><span class="material-icons">check_circle</span></div>
            </div>
            <div class="provider-option" data-provider="siliconflow" onclick="selectProvider('siliconflow')">
              <div class="provider-option-icon">🔮</div>
              <div class="provider-option-info">
                <div class="provider-option-name">硅基流动</div>
                <div class="provider-option-desc">免费送额度 · 包含最新 DeepSeek · 国内速度快</div>
                <a href="https://cloud.siliconflow.cn/i/uXXX7IEi" target="_blank" class="provider-option-link" onclick="event.stopPropagation()">
                  <span class="material-icons">rocket_launch</span>免费注册，领取额度
                </a>
              </div>
              <div class="provider-option-check"><span class="material-icons">check_circle</span></div>
            </div>
            <div class="provider-option" data-provider="minimax" onclick="selectProvider('minimax')">
              <div class="provider-option-icon">⚡</div>
              <div class="provider-option-info">
                <div class="provider-option-name">MiniMax</div>
                <div class="provider-option-desc">MiniMax M2.5，Agent/代码专家</div>
                <a href="https://platform.minimaxi.com/subscribe/coding-plan?code=I5REQrAnfL&source=link" target="_blank" class="provider-option-link" onclick="event.stopPropagation()">
                  <span class="material-icons">rocket_launch</span>注册领取免费额度
                </a>
              </div>
              <div class="provider-option-check"><span class="material-icons">check_circle</span></div>
            </div>
            <div class="provider-option" data-provider="deepseek" onclick="selectProvider('deepseek')">
              <div class="provider-option-icon">🚀</div>
              <div class="provider-option-info">
                <div class="provider-option-name">DeepSeek</div>
                <div class="provider-option-desc">DeepSeek 官方，性价比之王</div>
                <a href="https://platform.deepseek.com/api_keys" target="_blank" class="provider-option-link" onclick="event.stopPropagation()">
                  <span class="material-icons">rocket_launch</span>注册获取 API Key
                </a>
              </div>
              <div class="provider-option-check"><span class="material-icons">check_circle</span></div>
            </div>
            <div class="provider-option" data-provider="volcengine-ark" onclick="selectProvider('volcengine-ark')">
              <div class="provider-option-icon">🌋</div>
              <div class="provider-option-info">
                <div class="provider-option-name">豆包</div>
                <div class="provider-option-desc">字节出品，响应极快，便宜好用</div>
                <a href="https://console.volcengine.com/ark/" target="_blank" class="provider-option-link" onclick="event.stopPropagation()">
                  <span class="material-icons">rocket_launch</span>注册开通豆包
                </a>
              </div>
              <div class="provider-option-check"><span class="material-icons">check_circle</span></div>
            </div>
            <div class="provider-option" data-provider="moonshot" onclick="selectProvider('moonshot')">
              <div class="provider-option-icon">🌙</div>
              <div class="provider-option-info">
                <div class="provider-option-name">Kimi (月之暗面)</div>
                <div class="provider-option-desc">长上下文之王，最长支持1M tokens</div>
                <a href="https://platform.moonshot.cn/console/api-keys" target="_blank" class="provider-option-link" onclick="event.stopPropagation()">
                  <span class="material-icons">rocket_launch</span>注册获取 API Key
                </a>
              </div>
              <div class="provider-option-check"><span class="material-icons">check_circle</span></div>
            </div>
            <div class="provider-option" data-provider="tencent-hunyuan" onclick="selectProvider('tencent-hunyuan')">
              <div class="provider-option-icon">💫</div>
              <div class="provider-option-info">
                <div class="provider-option-name">腾讯混元</div>
                <div class="provider-option-desc">混元大模型系列</div>
                <a href="https://cloud.tencent.com/product/hunyuan" target="_blank" class="provider-option-link" onclick="event.stopPropagation()">
                  <span class="material-icons">rocket_launch</span>注册开通混元
                </a>
              </div>
              <div class="provider-option-check"><span class="material-icons">check_circle</span></div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- 国际服务 - 折叠 -->
      <div class="provider-other-section">
        <div class="provider-other-toggle" onclick="toggleInternationalProviders()">
          <span class="material-icons" id="internationalToggleIcon">expand_more</span>
          <span>🌐 国际服务 <span class="provider-section-note">（需要科学上网）</span></span>
        </div>
        <div class="provider-other-content hidden" id="internationalProviderContent">
          <div class="provider-other-grid">
            <div class="provider-option" data-provider="openai" onclick="selectProvider('openai')">
              <div class="provider-option-icon">🤖</div>
              <div class="provider-option-info">
                <div class="provider-option-name">OpenAI</div>
                <div class="provider-option-desc">GPT-4.1 / o3 系列，ChatGPT 官方</div>
              </div>
              <div class="provider-option-check"><span class="material-icons">check_circle</span></div>
            </div>
            <div class="provider-option" data-provider="anthropic" onclick="selectProvider('anthropic')">
              <div class="provider-option-icon">🧬</div>
              <div class="provider-option-info">
                <div class="provider-option-name">Anthropic Claude</div>
                <div class="provider-option-desc">Claude Sonnet 4 / Opus 4.5，编程最强</div>
              </div>
              <div class="provider-option-check"><span class="material-icons">check_circle</span></div>
            </div>
            <div class="provider-option" data-provider="google" onclick="selectProvider('google')">
              <div class="provider-option-icon">🔷</div>
              <div class="provider-option-info">
                <div class="provider-option-name">Google Gemini</div>
                <div class="provider-option-desc">Gemini 3 系列，免费额度充足</div>
              </div>
              <div class="provider-option-check"><span class="material-icons">check_circle</span></div>
            </div>
            <div class="provider-option" data-provider="nvidia" onclick="selectProvider('nvidia')">
              <div class="provider-option-icon">💚</div>
              <div class="provider-option-info">
                <div class="provider-option-name">NVIDIA NIM</div>
                <div class="provider-option-desc">高性能推理，有免费额度</div>
              </div>
              <div class="provider-option-check"><span class="material-icons">check_circle</span></div>
            </div>
            <div class="provider-option" data-provider="openrouter" onclick="selectProvider('openrouter')">
              <div class="provider-option-icon">🔀</div>
              <div class="provider-option-info">
                <div class="provider-option-name">OpenRouter</div>
                <div class="provider-option-desc">聚合多家模型，统一 API，按量付费</div>
              </div>
              <div class="provider-option-check"><span class="material-icons">check_circle</span></div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- 本地模型 & 自定义 - 折叠 -->
      <div class="provider-other-section">
        <div class="provider-other-toggle" onclick="toggleLocalProviders()">
          <span class="material-icons" id="localToggleIcon">expand_more</span>
          <span>🔧 本地模型 & 自定义</span>
        </div>
        <div class="provider-other-content hidden" id="localProviderContent">
          <div class="provider-other-grid">
            <div class="provider-option" data-provider="modelscope" onclick="selectProvider('modelscope')">
              <div class="provider-option-icon">🎯</div>
              <div class="provider-option-info">
                <div class="provider-option-name">魔搭社区</div>
                <div class="provider-option-desc">完全免费！每日2000次调用</div>
              </div>
              <div class="provider-option-check"><span class="material-icons">check_circle</span></div>
            </div>
            <div class="provider-option" data-provider="ollama" onclick="selectProvider('ollama')">
              <div class="provider-option-icon">🦙</div>
              <div class="provider-option-info">
                <div class="provider-option-name">Ollama 本地模型</div>
                <div class="provider-option-desc">本地运行，完全免费，数据私密</div>
              </div>
              <div class="provider-option-check"><span class="material-icons">check_circle</span></div>
            </div>
            <div class="provider-option" data-provider="custom" onclick="selectProvider('custom')">
              <div class="provider-option-icon">⚙️</div>
              <div class="provider-option-info">
                <div class="provider-option-name">自定义 API</div>
                <div class="provider-option-desc">Xinference、LM Studio 或其他 OpenAI 兼容服务</div>
              </div>
              <div class="provider-option-check"><span class="material-icons">check_circle</span></div>
            </div>
          </div>
        </div>
      </div>

      <!-- API Key 输入区域 -->
      <div id="apiKeyForm" class="hidden" style="margin-top: 20px;">
        <div class="apikey-section">
          <div class="apikey-header">
            <span class="apikey-header-icon">🔑</span>
            <span id="apiKeyLabel">API Key</span>
            <span class="apikey-header-hint">👆 点击上方金色按钮注册后获取</span>
          </div>
          <div class="apikey-input-wrapper">
            <input type="password" class="apikey-input" id="apiKeyInput" placeholder="在这里粘贴你的 API Key...">
            <button type="button" class="apikey-toggle-btn" onclick="togglePasswordVisibility()">
              <span class="material-icons" id="passwordIcon">visibility</span>
            </button>
          </div>
          <div class="form-help" id="apiKeyHelp">在对应平台的控制台获取 API Key</div>
          
          <!-- 硅基流动常见问题提示 -->
          <div id="siliconflowFaqTip" class="provider-faq-tip hidden">
            <div class="provider-faq-tip-header">
              <span class="material-icons">warning_amber</span>
              <span>硅基流动常见问题</span>
            </div>
            <div class="provider-faq-tip-content">
              <div class="provider-faq-item">
                <span class="provider-faq-icon">1️⃣</span>
                <span><strong>必须实名认证</strong>：注册后需完成实名认证才能使用 API</span>
              </div>
              <div class="provider-faq-item">
                <span class="provider-faq-icon">2️⃣</span>
                <span><strong>领取免费额度</strong>：<a href="https://cloud.siliconflow.cn/expenseManage/expense" target="_blank">点击这里领取抵扣金</a>，否则余额为 0 无法调用</span>
              </div>
              <div class="provider-faq-item">
                <span class="provider-faq-icon">3️⃣</span>
                <span><strong>获取 API Key</strong>：在 <a href="https://cloud.siliconflow.cn/account/ak" target="_blank">API 密钥页面</a> 创建密钥</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 模型选择 - 简化显示 -->
        <div class="model-section" id="modelSection">
          <div class="model-header">
            <span>模型</span>
            <span class="model-hint" id="modelHint">（推荐值已选好，直接下一步即可）</span>
          </div>
          <!-- 模型 Combobox：支持下拉选择和手动输入 -->
          <div class="model-combobox" id="modelCombobox">
            <input type="text" class="model-select" id="modelSelect"
                   placeholder="-- 请先选择 AI 平台 --"
                   autocomplete="off">
            <span class="model-editable-tag" id="modelEditableTag">✏️ 可编辑</span>
            <span class="material-icons model-combobox-arrow">expand_more</span>
            <div class="model-dropdown" id="modelDropdown"></div>
          </div>
          <div class="model-input-hint">
            <span class="model-input-hint-icon">💡</span>
            <span>选好后也能随时改 — 直接删改输入框里的模型名即可，不是选了就定死的</span>
          </div>
          <!-- 自定义 API 的端点提示（模型输入复用上面的 combobox） -->
          <div id="modelInputSection" class="hidden" style="margin-top: 8px;">
            <div class="form-help" id="modelInputHelp"></div>
          </div>
        </div>

        <!-- 自定义 API 端点输入框 -->
        <div id="customEndpointSection" class="hidden" style="margin-top: 16px;">
          <div class="form-group">
            <label class="form-label">API 端点 <span class="required">*</span></label>
            <input type="text" class="form-input mono" id="customEndpoint" placeholder="例如: http://localhost:11434/v1">
            <div class="form-help">兼容 OpenAI 格式的 API 地址（如 Ollama、LM Studio）</div>
          </div>
        </div>

        <div id="apiKeyStatus" class="status-message"></div>
      </div>

      <div class="btn-group">
        <button class="btn btn-secondary" onclick="prevStep(2)">
          <span class="material-icons">arrow_back</span>
          上一步
        </button>
        <button class="btn btn-primary btn-lg" onclick="nextStep(2)" id="step1Next" disabled>
          下一步
          <span class="material-icons">arrow_forward</span>
        </button>
      </div>
    </div>

    <!-- Step 2 (hidden): 基础设置（合并AI能力+工作目录） -->
    <div id="page2" class="card hidden">
      <div class="card-header">
        <h2>第二步：基础设置</h2>
        <p>设置 AI 助手的能力范围和工作目录</p>
      </div>

      <!-- Part 1: AI能力选择 -->
      <div class="settings-section">
        <div class="settings-section-title">
          <span class="settings-section-icon">🎯</span>
          <span>AI 能做什么？</span>
        </div>

        <!-- 完全信任 - 大卡片，放最上面 -->
        <div class="security-big-card trust-card" data-security="trust" onclick="selectSecurity('trust')">
          <div class="security-big-header">
            <div class="security-big-icon">⚡</div>
            <div class="security-big-info">
              <div class="security-big-title">完全信任</div>
              <div class="security-big-subtitle trust-highlight">解锁全部能力 · AI 可以帮你做任何事</div>
            </div>
            <div class="security-big-check"><span class="material-icons">check_circle</span></div>
          </div>
          <div class="security-big-features">
            <div class="feature-item positive">✅ 无任何限制，AI 可访问整个系统</div>
            <div class="feature-item positive">✅ 自动执行复杂任务，效率最高</div>
            <div class="feature-item danger">⚠️ 有风险，仅建议开发者或独立测试设备使用</div>
          </div>
        </div>

        <!-- 正常使用 - 大卡片，放中间，推荐 -->
        <div class="security-big-card standard-card selected" data-security="standard" onclick="doSelectSecurity('standard')">
          <div class="security-recommended-badge">⭐ 推荐</div>
          <div class="security-big-header">
            <div class="security-big-icon">🏠</div>
            <div class="security-big-info">
              <div class="security-big-title">正常使用</div>
              <div class="security-big-subtitle">平衡安全与能力 · 适合日常办公、学习、写作</div>
            </div>
            <div class="security-big-check"><span class="material-icons">check_circle</span></div>
          </div>
          <div class="security-big-features">
            <div class="feature-item positive">✅ 帮你打开软件、浏览网页、搜索信息</div>
            <div class="feature-item positive">✅ 帮你在指定文件夹内读写、整理文件</div>
            <div class="feature-item warning">⚠️ 删除文件等敏感操作会先询问你</div>
          </div>
        </div>

        <!-- 只聊天 - 折叠 -->
        <div class="security-other-options">
          <div class="security-other-toggle" onclick="toggleOtherSecurityOptions()">
            <span class="material-icons" id="securityToggleIcon">expand_more</span>
            <span>查看更保守的选项</span>
          </div>
          <div class="security-other-content hidden" id="securityOtherContent">
            <div class="security-option-card" data-security="full" onclick="doSelectSecurity('full')">
              <div class="security-option-icon">🔒</div>
              <div class="security-option-content">
                <div class="security-option-title">只聊天</div>
                <div class="security-option-desc">绝对安全模式 · AI 完全无法操作你的电脑</div>
                <div class="security-option-detail">
                  <span class="detail-tag safe">🛡️ 零风险</span>
                  <span class="detail-text">适合：纯问答、学习知识、头脑风暴</span>
                </div>
              </div>
              <div class="security-option-check"><span class="material-icons">check_circle</span></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Part 2: 工作目录设置 -->
      <div class="settings-section" id="workspaceSettingsSection">
        <div class="settings-section-title">
          <span class="settings-section-icon">📁</span>
          <span>AI 的工作目录</span>
        </div>
        
        <div class="workspace-compact">
          <div class="workspace-input-area">
            <div class="workspace-input-wrapper">
              <span class="workspace-input-icon material-icons">folder</span>
              <input type="text" class="workspace-input" id="workspaceInput" placeholder="点击右侧按钮选择文件夹..." value="${defaultWorkspace}" readonly>
            </div>
            <button type="button" class="workspace-browse-btn" onclick="browseWorkspace()">
              <span class="material-icons">folder_open</span>
              浏览
            </button>
          </div>
          <div class="workspace-hint">AI 只能在这个文件夹内读写文件</div>
          <div class="workspace-warning">
            <span class="material-icons">warning</span>
            <div class="workspace-warning-text">
              <strong>重要提醒：</strong>请勿将工作目录设置在系统盘（C 盘）！AI 在工作时会创建、修改和删除文件，如果误操作可能导致系统文件损坏，影响电脑正常使用。建议选择 D 盘或其他非系统盘。
            </div>
          </div>
        </div>

        <!-- 额外信任目录 - 折叠 -->
        <div class="extra-dirs-section" id="trustedDirsSection">
          <div class="extra-dirs-header" onclick="toggleExtraDirs()">
            <div class="extra-dirs-title">
              <span class="material-icons">add_circle_outline</span>
              添加额外目录（可选）
            </div>
            <span class="extra-dirs-arrow material-icons" id="extraDirsArrow">expand_more</span>
          </div>
          <div class="extra-dirs-content hidden" id="extraDirsContent">
            <div id="trustedDirsList" class="dir-list">
              <div class="dir-empty">暂未添加</div>
            </div>
            <button type="button" class="btn btn-secondary btn-sm" onclick="addTrustedDir()" style="width: 100%; margin-top: 8px;">
              <span class="material-icons">add</span>
              添加
            </button>
          </div>
        </div>
      </div>

      <!-- 简化的确认 -->
      <div class="simple-agreement">
        <div class="simple-agreement-checkbox" id="agreementCheckbox">
          <input type="checkbox" id="agreeTerms" onclick="updateAgreement()">
          <label for="agreeTerms">我已了解并同意</label>
        </div>
        <div class="agreement-disclaimer">
          ${
            isOverseas
              ? "AI-generated content may be inaccurate or biased. By using this software you acknowledge the risks. We are not liable for any errors or potential risks. Please use responsibly."
              : "虽然 AI 现在很强大，但 AI 生成内容可能存在随机性或偏差。使用 openclaw 即表示你已了解风险：我们不对 AI 产生的任何错误或潜在风险承担法律责任。请理性对待，安全使用哦~"
          }
        </div>
      </div>

      <div class="btn-group">
        <button class="btn btn-secondary" onclick="prevStep(2)">
          <span class="material-icons">arrow_back</span>
          上一步
        </button>
        <button class="btn btn-primary btn-lg" onclick="nextStep(2)">
          下一步
          <span class="material-icons">arrow_forward</span>
        </button>
      </div>
    </div>

    <!-- Step 3: 选择对话方式 -->
    <div id="page3" class="card hidden">
      <div class="card-header">
        <h2>第三步：选择对话方式</h2>
        <p>选择你与 AI 助手交流的方式</p>
      </div>

      <!-- 网页对话选项 - 默认推荐 -->
      <div class="channel-mode-selector">
        <div class="channel-mode-card selected" data-mode="web" onclick="selectChannelMode('web')">
          <div class="channel-mode-icon">🌐</div>
          <div class="channel-mode-content">
            <div class="channel-mode-title">
              网页对话
              <span class="channel-mode-badge recommended">✨ 推荐</span>
            </div>
            <div class="channel-mode-desc">直接在浏览器中和 AI 对话，零配置立即可用</div>
            <div class="channel-mode-features">
              <span class="feature-tag">✅ 零配置</span>
              <span class="feature-tag">✅ 立即可用</span>
              <span class="feature-tag">✅ 手机电脑都能访问</span>
            </div>
          </div>
          <div class="channel-mode-check"><span class="material-icons">check_circle</span></div>
        </div>

        <div class="channel-mode-card" data-mode="im" onclick="selectChannelMode('im')">
          <div class="channel-mode-icon">💬</div>
          <div class="channel-mode-content">
            <div class="channel-mode-title">钉钉 / 飞书 / 企业微信机器人</div>
            <div class="channel-mode-desc">通过企业IM发消息给AI（需要企业管理员权限）</div>
            <div class="channel-mode-features">
              <span class="feature-tag subtle">需要配置</span>
              <span class="feature-tag subtle">需要企业账号</span>
            </div>
          </div>
          <div class="channel-mode-check"><span class="material-icons">check_circle</span></div>
        </div>
      </div>

      <!-- 网页对话说明 -->
      <div id="webModeInfo" class="channel-mode-detail">
        <div class="web-mode-info">
          <div class="web-mode-info-icon">💡</div>
          <div class="web-mode-info-content">
            <div class="web-mode-info-title">配置完成后，你可以这样使用：</div>
            <ul class="web-mode-steps">
              <li>在浏览器访问 <code>http://localhost:18789</code> 开始对话</li>
              <li>也可以通过手机访问（需在同一局域网内）</li>
              <li>随时可以在设置中添加钉钉/飞书/企业微信渠道</li>
            </ul>
          </div>
        </div>
      </div>

      <!-- IM配置区域 - 折叠 -->
      <div id="imConfigSection" class="im-config-section hidden">
        <div class="im-config-header">
          <span class="material-icons">settings</span>
          <span>配置企业IM机器人</span>
        </div>
        
        <!-- 渠道选择 -->
        <div class="channel-selector" id="channelList">
          <div class="channel-tab selected" data-channel="dingtalk" onclick="selectChannelTab('dingtalk')">
            <span class="channel-tab-icon">📱</span>
            <span class="channel-tab-name">钉钉</span>
          </div>
          <div class="channel-tab" data-channel="feishu" onclick="selectChannelTab('feishu')">
            <span class="channel-tab-icon">🪶</span>
            <span class="channel-tab-name">飞书</span>
          </div>
          <div class="channel-tab" data-channel="wecom" onclick="selectChannelTab('wecom')">
            <span class="channel-tab-icon">💼</span>
            <span class="channel-tab-name">企业微信</span>
          </div>
        </div>

        <!-- 钉钉配置表单 -->
        <div id="dingtalkConfigForm" class="channel-config-form">
          <div class="channel-config-header">
            <span class="channel-config-icon">📱</span>
            <div>
              <div class="channel-config-title">钉钉机器人配置</div>
              <div class="channel-config-subtitle">使用 Stream 模式，<strong>无需公网 IP</strong>，本地即可接收消息</div>
            </div>
            <button type="button" class="channel-config-help" onclick="toggleDingtalkGuide()">
              <span class="material-icons">help_outline</span>
              查看配置指南
            </button>
          </div>

          <!-- 钉钉配置指南 -->
          <div id="dingtalkGuide" class="channel-guide hidden">
            <div class="guide-header">
              <span class="material-icons">menu_book</span>
              <span>钉钉 Stream 模式配置指南（详细版）</span>
              <button type="button" class="guide-close-btn" onclick="toggleDingtalkGuide()">
                <span class="material-icons">close</span>
                收起
              </button>
            </div>
            
            <!-- 前置条件 -->
            <div class="guide-prereq">
              <div class="guide-prereq-title">📋 前置条件</div>
              <ul class="guide-prereq-list">
                <li>✅ 拥有<strong>钉钉企业管理员</strong>或<strong>开发者权限</strong></li>
                <li>✅ 企业已完成<strong>钉钉认证</strong>（否则无法创建应用）</li>
                <li>✅ 电脑已登录钉钉账号（用于扫码登录开放平台）</li>
              </ul>
            </div>

            <div class="guide-content">
              <div class="guide-step">
                <div class="guide-step-number">1</div>
                <div class="guide-step-content">
                  <div class="guide-step-title"><strong>登录钉钉开放平台</strong></div>
                  <div class="guide-step-desc">
                    <ol class="guide-substeps">
                      <li>打开浏览器，访问 <a href="https://open-dev.dingtalk.com" target="_blank"><strong>open-dev.dingtalk.com</strong></a></li>
                      <li>看到页面后，点击<strong>右上角</strong>的蓝色「<strong>登录</strong>」按钮</li>
                      <li>页面会显示二维码，打开手机<strong>钉钉 App</strong>，扫描二维码登录</li>
                      <li>如果你有多个企业，会弹出企业选择框，<strong>选择要创建机器人的企业</strong></li>
                      <li>登录成功后，会进入「<strong>开发者后台</strong>」首页</li>
                    </ol>
                    <span class="guide-tip">⚠️ 注意：必须使用<strong>企业管理员账号</strong>或有<strong>开发者权限</strong>的账号登录，普通员工账号可能没有权限</span>
                  </div>
                </div>
              </div>

              <div class="guide-step">
                <div class="guide-step-number">2</div>
                <div class="guide-step-content">
                  <div class="guide-step-title"><strong>创建企业内部应用</strong></div>
                  <div class="guide-step-desc">
                    <ol class="guide-substeps">
                      <li>登录后看到开发者后台首页</li>
                      <li>看<strong>页面左侧的菜单栏</strong>，找到并点击「<strong>应用开发</strong>」</li>
                      <li>展开后会看到几个选项，点击「<strong>企业内部开发</strong>」</li>
                      <li>在右侧页面中，点击蓝色的「<strong>创建应用</strong>」按钮</li>
                      <li>弹出创建应用的表单，填写：
                        <div class="guide-field-desc">
                          <div class="guide-field-row"><span class="guide-field-name">应用名称：</span>给机器人起个名字，比如 "AI 助手" 或 "小智"</div>
                          <div class="guide-field-row"><span class="guide-field-name">应用描述：</span>简单写一下用途，比如 "智能问答助手"</div>
                          <div class="guide-field-row"><span class="guide-field-name">应用图标：</span>可以上传一个图片作为机器人头像（可跳过）</div>
                        </div>
                      </li>
                      <li>填写完成后，点击表单底部的「<strong>确定创建</strong>」按钮</li>
                    </ol>
                  </div>
                </div>
              </div>

              <div class="guide-step">
                <div class="guide-step-number">3</div>
                <div class="guide-step-content">
                  <div class="guide-step-title"><strong>获取 AppKey 和 AppSecret（重要！请复制保存）</strong></div>
                  <div class="guide-step-desc">
                    <ol class="guide-substeps">
                      <li>创建成功后，会<strong>自动跳转到应用详情页</strong></li>
                      <li>看<strong>页面左侧菜单</strong>，点击「<strong>凭证与基础信息</strong>」（在"基础信息"分组下）</li>
                      <li>在右侧页面中，你会看到一个表格，里面有：
                        <div class="guide-field-desc">
                          <div class="guide-field-row">
                            <span class="guide-field-name">Client ID（即 AppKey）：</span>
                            一串字母数字，形如 <code>dingxxxxxxxxxx</code>，点击右边的<strong>复制图标</strong>复制它
                          </div>
                          <div class="guide-field-row">
                            <span class="guide-field-name">Client Secret（即 AppSecret）：</span>
                            默认显示为 ****，点击「<strong>查看</strong>」按钮，可能需要手机钉钉扫码验证，验证后会显示完整的 Secret，<strong>立即复制</strong>！
                          </div>
                        </div>
                      </li>
                      <li>把复制的 <strong>AppKey</strong> 和 <strong>AppSecret</strong> 粘贴到下方的输入框中</li>
                    </ol>
                    <span class="guide-tip">🔐 <strong>非常重要</strong>：AppSecret 只显示一次！关闭页面后就看不到了。请<strong>立即复制并保存到安全的地方</strong>。如果忘记了，只能点「重置」生成新的。</span>
                  </div>
                </div>
              </div>

              <div class="guide-step">
                <div class="guide-step-number">4</div>
                <div class="guide-step-content">
                  <div class="guide-step-title"><strong>添加「机器人」能力</strong></div>
                  <div class="guide-step-desc">
                    <ol class="guide-substeps">
                      <li>还是在应用详情页，看<strong>左侧菜单</strong></li>
                      <li>找到「<strong>添加应用能力</strong>」并点击（可能在"应用能力"分组下）</li>
                      <li>右侧会显示各种能力卡片，找到「<strong>机器人</strong>」这个卡片</li>
                      <li>点击机器人卡片上的「<strong>添加</strong>」按钮</li>
                      <li>添加成功后，左侧菜单会多出一个「<strong>机器人</strong>」选项</li>
                    </ol>
                  </div>
                </div>
              </div>

              <div class="guide-step">
                <div class="guide-step-number">5</div>
                <div class="guide-step-content">
                  <div class="guide-step-title"><strong>配置机器人 - 选择 Stream 模式（最关键的一步！）</strong></div>
                  <div class="guide-step-desc">
                    <ol class="guide-substeps">
                      <li>点击左侧菜单的「<strong>机器人</strong>」（刚才添加的）</li>
                      <li>进入机器人配置页面，你会看到一个表单</li>
                      <li><strong style="color: #ef4444;">最重要的一步来了：</strong>找到「<strong>消息接收模式</strong>」这一项</li>
                      <li>你会看到两个选项：「HTTP 模式」和「<strong>Stream 模式</strong>」</li>
                      <li><strong style="color: #22c55e; font-size: 1.1em; background: rgba(34,197,94,0.1); padding: 4px 8px; border-radius: 4px;">⭐ 请选择「Stream 模式」！不要选 HTTP 模式！</strong></li>
                      <li>填写下面的信息：
                        <div class="guide-field-desc">
                          <div class="guide-field-row"><span class="guide-field-name">机器人名称：</span>用户在钉钉里看到的机器人名字</div>
                          <div class="guide-field-row"><span class="guide-field-name">机器人描述：</span>简单说明机器人功能</div>
                        </div>
                      </li>
                      <li>填好后，点击页面底部的「<strong>发布</strong>」按钮保存</li>
                    </ol>
                    <span class="guide-tip">💡 <strong>为什么一定要选 Stream 模式？</strong><br>
                    选了 Stream 模式后：<br>
                    ✅ 不需要买服务器<br>
                    ✅ 不需要有公网 IP<br>
                    ✅ 不需要配置域名和 HTTPS<br>
                    ✅ 在自己电脑上运行 openclaw 就能收到消息<br><br>
                    如果选了 HTTP 模式，你需要有一台能被外网访问的服务器，配置起来很麻烦！</span>
                  </div>
                </div>
              </div>

              <div class="guide-step">
                <div class="guide-step-number">6</div>
                <div class="guide-step-content">
                  <div class="guide-step-title"><strong>添加权限（推荐做，不做也能用）</strong></div>
                  <div class="guide-step-desc">
                    <ol class="guide-substeps">
                      <li>点击左侧菜单的「<strong>权限管理</strong>」</li>
                      <li>在右侧页面顶部，有一个<strong>搜索框</strong></li>
                      <li>搜索「<strong>机器人发送消息</strong>」，找到后点击「<strong>申请权限</strong>」</li>
                      <li>可选：搜索「<strong>通讯录</strong>」添加读取用户信息的权限</li>
                      <li>添加完想要的权限后，点击「<strong>批量申请</strong>」按钮</li>
                    </ol>
                    <span class="guide-tip">💡 权限会自动通过（企业内部应用不需要审核），如果不加这些权限，基本功能也能用</span>
                  </div>
                </div>
              </div>

              <div class="guide-step">
                <div class="guide-step-number">7</div>
                <div class="guide-step-content">
                  <div class="guide-step-title"><strong>发布应用，让员工能用上</strong></div>
                  <div class="guide-step-desc">
                    <ol class="guide-substeps">
                      <li>点击左侧菜单的「<strong>版本管理与发布</strong>」</li>
                      <li>在右侧页面，点击「<strong>创建新版本</strong>」按钮</li>
                      <li>填写版本信息：
                        <div class="guide-field-desc">
                          <div class="guide-field-row"><span class="guide-field-name">版本号：</span>填 <code>1.0.0</code> 就行</div>
                          <div class="guide-field-row"><span class="guide-field-name">版本描述：</span>填"首次发布"或随便写点</div>
                        </div>
                      </li>
                      <li>点击「<strong>保存</strong>」然后点「<strong>发布</strong>」</li>
                      <li>企业内部应用一般<strong>秒过审核</strong>，稍等几秒就发布成功了</li>
                    </ol>
                    <span class="guide-tip">✅ <strong>发布成功！</strong>现在员工打开钉钉，在搜索框搜索你的机器人名字，就能找到并开始聊天了！</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- 常见问题 -->
            <div class="guide-faq">
              <div class="guide-faq-title">❓ 常见问题</div>
              <div class="guide-faq-item">
                <div class="guide-faq-q">Q: 提示"AppKey 不存在或无效"？</div>
                <div class="guide-faq-a">A: 检查 AppKey 是否复制完整，确认应用已发布上线。</div>
              </div>
              <div class="guide-faq-item">
                <div class="guide-faq-q">Q: 提示"AppSecret 不正确"？</div>
                <div class="guide-faq-a">A: AppSecret 可能已过期或复制错误，可在开放平台重新生成。</div>
              </div>
              <div class="guide-faq-item">
                <div class="guide-faq-q">Q: 机器人不响应消息？</div>
                <div class="guide-faq-a">A: 检查：1) 应用是否已发布 2) 是否选择了 Stream 模式 3) openclaw Gateway 是否正在运行</div>
              </div>
            </div>

            <div class="guide-footer">
              <a href="https://open.dingtalk.com/document/orgapp/create-an-interface-based-chatbot" target="_blank" class="guide-link">
                <span class="material-icons">open_in_new</span>
                查看钉钉官方文档
              </a>
              <a href="https://opensource.dingtalk.com/developerpedia/docs/learn/stream/overview" target="_blank" class="guide-link">
                <span class="material-icons">open_in_new</span>
                Stream 模式详解
              </a>
            </div>
          </div>

          <div class="channel-config-fields">
            <div class="form-group">
              <label class="form-label">App Key (Client ID) <span class="required">*</span></label>
              <input type="text" class="form-input mono" id="dingtalkAppKey" placeholder="例如：dingxxxxxxxx">
              <div class="form-help">在「应用信息」→「凭证与基础信息」中获取</div>
            </div>
            <div class="form-group">
              <label class="form-label">App Secret (Client Secret) <span class="required">*</span></label>
              <div class="password-input-wrapper">
                <input type="password" class="form-input mono" id="dingtalkAppSecret" placeholder="请输入 App Secret">
                <button type="button" class="password-toggle" onclick="toggleDingtalkSecretVisibility()">
                  <span class="material-icons" id="dingtalkSecretIcon">visibility</span>
                </button>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">机器人 Token（可选）</label>
              <input type="text" class="form-input mono" id="dingtalkRobotToken" placeholder="如有单聊机器人，填写 Token">
              <div class="form-help">用于接收单聊消息回调，Stream 模式下通常不需要</div>
            </div>
          </div>

          <div id="dingtalkConfigStatus" class="status-message"></div>
        </div>

        <!-- 飞书配置表单 -->
        <div id="feishuConfigForm" class="channel-config-form hidden">
          <div class="channel-config-header">
            <span class="channel-config-icon">🪶</span>
            <div>
              <div class="channel-config-title">飞书机器人配置</div>
              <div class="channel-config-subtitle">使用 WebSocket 长连接，<strong>无需公网 IP</strong></div>
            </div>
            <button type="button" class="channel-config-help" onclick="toggleFeishuGuide()">
              <span class="material-icons">help_outline</span>
              查看配置指南
            </button>
          </div>

          <!-- 支持能力 -->
          <div class="channel-capabilities" style="margin: 12px 0; padding: 12px; background: rgba(59, 130, 246, 0.05); border-radius: 8px; border: 1px solid rgba(59, 130, 246, 0.1);">
            <div style="font-weight: 600; margin-bottom: 8px; color: var(--text-primary); font-size: 13px;">✨ 支持能力</div>
            <div style="display: flex; flex-wrap: wrap; gap: 8px; font-size: 12px;">
              <span style="background: rgba(34, 197, 94, 0.1); color: #16a34a; padding: 4px 8px; border-radius: 4px;">✅ 私聊消息</span>
              <span style="background: rgba(34, 197, 94, 0.1); color: #16a34a; padding: 4px 8px; border-radius: 4px;">✅ 群聊 @机器人</span>
              <span style="background: rgba(34, 197, 94, 0.1); color: #16a34a; padding: 4px 8px; border-radius: 4px;">✅ 图片/文件收发</span>
              <span style="background: rgba(34, 197, 94, 0.1); color: #16a34a; padding: 4px 8px; border-radius: 4px;">✅ Markdown 卡片</span>
              <span style="background: rgba(34, 197, 94, 0.1); color: #16a34a; padding: 4px 8px; border-radius: 4px;">✅ 无需公网 IP</span>
              <span style="background: rgba(59, 130, 246, 0.1); color: #2563eb; padding: 4px 8px; border-radius: 4px;">📄 文档读写</span>
              <span style="background: rgba(59, 130, 246, 0.1); color: #2563eb; padding: 4px 8px; border-radius: 4px;">📚 知识库访问</span>
              <span style="background: rgba(59, 130, 246, 0.1); color: #2563eb; padding: 4px 8px; border-radius: 4px;">📊 多维表格</span>
            </div>
          </div>

          <!-- 飞书配置指南 -->
          <div id="feishuGuide" class="channel-guide hidden">
            <div class="guide-header">
              <span class="material-icons">menu_book</span>
              <span>飞书 WebSocket 长连接配置指南（详细版）</span>
              <button type="button" class="guide-close-btn" onclick="toggleFeishuGuide()">
                <span class="material-icons">close</span>
                收起
              </button>
            </div>

            <!-- 前置条件 -->
            <div class="guide-prereq">
              <div class="guide-prereq-title">📋 前置条件</div>
              <ul class="guide-prereq-list">
                <li>✅ 拥有<strong>飞书企业管理员</strong>或<strong>应用管理员权限</strong></li>
                <li>✅ 企业已开通<strong>飞书开放平台</strong>功能</li>
                <li>✅ 电脑已登录飞书账号（用于扫码登录开放平台）</li>
              </ul>
            </div>

            <div class="guide-content">
              <div class="guide-step">
                <div class="guide-step-number">1</div>
                <div class="guide-step-content">
                  <div class="guide-step-title"><strong>登录飞书开放平台</strong></div>
                  <div class="guide-step-desc">
                    <ol class="guide-substeps">
                      <li>打开浏览器，访问 <a href="https://open.feishu.cn/app" target="_blank"><strong>open.feishu.cn/app</strong></a></li>
                      <li>看到页面后，点击<strong>右上角</strong>的「<strong>登录</strong>」按钮</li>
                      <li>页面会显示二维码，打开手机<strong>飞书 App</strong>，点击右上角「<strong>+</strong>」→「<strong>扫一扫</strong>」扫码登录</li>
                      <li>登录成功后，会进入「<strong>开发者后台</strong>」首页，显示你的应用列表</li>
                    </ol>
                    <span class="guide-tip">💡 提示：如果提示"无权限访问"，说明你不是企业管理员，需要联系管理员给你开通开发者权限</span>
                  </div>
                </div>
              </div>

              <div class="guide-step">
                <div class="guide-step-number">2</div>
                <div class="guide-step-content">
                  <div class="guide-step-title"><strong>创建企业自建应用</strong></div>
                  <div class="guide-step-desc">
                    <ol class="guide-substeps">
                      <li>在开发者后台首页，你会看到一个蓝色的「<strong>创建企业自建应用</strong>」按钮，点击它</li>
                      <li>弹出创建应用的表单，填写：
                        <div class="guide-field-desc">
                          <div class="guide-field-row"><span class="guide-field-name">应用名称：</span>给机器人起个名字，比如 "AI 助手" 或 "小飞"</div>
                          <div class="guide-field-row"><span class="guide-field-name">应用描述：</span>简单写一下用途，比如 "智能问答机器人"</div>
                          <div class="guide-field-row"><span class="guide-field-name">应用图标：</span>可以上传一个图片作为机器人头像（可跳过）</div>
                        </div>
                      </li>
                      <li>填写完成后，点击「<strong>创建</strong>」按钮</li>
                      <li>创建成功！会自动跳转到应用详情页</li>
                    </ol>
                  </div>
                </div>
              </div>

              <div class="guide-step">
                <div class="guide-step-number">3</div>
                <div class="guide-step-content">
                  <div class="guide-step-title"><strong>添加「机器人」能力</strong></div>
                  <div class="guide-step-desc">
                    <ol class="guide-substeps">
                      <li>现在你在应用详情页，看<strong>页面左侧的菜单栏</strong></li>
                      <li>找到「<strong>添加应用能力</strong>」这一项并点击</li>
                      <li>右侧会显示很多能力卡片，比如"网页"、"小程序"、"机器人"等</li>
                      <li>找到「<strong>机器人</strong>」这个卡片（有个机器人图标），点击它上面的「<strong>+ 添加</strong>」按钮</li>
                      <li>添加成功后，你会看到左侧菜单多了一个「<strong>机器人</strong>」选项</li>
                    </ol>
                  </div>
                </div>
              </div>

              <div class="guide-step">
                <div class="guide-step-number">4</div>
                <div class="guide-step-content">
                  <div class="guide-step-title"><strong>获取 App ID 和 App Secret（重要！请复制保存）</strong></div>
                  <div class="guide-step-desc">
                    <ol class="guide-substeps">
                      <li>看<strong>左侧菜单</strong>，找到「<strong>凭证与基础信息</strong>」并点击</li>
                      <li>在右侧页面中，你会看到应用的基本信息</li>
                      <li>找到这两个重要的值：
                        <div class="guide-field-desc">
                          <div class="guide-field-row">
                            <span class="guide-field-name">App ID：</span>
                            一串字母数字，形如 <code>cli_a1b2c3d4e5f6</code>（以 cli_ 开头），点击右边的<strong>复制图标</strong>复制它
                          </div>
                          <div class="guide-field-row">
                            <span class="guide-field-name">App Secret：</span>
                            默认显示为 ****，点击「<strong>显示</strong>」按钮后会显示完整内容，<strong>立即复制</strong>！
                          </div>
                        </div>
                      </li>
                      <li>把复制的 <strong>App ID</strong> 和 <strong>App Secret</strong> 粘贴到下方的输入框中</li>
                    </ol>
                    <span class="guide-tip">🔐 <strong>重要</strong>：App Secret 请妥善保管，不要告诉别人或发到群里！</span>
                  </div>
                </div>
              </div>

              <div class="guide-step">
                <div class="guide-step-number">5</div>
                <div class="guide-step-content">
                  <div class="guide-step-title"><strong>获取 Encrypt Key 和 Verification Token</strong></div>
                  <div class="guide-step-desc">
                    <ol class="guide-substeps">
                      <li>看<strong>左侧菜单</strong>，找到「<strong>开发配置</strong>」这个分组</li>
                      <li>点击展开后，找到「<strong>事件与回调</strong>」并点击</li>
                      <li>找到「<strong>加密策略</strong>」，点击进入</li>
                      <li>就能看到 <strong>Encrypt Key</strong> 和 <strong>Verification Token</strong></li>
                      <li>点击右边的<strong>小眼睛图标</strong>，就能显示出来了</li>
                      <li>把这两个密钥<strong>复制粘贴</strong>到下方配置输入框中</li>
                    </ol>
                    <span class="guide-tip">💡 <strong>注意</strong>：第一次创建的应用，Encrypt Key 可能为空，需要点击<strong>「刷新」按钮</strong>生成。WebSocket 模式下这两个配置<strong>通常可以不填</strong>，但填了更安全。</span>
                  </div>
                </div>
              </div>

              <div class="guide-step">
                <div class="guide-step-number">6</div>
                <div class="guide-step-content">
                  <div class="guide-step-title"><strong>配置事件订阅 - 启用长连接（最关键的一步！）</strong></div>
                  <div class="guide-step-desc">
                    <ol class="guide-substeps">
                      <li>还是在「<strong>事件与回调</strong>」页面</li>
                      <li>在右侧页面中，找到「<strong>事件配置方式</strong>」这一栏</li>
                      <li>你会看到有两个选项：
                        <ul>
                          <li>「将事件发送至开发者服务器」- <strong style="color: #ef4444;">不要选这个！</strong></li>
                          <li>「<strong>使用长连接接收事件</strong>」- <strong style="color: #22c55e; font-size: 1.1em; background: rgba(34,197,94,0.1); padding: 4px 8px; border-radius: 4px;">⭐ 选这个！</strong></li>
                        </ul>
                      </li>
                      <li>选好后，点击「<strong>保存</strong>」按钮</li>
                    </ol>
                    <span class="guide-tip">💡 <strong>为什么一定要选长连接模式？</strong><br>
                    选了长连接模式后：<br>
                    ✅ 不需要买服务器<br>
                    ✅ 不需要有公网 IP<br>
                    ✅ 不需要配置域名和 HTTPS<br>
                    ✅ 在自己电脑上运行 openclaw 就能收到消息<br><br>
                    如果选了"发送至开发者服务器"，你需要有一台能被外网访问的服务器，配置起来很麻烦！</span>
                  </div>
                </div>
              </div>

              <div class="guide-step">
                <div class="guide-step-number">7</div>
                <div class="guide-step-content">
                  <div class="guide-step-title"><strong>添加「接收消息」事件（必须做，否则收不到消息！）</strong></div>
                  <div class="guide-step-desc">
                    <ol class="guide-substeps">
                      <li>还是在「<strong>事件与回调</strong>」这个页面</li>
                      <li>往下滚动，找到「<strong>添加事件</strong>」按钮（蓝色的），点击它</li>
                      <li>会弹出一个事件选择窗口</li>
                      <li>在<strong>搜索框</strong>中输入：<code>接收消息</code></li>
                      <li>在搜索结果中找到「<strong>接收消息 im.message.receive_v1</strong>」这一项</li>
                      <li>点击它<strong>右边的复选框</strong>打勾</li>
                      <li>点击窗口底部的「<strong>确认添加</strong>」按钮</li>
                      <li>回到事件列表，确认已经添加成功</li>
                    </ol>
                    <span class="guide-tip">⚠️ <strong>非常重要</strong>：如果不添加这个事件，机器人就收不到任何消息！这是最常被忘记的一步！</span>
                  </div>
                </div>
              </div>

              <div class="guide-step">
                <div class="guide-step-number">8</div>
                <div class="guide-step-content">
                  <div class="guide-step-title"><strong>添加权限（必须做，否则发不出消息！）</strong></div>
                  <div class="guide-step-desc">
                    <ol class="guide-substeps">
                      <li>点击<strong>左侧菜单</strong>的「<strong>权限管理</strong>」</li>
                      <li>在右侧页面<strong>顶部</strong>，有一个搜索框</li>
                      <li>需要添加这几个权限（一个一个来）：
                        <div class="guide-permission-list">
                          <div class="guide-permission-item">
                            <strong>第1个（必须）：</strong>搜索 <code>im:message</code>，找到「<strong>获取与发送单聊、群组消息</strong>」，点击「<strong>开通权限</strong>」
                          </div>
                          <div class="guide-permission-item">
                            <strong>第2个（必须）：</strong>搜索 <code>im:message:send_as_bot</code>，找到「<strong>以应用的身份发消息</strong>」，点击「<strong>开通权限</strong>」
                          </div>
                          <div class="guide-permission-item">
                            <strong>第3个（群聊必须）：</strong>搜索 <code>im:message.group_at_msg</code>，找到「<strong>接收群聊中@机器人消息事件</strong>」，点击「<strong>开通权限</strong>」
                          </div>
                          <div class="guide-permission-item">
                            <strong>第4个（推荐）：</strong>搜索 <code>im:resource</code>，找到「<strong>获取与上传图片或文件资源</strong>」，点击「<strong>开通权限</strong>」
                          </div>
                        </div>
                      </li>
                    </ol>
                    <span class="guide-tip">⚠️ 前两个权限是<strong>必须的</strong>！没有这些权限，机器人虽然能收到消息，但<strong>回复不了</strong>！</span>
                  </div>
                </div>
              </div>

              <div class="guide-step">
                <div class="guide-step-number">9</div>
                <div class="guide-step-content">
                  <div class="guide-step-title"><strong>发布应用，让员工能用上</strong></div>
                  <div class="guide-step-desc">
                    <ol class="guide-substeps">
                      <li>点击<strong>左侧菜单</strong>的「<strong>版本管理与发布</strong>」</li>
                      <li>在右侧页面，点击「<strong>创建版本</strong>」按钮</li>
                      <li>填写版本信息：
                        <div class="guide-field-desc">
                          <div class="guide-field-row"><span class="guide-field-name">版本号：</span>填 <code>1.0.0</code> 就行</div>
                          <div class="guide-field-row"><span class="guide-field-name">更新说明：</span>填"首次发布"或者随便写点</div>
                          <div class="guide-field-row"><span class="guide-field-name">可用性状态：</span>选择「<strong>所有员工可用</strong>」或者选择特定部门</div>
                        </div>
                      </li>
                      <li>点击「<strong>保存</strong>」</li>
                      <li>然后点击「<strong>申请发布</strong>」按钮</li>
                      <li>如果你是管理员，可以直接<strong>审批通过</strong>；否则等管理员审批</li>
                    </ol>
                    <span class="guide-tip">✅ <strong>发布成功！</strong>现在员工打开飞书，在搜索框搜索你的机器人名字，就能找到并开始聊天了！</span>
                  </div>
                </div>
              </div>

            </div>

            <!-- 常见问题 -->
            <div class="guide-faq">
              <div class="guide-faq-title">❓ 常见问题</div>
              <div class="guide-faq-item">
                <div class="guide-faq-q">Q: 找不到「添加应用能力」在哪？</div>
                <div class="guide-faq-a">A: 在应用详情页的<strong>左侧菜单栏</strong>，可能需要往下滚动才能看到。如果还是找不到，可能是飞书改版了，试试在菜单里找"应用能力"或"机器人"相关的选项。</div>
              </div>
              <div class="guide-faq-item">
                <div class="guide-faq-q">Q: 提示"App ID 不存在"？</div>
                <div class="guide-faq-a">A: 检查 App ID 是否复制完整，应该以 <code>cli_</code> 开头。确认没有多复制空格。</div>
              </div>
              <div class="guide-faq-item">
                <div class="guide-faq-q">Q: 机器人能收到消息，但不回复？</div>
                <div class="guide-faq-a">A: 90% 是因为<strong>权限没开</strong>！回到第 8 步，确认 <code>im:message</code> 和 <code>im:message:send_as_bot</code> 这两个权限都已开通。</div>
              </div>
              <div class="guide-faq-item">
                <div class="guide-faq-q">Q: 群聊@机器人没反应？</div>
                <div class="guide-faq-a">A: 1) 检查是否开通了 <code>im:message.group_at_msg</code> 权限（第 8 步）<br>2) 确认机器人已被邀请进群（在群设置里添加机器人）</div>
              </div>
              <div class="guide-faq-item">
                <div class="guide-faq-q">Q: 完全收不到消息？</div>
                <div class="guide-faq-a">A: 检查：1) 是否添加了 <code>im.message.receive_v1</code> 事件（第 7 步）2) 是否选择了"长连接"模式（第 6 步）3) 应用是否已发布（第 9 步）</div>
              </div>
              <div class="guide-faq-item">
                <div class="guide-faq-q">Q: Encrypt Key 是空的？</div>
                <div class="guide-faq-a">A: 第一次创建的应用，需要在「加密策略」页面点击<strong>「刷新」按钮</strong>生成 Encrypt Key。</div>
              </div>
            </div>

            <div class="guide-footer">
              <a href="https://open.feishu.cn/document/home/develop-a-bot-in-5-minutes/create-an-app" target="_blank" class="guide-link">
                <span class="material-icons">open_in_new</span>
                查看飞书官方文档
              </a>
              <a href="https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/im-v1/message/create" target="_blank" class="guide-link">
                <span class="material-icons">open_in_new</span>
                消息 API 文档
              </a>
            </div>
          </div>

          <div class="channel-config-fields">
            <div class="form-group">
              <label class="form-label">App ID <span class="required">*</span></label>
              <input type="text" class="form-input mono" id="feishuAppId" placeholder="例如：cli_xxxxxxxx">
              <div class="form-help">在「凭证与基础信息」中获取</div>
            </div>
            <div class="form-group">
              <label class="form-label">App Secret <span class="required">*</span></label>
              <div class="password-input-wrapper">
                <input type="password" class="form-input mono" id="feishuAppSecret" placeholder="请输入 App Secret">
                <button type="button" class="password-toggle" onclick="toggleFeishuSecretVisibility()">
                  <span class="material-icons" id="feishuSecretIcon">visibility</span>
                </button>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Encrypt Key（可选）</label>
              <input type="text" class="form-input mono" id="feishuEncryptKey" placeholder="事件订阅的加密密钥">
              <div class="form-help">在「事件订阅」页面的 Encrypt Key，用于消息加密</div>
            </div>
            <div class="form-group">
              <label class="form-label">Verification Token（可选）</label>
              <input type="text" class="form-input mono" id="feishuVerificationToken" placeholder="事件订阅的验证 Token">
              <div class="form-help">WebSocket 模式下通常不需要</div>
            </div>
          </div>

          <div id="feishuConfigStatus" class="status-message"></div>
        </div>

        <!-- 企业微信配置表单 -->
        <div id="wecomConfigForm" class="channel-config-form hidden">
          <div class="channel-config-header">
            <span class="channel-config-icon">💼</span>
            <div>
              <div class="channel-config-title">企业微信机器人配置</div>
              <div class="channel-config-subtitle">创建自建应用，通过回调接收消息</div>
            </div>
            <button type="button" class="channel-config-help" onclick="toggleWecomGuide()">
              <span class="material-icons">help_outline</span>
              查看配置指南
            </button>
          </div>

          <!-- 企业微信配置指南 -->
          <div id="wecomGuide" class="channel-guide hidden">
            <div class="guide-header">
              <span class="material-icons">menu_book</span>
              <span>企业微信自建应用配置指南（详细版）</span>
              <button type="button" class="guide-close-btn" onclick="toggleWecomGuide()">
                <span class="material-icons">close</span>
                收起
              </button>
            </div>

            <!-- 前置条件 -->
            <div class="guide-prereq">
              <div class="guide-prereq-title">📋 前置条件</div>
              <ul class="guide-prereq-list">
                <li>✅ 拥有<strong>企业微信管理员权限</strong></li>
                <li>✅ 企业已完成<strong>企业微信认证</strong>（否则功能受限）</li>
                <li>⚠️ <strong>需要公网可访问的服务器</strong>或<strong>内网穿透工具</strong>（如 ngrok、frp）</li>
                <li>⚠️ 回调地址<strong>必须是 HTTPS</strong>协议</li>
              </ul>
              <div class="guide-tip" style="margin-top: 12px;">
                ⚠️ <strong>重要提示</strong>：企业微信与钉钉/飞书不同，<strong>必须配置公网回调地址</strong>才能接收消息。<br>
                如果没有公网服务器，推荐使用 <a href="https://ngrok.com" target="_blank">ngrok</a> 或 <a href="https://github.com/fatedier/frp" target="_blank">frp</a> 进行内网穿透。
              </div>
            </div>

            <div class="guide-content">
              <div class="guide-step">
                <div class="guide-step-number">1</div>
                <div class="guide-step-content">
                  <div class="guide-step-title"><strong>登录企业微信管理后台</strong></div>
                  <div class="guide-step-desc">
                    <ol class="guide-substeps">
                      <li>打开浏览器，访问 <a href="https://work.weixin.qq.com/wework_admin/frame" target="_blank"><strong>work.weixin.qq.com</strong></a></li>
                      <li>看到页面后，用<strong>微信 App</strong> 扫描页面上的二维码</li>
                      <li>在手机上确认登录，会自动进入「<strong>企业微信管理后台</strong>」</li>
                    </ol>
                    <span class="guide-tip">⚠️ 注意：必须是<strong>企业管理员</strong>才能登录管理后台。如果你不是管理员，扫码后会提示无权限</span>
                  </div>
                </div>
              </div>

              <div class="guide-step">
                <div class="guide-step-number">2</div>
                <div class="guide-step-content">
                  <div class="guide-step-title"><strong>获取企业 ID (CorpID)</strong></div>
                  <div class="guide-step-desc">
                    <ol class="guide-substeps">
                      <li>登录后，看<strong>页面顶部的导航栏</strong></li>
                      <li>点击「<strong>我的企业</strong>」这个 Tab</li>
                      <li>进入页面后，<strong>一直往下滚动到页面最底部</strong></li>
                      <li>在最底部会看到「<strong>企业ID</strong>」这一项</li>
                      <li>点击企业 ID 右边的<strong>复制图标</strong>复制它</li>
                      <li>把复制的企业 ID 粘贴到下方的「<strong>企业 ID (CorpID)</strong>」输入框</li>
                    </ol>
                    <div class="guide-example">
                      <strong>企业 ID 格式</strong>：以 <code>ww</code> 开头，共 18 个字符，如 <code>ww1234567890abcdef</code>
                    </div>
                    <span class="guide-tip">💡 企业 ID 是固定的，一个企业只有一个，所有应用共用</span>
                  </div>
                </div>
              </div>

              <div class="guide-step">
                <div class="guide-step-number">3</div>
                <div class="guide-step-content">
                  <div class="guide-step-title"><strong>创建自建应用</strong></div>
                  <div class="guide-step-desc">
                    <ol class="guide-substeps">
                      <li>看<strong>页面顶部的导航栏</strong>，点击「<strong>应用管理</strong>」这个 Tab</li>
                      <li>进入应用管理页面后，你会看到页面分成几个区域</li>
                      <li>找到「<strong>自建</strong>」这个区域（在页面下方）</li>
                      <li>点击「<strong>创建应用</strong>」按钮</li>
                      <li>弹出创建表单，填写：
                        <div class="guide-field-desc">
                          <div class="guide-field-row"><span class="guide-field-name">应用 logo：</span>上传一个图片作为机器人头像</div>
                          <div class="guide-field-row"><span class="guide-field-name">应用名称：</span>给机器人起个名字，比如 "AI 助手"</div>
                          <div class="guide-field-row"><span class="guide-field-name">应用介绍：</span>简单写一下功能</div>
                          <div class="guide-field-row"><span class="guide-field-name">可见范围：</span>选择哪些部门或成员可以使用这个应用</div>
                        </div>
                      </li>
                      <li>填好后点击「<strong>创建应用</strong>」按钮</li>
                    </ol>
                  </div>
                </div>
              </div>

              <div class="guide-step">
                <div class="guide-step-number">4</div>
                <div class="guide-step-content">
                  <div class="guide-step-title"><strong>获取 AgentId 和 Secret（重要！请复制保存）</strong></div>
                  <div class="guide-step-desc">
                    <ol class="guide-substeps">
                      <li>创建成功后，会<strong>自动跳转到应用详情页</strong></li>
                      <li>在页面<strong>上方</strong>，你会看到应用基本信息</li>
                      <li>找到这两个重要的值：
                        <div class="guide-field-desc">
                          <div class="guide-field-row">
                            <span class="guide-field-name">AgentId：</span>
                            一个<strong>纯数字</strong>，形如 <code>1000002</code>，直接复制它填到下方「<strong>应用 ID</strong>」输入框
                          </div>
                          <div class="guide-field-row">
                            <span class="guide-field-name">Secret：</span>
                            默认是隐藏的，点击「<strong>查看</strong>」按钮，会弹出二维码让你扫码验证。用<strong>企业微信 App</strong> 扫码确认后，Secret 会显示出来，<strong>立即复制</strong>！
                          </div>
                        </div>
                      </li>
                      <li>把 AgentId 和 Secret 分别填到下方的输入框中</li>
                    </ol>
                    <span class="guide-tip">🔐 <strong>非常重要</strong>：Secret 只显示一次！关闭页面后就看不到了。如果忘记了，只能点「重置」生成新的（旧的就失效了）</span>
                  </div>
                </div>
              </div>

              <div class="guide-step">
                <div class="guide-step-number">5</div>
                <div class="guide-step-content">
                  <div class="guide-step-title"><strong>配置接收消息（最关键的一步！）</strong></div>
                  <div class="guide-step-desc">
                    <ol class="guide-substeps">
                      <li>还是在应用详情页，<strong>往下滚动</strong></li>
                      <li>找到「<strong>接收消息</strong>」这个区域</li>
                      <li>点击「<strong>设置API接收</strong>」按钮</li>
                      <li>会跳转到配置页面，需要填 3 个东西：
                        <div class="guide-field-desc">
                          <div class="guide-field-row">
                            <span class="guide-field-name">URL（回调地址）：</span>
                            填写能接收消息的地址。<strong style="color: #ef4444;">必须是 HTTPS 开头！</strong><br>
                            格式：<code>https://你的域名/api/wecom/callback</code>
                          </div>
                          <div class="guide-field-row">
                            <span class="guide-field-name">Token：</span>
                            点击输入框右边的「<strong>随机获取</strong>」按钮自动生成一串字符，然后<strong>复制它</strong>填到下方配置
                          </div>
                          <div class="guide-field-row">
                            <span class="guide-field-name">EncodingAESKey：</span>
                            同样点击「<strong>随机获取</strong>」自动生成（43个字符），<strong>复制它</strong>填到下方配置
                          </div>
                        </div>
                      </li>
                    </ol>
                    <span class="guide-tip">⚠️ <strong>重要</strong>：先<strong>不要点保存</strong>！因为保存时企业微信会立即验证你的回调地址，如果 openclaw 还没启动，验证会失败。<br>
                    请先把 Token 和 EncodingAESKey 复制填到下方，启动 openclaw 后再回来点保存</span>
                  </div>
                </div>
              </div>

              <div class="guide-step">
                <div class="guide-step-number">6</div>
                <div class="guide-step-content">
                  <div class="guide-step-title"><strong>填写下方配置并启动 openclaw</strong></div>
                  <div class="guide-step-desc">
                    <ol class="guide-substeps">
                      <li>把刚才复制的 <strong>Token</strong> 粘贴到下方「<strong>回调 Token</strong>」输入框</li>
                      <li>把刚才复制的 <strong>EncodingAESKey</strong> 粘贴到下方「<strong>回调 EncodingAESKey</strong>」输入框</li>
                      <li>确保 <strong>企业 ID</strong>、<strong>AgentId</strong>、<strong>Secret</strong> 都已填好</li>
                      <li>点击「<strong>下一步</strong>」完成配置向导</li>
                      <li>确保 openclaw Gateway 已经启动</li>
                    </ol>
                  </div>
                </div>
              </div>

              <div class="guide-step">
                <div class="guide-step-number">7</div>
                <div class="guide-step-content">
                  <div class="guide-step-title"><strong>回到企业微信验证回调</strong></div>
                  <div class="guide-step-desc">
                    <ol class="guide-substeps">
                      <li>openclaw 启动后，回到企业微信后台的「设置API接收」页面</li>
                      <li>确认 URL、Token、EncodingAESKey 都已正确填写</li>
                      <li>点击「<strong>保存</strong>」按钮</li>
                      <li>企业微信会自动发一个验证请求到你的回调地址</li>
                      <li>如果一切正确，会提示「<strong style="color: #22c55e;">配置成功</strong>」</li>
                    </ol>
                    <span class="guide-tip">✅ 验证成功！现在员工就可以在企业微信中找到这个应用并开始聊天了！</span>
                  </div>
                </div>
              </div>

              <div class="guide-step">
                <div class="guide-step-number">8</div>
                <div class="guide-step-content">
                  <div class="guide-step-title"><strong>测试机器人</strong></div>
                  <div class="guide-step-desc">
                    <ol class="guide-substeps">
                      <li>打开企业微信 App</li>
                      <li>在「工作台」中找到刚创建的应用</li>
                      <li>点击进入应用，发送一条消息</li>
                      <li>等待 AI 助手回复</li>
                    </ol>
                    <span class="guide-tip">🎉 如果收到回复，说明配置成功！</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- 内网穿透说明 -->
            <div class="guide-tunnel-info">
              <div class="guide-tunnel-title">🔗 没有公网服务器？使用内网穿透</div>
              <div class="guide-tunnel-content">
                <p>如果您没有公网服务器，可以使用内网穿透工具将本地服务暴露到公网：</p>
                <div class="guide-tunnel-options">
                  <div class="guide-tunnel-option">
                    <strong>ngrok（推荐新手）</strong>
                    <ol>
                      <li>访问 <a href="https://ngrok.com" target="_blank">ngrok.com</a> 注册账号</li>
                      <li>下载 ngrok 客户端</li>
                      <li>运行 <code>ngrok http 18789</code></li>
                      <li>复制生成的 HTTPS 地址作为回调 URL</li>
                    </ol>
                  </div>
                  <div class="guide-tunnel-option">
                    <strong>frp（更稳定）</strong>
                    <ol>
                      <li>需要一台有公网 IP 的服务器</li>
                      <li>部署 frps 服务端</li>
                      <li>本地运行 frpc 客户端</li>
                      <li>配置域名解析到服务器</li>
                    </ol>
                  </div>
                </div>
              </div>
            </div>

            <!-- 常见问题 -->
            <div class="guide-faq">
              <div class="guide-faq-title">❓ 常见问题</div>
              <div class="guide-faq-item">
                <div class="guide-faq-q">Q: 提示"企业 ID (CorpID) 无效"？</div>
                <div class="guide-faq-a">A: 检查企业 ID 是否复制完整，应以 ww 开头，共 18 位字符。</div>
              </div>
              <div class="guide-faq-item">
                <div class="guide-faq-q">Q: 提示"应用 Secret 不正确"？</div>
                <div class="guide-faq-a">A: Secret 可能已过期。进入应用详情页，点击 Secret 旁的「重置」重新获取。</div>
              </div>
              <div class="guide-faq-item">
                <div class="guide-faq-q">Q: 回调地址验证失败？</div>
                <div class="guide-faq-a">A: 检查：1) URL 是否可公网访问 2) 是否使用 HTTPS 3) Gateway 是否已启动 4) Token 和 EncodingAESKey 是否正确</div>
              </div>
              <div class="guide-faq-item">
                <div class="guide-faq-q">Q: 机器人不回复消息？</div>
                <div class="guide-faq-a">A: 检查：1) 回调地址是否验证通过 2) 应用可见范围是否包含当前用户 3) 查看 Gateway 日志是否收到消息</div>
              </div>
              <div class="guide-faq-item">
                <div class="guide-faq-q">Q: ngrok 免费版地址会变怎么办？</div>
                <div class="guide-faq-a">A: 每次 ngrok 重启后地址会变，需要重新配置回调 URL。建议升级付费版或使用 frp 自建。</div>
              </div>
            </div>

            <div class="guide-footer">
              <a href="https://developer.work.weixin.qq.com/document/path/90930" target="_blank" class="guide-link">
                <span class="material-icons">open_in_new</span>
                回调配置文档
              </a>
              <a href="https://developer.work.weixin.qq.com/document/path/90236" target="_blank" class="guide-link">
                <span class="material-icons">open_in_new</span>
                消息类型说明
              </a>
              <a href="https://developer.work.weixin.qq.com/document/path/90313" target="_blank" class="guide-link">
                <span class="material-icons">open_in_new</span>
                错误码大全
              </a>
            </div>
          </div>

          <div class="channel-config-fields">
            <div class="form-group">
              <label class="form-label">企业 ID (CorpID) <span class="required">*</span></label>
              <input type="text" class="form-input mono" id="wecomCorpId" placeholder="例如：ww1234567890abcdef">
              <div class="form-help">在「我的企业」→「企业信息」底部获取</div>
            </div>
            <div class="form-group">
              <label class="form-label">应用 ID (AgentId) <span class="required">*</span></label>
              <input type="number" class="form-input mono" id="wecomAgentId" placeholder="例如：1000002">
              <div class="form-help">在应用详情页顶部获取</div>
            </div>
            <div class="form-group">
              <label class="form-label">应用 Secret (AgentSecret) <span class="required">*</span></label>
              <div class="password-input-wrapper">
                <input type="password" class="form-input mono" id="wecomAgentSecret" placeholder="请输入应用 Secret">
                <button type="button" class="password-toggle" onclick="toggleWecomSecretVisibility()">
                  <span class="material-icons" id="wecomSecretIcon">visibility</span>
                </button>
              </div>
              <div class="form-help">在应用详情页点击查看 Secret 获取</div>
            </div>
            <div class="form-group">
              <label class="form-label">回调 Token <span class="required">*</span></label>
              <input type="text" class="form-input mono" id="wecomToken" placeholder="与企业微信后台配置的 Token 一致">
              <div class="form-help">在「接收消息」→「设置API接收」中配置的 Token</div>
            </div>
            <div class="form-group">
              <label class="form-label">回调 EncodingAESKey <span class="required">*</span></label>
              <input type="text" class="form-input mono" id="wecomEncodingAESKey" placeholder="43位字符，与企业微信后台配置一致">
              <div class="form-help">在「接收消息」→「设置API接收」中配置的 EncodingAESKey</div>
            </div>
          </div>

          <div id="wecomConfigStatus" class="status-message"></div>
        </div>
      </div>

      <div class="btn-group" style="margin-top: 24px;">
        <button class="btn btn-secondary" onclick="prevStep(3)">
          <span class="material-icons">arrow_back</span>
          上一步
        </button>
        <button class="btn btn-primary btn-lg" onclick="handleStep3Next()" id="step3NextBtn">
          下一步
          <span class="material-icons">arrow_forward</span>
        </button>
      </div>
    </div>

    <!-- 法律协议弹窗 -->
    <div id="legalModalOverlay" class="legal-modal-overlay hidden">
      <div class="legal-modal">
        <div class="legal-modal-header">
          <h3 id="legalModalTitle">协议标题</h3>
          <button class="legal-modal-close" onclick="closeLegalModal()">
            <span class="material-icons">close</span>
          </button>
        </div>
        <div class="legal-modal-body" id="legalModalBody">
          <!-- 协议内容动态填充 -->
        </div>
        <div class="legal-modal-footer">
          <button class="btn btn-primary" onclick="closeLegalModal()">我已了解</button>
        </div>
      </div>
    </div>

    <!-- Step 3: 本地开源模式 -->
    <div id="pageActivation" class="card hidden">
      <div class="card-header">
        <h2>第三步：完成初始化</h2>
        <p id="localModeSubtitle">66Claw 开源版可直接本地运行，无需账号或云端校验</p>
      </div>

      <div style="background: linear-gradient(135deg, rgba(34, 197, 94, 0.08) 0%, rgba(34, 197, 94, 0.02) 100%); border: 1px solid rgba(34, 197, 94, 0.2); border-radius: var(--radius-lg); padding: 24px; margin-bottom: 24px;">
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
          <span class="material-icons" style="color: var(--accent-green); font-size: 24px;">check_circle</span>
          <span style="font-weight: 600; font-size: 1.1em;">开源版已启用</span>
        </div>
        <p style="color: var(--text-secondary); font-size: 0.95em; margin-bottom: 16px;">
          所有本地功能默认可用。这里不会请求 66Claw 云端服务器，也不会校验任何云端凭据。
        </p>
        <ul style="color: var(--text-secondary); font-size: 0.9em; margin-bottom: 16px; padding-left: 20px;">
          <li>本地配置和工作区继续保存在当前设备</li>
          <li>模型、渠道和插件按你的本地配置运行</li>
          <li>不再包含云端设备绑定流程</li>
        </ul>
        <button class="btn btn-primary btn-lg" onclick="completeSetup()" id="localModeBtn" style="width: 100%;">
          <span class="material-icons">arrow_forward</span>
          进入 66Claw
        </button>
      </div>

      <div class="btn-group">
        <button class="btn btn-secondary" onclick="prevStep(3)">
          <span class="material-icons">arrow_back</span>
          上一步
        </button>
      </div>
    </div>

    <!-- page4 已移除：完成后直接跳转主界面 -->
  </main>

  <!-- C盘确认弹框 -->
  <div id="cDriveConfirmModal" class="cdrive-confirm-modal hidden">
    <div class="cdrive-confirm-content">
      <div class="cdrive-confirm-header">
        <div class="cdrive-confirm-icon">⚠️</div>
        <div class="cdrive-confirm-title">确认选择系统盘？</div>
      </div>
      <div class="cdrive-confirm-body">
        <p class="cdrive-confirm-message">
          您选择的目录位于 <strong>C 盘（系统盘）</strong>。
        </p>
        <div class="cdrive-confirm-danger">
          <span class="material-icons">error_outline</span>
          <div>
            <strong>重大风险警告：</strong>AI 在工作过程中会创建、修改和删除文件。如果 AI 误删系统关键文件，可能导致<strong>系统无法启动</strong>或<strong>电脑完全无法使用</strong>。强烈建议选择 D 盘或其他非系统盘。
          </div>
        </div>
      </div>
      <div class="cdrive-confirm-actions">
        <button class="btn btn-secondary" onclick="cancelCDriveSelection()">
          <span class="material-icons">arrow_back</span>
          重新选择
        </button>
        <button class="btn btn-danger" onclick="confirmCDriveSelection()">
          <span class="material-icons">warning</span>
          我了解风险，继续使用 C 盘
        </button>
      </div>
    </div>
  </div>

  <!-- 文件浏览器模态框 -->
  <div id="folderBrowserModal" class="modal-overlay hidden">
    <div class="modal">
      <div class="modal-header">
        <h3>选择文件夹</h3>
        <button class="modal-close" onclick="closeBrowser()">
          <span class="material-icons">close</span>
        </button>
      </div>
      <div class="modal-body">
        <div class="path-input-group">
          <input type="text" id="browserPathInput" placeholder="输入路径..." onkeypress="if(event.key==='Enter')navigateToPath()">
          <button class="btn btn-secondary" onclick="navigateToPath()">转到</button>
        </div>
        <div id="drivesBar" class="drives-bar" style="display:none;"></div>
        <div id="folderList" class="folder-list">
          <div class="folder-empty">加载中...</div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeBrowser()">取消</button>
        <button class="btn btn-primary" onclick="confirmSelection()">选择此文件夹</button>
      </div>
    </div>
  </div>

  <!-- 专家模式确认模态框 -->
  <div id="trustModeModal" class="modal-overlay hidden">
    <div class="modal" style="max-width: 480px;">
      <div class="modal-header">
        <h3>⚠️ 确认启用专家模式？</h3>
        <button class="modal-close" onclick="closeTrustModeModal()">
          <span class="material-icons">close</span>
        </button>
      </div>
      <div class="modal-body">
        <p style="margin-bottom: 16px; color: var(--text-secondary);">专家模式下，AI Agent 将拥有完整系统权限：</p>
        <ul style="list-style: none; padding: 0; margin-bottom: 20px;">
          <li style="display: flex; align-items: center; gap: 8px; padding: 8px 0; color: var(--text-secondary);">
            <span class="material-icons" style="color: var(--accent-orange); font-size: 18px;">warning</span>
            访问和修改系统上的任何文件
          </li>
          <li style="display: flex; align-items: center; gap: 8px; padding: 8px 0; color: var(--text-secondary);">
            <span class="material-icons" style="color: var(--accent-orange); font-size: 18px;">warning</span>
            执行任意系统命令（包括危险命令）
          </li>
          <li style="display: flex; align-items: center; gap: 8px; padding: 8px 0; color: var(--text-secondary);">
            <span class="material-icons" style="color: var(--accent-orange); font-size: 18px;">warning</span>
            AI 可能误删文件或执行破坏性操作
          </li>
        </ul>
        <div class="alert alert-warning" style="margin: 0;">
          <span class="alert-icon">💡</span>
          <div class="alert-content">建议仅在专用/测试设备上启用专家模式，且您了解 AI 的行为风险。</div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeTrustModeModal()">取消</button>
        <button class="btn btn-primary" onclick="confirmTrustMode()" style="background: var(--accent-orange);">我理解风险，启用专家模式</button>
      </div>
    </div>
  </div>

  <!-- 豆包 API 获取教程弹窗 -->
  <div id="doubaoTutorialModal" class="modal-overlay hidden">
    <div class="doubao-tutorial-modal">
      <div class="doubao-tutorial-header">
        <h3><span class="material-icons">school</span> 豆包 API 申请指南</h3>
        <button class="doubao-tutorial-close" onclick="closeDoubaoTutorial()">
          <span class="material-icons">close</span>
        </button>
      </div>
      <div class="doubao-tutorial-body">
        <p style="color: var(--text-tertiary); margin-bottom: 20px;">本指南面向零基础用户，手把手教你申请豆包 API Key</p>
        
        <h2>📋 准备工作</h2>
        <table>
          <tr><th>物品</th><th>说明</th><th>必需</th></tr>
          <tr><td>手机号</td><td>用于接收验证码</td><td>✅</td></tr>
          <tr><td>身份证</td><td>个人实名认证用</td><td>✅</td></tr>
          <tr><td>邮箱</td><td>建议绑定，用于接收通知</td><td>可选</td></tr>
        </table>
        <p><strong>什么是豆包 API？</strong> 它是一套程序接口，让你的软件可以调用字节跳动的 AI 能力，包括智能对话、文生图等功能。</p>

        <h2>1️⃣ 注册火山引擎账号</h2>
        <ol>
          <li>打开浏览器，访问 <a href="https://www.volcengine.com/" target="_blank">https://www.volcengine.com/</a></li>
          <li>点击页面右上角的「<strong>免费注册</strong>」按钮</li>
          <li>选择「<strong>个人注册</strong>」（企业用户选企业注册）</li>
          <li>填写手机号、获取验证码、设置密码（8-20位，需包含字母+数字）</li>
          <li>勾选服务协议，点击「立即注册」</li>
        </ol>
        <p>💡 <em>验证码通常在 60 秒内发送，如果没收到，检查是否被拦截到垃圾短信</em></p>

        <h2>2️⃣ 实名认证</h2>
        <div class="warning-box">
          ⚠️ <strong>重要</strong>：未实名认证无法使用 API 服务
        </div>
        <ol>
          <li>登录后，点击右上角头像 → 「<strong>实名认证</strong>」</li>
          <li>或直接访问：<a href="https://console.volcengine.com/user/authentication/" target="_blank">https://console.volcengine.com/user/authentication/</a></li>
          <li>选择「<strong>个人认证</strong>」</li>
          <li>填写真实姓名、身份证号码</li>
          <li>上传身份证正反面照片</li>
          <li>进行人脸识别验证</li>
          <li>提交审核（通常几分钟到几小时）</li>
        </ol>

        <h2>3️⃣ 开通豆包服务</h2>
        <ol>
          <li>实名认证通过后，访问 <a href="https://console.volcengine.com/ark/" target="_blank">火山方舟控制台</a></li>
          <li>在左侧菜单找到「<strong>开通管理</strong>」</li>
          <li>找到需要的模型（如 <strong>doubao-seed-1-8</strong>）</li>
          <li>点击「<strong>立即开通</strong>」</li>
        </ol>
        <p>💡 <em>新用户通常有免费额度，开通时需要同意服务条款</em></p>

        <h2>4️⃣ 创建 API Key</h2>
        <ol>
          <li>点击右上角头像 → 「<strong>API Key 管理</strong>」</li>
          <li>或直接访问：<a href="https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey" target="_blank">API Key 管理页面</a></li>
          <li>点击「<strong>创建 API Key</strong>」按钮</li>
          <li>填写名称（如 my-openclaw-key）</li>
          <li>选择有效期（建议选永久）</li>
          <li>点击「确认创建」</li>
        </ol>
        <div class="important-box">
          ❗ <strong>请务必立即复制保存 API Key！</strong><br>
          关闭页面后将无法再次查看完整 Key
        </div>

        <h2>5️⃣ 开通模型（重要！）</h2>
        <div class="warning-box">
          ⚠️ 使用前必须在「<strong>开通管理</strong>」页面开通对应模型，否则会报错 "模型未开通"
        </div>
        <ol>
          <li>访问 <a href="https://console.volcengine.com/ark/region:ark+cn-beijing/openManagement" target="_blank">开通管理页面</a></li>
          <li>找到 <code>doubao-seed-1-8-251228</code>（推荐）或其他需要的模型</li>
          <li>点击「开通」按钮</li>
        </ol>

        <h2>❓ 常见问题</h2>
        <h3>Q: API 调用返回 "模型未开通" 错误？</h3>
        <p>访问 <a href="https://console.volcengine.com/ark/region:ark+cn-beijing/openManagement" target="_blank">开通管理</a> 页面，确保已开通对应模型。</p>
        
        <h3>Q: API Key 无效？</h3>
        <p>检查 API Key 是否复制完整（不要有多余空格），或 Key 是否被删除/禁用。</p>
        
        <h3>Q: 实名认证失败？</h3>
        <p>确保身份证照片清晰、四角完整，人脸识别时光线充足，姓名和身份证号无误。</p>

        <h2>📚 相关链接</h2>
        <table>
          <tr><th>用途</th><th>链接</th></tr>
          <tr><td>火山引擎官网</td><td><a href="https://www.volcengine.com/" target="_blank">https://www.volcengine.com/</a></td></tr>
          <tr><td>控制台登录</td><td><a href="https://console.volcengine.com/" target="_blank">https://console.volcengine.com/</a></td></tr>
          <tr><td>火山方舟</td><td><a href="https://console.volcengine.com/ark/" target="_blank">https://console.volcengine.com/ark/</a></td></tr>
          <tr><td>API Key 管理</td><td><a href="https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey" target="_blank">API Key 管理</a></td></tr>
          <tr><td>开通管理</td><td><a href="https://console.volcengine.com/ark/region:ark+cn-beijing/openManagement" target="_blank">开通管理</a></td></tr>
          <tr><td>API 文档</td><td><a href="https://www.volcengine.com/docs/82379" target="_blank">https://www.volcengine.com/docs/82379</a></td></tr>
        </table>
      </div>
      <div class="doubao-tutorial-footer">
        <button class="btn btn-primary" onclick="closeDoubaoTutorial()">我知道了</button>
      </div>
    </div>
  </div>

  <!-- 撒花容器 -->
  <div id="confettiContainer" class="confetti-container"></div>

`;
}

/**
 * 渲染页面 <script> 块（含 <script> 标签）
 * 包含：状态管理、步骤导航、所有交互逻辑、初始化代码
 */
function renderScriptContent(ctx: SetupPageContext): string {
  const { providers } = ctx;
  return `
  <script>
    // ==================== 状态管理 ====================
    // Restore step from URL hash or sessionStorage on page reload (e.g. after
    // gateway restart or Tauri watchdog re-navigation). URL hash is the primary
    // recovery mechanism (works across origins). sessionStorage is a fallback
    // for same-origin navigations only (does NOT survive cross-origin changes
    // like tauri://localhost → http://127.0.0.1).
    // 3 步流程：1=法律同意, 2=模型选择, 3=完成
    const STEP_PAGES = { 1: 'pageLegal', 2: 'page1', 3: 'pageActivation' };
    const TOTAL_STEPS = 3;
    let currentStep = (function() {
      try {
        const m = location.hash.match(/step=(\d+)/);
        if (m) { const s = parseInt(m[1], 10); if (s >= 1 && s <= TOTAL_STEPS) return s; }
        const stored = sessionStorage.getItem('setup-wizard-step');
        if (stored) { const s = parseInt(stored, 10); if (s >= 1 && s <= TOTAL_STEPS) return s; }
      } catch(e) {}
      return 1;
    })();
    let selectedProvider = null;
    let selectedSecurity = 'standard';
    let selectedChannels = [];
    let trustedDirs = [];
    const providerNames = ${JSON.stringify(Object.fromEntries(providers.map((p) => [p.id, p.name])))};
    const securityModeNames = { full: '只聊天', standard: '正常使用', trust: '完全信任' };
    const channelNames = { web: '网页对话', dingtalk: '钉钉', feishu: '飞书', wecom: '企业微信' };

    // ==================== 步骤导航（4步流程） ====================
    const MATERIAL_ICON_FALLBACKS = {
      add: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
      add_circle_outline: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>',
      arrow_back: '<svg viewBox="0 0 24 24"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>',
      arrow_forward: '<svg viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg>',
      check_circle: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/></svg>',
      close: '<svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>',
      code: '<svg viewBox="0 0 24 24"><path d="m9 18-6-6 6-6M15 6l6 6-6 6"/></svg>',
      error_outline: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 17h.01"/></svg>',
      expand_less: '<svg viewBox="0 0 24 24"><path d="m6 15 6-6 6 6"/></svg>',
      expand_more: '<svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>',
      folder: '<svg viewBox="0 0 24 24"><path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H10l2 2h6.5A2.5 2.5 0 0 1 21 8.5v8A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5Z"/></svg>',
      folder_open: '<svg viewBox="0 0 24 24"><path d="M3 7h7l2 2h9v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/><path d="M3 11h18"/></svg>',
      groups: '<svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-8 0v2"/><circle cx="12" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75M2 21v-2a4 4 0 0 1 3-3.87M8 3.13a4 4 0 0 0 0 7.75"/></svg>',
      help_outline: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 1 1 4.9 2.3c-.9.7-2 1.2-2 2.7M12 17h.01"/></svg>',
      info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
      menu_book: '<svg viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15Z"/></svg>',
      open_in_new: '<svg viewBox="0 0 24 24"><path d="M15 3h6v6M10 14 21 3"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/></svg>',
      play_circle: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m10 8 6 4-6 4V8Z" class="mi-fill"/></svg>',
      rocket_launch: '<svg viewBox="0 0 24 24"><path d="M5 15c-1.5 1-2 3-2 6 3 0 5-.5 6-2"/><path d="M15 9 9 15"/><path d="M14 4c2.6-1.3 5-1 6-1-.1 1 .2 3.4-1 6l-7 7-5-5 7-7Z"/><circle cx="16" cy="8" r="1.5"/></svg>',
      school: '<svg viewBox="0 0 24 24"><path d="m22 10-10-5-10 5 10 5 10-5Z"/><path d="M6 12v5c3 2 9 2 12 0v-5"/><path d="M22 10v6"/></svg>',
      science: '<svg viewBox="0 0 24 24"><path d="M10 2v6l-5 9a3 3 0 0 0 2.6 4.5h8.8A3 3 0 0 0 19 17l-5-9V2"/><path d="M8 2h8M8.5 14h7"/></svg>',
      settings: '<svg viewBox="0 0 24 24"><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"/><path d="M19.4 15a1.8 1.8 0 0 0 .36 2l.05.05a2 2 0 1 1-2.83 2.83l-.05-.05a1.8 1.8 0 0 0-2-.36 1.8 1.8 0 0 0-1 1.64V21a2 2 0 1 1-4 0v-.07a1.8 1.8 0 0 0-1-1.64 1.8 1.8 0 0 0-2 .36l-.05.05a2 2 0 1 1-2.83-2.83l.05-.05a1.8 1.8 0 0 0 .36-2 1.8 1.8 0 0 0-1.64-1H3a2 2 0 1 1 0-4h.07a1.8 1.8 0 0 0 1.64-1 1.8 1.8 0 0 0-.36-2l-.05-.05a2 2 0 1 1 2.83-2.83l.05.05a1.8 1.8 0 0 0 2 .36 1.8 1.8 0 0 0 1-1.64V3a2 2 0 1 1 4 0v.07a1.8 1.8 0 0 0 1 1.64 1.8 1.8 0 0 0 2-.36l.05-.05a2 2 0 1 1 2.83 2.83l-.05.05a1.8 1.8 0 0 0-.36 2 1.8 1.8 0 0 0 1.64 1H21a2 2 0 1 1 0 4h-.07a1.8 1.8 0 0 0-1.53 1Z"/></svg>',
      visibility: '<svg viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>',
      visibility_off: '<svg viewBox="0 0 24 24"><path d="m3 3 18 18"/><path d="M10.6 10.6A3 3 0 0 0 13.4 13.4"/><path d="M9.9 4.4A10.4 10.4 0 0 1 12 4c6.5 0 10 8 10 8a18.4 18.4 0 0 1-4.1 5.1M6.1 6.1A18.4 18.4 0 0 0 2 12s3.5 8 10 8c1 0 2-.2 2.9-.5"/></svg>',
      warning: '<svg viewBox="0 0 24 24"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v5M12 17h.01"/></svg>',
      warning_amber: '<svg viewBox="0 0 24 24"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v5M12 17h.01"/></svg>',
    };

    function hydrateMaterialIcon(el) {
      if (!el || !el.classList || !el.classList.contains('material-icons')) return;
      const raw = (el.textContent || '').trim();
      const key = MATERIAL_ICON_FALLBACKS[raw] ? raw : el.dataset.icon;
      if (!key || !MATERIAL_ICON_FALLBACKS[key]) return;
      if (el.dataset.icon === key && el.querySelector('svg')) return;
      el.dataset.icon = key;
      el.setAttribute('aria-hidden', 'true');
      el.classList.add('mi-ready');
      el.innerHTML = MATERIAL_ICON_FALLBACKS[key];
    }

    function hydrateMaterialIcons(root) {
      const scope = root && root.querySelectorAll ? root : document;
      if (scope.classList && scope.classList.contains('material-icons')) {
        hydrateMaterialIcon(scope);
      }
      scope.querySelectorAll('.material-icons').forEach(hydrateMaterialIcon);
    }

    function installMaterialIconFallbacks() {
      hydrateMaterialIcons(document);
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.type === 'characterData') {
            hydrateMaterialIcons(mutation.target.parentElement);
            continue;
          }
          if (mutation.target && mutation.target.nodeType === 1) {
            hydrateMaterialIcons(mutation.target);
          }
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === 1) {
              hydrateMaterialIcons(node);
            } else if (node.parentElement) {
              hydrateMaterialIcons(node.parentElement);
            }
          });
        }
      });
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', installMaterialIconFallbacks, { once: true });
    } else {
      installMaterialIconFallbacks();
    }

    function goToStep(step) {
      currentStep = step;
      try { history.replaceState(null, '', '#step=' + step); } catch(e) {}
      try { sessionStorage.setItem('setup-wizard-step', String(step)); } catch(e) {}

      // 隐藏所有 page
      const allPages = ['pageLegal', 'page0', 'page1', 'page2', 'page3', 'pageActivation'];
      allPages.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
      });

      // 显示当前 step 对应的 page
      const targetPageId = STEP_PAGES[step];
      if (targetPageId) {
        const targetPage = document.getElementById(targetPageId);
        if (targetPage) targetPage.classList.remove('hidden');
      }

      // 更新步骤指示器
      for (let i = 1; i <= TOTAL_STEPS; i++) {
        const stepItem = document.getElementById('stepItem' + i);
        if (stepItem) {
          stepItem.classList.toggle('active', i === step);
          stepItem.classList.toggle('completed', i < step);
        }
        if (i < TOTAL_STEPS) {
          const connector = document.getElementById('connector' + i);
          if (connector) connector.classList.toggle('completed', i < step);
        }
      }
    }

    async function nextStep(step) {
      if (step === 1) {
        // Step 1: 法律同意 — 检查复选框
        const legalCheckbox = document.getElementById('legalAgree');
        if (!legalCheckbox || !legalCheckbox.checked) {
          const wrapper = document.getElementById('legalAgreementCheckbox');
          if (wrapper) {
            wrapper.style.border = '1px solid var(--accent-red)';
            setTimeout(() => { wrapper.style.border = ''; }, 1500);
          }
          return;
        }
      }

      if (step === 2) {
        // Step 2: 模型选择（原 step 1 逻辑）
        const apiKey = document.getElementById('apiKeyInput').value.trim();
        if (!apiKey) {
          showStatus('apiKeyStatus', '请输入 API Key', 'error');
          return;
        }
        if (!selectedProvider) {
          showStatus('apiKeyStatus', '请选择一个 AI 平台', 'error');
          return;
        }

        if (selectedProvider === 'custom') {
          const modelInputValue = document.getElementById('modelSelect').value.trim();
          const customEndpoint = document.getElementById('customEndpoint').value.trim();
          if (!customEndpoint) {
            showStatus('apiKeyStatus', '请输入自定义 API 端点地址', 'error');
            return;
          }
          if (!modelInputValue) {
            showStatus('apiKeyStatus', '请输入模型名称', 'error');
            return;
          }
          selectedModel = modelInputValue;
        }

        const btn = document.getElementById('step1Next');
        btn.disabled = true;
        btn.innerHTML = '<span class="status-spinner"></span> 验证中...';

        showStatus('apiKeyStatus', '正在验证 API Key...', 'loading');
        try {
          const modelToUse = selectedModel || document.getElementById('modelSelect').value.trim();
          const customEndpointValue = selectedProvider === 'custom' ? (document.getElementById('customEndpoint').value.trim() || '') : '';
          const verifyPayload = { provider: selectedProvider, apiKey: apiKey, model: modelToUse };
          if (customEndpointValue) verifyPayload.endpoint = customEndpointValue;
          const verifyRes = await fetch('/api/setup/verify-apikey', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(verifyPayload)
          });
          const verifyData = await verifyRes.json();

          if (!verifyData.ok || !verifyData.data?.valid) {
            const errorMsg = verifyData.data?.error || verifyData.error || 'API Key 无效';
            showStatus('apiKeyStatus', '❌ 验证失败: ' + errorMsg, 'error');
            btn.disabled = false;
            btn.innerHTML = '下一步 <span class="material-icons">arrow_forward</span>';
            return;
          }

          showStatus('apiKeyStatus', '✓ API Key 验证成功，正在保存...', 'success');
          await delay(300);

          const configPayload = { provider: selectedProvider, apiKey: apiKey, model: modelToUse };
          if (customEndpointValue) configPayload.endpoint = customEndpointValue;
          const res = await fetch('/api/setup/configure-provider', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(configPayload)
          });
          const data = await res.json();
          if (!data.ok) throw new Error(data.error || '配置失败');
          showStatus('apiKeyStatus', '✓ 配置已保存', 'success');
          await delay(500);
        } catch (e) {
          showStatus('apiKeyStatus', '保存失败: ' + (e.message || e), 'error');
          btn.disabled = false;
          btn.innerHTML = '下一步 <span class="material-icons">arrow_forward</span>';
          return;
        }
        btn.disabled = false;
        btn.innerHTML = '下一步 <span class="material-icons">arrow_forward</span>';

        // 自动配置安全模式（满血默认值，不需要用户手动设置）
        try {
          await fetch('/api/setup/configure-security', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: 'standard', trustedDirs: [] })
          });
        } catch (e) { console.warn('自动安全配置:', e); }
      }

      goToStep(step + 1);
    }

    // Step 1 法律同意：复选框状态变更
    function updateLegalBtn() {
      const cb = document.getElementById('legalAgree');
      const btn = document.getElementById('legalNextBtn');
      if (btn) btn.disabled = !(cb && cb.checked);
    }

    // 完成 Setup（开源版无需云端校验）
    async function completeSetup() {
      const btn = document.getElementById('localModeBtn');
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="status-spinner"></span> 正在进入...';
      }

      try {
        await fetch('/api/setup/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}'
        });
      } catch (e) { console.warn('complete:', e); }

      // 清除向导步骤缓存
      try { sessionStorage.removeItem('setup-wizard-step'); } catch(e) {}

      // 直接跳转到主界面（不再显示完成页）
      // 先触发 gateway 重启，然后跳转
      try {
        await fetch('/api/setup/restart', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
          signal: AbortSignal.timeout(3000),
        });
      } catch(e) { /* restart 失败或不支持（Windows），忽略 */ }
      // 短暂等待后跳转到主界面
      setTimeout(() => { skipToChat(); }, 1500);
    }

    function prevStep(step) {
      resetStepButtons();
      goToStep(step - 1);
    }

    function resetStepButtons() {
      const step1Btn = document.getElementById('step1Next');
      if (step1Btn) {
        step1Btn.disabled = !selectedProvider;
        step1Btn.innerHTML = '下一步 <span class="material-icons">arrow_forward</span>';
      }

      const statusMessages = document.querySelectorAll('.status-message');
      statusMessages.forEach(el => {
        el.className = 'status-message';
        el.textContent = '';
      });
    }

    // ==================== Step 1: AI 服务 ====================
    const providerModels = ${JSON.stringify(
      Object.fromEntries(
        providers.map((p) => [
          p.id,
          p.models.map((m) => ({
            id: m.id,
            name: m.name,
            description: m.description,
            recommended: m.recommended,
          })),
        ]),
      ),
    )};
    
    const defaultModels = {
      'siliconflow': 'deepseek-ai/DeepSeek-V3',
      'aliyun-bailian': 'qwen-plus',
      'deepseek': 'deepseek-chat',
      'glm': 'glm-4-flash-250414',
      'volcengine-ark': 'doubao-seed-1-8-251228',
      'tencent-hunyuan': 'hunyuan-standard',
      'minimax': 'MiniMax-M2.1',
      'moonshot': 'kimi-latest',
      'kimi-coding': 'kimi-for-coding',
      'aliyun-codeplan': 'qwen3-coder-plus',
      'glm-codeplan': 'glm-4.7',
      'minimax-codeplan': 'MiniMax-M2.5',
      'openai': 'o4-mini',
      'anthropic': 'claude-sonnet-4-20250514',
      'google': 'gemini-3-flash-preview',
      'nvidia': 'nvidia/llama-3.3-nemotron-super-49b-v1',
      'openrouter': 'openrouter/auto',
      'custom': 'custom-model'
    };
    
    let selectedModel = null;

    function selectProvider(id) {
      selectedProvider = id;
      
      // 更新推荐卡片选中状态
      document.querySelectorAll('.provider-card').forEach(el => {
        el.classList.toggle('selected', el.dataset.provider === id);
        // 保持 featured 类
        if (el.dataset.provider === 'kimi-coding') {
          el.classList.add('featured');
        }
      });
      
      // 更新其他服务商选项选中状态
      document.querySelectorAll('.provider-option').forEach(el => {
        el.classList.toggle('selected', el.dataset.provider === id);
      });
      
      // 旧版兼容
      document.querySelectorAll('#providerList .option-card').forEach(el => {
        el.classList.toggle('selected', el.dataset.provider === id);
      });
      
      document.getElementById('apiKeyForm').classList.remove('hidden');
      document.getElementById('apiKeyLabel').textContent = providerNames[id] + ' API Key';
      
      // 根据提供商更新 API Key 帮助信息
      const apiKeyHelp = document.getElementById('apiKeyHelp');
      const apiKeyHelpTexts = {
        'siliconflow': '在 <a href="https://cloud.siliconflow.cn/i/uXXX7IEi" target="_blank">硅基流动</a> 免费注册领取额度，然后在 <a href="https://cloud.siliconflow.cn/account/ak" target="_blank">API Keys 页面</a> 获取 Key',
        'aliyun-bailian': '在 <a href="https://bailian.console.aliyun.com/" target="_blank">阿里云百炼控制台</a> 获取 API Key',
        'deepseek': '在 <a href="https://platform.deepseek.com/api_keys" target="_blank">DeepSeek 控制台</a> 获取 API Key',
        'glm': '在 <a href="https://www.bigmodel.cn/glm-coding?ic=ZPADWSX0SI" target="_blank">智谱 AI 开放平台</a> 注册免费送2000万Token，然后在 <a href="https://open.bigmodel.cn/usercenter/apikeys" target="_blank">API Keys 页面</a> 获取 Key',
        'moonshot': '在 <a href="https://platform.moonshot.cn/console/api-keys" target="_blank">Kimi 开放平台</a> 获取 API Key',
        'kimi-coding': '在 <a href="https://www.kimi.com/code/docs/" target="_blank">Kimi Code 文档</a> 获取 API Key（代码专用，262K 超长上下文）',
        'aliyun-codeplan': '在 <a href="https://www.aliyun.com/benefit?source=5176.29345612&userCode=xsngby7y" target="_blank">阿里云 AI Star</a> 注册获取 Coding Plan API Key（代码专用，与百炼 Key 不同）',
        'glm-codeplan': '在 <a href="https://www.bigmodel.cn/glm-coding?ic=ZPADWSX0SI" target="_blank">智谱开放平台</a> 获取 Coding Plan API Key（代码专用，与通用 GLM Key 不同）',
        'minimax-codeplan': '在 <a href="https://platform.minimaxi.com/subscribe/coding-plan?code=I5REQrAnfL&source=link" target="_blank">MiniMax 平台</a> 订阅 Coding Plan 获取专用 API Key',
        'volcengine-ark': '在 <a href="https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey" target="_blank">火山引擎控制台</a> 获取 API Key，需先在 <a href="https://console.volcengine.com/ark/region:ark+cn-beijing/openManagement" target="_blank">开通管理</a> 开通模型 <button class="tutorial-help-btn" onclick="openDoubaoTutorial()"><span class="material-icons">help_outline</span>新手教程</button>',
        'tencent-hunyuan': '在 <a href="https://console.cloud.tencent.com/hunyuan" target="_blank">腾讯云混元控制台</a> 获取 Secret ID 和 Secret Key',
        'minimax': '在 <a href="https://platform.minimaxi.com/subscribe/coding-plan?code=I5REQrAnfL&source=link" target="_blank">MiniMax 开放平台</a> 注册领取免费额度，然后在 <a href="https://platform.minimaxi.com/user-center/basic-information/interface-key" target="_blank">接口密钥页面</a> 获取 API Key',
        'openai': '在 <a href="https://platform.openai.com/api-keys" target="_blank">OpenAI 平台</a> 获取 API Key（需要科学上网）',
        'anthropic': '在 <a href="https://console.anthropic.com/settings/keys" target="_blank">Anthropic 控制台</a> 获取 API Key（需要科学上网）',
        'google': '在 <a href="https://aistudio.google.com/apikey" target="_blank">Google AI Studio</a> 获取 API Key（需要科学上网）',
        'nvidia': '在 <a href="https://build.nvidia.com/settings" target="_blank">NVIDIA Build</a> 获取 API Key（需要科学上网）',
        'openrouter': '在 <a href="https://openrouter.ai/keys" target="_blank">OpenRouter</a> 获取 API Key（需要科学上网，聚合多家模型）',
        'modelscope': '在 <a href="https://modelscope.cn/my/myaccesstoken" target="_blank">魔搭社区</a> 获取 Access Token（完全免费！）',
        'ollama': '本地模型无需 API Key，默认填 ollama 即可。需先 <a href="https://ollama.com/download" target="_blank">安装 Ollama</a>',
        'custom': '填写你的自定义 API 端点地址和 API Key'
      };
      apiKeyHelp.innerHTML = apiKeyHelpTexts[id] || '在对应平台的控制台获取 API Key';
      
      // 显示/隐藏硅基流动常见问题提示
      const siliconflowFaqTip = document.getElementById('siliconflowFaqTip');
      if (siliconflowFaqTip) {
        if (id === 'siliconflow') {
          siliconflowFaqTip.classList.remove('hidden');
        } else {
          siliconflowFaqTip.classList.add('hidden');
        }
      }
      
      // 更新模型选择
      updateModelSelect(id);
      
      document.getElementById('step1Next').disabled = false;
    }

    function toggleOtherProviders() {
      const content = document.getElementById('providerOtherContent');
      const icon = document.getElementById('providerToggleIcon');
      
      content.classList.toggle('hidden');
      icon.textContent = content.classList.contains('hidden') ? 'expand_more' : 'expand_less';
    }
    
    function toggleInternationalProviders() {
      const content = document.getElementById('internationalProviderContent');
      const icon = document.getElementById('internationalToggleIcon');
      
      content.classList.toggle('hidden');
      icon.textContent = content.classList.contains('hidden') ? 'expand_more' : 'expand_less';
    }
    
    function toggleLocalProviders() {
      const content = document.getElementById('localProviderContent');
      const icon = document.getElementById('localToggleIcon');
      
      content.classList.toggle('hidden');
      icon.textContent = content.classList.contains('hidden') ? 'expand_more' : 'expand_less';
    }

    
    // ==================== Model Combobox 逻辑 ====================
    let currentModels = [];  // 当前提供商的模型列表
    let highlightedIndex = -1;  // 当前高亮的选项索引
    let isComboboxOpen = false;
    let currentProviderId = null;
    
    function updateModelSelect(providerId) {
      const combobox = document.getElementById('modelCombobox');
      const input = document.getElementById('modelSelect');
      const dropdown = document.getElementById('modelDropdown');
      const modelInputSection = document.getElementById('modelInputSection');
      const modelInputHelp = document.getElementById('modelInputHelp');
      const modelHint = document.getElementById('modelHint');
      const customEndpointSection = document.getElementById('customEndpointSection');
      const models = providerModels[providerId] || [];
      const defaultModel = defaultModels[providerId];
      
      currentProviderId = providerId;
      currentModels = models;
      highlightedIndex = -1;
      
      // 重置显示状态
      combobox.classList.remove('hidden');
      modelInputSection.classList.add('hidden');
      customEndpointSection.classList.add('hidden');
      closeCombobox();
      
      // 自定义 API 需要输入端点地址和模型名
      if (providerId === 'custom') {
        customEndpointSection.classList.remove('hidden');
        modelInputSection.classList.remove('hidden');
        input.value = '';
        input.placeholder = '请输入模型名称（如 llama3.2, qwen2.5 等）';
        modelInputHelp.textContent = '填写你的模型名称，根据你使用的服务确定';
        modelHint.textContent = '（需要填写 API 端点和模型名）';
        selectedModel = null;
        currentModels = [];  // 自定义 API 没有预设模型
        showEditableTag(false);
        return;
      }

      // 普通提供商 - 设置默认值
      if (defaultModel) {
        const defaultModelObj = models.find(m => m.id === defaultModel);
        input.value = defaultModel;
        selectedModel = defaultModel;
        showEditableTag(true);
      } else if (models.length > 0) {
        input.value = models[0].id;
        selectedModel = models[0].id;
        showEditableTag(true);
      } else {
        input.value = '';
        input.placeholder = '输入或选择模型';
        selectedModel = null;
        showEditableTag(false);
      }
      
      // 更新提示文本
      if (providerId === 'siliconflow') {
        modelHint.textContent = '（推荐 DeepSeek-V3，性能强劲）';
      } else if (providerId === 'aliyun-bailian') {
        modelHint.textContent = '（推荐 Qwen-Plus，性价比最高）';
      } else if (providerId === 'glm') {
        modelHint.textContent = '（注册送2000万Token，GLM-4 Flash 永久免费！）';
      } else if (providerId === 'volcengine-ark') {
        modelHint.textContent = '（推荐豆包 1.8，需先开通模型）';
      } else if (providerId === 'openai') {
        modelHint.textContent = '（推荐 GPT-4o，多模态旗舰）';
      } else if (providerId === 'anthropic') {
        modelHint.textContent = '（推荐 Claude Sonnet 4，编程最强）';
      } else {
        modelHint.textContent = '（推荐值已选好，直接下一步即可）';
      }
      
      // 渲染下拉列表
      renderDropdown('');
    }
    
    function renderDropdown(filter) {
      const dropdown = document.getElementById('modelDropdown');
      const input = document.getElementById('modelSelect');
      const filterLower = filter.toLowerCase().trim();
      const filterValue = filter.trim();
      
      // 过滤模型
      let filteredModels = currentModels;
      if (filterLower) {
        filteredModels = currentModels.filter(m => 
          m.id.toLowerCase().includes(filterLower) || 
          m.name.toLowerCase().includes(filterLower) ||
          (m.description && m.description.toLowerCase().includes(filterLower))
        );
      }
      
      const defaultModel = defaultModels[currentProviderId];
      let html = '';
      
      // 检查用户输入的值是否完全匹配某个预设模型 ID
      const isExactMatch = currentModels.some(m => m.id.toLowerCase() === filterLower);
      
      // 如果用户输入了自定义值（非空且不完全匹配预设），显示"使用自定义值"选项
      if (filterValue && !isExactMatch) {
        const isCustomHighlighted = highlightedIndex === -2; // 特殊索引表示自定义选项
        html += '<div class="model-option model-option-custom' + (isCustomHighlighted ? ' highlighted' : '') + '" data-value="' + escapeHtml(filterValue) + '" data-index="-2">';
        html += '<span class="model-option-custom-icon">✏️</span>';
        html += '<span class="model-option-custom-text">使用自定义模型: <strong>' + escapeHtml(filterValue) + '</strong></span>';
        html += '</div>';
        html += '<div class="model-dropdown-divider"></div>';
      }
      
      if (filteredModels.length === 0) {
        if (currentModels.length === 0) {
          // 自定义 API 或无预设模型
          html += '<div class="model-dropdown-hint">直接输入模型名称即可</div>';
        } else if (!filterValue) {
          html += '<div class="model-dropdown-empty">请输入模型名称</div>';
        }
        // 如果有自定义选项，不需要额外提示
        dropdown.innerHTML = html;
        highlightedIndex = filterValue && !isExactMatch ? -2 : -1;
        return;
      }
      
      if (!filterLower && filteredModels.length > 0) {
        html += '<div class="model-dropdown-hint">选择推荐模型，或直接输入自定义模型名</div>';
      }
      
      filteredModels.forEach((m, idx) => {
        const isDefault = m.id === defaultModel;
        const isSelected = m.id === input.value;
        const isHighlighted = idx === highlightedIndex;
        
        let classes = 'model-option';
        if (isSelected) classes += ' selected';
        if (isHighlighted) classes += ' highlighted';
        
        let badge = '';
        if (isDefault) {
          badge = '<span class="model-option-badge">⭐ 推荐</span>';
        } else if (m.free) {
          badge = '<span class="model-option-badge free">免费</span>';
        }
        
        const desc = m.description ? '<span class="model-option-desc">' + escapeHtml(m.description) + '</span>' : '';
        
        html += '<div class="' + classes + '" data-value="' + escapeHtml(m.id) + '" data-index="' + idx + '">';
        html += '<span><span class="model-option-name">' + escapeHtml(m.name) + '</span>' + desc + '</span>';
        html += badge;
        html += '</div>';
      });
      
      dropdown.innerHTML = html;
    }
    
    function escapeHtml(text) {
      if (!text) return '';
      return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    
    function openCombobox() {
      const combobox = document.getElementById('modelCombobox');
      if (isComboboxOpen) return;
      isComboboxOpen = true;
      combobox.classList.add('open');
      highlightedIndex = -1;
      renderDropdown(document.getElementById('modelSelect').value);
    }
    
    function closeCombobox() {
      const combobox = document.getElementById('modelCombobox');
      isComboboxOpen = false;
      combobox.classList.remove('open');
      highlightedIndex = -1;
    }
    
    function selectModel(value) {
      const input = document.getElementById('modelSelect');
      input.value = value;
      selectedModel = value;
      closeCombobox();
      showEditableTag(!!value);
    }

    function showEditableTag(visible) {
      const tag = document.getElementById('modelEditableTag');
      if (tag) {
        if (visible) {
          tag.classList.add('visible');
        } else {
          tag.classList.remove('visible');
        }
      }
    }
    
    function getFilteredModels(filter) {
      const filterLower = filter.toLowerCase().trim();
      if (!filterLower) return currentModels;
      return currentModels.filter(m => 
        m.id.toLowerCase().includes(filterLower) || 
        m.name.toLowerCase().includes(filterLower) ||
        (m.description && m.description.toLowerCase().includes(filterLower))
      );
    }
    
    // 事件监听：输入框
    document.getElementById('modelSelect').addEventListener('focus', function() {
      openCombobox();
    });
    
    document.getElementById('modelSelect').addEventListener('input', function() {
      selectedModel = this.value.trim();
      highlightedIndex = -1;
      renderDropdown(this.value);
      if (!isComboboxOpen) {
        openCombobox();
      }
    });
    
    document.getElementById('modelSelect').addEventListener('keydown', function(e) {
      const filteredModels = getFilteredModels(this.value);
      const inputValue = this.value.trim();
      const isExactMatch = currentModels.some(m => m.id.toLowerCase() === inputValue.toLowerCase());
      const hasCustomOption = inputValue && !isExactMatch;
      
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!isComboboxOpen) {
          openCombobox();
          return;
        }
        // 支持从自定义选项向下导航到列表
        if (highlightedIndex === -2 && filteredModels.length > 0) {
          highlightedIndex = 0;
        } else if (filteredModels.length > 0) {
          highlightedIndex = Math.min(highlightedIndex + 1, filteredModels.length - 1);
        }
        renderDropdown(this.value);
        scrollToHighlighted();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        // 支持从列表向上导航到自定义选项
        if (highlightedIndex === 0 && hasCustomOption) {
          highlightedIndex = -2;
          renderDropdown(this.value);
        } else if (highlightedIndex > 0) {
          highlightedIndex = Math.max(highlightedIndex - 1, 0);
          renderDropdown(this.value);
          scrollToHighlighted();
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (isComboboxOpen) {
          if (highlightedIndex === -2) {
            // 选择自定义值
            selectModel(inputValue);
          } else if (highlightedIndex >= 0 && filteredModels.length > 0) {
            selectModel(filteredModels[highlightedIndex].id);
          } else {
            // 直接使用输入的值
            selectedModel = inputValue;
            closeCombobox();
          }
        }
      } else if (e.key === 'Escape') {
        closeCombobox();
      } else if (e.key === 'Tab') {
        closeCombobox();
      }
    });
    
    function scrollToHighlighted() {
      const dropdown = document.getElementById('modelDropdown');
      const highlighted = dropdown.querySelector('.model-option.highlighted, .model-option-custom.highlighted');
      if (highlighted) {
        highlighted.scrollIntoView({ block: 'nearest' });
      }
    }
    
    // 事件监听：下拉选项点击
    document.getElementById('modelDropdown').addEventListener('mousedown', function(e) {
      // 阻止 blur 事件触发，否则下拉框会在点击前关闭
      e.preventDefault();
    });
    
    document.getElementById('modelDropdown').addEventListener('click', function(e) {
      const option = e.target.closest('.model-option');
      if (option) {
        const value = option.dataset.value;
        if (value) {
          selectModel(value);
        }
      }
    });
    
    // 事件监听：鼠标悬停高亮
    document.getElementById('modelDropdown').addEventListener('mouseover', function(e) {
      const option = e.target.closest('.model-option');
      if (option) {
        const index = parseInt(option.dataset.index, 10);
        if (!isNaN(index) && index !== highlightedIndex) {
          highlightedIndex = index;
          renderDropdown(document.getElementById('modelSelect').value);
        }
      }
    });
    
    // 事件监听：点击外部关闭下拉
    document.addEventListener('click', function(e) {
      const combobox = document.getElementById('modelCombobox');
      if (combobox && !combobox.contains(e.target)) {
        closeCombobox();
      }
    });

    function togglePasswordVisibility() {
      const input = document.getElementById('apiKeyInput');
      const icon = document.getElementById('passwordIcon');
      if (input.type === 'password') {
        input.type = 'text';
        icon.textContent = 'visibility_off';
      } else {
        input.type = 'password';
        icon.textContent = 'visibility';
      }
    }

    // ==================== Step 2: 安全设置 ====================
    function selectSecurity(mode) {
      if (mode === 'trust') {
        // 显示确认弹窗
        document.getElementById('trustModeModal').classList.remove('hidden');
        return;
      }
      
      doSelectSecurity(mode);
    }

    function doSelectSecurity(mode) {
      selectedSecurity = mode;
      
      // 更新所有大卡片状态
      document.querySelectorAll('.security-big-card').forEach(el => {
        el.classList.toggle('selected', el.dataset.security === mode);
      });
      
      // 更新折叠区域中的小卡片状态
      document.querySelectorAll('.security-option-card').forEach(el => {
        el.classList.toggle('selected', el.dataset.security === mode);
      });
      
      window.trustModeConfirmed = (mode === 'trust');
      
      // 更新工作目录区域的显示状态
      updateSecurityModeDisplay();
    }

    function toggleOtherSecurityOptions() {
      const content = document.getElementById('securityOtherContent');
      const toggle = document.querySelector('.security-other-toggle');
      const icon = document.getElementById('securityToggleIcon');
      
      content.classList.toggle('hidden');
      toggle.classList.toggle('open');
    }

    function closeTrustModeModal() {
      document.getElementById('trustModeModal').classList.add('hidden');
    }
    
    function updateAgreement() {
      const checkboxWrapper = document.getElementById('agreementCheckbox');
      checkboxWrapper.classList.remove('error');
    }

    function confirmTrustMode() {
      window.trustModeConfirmed = true;
      doSelectSecurity('trust');
      closeTrustModeModal();
    }

    function updateSecurityModeDisplay() {
      const modeDisplay = document.getElementById('currentModeDisplay');
      const modeStatusDesc = document.getElementById('modeStatusDesc');
      const modeStatusCard = document.getElementById('modeStatusCard');
      const modeStatusIcon = modeStatusCard?.querySelector('.mode-status-icon');
      const trustedSection = document.getElementById('trustedDirsSection');
      const workspaceSection = document.getElementById('workspaceSettingsSection');
      
      if (modeDisplay) modeDisplay.textContent = securityModeNames[selectedSecurity];
      
      if (selectedSecurity === 'trust') {
        // 完全信任模式 - 不需要配置安全区和工作目录（AI 可访问整个系统）
        if (modeStatusIcon) modeStatusIcon.textContent = '⚡';
        if (modeStatusDesc) modeStatusDesc.textContent = '⚠️ AI 可以做任何事，请谨慎操作';
        if (modeStatusCard) {
          modeStatusCard.style.borderColor = 'var(--accent-orange)';
          modeStatusCard.style.background = 'linear-gradient(135deg, rgba(249, 115, 22, 0.12) 0%, rgba(249, 115, 22, 0.04) 100%)';
        }
        if (modeDisplay) modeDisplay.style.color = 'var(--accent-orange)';
        if (trustedSection) trustedSection.style.display = 'none';
        if (workspaceSection) workspaceSection.style.display = 'none';
      } else if (selectedSecurity === 'full') {
        // 只聊天模式 - 不需要配置安全区（AI 无法操作文件）
        if (modeStatusIcon) modeStatusIcon.textContent = '🔒';
        if (modeStatusDesc) modeStatusDesc.textContent = '🔐 AI 只能对话，无法操作你的文件';
        if (modeStatusCard) {
          modeStatusCard.style.borderColor = 'var(--accent-green)';
          modeStatusCard.style.background = 'linear-gradient(135deg, rgba(34, 197, 94, 0.12) 0%, rgba(34, 197, 94, 0.04) 100%)';
        }
        if (modeDisplay) modeDisplay.style.color = 'var(--accent-green)';
        if (trustedSection) trustedSection.style.display = 'none';
        if (workspaceSection) workspaceSection.style.display = 'none';
      } else {
        // 正常使用（默认）- 需要配置安全区文件夹
        if (modeStatusIcon) modeStatusIcon.textContent = '🏠';
        if (modeStatusDesc) modeStatusDesc.textContent = '帮你做事，敏感操作会先问你';
        if (modeStatusCard) {
          modeStatusCard.style.borderColor = 'var(--accent-blue)';
          modeStatusCard.style.background = 'linear-gradient(135deg, rgba(60, 131, 246, 0.12) 0%, rgba(60, 131, 246, 0.04) 100%)';
        }
        if (modeDisplay) modeDisplay.style.color = 'var(--accent-blue-light)';
        if (trustedSection) trustedSection.style.display = 'block';
        if (workspaceSection) workspaceSection.style.display = 'block';
      }
    }
    
    function toggleExtraDirs() {
      const section = document.getElementById('trustedDirsSection');
      const content = document.getElementById('extraDirsContent');
      section.classList.toggle('open');
      content.classList.toggle('hidden');
    }

    function toggleCollapsible(id) {
      const el = document.getElementById(id);
      el.classList.toggle('open');
    }

    // ==================== Step 3: 工作目录 ====================
    let browserCurrentPath = '';
    let browserSelectedPath = '';
    let browsingForTrustedDir = false;

    function browseWorkspace() {
      browsingForTrustedDir = false;
      document.getElementById('folderBrowserModal').classList.remove('hidden');
      loadDirectory();
    }

    function addTrustedDir() {
      browsingForTrustedDir = true;
      document.getElementById('folderBrowserModal').classList.remove('hidden');
      loadDirectory();
    }

    async function loadDirectory(path) {
      const folderList = document.getElementById('folderList');
      const pathInput = document.getElementById('browserPathInput');
      const drivesBar = document.getElementById('drivesBar');
      
      folderList.innerHTML = '<div class="folder-empty">加载中...</div>';
      
      try {
        const url = path ? '/api/setup/browse-directory?path=' + encodeURIComponent(path) : '/api/setup/browse-directory';
        const res = await fetch(url);
        const data = await res.json();
        
        if (!data.ok) {
          folderList.innerHTML = '<div class="folder-empty">无法访问: ' + (data.error || '未知错误') + '</div>';
          return;
        }
        
        browserCurrentPath = data.data.currentPath;
        pathInput.value = browserCurrentPath;
        browserSelectedPath = browserCurrentPath;
        
        if (data.data.drives && data.data.drives.length > 0) {
          drivesBar.innerHTML = data.data.drives.map(d => 
            '<button class="drive-btn" onclick="loadDirectory(\\'' + d.replace(/\\\\/g, '\\\\\\\\') + '\\')">' + d + '</button>'
          ).join('');
          drivesBar.style.display = 'flex';
        } else {
          drivesBar.style.display = 'none';
        }
        
        let html = '';
        if (data.data.parentPath) {
          html += '<div class="folder-item" onclick="loadDirectory(\\'' + data.data.parentPath.replace(/\\\\/g, '\\\\\\\\') + '\\')">' +
            '<span class="folder-item-icon">📁</span>' +
            '<span class="folder-item-name">..</span>' +
            '</div>';
        }
        
        if (data.data.directories && data.data.directories.length > 0) {
          for (const dir of data.data.directories) {
            const escapedPath = dir.path.replace(/\\\\/g, '\\\\\\\\').replace(/'/g, "\\\\'");
            html += '<div class="folder-item" ondblclick="loadDirectory(\\'' + escapedPath + '\\')" onclick="selectFolder(this, \\'' + escapedPath + '\\')">' +
              '<span class="folder-item-icon">📁</span>' +
              '<span class="folder-item-name">' + dir.name + '</span>' +
              '</div>';
          }
        }
        
        folderList.innerHTML = html || '<div class="folder-empty">此目录为空</div>';
      } catch (e) {
        folderList.innerHTML = '<div class="folder-empty">加载失败: ' + e.message + '</div>';
      }
    }

    function selectFolder(el, path) {
      document.querySelectorAll('.folder-item').forEach(item => item.classList.remove('selected'));
      el.classList.add('selected');
      browserSelectedPath = path;
    }

    function navigateToPath() {
      const path = document.getElementById('browserPathInput').value;
      if (path) loadDirectory(path);
    }

    function closeBrowser() {
      document.getElementById('folderBrowserModal').classList.add('hidden');
    }

    // C盘检测辅助函数
    function isCDrivePath(path) {
      if (!path) return false;
      const normalized = path.trim().toUpperCase();
      // 检测 C: 或 C:\\ 开头的路径
      return normalized.startsWith('C:') || normalized.startsWith('C\\\\');
    }

    // 待确认的 C 盘路径
    let pendingCDrivePath = null;
    let pendingCDriveIsTrustedDir = false;

    // 显示 C 盘确认弹框
    function showCDriveConfirmModal() {
      document.getElementById('cDriveConfirmModal').classList.remove('hidden');
    }

    // 取消 C 盘选择
    function cancelCDriveSelection() {
      document.getElementById('cDriveConfirmModal').classList.add('hidden');
      pendingCDrivePath = null;
      pendingCDriveIsTrustedDir = false;
      // 文件浏览器保持打开，让用户重新选择
    }

    // 确认使用 C 盘
    function confirmCDriveSelection() {
      document.getElementById('cDriveConfirmModal').classList.add('hidden');
      
      if (pendingCDrivePath) {
        if (pendingCDriveIsTrustedDir) {
          if (!trustedDirs.includes(pendingCDrivePath)) {
            trustedDirs.push(pendingCDrivePath);
            renderTrustedDirs();
          }
        } else {
          document.getElementById('workspaceInput').value = pendingCDrivePath;
        }
        closeBrowser();
      }
      
      pendingCDrivePath = null;
      pendingCDriveIsTrustedDir = false;
    }

    async function confirmSelection() {
      if (browserSelectedPath) {
        try {
          const res = await fetch('/api/setup/validate-path', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: browserSelectedPath })
          });
          const data = await res.json();
          if (!data.ok || !data.data?.valid) {
            alert('路径验证失败: ' + (data.data?.error || data.error || '未知错误'));
            return;
          }
        } catch (e) {
          // 忽略验证错误，继续使用
        }
        
        // C盘检测：如果选择了 C 盘路径，弹出确认框
        if (isCDrivePath(browserSelectedPath)) {
          pendingCDrivePath = browserSelectedPath;
          pendingCDriveIsTrustedDir = browsingForTrustedDir;
          showCDriveConfirmModal();
          return;
        }
        
        if (browsingForTrustedDir) {
          if (!trustedDirs.includes(browserSelectedPath)) {
            trustedDirs.push(browserSelectedPath);
            renderTrustedDirs();
          }
        } else {
          document.getElementById('workspaceInput').value = browserSelectedPath;
        }
      }
      closeBrowser();
    }

    function renderTrustedDirs() {
      const container = document.getElementById('trustedDirsList');
      if (trustedDirs.length === 0) {
        container.innerHTML = '<div style="color: var(--text-muted); font-size: 0.9em; padding: 8px 0;">暂未添加额外信任目录</div>';
        return;
      }
      container.innerHTML = trustedDirs.map((dir, index) => 
        '<div class="dir-item">' +
          '<span class="dir-item-icon">📁</span>' +
          '<span class="dir-item-path">' + dir + '</span>' +
          '<button class="dir-item-remove" onclick="removeTrustedDir(' + index + ')">移除</button>' +
        '</div>'
      ).join('');
    }

    function removeTrustedDir(index) {
      trustedDirs.splice(index, 1);
      renderTrustedDirs();
    }

    // ==================== Step 4: 对话方式选择 ====================
    let currentChannelMode = 'web'; // 'web' 或 'im'
    let currentChannelTab = 'dingtalk';

    function selectChannelMode(mode) {
      currentChannelMode = mode;
      
      // 更新卡片选中状态
      document.querySelectorAll('.channel-mode-card').forEach(el => {
        el.classList.toggle('selected', el.dataset.mode === mode);
      });
      
      // 显示/隐藏相应内容
      const webInfo = document.getElementById('webModeInfo');
      const imConfig = document.getElementById('imConfigSection');
      
      if (mode === 'web') {
        webInfo.classList.remove('hidden');
        imConfig.classList.add('hidden');
      } else {
        webInfo.classList.add('hidden');
        imConfig.classList.remove('hidden');
      }
    }

    function selectChannelTab(channelId) {
      currentChannelTab = channelId;
      
      // 更新 tab 选中状态
      document.querySelectorAll('.channel-tab').forEach(el => {
        el.classList.toggle('selected', el.dataset.channel === channelId);
      });
      
      // 显示对应的配置表单
      document.getElementById('dingtalkConfigForm').classList.toggle('hidden', channelId !== 'dingtalk');
      document.getElementById('feishuConfigForm').classList.toggle('hidden', channelId !== 'feishu');
      document.getElementById('wecomConfigForm').classList.toggle('hidden', channelId !== 'wecom');
    }

    // 配置指南切换 - 支持左右分栏模式
    function toggleGuide(formId, guideId) {
      const form = document.getElementById(formId);
      const guide = document.getElementById(guideId);
      const isHidden = guide.classList.contains('hidden');
      
      if (isHidden) {
        // 展开指南 - 启用分栏模式
        guide.classList.remove('hidden');
        form.classList.add('split-mode');
        // 平滑滚动到表单区域
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        // 收起指南 - 关闭分栏模式
        guide.classList.add('hidden');
        form.classList.remove('split-mode');
      }
    }
    
    function toggleDingtalkGuide() {
      toggleGuide('dingtalkConfigForm', 'dingtalkGuide');
    }

    function toggleFeishuGuide() {
      toggleGuide('feishuConfigForm', 'feishuGuide');
    }

    function toggleWecomGuide() {
      toggleGuide('wecomConfigForm', 'wecomGuide');
    }

    function toggleWecomSecretVisibility() {
      const input = document.getElementById('wecomAgentSecret');
      const icon = document.getElementById('wecomSecretIcon');
      if (input.type === 'password') {
        input.type = 'text';
        icon.textContent = 'visibility_off';
      } else {
        input.type = 'password';
        icon.textContent = 'visibility';
      }
    }

    async function handleStep3Next() {
      if (currentChannelMode === 'web') {
        // 网页对话模式，直接进入下一步
        selectedChannels = ['web'];
        goToStep(4);
        return;
      }
      
      // IM模式，需要保存配置
      await saveChannelConfig();
    }

    function toggleDingtalkSecretVisibility() {
      const input = document.getElementById('dingtalkAppSecret');
      const icon = document.getElementById('dingtalkSecretIcon');
      if (input.type === 'password') {
        input.type = 'text';
        icon.textContent = 'visibility_off';
      } else {
        input.type = 'password';
        icon.textContent = 'visibility';
      }
    }

    function toggleFeishuSecretVisibility() {
      const input = document.getElementById('feishuAppSecret');
      const icon = document.getElementById('feishuSecretIcon');
      if (input.type === 'password') {
        input.type = 'text';
        icon.textContent = 'visibility_off';
      } else {
        input.type = 'password';
        icon.textContent = 'visibility';
      }
    }

    async function saveChannelConfig() {
      const btn = document.getElementById('step3NextBtn');
      let hasConfig = false;
      let configData = {};

      // 收集钉钉配置
      const dingtalkAppKey = document.getElementById('dingtalkAppKey').value.trim();
      const dingtalkAppSecret = document.getElementById('dingtalkAppSecret').value.trim();
      if (dingtalkAppKey && dingtalkAppSecret) {
        hasConfig = true;
        selectedChannels.push('dingtalk');
        configData.dingtalk = {
          appKey: dingtalkAppKey,
          appSecret: dingtalkAppSecret,
          robotToken: document.getElementById('dingtalkRobotToken').value.trim() || undefined
        };
      }

      // 收集飞书配置
      const feishuAppId = document.getElementById('feishuAppId').value.trim();
      const feishuAppSecret = document.getElementById('feishuAppSecret').value.trim();
      if (feishuAppId && feishuAppSecret) {
        hasConfig = true;
        if (!selectedChannels.includes('feishu')) selectedChannels.push('feishu');
        configData.feishu = {
          appId: feishuAppId,
          appSecret: feishuAppSecret,
          encryptKey: document.getElementById('feishuEncryptKey').value.trim() || undefined,
          verificationToken: document.getElementById('feishuVerificationToken').value.trim() || undefined
        };
      }

      // 收集企业微信配置
      const wecomCorpId = document.getElementById('wecomCorpId').value.trim();
      const wecomAgentId = document.getElementById('wecomAgentId').value.trim();
      const wecomAgentSecret = document.getElementById('wecomAgentSecret').value.trim();
      const wecomToken = document.getElementById('wecomToken').value.trim();
      const wecomEncodingAESKey = document.getElementById('wecomEncodingAESKey').value.trim();
      if (wecomCorpId && wecomAgentId && wecomAgentSecret && wecomToken && wecomEncodingAESKey) {
        hasConfig = true;
        if (!selectedChannels.includes('wecom')) selectedChannels.push('wecom');
        configData.wecom = {
          corpId: wecomCorpId,
          agentId: parseInt(wecomAgentId, 10),
          agentSecret: wecomAgentSecret,
          token: wecomToken,
          encodingAESKey: wecomEncodingAESKey
        };
      }

      if (!hasConfig) {
        // 没有配置任何渠道，切换到网页对话模式
        const confirmSkip = confirm('您还没有配置任何IM渠道。\\n\\n是否使用网页对话模式？（推荐）\\n\\n点击「确定」使用网页对话，点击「取消」继续配置。');
        if (confirmSkip) {
          selectedChannels = ['web'];
          goToStep(4);
        }
        return;
      }

      btn.disabled = true;
      btn.innerHTML = '<span class="status-spinner"></span> 验证凭证中...';

      // 确定当前显示的状态区域
      let statusEl = 'dingtalkConfigStatus';
      if (configData.feishu && !configData.dingtalk) statusEl = 'feishuConfigStatus';
      if (configData.wecom && !configData.dingtalk && !configData.feishu) statusEl = 'wecomConfigStatus';

      try {
        // 显示验证中状态
        if (configData.dingtalk) {
          showStatus('dingtalkConfigStatus', '正在验证钉钉凭证...', 'loading');
        }
        if (configData.feishu) {
          showStatus('feishuConfigStatus', '正在验证飞书凭证...', 'loading');
        }
        if (configData.wecom) {
          showStatus('wecomConfigStatus', '正在验证企业微信凭证...', 'loading');
        }

        // 保存渠道配置（后端会自动验证）
        const res = await fetch('/api/setup/configure-channels', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(configData)
        });
        const data = await res.json();

        if (!data.ok) {
          // 验证失败
          const errorMsg = data.error || '保存失败';
          if (errorMsg.includes('钉钉')) {
            showStatus('dingtalkConfigStatus', '❌ ' + errorMsg, 'error');
          } else if (errorMsg.includes('飞书')) {
            showStatus('feishuConfigStatus', '❌ ' + errorMsg, 'error');
          } else if (errorMsg.includes('企业微信')) {
            showStatus('wecomConfigStatus', '❌ ' + errorMsg, 'error');
          } else {
            showStatus(statusEl, '❌ ' + errorMsg, 'error');
          }
          btn.disabled = false;
          btn.innerHTML = '下一步 <span class="material-icons">arrow_forward</span>';
          return;
        }

        // 显示成功状态
        if (configData.dingtalk) {
          showStatus('dingtalkConfigStatus', '✓ 钉钉凭证验证成功', 'success');
        }
        if (configData.feishu) {
          showStatus('feishuConfigStatus', '✓ 飞书凭证验证成功', 'success');
        }
        if (configData.wecom) {
          showStatus('wecomConfigStatus', '✓ 企业微信凭证验证成功', 'success');
        }
        
        await delay(800);
        goToStep(4);
      } catch (e) {
        showStatus(statusEl, '保存失败: ' + e.message, 'error');
        btn.disabled = false;
        btn.innerHTML = '下一步 <span class="material-icons">arrow_forward</span>';
      }
    }

    function skipChannels() {
      selectedChannels = [];
      goToStep(4);
    }

    // ==================== 豆包教程弹窗 ====================

    // 打开豆包教程弹窗
    function openDoubaoTutorial() {
      document.getElementById('doubaoTutorialModal').classList.remove('hidden');
    }

    // 关闭豆包教程弹窗
    function closeDoubaoTutorial() {
      document.getElementById('doubaoTutorialModal').classList.add('hidden');
    }

    // ==================== 法律协议弹窗 ====================
    function showLegalModal(type) {
      const overlay = document.getElementById('legalModalOverlay');
      const title = document.getElementById('legalModalTitle');
      const body = document.getElementById('legalModalBody');

      const contents = {
        userAgreement: {
          title: '用户服务协议',
          content: \`
            <h4>第一条 总则</h4>
            <p>欢迎使用本软件。本软件基于开源项目二次开发，以社区方式维护。使用本软件即表示您已阅读、理解并同意本协议全部条款。</p>
            <h4>第二条 软件性质</h4>
            <p>本软件为通用 AI 交互工具，提供与第三方大语言模型交互的技术通道。</p>
            <ul>
              <li>本软件不直接提供任何 AI 模型服务</li>
              <li>所有 AI 内容由您所选择的第三方服务提供商生成</li>
              <li>本软件不对 AI 生成内容的准确性、合法性承担任何责任</li>
              <li>技能市场中的技能由第三方开发者独立提供，与本软件无关</li>
            </ul>
            <h4>第三条 用户义务</h4>
            <ul>
              <li>遵守用户所在地区的相关法律法规</li>
              <li>不利用本软件从事任何违法活动</li>
              <li>未经目标方授权，不得使用本软件进行自动化数据抓取或爬虫操作</li>
              <li>用户对自己的全部使用行为独立承担法律责任</li>
            </ul>
            <h4>第四条 免责声明</h4>
            <p>AI 内容可能不准确、有偏见或不当，用户应自行核验。本软件不承担因使用 AI 输出、第三方技能或用户自身行为导致的任何损失。</p>
            <h4>第五条 责任限制</h4>
            <p>在适用法律允许的最大范围内，本软件不承担任何间接、附带或后果性损害赔偿责任。如软件免费使用，则赔偿上限为零元。</p>
            <h4>第六条 争议解决</h4>
            <p>本软件以社区方式维护，不设集中运营主体。因使用本软件产生的任何争议，由用户依据其所在地适用法律自行解决。</p>
          \`,
        },
        privacyPolicy: {
          title: '隐私政策',
          content: \`
            <h4>一、信息收集</h4>
            <p>本软件仅收集以下必要信息：</p>
            <ul>
              <li>本地设备与运行环境信息（用于本地故障诊断）</li>
              <li>匿名化软件使用统计（用于产品改进）</li>
              <li>协议同意时间戳（用于合规存证）</li>
            </ul>
            <p><strong>本软件不收集</strong>您的真实姓名、身份证号、银行卡等敏感信息，不存储您的对话记录（仅保存在本地）。</p>
            <h4>二、数据传输</h4>
            <p>您的对话内容将传输至您所选择的第三方 AI 服务提供商处理，这是服务运行的技术必要条件。<strong>选择境外 AI 服务即意味着您的数据将传输至境外服务器，请自行评估合规风险。</strong></p>
            <h4>三、数据采集类技能</h4>
            <p>用户通过本软件集成的数据采集类技能所采集的任何第三方数据，完全由用户本地设备处理和存储。<strong>本软件的服务器不接收、不处理、不存储</strong>用户采集的任何第三方数据。</p>
            <h4>四、信息共享</h4>
            <p>除法律法规强制要求外，本软件不会将您的个人信息出售或共享给任何第三方。</p>
            <h4>五、用户权利</h4>
            <p>您有权通过软件内反馈渠道申请查询、更正或删除您的个人信息。本软件将在条件允许的情况下予以响应。</p>
          \`,
        },
        riskDisclosure: {
          title: '⚠️ AI 服务风险告知',
          content: \`
            <h4>请仔细阅读以下风险说明</h4>
            <p><strong>1. 内容准确性风险</strong></p>
            <p>AI 模型可能生成不准确、虚假或误导性的信息。请勿将 AI 输出作为唯一的决策依据。</p>
            <p><strong>2. 不适用于重要决策</strong></p>
            <p>请勿将 AI 输出用于医疗诊断、法律咨询、财务投资等重要决策。这些领域应咨询专业人士。</p>
            <p><strong>3. 数据传输风险</strong></p>
            <p>您的输入内容将传输至第三方 AI 服务商进行处理。请勿输入敏感的个人信息、商业机密或其他隐私数据。</p>
            <p><strong>4. 安全攻击风险</strong></p>
            <p>AI 模型可能受到"提示词注入"等攻击，产生非预期输出。特别是在"放开模式"下，此风险更高。</p>
            <p><strong>5. 安全模式说明</strong></p>
            <ul>
              <li>🛡️ <strong>绝对安全模式</strong>：AI 无法操作您的电脑，仅限对话</li>
              <li>⚡ <strong>智能模式</strong>：AI 可在沙盒内有限操作，推荐使用</li>
              <li>⚠️ <strong>放开模式</strong>：安全限制最低，风险自担</li>
            </ul>
            <p style="margin-top: 20px; padding: 12px; background: rgba(239, 68, 68, 0.1); border-radius: 8px; color: var(--accent-red);">
              <strong>重要提示：</strong>使用本软件即表示您已了解并接受上述风险。
            </p>
          \`,
        },
        cnCompliance: {
          title: '⚠️ 中国法律合规告知（重要）',
          content: \`
            <p style="color: #f59e0b; font-weight: 600; margin-bottom: 16px;">请务必在使用前了解以下法律风险，违反可能导致法律责任：</p>
            <h4>1. 数据跨境传输</h4>
            <p>您输入的内容将发送至境外 AI 服务商（如 Anthropic、OpenAI 等）。根据《数据安全法》《个人信息保护法》，向境外提供重要数据或个人信息须满足合规要求。<strong>请勿输入涉及国家秘密、政府敏感信息、关键基础设施数据或大量个人信息。</strong></p>
            <h4>2. AI 生成内容合规</h4>
            <p>根据《互联网信息服务深度合成管理规定》《生成式人工智能服务管理暂行办法》，AI 生成内容不得违反法律法规，不得含有违法有害信息。用户须对发布的 AI 生成内容承担相应法律责任。</p>
            <h4>3. 网络安全义务</h4>
            <p>根据《网络安全法》，利用 AI 工具实施网络攻击、入侵他人系统、传播恶意代码等行为属于违法行为。本软件提供代码执行能力，用户须确保所有操作合法合规。</p>
            <h4>4. 知识产权风险</h4>
            <p>AI 生成的代码、文本可能与现有受著作权保护的作品相似。用户在商业使用前应自行进行知识产权核查，本项目不对侵权风险承担责任。</p>
            <h4>5. 企业/机构用户额外义务</h4>
            <p>企业用户在使用本工具处理业务数据时，应确保符合所在行业监管要求（金融、医疗、教育等行业有专项规定），并建立相应的 AI 使用管理制度。</p>
            <p style="margin-top: 16px; padding: 12px; background: var(--bg-primary); border-left: 3px solid #f59e0b; border-radius: 0 8px 8px 0;">
              <strong>免责声明：</strong>本项目为开源社区工具，不提供法律合规服务。上述内容仅供参考，不构成法律建议。如您在特定业务场景中使用，建议咨询专业法律人士。
            </p>
          \`,
        },
      };

      const content = contents[type];
      if (content) {
        title.textContent = content.title;
        body.innerHTML = content.content;
        overlay.classList.remove('hidden');
      }
    }

    function closeLegalModal() {
      document.getElementById('legalModalOverlay').classList.add('hidden');
    }

    // 测试 AI 连接
    async function testAIConnection() {
      const btn = document.getElementById('testConnectionBtn');
      const statusEl = document.getElementById('testConnectionStatus');
      
      btn.disabled = true;
      btn.innerHTML = '<span class="status-spinner"></span> 测试中...';
      showStatus('testConnectionStatus', '正在测试 AI 连接...', 'loading');
      
      try {
        // 调用健康检查 API
        const res = await fetch('/api/health', {
          method: 'GET',
          signal: AbortSignal.timeout(30000) // 30秒超时
        });
        const data = await res.json();
        
        if (data.ok && data.data?.aiReady) {
          // AI 连接成功
          statusEl.innerHTML = '<div class="test-connection-result success">' +
            '<div class="result-icon">✅</div>' +
            '<div class="result-message">AI 连接成功！</div>' +
            '<div class="result-detail">AI 服务已就绪，可以开始使用了</div>' +
            '</div>';
          statusEl.className = 'status-message';
        } else if (data.ok) {
          // 部分成功
          statusEl.innerHTML = '<div class="test-connection-result success">' +
            '<div class="result-icon">⚠️</div>' +
            '<div class="result-message">服务已启动</div>' +
            '<div class="result-detail">Gateway 正常运行，AI 服务状态待验证</div>' +
            '</div>';
          statusEl.className = 'status-message';
        } else {
          throw new Error(data.error || '连接失败');
        }
      } catch (e) {
        // 尝试发送一条简单的测试消息
        try {
          const testRes = await fetch('/api/chat/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: '你好，请回复 OK' }),
            signal: AbortSignal.timeout(30000)
          });
          const testData = await testRes.json();
          
          if (testData.ok) {
            statusEl.innerHTML = '<div class="test-connection-result success">' +
              '<div class="result-icon">✅</div>' +
              '<div class="result-message">AI 连接成功！</div>' +
              '<div class="result-detail">AI 响应正常</div>' +
              '</div>';
            statusEl.className = 'status-message';
          } else {
            throw new Error(testData.error || '测试失败');
          }
        } catch (testErr) {
          // 显示错误
          const errorMsg = e.message || testErr.message || '未知错误';
          statusEl.innerHTML = '<div class="test-connection-result error">' +
            '<div class="result-icon">❌</div>' +
            '<div class="result-message">连接失败</div>' +
            '<div class="result-detail">' + errorMsg + '</div>' +
            '<div style="margin-top: 12px; font-size: 0.85em; color: var(--text-muted);">' +
            '可能原因：API Key 无效、网络问题、服务未启动<br>' +
            '建议：检查配置后重试，或直接开始使用' +
            '</div>' +
            '</div>';
          statusEl.className = 'status-message';
        }
      }
      
      btn.disabled = false;
      btn.innerHTML = '<span class="material-icons">science</span> 重新测试';
    }

    // ==================== 工具函数 ====================
    function showStatus(elementId, message, type) {
      const el = document.getElementById(elementId);
      if (!el) return;
      el.className = 'status-message show ' + type;
      if (type === 'loading') {
        el.innerHTML = '<span class="status-spinner"></span> ' + message;
      } else {
        el.textContent = message;
      }
    }

    function delay(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ==================== 跳过配置直接进入 ====================
    function skipToChat() {
      var token = window.__GATEWAY_TOKEN__ || new URLSearchParams(window.location.search).get('token') || '';
      var port = window.location.port || '19002';
      var gwUrl = 'ws://127.0.0.1:' + port;
      var hash = '#token=' + encodeURIComponent(token) + '&gatewayUrl=' + encodeURIComponent(gwUrl);
      // 始终跳到 gateway HTTP 地址（当前 origin），不跳 tauri.localhost（见 buildRedirectUrl 注释）
      window.location.href = window.location.origin + '/' + hash;
    }

    // ==================== 初始化 ====================
    window.trustModeConfirmed = false;
    renderTrustedDirs();
    
    // 检测是否有历史配置
    (function() {
      const urlParams = new URLSearchParams(window.location.search);
      const hasHistory = urlParams.get('hasHistory') === '1';
      const page0 = document.getElementById('page0');

      if (hasHistory) {
        // 显示欢迎回来页面
        if (page0) page0.classList.remove('hidden');
      } else {
        // 正常显示 Step 1（法律同意）
        goToStep(1);
      }

      // 开源版不再提供云端校验入口。
    })();

    // ── Tauri WebView2 外部链接修复 ──────────────────────────────────
    // WebView2 在 http://127.0.0.1 origin 下，target="_blank" 和 window.open
    // 都无法触发 Tauri 的 on_new_window 回调。改为通过 gateway API 在服务端打开。
    document.addEventListener('click', function(e) {
      var link = e.target.closest('a[href]');
      if (!link) return;
      var href = link.getAttribute('href');
      if (!href) return;
      try {
        var u = new URL(href, window.location.origin);
        if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') return;
        if (u.protocol === 'http:' || u.protocol === 'https:') {
          e.preventDefault();
          e.stopPropagation();
          fetch('/api/setup/open-url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: href })
          }).catch(function(){});
        }
      } catch(_) {}
    }, true);

    // Restore step on page load if hash indicates a step > 1.
    if (currentStep > 1 && currentStep <= TOTAL_STEPS) {
      goToStep(currentStep);
    }

    // Initialize default provider selection (kimi-coding is pre-selected in HTML).
    // This syncs JS state (selectedProvider, apiKeyForm visibility, model select)
    // with the pre-selected card. Step 2 is the AI service selection page.
    if (currentStep === 2) {
      const preSelected = document.querySelector('.provider-card.selected');
      if (preSelected && preSelected.dataset.provider) {
        selectProvider(preSelected.dataset.provider);
      }
    }

  </script>
`;
}

// ====== Main Page Generator ======

/** ProviderMeta → setup JS 形状的适配函数 */
function adaptProvidersForSetup(providerMetas: ProviderMeta[]): ProviderForSetup[] {
  return providerMetas.map((p) => ({
    id: p.providerId,
    name: p.name,
    models: p.models,
  }));
}

/**
 * 生成 Setup 页面 HTML
 * @param gatewayToken - 当前 gateway token
 */
export function generateSetupPageHtml(gatewayToken?: string): string {
  // 读取 OEM 配置（_dist/oem.json，OEM 构建时写入，标准包不存在）— 必须最先读取
  let oemDisplayName = "";
  let oemId = "";
  try {
    // 多路径搜索 oem.json（兼容 jiti / esbuild / dev / Tauri sidecar 模式）
    const selfDir = import.meta.dirname;
    const oemCandidates = [
      path.join(process.cwd(), "oem.json"),                        // Tauri sidecar CWD = _dist/（最可靠）
      path.join(process.cwd(), "_dist", "oem.json"),               // dev 模式下 CWD = 项目根
      path.resolve(selfDir, "..", "..", "..", "oem.json"),          // _dist/extensions/cn-adapter/setup → _dist/
      path.resolve(selfDir, "..", "..", "oem.json"),                // extensions/cn-adapter/setup → extensions/../
      path.resolve(selfDir, "..", "..", "..", "..", "oem.json"),    // 深层编译缓存 fallback
    ];
    let oemJsonPath = "";
    for (const c of oemCandidates) {
      if (fs.existsSync(c)) { oemJsonPath = c; break; }
    }
    if (!oemJsonPath) throw new Error("oem.json not found");
    const oemData = JSON.parse(fs.readFileSync(oemJsonPath, "utf-8"));
    oemDisplayName = oemData.displayName || "";
    oemId = oemData.oemId || "";
  } catch {
    // 标准包无 oem.json，忽略
  }
  const brandName = oemDisplayName || (isOverseas ? "AI Assistant" : "66Claw");

  const providers = adaptProvidersForSetup(PROVIDERS);
  const platformInfo = detectPlatformInfo();
  const defaultWorkspace = getDefaultWorkspace();
  const logoBase64 = getLogoBase64(oemId);
  const setupQrcodeBase64 = getSetupQrcodeBase64();
  const oemPurchaseQrcodeBase64 = isOverseas ? getOemQrcodeBase64("oem-purchase-qrcode.png") : "";
  const oemSupportQrcodeBase64 = isOverseas ? getOemQrcodeBase64("oem-support-qrcode.png") : "";
  const safeToken = gatewayToken ? JSON.stringify(gatewayToken).replace(/<\//g, "<\/") : "null";
  const isDesktopMode =
    process.env.OPENCLAW_DESKTOP_MODE === "1" || process.env.OPENCLAWCN_DESKTOP_MODE === "1";
  const tokenScript = `<script>window.__GATEWAY_TOKEN__ = ${safeToken};window.__DESKTOP_MODE__ = ${isDesktopMode ? "true" : "false"};</script>`;

  const ctx: SetupPageContext = {
    logoBase64,
    setupQrcodeBase64,
    oemPurchaseQrcodeBase64,
    oemSupportQrcodeBase64,
    platformInfo,
    defaultWorkspace,
    providers,
    brandName,
  };

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${brandName} 安装向导</title>
  ${tokenScript}
  <style>
    :root {
      --bg-primary: #0f0f11;
      --bg-secondary: #18181b;
      --bg-tertiary: #1f1f23;
      --bg-elevated: #27272a;
      --bg-hover: #2d2d32;
      --border-default: rgba(255, 255, 255, 0.08);
      --border-subtle: rgba(255, 255, 255, 0.05);
      --border-accent: rgba(60, 131, 246, 0.4);
      --text-primary: #fafafa;
      --text-secondary: #a1a1aa;
      --text-muted: #71717a;
      --accent-blue: #3c83f6;
      --accent-blue-light: #60a5fa;
      --accent-blue-dark: #2563eb;
      --accent-green: #22c55e;
      --accent-green-light: #4ade80;
      --accent-yellow: #eab308;
      --accent-orange: #f97316;
      --accent-red: #ef4444;
      --gradient-blue: linear-gradient(135deg, #3c83f6 0%, #60a5fa 100%);
      --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
      --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.4);
      --shadow-lg: 0 10px 25px rgba(0, 0, 0, 0.5);
      --shadow-glow: 0 0 20px rgba(60, 131, 246, 0.3);
      --radius-sm: 6px;
      --radius-md: 8px;
      --radius-lg: 12px;
      --radius-xl: 16px;
      --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      --font-mono: 'JetBrains Mono', 'SF Mono', 'Consolas', monospace;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    .material-icons {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 1em;
      height: 1em;
      line-height: 1;
      overflow: hidden;
      color: transparent;
      vertical-align: -0.15em;
      flex: 0 0 auto;
    }
    .material-icons.mi-ready {
      color: currentColor;
    }
    .material-icons svg {
      width: 1em;
      height: 1em;
      display: block;
      fill: none;
      stroke: currentColor;
      stroke-width: 2.25;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .material-icons svg.mi-fill {
      fill: currentColor;
      stroke: none;
    }

    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes slideInRight { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes checkmark { 0% { stroke-dashoffset: 100; } 100% { stroke-dashoffset: 0; } }
    @keyframes scaleIn { from { transform: scale(0.8); opacity: 0; } to { transform: scale(1); opacity: 1; } }
    @keyframes confetti {
      0% { transform: translateY(0) rotate(0deg); opacity: 1; }
      100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
    }
    @keyframes bounce {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-10px); }
    }
    @keyframes shimmer {
      0% { background-position: -200% center; }
      100% { background-position: 200% center; }
    }

    body {
      font-family: var(--font-sans);
      background: var(--bg-primary);
      color: var(--text-primary);
      min-height: 100vh;
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
      overflow-x: hidden;
    }

    /* 顶部导航栏 */
    .header {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: 64px;
      background: rgba(15, 15, 17, 0.8);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--border-default);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 32px;
      z-index: 100;
    }
    .header-logo {
      display: flex;
      align-items: center;
      gap: 12px;
      font-weight: 600;
      font-size: 1.1em;
    }
    .header-logo svg,
    .header-logo img {
      width: 32px;
      height: 32px;
      border-radius: 6px;
      object-fit: cover;
    }


    /* 主容器 */
    .main-container {
      max-width: 1100px;
      margin: 0 auto;
      padding: 100px 24px 60px;
      animation: fadeIn 0.4s ease-out;
    }

    /* 步骤进度条 */
    .stepper {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0;
      margin-bottom: 48px;
      padding: 0 20px;
    }
    .step-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      position: relative;
    }
    .step-circle {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: var(--bg-tertiary);
      border: 2px solid var(--border-default);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      font-size: 0.9em;
      color: var(--text-muted);
      transition: all 0.3s ease;
      position: relative;
      z-index: 2;
    }
    .step-circle .material-icons { font-size: 18px; }
    .step-item.active .step-circle {
      background: var(--accent-blue);
      border-color: var(--accent-blue);
      color: white;
      box-shadow: var(--shadow-glow);
    }
    .step-item.completed .step-circle {
      background: var(--accent-green);
      border-color: var(--accent-green);
      color: white;
    }
    .step-label {
      margin-top: 8px;
      font-size: 0.75em;
      color: var(--text-muted);
      text-align: center;
      max-width: 80px;
    }
    .step-item.active .step-label { color: var(--accent-blue); font-weight: 500; }
    .step-item.completed .step-label { color: var(--accent-green); }
    .step-connector {
      width: 60px;
      height: 2px;
      background: var(--border-default);
      margin: 0 8px;
      margin-bottom: 28px;
      position: relative;
    }
    .step-connector::after {
      content: '';
      position: absolute;
      left: 0;
      top: 0;
      height: 100%;
      width: 0;
      background: var(--accent-green);
      transition: width 0.4s ease;
    }
    .step-connector.completed::after { width: 100%; }

    /* 卡片容器 */
    .card {
      background: var(--bg-secondary);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-xl);
      padding: 32px;
      margin-bottom: 24px;
      animation: fadeInUp 0.4s ease-out;
      position: relative;
    }
    .card-header {
      margin-bottom: 24px;
    }
    .card-header h2 {
      font-size: 1.5em;
      font-weight: 600;
      margin-bottom: 8px;
      color: var(--text-primary);
    }
    .card-header p {
      color: var(--text-secondary);
      font-size: 0.95em;
    }

    /* 右上角悬浮二维码卡片 */
    .qr-corner {
      position: absolute;
      top: 20px;
      right: 20px;
      z-index: 10;
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 14px 16px;
      border-radius: 14px;
      border: 1.5px solid rgba(255, 185, 15, 0.30);
      background: linear-gradient(135deg, rgba(255, 185, 15, 0.10) 0%, rgba(218, 165, 32, 0.04) 100%);
      backdrop-filter: blur(12px);
      cursor: pointer;
      transition: border-color 0.3s, box-shadow 0.3s, transform 0.3s;
      animation: qrBreathe 3s ease-in-out infinite;
    }
    .qr-corner:hover {
      border-color: rgba(255, 185, 15, 0.70);
      box-shadow: 0 4px 30px rgba(255, 185, 15, 0.20), 0 0 40px rgba(255, 185, 15, 0.08);
      transform: translateY(-2px);
      animation: none;
    }
    @keyframes qrBreathe {
      0%, 100% {
        border-color: rgba(255, 185, 15, 0.25);
        box-shadow: 0 2px 12px rgba(255, 185, 15, 0.06);
      }
      50% {
        border-color: rgba(255, 185, 15, 0.55);
        box-shadow: 0 4px 20px rgba(255, 185, 15, 0.15), 0 0 24px rgba(255, 185, 15, 0.06);
      }
    }
    .qr-corner-info {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .qr-corner-title {
      font-size: 0.88em;
      font-weight: 700;
      color: #F5A623;
      white-space: nowrap;
    }
    .qr-corner-tags {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .qr-corner-tag {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 0.72em;
      color: var(--text-secondary);
      white-space: nowrap;
    }
    .qr-corner-tag .material-icons {
      font-size: 14px;
      color: #F5A623;
    }
    .qr-corner-scan {
      font-size: 0.68em;
      color: var(--text-muted);
      margin-top: 2px;
    }
    .qr-corner-img {
      width: 120px;
      height: 120px;
      border-radius: 10px;
      overflow: hidden;
      background: transparent;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      border: 2px solid rgba(255, 185, 15, 0.40);
      animation: qrImgGlow 3s ease-in-out infinite;
    }
    @keyframes qrImgGlow {
      0%, 100% {
        box-shadow: 0 0 8px rgba(255, 185, 15, 0.10), 0 0 0 rgba(255, 185, 15, 0);
        border-color: rgba(255, 185, 15, 0.35);
      }
      50% {
        box-shadow: 0 0 20px rgba(255, 185, 15, 0.25), 0 0 40px rgba(255, 185, 15, 0.08);
        border-color: rgba(255, 185, 15, 0.70);
      }
    }
    .qr-corner-img img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: center;
      display: block;
      transform: scale(1.30);
    }
    @media (max-width: 700px) {
      .qr-corner { position: static; margin-bottom: 12px; padding: 10px 12px; }
      .qr-corner-img { width: 56px; height: 56px; }
      .qr-corner-title { font-size: 0.8em; }
      .qr-corner-tags { display: none; }
    }

    /* 提示框 */
    .alert {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 16px;
      border-radius: var(--radius-md);
      margin-bottom: 20px;
      font-size: 0.9em;
    }
    .alert-icon { font-size: 1.2em; flex-shrink: 0; margin-top: 2px; }
    .alert-info {
      background: rgba(60, 131, 246, 0.1);
      border: 1px solid rgba(60, 131, 246, 0.2);
      color: var(--accent-blue-light);
    }
    .alert-warning {
      background: rgba(249, 115, 22, 0.1);
      border: 1px solid rgba(249, 115, 22, 0.2);
      color: var(--accent-orange);
    }
    .alert-success {
      background: rgba(34, 197, 94, 0.1);
      border: 1px solid rgba(34, 197, 94, 0.2);
      color: var(--accent-green);
    }
    .alert-error {
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.2);
      color: var(--accent-red);
    }
    .alert-content { flex: 1; }
    .alert-title { font-weight: 600; margin-bottom: 4px; }

    /* 折叠区域 */
    .collapsible {
      background: var(--bg-tertiary);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      margin-bottom: 20px;
      overflow: hidden;
    }
    .collapsible-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px;
      cursor: pointer;
      transition: background 0.2s ease;
    }
    .collapsible-header:hover { background: var(--bg-hover); }
    .collapsible-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 500;
    }
    .collapsible-arrow {
      transition: transform 0.2s ease;
    }
    .collapsible.open .collapsible-arrow { transform: rotate(180deg); }
    .collapsible-content {
      padding: 0 16px 16px;
      color: var(--text-secondary);
      font-size: 0.9em;
      line-height: 1.7;
    }
    .collapsible:not(.open) .collapsible-content { display: none; }

    /* 选项卡片列表 */
    .option-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .option-card {
      background: var(--bg-tertiary);
      border: 2px solid var(--border-default);
      border-radius: var(--radius-lg);
      padding: 20px;
      cursor: pointer;
      transition: all 0.2s ease;
      position: relative;
    }
    .option-card:hover {
      border-color: var(--border-accent);
      background: var(--bg-hover);
    }
    .option-card.selected {
      border-color: var(--accent-blue);
      background: rgba(60, 131, 246, 0.08);
    }
    .option-card.disabled {
      opacity: 0.5;
      cursor: not-allowed;
      pointer-events: none;
    }
    .option-card-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 8px;
    }
    .option-icon {
      width: 40px;
      height: 40px;
      border-radius: var(--radius-md);
      background: var(--bg-elevated);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.3em;
    }
    .option-card.selected .option-icon {
      background: var(--accent-blue);
    }
    .option-title {
      font-weight: 600;
      font-size: 1.05em;
    }
    .option-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: var(--accent-orange);
      color: white;
      padding: 2px 8px;
      border-radius: 20px;
      font-size: 0.7em;
      font-weight: 600;
      text-transform: uppercase;
      margin-left: 8px;
    }
    .option-badge.recommended {
      background: var(--accent-blue);
    }
    .option-badge.expert {
      background: var(--bg-elevated);
      color: var(--text-secondary);
    }
    .option-desc {
      color: var(--text-secondary);
      font-size: 0.9em;
      line-height: 1.6;
    }
    .option-meta {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 12px;
      font-size: 0.85em;
      color: var(--text-muted);
    }
    .option-check {
      position: absolute;
      top: 16px;
      right: 16px;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: var(--accent-blue);
      display: none;
      align-items: center;
      justify-content: center;
      color: white;
    }
    .option-card.selected .option-check { display: flex; }

    /* 网格布局的选项卡片 */
    .option-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 12px;
    }
    .option-grid .option-card {
      text-align: center;
      padding: 24px 16px;
    }
    .option-grid .option-icon {
      width: 48px;
      height: 48px;
      margin: 0 auto 12px;
      font-size: 1.5em;
    }
    .option-grid .option-title {
      margin-bottom: 4px;
    }
    .option-grid .option-desc {
      font-size: 0.85em;
    }

    /* ============================================
       Step 1 AI服务选择 - 优化版样式
       ============================================ */
    
    /* 小提示 */
    .provider-tip {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 14px 20px;
      background: linear-gradient(135deg, rgba(60, 131, 246, 0.12) 0%, rgba(60, 131, 246, 0.04) 100%);
      border: 1px solid rgba(60, 131, 246, 0.25);
      border-radius: var(--radius-lg);
      margin-bottom: 24px;
      color: var(--accent-blue-light);
      font-size: 0.95em;
    }
    .provider-tip-icon {
      font-size: 1.3em;
    }

    /* 推荐服务商区域 */
    .provider-recommended-section {
      margin-bottom: 20px;
    }
    .provider-section-title {
      font-size: 0.9em;
      font-weight: 600;
      color: var(--text-secondary);
      margin-bottom: 16px;
      letter-spacing: 0.5px;
    }
    .provider-recommended-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
    }
    @media (max-width: 1100px) {
      .provider-recommended-grid {
        grid-template-columns: repeat(2, 1fr);
      }
    }
    @media (max-width: 600px) {
      .provider-recommended-grid {
        grid-template-columns: 1fr;
      }
    }

    /* 推荐服务商卡片 */
    .provider-card {
      background: var(--bg-tertiary);
      border: 2px solid var(--border-default);
      border-radius: var(--radius-xl);
      padding: 16px;
      cursor: pointer;
      transition: all 0.25s ease;
      position: relative;
      text-align: center;
      display: flex;
      flex-direction: column;
      min-height: 200px;
    }
    .provider-card-desc {
      flex: 1;
    }
    .provider-card:hover {
      border-color: var(--border-accent);
      background: var(--bg-hover);
      transform: translateY(-2px);
    }
    .provider-card.selected {
      border-color: var(--accent-blue);
      background: linear-gradient(135deg, rgba(60, 131, 246, 0.12) 0%, rgba(60, 131, 246, 0.04) 100%);
      box-shadow: 0 0 20px rgba(60, 131, 246, 0.15);
    }
    .provider-card.featured {
      border-color: var(--accent-blue);
    }
    .provider-card-badge {
      position: absolute;
      top: -10px;
      left: 50%;
      transform: translateX(-50%);
      background: linear-gradient(135deg, #3c83f6 0%, #60a5fa 100%);
      color: white;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 0.75em;
      font-weight: 600;
      white-space: nowrap;
    }
    .provider-card-icon {
      font-size: 2em;
      margin-bottom: 8px;
    }
    .provider-card-name {
      font-size: 1.05em;
      font-weight: 600;
      margin-bottom: 6px;
    }
    .provider-card-desc {
      font-size: 0.85em;
      color: var(--text-secondary);
      line-height: 1.5;
      margin-bottom: 12px;
    }
    .provider-card-link {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      width: 100%;
      font-size: 0.85em;
      font-weight: 600;
      color: #1a1a1a;
      text-decoration: none;
      padding: 10px 12px;
      background: linear-gradient(135deg, #FFD700 0%, #FFA500 50%, #FF8C00 100%);
      border-radius: var(--radius-md);
      transition: all 0.3s ease;
      box-shadow: 0 2px 8px rgba(255, 165, 0, 0.3);
      margin-top: 8px;
    }
    .provider-card-link:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(255, 165, 0, 0.5);
      background: linear-gradient(135deg, #FFE44D 0%, #FFB833 50%, #FFA000 100%);
    }
    .provider-card-link .material-icons {
      font-size: 1.1em;
    }
    .provider-card-check {
      position: absolute;
      top: 12px;
      right: 12px;
      opacity: 0;
      transition: all 0.2s ease;
    }
    .provider-card-check .material-icons {
      font-size: 24px;
      color: var(--accent-blue);
    }
    .provider-card.selected .provider-card-check {
      opacity: 1;
    }

    /* 其他服务商折叠区域 */
    .provider-other-section {
      margin-bottom: 24px;
    }
    .provider-other-toggle {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      background: var(--bg-tertiary);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      cursor: pointer;
      color: var(--text-secondary);
      font-size: 0.95em;
      transition: all 0.2s ease;
    }
    .provider-other-toggle:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }
    .provider-other-toggle .material-icons {
      transition: transform 0.2s ease;
    }
    .provider-other-toggle.open .material-icons {
      transform: rotate(180deg);
    }
    .provider-other-content {
      margin-top: 12px;
    }
    .provider-section-subtitle {
      font-size: 0.9em;
      font-weight: 600;
      color: var(--text-secondary);
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .provider-section-note {
      font-weight: 400;
      font-size: 0.85em;
      color: var(--text-muted);
    }
    .provider-other-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
    }
    @media (max-width: 600px) {
      .provider-other-grid {
        grid-template-columns: 1fr;
      }
    }
    .provider-option {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 16px;
      background: var(--bg-tertiary);
      border: 2px solid var(--border-default);
      border-radius: var(--radius-lg);
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .provider-option:hover {
      border-color: var(--border-accent);
      background: var(--bg-hover);
    }
    .provider-option.selected {
      border-color: var(--accent-blue);
      background: rgba(60, 131, 246, 0.08);
    }
    .provider-option-icon {
      font-size: 1.5em;
    }
    .provider-option-info {
      flex: 1;
    }
    .provider-option-name {
      font-weight: 600;
      font-size: 0.95em;
    }
    .provider-option-desc {
      font-size: 0.8em;
      color: var(--text-secondary);
      margin-top: 2px;
    }
    .provider-option-check {
      opacity: 0;
      transition: all 0.2s ease;
    }
    .provider-option-check .material-icons {
      font-size: 20px;
      color: var(--accent-blue);
    }
    .provider-option.selected .provider-option-check {
      opacity: 1;
    }
    .provider-option-link {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 0.75em;
      font-weight: 600;
      color: #1a1a1a;
      text-decoration: none;
      padding: 4px 10px;
      background: linear-gradient(135deg, #FFD700 0%, #FFA500 50%, #FF8C00 100%);
      border-radius: 6px;
      transition: all 0.2s ease;
      box-shadow: 0 1px 4px rgba(255, 165, 0, 0.25);
      margin-top: 4px;
      white-space: nowrap;
    }
    .provider-option-link:hover {
      transform: translateY(-1px);
      box-shadow: 0 3px 10px rgba(255, 165, 0, 0.4);
      background: linear-gradient(135deg, #FFE44D 0%, #FFB833 50%, #FFA000 100%);
    }
    .provider-option-link .material-icons {
      font-size: 14px;
    }

    /* API Key 输入区域优化 */
    .apikey-section {
      background: var(--bg-tertiary);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-lg);
      padding: 20px;
      margin-bottom: 16px;
    }
    .apikey-header {
      display: flex;
      align-items: center;
      gap: 10px;
      font-weight: 600;
      font-size: 1.05em;
      margin-bottom: 12px;
      color: var(--text-primary);
    }
    .apikey-header-icon {
      font-size: 1.2em;
    }
    .apikey-header-hint {
      font-size: 0.8em;
      font-weight: 400;
      color: var(--accent-orange);
      margin-left: auto;
    }
    .apikey-input-wrapper {
      display: flex;
      gap: 8px;
    }
    .apikey-input {
      flex: 1;
      padding: 12px 16px;
      background: var(--bg-secondary);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      color: var(--text-primary);
      font-family: var(--font-mono);
      font-size: 0.95em;
    }
    .apikey-input:focus {
      outline: none;
      border-color: var(--accent-blue);
    }
    .apikey-toggle-btn {
      padding: 12px;
      background: var(--bg-elevated);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      color: var(--text-secondary);
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .apikey-toggle-btn:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }
    
    /* 服务商常见问题提示 */
    .provider-faq-tip {
      margin-top: 16px;
      background: linear-gradient(135deg, #fff4e5 0%, #fffbf0 100%);
      border: 2px solid #ffb020;
      border-radius: var(--radius-lg);
      padding: 16px;
      animation: faqTipPulse 2s ease-in-out infinite;
    }
    @keyframes faqTipPulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(255, 176, 32, 0.4); }
      50% { box-shadow: 0 0 12px 4px rgba(255, 176, 32, 0.2); }
    }
    .provider-faq-tip-header {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 600;
      font-size: 1em;
      color: #d97706;
      margin-bottom: 12px;
    }
    .provider-faq-tip-header .material-icons {
      font-size: 1.4em;
      color: #f59e0b;
    }
    .provider-faq-tip-content {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .provider-faq-item {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      font-size: 0.92em;
      color: #92400e;
      line-height: 1.5;
    }
    .provider-faq-icon {
      flex-shrink: 0;
      font-size: 1em;
    }
    .provider-faq-item a {
      color: #2563eb;
      text-decoration: underline;
      font-weight: 500;
    }
    .provider-faq-item a:hover {
      color: #1d4ed8;
    }
    .provider-faq-item strong {
      color: #78350f;
    }
    /* 暗色模式适配 */
    @media (prefers-color-scheme: dark) {
      .provider-faq-tip {
        background: linear-gradient(135deg, #422006 0%, #292524 100%);
        border-color: #d97706;
      }
      .provider-faq-tip-header {
        color: #fbbf24;
      }
      .provider-faq-tip-header .material-icons {
        color: #fbbf24;
      }
      .provider-faq-item {
        color: #fcd34d;
      }
      .provider-faq-item strong {
        color: #fef3c7;
      }
      .provider-faq-item a {
        color: #93c5fd;
      }
      .provider-faq-item a:hover {
        color: #bfdbfe;
      }
    }

    /* 模型选择简化 */
    .model-section {
      margin-top: 16px;
    }
    .model-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
      font-weight: 500;
    }
    .model-hint {
      font-size: 0.85em;
      color: var(--text-muted);
      font-weight: 400;
    }
    /* Model Combobox 容器 */
    .model-combobox {
      position: relative;
      width: 100%;
    }
    .model-select {
      width: 100%;
      padding: 12px 16px;
      padding-right: 40px;
      background: var(--bg-secondary);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      color: var(--text-primary);
      font-size: 0.95em;
      cursor: text;
      box-sizing: border-box;
    }
    .model-select:focus {
      outline: none;
      border-color: var(--accent-blue);
    }
    .model-editable-tag {
      position: absolute;
      right: 40px;
      top: 50%;
      transform: translateY(-50%);
      font-size: 12px;
      color: var(--accent-blue);
      background: rgba(59, 130, 246, 0.1);
      padding: 2px 8px;
      border-radius: 4px;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.3s ease;
      white-space: nowrap;
    }
    .model-editable-tag.visible {
      opacity: 1;
    }
    .model-combobox.open .model-editable-tag {
      opacity: 0;
    }
    .model-combobox-arrow {
      position: absolute;
      right: 12px;
      top: 50%;
      transform: translateY(-50%);
      pointer-events: none;
      color: var(--text-muted);
      font-size: 20px;
      transition: transform 0.2s ease;
    }
    .model-combobox.open .model-combobox-arrow {
      transform: translateY(-50%) rotate(180deg);
    }
    /* 下拉列表 */
    .model-dropdown {
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      max-height: 280px;
      overflow-y: auto;
      background: var(--bg-secondary);
      border: 1px solid var(--accent-blue);
      border-top: none;
      border-radius: 0 0 var(--radius-md) var(--radius-md);
      z-index: 1000;
      display: none;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }
    .model-combobox.open .model-dropdown {
      display: block;
    }
    .model-combobox.open .model-select {
      border-radius: var(--radius-md) var(--radius-md) 0 0;
      border-color: var(--accent-blue);
    }
    .model-option {
      padding: 10px 16px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      border-bottom: 1px solid var(--border-default);
      transition: background 0.15s ease;
    }
    .model-option:last-child {
      border-bottom: none;
    }
    .model-option:hover,
    .model-option.highlighted {
      background: var(--bg-tertiary);
    }
    .model-option.selected {
      background: rgba(59, 130, 246, 0.1);
    }
    .model-option-name {
      font-weight: 500;
      color: var(--text-primary);
    }
    .model-option-desc {
      font-size: 0.85em;
      color: var(--text-muted);
      margin-left: 8px;
    }
    .model-option-badge {
      font-size: 0.75em;
      padding: 2px 8px;
      border-radius: 10px;
      background: linear-gradient(135deg, #f97316 0%, #fb923c 100%);
      color: white;
      font-weight: 500;
      white-space: nowrap;
    }
    .model-option-badge.free {
      background: linear-gradient(135deg, #22c55e 0%, #4ade80 100%);
    }
    .model-dropdown-empty {
      padding: 16px;
      text-align: center;
      color: var(--text-muted);
      font-size: 0.9em;
    }
    .model-dropdown-hint {
      padding: 8px 16px;
      font-size: 0.8em;
      color: var(--text-muted);
      background: var(--bg-tertiary);
      border-bottom: 1px solid var(--border-default);
    }
    /* 自定义模型选项样式 */
    .model-option-custom {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      background: linear-gradient(135deg, rgba(59, 130, 246, 0.08) 0%, rgba(59, 130, 246, 0.02) 100%);
      border-left: 3px solid var(--accent-blue);
      cursor: pointer;
      transition: background 0.15s ease;
    }
    .model-option-custom:hover,
    .model-option-custom.highlighted {
      background: linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(59, 130, 246, 0.05) 100%);
    }
    .model-option-custom-icon {
      font-size: 1.1em;
    }
    .model-option-custom-text {
      font-size: 0.9em;
      color: var(--text-secondary);
    }
    .model-option-custom-text strong {
      color: var(--accent-blue);
      font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', monospace;
    }
    .model-dropdown-divider {
      height: 1px;
      background: var(--border-default);
      margin: 0;
    }
    /* 模型输入提示 */
    .model-input-hint {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-top: 8px;
      padding: 8px 12px;
      font-size: 12px;
      color: var(--text-muted);
      background: rgba(59, 130, 246, 0.06);
      border-radius: var(--radius-sm);
      border-left: 3px solid var(--accent-blue);
    }
    .model-input-hint-icon {
      font-size: 14px;
    }
    .model-input-hint code {
      background: rgba(0, 0, 0, 0.15);
      padding: 1px 5px;
      border-radius: 3px;
      font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', monospace;
      font-size: 11px;
      color: var(--accent-blue);
    }
    .provider-grid .option-check {
      top: 12px;
      right: 12px;
      width: 20px;
      height: 20px;
    }

    /* 首选推荐高亮 */
    .option-card.featured {
      border: 2px solid var(--accent-orange);
      background: linear-gradient(135deg, rgba(249, 115, 22, 0.08) 0%, rgba(249, 115, 22, 0.02) 100%);
      position: relative;
    }
    .option-card.featured::before {
      content: '⭐ 首选推荐';
      position: absolute;
      top: -10px;
      left: 12px;
      background: linear-gradient(135deg, #f97316 0%, #fb923c 100%);
      color: white;
      padding: 2px 10px;
      border-radius: 10px;
      font-size: 0.7em;
      font-weight: 600;
      box-shadow: 0 2px 8px rgba(249, 115, 22, 0.4);
    }
    .option-card.featured:hover {
      border-color: var(--accent-orange);
      box-shadow: 0 0 20px rgba(249, 115, 22, 0.3);
    }
    .option-card.featured.selected {
      border-color: var(--accent-orange);
      background: rgba(249, 115, 22, 0.12);
    }

    /* 推荐徽章样式增强 */
    .option-badge.hot {
      background: linear-gradient(135deg, #f97316 0%, #fb923c 100%);
      animation: pulse 2s ease-in-out infinite;
    }
    .option-badge.free {
      background: linear-gradient(135deg, #22c55e 0%, #4ade80 100%);
    }

    /* 推广链接区域增强 */
    .affiliate-section {
      margin-top: 28px;
      padding-top: 24px;
      border-top: 1px solid var(--border-default);
    }
    .affiliate-header {
      font-size: 1.1em;
      font-weight: 600;
      color: var(--accent-orange);
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .affiliate-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 12px;
    }
    .affiliate-card {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 16px;
      background: var(--bg-tertiary);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      text-decoration: none;
      color: var(--text-primary);
      transition: all 0.2s ease;
    }
    .affiliate-card:hover {
      border-color: var(--accent-blue);
      background: var(--bg-hover);
      transform: translateY(-2px);
      box-shadow: var(--shadow-md);
    }
    .affiliate-card.featured {
      border: 2px solid var(--accent-orange);
      background: linear-gradient(135deg, rgba(249, 115, 22, 0.1) 0%, rgba(249, 115, 22, 0.02) 100%);
    }
    .affiliate-card.featured:hover {
      border-color: var(--accent-orange);
      box-shadow: 0 4px 20px rgba(249, 115, 22, 0.3);
    }
    .affiliate-icon {
      width: 40px;
      height: 40px;
      border-radius: var(--radius-sm);
      background: rgba(60, 131, 246, 0.1);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.2em;
      flex-shrink: 0;
    }
    .affiliate-card.featured .affiliate-icon {
      background: rgba(249, 115, 22, 0.15);
    }
    .affiliate-info {
      flex: 1;
      min-width: 0;
    }
    .affiliate-name {
      font-weight: 600;
      font-size: 0.95em;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .affiliate-name .badge {
      font-size: 0.65em;
      padding: 2px 6px;
      border-radius: 8px;
      font-weight: 600;
    }
    .affiliate-name .badge.hot {
      background: linear-gradient(135deg, #f97316 0%, #fb923c 100%);
      color: white;
    }
    .affiliate-name .badge.free {
      background: linear-gradient(135deg, #22c55e 0%, #4ade80 100%);
      color: white;
    }
    .affiliate-benefit {
      font-size: 0.8em;
      color: var(--text-muted);
      margin-top: 2px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .affiliate-arrow {
      color: var(--text-muted);
      font-size: 18px;
    }

    /* 模型选择器 */
    .model-select-wrapper {
      position: relative;
    }
    .model-select {
      appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 12px center;
      background-size: 18px;
      padding-right: 40px;
      cursor: pointer;
    }
    .model-select option {
      background: var(--bg-secondary);
      color: var(--text-primary);
      padding: 12px;
    }
    .model-select option.recommended {
      font-weight: 600;
    }

    /* ============================================
       Step 2 安全设置页面优化样式 - 简化版
       ============================================ */
    
    /* 大卡片通用样式 */
    .security-big-card {
      background: var(--bg-tertiary);
      border: 2px solid var(--border-default);
      border-radius: var(--radius-xl);
      padding: 24px;
      margin-bottom: 16px;
      cursor: pointer;
      transition: all 0.25s ease;
      position: relative;
    }
    .security-big-card:hover {
      border-color: var(--border-accent);
      background: var(--bg-hover);
    }
    .security-big-card.selected {
      border-color: var(--accent-blue);
      background: linear-gradient(135deg, rgba(60, 131, 246, 0.12) 0%, rgba(60, 131, 246, 0.04) 100%);
      box-shadow: 0 0 20px rgba(60, 131, 246, 0.2);
    }
    
    /* 完全信任卡片 - 普通状态和选中状态都用蓝色 */
    .security-big-card.trust-card {
      border-color: var(--border-default);
      background: var(--bg-tertiary);
    }
    .security-big-card.trust-card:hover {
      border-color: var(--border-accent);
      background: var(--bg-hover);
    }
    .security-big-card.trust-card.selected {
      border-color: var(--accent-blue);
      background: linear-gradient(135deg, rgba(60, 131, 246, 0.12) 0%, rgba(60, 131, 246, 0.04) 100%);
      box-shadow: 0 0 20px rgba(60, 131, 246, 0.2);
    }
    
    /* 解锁全部能力 - 文字加粗加红加大 */
    .trust-highlight {
      color: #ef4444 !important;
      font-weight: 700 !important;
      font-size: 1.1em !important;
    }
    
    .security-recommended-badge {
      position: absolute;
      top: -12px;
      left: 20px;
      background: linear-gradient(135deg, #3c83f6 0%, #60a5fa 100%);
      color: white;
      padding: 4px 14px;
      border-radius: 12px;
      font-size: 0.85em;
      font-weight: 600;
    }
    .security-big-header {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 16px;
    }
    .security-big-icon {
      font-size: 2.5em;
    }
    .security-big-info {
      flex: 1;
    }
    .security-big-title {
      font-size: 1.3em;
      font-weight: 600;
      color: var(--text-primary);
    }
    .security-big-subtitle {
      font-size: 0.95em;
      color: var(--text-secondary);
      margin-top: 4px;
    }
    .security-big-check {
      opacity: 0;
      transition: all 0.2s ease;
    }
    .security-big-check .material-icons {
      font-size: 32px;
      color: var(--accent-blue);
    }
    .security-big-card.selected .security-big-check {
      opacity: 1;
    }
    .security-big-features {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding-left: 56px;
    }
    .feature-item {
      font-size: 1em;
      line-height: 1.5;
    }
    .feature-item.positive {
      color: var(--accent-green);
    }
    .feature-item.warning {
      color: var(--accent-yellow);
    }
    .feature-item.danger {
      color: #ef4444;
      font-weight: 500;
    }
    
    /* 保留旧样式兼容 */
    .security-recommended-card {
      background: var(--bg-tertiary);
      border: 2px solid var(--border-default);
      border-radius: var(--radius-xl);
      padding: 24px;
      margin-bottom: 20px;
      cursor: pointer;
      transition: all 0.25s ease;
      position: relative;
    }
    .security-recommended-card:hover {
      border-color: var(--border-accent);
      background: var(--bg-hover);
    }
    .security-recommended-card.selected {
      border-color: var(--accent-blue);
      background: linear-gradient(135deg, rgba(60, 131, 246, 0.12) 0%, rgba(60, 131, 246, 0.04) 100%);
      box-shadow: 0 0 20px rgba(60, 131, 246, 0.2);
    }
    .security-recommended-header {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 16px;
    }
    .security-recommended-icon {
      font-size: 2.5em;
    }
    .security-recommended-info {
      flex: 1;
    }
    .security-recommended-title {
      font-size: 1.3em;
      font-weight: 600;
      color: var(--text-primary);
    }
    .security-recommended-subtitle {
      font-size: 0.95em;
      color: var(--text-secondary);
      margin-top: 4px;
    }
    .security-recommended-check {
      opacity: 0;
      transition: all 0.2s ease;
    }
    .security-recommended-check .material-icons {
      font-size: 32px;
      color: var(--accent-blue);
    }
    .security-recommended-card.selected .security-recommended-check {
      opacity: 1;
    }
    .security-recommended-features {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding-left: 56px;
    }

    /* 其他选项折叠区域 */
    .security-other-options {
      margin-bottom: 24px;
    }
    .security-other-toggle {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      background: var(--bg-tertiary);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      cursor: pointer;
      color: var(--text-secondary);
      font-size: 0.95em;
      transition: all 0.2s ease;
    }
    .security-other-toggle:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }
    .security-other-toggle .material-icons {
      transition: transform 0.2s ease;
    }
    .security-other-toggle.open .material-icons {
      transform: rotate(180deg);
    }
    .security-other-content {
      margin-top: 12px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .security-option-card {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 16px 20px;
      background: var(--bg-tertiary);
      border: 2px solid var(--border-default);
      border-radius: var(--radius-lg);
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .security-option-card:hover {
      border-color: var(--border-accent);
      background: var(--bg-hover);
    }
    .security-option-card.selected {
      border-color: var(--accent-blue);
      background: rgba(60, 131, 246, 0.08);
    }
    .security-option-icon {
      font-size: 1.8em;
    }
    .security-option-content {
      flex: 1;
    }
    .security-option-title {
      font-size: 1.1em;
      font-weight: 600;
      color: var(--text-primary);
    }
    .security-option-desc {
      font-size: 0.9em;
      color: var(--text-secondary);
      margin-top: 4px;
    }
    .security-option-detail {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-top: 8px;
      flex-wrap: wrap;
    }
    .security-option-detail .detail-tag {
      font-size: 0.75em;
      font-weight: 600;
      padding: 3px 8px;
      border-radius: 4px;
    }
    .security-option-detail .detail-tag.safe {
      background: rgba(34, 197, 94, 0.15);
      color: var(--accent-green);
    }
    .security-option-detail .detail-tag.warn {
      background: rgba(249, 115, 22, 0.15);
      color: var(--accent-orange);
    }
    .security-option-detail .detail-text {
      font-size: 0.8em;
      color: var(--text-muted);
    }
    .security-option-check {
      opacity: 0;
      transition: all 0.2s ease;
    }
    .security-option-check .material-icons {
      font-size: 24px;
      color: var(--accent-blue);
    }
    .security-option-card.selected .security-option-check {
      opacity: 1;
    }

    /* 简化的确认区域 */
    .simple-agreement {
      padding: 16px 20px;
      background: var(--bg-tertiary);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-lg);
      margin-bottom: 24px;
    }
    .simple-agreement-checkbox {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      cursor: pointer;
      user-select: none;
    }
    .simple-agreement-checkbox input[type="checkbox"] {
      width: 20px;
      height: 20px;
      accent-color: var(--accent-blue);
      cursor: pointer;
      margin-top: 2px;
      flex-shrink: 0;
    }
    .simple-agreement-checkbox label {
      font-size: 0.95em;
      font-weight: 500;
      color: var(--text-primary);
      cursor: pointer;
    }
    .agreement-disclaimer {
      font-size: 0.8em;
      color: #ef4444;
      margin-top: 6px;
      line-height: 1.5;
      padding-left: 32px;
    }
    .simple-agreement-checkbox.error {
      animation: shake 0.5s ease-in-out;
    }
    .simple-agreement-checkbox.error label {
      color: var(--accent-red);
    }

    /* 设置区域样式 */
    .settings-section {
      margin-bottom: 24px;
    }
    .settings-section-title {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 1.05em;
      font-weight: 600;
      color: var(--text-primary);
      margin-bottom: 16px;
    }
    .settings-section-icon {
      font-size: 1.2em;
    }

    /* 工作目录紧凑样式 */
    .workspace-compact {
      background: var(--bg-tertiary);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-lg);
      padding: 16px;
    }
    .workspace-compact .workspace-input-area {
      display: flex;
      gap: 12px;
      margin-bottom: 8px;
    }
    .workspace-compact .workspace-input-wrapper {
      flex: 1;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 14px;
      background: var(--bg-secondary);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
    }
    .workspace-compact .workspace-input {
      flex: 1;
      background: transparent;
      border: none;
      color: var(--text-primary);
      font-family: var(--font-mono);
      font-size: 0.9em;
      outline: none;
    }
    .workspace-compact .workspace-browse-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 10px 16px;
      background: var(--accent-blue);
      border: none;
      border-radius: var(--radius-md);
      color: white;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .workspace-compact .workspace-browse-btn:hover {
      background: var(--accent-blue-dark);
    }
    .workspace-hint {
      font-size: 0.85em;
      color: var(--text-muted);
    }
    /* C盘警告提示样式 */
    .workspace-warning {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      margin-top: 12px;
      padding: 12px 14px;
      background: rgba(244, 67, 54, 0.08);
      border: 1px solid rgba(244, 67, 54, 0.3);
      border-radius: var(--radius-md);
      font-size: 0.9em;
      color: #f44336;
    }
    .workspace-warning .material-icons {
      font-size: 18px;
      flex-shrink: 0;
      margin-top: 1px;
    }
    .workspace-warning-text {
      line-height: 1.5;
    }
    .workspace-warning-text strong {
      font-weight: 600;
    }
    /* C盘确认弹框样式 */
    .cdrive-confirm-modal {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      backdrop-filter: blur(4px);
    }
    .cdrive-confirm-content {
      background: var(--bg-primary);
      border-radius: var(--radius-xl);
      padding: 28px;
      max-width: 480px;
      width: 90%;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
    }
    .cdrive-confirm-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
    }
    .cdrive-confirm-icon {
      width: 48px;
      height: 48px;
      background: rgba(244, 67, 54, 0.15);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
    }
    .cdrive-confirm-title {
      font-size: 1.25em;
      font-weight: 600;
      color: var(--text-primary);
    }
    .cdrive-confirm-body {
      margin-bottom: 24px;
    }
    .cdrive-confirm-message {
      color: var(--text-secondary);
      line-height: 1.6;
      margin-bottom: 16px;
    }
    .cdrive-confirm-danger {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 14px;
      background: rgba(244, 67, 54, 0.1);
      border: 1px solid rgba(244, 67, 54, 0.3);
      border-radius: var(--radius-md);
      color: #f44336;
      font-size: 0.95em;
      line-height: 1.5;
    }
    .cdrive-confirm-danger .material-icons {
      font-size: 20px;
      flex-shrink: 0;
    }
    .cdrive-confirm-actions {
      display: flex;
      gap: 12px;
      justify-content: flex-end;
    }
    .cdrive-confirm-actions .btn {
      min-width: 100px;
    }
    .btn-danger {
      background: #f44336;
      color: white;
    }
    .btn-danger:hover {
      background: #d32f2f;
    }
    .security-card-cons {
      background: rgba(255, 152, 0, 0.1);
      color: #ff9800;
      border: 1px solid rgba(255, 152, 0, 0.2);
    }
    .security-card-cons.danger {
      background: rgba(244, 67, 54, 0.1);
      color: #f44336;
      border: 1px solid rgba(244, 67, 54, 0.2);
    }
    .security-card-warning {
      display: inline-block;
      background: #ff9800;
      color: white;
      padding: 2px 10px;
      border-radius: 12px;
      font-size: 0.75em;
      font-weight: 500;
      margin-left: 4px;
    }
    .security-card-check {
      position: absolute;
      top: 16px;
      right: 16px;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: var(--accent-blue);
      display: none;
      align-items: center;
      justify-content: center;
      color: white;
    }
    .security-card.selected .security-card-check {
      display: flex;
    }

    /* 快速决策简化 */
    .quick-decision {
      background: var(--bg-tertiary);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-lg);
      padding: 20px 24px;
      margin-bottom: 24px;
    }
    .quick-decision-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 1.1em;
      font-weight: 600;
      color: var(--text-primary);
      margin-bottom: 16px;
    }
    .quick-decision-items {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
    }
    @media (max-width: 900px) {
      .quick-decision-items {
        grid-template-columns: 1fr;
      }
    }
    .quick-decision-item {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 16px;
      background: var(--bg-elevated);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      font-size: 0.95em;
      color: var(--text-secondary);
      transition: all 0.2s ease;
    }
    .quick-decision-item:hover {
      border-color: var(--border-accent);
      background: var(--bg-hover);
    }
    .quick-decision-item .scenario {
      font-size: 0.9em;
      color: var(--text-muted);
      line-height: 1.5;
    }
    .quick-decision-item .result {
      font-size: 1.1em;
      font-weight: 600;
      color: var(--accent-blue);
      display: flex;
      align-items: center;
      gap: 6px;
    }

    /* 选择区域强调提示 */
    .selection-hint {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 14px 20px;
      background: linear-gradient(135deg, rgba(60, 131, 246, 0.15) 0%, rgba(60, 131, 246, 0.05) 100%);
      border: 2px dashed var(--accent-blue);
      border-radius: var(--radius-lg);
      margin-bottom: 20px;
      color: var(--accent-blue-light);
      font-size: 1.05em;
      font-weight: 500;
      animation: pulse 2s ease-in-out infinite;
    }
    .selection-hint .material-icons {
      font-size: 1.4em;
      animation: bounce 1s ease-in-out infinite;
    }

    /* Step 4: 对话方式选择样式 */
    .channel-mode-selector {
      display: flex;
      flex-direction: column;
      gap: 16px;
      margin-bottom: 24px;
    }
    .channel-mode-card {
      display: flex;
      align-items: flex-start;
      gap: 16px;
      padding: 20px 24px;
      background: var(--bg-tertiary);
      border: 2px solid var(--border-default);
      border-radius: var(--radius-xl);
      cursor: pointer;
      transition: all 0.25s ease;
      position: relative;
    }
    .channel-mode-card:hover {
      border-color: var(--border-accent);
      background: var(--bg-hover);
    }
    .channel-mode-card.selected {
      border-color: var(--accent-blue);
      background: linear-gradient(135deg, rgba(60, 131, 246, 0.12) 0%, rgba(60, 131, 246, 0.04) 100%);
      box-shadow: 0 0 20px rgba(60, 131, 246, 0.15);
    }
    .channel-mode-icon {
      font-size: 2.2em;
      flex-shrink: 0;
    }
    .channel-mode-content {
      flex: 1;
    }
    .channel-mode-title {
      font-size: 1.15em;
      font-weight: 600;
      margin-bottom: 6px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .channel-mode-badge {
      font-size: 0.75em;
      padding: 3px 10px;
      border-radius: 12px;
      font-weight: 600;
    }
    .channel-mode-badge.recommended {
      background: linear-gradient(135deg, #3c83f6 0%, #60a5fa 100%);
      color: white;
    }
    .channel-mode-desc {
      font-size: 0.95em;
      color: var(--text-secondary);
      margin-bottom: 10px;
    }
    .channel-mode-features {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .feature-tag {
      font-size: 0.85em;
      padding: 4px 10px;
      background: rgba(34, 197, 94, 0.15);
      color: var(--accent-green);
      border-radius: 6px;
    }
    .feature-tag.subtle {
      background: var(--bg-elevated);
      color: var(--text-muted);
    }
    .channel-mode-check {
      position: absolute;
      top: 16px;
      right: 16px;
      opacity: 0;
      transition: all 0.2s ease;
    }
    .channel-mode-check .material-icons {
      font-size: 28px;
      color: var(--accent-blue);
    }
    .channel-mode-card.selected .channel-mode-check {
      opacity: 1;
    }

    /* 网页对话说明区域 */
    .channel-mode-detail {
      margin-bottom: 24px;
    }
    .web-mode-info {
      display: flex;
      align-items: flex-start;
      gap: 16px;
      padding: 20px 24px;
      background: linear-gradient(135deg, rgba(34, 197, 94, 0.1) 0%, rgba(34, 197, 94, 0.03) 100%);
      border: 1px solid rgba(34, 197, 94, 0.3);
      border-radius: var(--radius-lg);
    }
    .web-mode-info-icon {
      font-size: 1.8em;
    }
    .web-mode-info-title {
      font-weight: 600;
      color: var(--accent-green);
      margin-bottom: 10px;
    }
    .web-mode-steps {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    .web-mode-steps li {
      position: relative;
      padding-left: 20px;
      margin-bottom: 8px;
      color: var(--text-secondary);
      font-size: 0.95em;
    }
    .web-mode-steps li::before {
      content: '→';
      position: absolute;
      left: 0;
      color: var(--accent-green);
    }
    .web-mode-steps code {
      background: rgba(60, 131, 246, 0.15);
      padding: 2px 8px;
      border-radius: 4px;
      color: var(--accent-blue-light);
      font-family: var(--font-mono);
      font-size: 0.9em;
    }

    /* IM配置折叠区域 */
    .im-config-section {
      background: var(--bg-tertiary);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-lg);
      padding: 24px;
      margin-bottom: 24px;
      animation: fadeInUp 0.3s ease-out;
    }
    .im-config-header {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 1.1em;
      font-weight: 600;
      color: var(--text-primary);
      margin-bottom: 20px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border-default);
    }
    .im-config-header .material-icons {
      color: var(--accent-blue);
    }

    /* Step 4: 渠道配置样式 */
    .channel-selector {
      display: flex;
      gap: 12px;
      margin-bottom: 24px;
      border-bottom: 1px solid var(--border-default);
      padding-bottom: 16px;
    }
    .channel-tab {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 20px;
      background: var(--bg-tertiary);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      cursor: pointer;
      transition: all 0.2s ease;
      font-weight: 500;
    }
    .channel-tab:hover:not(.disabled) {
      background: var(--bg-hover);
      border-color: var(--border-accent);
    }
    .channel-tab.selected {
      background: linear-gradient(135deg, rgba(60, 131, 246, 0.2) 0%, rgba(60, 131, 246, 0.1) 100%);
      border-color: var(--accent-blue);
      color: var(--accent-blue-light);
    }
    .channel-tab.disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .channel-tab-icon { font-size: 1.2em; }
    .channel-tab-badge {
      font-size: 0.75em;
      background: var(--bg-elevated);
      padding: 2px 8px;
      border-radius: 10px;
      color: var(--text-muted);
    }

    .channel-config-form {
      background: var(--bg-tertiary);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-lg);
      padding: 24px;
      animation: fadeInUp 0.3s ease-out;
    }
    .channel-config-header {
      display: flex;
      align-items: flex-start;
      gap: 16px;
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border-default);
    }
    .channel-config-icon {
      font-size: 2em;
      flex-shrink: 0;
    }
    .channel-config-title {
      font-size: 1.15em;
      font-weight: 600;
      color: var(--text-primary);
    }
    .channel-config-subtitle {
      font-size: 0.9em;
      color: var(--text-secondary);
      margin-top: 4px;
    }
    .channel-config-help {
      margin-left: auto;
      display: flex;
      align-items: center;
      gap: 4px;
      color: var(--accent-blue);
      font-size: 0.9em;
      text-decoration: none;
      padding: 8px 12px;
      background: rgba(60, 131, 246, 0.1);
      border-radius: var(--radius-md);
      transition: all 0.2s ease;
      border: none;
      cursor: pointer;
    }
    .channel-config-help:hover {
      background: rgba(60, 131, 246, 0.2);
    }
    .channel-config-help .material-icons {
      font-size: 1.1em;
    }

    /* ========== 左右分栏配置布局（核心重构）========== */
    
    /* 配置表单容器 - 支持分栏模式 */
    .channel-config-form {
      position: relative;
    }
    
    /* 分栏模式激活时的布局 */
    .channel-config-form.split-mode {
      display: grid;
      grid-template-columns: 400px 1fr;
      grid-template-rows: auto 1fr auto;
      grid-template-areas:
        "header header"
        "fields guide"
        "status guide";
      gap: 0;
      min-height: 550px;
      max-height: calc(100vh - 260px);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-lg);
      overflow: hidden;
      background: var(--bg-primary);
    }
    
    /* 分栏模式下的头部 - 跨两列 */
    .channel-config-form.split-mode .channel-config-header {
      grid-area: header;
      border-bottom: 1px solid var(--border-color);
      margin-bottom: 0;
      padding: 16px 20px;
      background: var(--bg-elevated);
    }
    
    /* 分栏模式下的左侧表单区 */
    .channel-config-form.split-mode .channel-config-fields {
      grid-area: fields;
      padding: 20px;
      border-right: 1px solid var(--border-color);
      background: var(--bg-primary);
      overflow-y: auto;
    }
    
    /* 分栏模式下的右侧指南区 */
    .channel-config-form.split-mode .channel-guide {
      grid-area: guide;
      margin: 0;
      border: none;
      border-radius: 0;
      overflow-y: auto;
      background: linear-gradient(135deg, rgba(59, 130, 246, 0.03) 0%, rgba(139, 92, 246, 0.03) 100%);
    }
    
    /* 分栏模式下指南的 header 改为 sticky */
    .channel-config-form.split-mode .guide-header {
      position: sticky;
      top: 0;
      z-index: 10;
      background: linear-gradient(90deg, rgba(59, 130, 246, 0.15) 0%, rgba(139, 92, 246, 0.1) 100%);
      backdrop-filter: blur(8px);
      border-bottom: 1px solid rgba(59, 130, 246, 0.2);
    }
    
    /* 分栏模式下状态消息放在表单底部 */
    .channel-config-form.split-mode .status-message {
      grid-area: status;
      margin: 0;
      padding: 12px 20px;
      border-top: 1px solid var(--border-color);
      border-right: 1px solid var(--border-color);
    }
    
    /* 分栏模式下隐藏原按钮文字，显示新状态 */
    .channel-config-form.split-mode .channel-config-help {
      background: rgba(34, 197, 94, 0.1);
      color: var(--accent-green);
      border: 1px solid rgba(34, 197, 94, 0.3);
    }
    .channel-config-form.split-mode .channel-config-help::after {
      content: " (已展开)";
    }
    
    /* 响应式：小屏幕时改为上下布局 */
    @media (max-width: 900px) {
      .channel-config-form.split-mode {
        grid-template-columns: 1fr;
        grid-template-rows: auto auto 1fr auto;
        grid-template-areas:
          "header"
          "fields"
          "guide"
          "status";
        max-height: none;
      }
      
      .channel-config-form.split-mode .channel-config-fields {
        border-right: none;
        border-bottom: 1px solid var(--border-color);
      }
      
      .channel-config-form.split-mode .channel-guide {
        max-height: 400px;
      }
      
      .channel-config-form.split-mode .status-message {
        border-right: none;
      }
    }
    
    /* 配置指南样式 */
    .channel-guide {
      margin: 16px 0;
      background: var(--bg-elevated);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-lg);
      overflow: hidden;
    }
    .channel-guide.hidden {
      display: none;
    }
    .guide-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      background: rgba(60, 131, 246, 0.1);
      border-bottom: 1px solid var(--border-color);
      color: var(--accent-blue);
      font-weight: 600;
    }
    .guide-header .material-icons {
      font-size: 1.2em;
    }
    
    /* 指南关闭按钮 */
    .guide-close-btn {
      margin-left: auto;
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 6px 12px;
      background: rgba(255, 255, 255, 0.15);
      border: 1px solid rgba(255, 255, 255, 0.25);
      border-radius: var(--radius-md);
      color: var(--text-primary);
      font-size: 0.85em;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .guide-close-btn:hover {
      background: rgba(239, 68, 68, 0.15);
      border-color: rgba(239, 68, 68, 0.4);
      color: var(--accent-red);
      transform: translateX(2px);
    }
    .guide-close-btn .material-icons {
      font-size: 1.1em;
    }
    
    /* 分栏模式下表单区的标题提示 */
    .channel-config-form.split-mode .channel-config-fields::before {
      content: "填写配置信息";
      display: block;
      font-size: 0.8em;
      font-weight: 600;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 16px;
      padding-bottom: 8px;
      border-bottom: 1px dashed var(--border-subtle);
    }
    
    /* 分栏模式下的步骤高亮 - 第 3 步获取密钥 */
    .channel-config-form.split-mode .guide-step:nth-child(3) {
      background: rgba(34, 197, 94, 0.08);
      margin: 0 -16px 16px;
      padding: 16px;
      border-radius: var(--radius-md);
      border: 1px solid rgba(34, 197, 94, 0.2);
    }
    .channel-config-form.split-mode .guide-step:nth-child(3) .guide-step-number {
      background: var(--accent-green);
      animation: pulse-green 2s infinite;
    }
    
    @keyframes pulse-green {
      0%, 100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.4); }
      50% { box-shadow: 0 0 0 8px rgba(34, 197, 94, 0); }
    }
    
    .guide-content {
      padding: 16px;
    }
    .guide-step {
      display: flex;
      gap: 16px;
      margin-bottom: 16px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border-subtle);
    }
    .guide-step:last-child {
      margin-bottom: 0;
      padding-bottom: 0;
      border-bottom: none;
    }
    .guide-step-number {
      flex-shrink: 0;
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--accent-blue);
      color: white;
      border-radius: 50%;
      font-weight: 600;
      font-size: 0.9em;
    }
    .guide-step-content {
      flex: 1;
    }
    .guide-step-title {
      font-size: 1em;
      margin-bottom: 4px;
      color: var(--text-primary);
    }
    .guide-step-desc {
      font-size: 0.9em;
      color: var(--text-secondary);
      line-height: 1.6;
    }
    .guide-step-desc a {
      color: var(--accent-blue);
    }
    .guide-step-desc code {
      background: var(--bg-surface);
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 0.9em;
      color: var(--accent-orange);
    }
    .guide-tip {
      display: block;
      margin-top: 8px;
      padding: 8px 12px;
      background: rgba(34, 197, 94, 0.1);
      border-left: 3px solid var(--accent-green);
      border-radius: 0 4px 4px 0;
      font-size: 0.85em;
      color: var(--accent-green);
    }
    .guide-footer {
      padding: 12px 16px;
      background: var(--bg-surface);
      border-top: 1px solid var(--border-color);
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
    }
    .guide-link {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: var(--accent-blue);
      font-size: 0.9em;
      text-decoration: none;
    }
    .guide-link:hover {
      text-decoration: underline;
    }
    .guide-link .material-icons {
      font-size: 1.1em;
    }

    /* 前置条件 */
    .guide-prereq {
      margin: 0 16px 16px;
      padding: 16px;
      background: rgba(59, 130, 246, 0.05);
      border: 1px solid rgba(59, 130, 246, 0.2);
      border-radius: var(--radius-md);
    }
    .guide-prereq-title {
      font-weight: 600;
      color: var(--accent-blue);
      margin-bottom: 12px;
    }
    .guide-prereq-list {
      margin: 0;
      padding-left: 20px;
      color: var(--text-secondary);
      line-height: 1.8;
    }
    .guide-prereq-list li {
      margin-bottom: 4px;
    }

    /* 子步骤 */
    .guide-substeps {
      margin: 8px 0 0 0;
      padding-left: 20px;
      line-height: 1.8;
    }
    .guide-substeps li {
      margin-bottom: 6px;
    }
    .guide-substeps ul {
      margin: 4px 0 8px 0;
      padding-left: 20px;
    }

    /* 字段说明 */
    .guide-field-desc {
      margin: 12px 0;
      padding: 12px 16px;
      background: var(--bg-surface);
      border-radius: var(--radius-md);
      border-left: 3px solid var(--accent-blue);
    }
    .guide-field-row {
      margin-bottom: 8px;
      line-height: 1.6;
    }
    .guide-field-row:last-child {
      margin-bottom: 0;
    }
    .guide-field-name {
      font-weight: 600;
      color: var(--text-primary);
    }

    /* 权限列表 */
    .guide-permission-list {
      margin-top: 12px;
    }
    .guide-permission-item {
      margin-bottom: 12px;
      padding: 10px 14px;
      background: var(--bg-surface);
      border-radius: var(--radius-md);
      line-height: 1.6;
    }
    .guide-permission-item:last-child {
      margin-bottom: 0;
    }
    .guide-permission-item strong {
      color: var(--accent-blue);
    }
    .guide-permission-item code {
      background: rgba(249, 115, 22, 0.1);
      color: var(--accent-orange);
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 0.9em;
    }

    /* 示例框 */
    .guide-example {
      margin-top: 12px;
      padding: 12px;
      background: var(--bg-surface);
      border-radius: var(--radius-md);
      font-size: 0.9em;
      color: var(--text-secondary);
    }
    .guide-example code {
      background: rgba(249, 115, 22, 0.1);
      color: var(--accent-orange);
      padding: 2px 6px;
      border-radius: 4px;
    }

    /* 权限表格 */
    .guide-permission-table,
    .guide-field-table {
      width: 100%;
      margin-top: 12px;
      border-collapse: collapse;
      font-size: 0.85em;
    }
    .guide-permission-table th,
    .guide-permission-table td,
    .guide-field-table th,
    .guide-field-table td {
      padding: 8px 12px;
      text-align: left;
      border: 1px solid var(--border-color);
    }
    .guide-permission-table th,
    .guide-field-table th {
      background: var(--bg-surface);
      font-weight: 600;
      color: var(--text-primary);
    }
    .guide-permission-table td,
    .guide-field-table td {
      background: var(--bg-elevated);
    }
    .guide-permission-table code,
    .guide-field-table code {
      background: rgba(249, 115, 22, 0.1);
      color: var(--accent-orange);
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 0.9em;
    }

    /* FAQ */
    .guide-faq {
      margin: 16px;
      padding: 16px;
      background: var(--bg-surface);
      border-radius: var(--radius-md);
    }
    .guide-faq-title {
      font-weight: 600;
      color: var(--text-primary);
      margin-bottom: 16px;
      font-size: 1em;
    }
    .guide-faq-item {
      margin-bottom: 12px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--border-subtle);
    }
    .guide-faq-item:last-child {
      margin-bottom: 0;
      padding-bottom: 0;
      border-bottom: none;
    }
    .guide-faq-q {
      font-weight: 600;
      color: var(--text-primary);
      margin-bottom: 4px;
      font-size: 0.9em;
    }
    .guide-faq-a {
      color: var(--text-secondary);
      font-size: 0.85em;
      line-height: 1.5;
    }

    /* 内网穿透说明 */
    .guide-tunnel-info {
      margin: 16px;
      padding: 16px;
      background: rgba(249, 115, 22, 0.05);
      border: 1px solid rgba(249, 115, 22, 0.2);
      border-radius: var(--radius-md);
    }
    .guide-tunnel-title {
      font-weight: 600;
      color: var(--accent-orange);
      margin-bottom: 12px;
    }
    .guide-tunnel-content {
      color: var(--text-secondary);
      font-size: 0.9em;
      line-height: 1.6;
    }
    .guide-tunnel-content p {
      margin: 0 0 12px 0;
    }
    .guide-tunnel-options {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }
    @media (max-width: 768px) {
      .guide-tunnel-options {
        grid-template-columns: 1fr;
      }
    }
    .guide-tunnel-option {
      padding: 12px;
      background: var(--bg-elevated);
      border-radius: var(--radius-md);
    }
    .guide-tunnel-option strong {
      display: block;
      margin-bottom: 8px;
      color: var(--text-primary);
    }
    .guide-tunnel-option ol {
      margin: 0;
      padding-left: 20px;
      line-height: 1.6;
    }
    .guide-tunnel-option code {
      background: rgba(249, 115, 22, 0.1);
      color: var(--accent-orange);
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 0.9em;
    }

    .channel-config-fields {
      display: grid;
      gap: 20px;
    }
    .required {
      color: var(--accent-red);
    }

    /* 免责声明和同意条款 */
    .agreement-section {
      margin-top: 28px;
      padding: 20px 24px;
      background: var(--bg-tertiary);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-lg);
    }
    .agreement-text {
      font-size: 1em;
      color: var(--text-secondary);
      line-height: 1.7;
      margin-bottom: 16px;
    }
    .agreement-checkbox {
      display: flex;
      align-items: center;
      gap: 12px;
      cursor: pointer;
      user-select: none;
    }
    .agreement-checkbox input[type="checkbox"] {
      width: 22px;
      height: 22px;
      accent-color: var(--accent-blue);
      cursor: pointer;
    }
    .agreement-checkbox label {
      font-size: 1.05em;
      font-weight: 500;
      color: var(--text-primary);
      cursor: pointer;
    }
    .agreement-checkbox.error {
      animation: shake 0.5s ease-in-out;
    }
    .agreement-checkbox.error label {
      color: var(--accent-red);
    }
    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      10%, 30%, 50%, 70%, 90% { transform: translateX(-8px); }
      20%, 40%, 60%, 80% { transform: translateX(8px); }
    }

    /* ============================================
       Step 3 工作目录页面优化样式
       ============================================ */
    
    /* 当前模式状态卡片 */
    .mode-status-card {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 20px 24px;
      background: linear-gradient(135deg, rgba(60, 131, 246, 0.12) 0%, rgba(60, 131, 246, 0.04) 100%);
      border: 2px solid var(--accent-blue);
      border-radius: var(--radius-xl);
      margin-bottom: 28px;
    }
    .mode-status-icon {
      font-size: 2.5em;
    }
    .mode-status-content {
      flex: 1;
    }
    .mode-status-label {
      font-size: 0.85em;
      color: var(--text-muted);
      margin-bottom: 4px;
    }
    .mode-status-value {
      font-size: 1.4em;
      font-weight: 700;
      color: var(--accent-blue-light);
    }
    .mode-status-desc {
      font-size: 0.95em;
      color: var(--text-secondary);
      max-width: 280px;
      text-align: right;
    }

    /* 工作目录选择区域 */
    .workspace-section {
      background: var(--bg-tertiary);
      border: 2px solid var(--accent-blue);
      border-radius: var(--radius-xl);
      padding: 28px;
      margin-bottom: 24px;
      position: relative;
    }
    .workspace-section::before {
      content: '👇 请在这里选择';
      position: absolute;
      top: -14px;
      left: 24px;
      background: linear-gradient(135deg, #3c83f6 0%, #60a5fa 100%);
      color: white;
      padding: 6px 16px;
      border-radius: 20px;
      font-size: 0.85em;
      font-weight: 600;
      box-shadow: 0 4px 12px rgba(60, 131, 246, 0.4);
    }
    .workspace-header {
      display: flex;
      align-items: flex-start;
      gap: 16px;
      margin-bottom: 24px;
    }
    .workspace-header-icon {
      font-size: 2.5em;
      line-height: 1;
    }
    .workspace-header-text {
      flex: 1;
    }
    .workspace-header-title {
      font-size: 1.3em;
      font-weight: 700;
      color: var(--text-primary);
      margin-bottom: 6px;
    }
    .workspace-header-subtitle {
      font-size: 1em;
      color: var(--text-secondary);
      line-height: 1.5;
    }
    .workspace-input-area {
      display: flex;
      gap: 12px;
      margin-bottom: 16px;
    }
    .workspace-input-wrapper {
      flex: 1;
      position: relative;
      display: flex;
      align-items: center;
    }
    .workspace-input-icon {
      position: absolute;
      left: 14px;
      color: var(--text-muted);
      font-size: 1.3em;
    }
    .workspace-input {
      width: 100%;
      padding: 16px 16px 16px 48px;
      background: var(--bg-secondary);
      border: 2px solid var(--border-default);
      border-radius: var(--radius-lg);
      color: var(--text-primary);
      font-size: 1.05em;
      font-family: var(--font-mono);
      transition: all 0.2s ease;
    }
    .workspace-input:focus {
      outline: none;
      border-color: var(--accent-blue);
      box-shadow: 0 0 0 4px rgba(60, 131, 246, 0.15);
    }
    .workspace-browse-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 16px 24px;
      background: linear-gradient(135deg, #3c83f6 0%, #60a5fa 100%);
      border: none;
      border-radius: var(--radius-lg);
      color: white;
      font-size: 1em;
      font-weight: 600;
      font-family: var(--font-sans);
      cursor: pointer;
      transition: all 0.2s ease;
      white-space: nowrap;
    }
    .workspace-browse-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(60, 131, 246, 0.4);
    }
    .workspace-browse-btn .material-icons {
      font-size: 1.2em;
    }
    .workspace-tip {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 16px;
      background: rgba(234, 179, 8, 0.1);
      border: 1px solid rgba(234, 179, 8, 0.3);
      border-radius: var(--radius-md);
      font-size: 0.95em;
      color: var(--accent-yellow);
    }
    .workspace-tip-icon {
      font-size: 1.2em;
    }
    .workspace-tip code {
      background: rgba(234, 179, 8, 0.15);
      padding: 2px 8px;
      border-radius: 4px;
      font-family: var(--font-mono);
      font-size: 0.9em;
    }

    /* 额外信任目录折叠区 */
    .extra-dirs-section {
      background: var(--bg-tertiary);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-lg);
      margin-bottom: 24px;
      overflow: hidden;
    }
    .extra-dirs-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px;
      cursor: pointer;
      transition: background 0.2s ease;
    }
    .extra-dirs-header:hover {
      background: var(--bg-hover);
    }
    .extra-dirs-title {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 1em;
      font-weight: 500;
      color: var(--text-secondary);
    }
    .extra-dirs-arrow {
      color: var(--text-muted);
      transition: transform 0.2s ease;
    }
    .extra-dirs-section.open .extra-dirs-arrow {
      transform: rotate(180deg);
    }
    .extra-dirs-content {
      padding: 0 20px 20px;
    }
    .extra-dirs-content.hidden {
      display: none;
    }
    .extra-dirs-hint {
      font-size: 0.9em;
      color: var(--text-muted);
      margin-bottom: 16px;
      padding: 12px;
      background: var(--bg-elevated);
      border-radius: var(--radius-md);
    }
    .dir-empty {
      text-align: center;
      color: var(--text-muted);
      font-size: 0.9em;
      padding: 16px;
    }

    /* 表单元素 */
    .form-group {
      margin-bottom: 20px;
    }
    .form-label {
      display: block;
      margin-bottom: 8px;
      font-weight: 500;
      font-size: 0.9em;
      color: var(--text-secondary);
    }
    .form-input {
      width: 100%;
      padding: 12px 16px;
      background: var(--bg-tertiary);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      color: var(--text-primary);
      font-size: 0.95em;
      font-family: var(--font-sans);
      transition: all 0.2s ease;
    }
    .form-input::placeholder { color: var(--text-muted); }
    .form-input:hover { border-color: rgba(255, 255, 255, 0.15); }
    .form-input:focus {
      outline: none;
      border-color: var(--accent-blue);
      box-shadow: 0 0 0 3px rgba(60, 131, 246, 0.15);
    }
    .form-input.mono { font-family: var(--font-mono); font-size: 0.9em; }
    .form-input-group {
      display: flex;
      gap: 8px;
    }
    .form-input-group .form-input { flex: 1; }
    .form-help {
      margin-top: 6px;
      font-size: 0.85em;
      color: var(--text-muted);
    }
    .form-help a { color: var(--accent-blue); text-decoration: none; }
    .form-help a:hover { text-decoration: underline; }

    /* 密码输入框 */
    .password-input-wrapper {
      position: relative;
    }
    .password-input-wrapper .form-input {
      padding-right: 48px;
    }
    .password-toggle {
      position: absolute;
      right: 12px;
      top: 50%;
      transform: translateY(-50%);
      background: none;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      padding: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .password-toggle:hover { color: var(--text-secondary); }

    /* 按钮 */
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 12px 24px;
      border: none;
      border-radius: var(--radius-md);
      font-size: 0.95em;
      font-weight: 500;
      font-family: var(--font-sans);
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .btn-primary {
      background: var(--gradient-blue);
      color: white;
      box-shadow: var(--shadow-sm);
    }
    .btn-primary:hover:not(:disabled) {
      box-shadow: var(--shadow-glow);
      transform: translateY(-1px);
    }
    .btn-secondary {
      background: var(--bg-tertiary);
      border: 1px solid var(--border-default);
      color: var(--text-primary);
    }
    .btn-secondary:hover:not(:disabled) {
      background: var(--bg-hover);
      border-color: rgba(255, 255, 255, 0.15);
    }
    .btn-ghost {
      background: transparent;
      color: var(--text-secondary);
    }
    .btn-ghost:hover:not(:disabled) {
      background: var(--bg-tertiary);
      color: var(--text-primary);
    }
    .btn-lg {
      padding: 16px 32px;
      font-size: 1.05em;
    }
    .btn-group {
      display: flex;
      gap: 12px;
      justify-content: flex-end;
      margin-top: 32px;
    }

    /* 链接卡片 */
    .link-card {
      display: block;
      background: var(--bg-tertiary);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      padding: 20px;
      text-decoration: none;
      color: var(--text-primary);
      transition: all 0.2s ease;
      margin-bottom: 12px;
    }
    .link-card:hover {
      border-color: var(--accent-blue);
      background: var(--bg-hover);
      transform: translateY(-2px);
      box-shadow: var(--shadow-md);
    }
    .link-card-content {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .link-card-icon {
      width: 48px;
      height: 48px;
      border-radius: var(--radius-md);
      background: rgba(60, 131, 246, 0.1);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.5em;
    }
    .link-card-text { flex: 1; }
    .link-card-title { font-weight: 600; margin-bottom: 4px; }
    .link-card-desc { font-size: 0.85em; color: var(--text-secondary); }
    .link-card-arrow { color: var(--text-muted); }

    /* 状态消息 */
    .status-message {
      display: none;
      padding: 12px 16px;
      border-radius: var(--radius-md);
      margin-top: 16px;
      font-size: 0.9em;
      animation: fadeIn 0.3s ease;
    }
    .status-message.show { display: flex; align-items: center; gap: 8px; }
    .status-message.loading {
      background: rgba(60, 131, 246, 0.1);
      border: 1px solid rgba(60, 131, 246, 0.2);
      color: var(--accent-blue-light);
    }
    .status-message.success {
      background: rgba(34, 197, 94, 0.1);
      border: 1px solid rgba(34, 197, 94, 0.2);
      color: var(--accent-green);
    }
    .status-message.error {
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.2);
      color: var(--accent-red);
    }
    .status-spinner {
      width: 16px;
      height: 16px;
      border: 2px solid currentColor;
      border-right-color: transparent;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    /* 目录列表 */
    .dir-list {
      margin: 16px 0;
    }
    .dir-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      background: var(--bg-tertiary);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      margin-bottom: 8px;
    }
    .dir-item-icon { font-size: 1.2em; }
    .dir-item-path {
      flex: 1;
      font-family: var(--font-mono);
      font-size: 0.9em;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .dir-item-remove {
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.2);
      color: var(--accent-red);
      padding: 6px 12px;
      border-radius: var(--radius-sm);
      cursor: pointer;
      font-size: 0.85em;
      font-family: var(--font-sans);
    }
    .dir-item-remove:hover {
      background: rgba(239, 68, 68, 0.2);
    }

    /* 为什么选择 openclaw */
    .why-choose-section {
      background: var(--bg-tertiary);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-lg);
      margin-bottom: 20px;
      overflow: hidden;
    }
    .why-choose-header {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 14px 20px;
      background: var(--bg-elevated);
      border-bottom: 1px solid var(--border-default);
    }
    .why-choose-icon {
      font-size: 1.3em;
    }
    .why-choose-title {
      font-size: 1.05em;
      font-weight: 600;
      color: var(--text-primary);
    }
    .why-choose-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
      padding: 16px;
    }
    @media (max-width: 600px) {
      .why-choose-grid {
        grid-template-columns: 1fr;
      }
    }
    .why-choose-item {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 12px 14px;
      background: var(--bg-secondary);
      border-radius: var(--radius-md);
      font-size: 0.9em;
      line-height: 1.5;
    }
    .why-item-icon {
      font-size: 1.2em;
      flex-shrink: 0;
    }
    .why-item-text {
      color: var(--text-secondary);
    }
    .why-item-text strong {
      color: var(--text-primary);
    }

    /* 增值服务卡片 */
    .premium-service-card {
      background: linear-gradient(135deg, rgba(255, 215, 0, 0.08) 0%, rgba(255, 165, 0, 0.03) 100%);
      border: 2px solid rgba(255, 215, 0, 0.4);
      border-radius: var(--radius-xl);
      padding: 0;
      margin-bottom: 0;
      position: relative;
      overflow: hidden;
    }
    .premium-badge {
      position: absolute;
      top: 0;
      right: 24px;
      background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%);
      color: #1a1a1a;
      font-size: 0.85em;
      font-weight: 700;
      padding: 6px 16px;
      border-radius: 0 0 12px 12px;
    }
    .premium-content {
      padding: 28px 24px;
      text-align: center;
    }
    .premium-title {
      font-size: 1.4em;
      font-weight: 700;
      color: var(--text-primary);
      margin-bottom: 6px;
    }
    .premium-subtitle {
      font-size: 0.95em;
      color: var(--text-secondary);
      margin-bottom: 20px;
    }
    .premium-features {
      display: flex;
      flex-direction: column;
      gap: 10px;
      text-align: left;
      margin-bottom: 24px;
    }
    .premium-feature {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 16px;
      background: var(--bg-secondary);
      border-radius: var(--radius-md);
      font-size: 0.9em;
      color: var(--text-secondary);
    }
    .premium-feature strong {
      color: var(--text-primary);
    }
    
    /* 金色购买按钮 */
    .premium-buy-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      width: 100%;
      padding: 18px 32px;
      background: linear-gradient(135deg, #FFD700 0%, #FFA500 50%, #FF8C00 100%);
      border: none;
      border-radius: var(--radius-lg);
      color: #1a1a1a;
      font-size: 1.15em;
      font-weight: 700;
      text-decoration: none;
      cursor: pointer;
      transition: all 0.3s ease;
      box-shadow: 0 4px 15px rgba(255, 165, 0, 0.4);
    }
    .premium-buy-btn:hover {
      transform: translateY(-3px);
      box-shadow: 0 8px 25px rgba(255, 165, 0, 0.5);
      background: linear-gradient(135deg, #FFE44D 0%, #FFB833 50%, #FFA000 100%);
    }
    .premium-buy-btn .material-icons {
      font-size: 1.4em;
    }
    .premium-buy-text {
      flex: 1;
      text-align: center;
    }
    .premium-buy-arrow {
      font-size: 1.3em;
      animation: bounceRight 1.5s infinite;
    }
    @keyframes bounceRight {
      0%, 100% { transform: translateX(0); }
      50% { transform: translateX(5px); }
    }
    .premium-buy-hint {
      margin-top: 14px;
      font-size: 0.85em;
      color: var(--text-muted);
    }

    /* Step4 两栏布局：左侧会员服务 + 右侧微信二维码 */
    .step4-main-grid {
      display: grid;
      grid-template-columns: 1fr 320px;
      gap: 20px;
      margin-bottom: 20px;
      align-items: stretch;
    }
    @media (max-width: 800px) {
      .step4-main-grid {
        grid-template-columns: 1fr;
      }
    }

    /* 微信技术支持二维码卡片 */
    .wechat-support-card {
      background: linear-gradient(160deg, #1a1814 0%, #25201a 40%, #1e1b15 100%);
      border: 2px solid rgba(251, 191, 36, 0.4);
      border-radius: var(--radius-xl);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      transition: border-color 0.3s ease, box-shadow 0.3s ease;
      animation: wechatCardBreathe 3s ease-in-out infinite;
    }
    @keyframes wechatCardBreathe {
      0%, 100% {
        border-color: rgba(251, 191, 36, 0.4);
        box-shadow: 0 0 20px rgba(251, 191, 36, 0.1), 0 4px 16px rgba(0, 0, 0, 0.2);
      }
      50% {
        border-color: rgba(251, 191, 36, 0.65);
        box-shadow: 0 0 32px rgba(251, 191, 36, 0.2), 0 4px 16px rgba(0, 0, 0, 0.2);
      }
    }
    .wechat-support-card:hover {
      border-color: rgba(251, 191, 36, 0.7);
      box-shadow: 0 4px 24px rgba(251, 191, 36, 0.2), 0 8px 32px rgba(0, 0, 0, 0.3);
      animation: none;
    }
    .wechat-support-header {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 14px 16px 10px;
      font-weight: 700;
      font-size: 0.95em;
      color: #fbbf24;
      letter-spacing: 0.5px;
      text-shadow: 0 0 12px rgba(251, 191, 36, 0.3);
    }
    .wechat-support-header .material-icons {
      font-size: 1.2em;
    }
    .wechat-support-body {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 4px 16px 20px;
      text-align: center;
    }
    .wechat-qr-wrapper {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      margin-bottom: 16px;
      position: relative;
      border-radius: 12px;
      border: 2px solid rgba(251, 191, 36, 0.3);
    }
    .wechat-qr-wrapper img {
      width: 100%;
      height: auto;
      object-fit: cover;
      border-radius: 10px;
      transform: scale(1.15);
      filter: sepia(0.15) saturate(1.1) brightness(1.05);
    }
    .wechat-qr-wrapper .qrcode-loading {
      font-size: 0.85em;
      color: var(--text-muted);
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .wechat-support-title {
      font-size: 1em;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.9);
      margin-bottom: 4px;
      line-height: 1.4;
    }
    .wechat-support-group {
      font-size: 0.9em;
      font-weight: 600;
      color: #fbbf24;
      margin-bottom: 6px;
    }
    .wechat-support-hint {
      font-size: 0.82em;
      color: rgba(251, 191, 36, 0.55);
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .wechat-support-hint::before {
      content: '';
      display: inline-block;
      width: 16px;
      height: 16px;
      background: url("data:image/svg+xml,%3Csvg viewBox='0 0 24 24' fill='%2307C160' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 01.213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 00.167-.054l1.903-1.114a.864.864 0 01.717-.098 10.16 10.16 0 002.837.403c.276 0 .543-.027.811-.05a6.127 6.127 0 01-.253-1.736c0-3.56 3.143-6.443 7.02-6.443.35 0 .69.027 1.027.07-.91-3.223-4.59-5.523-8.905-5.523zm-2.7 3.805a1.065 1.065 0 110 2.13 1.065 1.065 0 010-2.13zm5.41 0a1.065 1.065 0 110 2.13 1.065 1.065 0 010-2.13z'/%3E%3Cpath d='M23.697 14.531c0-3.244-3.09-5.875-6.902-5.875-3.81 0-6.9 2.631-6.9 5.875 0 3.246 3.09 5.876 6.9 5.876.756 0 1.49-.098 2.18-.31a.67.67 0 01.553.074l1.468.86a.26.26 0 00.129.042.226.226 0 00.224-.228c0-.056-.022-.11-.037-.164l-.301-1.142a.456.456 0 01.164-.514c1.416-1.044 2.322-2.597 2.322-4.493zm-9.126-1.012a.822.822 0 110-1.645.822.822 0 010 1.645zm4.449 0a.822.822 0 110-1.645.822.822 0 010 1.645z'/%3E%3C/svg%3E") no-repeat center/contain;
    }
    .wechat-qr-placeholder {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      color: var(--text-muted);
      font-size: 0.85em;
    }
    .wechat-qr-placeholder .material-icons {
      font-size: 2.5em;
      opacity: 0.3;
    }

    /* OEM 购买凭证二维码弹窗 */
    .oem-qrcode-modal-overlay {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0, 0, 0, 0.7);
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
      backdrop-filter: blur(4px);
    }
    .oem-qrcode-modal {
      background: var(--bg-secondary);
      border: 2px solid rgba(255, 215, 0, 0.4);
      border-radius: var(--radius-xl);
      padding: 32px;
      max-width: 380px;
      width: 90%;
      text-align: center;
      position: relative;
      box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
    }
    .oem-qrcode-modal-close {
      position: absolute;
      top: 12px; right: 16px;
      background: none;
      border: none;
      color: var(--text-muted);
      font-size: 1.6em;
      cursor: pointer;
      line-height: 1;
    }
    .oem-qrcode-modal-close:hover {
      color: var(--text-primary);
    }
    .oem-qrcode-modal-title {
      font-size: 1.2em;
      font-weight: 700;
      color: var(--text-primary);
      margin-bottom: 20px;
    }
    .oem-qrcode-modal-img {
      width: 240px;
      height: 240px;
      object-fit: contain;
      border-radius: 12px;
      border: 2px solid rgba(255, 215, 0, 0.3);
      margin-bottom: 16px;
    }
    .oem-qrcode-modal-placeholder {
      width: 240px;
      height: 240px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 16px;
      color: var(--text-muted);
      font-size: 0.9em;
      border: 2px dashed var(--border-default);
      border-radius: 12px;
    }
    .oem-qrcode-modal-hint {
      font-size: 0.88em;
      color: var(--text-secondary);
    }

    /* 旧版 qrcode-section 隐藏（已整合到新布局） */
    .qrcode-section { display: none !important; }


    /* 服务说明区域（保留兼容） */
    .service-intro {
      background: var(--bg-tertiary);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-lg);
      margin-bottom: 24px;
      overflow: hidden;
    }
    .service-intro-header {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 16px 20px;
      background: var(--bg-elevated);
      border-bottom: 1px solid var(--border-default);
    }
    .service-intro-icon {
      font-size: 1.3em;
    }
    .service-intro-title {
      font-size: 1.05em;
      font-weight: 600;
      color: var(--text-primary);
    }
    .service-intro-content {
      padding: 20px;
      font-size: 0.95em;
      color: var(--text-secondary);
      line-height: 1.7;
    }
    .service-intro-content p {
      margin: 0;
    }
    .service-list {
      list-style: none;
      padding: 0;
      margin: 12px 0 0 0;
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
    }
    @media (max-width: 600px) {
      .service-list {
        grid-template-columns: 1fr;
      }
    }
    .service-list li {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 14px;
      background: var(--bg-secondary);
      border-radius: var(--radius-md);
      font-size: 0.95em;
    }


    /* 验证成功动画 */
    .success-animation {
      display: none;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 48px 32px;
      animation: fadeIn 0.4s ease;
    }
    .success-animation.show { display: flex; }
    .success-checkmark {
      width: 80px;
      height: 80px;
      border-radius: 50%;
      background: var(--accent-green);
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 24px;
      animation: scaleIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    }
    .success-checkmark svg {
      width: 40px;
      height: 40px;
      stroke: white;
      stroke-width: 3;
      fill: none;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .success-checkmark svg path {
      stroke-dasharray: 100;
      stroke-dashoffset: 100;
      animation: checkmark 0.6s ease forwards 0.3s;
    }
    .success-title {
      font-size: 1.5em;
      font-weight: 600;
      margin-bottom: 8px;
      animation: fadeInUp 0.4s ease 0.2s backwards;
    }
    .success-desc {
      color: var(--text-secondary);
      margin-bottom: 8px;
      animation: fadeInUp 0.4s ease 0.3s backwards;
    }
    .success-expires {
      color: var(--accent-green);
      font-size: 0.9em;
      animation: fadeInUp 0.4s ease 0.4s backwards;
    }

    /* 撒花动画 */
    .confetti-container {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 1000;
      overflow: hidden;
    }
    .confetti {
      position: absolute;
      width: 10px;
      height: 10px;
      background: var(--accent-blue);
      animation: confetti 3s ease-out forwards;
    }

    /* 配置摘要 */
    .summary-list {
      list-style: none;
      padding: 0;
      margin: 24px 0;
    }
    .summary-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px;
      background: var(--bg-tertiary);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      margin-bottom: 8px;
    }
    .summary-item-icon {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: rgba(34, 197, 94, 0.1);
      color: var(--accent-green);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .summary-item-label {
      flex: 1;
      color: var(--text-secondary);
    }
    .summary-item-value {
      font-weight: 500;
      color: var(--text-primary);
      font-family: var(--font-mono);
      font-size: 0.9em;
    }

    /* 平台提示 */
    .platform-tips {
      background: var(--bg-tertiary);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      padding: 20px;
      margin: 24px 0;
    }
    .platform-tips-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
      font-weight: 500;
    }
    .platform-tips-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    .platform-tips-list li {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 8px 0;
      color: var(--text-secondary);
      font-size: 0.9em;
    }
    .platform-tips-list li::before {
      content: '•';
      color: var(--accent-blue);
    }
    .platform-tips-list code {
      background: var(--bg-elevated);
      padding: 2px 8px;
      border-radius: 4px;
      font-family: var(--font-mono);
      font-size: 0.9em;
      color: var(--accent-blue-light);
    }

    /* 测试连接区域 */
    .test-connection-section {
      background: var(--bg-tertiary);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-lg);
      margin: 24px 0;
      overflow: hidden;
    }
    .test-connection-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 16px 20px;
      background: var(--bg-elevated);
      border-bottom: 1px solid var(--border-default);
      font-weight: 500;
      color: var(--text-primary);
    }
    .test-connection-header .material-icons {
      color: var(--accent-blue);
    }
    .test-connection-content {
      padding: 20px;
    }
    .test-connection-result {
      margin-top: 16px;
      padding: 16px;
      border-radius: var(--radius-md);
      font-size: 0.9em;
    }
    .test-connection-result.success {
      background: rgba(34, 197, 94, 0.1);
      border: 1px solid rgba(34, 197, 94, 0.3);
      color: var(--accent-green);
    }
    .test-connection-result.error {
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: var(--accent-red);
    }
    .test-connection-result .result-icon {
      font-size: 1.5em;
      margin-bottom: 8px;
    }
    .test-connection-result .result-message {
      font-weight: 500;
      margin-bottom: 4px;
    }
    .test-connection-result .result-detail {
      color: var(--text-secondary);
      font-size: 0.9em;
    }

    /* 法律协议弹窗 */
    .legal-modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.8);
      backdrop-filter: blur(4px);
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .legal-modal {
      background: var(--bg-secondary);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-xl);
      max-width: 700px;
      width: 100%;
      max-height: 80vh;
      display: flex;
      flex-direction: column;
      box-shadow: var(--shadow-lg);
    }
    .legal-modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 20px 24px;
      border-bottom: 1px solid var(--border-default);
    }
    .legal-modal-header h3 {
      font-size: 1.2em;
      font-weight: 600;
      color: var(--text-primary);
    }
    .legal-modal-close {
      background: none;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      padding: 8px;
      border-radius: var(--radius-sm);
      transition: all 0.2s;
    }
    .legal-modal-close:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }
    .legal-modal-body {
      flex: 1;
      overflow-y: auto;
      padding: 24px;
      font-size: 0.9em;
      line-height: 1.8;
      color: var(--text-secondary);
    }
    .legal-modal-body h4 {
      color: var(--text-primary);
      font-size: 1.1em;
      margin: 20px 0 12px 0;
    }
    .legal-modal-body h4:first-child {
      margin-top: 0;
    }
    .legal-modal-body p {
      margin-bottom: 12px;
    }
    .legal-modal-body ul,
    .legal-modal-body ol {
      margin: 12px 0;
      padding-left: 24px;
    }
    .legal-modal-body li {
      margin-bottom: 8px;
    }
    .legal-modal-footer {
      padding: 16px 24px;
      border-top: 1px solid var(--border-default);
      text-align: center;
    }

    /* 完成页面大按钮 */
    .launch-button {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      width: 100%;
      padding: 20px 32px;
      background: var(--gradient-blue);
      border: none;
      border-radius: var(--radius-lg);
      color: white;
      font-size: 1.1em;
      font-weight: 600;
      font-family: var(--font-sans);
      cursor: pointer;
      transition: all 0.2s ease;
      margin-top: 32px;
    }
    .launch-button:hover:not(:disabled) {
      box-shadow: var(--shadow-glow);
      transform: translateY(-2px);
    }
    .launch-button:disabled {
      opacity: 0.7;
      cursor: not-allowed;
    }
    .launch-button .material-icons {
      font-size: 1.3em;
    }

    /* 模态框 */
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.8);
      backdrop-filter: blur(8px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      animation: fadeIn 0.2s ease;
    }
    .modal-overlay.hidden { display: none; }

    /* 豆包教程弹窗 */
    .doubao-tutorial-modal {
      background: var(--bg-secondary);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-xl);
      width: 90%;
      max-width: 800px;
      max-height: 85vh;
      display: flex;
      flex-direction: column;
      box-shadow: var(--shadow-lg);
      animation: scaleIn 0.3s ease;
    }
    .doubao-tutorial-header {
      padding: 20px 24px;
      border-bottom: 1px solid var(--border-default);
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
    }
    .doubao-tutorial-header h3 {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 1.2em;
      font-weight: 600;
      color: var(--accent-orange);
      margin: 0;
    }
    .doubao-tutorial-close {
      background: none;
      border: none;
      color: var(--text-tertiary);
      cursor: pointer;
      padding: 4px;
      border-radius: var(--radius-sm);
      transition: all 0.2s;
    }
    .doubao-tutorial-close:hover {
      background: var(--bg-tertiary);
      color: var(--text-primary);
    }
    .doubao-tutorial-body {
      padding: 24px;
      overflow-y: auto;
      flex: 1;
    }
    .doubao-tutorial-body h2 {
      font-size: 1.3em;
      color: var(--text-primary);
      margin: 24px 0 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--border-subtle);
    }
    .doubao-tutorial-body h2:first-child {
      margin-top: 0;
    }
    .doubao-tutorial-body h3 {
      font-size: 1.1em;
      color: var(--text-primary);
      margin: 16px 0 8px;
    }
    .doubao-tutorial-body p {
      margin: 8px 0;
      color: var(--text-secondary);
      line-height: 1.7;
    }
    .doubao-tutorial-body ul, .doubao-tutorial-body ol {
      margin: 8px 0;
      padding-left: 24px;
      color: var(--text-secondary);
    }
    .doubao-tutorial-body li {
      margin: 6px 0;
      line-height: 1.6;
    }
    .doubao-tutorial-body code {
      background: var(--bg-tertiary);
      padding: 2px 6px;
      border-radius: 4px;
      font-family: 'SF Mono', Monaco, Consolas, monospace;
      font-size: 0.9em;
      color: var(--accent-orange);
    }
    .doubao-tutorial-body pre {
      background: var(--bg-tertiary);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      padding: 12px 16px;
      overflow-x: auto;
      margin: 12px 0;
    }
    .doubao-tutorial-body pre code {
      background: none;
      padding: 0;
      color: var(--text-primary);
    }
    .doubao-tutorial-body table {
      width: 100%;
      border-collapse: collapse;
      margin: 12px 0;
    }
    .doubao-tutorial-body th, .doubao-tutorial-body td {
      border: 1px solid var(--border-default);
      padding: 10px 12px;
      text-align: left;
    }
    .doubao-tutorial-body th {
      background: var(--bg-tertiary);
      font-weight: 600;
      color: var(--text-primary);
    }
    .doubao-tutorial-body td {
      color: var(--text-secondary);
    }
    .doubao-tutorial-body .step-box {
      background: var(--bg-tertiary);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      padding: 16px;
      margin: 12px 0;
    }
    .doubao-tutorial-body .warning-box {
      background: rgba(234, 179, 8, 0.1);
      border: 1px solid rgba(234, 179, 8, 0.3);
      border-radius: var(--radius-md);
      padding: 16px;
      margin: 12px 0;
      color: var(--warning-color);
    }
    .doubao-tutorial-body .important-box {
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.3);
      border-radius: var(--radius-md);
      padding: 16px;
      margin: 12px 0;
    }
    .doubao-tutorial-body a {
      color: var(--accent-blue);
      text-decoration: none;
    }
    .doubao-tutorial-body a:hover {
      text-decoration: underline;
    }
    .doubao-tutorial-footer {
      padding: 16px 24px;
      border-top: 1px solid var(--border-default);
      display: flex;
      justify-content: flex-end;
      flex-shrink: 0;
    }
    .tutorial-help-btn {
      background: none;
      border: 1px solid var(--accent-orange);
      color: var(--accent-orange);
      padding: 4px 10px;
      border-radius: var(--radius-sm);
      cursor: pointer;
      font-size: 12px;
      margin-left: 8px;
      transition: all 0.2s;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .tutorial-help-btn:hover {
      background: var(--accent-orange);
      color: #000;
    }
    .tutorial-help-btn .material-icons {
      font-size: 14px;
    }

    .modal {
      background: var(--bg-secondary);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-xl);
      width: 90%;
      max-width: 600px;
      max-height: 80vh;
      display: flex;
      flex-direction: column;
      box-shadow: var(--shadow-lg);
      animation: scaleIn 0.3s ease;
    }
    .modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 20px 24px;
      border-bottom: 1px solid var(--border-default);
    }
    .modal-header h3 {
      font-size: 1.1em;
      font-weight: 600;
    }
    .modal-close {
      background: var(--bg-tertiary);
      border: 1px solid var(--border-default);
      color: var(--text-secondary);
      width: 32px;
      height: 32px;
      border-radius: 50%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .modal-close:hover { color: var(--text-primary); background: var(--bg-hover); }
    .modal-body {
      flex: 1;
      padding: 24px;
      overflow-y: auto;
    }
    .modal-footer {
      display: flex;
      gap: 12px;
      justify-content: flex-end;
      padding: 20px 24px;
      border-top: 1px solid var(--border-default);
    }

    /* 文件浏览器 */
    .path-input-group {
      display: flex;
      gap: 8px;
      margin-bottom: 16px;
    }
    .path-input-group input {
      flex: 1;
      padding: 10px 14px;
      background: var(--bg-tertiary);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      color: var(--text-primary);
      font-family: var(--font-mono);
      font-size: 0.9em;
    }
    .path-input-group input:focus {
      outline: none;
      border-color: var(--accent-blue);
    }
    .drives-bar {
      display: flex;
      gap: 8px;
      margin-bottom: 16px;
      flex-wrap: wrap;
    }
    .drive-btn {
      padding: 8px 14px;
      background: rgba(60, 131, 246, 0.1);
      border: 1px solid var(--border-accent);
      border-radius: var(--radius-sm);
      color: var(--accent-blue);
      cursor: pointer;
      font-family: var(--font-mono);
      font-size: 0.85em;
      font-weight: 500;
    }
    .drive-btn:hover { background: rgba(60, 131, 246, 0.2); }
    .folder-list {
      max-height: 300px;
      overflow-y: auto;
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      background: var(--bg-tertiary);
    }
    .folder-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      cursor: pointer;
      border-bottom: 1px solid var(--border-subtle);
      transition: background 0.2s ease;
    }
    .folder-item:last-child { border-bottom: none; }
    .folder-item:hover { background: var(--bg-hover); }
    .folder-item.selected { background: rgba(60, 131, 246, 0.1); }
    .folder-item-icon { font-size: 1.2em; }
    .folder-item-name { flex: 1; font-family: var(--font-mono); font-size: 0.9em; }
    .folder-empty {
      padding: 32px;
      text-align: center;
      color: var(--text-muted);
    }

    /* 免责声明 */
    .disclaimer {
      font-size: 0.8em;
      color: var(--text-muted);
      line-height: 1.6;
      padding: 16px;
      background: var(--bg-tertiary);
      border-radius: var(--radius-md);
      margin-top: 16px;
    }

    /* 快速决策指引 */
    .decision-guide {
      background: var(--bg-tertiary);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      padding: 16px;
      margin-top: 20px;
    }
    .decision-guide-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
      font-weight: 500;
      color: var(--text-secondary);
    }
    .decision-guide-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    .decision-guide-list li {
      padding: 8px 0;
      font-size: 0.9em;
      color: var(--text-secondary);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .decision-guide-list li strong {
      color: var(--accent-blue);
    }

    /* 隐藏类 */
    .hidden { display: none !important; }

    /* 响应式 */
    @media (max-width: 768px) {
      .header { padding: 0 16px; }
      .main-container { padding: 80px 16px 40px; }
      .card { padding: 24px 20px; }
      .stepper { gap: 0; padding: 0; }
      .step-connector { width: 30px; }
      .step-label { display: none; }
      .btn-group { flex-direction: column; }
      .btn-group .btn { width: 100%; }
      .option-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
${renderBodyContent(ctx, getPlatformTips)}
${renderScriptContent(ctx)}
</body>
</html>`;
}

/**
 * 发送 Setup 页面
 * @param res - HTTP 响应对象
 * @param gatewayToken - 可选的 gateway token
 */
export function serveSetupPage(res: ServerResponse, gatewayToken?: string): void {
  const html = generateSetupPageHtml(gatewayToken);
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.end(html);
}
