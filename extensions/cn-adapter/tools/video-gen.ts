/**
 * Video Generation Tool — 生视频工具（cn-adapter 插件注册）。
 *
 * 通过 OpenClaw 插件 API registerTool() 注册，不侵入上游。
 * 支持 3 个 provider：Zhipu CogVideoX、SiliconFlow、Volcengine Seedance。
 *
 * 所有视频生成 API 都是异步的（submit → poll → download）。
 *
 * 从 clawdbot video-gen-tool.ts 迁移而来。
 */

import { Type } from "@sinclair/typebox";
import { saveGeneratedVideo } from "../media/chat-video-store.js";
import { createCnLogger } from "../utils/index.js";
import { resolveVideoGenModel } from "./model-resolver.js";

const log = createCnLogger("tools:video-gen");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type VideoGenResult = {
  videoUrl: string;
  coverImageUrl?: string;
  model: string;
  provider: string;
  durationSeconds?: number;
};

type VideoGenProviderHandler = (params: {
  apiKey: string;
  prompt: string;
  imageUrl?: string;
  size?: string;
  baseUrl?: string;
  modelId: string;
}) => Promise<VideoGenResult>;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_POLL_TIME = 300_000;
const POLL_INTERVAL = 5_000;

// SiliconFlow fallback model chain for video gen
const SILICONFLOW_VIDEO_FALLBACKS = ["Wan-AI/Wan2.2-T2V-A14B", "Wan-AI/Wan2.1-T2V-14B"];

// ---------------------------------------------------------------------------
// Provider Handlers
// ---------------------------------------------------------------------------

/** Zhipu CogVideoX — async task: submit → poll GET /async-result/{id} */
const generateWithZhipu: VideoGenProviderHandler = async ({
  apiKey,
  prompt,
  imageUrl,
  size,
  modelId,
  baseUrl,
}) => {
  const base = baseUrl || "https://open.bigmodel.cn";
  const submitUrl = `${base}/api/paas/v4/videos/generations`;

  const body: Record<string, unknown> = { model: modelId || "cogvideox-flash", prompt };
  if (imageUrl) body.image_url = imageUrl;
  if (size) body.size = size;

  const submitResponse = await fetch(submitUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });

  if (!submitResponse.ok) {
    const errorText = await submitResponse.text().catch(() => "unknown error");
    throw new Error(`Zhipu video submit failed (${submitResponse.status}): ${errorText}`);
  }

  const submitData = (await submitResponse.json()) as { id?: string };
  const taskId = submitData.id;
  if (!taskId) throw new Error("Zhipu returned no task ID");

  log.info(`Zhipu video task submitted: ${taskId}`);

  // Poll for result
  const resultUrl = `${base}/api/paas/v4/async-result/${taskId}`;
  const startTime = Date.now();

  while (Date.now() - startTime < MAX_POLL_TIME) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL));

    const pollResponse = await fetch(resultUrl, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!pollResponse.ok) {
      if (pollResponse.status === 401 || pollResponse.status === 403) {
        throw new Error(`Zhipu video poll auth failed (${pollResponse.status})`);
      }
      if (pollResponse.status === 404) {
        throw new Error(`Zhipu video task not found: ${taskId}`);
      }
      continue;
    }

    const pollData = (await pollResponse.json()) as {
      task_status?: string;
      video_result?: Array<{ url?: string; cover_image_url?: string }>;
    };

    if (pollData.task_status === "SUCCESS") {
      const result = pollData.video_result?.[0];
      if (!result?.url) throw new Error("Zhipu video returned no video URL");
      return {
        videoUrl: result.url,
        coverImageUrl: result.cover_image_url,
        model: modelId || "cogvideox-flash",
        provider: "zhipu",
      };
    }
    if (pollData.task_status === "FAIL") throw new Error("Zhipu video generation task failed");

    log.debug(
      `Zhipu video task ${taskId}: ${pollData.task_status}, elapsed=${Date.now() - startTime}ms`,
    );
  }

  throw new Error(`Zhipu video generation timed out (${MAX_POLL_TIME / 1000}s)`);
};

