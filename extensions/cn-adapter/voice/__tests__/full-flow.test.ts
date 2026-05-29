/**
 * Full flow integration test - simulates the complete user journey:
 * 1. voice-creds save + load
 * 2. voice-prefs save + load
 * 3. ASR transcription via volcengine WebSocket
 *
 * Run: npx tsx extensions/cn-adapter/voice/__tests__/full-flow.test.ts
 */

import fs from "node:fs";
import path from "node:path";

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  [PASS] ${msg}`);
    passed++;
  } else {
    console.log(`  [FAIL] ${msg}`);
    failed++;
  }
}

async function testVoiceCredsRoundTrip() {
  console.log("\n--- Test: voice-creds round-trip ---");
  const { saveVolcCredentials, loadVolcCredentials, getVolcCredsStatus, _resetCredsCache } =
    await import("../voice-creds.js");

  _resetCredsCache();

  await saveVolcCredentials("test-app-123", "test-token-xyz");

  _resetCredsCache(); // force re-read from disk
  const creds = await loadVolcCredentials();
  assert(creds !== null, "credentials loaded");
  assert(creds?.appId === "test-app-123", `appId correct: ${creds?.appId}`);
  assert(creds?.accessToken === "test-token-xyz", `accessToken correct`);

  const status = await getVolcCredsStatus();
  assert(status.configured === true, "status.configured is true");
  assert(typeof status.maskedAppId === "string", `maskedAppId: ${status.maskedAppId}`);
  assert(typeof status.maskedToken === "string", `maskedToken: ${status.maskedToken}`);
}

async function testVoicePrefsRoundTrip() {
  console.log("\n--- Test: voice-prefs round-trip ---");
  const { setVoicePrefs, loadVoicePrefs, getVoicePrefsSync, _resetPrefsCache } =
    await import("../voice-prefs.js");

  _resetPrefsCache();

  await setVoicePrefs({ asrProvider: "volcengine", ttsProvider: "volcengine" });

  _resetPrefsCache(); // force re-read from disk
  const prefs = await loadVoicePrefs();
  assert(prefs.asrProvider === "volcengine", `asrProvider: ${prefs.asrProvider}`);
  assert(prefs.ttsProvider === "volcengine", `ttsProvider: ${prefs.ttsProvider}`);

  const syncPrefs = getVoicePrefsSync();
  assert(syncPrefs.asrProvider === "volcengine", `sync asrProvider: ${syncPrefs.asrProvider}`);
}

async function testVolcengineAsrConnection() {
  console.log("\n--- Test: volcengine ASR connection ---");
  const home = process.env.HOME || process.env.USERPROFILE || "";
  const credsPath = path.join(home, ".openclaw-dev", "settings", "voice-creds.json");

  let realCreds: { appId: string; accessToken: string } | null = null;
  try {
    const data = JSON.parse(fs.readFileSync(credsPath, "utf8"));
    realCreds = data.volcengine;
  } catch { /* no real creds */ }

  if (!realCreds) {
    console.log("  [SKIP] No real volcengine credentials found");
    return;
  }

  const { volcengineTranscribe } = await import("../volcengine-asr.js");

  // Test with silent audio
  const sr = 16000, dur = 1.0;
  const numSamples = Math.floor(sr * dur);
  const dataSize = numSamples * 2;
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + dataSize, 4);
  h.write("WAVE", 8); h.write("fmt ", 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22); h.writeUInt32LE(sr, 24);
  h.writeUInt32LE(sr * 2, 28);
  h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(dataSize, 40);
  const wav = Buffer.concat([h, Buffer.alloc(dataSize)]);

  const result = await volcengineTranscribe(wav.toString("base64"), realCreds.appId, realCreds.accessToken);
  assert(result.ok === true, `ASR ok: ${result.ok}`);
  assert(typeof result.latencyMs === "number", `latency: ${result.latencyMs}ms`);
  assert(result.text === "", `silent audio returns empty text: "${result.text}"`);

  // Test with invalid credentials
  const badResult = await volcengineTranscribe(wav.toString("base64"), "bad", "bad");
  assert(badResult.ok === false, `bad creds rejected: ${badResult.error}`);
}

async function testChatSendNoExtraFields() {
  console.log("\n--- Test: chat.send has no extra fields ---");
  // Read the compiled chat controller to verify no voiceInput/voiceMode
  const chatFile = path.join(process.cwd(), "ui-cn/src/ui/controllers/chat.ts");
  const content = fs.readFileSync(chatFile, "utf8");

  assert(!content.includes("voiceInput: true"), "no voiceInput in chat.send params");
  assert(!content.includes("voiceMode: true"), "no voiceMode in chat.send params");
  assert(content.includes("thinking: opts.thinking") || content.includes("thinking: opts?.thinking"), "thinking field preserved");
}

async function main() {
  console.log("=== Full Voice Flow Integration Tests ===");

  await testVoiceCredsRoundTrip();
  await testVoicePrefsRoundTrip();
  await testVolcengineAsrConnection();
  await testChatSendNoExtraFields();

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
