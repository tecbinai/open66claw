/**
 * CN Adapter Tools — 注册入口。
 *
 * 将生图/生视频工具通过上游 registerTool() API 注册为插件工具。
 * 工具会出现在模型的 tool 列表中，模型可以自主调用。
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import type { OpenClawPluginToolFactory } from "openclaw/plugin-sdk/lobster";
import { createCnLogger } from "../utils/index.js";
import { createImageGenTool } from "./image-gen.js";
import { createVideoGenTool } from "./video-gen.js";
import { createVideoUnderstandTool } from "./video-understand.js";

const log = createCnLogger("tools");

export function registerCnTools(api: OpenClawPluginApi): void {
  // image_gen — 生图工具
  api.registerTool(((ctx) => {
    return createImageGenTool(ctx.sessionKey);
  }) as OpenClawPluginToolFactory);

  // video_gen — 生视频工具
  api.registerTool(((ctx) => {
    return createVideoGenTool(ctx.sessionKey);
  }) as OpenClawPluginToolFactory);

  // video_understand — 视频理解工具
  api.registerTool(((ctx) => {
    return createVideoUnderstandTool(ctx.sessionKey);
  }) as OpenClawPluginToolFactory);

  log.info("Registered tools: image_gen, video_gen, video_understand");
}
