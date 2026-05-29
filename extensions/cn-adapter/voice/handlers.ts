/**
 * Voice Gateway Methods — cn.voice.* namespace.
 *
 * Methods:
 * - cn.voice.transcribe    — ASR: audio → text
 * - cn.voice.synthesize    — TTS: text → audio
 * - cn.voice.status        — voice system status
 * - cn.voice.prefs.get     — get voice preferences
 * - cn.voice.prefs.set     — update voice preferences
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { safeGateway } from "../utils/index.js";
import { createCnLogger } from "../utils/logger.js";
import { loadVoicePrefs, setVoicePrefs } from "./voice-prefs.js";
import { unifiedTranscribe, unifiedSynthesize, getVoiceSystemStatus } from "./voice-router.js";

const log = createCnLogger("voice:handlers");

/**
 * 注册 Voice Gateway 方法
 */
export function registerVoiceHandlers(api: OpenClawPluginApi): void {
  // -----------------------------------------------------------------
  // cn.voice.transcribe — ASR: audio → text
  // -----------------------------------------------------------------
  api.registerGatewayMethod(
    "cn.voice.transcribe",
    safeGateway("cn.voice.transcribe", async ({ params, respond }) => {
      const p = params as Record<string, unknown>;
      const audioBase64 = p?.audioBase64;
      const apiKey = p?.apiKey;

      if (!audioBase64 || typeof audioBase64 !== "string") {
        respond(false, undefined, {
          code: "CN_INVALID_PARAMS",
          message: "cn.voice.transcribe: missing or invalid 'audioBase64' parameter",
        });
        return;
      }

      const result = await unifiedTranscribe(
        audioBase64,
        typeof apiKey === "string" ? apiKey : undefined,
      );

      respond(true, result);
    }),
  );

  // -----------------------------------------------------------------
  // cn.voice.synthesize — TTS: text → audio
  // -----------------------------------------------------------------
  api.registerGatewayMethod(
    "cn.voice.synthesize",
    safeGateway("cn.voice.synthesize", async ({ params, respond }) => {
      const p = params as Record<string, unknown>;
      const text = p?.text;
      const apiKey = p?.apiKey;
      const voice = p?.voice;

      if (!text || typeof text !== "string") {
        respond(false, undefined, {
          code: "CN_INVALID_PARAMS",
          message: "cn.voice.synthesize: missing or invalid 'text' parameter",
        });
        return;
      }

      const result = await unifiedSynthesize(
        text,
        typeof apiKey === "string" ? apiKey : undefined,
        typeof voice === "string" ? voice : undefined,
      );

      respond(true, result);
    }),
  );

  // -----------------------------------------------------------------
  // cn.voice.status — voice system status
  // -----------------------------------------------------------------
  api.registerGatewayMethod(
    "cn.voice.status",
    safeGateway("cn.voice.status", async ({ respond }) => {
      const status = await getVoiceSystemStatus();
      respond(true, status);
    }),
  );

  // -----------------------------------------------------------------
  // cn.voice.prefs.get — get voice preferences
  // -----------------------------------------------------------------
  api.registerGatewayMethod(
    "cn.voice.prefs.get",
    safeGateway("cn.voice.prefs.get", async ({ respond }) => {
      const prefs = await loadVoicePrefs();
      respond(true, prefs);
    }),
  );

  // -----------------------------------------------------------------
  // cn.voice.prefs.set — update voice preferences
  // -----------------------------------------------------------------
  api.registerGatewayMethod(
    "cn.voice.prefs.set",
    safeGateway("cn.voice.prefs.set", async ({ params, respond }) => {
      const patch = params as Record<string, unknown>;
      if (!patch || typeof patch !== "object") {
        respond(false, undefined, {
          code: "CN_INVALID_PARAMS",
          message: "cn.voice.prefs.set: params must be an object",
        });
        return;
      }

      const updated = await setVoicePrefs(patch);
      respond(true, updated);
    }),
  );

  log.info("Voice gateway handlers registered (5 methods)");
}
