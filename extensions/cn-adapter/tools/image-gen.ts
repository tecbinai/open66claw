/**
 * Image Generation Tool — 生图工具（cn-adapter 插件注册）。
 *
 * 通过 OpenClaw 插件 API registerTool() 注册，不侵入上游。
 * 支持 5 个 provider：OpenAI、DashScope、SiliconFlow、Volcengine、Local。
 *
 * 从 clawdbot image-gen-tool.ts 迁移而来。
 */

import { Type } from "@sinclair/typebox";
import { saveGeneratedImage } from "../media/chat-image-store.js";
import type { ImageGenerationMeta } from "../media/types.js";
import { createCnLogger } from "../utils/index.js";
import { resolveImageGenModel } from "./model-resolver.js";

const log = createCnLogger("tools:image-gen");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ImageGenResult = {
  imageUrl: string;
  revisedPrompt?: string;
  model: string;
  provider: string;
};

type ImageGenProviderHandler = (params: {
  apiKey: string;
  prompt: string;
  size: string;
  style: string;
  quality: string;
  n: number;
  baseUrl?: string;
  modelId: string;
}) => Promise<ImageGenResult[]>;

// ---------------------------------------------------------------------------
// Provider Handlers
// ---------------------------------------------------------------------------

function normalizeBaseUrl(url: string | undefined, fallback: string): string {
  const base = (url || fallback).replace(/\/+$/, "");
  return base.endsWith("/v1") ? base.slice(0, -3) : base;
}

