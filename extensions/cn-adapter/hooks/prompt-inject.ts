import { discoverTools } from "../dispatch/tool-discovery.js";
import { createCnLogger } from "../utils/index.js";
import type { CnPluginConfig } from "./cn-config.js";
import { setDispatchIntent } from "./tool-filter.js";

const log = createCnLogger("dispatch:prompt");

const CN_SYSTEM_CONTEXT = `
你正在为一位中国用户提供服务。请注意：
- 默认使用中文回复
- 使用中国常用的技术栈和工具链（如 pnpm、Vite 等）
- 引用文档时优先使用中文文档源
- 时区为 Asia/Shanghai (UTC+8)
`.trim();

/**
 * 生图/生视频工具使用指令。
 * 通过 system prompt 注入告诉模型它有这些工具可用。
 * 关键：必须说 "你可以生成图片" 并指令 MUST call，
 * 否则模型会说 "我无法生成图片"。
 */
const MEDIA_GEN_DIRECTIVES = `

IMAGE GENERATION: You CAN generate images — you have an image_gen tool. When the user asks to draw, create, generate, or design an image/picture/illustration/poster/logo, you MUST call the image_gen tool with a detailed prompt. NEVER say you cannot generate images.

VIDEO GENERATION: You CAN generate videos — you have a video_gen tool. When the user asks to generate, create, or make a video/animation, you MUST call the video_gen tool with a detailed prompt. NEVER say you cannot generate videos.

VIDEO UNDERSTANDING: You CAN analyze videos — you have a video_understand tool. When the user sends a video URL or asks to analyze, describe, or understand a video, you MUST call the video_understand tool with the video URL. NEVER say you cannot understand videos.

MEDIA DELIVERY: When you generate, save, or create a file (image, audio, video, document) that the user wants to receive, output a line in the format MEDIA:<path_or_url> (e.g. MEDIA:/tmp/screenshot.png or MEDIA:https://cdn.example.com/img.png). This tells the system to deliver the file to the user's chat channel (Feishu, DingTalk, WeChat, etc.). Do NOT just print the file path as plain text — always use the MEDIA: directive so the file is actually sent.
`.trim();

/**
 * Vision 模型指令。
 * 当主模型支持图片理解时注入，告诉模型图片已自动嵌入在对话中，
 * 不需要调用任何工具（image / browser screenshot）来查看用户发的图片。
 */
const VISION_MODEL_DIRECTIVE = `
IMAGE UNDERSTANDING: You have native vision capability. When the user sends images in the chat, they are AUTOMATICALLY embedded in the conversation — you can see them DIRECTLY. Do NOT call the browser tool to screenshot or the image tool to analyze images that the user already sent in their message. Simply describe what you see. Only use the image tool for local files not already in the conversation.
`.trim();

/**
 * Non-vision 模型的图片理解指令。
 * 当主模型不支持 vision 但系统有 image 工具可用时注入，
 * 引导模型调用 image 工具来分析用户发送的图片。
 */
const IMAGE_TOOL_FALLBACK_DIRECTIVE = `
IMAGE UNDERSTANDING: Your current model does NOT have native vision, but you CAN analyze images using the \`image\` tool. When the user sends images in the chat, the system will save them to temporary files and provide the file paths in the prompt. You MUST call the \`image\` tool with those file paths to analyze the images. NEVER say you cannot see or understand images — always use the image tool.
`.trim();

