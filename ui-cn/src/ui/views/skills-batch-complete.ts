/**
 * Skills Batch Complete - Screen 5
 * Celebratory completion screen with confetti, count-up stats, and skill categories.
 */

import { html, nothing, type TemplateResult } from "lit";
import { formatBytes, formatDuration } from "../controllers/skills-batch.js";

export type SkillCategory = {
  name: string;
  icon: string;
  skills: { name: string; nameZh?: string; description: string; descriptionZh?: string }[];
};

export function renderSkillsBatchComplete(props: {
  succeeded: string[];
  totalSizeBytes: number;
  durationMs: number;
  categories: SkillCategory[];
  onStartChat: () => void;
}): TemplateResult {
  const skillCount = props.succeeded.length;
  const sizeLabel = formatBytes(props.totalSizeBytes);
  const durationLabel = formatDuration(props.durationMs);

  // Generate confetti particles (CSS-only animation)
  const confettiColors = [
    "#00e5ff",
    "#b388ff",
    "#00e676",
    "#ffab00",
    "#ff4081",
    "#448aff",
    "#1de9b6",
  ];
  const confettiParticles = Array.from({ length: 50 }, (_, i) => {
    const color = confettiColors[i % confettiColors.length];
    const left = Math.random() * 100;
    const delay = Math.random() * 0.6;
    const duration = 1.5 + Math.random() * 1.5;
    const size = 3 + Math.random() * 6;
    const rotation = Math.random() * 360;
    const dx = (Math.random() - 0.5) * 120; // horizontal spread ±60px
    return { color, left, delay, duration, size, rotation, dx, index: i };
  });

  return html`
    <div style="position:fixed;inset:0;z-index:9000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.7);backdrop-filter:blur(6px);">
      <div style="width:92%;max-width:680px;max-height:90vh;background:var(--card);border:1px solid var(--border);border-radius:18px;overflow:hidden;display:flex;flex-direction:column;animation:batchCompleteIn 0.5s cubic-bezier(0.22,1,0.36,1);">

        <!-- Confetti container -->
        <div style="position:relative;overflow:hidden;flex-shrink:0;">
          <div style="position:absolute;inset:0;pointer-events:none;overflow:hidden;">
            ${confettiParticles.map(
              (p) => html`
                <div style="position:absolute;left:${p.left}%;top:35%;width:${p.size}px;height:${p.size * 0.6}px;background:${p.color};--r:${p.rotation}deg;--dx:${p.dx};animation:confettiFall ${p.duration}s ${p.delay}s ease-out forwards;opacity:0;border-radius:1px;"></div>
              `,
            )}
          </div>

          <!-- Header -->
          <div style="padding:40px 32px 24px;text-align:center;position:relative;">
            <!-- Ring + icon -->
            <div style="position:relative;display:inline-block;margin-bottom:18px;">
              <div style="width:80px;height:80px;border-radius:50%;border:3px solid var(--accent);display:flex;align-items:center;justify-content:center;animation:ringExpand 0.6s 0.5s ease-out both;opacity:0;">
                <span style="font-size:36px;animation:checkPop 0.3s 0.9s ease-out both;opacity:0;">&#x26A1;</span>
              </div>
              <div style="position:absolute;inset:-8px;border-radius:50%;border:2px solid var(--accent-subtle, rgba(108,140,255,0.3));animation:ringPulse 1.5s 0.8s ease-out;opacity:0;"></div>
            </div>
            <div style="font-size:26px;font-weight:700;color:var(--text-strong, var(--text));animation:fadeSlideUp 0.4s 0.2s both;">AI 技能配置完成</div>
            <div style="font-size:15px;color:var(--muted);margin-top:6px;animation:fadeSlideUp 0.4s 0.3s both;">已为您配置好所有技能</div>
          </div>
        </div>

        <!-- Stats bar -->
        <div style="display:flex;gap:0;background:var(--bg-accent, var(--secondary));margin:0 32px;border-radius:10px;border:1px solid var(--border);overflow:hidden;flex-shrink:0;animation:fadeIn 0.4s 1.1s both;">
          <div style="flex:1;padding:18px;text-align:center;border-right:1px solid var(--border);">
            <div style="font-size:28px;font-weight:700;color:var(--accent);font-family:monospace;">${skillCount}</div>
            <div style="font-size:12px;color:var(--muted);margin-top:3px;">个技能</div>
          </div>
          <div style="flex:1;padding:18px;text-align:center;border-right:1px solid var(--border);">
            <div style="font-size:28px;font-weight:700;color:var(--text-strong, var(--text));font-family:monospace;">${sizeLabel}</div>
            <div style="font-size:12px;color:var(--muted);margin-top:3px;">已下载</div>
          </div>
          <div style="flex:1;padding:18px;text-align:center;">
            <div style="font-size:28px;font-weight:700;color:var(--text-strong, var(--text));font-family:monospace;">${durationLabel}</div>
            <div style="font-size:12px;color:var(--muted);margin-top:3px;">耗时</div>
          </div>
        </div>

        <!-- Scrollable categories -->
        <div style="flex:1;overflow-y:auto;padding:20px 32px;min-height:0;">
          ${
            props.categories.length > 0
              ? props.categories.map(
                  (cat, catIdx) => html`
              <div style="margin-bottom:18px;animation:fadeSlideUp 0.35s ${1.5 + catIdx * 0.1}s both;">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
                  <span style="font-size:15px;font-weight:600;color:var(--muted-strong, var(--muted));">${cat.icon} ${cat.name}</span>
                  <span style="font-size:14px;color:var(--muted);font-family:monospace;">${cat.skills.length}</span>
                </div>
                <div style="background:var(--bg-accent, var(--secondary));border:1px solid var(--border);border-radius:10px;overflow:hidden;">
                  ${cat.skills.map(
                    (skill, idx) => html`
                      <div style="padding:12px 18px;display:flex;align-items:center;justify-content:space-between;${idx < cat.skills.length - 1 ? "border-bottom:1px solid var(--border);" : ""}animation:fadeSlideUp 0.3s ${1.5 + catIdx * 0.1 + idx * 0.055}s both;">
                        <span style="font-size:15px;font-weight:600;color:var(--text-strong, var(--text));">${skill.nameZh || skill.name}</span>
                        <span style="font-size:13px;color:var(--muted);max-width:55%;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${skill.descriptionZh || skill.description}</span>
                      </div>
                    `,
                  )}
                </div>
              </div>
            `,
                )
              : html`
            <!-- Flat list if no categories -->
            <div style="display:flex;flex-wrap:wrap;gap:8px;">
              ${props.succeeded.map(
                (name) => html`
                  <span style="padding:6px 14px;background:var(--ok-subtle);border:1px solid rgba(52,211,153,0.15);border-radius:100px;font-size:14px;color:var(--ok);">${name}</span>
                `,
              )}
            </div>
          `
          }

          <!-- Usage hint -->
          <div style="margin-top:16px;padding:14px;background:var(--accent-subtle, rgba(108,140,255,0.04));border:1px solid var(--border);border-radius:10px;animation:fadeIn 0.4s 2.2s both;">
            <div style="font-size:13px;font-weight:600;color:var(--text-strong, var(--text));margin-bottom:8px;">试试这样说：</div>
            <div style="font-size:12px;color:var(--muted);line-height:2;">
              "今天天气怎么样？" — 天气查询<br>
              "帮我总结这个网页" — 网页摘要<br>
              "搜索附近的咖啡店" — 地点搜索
            </div>
            <div style="font-size:11px;color:var(--muted);margin-top:6px;">输入 <span style="font-family:monospace;color:var(--accent);">/skills</span> 查看所有可用技能</div>
          </div>
        </div>

        <!-- Footer -->
        <div style="padding:18px 32px 24px;flex-shrink:0;animation:fadeIn 0.4s 2.2s both;">
          <button @click=${props.onStartChat}
            style="width:100%;padding:16px;background:var(--accent);border:none;border-radius:10px;color:var(--accent-foreground, #fff);font-size:17px;font-weight:700;cursor:pointer;box-shadow:0 2px 16px var(--accent-subtle, rgba(108,140,255,0.3));">
            开始使用 66Claw \u2192
          </button>
        </div>
      </div>
    </div>
    <style>
      @keyframes batchCompleteIn { from { opacity:0;transform:scale(0.9); } to { opacity:1;transform:scale(1); } }
      @keyframes ringExpand { from { opacity:0;transform:scale(0.5); } to { opacity:1;transform:scale(1); } }
      @keyframes ringPulse { from { opacity:0.6;transform:scale(1); } to { opacity:0;transform:scale(1.8); } }
      @keyframes checkPop { from { opacity:0;transform:scale(0.3); } to { opacity:1;transform:scale(1); } }
      @keyframes fadeSlideUp { from { opacity:0;transform:translateY(12px); } to { opacity:1;transform:translateY(0); } }
      @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
      @keyframes confettiFall {
        0% { opacity:1;transform:translateY(0) rotate(var(--r,0deg)); }
        100% { opacity:0;transform:translateY(300px) translateX(calc(var(--dx,0) * 1px)) rotate(calc(var(--r,0deg) + 720deg)); }
      }
    </style>
  `;
}
