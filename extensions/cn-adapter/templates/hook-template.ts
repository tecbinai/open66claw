/**
 * Hook 模板 — 替换 "my-feature" 为你的功能名称
 *
 * 使用方法：
 * 1. 复制此文件到 hooks/my-feature.ts
 * 2. 替换所有 "my-feature" / "MyFeature" 标记
 * 3. 在 hooks/index.ts 中 re-export
 * 4. 在 index.ts 中注册
 *
 * 注册示例（在 index.ts 中）：
 *   import { createMyFeatureHandler } from "./hooks/index.js";
 *   api.on(
 *     "before_prompt_build",  // ← 替换为实际 hook 名称
 *     safeHook("before_prompt_build:my-feature", createMyFeatureHandler(getConfig)),
 *     { priority: 100 },
 *   );
 *
 * 常用 hook 名称：
 *   before_prompt_build  — 注入 system prompt
 *   before_model_resolve — 覆盖模型选择
 *   before_tool_call     — 拦截/修改工具调用
 *   agent_end            — 会话结束后处理
 *   before_compaction    — 上下文压缩前处理
 */

import type { CnPluginConfig } from "./cn-config.js";

// ← 替换为实际的 hook event 类型
type HookEvent = {
  // 根据 hook 名称不同，event 结构不同，参考上游类型定义
  [key: string]: unknown;
};

// ← 替换为实际的 hook 返回类型
type HookResult =
  | {
      // before_prompt_build 返回 { prependSystemContext?: string }
      // before_tool_call 返回 { blocked?: boolean; reason?: string }
      // agent_end 返回 void
      [key: string]: unknown;
    }
  | undefined;

/**
 * 创建 my-feature hook handler。
 *
 * 使用闭包捕获 getConfig，这样每次 hook 触发时都能读到最新配置。
 */
export function createMyFeatureHandler(
  getConfig: () => CnPluginConfig,
): (event: HookEvent) => Promise<HookResult> {
  return async (_event: HookEvent): Promise<HookResult> => {
    const config = getConfig();

    // ← 替换为你的功能逻辑
    // 示例：根据配置决定是否注入 prompt
    if (!config) {
      return undefined; // 返回 undefined 表示不干预
    }

    // 示例：before_prompt_build 的返回值
    return {
      prependSystemContext: "<!-- my-feature prompt injection -->",
    };
  };
}
