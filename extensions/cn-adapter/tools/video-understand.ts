/**
 * Video Understanding Tool — 视频理解工具（cn-adapter 插件注册）。
 *
 * 通过 OpenClaw 插件 API registerTool() 注册，不侵入上游。
 * 支持视频 URL 输入，调用多模态视觉模型分析视频内容。
 *
 * 支持的模型：qwen-vl-max, doubao-1.5-pro, MiniMax-VL-01, glm-4v, gemini 等。
 * 调用方式：OpenAI-compatible /chat/completions，视频以 URL 形式传入。
 */

import { Type } from "@sinclair/typebox";
import { createCnLogger } from "../utils/index.js";
import { resolveVideoUnderstandModel } from "./model-resolver.js";

const log = createCnLogger("tools:video-understand");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type VideoUnderstandResult = {
  analysis: string;
  model: string;
  provider: string;
  latencyMs: number;
};

// ---------------------------------------------------------------------------
// Provider Handler — OpenAI-compatible /chat/completions with video URL
// ---------------------------------------------------------------------------

function normalizeBaseUrl(url: string | undefined, fallback: string): string {
  const base = (url || fallback).replace(/\/+$/, "");
  return base.endsWith("/v1") ? base.slice(0, -3) : base;
}

/**
 * 通过 OpenAI-compatible API 发送视频理解请求。
 * 多数 CN 模型支持在 content array 中通过 video_url 或 image_url 传入视频。
 */
async function analyzeVideo(params: {
  apiKey: string;
  baseUrl: string;
  modelId: string;
  videoUrl: string;
  prompt: string;
}): Promise<VideoUnderstandResult> {
  const startTime = Date.now();
  const base = normalizeBaseUrl(params.baseUrl, "");
  const url = `${base}/v1/chat/completions`;

  // 构建多模态消息内容
  // 大多数 CN 模型（通义千问、豆包、智谱等）支持 video_url type
  const contentParts: unknown[] = [];

  // 视频内容 — 优先用 video_url type，回退到 image_url
  if (isVideoUrl(params.videoUrl)) {
    contentParts.push({
      type: "video_url",
      video_url: { url: params.videoUrl },
    });
  } else {
    // 某些模型可能需要 image_url 类型来处理视频
    contentParts.push({
      type: "image_url",
      image_url: { url: params.videoUrl },
    });
  }

  // 分析指令
  contentParts.push({
    type: "text",
    text: params.prompt || "请详细描述这个视频的内容。",
  });

  const body = {
    model: params.modelId,
    messages: [
      {
        role: "user",
        content: contentParts,
      },
    ],
    max_tokens: 2048,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`Video understand API error ${response.status}: ${errText.slice(0, 500)}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const analysis = data.choices?.[0]?.message?.content ?? "";
  if (!analysis) {
    throw new Error("Video understand API returned empty response");
  }

  return {
    analysis,
    model: params.modelId,
    provider: "", // filled by caller
    latencyMs: Date.now() - startTime,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** 检测是否为视频 URL（非图片） */
function isVideoUrl(url: string): boolean {
  const lower = url.toLowerCase();
  const videoExts = [".mp4", ".avi", ".mov", ".mkv", ".webm", ".flv", ".wmv", ".m4v"];
  if (videoExts.some((ext) => lower.includes(ext))) return true;
  // 包含 video 关键词的 URL 也认为是视频
  if (lower.includes("video") || lower.includes("/v/")) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Tool Factory
// ---------------------------------------------------------------------------

export function createVideoUnderstandTool(_sessionKey?: string) {
  return {
    label: "Video Understanding",
    name: "video_understand",
    description:
      "Analyze and understand video content from a URL. " +
      "Use this tool when the user asks to analyze, describe, summarize, or understand a video. " +
      "Provide a video URL and an optional analysis prompt.",
    parameters: Type.Object({
      video_url: Type.String({
        description: "URL of the video to analyze (supports mp4, avi, mov, mkv, webm etc.)",
      }),
      prompt: Type.Optional(
        Type.String({
          description: "Specific analysis instructions (e.g., 'describe the main events', 'identify objects'). Defaults to general description.",
        }),
      ),
    }),
    execute: async (_toolCallId: string, args: unknown) => {
      const record = args && typeof args === "object" ? (args as Record<string, unknown>) : {};
      const videoUrl = typeof record.video_url === "string" ? record.video_url.trim() : "";
      if (!videoUrl) {
        return {
          content: [
            { type: "text" as const, text: "Error: video_url is required for video understanding." },
          ],
          details: { error: "missing_video_url" },
        };
      }

      const prompt = typeof record.prompt === "string" ? record.prompt.trim() : "";

      try {
        const model = await resolveVideoUnderstandModel();
        if (!model) {
          return {
            content: [
              {
                type: "text" as const,
                text: "No video understanding model configured. Please configure a model with video capability in model settings.",
              },
            ],
            details: { error: "no_video_model" },
          };
        }

        log.info(`Using video understand model: ${model.providerId}/${model.modelId}`);

        const result = await analyzeVideo({
          apiKey: model.apiKey,
          baseUrl: model.baseUrl,
          modelId: model.modelId,
          videoUrl,
          prompt: prompt || "请详细描述这个视频的内容，包括画面中的主要元素、动作和场景。",
        });

        log.info(
          `Video analysis complete: ${model.providerId}/${model.modelId}, ` +
            `${result.latencyMs}ms, ${result.analysis.length} chars`,
        );

        return {
          content: [
            {
              type: "text" as const,
              text: result.analysis,
            },
          ],
          details: {
            provider: model.providerId,
            model: model.modelId,
            latencyMs: result.latencyMs,
            videoUrl,
          },
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.warn(`Video understand failed: ${msg}`);

        // 区分错误类型
        if (msg.includes("401") || msg.includes("403")) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Video understanding failed: API authentication error. Please check your API key configuration. (${msg.slice(0, 200)})`,
              },
            ],
            details: { error: "auth_failed" },
          };
        }

        return {
          content: [
            {
              type: "text" as const,
              text: `Video understanding failed: ${msg.slice(0, 500)}`,
            },
          ],
          details: { error: "api_error", message: msg.slice(0, 500) },
        };
      }
    },
  };
}
