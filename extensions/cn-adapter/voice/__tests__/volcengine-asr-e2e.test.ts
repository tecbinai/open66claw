/**
 * End-to-end test for volcengine ASR WebSocket transcription.
 *
 * Requires actual volcengine credentials in ~/.openclaw-dev/settings/voice-creds.json
 * Run: npx tsx extensions/cn-adapter/voice/__tests__/volcengine-asr-e2e.test.ts
 */

import fs from "node:fs";
import path from "node:path";
import { volcengineTranscribe } from "../volcengine-asr.js";

// ── Helpers ──────────────────────────────────────────────────

function loadCredentials(): { appId: string; accessToken: string } | null {
  const home = process.env.HOME || process.env.USERPROFILE || "";
  const paths = [
    path.join(home, ".openclaw-dev", "settings", "voice-creds.json"),
    path.join(home, ".openclaw", "settings", "voice-creds.json"),
  ];
  for (const p of paths) {
    try {
      const data = JSON.parse(fs.readFileSync(p, "utf8"));
      if (data.volcengine?.appId && data.volcengine?.accessToken) {
        console.log(`[test] credentials loaded from ${p}`);
        return data.volcengine;
      }
    } catch { /* try next */ }
  }
  return null;
}

/** Generate a silent WAV file (16kHz, mono, 16-bit PCM) */
function createSilentWav(durationSec: number): Buffer {
  const sampleRate = 16000;
  const numChannels = 1;
  const bitsPerSample = 16;
  const numSamples = Math.floor(sampleRate * durationSec);
  const dataSize = numSamples * numChannels * (bitsPerSample / 8);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * numChannels * bitsPerSample / 8, 28);
  header.writeUInt16LE(numChannels * bitsPerSample / 8, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);
  const pcm = Buffer.alloc(dataSize); // all zeros = silence
  return Buffer.concat([header, pcm]);
}

// ── Tests ────────────────────────────────────────────────────

async function testSilentAudio() {
  const creds = loadCredentials();
  if (!creds) {
    console.log("[SKIP] No volcengine credentials found");
    return;
  }
  console.log(`[test] appId: ${creds.appId}, token: ${creds.accessToken.slice(0, 4)}***`);

  const wav = createSilentWav(1.0);
  const base64 = wav.toString("base64");
  console.log(`[test] WAV: ${wav.length} bytes, base64: ${base64.length} chars`);

  console.log("[test] Calling volcengineTranscribe with silent audio...");
  const result = await volcengineTranscribe(base64, creds.appId, creds.accessToken);
  console.log("[test] Result:", JSON.stringify(result, null, 2));

  if (result.ok) {
    console.log(`[PASS] ASR returned ok=true, text="${result.text}", latency=${result.latencyMs}ms`);
  } else {
    console.log(`[FAIL] ASR returned ok=false, error="${result.error}"`);
  }
}

async function testWavParsing() {
  // Test that WAV header is correctly parsed
  const wav = createSilentWav(0.5);

  // Check RIFF header
  const riff = wav.subarray(0, 4).toString("ascii");
  const sampleRate = wav.readUInt32LE(24);
  console.log(`[test] WAV header: ${riff}, sampleRate: ${sampleRate}`);

  if (riff !== "RIFF") {
    console.log("[FAIL] Invalid WAV header");
    return;
  }
  if (sampleRate !== 16000) {
    console.log(`[FAIL] Expected sampleRate 16000, got ${sampleRate}`);
    return;
  }
  console.log("[PASS] WAV parsing OK");
}

async function testMissingCredentials() {
  console.log("[test] Testing with invalid credentials...");
  const result = await volcengineTranscribe(
    createSilentWav(0.5).toString("base64"),
    "invalid-app-id",
    "invalid-token",
  );
  console.log("[test] Result:", JSON.stringify(result, null, 2));

  if (!result.ok) {
    console.log(`[PASS] Correctly rejected invalid credentials: ${result.error}`);
  } else {
    console.log("[FAIL] Should have rejected invalid credentials");
  }
}

// ── Run ──────────────────────────────────────────────────────

async function main() {
  console.log("=== Volcengine ASR E2E Tests ===\n");

  console.log("--- Test 1: WAV parsing ---");
  await testWavParsing();
  console.log();

  console.log("--- Test 2: Invalid credentials ---");
  await testMissingCredentials();
  console.log();

  console.log("--- Test 3: Silent audio transcription ---");
  await testSilentAudio();
  console.log();

  console.log("=== Done ===");
}

main().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});