const generateWithOpenAI: ImageGenProviderHandler = async ({
  apiKey,
  prompt,
  size,
  style,
  quality,
  n,
  baseUrl,
  modelId,
}) => {
  const url = `${normalizeBaseUrl(baseUrl, "https://api.openai.com")}/v1/images/generations`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: modelId || "dall-e-3",
      prompt,
      n: Math.min(n, modelId?.includes("gpt-image") ? 4 : 1),
      size,
      style,
      quality,
      response_format: "b64_json",
    }),
    signal: controller.signal,
  });
  clearTimeout(timeout);

  if (!response.ok) {
    const errorText = await response.text().catch(() => "unknown error");
    throw new Error(`OpenAI image generation failed (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as {
    data?: Array<{ b64_json?: string; revised_prompt?: string; url?: string }>;
  };

  const results: ImageGenResult[] = [];
  for (const item of data.data ?? []) {
    const imageUrl = item.b64_json ? `data:image/png;base64,${item.b64_json}` : (item.url ?? "");
    if (imageUrl) {
      results.push({
        imageUrl,
        revisedPrompt: item.revised_prompt,
        model: modelId || "dall-e-3",
        provider: "openai",
      });
    }
  }
  if (results.length === 0) throw new Error("OpenAI returned empty image data");
  return results;
};

const generateWithDashScope: ImageGenProviderHandler = async ({
  apiKey,
  prompt,
  size,
  n,
  modelId,
}) => {
  const url = "https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis";
  const submitController = new AbortController();
  const submitTimeout = setTimeout(() => submitController.abort(), 30_000);
  const submitResponse = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "X-DashScope-Async": "enable",
    },
    body: JSON.stringify({
      model: modelId || "wanx-v1",
      input: { prompt },
      parameters: { size: convertSizeToDashScope(size), n: Math.min(n, 4) },
    }),
    signal: submitController.signal,
  });
  clearTimeout(submitTimeout);

  if (!submitResponse.ok) {
    const errorText = await submitResponse.text().catch(() => "unknown error");
    throw new Error(`DashScope submit failed (${submitResponse.status}): ${errorText}`);
  }

  const submitData = (await submitResponse.json()) as {
    output?: { task_id?: string };
  };
  const taskId = submitData.output?.task_id;
  if (!taskId) throw new Error("DashScope returned no task_id");

  // Poll for result (max 120s)
  const taskUrl = `https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`;
  const startTime = Date.now();
  while (Date.now() - startTime < 120_000) {
    await new Promise((r) => setTimeout(r, 2_000));

    const pollController = new AbortController();
    const pollTimeout = setTimeout(() => pollController.abort(), 15_000);
    const pollResponse = await fetch(taskUrl, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: pollController.signal,
    });
    clearTimeout(pollTimeout);
    if (!pollResponse.ok) {
      if (pollResponse.status === 401 || pollResponse.status === 403) {
        throw new Error(`DashScope API auth failed (${pollResponse.status})`);
      }
      continue;
    }

    const pollData = (await pollResponse.json()) as {
      output?: { task_status?: string; results?: Array<{ url?: string; b64_image?: string }> };
    };
    const status = pollData.output?.task_status;

    if (status === "SUCCEEDED") {
      const results: ImageGenResult[] = [];
      for (const result of pollData.output?.results ?? []) {
        const imageUrl = result.b64_image
          ? `data:image/png;base64,${result.b64_image}`
          : (result.url ?? "");
        if (imageUrl)
          results.push({ imageUrl, model: modelId || "wanx-v1", provider: "dashscope" });
      }
      if (results.length === 0) throw new Error("DashScope returned no image result");
      return results;
    }
    if (status === "FAILED") throw new Error("DashScope image generation task failed");
  }
  throw new Error("DashScope image generation timed out (120s)");
};

const generateWithSiliconFlow: ImageGenProviderHandler = async ({
  apiKey,
  prompt,
  size,
  n,
  baseUrl,
  modelId,
}) => {
  const url = `${normalizeBaseUrl(baseUrl, "https://api.siliconflow.cn")}/v1/images/generations`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  const isQwenImage = /qwen[/-]image/i.test(modelId) && !/edit/i.test(modelId);
  const body: Record<string, unknown> = { model: modelId, prompt };
  if (isQwenImage) {
    body.num_inference_steps = 50;
    body.cfg = 4.0;
  } else {
    body.image_size = size;
    body.batch_size = Math.min(n, 4);
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
    signal: controller.signal,
  });
  clearTimeout(timeout);

  if (!response.ok) {
    const errorText = await response.text().catch(() => "unknown error");
    throw new Error(`SiliconFlow image generation failed (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as {
    images?: Array<{ url?: string }>;
    data?: Array<{ url?: string; b64_json?: string }>;
  };

  const items = data.images ?? data.data ?? [];
  const results: ImageGenResult[] = [];
  for (const item of items) {
    const b64 = (item as { b64_json?: string }).b64_json;
    const imageUrl = b64 ? `data:image/png;base64,${b64}` : (item.url ?? "");
    if (imageUrl) results.push({ imageUrl, model: modelId, provider: "siliconflow" });
  }
  if (results.length === 0) throw new Error("SiliconFlow returned empty image data");
  return results;
};

const generateWithVolcengine: ImageGenProviderHandler = async ({
  apiKey,
  prompt,
  size,
  modelId,
}) => {
  const baseUrl = "https://ark.cn-beijing.volces.com";
  const url = `${baseUrl}/api/v3/images/generations`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);

  // Seedream 4.5+ requires minimum 3686400 pixels
  const isHighResModel = /seedream-(?:4-5|5-0)/.test(modelId);
  let resolvedSize = size || "1024x1024";
  if (isHighResModel) {
    const [w, h] = resolvedSize.split("x").map(Number);
    if (w && h && w * h < 3686400) {
      resolvedSize = "2048x2048";
      log.info(`Seedream ${modelId} requires ≥3686400px, upscaling ${size} → ${resolvedSize}`);
    }
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: modelId,
      prompt,
      size: resolvedSize,
      response_format: "url",
      watermark: false,
    }),
    signal: controller.signal,
  });
  clearTimeout(timeout);

  if (!response.ok) {
    const errorText = await response.text().catch(() => "unknown error");
    throw new Error(`Volcengine Seedream failed (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as {
    data?: Array<{ url?: string; b64_json?: string; revised_prompt?: string }>;
  };

  const results: ImageGenResult[] = [];
  for (const item of data.data ?? []) {
    const imageUrl = item.b64_json ? `data:image/png;base64,${item.b64_json}` : (item.url ?? "");
    if (imageUrl)
      results.push({
        imageUrl,
        revisedPrompt: item.revised_prompt,
        model: modelId,
        provider: "volcengine-ark",
      });
  }
  if (results.length === 0) throw new Error("Volcengine Seedream returned empty image data");
  return results;
};

const generateWithLocal: ImageGenProviderHandler = async ({
  apiKey,
  prompt,
  size,
  n,
  baseUrl,
  modelId,
}) => {
  if (!baseUrl) {
    throw new Error("Local image generation not available: no endpoint configured.");
  }
  const url = `${normalizeBaseUrl(baseUrl, "http://127.0.0.1:50200")}/v1/images/generations`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: modelId || "default",
      prompt,
      size,
      n: Math.min(n, 4),
      response_format: "b64_json",
    }),
    signal: controller.signal,
  });
  clearTimeout(timeout);

  if (!response.ok) {
    const errorText = await response.text().catch(() => "unknown error");
    throw new Error(`Local image generation failed (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as { data?: Array<{ b64_json?: string; url?: string }> };
  const results: ImageGenResult[] = [];
  for (const item of data.data ?? []) {
    const imageUrl = item.b64_json ? `data:image/png;base64,${item.b64_json}` : (item.url ?? "");
    if (imageUrl) results.push({ imageUrl, model: modelId || "local", provider: "local" });
  }
  if (results.length === 0) throw new Error("Local model returned empty image data");
  return results;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function convertSizeToDashScope(size: string): string {
  const mapping: Record<string, string> = {
    "1024x1024": "1024*1024",
    "1792x1024": "1792*1024",
    "1024x1792": "1024*1792",
    "512x512": "512*512",
    "768x768": "768*768",
  };
  return mapping[size] || "1024*1024";
}

function resolveProvider(providerId: string, modelId: string): ImageGenProviderHandler {
  if (providerId === "local") return generateWithLocal;
  if (providerId === "dashscope" || providerId === "tongyi" || providerId === "aliyun")
    return generateWithDashScope;
  if (providerId === "siliconflow") return generateWithSiliconFlow;
  if (providerId === "volcengine-ark" || providerId === "doubao" || modelId.includes("seedream"))
    return generateWithVolcengine;
  if (modelId.includes("dall-e") || modelId.includes("gpt-image") || providerId === "openai")
    return generateWithOpenAI;
  return generateWithOpenAI;
}

/** Detect MIME type from buffer magic bytes (more reliable than server headers). */
function detectMimeFromBuffer(buf: Buffer): string {
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return "image/gif";
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) return "image/webp";
  return "image/png"; // fallback
}

async function resolveImageBuffer(
  imageData: string,
): Promise<{ buffer: Buffer; mimeType: string }> {
  if (imageData.startsWith("data:image/")) {
    const match = imageData.match(/^data:(image\/[^;]+);base64,(.+)$/);
    if (match) {
      return { buffer: Buffer.from(match[2]!, "base64"), mimeType: match[1]! };
    }
  }

  // Remote URL — download with SSRF protection
  const u = new URL(imageData);
  if (u.protocol === "http:" && u.hostname !== "127.0.0.1" && u.hostname !== "localhost") {
    throw new Error(`Refused to fetch image from unsafe HTTP URL: ${u.hostname}`);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const resp = await fetch(imageData, { signal: controller.signal, redirect: "error" });
    if (!resp.ok) throw new Error(`Download failed: ${resp.status}`);
    const ab = await resp.arrayBuffer();
    const buf = Buffer.from(ab);
    if (buf.length > 20_000_000) throw new Error("Image too large (>20MB)");
    // Use magic bytes to detect MIME type (server headers are often wrong)
    const mimeType = detectMimeFromBuffer(buf);
    return { buffer: buf, mimeType };
  } finally {
    clearTimeout(timeout);
  }
}

// SiliconFlow fallback model chain
const SILICONFLOW_FALLBACKS = [
  "Qwen/Qwen-Image",
  "Kwai-Kolors/Kolors",
  "black-forest-labs/FLUX.1-schnell",
  "stabilityai/stable-diffusion-xl-base-1.0",
];

// ---------------------------------------------------------------------------
// Tool Factory
// ---------------------------------------------------------------------------

export function createImageGenTool(sessionKey?: string) {
  return {
    label: "Image Generation",
    name: "image_gen",
    description:
      "Generate images from text descriptions. " +
      "Use this tool when the user asks to create, draw, paint, design, or generate an image, picture, illustration, logo, poster, etc. " +
      "Provide a detailed prompt describing the desired image.",
    parameters: Type.Object({
      prompt: Type.String({ description: "Detailed text description of the image to generate" }),
      size: Type.Optional(
        Type.String({
          description:
            "Image size: 1024x1024 (square, default), 1792x1024 (landscape), 1024x1792 (portrait), 512x512 (fast)",
        }),
      ),
      style: Type.Optional(
        Type.String({
          description:
            "Image style: vivid (default), natural, anime, watercolor, pixel, photorealistic",
        }),
      ),
      quality: Type.Optional(Type.String({ description: "Quality: standard (default), hd" })),
    }),
    execute: async (_toolCallId: string, args: unknown) => {
      const record = args && typeof args === "object" ? (args as Record<string, unknown>) : {};
      const prompt = typeof record.prompt === "string" ? record.prompt.trim() : "";
      if (!prompt) {
        return {
          content: [
            { type: "text" as const, text: "Error: prompt is required for image generation." },
          ],
          details: { error: "missing_prompt" },
        };
      }

      const size = typeof record.size === "string" ? record.size.trim() : "1024x1024";
      const style = typeof record.style === "string" ? record.style.trim() : "vivid";
      const quality = typeof record.quality === "string" ? record.quality.trim() : "standard";
      const resolvedSessionKey = sessionKey || `default-${Date.now()}`;
      const startTime = Date.now();

      try {
        const model = await resolveImageGenModel();
        if (!model) {
          return {
            content: [
              {
                type: "text" as const,
                text: "No image generation model configured. Please configure an image generation model in model settings.",
              },
            ],
            details: { error: "no_image_gen_model" },
          };
        }

        log.info(`Using image gen model: ${model.providerId}/${model.modelId}`);
        const handler = resolveProvider(model.providerId, model.modelId);

        // Fallback chain for SiliconFlow
        let results: ImageGenResult[] = [];
        const modelsToTry = [model.modelId];
        if (model.providerId === "siliconflow") {
          for (const fb of SILICONFLOW_FALLBACKS) {
            if (!modelsToTry.includes(fb)) modelsToTry.push(fb);
          }
        }

        let lastError: Error | undefined;
        for (const candidateModelId of modelsToTry) {
          try {
            results = await handler({
              apiKey: model.apiKey,
              prompt,
              size,
              style,
              quality,
              n: 1,
              baseUrl: model.baseUrl,
              modelId: candidateModelId,
            });
            lastError = undefined;
            break;
          } catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err));
            const msg = lastError.message;
            if (msg.includes("400") || msg.includes("404") || msg.includes("does not exist")) {
              log.warn(`Image gen model ${candidateModelId} failed, trying next...`);
              continue;
            }
            throw lastError;
          }
        }
        if (lastError) throw lastError;

        const durationMs = Date.now() - startTime;
        log.info(`Image generated: ${results.length} image(s), ${durationMs}ms`);

        // Collect display URLs (remote CDN or data URI) for inline rendering.
        // Also persist to disk for gallery/backup, but don't use /api/media/ paths
        // as display URLs because there's no HTTP server serving those files.
        const displayUrls: string[] = [];
        const persistedPaths: string[] = [];
        const persistedIds: string[] = [];
        for (const result of results) {
          // The display URL is always the original provider URL (remote CDN or data URI).
          displayUrls.push(result.imageUrl);

          // Persist to disk as backup (fire-and-forget, don't block rendering).
          try {
            const { buffer, mimeType } = await resolveImageBuffer(result.imageUrl);
            const meta: ImageGenerationMeta = {
              prompt,
              revisedPrompt: result.revisedPrompt,
              model: result.model,
              provider: result.provider,
              size,
              style,
              durationMs,
            };
            // Pass original CDN URL so SQLite stores it for sidebar gallery
            const remoteUrl = result.imageUrl.startsWith("http") ? result.imageUrl : undefined;
            const entry = await saveGeneratedImage({
              sessionKey: resolvedSessionKey,
              data: buffer,
              mimeType,
              meta,
              remoteUrl,
            });
            if (entry) {
              persistedPaths.push(entry.file);
              persistedIds.push(entry.id);
            }
          } catch (persistErr) {
            log.warn(`Failed to persist image: ${(persistErr as Error).message}`);
          }
        }

        // Build response
        const firstResult = results[0]!;
        const lines = ["Image generated successfully."];
        if (firstResult.revisedPrompt) lines.push(`\nRevised prompt: ${firstResult.revisedPrompt}`);
        for (const url of displayUrls) {
          lines.push(`MEDIA:${url}`);
        }

        const imageMetaBlock = {
          type: "text" as const,
          text: `<!--OPENCLAWCN_IMAGE_GEN:${JSON.stringify({
            imageUrl: displayUrls[0],
            imageUrls: displayUrls,
            imageFiles: persistedPaths,
            mediaIds: persistedIds,
            imageCount: results.length,
            model: `${firstResult.provider}/${firstResult.model}`,
            provider: firstResult.provider,
            prompt,
            size,
            style,
            durationMs,
            revisedPrompt: firstResult.revisedPrompt,
          })}-->`,
        };

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }, imageMetaBlock],
          details: {
            model: `${firstResult.provider}/${firstResult.model}`,
            provider: firstResult.provider,
            imageUrl: displayUrls[0],
            imageUrls: displayUrls,
            imageFiles: persistedPaths,
            mediaIds: persistedIds,
            imageCount: results.length,
            prompt,
            size,
            style,
            durationMs,
            revisedPrompt: firstResult.revisedPrompt,
          },
        };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        log.error(`Image generation failed: ${errorMsg}`);
        return {
          content: [{ type: "text" as const, text: `Image generation failed: ${errorMsg}` }],
          details: { error: errorMsg, prompt, size, style },
        };
      }
    },
  };
}
