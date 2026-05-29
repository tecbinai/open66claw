/**
 * Skills Batch Banner - Enhanced Version
 * 技能批量安装横幅 - 增强版
 *
 * 基于您的精美 1-chat-banner.html 设计，融合官方所有功能
 * - 动态技能数据绑定
 * - 完整交互回调
 * - 国际化支持
 * - 霓虹青色主题
 */

import { html, nothing, type TemplateResult } from "lit";
import type { BatchCheckResult } from "../controllers/skills-batch.js";
import { formatBytes, formatEstimate } from "../controllers/skills-batch.js";
import { t } from "../i18n/index.js";
import { bannerInKeyframes } from "./skills-batch-animations.js";

// 技能友好名称映射（中文）
const SKILL_FRIENDLY_NAMES: Record<string, string> = {
  // Core & recommended
  weather: "天气查询",
  summarize: "网页摘要",
  github: "GitHub 操作",
  oracle: "多模型对比",
  gog: "搜索引擎",
  sag: "搜索聚合",
  himalaya: "邮件管理",
  "1password": "密码管理",
  camsnap: "摄像头截图",
  "nano-pdf": "PDF 阅读",
  "openai-whisper": "语音转文字",
  "openai-image-gen": "AI 绘图",
  canvas: "画布工具",
  songsee: "音乐识别",
  openhue: "智能灯光",
  goplaces: "附近搜索",
  "coding-agent": "编程助手",
  gemini: "Gemini AI",
  obsidian: "笔记管理",
  "video-frames": "视频处理",
  mcporter: "MCP 工具",
  "apple-notes": "Apple 备忘录",
  "apple-reminders": "Apple 提醒事项",
  slack: "Slack 消息",
  trello: "Trello 看板",
  "sherpa-onnx-tts": "语音合成",
  "voice-call": "语音通话",
  bluebubbles: "iMessage 消息",
  // 更多技能...省略部分以保持代码简洁
};

