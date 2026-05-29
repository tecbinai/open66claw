/**
 * mcp-shared.ts
 * Shared constants and helpers for MCP marketplace views.
 *
 * Eliminates duplication between extensions-page.ts and mcp-store-section.ts.
 */

import type { McpMarketplaceItem, McpMarketplaceState } from "../app-view-state.js";
import type { IconName } from "../icons.js";

// ============================================================================
// Category definitions
// ============================================================================

export const MCP_CATEGORIES: ReadonlyArray<{ id: string; icon: IconName }> = [
  { id: "all", icon: "sparkles" },
  { id: "filesystem", icon: "folder" },
  { id: "database", icon: "hardDrive" },
  { id: "search", icon: "search" },
  { id: "productivity", icon: "zap" },
  { id: "development", icon: "wrench" },
  { id: "network", icon: "globe" },
  { id: "smarthome", icon: "home" },
  { id: "ai", icon: "brain" },
  { id: "social", icon: "smartphone" },
  { id: "other", icon: "puzzle" },
] as const;

export const MCP_MAX_RUNNING = 7;

// ============================================================================
// Category icon map (for cards)
// ============================================================================

export const CATEGORY_ICON: Record<string, IconName> = Object.fromEntries(
  MCP_CATEGORIES.filter((c) => c.id !== "all").map((c) => [c.id, c.icon]),
);

// ============================================================================
// Filter + sort helper
// ============================================================================

export function filterMarketplaceItems(state: McpMarketplaceState): McpMarketplaceItem[] {
  let items = state.items;

  // NOTE: search and category filtering is now handled server-side (SQLite).
  // Only client-side sort is applied here.

  // Helper: installable items always sort before non-installable
  const canInstall = (i: McpMarketplaceItem) =>
    i.installable !== false && i.installMethod !== "none";

  // Sort
  switch (state.sort) {
    case "newest":
      items = [...items].sort((a, b) => {
        const ia = canInstall(a) ? 0 : 1,
          ib = canInstall(b) ? 0 : 1;
        if (ia !== ib) return ia - ib;
        return (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0);
      });
      break;
    case "name":
      items = [...items].sort((a, b) => {
        const ia = canInstall(a) ? 0 : 1,
          ib = canInstall(b) ? 0 : 1;
        if (ia !== ib) return ia - ib;
        return a.friendlyName.localeCompare(b.friendlyName);
      });
      break;
    case "popular":
      items = [...items].sort((a, b) => {
        const ia = canInstall(a) ? 0 : 1,
          ib = canInstall(b) ? 0 : 1;
        if (ia !== ib) return ia - ib;
        return (b.toolCount ?? 0) - (a.toolCount ?? 0);
      });
      break;
    default: // recommended
      items = [...items].sort((a, b) => {
        const ia = canInstall(a) ? 0 : 1,
          ib = canInstall(b) ? 0 : 1;
        if (ia !== ib) return ia - ib;
        // Official first, then by security score
        if (a.isOfficial !== b.isOfficial) return a.isOfficial ? -1 : 1;
        return (b.securityScore ?? 0) - (a.securityScore ?? 0);
      });
  }

  return items;
}
