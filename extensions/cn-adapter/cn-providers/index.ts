/**
 * CN Providers 注册入口
 *
 * 注册上游缺失的国产模型提供商。当前注册：
 * - SiliconFlow (硅基流动) — 上游仅有 thinking 兼容处理，无完整 Provider
 * - 火山引擎 Embedding — 上游有 volcengine chat 模型，但无 embedding 模型
 *
 * 上游已覆盖的提供商（不重复注册）：
 * - MiniMax / MiniMax Portal (minimax / minimax-portal)
 * - Moonshot / Kimi Coding (moonshot / kimi-coding)
 * - Qwen Portal (qwen-portal)
 * - 豆包 / BytePlus (volcengine / byteplus)
 * - 百度千帆 (qianfan)
 * - 小米 MIMO (xiaomi)
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { buildVolcengineEmbeddingProvider } from "./embedding.js";
import { buildSiliconFlowProvider } from "./siliconflow.js";

/**
 * 注册上游缺失的 CN 提供商。
 * 在 cn-adapter register() 中的 Step 2 之后调用。
 */
export function registerCnProviders(api: OpenClawPluginApi): void {
  api.registerProvider(buildSiliconFlowProvider());
  api.registerProvider(buildVolcengineEmbeddingProvider());
}
