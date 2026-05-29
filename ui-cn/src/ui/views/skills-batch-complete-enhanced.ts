/**
 * Skills Batch Complete - Enhanced Version
 * 技能批量安装完成页 - 增强版
 *
 * 基于您的精美 skills-complete.html 设计，融合官方所有功能
 * - 成功动画（环形扩散 + 彩纸）
 * - 动态技能列表
 * - 计数动画
 * - 分类展示
 */

import { html, nothing, type TemplateResult } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import type { SkillsBatchState } from "../controllers/skills-batch.js";
import { formatBytes } from "../controllers/skills-batch.js";
import {
  ringPulseKeyframes,
  fadeSlideUpKeyframes,
  bounceDownKeyframes,
  ambientPulseKeyframes,
} from "./skills-batch-animations.js";

// 技能数据结构
interface SkillCategory {
  category: string;
  emoji: string;
  code: string;
  skills: Array<{
    icon: string;
    name: string;
    desc: string;
  }>;
}

// 技能友好名称和描述映射
const SKILL_META: Record<string, { name: string; desc: string; category: string }> = {
  weather: { name: "天气查询", desc: "实时<hl>天气</hl>预报查询", category: "productivity" },
  summarize: {
    name: "网页摘要",
    desc: "用AI一键<hl>摘要</hl>网页、视频和播客内容",
    category: "productivity",
  },
  oracle: { name: "Oracle", desc: "代码发给第二个AI做<hl>交叉审查</hl>", category: "productivity" },
  himalaya: {
    name: "邮件管理",
    desc: "管理 <hl>Gmail</hl>、<hl>Calendar</hl>、Drive",
    category: "productivity",
  },
  mcporter: { name: "MCP工具", desc: "调用 <hl>MCP 服务器</hl>工具，调试和集成", category: "dev" },
  openhue: { name: "智能灯光", desc: "控制飞利浦 <hl>Hue 智能灯光</hl>和场景", category: "iot" },
  "openai-whisper": { name: "语音转文字", desc: "Whisper AI<hl>语音识别</hl>", category: "media" },
  peekaboo: {
    name: "屏幕截图",
    desc: "macOS <hl>UI自动化</hl>：截图、窗口、菜单",
    category: "platform",
  },
  github: { name: "GitHub 操作", desc: "管理 <hl>GitHub</hl> 仓库和 PR", category: "dev" },
  "apple-notes": { name: "Apple 备忘录", desc: "管理 Apple <hl>备忘录</hl>", category: "platform" },
  "apple-reminders": {
    name: "Apple 提醒事项",
    desc: "管理 Apple <hl>提醒事项</hl>",
    category: "platform",
  },
  slack: { name: "Slack 消息", desc: "发送和接收 <hl>Slack</hl> 消息", category: "dev" },
  "sherpa-onnx-tts": {
    name: "语音合成",
    desc: "AI<hl>语音合成</hl>，文字转语音",
    category: "media",
  },
  camsnap: { name: "摄像头截图", desc: "网络摄像头<hl>画面抓取</hl>、录制", category: "media" },
  goplaces: { name: "附近搜索", desc: "查询 <hl>Google 地图</hl>商户信息", category: "iot" },
  // 更多技能...
};