export function renderSkillsBatchBannerEnhanced(props: {
  missingSkills: BatchCheckResult["missing"];
  totalSizeBytes: number;
  estimatedSeconds: number;
  onInstall: () => void;
  onDismiss: () => void;
  onClose: () => void;
}): TemplateResult {
  const count = props.missingSkills.length;
  if (count === 0) return html`${nothing}`;

  const sizeLabel = formatBytes(props.totalSizeBytes);
  const timeLabel = formatEstimate(props.estimatedSeconds);

  // 获取技能显示名称
  const getSkillName = (skill: (typeof props.missingSkills)[number]) => {
    return SKILL_FRIENDLY_NAMES[skill.name] || skill.name;
  };

  return html`
    <div class="skills-banner-enhanced">
      <!-- 顶部霓虹线条 -->
      <div class="banner-accent"></div>

      <!-- 关闭按钮 -->
      <button @click=${props.onClose} class="banner-close" title="${t("common.close")}">✕</button>

      <!-- 图标 -->
      <div class="banner-icon">⚡</div>

      <!-- 标题和描述 -->
      <div class="banner-header">
        <h3 class="banner-title">发现 ${count} 个 AI 超能力可安装</h3>
        <p class="banner-subtitle">安装后可解锁邮件管理、网页摘要、语音合成、智能家居控制等能力</p>
      </div>

      <!-- 统计信息 -->
      <div class="banner-stats">
        <div class="banner-stat">
          <span class="banner-stat-value">${count}</span>
          <span class="banner-stat-label">个技能</span>
        </div>
        <div class="banner-stat">
          <span class="banner-stat-value">${sizeLabel}</span>
          <span class="banner-stat-label">预估大小</span>
        </div>
        <div class="banner-stat">
          <span class="banner-stat-value">${timeLabel}</span>
          <span class="banner-stat-label">预估耗时</span>
        </div>
      </div>

      <!-- 技能预览药丸 -->
      <div class="banner-skills-preview">
        ${props.missingSkills.slice(0, 5).map(
          (skill) => html`
          <span class="skill-pill">
            <span class="skill-pill-emoji">${skill.icon || "📦"}</span>
            ${getSkillName(skill)}
          </span>
        `,
        )}
        ${
          count > 5
            ? html`
          <span class="skill-pill skill-pill-more">+${count - 5} 个更多...</span>
        `
            : nothing
        }
      </div>

      <!-- 操作按钮 -->
      <div class="banner-actions">
        <button @click=${props.onInstall} class="btn-primary">
          <span>⚡</span> 立即安装
        </button>
        <button @click=${props.onDismiss} class="btn-secondary">稍后</button>
      </div>
    </div>

    <style>
      ${bannerInKeyframes}

      .skills-banner-enhanced {
        position: relative;
        max-width: 680px;
        margin: 32px auto 16px;
        background: #0e1017;
        border: 1px solid rgba(255,255,255,0.05);
        border-radius: 14px;
        padding: 18px;
        overflow: hidden;
        animation: bannerSlideIn 0.5s ease-out;
        box-shadow: 0 12px 28px rgba(0,0,0,0.2);
      }

      /* 顶部霓虹线条 */
      .banner-accent {
        position: absolute;
        top: 0; left: 0; right: 0;
        height: 2px;
        background: linear-gradient(90deg, #00e5ff 0%, transparent 80%);
      }

      /* 关闭按钮 */
      .banner-close {
        position: absolute;
        top: 12px; right: 12px;
        width: 24px; height: 24px;
        display: flex; align-items: center; justify-content: center;
        color: #4a4e63;
        cursor: pointer;
        border-radius: 6px;
        font-size: 14px;
        transition: background 0.2s, color 0.2s;
        border: none; background: none;
      }
      .banner-close:hover {
        background: rgba(255,255,255,0.05);
        color: #7a7f96;
      }

      /* 图标 */
      .banner-icon {
        width: 40px; height: 40px;
        border-radius: 10px;
        background: rgba(0,229,255,0.08);
        display: flex; align-items: center; justify-content: center;
        font-size: 20px;
        margin: 0 auto 14px;
        box-shadow: 0 0 40px rgba(0,229,255,0.15);
      }

      /* 标题区域 */
      .banner-header {
        text-align: center;
        margin-bottom: 14px;
      }
      .banner-title {
        font-size: 15px;
        font-weight: 700;
        margin-bottom: 3px;
        color: #e8eaf0;
      }
      .banner-subtitle {
        font-size: 12.5px;
        color: #7a7f96;
        line-height: 1.5;
      }

      /* 统计卡片 */
      .banner-stats {
        display: flex;
        gap: 16px;
        margin-bottom: 14px;
        padding: 10px 14px;
        background: rgba(0,0,0,0.2);
        border-radius: 10px;
      }
      .banner-stat {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1px;
      }
      .banner-stat-value {
        font-family: 'JetBrains Mono', monospace;
        font-size: 16px;
        font-weight: 600;
        color: #00e5ff;
      }
      .banner-stat-label {
        font-size: 11px;
        color: #4a4e63;
      }

      /* 技能预览药丸 */
      .banner-skills-preview {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
        justify-content: center;
        margin-bottom: 14px;
      }
      .skill-pill {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 4px 10px;
        background: rgba(255,255,255,0.04);
        border-radius: 100px;
        font-size: 11px;
        color: #7a7f96;
      }
      .skill-pill-emoji {
        font-size: 12px;
      }
      .skill-pill-more {
        color: #4a4e63;
        font-style: italic;
      }

      /* 操作按钮 */
      .banner-actions {
        display: flex;
        gap: 10px;
      }
      .btn-primary {
        flex: 1;
        padding: 11px 0;
        background: linear-gradient(135deg, #00e5ff, #00b8d4);
        color: #000;
        font-family: 'Noto Sans SC', sans-serif;
        font-size: 14px;
        font-weight: 700;
        border: none;
        border-radius: 10px;
        cursor: pointer;
        transition: all 0.2s ease;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        box-shadow: 0 2px 12px rgba(0,229,255,0.25);
      }
      .btn-primary:hover {
        filter: brightness(1.1);
        transform: translateY(-1px);
        box-shadow: 0 4px 16px rgba(0,229,255,0.35);
      }
      .btn-primary:active {
        transform: translateY(0);
      }

      .btn-secondary {
        padding: 11px 20px;
        background: none;
        border: 1px solid rgba(255,255,255,0.05);
        color: #7a7f96;
        font-family: 'Noto Sans SC', sans-serif;
        font-size: 13px;
        border-radius: 10px;
        cursor: pointer;
        transition: all 0.2s ease;
      }
      .btn-secondary:hover {
        border-color: rgba(255,255,255,0.1);
        color: #e8eaf0;
      }

      /* 响应式 */
      @media (max-width: 480px) {
        .skills-banner-enhanced {
          margin: 16px;
          padding: 16px;
        }
        .banner-stats {
          flex-direction: column;
          gap: 12px;
        }
      }
    </style>
  `;
}
