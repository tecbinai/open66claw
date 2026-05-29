/**
 * Media Module — Shared type definitions
 *
 * CN-only media metadata storage types.
 * Used by media-db, chat-image-store, and chat-video-store.
 */

// ---------------------------------------------------------------------------
// SQLite row type (matches cn_media_assets table schema)
// ---------------------------------------------------------------------------

export interface MediaAssetRow {
  id: string;
  session_key: string;
  type: "image" | "video";
  file: string;
  url: string;
  mime_type: string | null;
  size_bytes: number | null;
  source: "upload" | "generated";
  prompt: string | null;
  revised_prompt: string | null;
  model: string | null;
  provider: string | null;
  image_size: string | null;
  style: string | null;
  seed: number | null;
  duration_ms: number | null;
  duration_secs: number | null;
  cover_url: string | null;
  message_text: string | null;
  created_at: string;
  expires_at: string | null;
}

// ---------------------------------------------------------------------------
// Image types
// ---------------------------------------------------------------------------

export interface ImageGenerationMeta {
  prompt: string;
  revisedPrompt?: string;
  model: string;
  provider: string;
  size: string;
  style?: string;
  seed?: number;
  durationMs?: number;
}

export interface ChatImageEntry {
  id: string;
  file: string;
  mimeType: string;
  sizeBytes: number;
  timestamp: number;
  messageText: string;
  createdAt: string;
  source?: "upload" | "generated";
  generationMeta?: ImageGenerationMeta;
}

// ---------------------------------------------------------------------------
// Video types
// ---------------------------------------------------------------------------

export interface VideoGenerationMeta {
  prompt: string;
  model: string;
  provider: string;
  size: string;
  durationSeconds?: number;
  coverImageUrl?: string;
}

export interface ChatVideoEntry {
  id: string;
  file: string;
  mimeType: string;
  sizeBytes: number;
  timestamp: number;
  messageText: string;
  createdAt: string;
  source: "generated";
  generationMeta: VideoGenerationMeta;
}

// ---------------------------------------------------------------------------
// Retention constants
// ---------------------------------------------------------------------------

/** Uploaded images: 7 days */
export const DEFAULT_IMAGE_RETENTION_DAYS = 7;
/** AI-generated images: 30 days (users revisit them) */
export const GENERATED_IMAGE_RETENTION_DAYS = 30;
/** Videos: 365 days (high production cost) */
export const VIDEO_RETENTION_DAYS = 365;
/** Max rows in cn_media_assets before oldest get pruned */
export const MAX_MEDIA_ROWS = 1000;