export function renderSkillsBatchCompleteEnhanced(props: {
  batchState: SkillsBatchState;
  onStartChat: () => void;
  onDismiss: () => void;
}): TemplateResult {
  const { batchResult } = props.batchState;
  if (!batchResult) return html`${nothing}`;

  const succeededSkills = batchResult.succeeded;
  const totalCount = succeededSkills.length;
  const totalSize = 103; // 临时值，应从实际数据计算
  const totalTime = Math.round(batchResult.durationMs / 1000);

  // 按分类分组技能
  const skillsByCategory = new Map<string, any[]>();
  succeededSkills.forEach((skillName) => {
    const meta = SKILL_META[skillName];
    if (meta) {
      const cat = meta.category || "other";
      if (!skillsByCategory.has(cat)) skillsByCategory.set(cat, []);
      skillsByCategory.get(cat)!.push({
        icon: getSkillIcon(skillName),
        name: meta.name,
        desc: meta.desc,
      });
    }
  });

  // 分类数据
  const categories: SkillCategory[] = [
    {
      category: "生产力",
      emoji: "🚀",
      code: "cat-productivity",
      skills: skillsByCategory.get("productivity") || [],
    },
    {
      category: "开发工具",
      emoji: "🛠",
      code: "cat-dev",
      skills: skillsByCategory.get("dev") || [],
    },
    {
      category: "平台专属",
      emoji: "💻",
      code: "cat-platform",
      skills: skillsByCategory.get("platform") || [],
    },
    {
      category: "音频 & 媒体",
      emoji: "🎧",
      code: "cat-media",
      skills: skillsByCategory.get("media") || [],
    },
    {
      category: "智能硬件 & 服务",
      emoji: "🌐",
      code: "cat-iot-service",
      skills: skillsByCategory.get("iot") || [],
    },
  ].filter((cat) => cat.skills.length > 0);

  // 技能图标映射
  function getSkillIcon(name: string): string {
    const icons: Record<string, string> = {
      weather: "🌤",
      summarize: "📝",
      oracle: "🔮",
      himalaya: "📨",
      mcporter: "🔌",
      openhue: "💡",
      "openai-whisper": "🗣️",
      peekaboo: "👁️",
      github: "🐙",
      "apple-notes": "📔",
      "apple-reminders": "✅",
      slack: "💬",
      "sherpa-onnx-tts": "🎙",
      camsnap: "📷",
      goplaces: "📍",
    };
    return icons[name] || "📦";
  }

  // 启动彩纸动画（在组件渲染后）
  setTimeout(() => {
    const canvas = document.getElementById("confetti-canvas") as HTMLCanvasElement;
    if (canvas && typeof window !== "undefined") {
      import("./skills-batch-animations.js").then(({ launchConfetti }) => {
        launchConfetti(canvas);
      });
    }
  }, 1000);

  // 启动计数动画
  setTimeout(() => {
    const countSkillsEl = document.getElementById("count-skills");
    const countSizeEl = document.getElementById("count-size");
    const countTimeEl = document.getElementById("count-time");
    if (countSkillsEl && countSizeEl && countTimeEl && typeof window !== "undefined") {
      import("./skills-batch-animations.js").then(({ countUp }) => {
        countUp(countSkillsEl, totalCount, 1200);
        countUp(countSizeEl, totalSize, 1000);
        countUp(countTimeEl, totalTime, 800);
      });
    }
  }, 1200);

  return html`
    <!-- 氛围背景 -->
    <div class="ambient"></div>
    <div class="noise"></div>
    <canvas id="confetti-canvas"></canvas>

    <div class="container">

      <!-- 成功头部 -->
      <div class="header">
        <div class="success-icon">
          <div class="success-ring"></div>
          <div class="success-ring-pulse"></div>
          <div class="success-check">⚡</div>
        </div>
        <h1>超能力已就绪</h1>
        <p class="subtitle">所有 Skills 工具已下载并安装完成，您的 AI 助手现在拥有以下能力</p>

        <div class="stats-bar">
          <div class="stat-item">
            <span class="stat-value" id="count-skills">0</span>
            <span class="stat-label">个超能力</span>
          </div>
          <div class="stat-sep"></div>
          <div class="stat-item">
            <span class="stat-value" id="count-size">0</span>
            <span class="stat-label">MB 已安装</span>
          </div>
          <div class="stat-sep"></div>
          <div class="stat-item">
            <span class="stat-value" id="count-time">0</span>
            <span class="stat-label">秒完成</span>
          </div>
        </div>
      </div>

      <!-- 滚动提示 -->
      <div class="scroll-hint">
        <span>向下滑动查看全部能力 <span class="scroll-arrow">↓</span></span>
      </div>

      <!-- 技能列表 -->
      <div class="skills-list">
        ${categories.map(
          (cat, index) => html`
          <div class="category ${cat.code}" style="animation-delay: ${1.5 + index * 0.12}s">
            <div class="category-header">
              <span class="category-emoji">${cat.emoji}</span>
              <span class="category-label">${cat.category}</span>
              <div class="category-line"></div>
              <span class="category-count">${cat.skills.length}</span>
            </div>
            <div class="skills-grid">
              ${cat.skills.map(
                (skill) => html`
                <div class="skill-card">
                  <div class="skill-icon">${skill.icon}</div>
                  <div class="skill-info">
                    <div class="skill-name">${skill.name}</div>
                    <div class="skill-desc">${unsafeHTML(skill.desc.replace(/<hl>/g, '<span class="hl">').replace(/<\/hl>/g, "</span>"))}</div>
                  </div>
                  <div class="skill-check">✓</div>
                </div>
              `,
              )}
            </div>
          </div>
        `,
        )}
      </div>

      <!-- 使用提示 -->
      <div class="usage-hint">
        <div class="usage-hint-title">💡 如何使用</div>
        <div class="usage-hint-body">
          在对话中直接说出你的需求即可。例如输入 <code>帮我摘要这个网页</code>，
          AI 会自动调用 summarize 技能。你也可以输入 <code>/skills</code> 查看所有可用技能。
        </div>
      </div>

    </div>

    <!-- 底部 CTA -->
    <div class="cta-area">
      <button @click=${props.onStartChat} class="cta-btn">
        开始对话
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M5 12h14M12 5l7 7-7 7"/>
        </svg>
      </button>
      <button @click=${props.onDismiss} class="cta-skip">稍后再看</button>
    </div>

    <style>
      ${ringPulseKeyframes}
      ${fadeSlideUpKeyframes}
      ${bounceDownKeyframes}
      ${ambientPulseKeyframes}

      /* 氛围背景 */
      .ambient {
        position: fixed; inset: 0; pointer-events: none; z-index: 0;
        overflow: hidden;
      }
      .ambient::before {
        content: '';
        position: absolute;
        width: 600px; height: 600px;
        top: -200px; left: 50%;
        transform: translateX(-50%);
        background: radial-gradient(circle, rgba(0,229,255,0.06) 0%, transparent 70%);
        animation: ambientPulse 8s ease-in-out infinite;
      }

      /* 噪点纹理 */
      .noise {
        position: fixed; inset: 0; pointer-events: none; z-index: 1;
        opacity: 0.02;
        background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
        background-size: 128px;
      }

      /* 彩纸画布 */
      #confetti-canvas {
        position: fixed; inset: 0; pointer-events: none; z-index: 50;
      }

      /* 主容器 */
      .container {
        position: relative; z-index: 2;
        max-width: 520px;
        margin: 0 auto;
        padding: 0 20px 140px;
      }

      /* 成功头部 */
      .header {
        text-align: center;
        padding: 48px 0 32px;
        opacity: 0;
        animation: fadeSlideUp 0.8s ease-out 0.2s forwards;
      }

      .success-icon {
        width: 72px; height: 72px;
        margin: 0 auto 20px;
        position: relative;
      }
      .success-ring {
        width: 72px; height: 72px;
        border-radius: 50%;
        border: 2px solid #00e5ff;
        opacity: 0;
        animation: ringExpand 0.6s ease-out 0.5s forwards;
        position: absolute; inset: 0;
        box-shadow: 0 0 40px rgba(0,229,255,0.15), inset 0 0 20px rgba(0,229,255,0.06);
      }
      .success-ring-pulse {
        width: 72px; height: 72px;
        border-radius: 50%;
        border: 1.5px solid rgba(0,229,255,0.3);
        position: absolute; inset: 0;
        opacity: 0;
        animation: ringPulseOut 1.2s ease-out 0.8s forwards;
      }
      .success-check {
        position: absolute; inset: 0;
        display: flex; align-items: center; justify-content: center;
        font-size: 32px;
        opacity: 0;
        animation: checkPop 0.5s cubic-bezier(0.34,1.56,0.64,1) 0.9s forwards;
      }

      .header h1 {
        font-size: 26px;
        font-weight: 900;
        letter-spacing: -0.5px;
        line-height: 1.3;
        margin-bottom: 8px;
        background: linear-gradient(135deg, #ffffff 30%, #00e5ff 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }

      .header .subtitle {
        font-size: 14px;
        color: #7a7f96;
        line-height: 1.6;
        max-width: 360px;
        margin: 0 auto;
      }

      /* 统计栏 */
      .stats-bar {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
        margin-top: 20px;
        opacity: 0;
        animation: fadeSlideUp 0.5s ease-out 1.1s forwards;
      }
      .stat-item {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
      }
      .stat-value {
        font-family: 'JetBrains Mono', monospace;
        font-size: 22px;
        font-weight: 600;
        color: #00e5ff;
        line-height: 1;
      }
      .stat-label {
        font-size: 11px;
        color: #4a4e63;
        letter-spacing: 0.5px;
      }
      .stat-sep {
        width: 1px;
        height: 28px;
        background: rgba(255,255,255,0.05);
        margin: 0 4px;
      }

      /* 滚动提示 */
      .scroll-hint {
        text-align: center;
        margin-top: 24px;
        opacity: 0;
        animation: fadeSlideUp 0.5s ease-out 1.4s forwards;
      }
      .scroll-hint span {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        color: #4a4e63;
        padding: 6px 14px;
        border: 1px solid rgba(255,255,255,0.05);
        border-radius: 100px;
        background: rgba(14,16,23,0.8);
      }
      .scroll-arrow {
        display: inline-block;
        animation: bounceDown 1.5s ease-in-out infinite;
      }

      /* 技能列表 */
      .skills-list {
        margin-top: 32px;
      }

      .category {
        margin-bottom: 20px;
        opacity: 0;
        animation: fadeSlideUp 0.5s ease-out forwards;
      }

      .category-header {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 10px;
        padding-left: 2px;
      }
      .category-emoji { font-size: 14px; }
      .category-label {
        font-size: 13px;
        font-weight: 600;
        color: #7a7f96;
      }
      .category-line {
        flex: 1;
        height: 1px;
        background: linear-gradient(to right, rgba(255,255,255,0.05), transparent);
      }
      .category-count {
        font-size: 11px;
        font-family: 'JetBrains Mono', monospace;
        color: #4a4e63;
      }

      /* 技能卡片 */
      .skills-grid {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .skill-card {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 14px;
        background: #0e1017;
        border: 1px solid rgba(255,255,255,0.05);
        border-radius: 12px;
        transition: all 0.25s ease;
      }
      .skill-card:hover {
        border-color: rgba(255,255,255,0.09);
        background: #14161f;
      }

      .skill-icon {
        width: 36px; height: 36px;
        display: flex; align-items: center; justify-content: center;
        border-radius: 8px;
        font-size: 18px;
        flex-shrink: 0;
      }

      .cat-productivity .skill-card .skill-icon { background: rgba(0,229,255,0.08); }
      .cat-dev .skill-card .skill-icon { background: rgba(179,136,255,0.08); }
      .cat-platform .skill-card .skill-icon { background: rgba(68,138,255,0.08); }
      .cat-media .skill-card .skill-icon { background: rgba(255,171,0,0.08); }
      .cat-iot-service .skill-card .skill-icon { background: rgba(29,233,182,0.08); }

      .skill-info { flex: 1; min-width: 0; }

      .skill-name {
        font-weight: 700;
        font-size: 13.5px;
        color: #e8eaf0;
        letter-spacing: -0.2px;
        margin-bottom: 1px;
        font-family: 'Space Grotesk', 'Noto Sans SC', sans-serif;
      }

      .skill-desc {
        font-size: 12.5px;
        color: #7a7f96;
        line-height: 1.5;
      }
      .skill-desc .hl {
        color: #00e5ff;
        font-weight: 500;
      }

      .skill-check {
        flex-shrink: 0;
        width: 18px; height: 18px;
        display: flex; align-items: center; justify-content: center;
        border-radius: 50%;
        background: rgba(0,230,118,0.1);
        color: #00e676;
        font-size: 11px;
        font-weight: 700;
      }

      /* 使用提示 */
      .usage-hint {
        margin-top: 36px;
        padding: 16px 18px;
        background: #0e1017;
        border: 1px solid rgba(255,255,255,0.05);
        border-radius: 12px;
        border-left: 3px solid #00e5ff;
        opacity: 0;
        animation: fadeSlideUp 0.5s ease-out forwards;
      }
      .usage-hint-title {
        font-size: 13px;
        font-weight: 600;
        color: #e8eaf0;
        margin-bottom: 6px;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .usage-hint-body {
        font-size: 12.5px;
        color: #7a7f96;
        line-height: 1.6;
      }
      .usage-hint-body code {
        display: inline-block;
        background: rgba(0,229,255,0.08);
        color: #00e5ff;
        padding: 1px 6px;
        border-radius: 4px;
        font-family: 'JetBrains Mono', monospace;
        font-size: 11.5px;
      }

      /* 底部 CTA */
      .cta-area {
        position: fixed;
        bottom: 0; left: 0; right: 0;
        z-index: 100;
        padding: 16px 24px 28px;
        background: linear-gradient(to top, #07080d 50%, transparent);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        opacity: 0;
        animation: fadeSlideUp 0.5s ease-out 2.2s forwards;
      }

      .cta-btn {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 13px 44px;
        background: linear-gradient(135deg, #00e5ff, #00b8d4);
        color: #07080d;
        font-family: 'Noto Sans SC', sans-serif;
        font-size: 15px;
        font-weight: 700;
        border: none;
        border-radius: 100px;
        cursor: pointer;
        letter-spacing: 0.3px;
        transition: all 0.3s ease;
        box-shadow: 0 4px 20px rgba(0,229,255,0.25);
        position: relative;
        overflow: hidden;
      }
      .cta-btn::after {
        content: '';
        position: absolute; inset: 0;
        background: linear-gradient(135deg, transparent 0%, rgba(255,255,255,0.18) 50%, transparent 100%);
        transform: translateX(-100%);
        transition: transform 0.5s ease;
      }
      .cta-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 28px rgba(0,229,255,0.35), 0 0 0 3px rgba(0,229,255,0.1);
      }
      .cta-btn:hover::after { transform: translateX(100%); }
      .cta-btn:active { transform: translateY(0); }

      .cta-btn svg {
        width: 16px; height: 16px;
        transition: transform 0.3s ease;
      }
      .cta-btn:hover svg { transform: translateX(3px); }

      .cta-skip {
        font-size: 12px;
        color: #4a4e63;
        background: none;
        border: none;
        cursor: pointer;
        padding: 4px 12px;
        transition: color 0.2s ease;
      }
      .cta-skip:hover { color: #7a7f96; }

      /* 响应式 */
      @media (max-width: 480px) {
        .container { padding: 0 16px 140px; }
        .header { padding: 36px 0 28px; }
        .header h1 { font-size: 22px; }
        .stat-value { font-size: 18px; }
        .skill-card { padding: 10px 12px; gap: 10px; }
        .skill-icon { width: 32px; height: 32px; font-size: 16px; }
        .skill-name { font-size: 13px; }
        .skill-desc { font-size: 12px; }
        .cta-btn { padding: 12px 36px; font-size: 14px; }
      }
    </style>
  `;
}
