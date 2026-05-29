/**
 * End-to-end test for volcengine TTS WebSocket synthesis.
 *
 * Requires actual volcengine credentials in ~/.openclaw-dev/settings/voice-creds.json
 * Run: npx tsx extensions/cn-adapter/voice/__tests__/volcengine-tts-e2e.test.ts
 */

import fs from "node:fs";
import path from "node:path";
import { volcengineTtsSynthesize, type VolcTtsResult } from "../volcengine-tts.js";

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

function assertOk(result: VolcTtsResult, testName: string): void {
  if (result.ok) {
    console.log(`[PASS] ${testName}: ok=true, audioBase64 length=${result.audioBase64?.length}, format=${result.format}, latency=${result.latencyMs}ms`);
  } else {
    console.log(`[FAIL] ${testName}: ok=false, error="${result.error}"`);
  }
}

// ── Tests ────────────────────────────────────────────────────

async function testEmptyText() {
  console.log("[test] Testing empty text...");
  const result = await volcengineTtsSynthesize({
    text: "",
    appId: "dummy",
    accessToken: "dummy",
  });
  if (!result.ok && result.error === "合成文本为空") {
    console.log("[PASS] Empty text rejected correctly");
  } else {
    console.log(`[FAIL] Expected empty text rejection, got: ${JSON.stringify(result)}`);
  }
}

async function testInvalidCredentials() {
  console.log("[test] Testing with invalid credentials...");
  const result = await volcengineTtsSynthesize({
    text: "你好世界",
    appId: "invalid-app-id",
    accessToken: "invalid-token",
  });
  console.log("[test] Result:", JSON.stringify(result, null, 2));

  if (!result.ok) {
    console.log(`[PASS] Correctly rejected invalid credentials: ${result.error}`);
  } else {
    console.log("[FAIL] Should have rejected invalid credentials");
  }
}

async function testBasicSynthesis() {
  const creds = loadCredentials();
  if (!creds) {
    console.log("[SKIP] No volcengine credentials found — skipping real API test");
    return;
  }
  console.log(`[test] appId: ${creds.appId}, token: ${creds.accessToken.slice(0, 4)}***`);

  console.log("[test] Synthesizing '你好，我是豆包语音助手'...");
  const result = await volcengineTtsSynthesize({
    text: "你好，我是豆包语音助手",
    appId: creds.appId,
    accessToken: creds.accessToken,
    encoding: "mp3",
  });
  assertOk(result, "Basic synthesis");

  if (result.ok && result.audioBase64) {
    // Verify it's valid base64 and non-trivial size
    const buf = Buffer.from(result.audioBase64, "base64");
    if (buf.length > 100) {
      console.log(`[PASS] Audio output: ${buf.length} bytes (valid)`);
    } else {
      console.log(`[FAIL] Audio output too small: ${buf.length} bytes`);
    }
  }
}

async function testLongerText() {
  const creds = loadCredentials();
  if (!creds) {
    console.log("[SKIP] No volcengine credentials found");
    return;
  }

  const longText = "今天天气很好，阳光明媚。我们可以一起去公园散步，呼吸新鲜空气，感受春天的气息。";
  console.log(`[test] Synthesizing longer text (${longText.length} chars)...`);
  const result = await volcengineTtsSynthesize({
    text: longText,
    appId: creds.appId,
    accessToken: creds.accessToken,
    encoding: "mp3",
    speedRatio: 1.0,
  });
  assertOk(result, "Longer text synthesis");
}

// ── Run ──────────────────────────────────────────────────────

async function main() {
  console.log("=== Volcengine TTS E2E Tests ===\n");

  console.log("--- Test 1: Empty text ---");
  await testEmptyText();
  console.log();

  console.log("--- Test 2: Invalid credentials ---");
  await testInvalidCredentials();
  console.log();

  console.log("--- Test 3: Basic synthesis ---");
  await testBasicSynthesis();
  console.log();

  console.log("--- Test 4: Longer text ---");
  await testLongerText();
  console.log();

  console.log("=== Done ===");
}

main().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});
