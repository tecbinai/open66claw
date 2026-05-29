/**
 * WAV Encoder — 将浏览器录音 Blob 转换为 16kHz mono PCM16 WAV 的 Base64 字符串。
 *
 * 使用 Web Audio API 解码 + 重采样，纯 JS 实现，无外部依赖。
 */

const TARGET_SAMPLE_RATE = 16000;

/**
 * Convert an audio Blob (webm/ogg/mp4 from MediaRecorder) to a 16kHz mono WAV base64 string.
 */
export async function blobToWavBase64(blob: Blob): Promise<string> {
  const arrayBuffer = await blob.arrayBuffer();

  // Decode the compressed audio
  const audioCtx = new AudioContext();
  const decoded = await audioCtx.decodeAudioData(arrayBuffer);
  await audioCtx.close();

  // Resample to 16kHz mono
  const mono = mixToMono(decoded);
  const resampled = await resample(mono, decoded.sampleRate, TARGET_SAMPLE_RATE);

  // Encode as WAV
  const wavBuffer = encodeWav(resampled, TARGET_SAMPLE_RATE);

  // Convert to base64
  return arrayBufferToBase64(wavBuffer);
}

/** Mix all channels to mono by averaging. */
function mixToMono(buffer: AudioBuffer): Float32Array {
  if (buffer.numberOfChannels === 1) {
    return buffer.getChannelData(0);
  }
  const length = buffer.length;
  const mono = new Float32Array(length);
  const channels = buffer.numberOfChannels;
  for (let ch = 0; ch < channels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      mono[i] += data[i];
    }
  }
  const scale = 1 / channels;
  for (let i = 0; i < length; i++) {
    mono[i] *= scale;
  }
  return mono;
}

/** Resample using OfflineAudioContext. */
async function resample(
  samples: Float32Array,
  fromRate: number,
  toRate: number,
): Promise<Float32Array> {
  if (fromRate === toRate) return samples;

  const duration = samples.length / fromRate;
  const outLength = Math.ceil(duration * toRate);
  const offlineCtx = new OfflineAudioContext(1, outLength, toRate);
  const sourceBuffer = offlineCtx.createBuffer(1, samples.length, fromRate);
  sourceBuffer.getChannelData(0).set(samples);

  const source = offlineCtx.createBufferSource();
  source.buffer = sourceBuffer;
  source.connect(offlineCtx.destination);
  source.start(0);

  const rendered = await offlineCtx.startRendering();
  return rendered.getChannelData(0);
}

/** Encode Float32Array samples as PCM16 WAV. */
function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const numSamples = samples.length;
  const bytesPerSample = 2; // PCM16
  const dataSize = numSamples * bytesPerSample;
  const headerSize = 44;
  const buffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");

  // fmt chunk
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true); // byte rate
  view.setUint16(32, bytesPerSample, true); // block align
  view.setUint16(34, 16, true); // bits per sample

  // data chunk
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  // Write PCM16 samples
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    const int16 = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    view.setInt16(offset, int16, true);
    offset += 2;
  }

  return buffer;
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  // Process in 8KB chunks to avoid excessive string concatenation
  const chunkSize = 8192;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    parts.push(String.fromCharCode(...chunk));
  }
  return btoa(parts.join(""));
}