export function createPromptInjectHandler(getConfig: () => CnPluginConfig) {
  return async (event: { prompt: string; messages: unknown[] }) => {
    const config = getConfig();

    const result: Record<string, string> = {};

    // 基础：中文系统上下文注入（排除法，与原实现一致）
    if (config.locale !== "zh-CN" && config.locale !== "zh-TW") {
      return {};
    }
    result.prependSystemContext = CN_SYSTEM_CONTEXT;

    // 注入生图/生视频工具使用指令
    result.prependSystemContext += "\n\n" + MEDIA_GEN_DIRECTIVES;

    // Vision 模型提示：根据默认模型是否支持 vision 注入不同指令
    // - 若支持 vision → 注入 VISION_MODEL_DIRECTIVE（图片自动嵌入）
    // - 若不支持 vision → 注入 IMAGE_TOOL_FALLBACK_DIRECTIVE（引导用 image 工具）
    let modelHasVision = false;
    try {
      const { PROVIDERS } = await import("../gateway/provider-registry.js");

      // 从 cn-adapter config 或 openclaw.json 获取默认模型的 provider
      let providerId = config.models?.default?.provider;
      let modelId: string | undefined;

      if (!providerId) {
        // 直接读 openclaw.json 的 agents.defaults.model（格式: "provider/modelId"）
        try {
          const { readFileSync } = await import("node:fs");
          const { join } = await import("node:path");
          const { homedir } = await import("node:os");
          const ocPath = join(homedir(), ".openclaw", "openclaw.json");
          const oc = JSON.parse(readFileSync(ocPath, "utf-8"));
          const modelRef = oc?.agents?.defaults?.model as string | undefined;
          if (modelRef && modelRef.includes("/")) {
            providerId = modelRef.split("/")[0];
            modelId = modelRef.split("/").slice(1).join("/");
          }
        } catch { /* 读配置失败继续 */ }
      }

      if (providerId) {
        const meta = PROVIDERS.find((p) => p.providerId === providerId);
        if (meta?.capabilities?.includes("vision")) {
          // Provider 支持 vision，但需检查具体模型的 input 字段
          if (modelId) {
            try {
              const { readFileSync } = await import("node:fs");
              const { join } = await import("node:path");
              const { homedir } = await import("node:os");
              const ocPath = join(homedir(), ".openclaw", "openclaw.json");
              const oc = JSON.parse(readFileSync(ocPath, "utf-8"));
              const models = oc?.models?.providers?.[providerId]?.models as
                | Array<{ id: string; input?: string[] }>
                | undefined;
              const modelDef = models?.find((m) => m.id === modelId);
              modelHasVision = modelDef?.input?.includes("image") ?? true;
            } catch {
              modelHasVision = true; // 读取失败时信任 provider 级别能力
            }
          } else {
            modelHasVision = true;
          }
        }
      }
    } catch {
      /* provider-registry 加载失败时跳过 */
    }

    if (modelHasVision) {
      result.prependSystemContext += "\n\n" + VISION_MODEL_DIRECTIVE;
    } else {
      // 主模型不支持 vision → 注入 image tool fallback 指令
      result.prependSystemContext += "\n\n" + IMAGE_TOOL_FALLBACK_DIRECTIVE;
    }

    // Dispatch: tool discovery 摘要注入
    if (config.toolFilterMode !== "off" && event.prompt) {
      const discovery = discoverTools(event.prompt);

      if (discovery.confidence > 0.15 && discovery.summary) {
        // 将 discovery 摘要追加到系统上下文
        result.prependSystemContext += `\n\n[Tool Discovery] ${discovery.summary}`;

        // 从 discovery 结果推断意图，设置给 tool-filter 使用
        const intent = inferIntentFromTools(discovery.toolHints);
        setDispatchIntent(intent, "intent");

        log.debug(
          `discovery → intent="${intent}", tools=[${discovery.toolHints.join(",")}], ` +
            `confidence=${discovery.confidence.toFixed(2)}, ${discovery.latencyMs.toFixed(0)}ms`,
        );
      }
    }

    return result;
  };
}

/**
 * 从 discovery 的工具推荐列表推断用户意图。
 * 简单规则：看推荐工具中哪个 intent 类别命中最多。
 *
 * 注意：core tools（read/write/edit/glob/grep/bash）不参与投票，
 * 因为它们几乎在任何 prompt 中都会被 discovery 命中，
 * 会导致意图推断严重偏向 "coding"。
 */
const TOOL_TO_INTENT: Record<string, string> = {
  wechat_send: "wechat_operation",
  wechat_read: "wechat_operation",
  wechat_check: "wechat_operation",
  wecom_send: "wechat_operation",
  wecom_read: "wechat_operation",
  desktop_control: "desktop_control",
  open_app: "desktop_control",
  browser: "web_browsing",
  web_search: "general",
  web_fetch: "general",
  image_gen: "image_generation",
  image: "image_generation",
  video_gen: "video_generation",
  video_understand: "video_understanding",
  tts: "audio_processing",
  apply_patch: "coding",
  sessions_spawn: "general",
  message: "general",
  // core tools (read/write/edit/glob/grep/bash) 故意不映射，
  // 它们是通用工具，不应影响意图判断。
};

function inferIntentFromTools(toolHints: string[]): string {
  if (toolHints.length === 0) return "general";

  const votes: Record<string, number> = {};
  for (const tool of toolHints) {
    const intent = TOOL_TO_INTENT[tool];
    if (!intent) continue; // 跳过 core tools / 未映射工具
    votes[intent] = (votes[intent] ?? 0) + 1;
  }

  // 找票数最多的意图，无票时 fallback general
  let best = "general";
  let bestCount = 0;
  for (const [intent, count] of Object.entries(votes)) {
    if (count > bestCount) {
      best = intent;
      bestCount = count;
    }
  }

  return best;
}
