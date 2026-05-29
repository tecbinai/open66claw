/**
 * MCP Marketplace Types
 * CN-ONLY FILE — 不影响上游 OpenClaw
 */

// ============================================================================
// Core Item (matches UI McpMarketplaceItem from app-view-state.ts)
// ============================================================================

export interface McpMarketplaceItem {
  serverId: string;
  friendlyName: string;
  friendlyNameEn: string;
  description: string;
  descriptionEn: string;
  category: string;
  tags: string[];
  version: string;
  npmPackage: string;
  securityScore: number;
  requiresApiKey: boolean;
  apiKeyName?: string;
  apiKeyGuideUrl?: string;
  platforms: string[];
  isOfficial: boolean;
  isNew: boolean;
  toolCount: number;
  installStatus: "not_installed" | "installing" | "installed" | "error";
  errorMessage?: string;
  capabilities?: string[];
  examplePrompts?: string[];
  toolNames?: string[];
  installedVersion?: string;
  hasUpdate?: boolean;
  installable?: boolean;
  installMethod?: "npm" | "pypi" | "sse" | "none";
  sourceUrl?: string;
  source?: string;
  configHint?: string;
  envSchema?: Record<string, { description?: string; type?: string; placeholder?: string }>;
  envRequired?: string[];
  sseUrl?: string;
  isVerified?: boolean;
  isHosted?: boolean;
}

// ============================================================================
// Paginated Data File Structures
// ============================================================================

/** meta.json 结构 */
export interface CatalogMeta {
  totalItems: number;
  categories: Record<string, { count: number; pages: number }>;
  generatedAt: string;
  sourceVersion: string;
}

/** search-index.json 中每条的精简结构 */
export interface SearchIndexEntry {
  /** serverId */
  id: string;
  /** friendlyName (中文优先) */
  n: string;
  /** description 前 80 字 */
  d: string;
  /** tags */
  t: string[];
  /** category */
  c: string;
  /** installMethod */
  m: string;
}

// ============================================================================
// List & Search
// ============================================================================

export interface MarketplaceListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  category?: string;
}

export interface MarketplaceListResult {
  items: McpMarketplaceItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ============================================================================
// Install
// ============================================================================

export interface InstallParams {
  serverId: string;
  env?: Record<string, string>;
  overrideSseUrl?: string;
  overrideNpmPackage?: string;
  overridePypiPackage?: string;
}

export interface InstallResult {
  success: boolean;
  serverId: string;
  toolCount?: number;
  error?: string;
  systemDepsWarning?: string[];
}

// ============================================================================
// MCP Server Config (compatible with upstream .mcp.json)
// ============================================================================

export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

// ============================================================================
// Old v5 Data Format (for build script field mapping)
// ============================================================================

export interface V5McpEntry {
  serverId: string;
  friendlyName: string;
  friendlyNameEn?: string;
  friendlyNameCn?: string;
  description: string;
  descriptionEn?: string;
  descriptionCn?: string;
  category: string;
  tags?: string[];
  tagsCn?: string[];
  version?: string;
  requiresApiKey?: boolean;
  platforms?: string[];
  isOfficial?: boolean;
  isNew?: boolean;
  toolCount?: number;
  source?: string;
  sourceUrl?: string;
  viewCount?: number;
  isHosted?: boolean;
  isVerified?: boolean;
  logoUrl?: string;
  installCommand?: string;
  installArgs?: string[];
  installTransport?: string;
  npmPackage?: string;
  pypiPackage?: string;
  availability?: {
    requiresVPN?: boolean;
    chinaFriendlyScore?: number;
    chinaBlockReasons?: string[];
  };
  requirements?: {
    runtimeDeps?: string[];
    platformNotes?: string;
    systemDeps?: string[];
  };
  serverConfig?: {
    command?: string;
    args?: string[];
    env?: Record<string, string>;
  };
  envSchema?: Record<string, { description?: string; type?: string }>;
  envRequired?: string[];
  categoryEnhanced?: Array<{ category: string; confidence: number }>;
  aiEnhancement?: {
    enhancedAt?: string;
    model?: string;
    version?: number;
    recommendationScore?: {
      beginnerFriendly?: number;
      enterpriseReady?: number;
      communityActivity?: number;
    };
    useCaseKeywords?: string[];
  };
}

// ============================================================================
// Mirror Types
// ============================================================================

export type MirrorType = "npm" | "pypi" | "github";

export interface MirrorConfig {
  type: MirrorType;
  url: string;
  label: string;
}

export interface MirrorMemory {
  mirrors: Record<MirrorType, { url: string; timestamp: number }>;
}
