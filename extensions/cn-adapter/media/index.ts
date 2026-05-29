/**
 * Media Module — CN-only media metadata storage
 *
 * Re-exports all public APIs from sub-modules.
 */

// Types
export type {
  MediaAssetRow,
  ChatImageEntry,
  ImageGenerationMeta,
  ChatVideoEntry,
  VideoGenerationMeta,
} from "./types.js";

export {
  DEFAULT_IMAGE_RETENTION_DAYS,
  GENERATED_IMAGE_RETENTION_DAYS,
  VIDEO_RETENTION_DAYS,
  MAX_MEDIA_ROWS,
} from "./types.js";

// Media DB
export {
  openMediaDb,
  closeMediaDb,
  openMediaDbMemory,
  insertMediaAsset,
  insertMediaAssets,
  queryBySession,
  queryById,
  queryByIds,
  deleteBySession,
  deleteExpired,
  countAll,
  capMediaRows,
  runMediaDbMaintenance,
} from "./media-db.js";

// Chat Image Store
export {
  saveChatImage,
  saveGeneratedImage,
  resolveChatImagePath,
  loadChatImages,
  loadChatImageData,
  cleanExpiredChatImages,
} from "./chat-image-store.js";

// Chat Video Store
export {
  saveGeneratedVideo,
  resolveChatVideoPath,
  loadChatVideos,
  cleanExpiredChatVideos,
} from "./chat-video-store.js";

// Service registration
export { registerMediaService } from "./service.js";
