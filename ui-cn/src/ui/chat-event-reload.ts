// [CN-MERGE:dc6afeb4f8] Skip unnecessary full history reloads on final events
import type { ChatEventPayload } from "./controllers/chat.ts";

export function shouldReloadHistoryForFinalEvent(payload?: ChatEventPayload): boolean {
  if (!payload || payload.state !== "final") {
    return false;
  }
  // [CN-FIX:image-display] Always reload on final. The previous optimization that
  // skipped reload for text-only final messages was wrong: when tools are used
  // (e.g. image_gen), the final message is plain text ("Here's your cat!") with
  // NO tool_use blocks — but the toolResult messages (containing image URLs) are
  // only in the JSONL. Without a reload, buildChatItems never sees the toolResult
  // and images/videos never render.
  return true;
}
