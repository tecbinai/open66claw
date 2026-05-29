/**
 * Skills Batch Confirm Modal - Enhanced Version
 * 技能批量安装确认对话框 - 增强版
 *
 * 基于您的精美 2-download-confirm.html 设计，融合官方所有功能
 * - 三层技能分类（Core/Recommended/Optional）
 * - 复选框选择逻辑
 * - 磁盘空间检查
 * - 国内镜像提示
 */

import { html, nothing, type TemplateResult } from "lit";
import type { BatchCheckResult } from "../controllers/skills-batch.js";
import { formatBytes, formatEstimate } from "../controllers/skills-batch.js";
import { t } from "../i18n/index.js";
import { modalInKeyframes } from "./skills-batch-animations.js";

type MissingSkill = BatchCheckResult["missing"][number];
type InstalledSkill = NonNullable<BatchCheckResult["installed"]>[number];

// 技能友好名称映射
const SKILL_FRIENDLY_NAMES: Record<string, string> = {
  weather: "天气查询",
  summarize: "网页摘要",
  github: "GitHub 操作",
  oracle: "多模型对比",
  gog: "搜索引擎",
  himalaya: "邮件管理",
  "1password": "密码管理",
  camsnap: "摄像头截图",
  "nano-pdf": "PDF 阅读",
  "openai-whisper": "语音转文字",
  "openai-image-gen": "AI 绘图",
  openhue: "智能灯光",
  goplaces: "附近搜索",
  gemini: "Gemini AI",
  obsidian: "笔记管理",
  mcporter: "MCP 工具",
  "apple-notes": "Apple 备忘录",
  "apple-reminders": "Apple 提醒事项",
  slack: "Slack 消息",
  "sherpa-onnx-tts": "语音合成",
  "voice-call": "语音通话",
  // 更多技能...
};

// 分类图标映射
const CATEGORY_ICONS: Record<string, string> = {
  productivity: "🚀",
  development: "🛠",
  platform: "💻",
  media: "🎧",
  iot: "🌐",
};

// 按层级分组
function groupByTier(skills: MissingSkill[]): Map<string, MissingSkill[]> {
  const order: string[] = ["core", "recommended", "optional"];
  const g = new Map<string, MissingSkill[]>();
  for (const tier of order) g.set(tier, []);
  for (const s of skills) {
    const tier = s.tier ?? "optional";
    const list = g.get(tier) ?? [];
    list.push(s);
    g.set(tier, list);
  }
  // 移除空层级
  for (const tier of order) {
    if (g.get(tier)!.length === 0) g.delete(tier);
  }
  return g;
}

// 按分类分组
function groupByCategory(skills: MissingSkill[]): Map<string, MissingSkill[]> {
  const g = new Map<string, MissingSkill[]>();
  for (const s of skills) {
    const cat = s.category || "other";
    const list = g.get(cat) ?? [];
    list.push(s);
    g.set(cat, list);
  }
  return g;
}

