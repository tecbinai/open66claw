/**
 * Modality Guard — 在 chat.send 前检查能力并引导配置
 *
 * 集成到聊天发送流程中，当用户发送图片/视频或请求图片生成时，
 * 自动检测能力并在需要时弹出配置引导。
 */

import type { GatewayBrowserClient } from "../gateway";
import type { ChatAttachment } from "../ui-types";
import { checkAndGuideModalityConfig } from "../views/modality-config-guide";

export type ModalityGuardOptions = {
  client: GatewayBrowserClient;
  message: string;
  attachments?: ChatAttachment[];
};

/**
 * 在发送消息前检查多模态能力
 *
 * @returns true 表示可以继续发送，false 表示需要用户先配置
 */
export async function checkModalityBeforeSend(
  options: ModalityGuardOptions,
): Promise<{ canProceed: boolean }> {
  const { client, message, attachments = [] } = options;

  // 提取附件的 MIME 类型
  const attachmentMimeTypes = attachments
    .map((att) => {
      // 从 dataUrl 提取 MIME 类型
      const match = /^data:([^;]+);base64,/.exec(att.dataUrl);
      return match ? match[1] : att.mimeType;
    })
    .filter((mime): mime is string => typeof mime === "string");

  const result = await checkAndGuideModalityConfig({
    client,
    prompt: message,
    attachments: attachmentMimeTypes.map((mimeType) => ({ mimeType })),
    onConfigured: () => {
      // 用户点击"前往配置"后，跳转到配置页面
      // 配置页面会自动聚焦到相关的配置项
    },
    onCancelled: () => {
      // 用户点击"稍后配置"，取消本次发送
    },
  });

  return { canProceed: result.canProceed };
}