/** SiliconFlow — async: POST /v1/video/submit → poll POST /v1/video/status */
const generateWithSiliconFlow: VideoGenProviderHandler = async ({
  apiKey,
  prompt,
  imageUrl,
  modelId,
  baseUrl,
}) => {
  const rawBase = (baseUrl || "https://api.siliconflow.cn").replace(/\/v1\/?$/, "");
  const submitUrl = `${rawBase}/v1/video/submit`;

  const body: Record<string, unknown> = { model: modelId, prompt };
  if (imageUrl) body.image_url = imageUrl;

  const submitResponse = await fetch(submitUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });

  if (!submitResponse.ok) {
    const errorText = await submitResponse.text().catch(() => "unknown error");
    throw new Error(`SiliconFlow video submit failed (${submitResponse.status}): ${errorText}`);
  }

  const submitData = (await submitResponse.json()) as { requestId?: string };
  const requestId = submitData.requestId;
  if (!requestId) throw new Error("SiliconFlow returned no requestId");

  log.info(`SiliconFlow video task submitted: ${requestId}`);

  // Poll for result
  const statusUrl = `${rawBase}/v1/video/status`;
  const startTime = Date.now();

  while (Date.now() - startTime < MAX_POLL_TIME) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL));

    const pollResponse = await fetch(statusUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ requestId }),
    });
    if (!pollResponse.ok) {
      if (pollResponse.status === 401 || pollResponse.status === 403) {
        throw new Error(`SiliconFlow video poll auth failed (${pollResponse.status})`);
      }
      continue;
    }

    const pollData = (await pollResponse.json()) as {
      status?: string;
      results?: { videos?: Array<{ url?: string }> };
    };

    if (pollData.status === "Succeed") {
      const videoData = pollData.results?.videos?.[0];
      if (!videoData?.url) throw new Error("SiliconFlow video returned no video URL");
      return { videoUrl: videoData.url, model: modelId, provider: "siliconflow" };
    }
    if (pollData.status === "Failed") throw new Error("SiliconFlow video generation task failed");

    log.debug(
      `SiliconFlow video task ${requestId}: ${pollData.status}, elapsed=${Date.now() - startTime}ms`,
    );
  }

  throw new Error(`SiliconFlow video generation timed out (${MAX_POLL_TIME / 1000}s)`);
};

/** Volcengine Doubao Seedance — async task API */
const generateWithVolcengine: VideoGenProviderHandler = async ({
  apiKey,
  prompt,
  imageUrl,
  size,
  modelId,
}) => {
  const baseUrl = "https://ark.cn-beijing.volces.com";
  const submitUrl = `${baseUrl}/api/v3/contents/generations/tasks`;

  // Map size to --ratio
  let ratio = "16:9";
  if (size === "720x1280") ratio = "9:16";
  else if (size === "960x960") ratio = "1:1";

  let fullPrompt = prompt;
  if (!prompt.includes("--ratio")) fullPrompt += ` --ratio ${ratio}`;
  if (!prompt.includes("--dur")) fullPrompt += ` --dur 5`;

  const content: Array<Record<string, unknown>> = [{ type: "text", text: fullPrompt }];
  if (imageUrl) {
    content.push({ type: "image_url", image_url: { url: imageUrl } });
  }

  const submitResponse = await fetch(submitUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: modelId, content }),
  });

  if (!submitResponse.ok) {
    const errorText = await submitResponse.text().catch(() => "unknown error");
    throw new Error(
      `Volcengine Seedance video submit failed (${submitResponse.status}): ${errorText}`,
    );
  }

  const submitData = (await submitResponse.json()) as { id?: string };
  const taskId = submitData.id;
  if (!taskId) throw new Error("Volcengine Seedance returned no task ID");

  log.info(`Volcengine Seedance video task submitted: ${taskId}`);

  // Poll for result
  const resultUrl = `${baseUrl}/api/v3/contents/generations/tasks/${taskId}`;
  const startTime = Date.now();

  while (Date.now() - startTime < MAX_POLL_TIME) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL));

    const pollResponse = await fetch(resultUrl, {
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    });
    if (!pollResponse.ok) {
      if (pollResponse.status === 401 || pollResponse.status === 403) {
        throw new Error(`Volcengine Seedance video poll auth failed (${pollResponse.status})`);
      }
      continue;
    }

    const pollData = (await pollResponse.json()) as {
      status?: string;
      content?: { video_url?: string };
      error?: { message?: string };
    };

    if (pollData.status === "succeeded") {
      const videoUrl = pollData.content?.video_url;
      if (!videoUrl) throw new Error("Volcengine Seedance returned no video URL");
      return { videoUrl, model: modelId, provider: "volcengine-ark" };
    }
    if (pollData.status === "failed") {
      throw new Error(`Volcengine Seedance video failed: ${pollData.error?.message || "unknown"}`);
    }

    log.debug(
      `Volcengine Seedance video task ${taskId}: ${pollData.status}, elapsed=${Date.now() - startTime}ms`,
    );
  }

  throw new Error(`Volcengine Seedance video generation timed out (${MAX_POLL_TIME / 1000}s)`);
};

// ---------------------------------------------------------------------------
// Provider Resolver
// ---------------------------------------------------------------------------

function resolveProvider(providerId: string, modelId: string): VideoGenProviderHandler {
  if (providerId === "zhipu" || providerId === "glm" || modelId.includes("cogvideo"))
    return generateWithZhipu;
  if (providerId === "siliconflow") return generateWithSiliconFlow;
  if (providerId === "volcengine-ark" || providerId === "doubao" || modelId.includes("seedance"))
    return generateWithVolcengine;
  return generateWithZhipu; // Default
}

// ---------------------------------------------------------------------------
// Tool Factory
// ---------------------------------------------------------------------------