export function renderSkillsBatchConfirmEnhanced(props: {
  checkResult: BatchCheckResult;
  onConfirm: (selectedSkills: string[]) => void;
  onCancel: () => void;
}): TemplateResult {
  const { checkResult } = props;
  const count = checkResult.missing.length;
  const sizeLabel = formatBytes(checkResult.total_size_bytes);
  const timeLabel = formatEstimate(checkResult.estimated_seconds);
  const diskLabel = formatBytes(checkResult.disk_available_bytes);
  const diskOk = checkResult.disk_ok;

  const tierGroups = groupByTier(checkResult.missing);
  const categoryGroups = groupByCategory(checkResult.missing);

  const handleConfirm = (e: Event) => {
    const modal = (e.target as HTMLElement).closest("[data-batch-confirm]");
    if (!modal) return;
    const boxes = modal.querySelectorAll<HTMLInputElement>(
      "input[name='batch-skill']:checked:not([disabled])",
    );
    const selected = Array.from(boxes).map((cb) => cb.value);
    if (selected.length > 0) props.onConfirm(selected);
  };

  // 获取技能显示名称
  const getSkillName = (skill: MissingSkill) => {
    return SKILL_FRIENDLY_NAMES[skill.name] || skill.name;
  };

  return html`
    <!-- 背景遮罩 -->
    <div data-batch-confirm class="modal-overlay">
      <div class="modal">

        <!-- 头部 -->
        <div class="modal-header">
          <div class="modal-icon">⚡</div>
          <h2>安装 AI 超能力</h2>
          <p>即将下载并安装以下工具，让你的助手获得更多技能</p>
        </div>

        <!-- 统计信息 2x2 网格 -->
        <div class="modal-details">
          <div class="detail-grid">
            <div class="detail-card">
              <div class="detail-card-label">技能数量</div>
              <div class="detail-card-value">${count} <span class="unit">个</span></div>
            </div>
            <div class="detail-card">
              <div class="detail-card-label">下载大小</div>
              <div class="detail-card-value">${sizeLabel.split(" ")[0]} <span class="unit">${sizeLabel.split(" ")[1]}</span></div>
            </div>
            <div class="detail-card">
              <div class="detail-card-label">预估耗时</div>
              <div class="detail-card-value">${timeLabel.replace("~", "")} <span class="unit"></span></div>
            </div>
            <div class="detail-card">
              <div class="detail-card-label">并发线程</div>
              <div class="detail-card-value">3 <span class="unit">线程</span></div>
            </div>
          </div>
        </div>

        <!-- 分类展示 -->
        <div class="categories-section">
          <div class="categories-title">安装内容</div>
          ${Array.from(categoryGroups.entries())
            .slice(0, 5)
            .map(
              ([cat, skills]) => html`
            <div class="category-row">
              <span class="cat-emoji">${CATEGORY_ICONS[cat] || "📦"}</span>
              <span class="cat-name">${
                cat === "productivity"
                  ? "生产力工具"
                  : cat === "development"
                    ? "开发工具"
                    : cat === "platform"
                      ? "平台专属"
                      : cat === "media"
                        ? "音频 & 媒体"
                        : cat === "iot"
                          ? "智能硬件 & 服务"
                          : cat
              }</span>
              <span class="cat-count">${skills.length}</span>
            </div>
          `,
            )}
        </div>

        <!-- 国内镜像提示 -->
        <div class="mirror-info">
          <span class="mirror-info-icon">🇨🇳</span>
          已启用国内加速镜像 <span>· 自动切换最快源</span>
        </div>

        <!-- 磁盘空间检查 -->
        <div class="storage-check">
          <span>磁盘空间检查</span>
          ${
            diskOk
              ? html`
            <span class="storage-ok">✓ 充足 (剩余 ${diskLabel})</span>
          `
              : html`
            <span class="storage-warning">⚠ 空间不足 (剩余 ${diskLabel})</span>
          `
          }
        </div>

        <!-- 技能列表（可展开） -->
        <details class="skills-details">
          <summary class="skills-summary">查看完整技能列表 (${count} 个)</summary>
          <div class="skills-list">
            ${Array.from(tierGroups.entries()).map(
              ([tier, skills]) => html`
              <div class="tier-section">
                <div class="tier-header">
                  <span class="tier-badge tier-badge--${tier}">
                    ${tier === "core" ? "核心" : tier === "recommended" ? "推荐" : "可选"}
                  </span>
                  <span class="tier-count">${skills.length} 项</span>
                </div>
                ${skills.map(
                  (skill) => html`
                  <label class="skill-row">
                    <input
                      type="checkbox"
                      name="batch-skill"
                      value="${skill.name}"
                      ?checked=${tier !== "optional"}
                      ?disabled=${tier === "core"}
                    />
                    <span class="skill-icon">${skill.icon || "📦"}</span>
                    <span class="skill-name">${getSkillName(skill)}</span>
                    <span class="skill-size">${formatBytes(skill.size_bytes)}</span>
                  </label>
                `,
                )}
              </div>
            `,
            )}
          </div>
        </details>

        <!-- 操作按钮 -->
        <div class="modal-actions">
          <button @click=${handleConfirm} class="btn-install">开始安装</button>
          <button @click=${props.onCancel} class="btn-cancel">取消</button>
        </div>

      </div>
    </div>

    <style>
      ${modalInKeyframes}

      /* 背景遮罩 */
      .modal-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.65);
        backdrop-filter: blur(8px);
        z-index: 9000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        animation: batchOverlayIn 0.25s ease;
      }

      /* 模态窗口 */
      .modal {
        width: 100%;
        max-width: 440px;
        max-height: 85vh;
        background: #0e1017;
        border: 1px solid rgba(255,255,255,0.05);
        border-radius: 18px;
        overflow-y: auto;
        animation: batchModalIn 0.35s cubic-bezier(0.34,1.3,0.64,1);
        box-shadow: 0 12px 48px rgba(0,0,0,0.4);
      }

      /* 头部 */
      .modal-header {
        padding: 24px 24px 16px;
        text-align: center;
      }
      .modal-icon {
        width: 56px; height: 56px;
        margin: 0 auto 16px;
        border-radius: 16px;
        background: rgba(0,229,255,0.08);
        display: flex; align-items: center; justify-content: center;
        font-size: 28px;
        box-shadow: 0 0 40px rgba(0,229,255,0.15);
      }
      .modal-header h2 {
        font-size: 19px;
        font-weight: 700;
        margin-bottom: 6px;
        color: #e8eaf0;
      }
      .modal-header p {
        font-size: 13px;
        color: #7a7f96;
        line-height: 1.5;
      }

      /* 统计卡片 */
      .modal-details {
        padding: 0 24px;
      }
      .detail-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        margin-bottom: 16px;
      }
      .detail-card {
        padding: 12px;
        background: rgba(0,0,0,0.25);
        border-radius: 10px;
        border: 1px solid rgba(255,255,255,0.05);
      }
      .detail-card-label {
        font-size: 11px;
        color: #4a4e63;
        margin-bottom: 4px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .detail-card-value {
        font-family: 'JetBrains Mono', monospace;
        font-size: 17px;
        font-weight: 600;
        color: #e8eaf0;
      }
      .detail-card-value .unit {
        font-size: 12px;
        color: #7a7f96;
        font-weight: 400;
      }

      /* 分类列表 */
      .categories-section {
        padding: 0 24px;
        margin-bottom: 16px;
      }
      .categories-title {
        font-size: 12px;
        color: #4a4e63;
        margin-bottom: 8px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .category-row {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 0;
        border-bottom: 1px solid rgba(255,255,255,0.02);
      }
      .category-row:last-child { border: none; }
      .cat-emoji { font-size: 14px; width: 20px; text-align: center; }
      .cat-name { flex: 1; font-size: 13px; color: #7a7f96; }
      .cat-count {
        font-family: 'JetBrains Mono', monospace;
        font-size: 12px;
        color: #4a4e63;
        padding: 2px 8px;
        background: rgba(255,255,255,0.03);
        border-radius: 100px;
      }

      /* 镜像提示 */
      .mirror-info {
        margin: 0 24px 16px;
        padding: 10px 14px;
        background: rgba(0,230,118,0.08);
        border-radius: 10px;
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 12px;
        color: #00e676;
      }
      .mirror-info-icon { font-size: 14px; }
      .mirror-info span { color: rgba(0,230,118,0.7); }

      /* 磁盘检查 */
      .storage-check {
        margin: 0 24px 16px;
        padding: 10px 14px;
        background: rgba(255,255,255,0.02);
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 12px;
        color: #7a7f96;
      }
      .storage-ok {
        color: #00e676;
        display: flex; align-items: center; gap: 4px;
        font-weight: 500;
      }
      .storage-warning {
        color: #ffab00;
        display: flex; align-items: center; gap: 4px;
        font-weight: 500;
      }

      /* 技能列表（可展开）*/
      .skills-details {
        margin: 0 24px 16px;
        border: 1px solid rgba(255,255,255,0.05);
        border-radius: 10px;
        overflow: hidden;
      }
      .skills-summary {
        padding: 12px 16px;
        cursor: pointer;
        list-style: none;
        font-size: 13px;
        font-weight: 600;
        color: #e8eaf0;
        background: rgba(255,255,255,0.02);
        transition: background 0.2s;
      }
      .skills-summary:hover {
        background: rgba(255,255,255,0.04);
      }
      .skills-list {
        padding: 12px;
        max-height: 300px;
        overflow-y: auto;
      }

      /* 层级区域 */
      .tier-section {
        margin-bottom: 16px;
      }
      .tier-section:last-child { margin-bottom: 0; }
      .tier-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 8px;
      }
      .tier-badge {
        padding: 2px 8px;
        border-radius: 100px;
        font-size: 10px;
        font-weight: 600;
      }
      .tier-badge--core {
        background: rgba(0,230,118,0.1);
        color: #00e676;
      }
      .tier-badge--recommended {
        background: rgba(0,229,255,0.1);
        color: #00e5ff;
      }
      .tier-badge--optional {
        background: rgba(255,255,255,0.03);
        color: #7a7f96;
      }
      .tier-count {
        font-size: 11px;
        color: #4a4e63;
      }

      /* 技能行 */
      .skill-row {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 6px 0;
        cursor: pointer;
      }
      .skill-row input[type="checkbox"] {
        width: 16px; height: 16px;
        accent-color: #00e5ff;
        cursor: pointer;
      }
      .skill-row input[type="checkbox"]:disabled {
        cursor: default;
        opacity: 0.5;
      }
      .skill-icon { font-size: 14px; }
      .skill-name {
        flex: 1;
        font-size: 13px;
        color: #e8eaf0;
      }
      .skill-size {
        font-family: 'JetBrains Mono', monospace;
        font-size: 11px;
        color: #7a7f96;
      }

      /* 操作按钮 */
      .modal-actions {
        padding: 16px 24px 24px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .btn-install {
        width: 100%;
        padding: 13px 0;
        background: linear-gradient(135deg, #00e5ff, #00b8d4);
        color: #000;
        font-family: 'Noto Sans SC', sans-serif;
        font-size: 15px;
        font-weight: 700;
        border: none;
        border-radius: 12px;
        cursor: pointer;
        transition: all 0.2s ease;
        box-shadow: 0 2px 12px rgba(0,229,255,0.25);
      }
      .btn-install:hover {
        filter: brightness(1.1);
        transform: translateY(-1px);
        box-shadow: 0 4px 16px rgba(0,229,255,0.35);
      }
      .btn-install:active {
        transform: translateY(0);
      }

      .btn-cancel {
        width: 100%;
        padding: 11px 0;
        background: none;
        border: none;
        color: #4a4e63;
        font-family: 'Noto Sans SC', sans-serif;
        font-size: 13px;
        cursor: pointer;
        transition: color 0.2s;
      }
      .btn-cancel:hover { color: #7a7f96; }

      /* 响应式 */
      @media (max-width: 480px) {
        .modal {
          max-width: 100%;
          border-radius: 0;
        }
        .detail-grid {
          grid-template-columns: 1fr;
        }
      }
    </style>
  `;
}
