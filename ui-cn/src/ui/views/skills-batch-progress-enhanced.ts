/**
 * Skills Batch Progress - Enhanced Version
 * 技能批量安装进度页 - 增强版
 *
 * 基于您的精美 3-download-progress.html 设计，融合官方所有功能
 * - 实时进度更新
 * - 镜像切换显示
 * - 技能状态追踪
 * - WebSocket 数据绑定
 */

import { html, nothing, type TemplateResult } from "lit";
import type { SkillsBatchState, SkillBatchItem } from "../controllers/skills-batch.js";
import { formatBytes, formatSpeed, formatDuration } from "../controllers/skills-batch.js";
import { fadeSlideUpKeyframes, spinKeyframes } from "./skills-batch-animations.js";

// 技能友好名称映射
const SKILL_FRIENDLY_NAMES: Record<string, string> = {
  weather: "天气查询",
  summarize: "网页摘要",
  github: "GitHub 操作",
  oracle: "多模型对比",
  himalaya: "邮件管理",
  openhue: "智能灯光",
  "openai-whisper": "语音转文字",
  mcporter: "MCP 工具",
  // 更多...
};

export function renderSkillsBatchProgressEnhanced(props: {
  batchState: SkillsBatchState;
  onCancel: () => void;
  onMinimize?: () => void;
}): TemplateResult {
  const { batchSkills, batchProgress } = props.batchState;
  const { completed, total, bytesDownloaded, bytesTotal, speedBps, activeMirror } = batchProgress;

  const percentComplete = total > 0 ? Math.round((completed / total) * 100) : 0;
  const downloadedLabel = formatBytes(bytesDownloaded);
  const totalLabel = formatBytes(bytesTotal);
  const speedLabel = formatSpeed(speedBps);

  // 获取技能显示名称
  const getSkillName = (skill: SkillBatchItem) => {
    return SKILL_FRIENDLY_NAMES[skill.name] || skill.name;
  };

  // 获取状态图标
  const getStatusIcon = (status: SkillBatchItem["status"]) => {
    switch (status) {
      case "done":
        return "✓";
      case "downloading":
        return "⏬";
      case "retrying":
        return "🔄";
      case "verifying":
        return "🔍";
      case "failed":
        return "✗";
      default:
        return "⏳";
    }
  };

  // 获取状态类名
  const getStatusClass = (status: SkillBatchItem["status"]) => {
    switch (status) {
      case "done":
        return "task-done";
      case "downloading":
        return "task-active";
      case "retrying":
        return "task-retrying";
      case "verifying":
        return "task-verifying";
      case "failed":
        return "task-failed";
      default:
        return "task-queued";
    }
  };

  // 获取任务详情文本
  const getTaskDetail = (skill: SkillBatchItem) => {
    if (skill.status === "downloading" && skill.bytesDownloaded && skill.bytesTotal) {
      return `${formatBytes(skill.bytesDownloaded)} / ${formatBytes(skill.bytesTotal)}`;
    }
    if (skill.status === "retrying" && skill.retryMirror) {
      return `重试: ${skill.retryMirror}`;
    }
    if (skill.status === "failed" && skill.error) {
      return skill.error;
    }
    if (skill.detail) {
      return skill.detail;
    }
    return skill.status === "done"
      ? "已完成"
      : skill.status === "queued"
        ? "等待中"
        : skill.status === "verifying"
          ? "验证中"
          : "";
  };

  return html`
    <div class="progress-container">

      <!-- 头部 -->
      <div class="header">
        <div class="header-icon">⚡</div>
        <h1>正在安装 AI 超能力</h1>
        <p>请稍候，正在下载并安装工具...</p>
      </div>

      <!-- 总进度条 -->
      <div class="overall-progress">
        <div class="progress-bar-bg">
          <div class="progress-bar-fill" style="width: ${percentComplete}%"></div>
        </div>
        <div class="progress-meta">
          <span class="progress-percent">${percentComplete}%</span>
          <div class="progress-stats">
            <span>${downloadedLabel} / ${totalLabel}</span>
            <span class="speed">${speedLabel}</span>
            <span>${completed} / ${total}</span>
          </div>
        </div>
      </div>

      <!-- 镜像指示器 -->
      ${
        activeMirror
          ? html`
        <div class="mirror-bar">
          <span class="mirror-dot"></span>
          <span>使用镜像:</span>
          <span class="mirror-name">${activeMirror}</span>
        </div>
      `
          : nothing
      }

      <!-- 任务列表 -->
      <div class="task-list">
        ${batchSkills.map(
          (skill) => html`
          <div class="task-item ${getStatusClass(skill.status)}">
            <div class="task-icon">${skill.icon || "📦"}</div>
            <div class="task-info">
              <div class="task-name">${getSkillName(skill)}</div>
              <div class="task-detail">${getTaskDetail(skill)}</div>
            </div>
            <div class="task-status">${getStatusIcon(skill.status)}</div>
          </div>
        `,
        )}
      </div>

      <!-- 操作按钮 -->
      <div class="progress-actions">
        ${
          props.onMinimize
            ? html`
          <button @click=${props.onMinimize} class="btn-minimize">最小化</button>
        `
            : nothing
        }
        <button @click=${props.onCancel} class="btn-cancel-progress">取消安装</button>
      </div>

    </div>

    <style>
      ${fadeSlideUpKeyframes}
      ${spinKeyframes}

      .progress-container {
        max-width: 520px;
        margin: 0 auto;
        padding: 0 20px 40px;
      }

      /* 头部 */
      .header {
        text-align: center;
        padding: 40px 0 24px;
        opacity: 0;
        animation: fadeSlideUp 0.5s ease 0.1s forwards;
      }
      .header-icon {
        font-size: 36px;
        margin-bottom: 12px;
        animation: pulse 2s ease-in-out infinite;
      }
      @keyframes pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.08); }
      }
      .header h1 {
        font-size: 22px;
        font-weight: 700;
        margin-bottom: 6px;
        color: #e8eaf0;
      }
      .header p {
        font-size: 13px;
        color: #7a7f96;
      }

      /* 总进度条 */
      .overall-progress {
        margin-bottom: 24px;
        opacity: 0;
        animation: fadeSlideUp 0.5s ease 0.2s forwards;
      }
      .progress-bar-bg {
        height: 6px;
        background: rgba(255,255,255,0.04);
        border-radius: 3px;
        overflow: hidden;
        margin-bottom: 10px;
      }
      .progress-bar-fill {
        height: 100%;
        background: linear-gradient(90deg, #00e5ff, #00b8d4);
        border-radius: 3px;
        transition: width 0.4s ease;
        position: relative;
      }
      .progress-bar-fill::after {
        content: '';
        position: absolute;
        top: 0; right: 0; bottom: 0;
        width: 40px;
        background: linear-gradient(90deg, transparent, rgba(255,255,255,0.25));
        animation: shimmer 1.5s infinite;
      }
      @keyframes shimmer {
        0% { opacity: 0; }
        50% { opacity: 1; }
        100% { opacity: 0; }
      }

      .progress-meta {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 12px;
      }
      .progress-percent {
        font-family: 'JetBrains Mono', monospace;
        font-weight: 600;
        color: #00e5ff;
        font-size: 14px;
      }
      .progress-stats {
        display: flex;
        gap: 12px;
        color: #4a4e63;
      }
      .progress-stats span {
        font-family: 'JetBrains Mono', monospace;
      }
      .progress-stats .speed { color: #00e676; }

      /* 镜像指示器 */
      .mirror-bar {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 12px;
        background: #0e1017;
        border: 1px solid rgba(255,255,255,0.05);
        border-radius: 8px;
        margin-bottom: 20px;
        font-size: 11px;
        color: #4a4e63;
        opacity: 0;
        animation: fadeSlideUp 0.5s ease 0.3s forwards;
      }
      .mirror-dot {
        width: 6px; height: 6px;
        border-radius: 50%;
        background: #00e676;
        animation: blink 1.5s infinite;
      }
      @keyframes blink {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.3; }
      }
      .mirror-name { color: #7a7f96; font-weight: 500; }

      /* 任务列表 */
      .task-list {
        display: flex;
        flex-direction: column;
        gap: 4px;
        margin-bottom: 20px;
      }

      .task-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 14px;
        background: #0e1017;
        border: 1px solid rgba(255,255,255,0.05);
        border-radius: 10px;
        transition: all 0.3s;
        opacity: 0;
        animation: fadeSlideUp 0.4s ease forwards;
      }
      .task-item:nth-child(1) { animation-delay: 0.4s; }
      .task-item:nth-child(2) { animation-delay: 0.45s; }
      .task-item:nth-child(3) { animation-delay: 0.5s; }
      .task-item:nth-child(4) { animation-delay: 0.55s; }
      .task-item:nth-child(5) { animation-delay: 0.6s; }

      .task-icon {
        width: 30px; height: 30px;
        display: flex; align-items: center; justify-content: center;
        border-radius: 8px;
        font-size: 15px;
        flex-shrink: 0;
      }

      .task-info { flex: 1; min-width: 0; }
      .task-name {
        font-size: 13px;
        font-weight: 600;
        color: #e8eaf0;
        margin-bottom: 2px;
      }
      .task-detail {
        font-size: 11px;
        color: #4a4e63;
        font-family: 'JetBrains Mono', monospace;
      }

      .task-status {
        flex-shrink: 0;
        width: 22px; height: 22px;
        display: flex; align-items: center; justify-content: center;
        border-radius: 50%;
        font-size: 11px;
        font-weight: 700;
      }

      /* 状态样式 */
      .task-done .task-icon { background: rgba(0,230,118,0.08); }
      .task-done .task-name { color: #7a7f96; }
      .task-done .task-status { background: rgba(0,230,118,0.08); color: #00e676; }

      .task-active .task-icon { background: rgba(0,229,255,0.08); }
      .task-active { border-color: rgba(0,229,255,0.15); background: rgba(0,229,255,0.03); }
      .task-active .task-detail { color: #00e5ff; }
      .task-active .task-status {
        color: #00e5ff;
        animation: spin 2s linear infinite;
      }

      .task-retrying .task-icon { background: rgba(255,171,0,0.08); }
      .task-retrying .task-status { color: #ffab00; }

      .task-failed .task-icon { background: rgba(255,64,129,0.08); }
      .task-failed .task-status { background: rgba(255,64,129,0.08); color: #ff4081; }

      /* 操作按钮 */
      .progress-actions {
        display: flex;
        gap: 10px;
        justify-content: center;
        margin-top: 24px;
      }
      .btn-minimize, .btn-cancel-progress {
        padding: 10px 24px;
        background: none;
        border: 1px solid rgba(255,255,255,0.05);
        color: #7a7f96;
        font-family: 'Noto Sans SC', sans-serif;
        font-size: 13px;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.2s;
      }
      .btn-minimize:hover, .btn-cancel-progress:hover {
        border-color: rgba(255,255,255,0.1);
        color: #e8eaf0;
      }

      /* 响应式 */
      @media (max-width: 480px) {
        .progress-stats {
          flex-direction: column;
          gap: 4px;
          align-items: flex-end;
        }
      }
    </style>
  `;
}
