/**
 * Voice Waveform — 音量驱动的波纹条。
 *
 * 5 条 SVG rect bar，高度由实时音量 (0~1) 驱动。
 * 中间高两边低的贝尔曲线分布。
 */
import { html, type TemplateResult } from "lit";

/**
 * Bell-curve weights for 5 bars (center-heavy).
 * Index:  0     1     2     3     4
 * Weight: 0.3   0.7   1.0   0.7   0.3
 */
const BAR_WEIGHTS = [0.3, 0.7, 1.0, 0.7, 0.3];
const MIN_HEIGHT = 3;
const MAX_HEIGHT = 16;
const BAR_WIDTH = 2;
const BAR_GAP = 2;
const BAR_RX = 1;
const VIEWBOX_HEIGHT = 24;
const VIEWBOX_WIDTH = BAR_WIDTH * 5 + BAR_GAP * 4; // 18

/**
 * Render a volume-driven waveform.
 * @param volume 0..1 normalized volume level
 */
export function renderVolumeWaveform(volume: number): TemplateResult {
  const v = Math.max(0, Math.min(1, volume));

  return html`
		<svg
			viewBox="0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}"
			class="cc-voice-waveform"
			aria-hidden="true"
		>
			${BAR_WEIGHTS.map((weight, i) => {
        const h = MIN_HEIGHT + (MAX_HEIGHT - MIN_HEIGHT) * v * weight;
        const x = i * (BAR_WIDTH + BAR_GAP);
        const y = (VIEWBOX_HEIGHT - h) / 2;
        return html`
					<rect
						x=${x}
						y=${y}
						width=${BAR_WIDTH}
						height=${h}
						rx=${BAR_RX}
						fill="currentColor"
						style="transition: height 60ms ease, y 60ms ease"
					/>
				`;
      })}
		</svg>
	`;
}