export function createVideoGenTool(sessionKey?: string) {
  return {
    label: "Video Generation",
    name: "video_gen",
    description:
      "Generate short video clips from text descriptions (takes 30s-3min). " +
      "If the user's request is vague, briefly ask what they want before calling. " +
      "If the user already described specific content, call directly.",
    parameters: Type.Object({
      prompt: Type.String({ description: "Detailed text description of the video to generate" }),
      image_url: Type.Optional(
        Type.String({
          description: "Optional reference image URL for image-to-video generation.",
        }),
      ),
      size: Type.Optional(
        Type.String({
          description:
            "Video size: 1280x720 (landscape, default), 720x1280 (portrait), 960x960 (square)",
        }),
      ),
    }),
    execute: async (_toolCallId: string, args: unknown) => {
      const record = args && typeof args === "object" ? (args as Record<string, unknown>) : {};
      const prompt = typeof record.prompt === "string" ? record.prompt.trim() : "";
      if (!prompt) {
        return {
          content: [
            { type: "text" as const, text: "Error: prompt is required for video generation." },
          ],
          details: { error: "missing_prompt" },
        };
      }

      const imageUrl = typeof record.image_url === "string" ? record.image_url.trim() : undefined;
      const size = typeof record.size === "string" ? record.size.trim() : "1280x720";
      const resolvedSessionKey = sessionKey || `default-${Date.now()}`;

      try {
        const hasImage = Boolean(imageUrl);
        const model = await resolveVideoGenModel(hasImage);
        if (!model) {
          return {
            content: [
              {
                type: "text" as const,
                text: "No video generation model configured. Please configure a video generation model in model settings.",
              },
            ],
            details: { error: "no_video_gen_model" },
          };
        }

        log.info(`Using video gen model: ${model.providerId}/${model.modelId}`);
        const handler = resolveProvider(model.providerId, model.modelId);

        // SiliconFlow fallback chain: primary → T2V-A14B → T2V-14B
        const modelsToTry = [model.modelId];
        if (model.providerId === "siliconflow") {
          for (const fb of SILICONFLOW_VIDEO_FALLBACKS) {
            if (!modelsToTry.includes(fb)) modelsToTry.push(fb);
          }
        }

        let result: VideoGenResult | undefined;
        let lastError: Error | undefined;
        for (const candidateModelId of modelsToTry) {
          try {
            result = await handler({
              apiKey: model.apiKey,
              prompt,
              imageUrl: imageUrl || undefined,
              size,
              baseUrl: model.baseUrl,
              modelId: candidateModelId,
            });
            lastError = undefined;
            break;
          } catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err));
            const msg = lastError.message;
            if (msg.includes("400") || msg.includes("404") || msg.includes("does not exist")) {
              log.warn(
                `Video gen model ${candidateModelId} failed (${msg.slice(0, 100)}), trying next...`,
              );
              continue;
            }
            throw lastError;
          }
        }
        if (lastError) throw lastError;
        if (!result) throw new Error("No video generation result");

        log.info(`Video generated: ${result.provider}/${result.model}`);

        // Use the original remote URL for display (browser can access CDN directly).
        // Also persist to disk as backup (fire-and-forget).
        const displayVideoUrl = result.videoUrl;
        let localFilename: string | null = null;

        try {
          const response = await fetch(result.videoUrl);
          if (!response.ok) throw new Error(`Video download failed (${response.status})`);
          const videoBuf = Buffer.from(await response.arrayBuffer());
          if (videoBuf.length < 1024)
            throw new Error(`Video download too small (${videoBuf.length} bytes)`);

          const remoteUrl = result.videoUrl.startsWith("http") ? result.videoUrl : undefined;
          const entry = await saveGeneratedVideo({
            sessionKey: resolvedSessionKey,
            data: videoBuf,
            mimeType: "video/mp4",
            remoteUrl,
            meta: {
              prompt,
              model: `${result.provider}/${result.model}`,
              provider: result.provider,
              size,
              durationSeconds: result.durationSeconds,
              coverImageUrl: result.coverImageUrl,
            },
          });
          if (entry) {
            localFilename = entry.file;
            log.info(
              `Video saved: ${entry.file} (${(videoBuf.length / 1024 / 1024).toFixed(1)} MB)`,
            );
          }
        } catch (persistErr) {
          log.warn(`Failed to persist video: ${(persistErr as Error).message}`);
        }

        const resultText = "视频已生成，可在上方播放。";

        const videoMetaBlock = {
          type: "text" as const,
          text: `<!--OPENCLAWCN_VIDEO_GEN:${JSON.stringify({
            videoUrl: displayVideoUrl,
            coverImageUrl: result.coverImageUrl,
            model: `${result.provider}/${result.model}`,
            provider: result.provider,
            prompt,
            size,
            mediaType: "video",
            localFilename,
          })}-->`,
        };

        return {
          content: [{ type: "text" as const, text: resultText }, videoMetaBlock],
          details: {
            model: `${result.provider}/${result.model}`,
            videoUrl: displayVideoUrl,
            coverImageUrl: result.coverImageUrl,
            prompt,
            size,
            mediaType: "video",
            localFilename,
            mediaId: null,
          },
        };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        log.error(`Video generation failed: ${errorMsg}`);
        return {
          content: [{ type: "text" as const, text: `Video generation failed: ${errorMsg}` }],
          details: { error: errorMsg, prompt, size, mediaType: "video" },
        };
      }
    },
  };
}
