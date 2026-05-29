/**
 * Skills Batch Animations Library
 * 技能批量安装 - 共享动画库
 *
 * 基于您的精美 HTML 设计提取的可复用动画效果
 */

/**
 * 彩纸飘落动画
 * @param canvas Canvas 元素
 * @param options 配置选项
 */
export function launchConfetti(
  canvas: HTMLCanvasElement,
  options?: {
    particleCount?: number;
    colors?: string[];
    duration?: number;
  },
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const colors = options?.colors ?? [
    "#00e5ff", // 霓虹青色
    "#b388ff", // 紫色
    "#00e676", // 绿色
    "#ffab00", // 琥珀色
    "#ff4081", // 玫瑰色
    "#448aff", // 蓝色
    "#1de9b6", // 青绿色
  ];

  interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    w: number;
    h: number;
    color: string;
    rotation: number;
    rotSpeed: number;
    gravity: number;
    opacity: number;
    decay: number;
  }

  const particles: Particle[] = [];
  const particleCount = options?.particleCount ?? 80;

  for (let i = 0; i < particleCount; i++) {
    particles.push({
      x: canvas.width / 2 + (Math.random() - 0.5) * 200,
      y: canvas.height * 0.35,
      vx: (Math.random() - 0.5) * 12,
      vy: -Math.random() * 14 - 4,
      w: Math.random() * 6 + 3,
      h: Math.random() * 4 + 2,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * 360,
      rotSpeed: (Math.random() - 0.5) * 12,
      gravity: 0.25 + Math.random() * 0.15,
      opacity: 1,
      decay: 0.008 + Math.random() * 0.008,
    });
  }

  function animate() {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = false;

    particles.forEach((p) => {
      if (p.opacity <= 0) return;
      alive = true;
      p.x += p.vx;
      p.vy += p.gravity;
      p.y += p.vy;
      p.vx *= 0.99;
      p.rotation += p.rotSpeed;
      p.opacity -= p.decay;

      ctx.save();
      ctx.globalAlpha = Math.max(0, p.opacity);
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rotation * Math.PI) / 180);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    });

    if (alive) requestAnimationFrame(animate);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  animate();
}

/**
 * 数字计数动画
 * @param el 目标元素
 * @param target 目标数字
 * @param duration 动画时长（ms）
 * @param suffix 后缀（可选）
 */
export function countUp(el: HTMLElement, target: number, duration: number, suffix?: string) {
  const start = performance.now();
  const update = (now: number) => {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    // Ease out cubic
    const ease = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(target * ease);
    el.textContent = current + (suffix || "");
    if (progress < 1) requestAnimationFrame(update);
  };
  requestAnimationFrame(update);
}

/**
 * 环形脉动动画（CSS keyframes）
 */
export const ringPulseKeyframes = `
  @keyframes ringExpand {
    0% { transform: scale(0.3); opacity: 0; }
    100% { transform: scale(1); opacity: 1; }
  }
  @keyframes ringPulseOut {
    0% { transform: scale(1); opacity: 0.6; }
    100% { transform: scale(1.8); opacity: 0; }
  }
  @keyframes checkPop {
    0% { transform: scale(0); opacity: 0; }
    100% { transform: scale(1); opacity: 1; }
  }
`;

/**
 * 渐入上浮动画（CSS keyframes）
 */
export const fadeSlideUpKeyframes = `
  @keyframes fadeSlideUp {
    from { opacity: 0; transform: translateY(14px); }
    to { opacity: 1; transform: translateY(0); }
  }
`;

/**
 * 模态窗口弹性进场动画（CSS keyframes）
 */
export const modalInKeyframes = `
  @keyframes batchOverlayIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes batchModalIn {
    from { opacity: 0; transform: scale(0.92) translateY(20px); }
    to { opacity: 1; transform: scale(1) translateY(0); }
  }
`;

/**
 * 横幅滑入动画（CSS keyframes）
 */
export const bannerInKeyframes = `
  @keyframes bannerSlideIn {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  }
`;

/**
 * 氛围光晕脉动动画（CSS keyframes）
 */
export const ambientPulseKeyframes = `
  @keyframes ambientPulse {
    0%, 100% { opacity: 0.5; transform: translateX(-50%) scale(1); }
    50% { opacity: 1; transform: translateX(-50%) scale(1.2); }
  }
`;

/**
 * 下拉箭头跳动动画（CSS keyframes）
 */
export const bounceDownKeyframes = `
  @keyframes bounceDown {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(3px); }
  }
`;

/**
 * 进度条填充动画（CSS keyframes）
 */
export const progressFillKeyframes = `
  @keyframes progressFill {
    from { width: 0; }
    to { width: var(--progress-width, 0%); }
  }
`;

/**
 * 旋转加载动画（CSS keyframes）
 */
export const spinKeyframes = `
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`;

/**
 * 所有动画 keyframes 集合
 */
export const allAnimationKeyframes = `
  ${ringPulseKeyframes}
  ${fadeSlideUpKeyframes}
  ${modalInKeyframes}
  ${bannerInKeyframes}
  ${ambientPulseKeyframes}
  ${bounceDownKeyframes}
  ${progressFillKeyframes}
  ${spinKeyframes}
`;
