import { html, nothing } from "lit";
import { t } from "../i18n/index.js";
import { icons } from "../icons";
import type { ConfigUiHints } from "../types";
import { renderNode } from "./config-form.node";
import { hintForPath, resolveLabel, schemaType, type JsonSchema } from "./config-form.shared";

export type ConfigFormProps = {
  schema: JsonSchema | null;
  uiHints: ConfigUiHints;
  value: Record<string, unknown> | null;
  disabled?: boolean;
  unsupportedPaths?: string[];
  searchQuery?: string;
  activeSection?: string | null;
  activeSubsection?: string | null;
  onPatch: (path: Array<string | number>, value: unknown) => void;
};

// SVG Icons for section cards (Lucide-style)
const sectionIcons = {
  env: html`
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <circle cx="12" cy="12" r="3"></circle>
      <path
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"
      ></path>
    </svg>
  `,
  update: html`
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
      <polyline points="7 10 12 15 17 10"></polyline>
      <line x1="12" y1="15" x2="12" y2="3"></line>
    </svg>
  `,
  agents: html`
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <path
        d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"
      ></path>
      <circle cx="8" cy="14" r="1"></circle>
      <circle cx="16" cy="14" r="1"></circle>
    </svg>
  `,
  auth: html`
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
    </svg>
  `,
  channels: html`
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
    </svg>
  `,
  messages: html`
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
      <polyline points="22,6 12,13 2,6"></polyline>
    </svg>
  `,
  commands: html`
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <polyline points="4 17 10 11 4 5"></polyline>
      <line x1="12" y1="19" x2="20" y2="19"></line>
    </svg>
  `,
  hooks: html`
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
    </svg>
  `,
  skills: html`
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <polygon
        points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
      ></polygon>
    </svg>
  `,
  tools: html`
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <path
        d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"
      ></path>
    </svg>
  `,
  gateway: html`
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="2" y1="12" x2="22" y2="12"></line>
      <path
        d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
      ></path>
    </svg>
  `,
  wizard: html`
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <path d="M15 4V2"></path>
      <path d="M15 16v-2"></path>
      <path d="M8 9h2"></path>
      <path d="M20 9h2"></path>
      <path d="M17.8 11.8 19 13"></path>
      <path d="M15 9h0"></path>
      <path d="M17.8 6.2 19 5"></path>
      <path d="m3 21 9-9"></path>
      <path d="M12.2 6.2 11 5"></path>
    </svg>
  `,
  // Additional sections
  meta: html`
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <path d="M12 20h9"></path>
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path>
    </svg>
  `,
  logging: html`
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
      <polyline points="14 2 14 8 20 8"></polyline>
      <line x1="16" y1="13" x2="8" y2="13"></line>
      <line x1="16" y1="17" x2="8" y2="17"></line>
      <polyline points="10 9 9 9 8 9"></polyline>
    </svg>
  `,
  browser: html`
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <circle cx="12" cy="12" r="10"></circle>
      <circle cx="12" cy="12" r="4"></circle>
      <line x1="21.17" y1="8" x2="12" y2="8"></line>
      <line x1="3.95" y1="6.06" x2="8.54" y2="14"></line>
      <line x1="10.88" y1="21.94" x2="15.46" y2="14"></line>
    </svg>
  `,
  ui: html`
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
      <line x1="3" y1="9" x2="21" y2="9"></line>
      <line x1="9" y1="21" x2="9" y2="9"></line>
    </svg>
  `,
  models: html`
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <path
        d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"
      ></path>
      <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
      <line x1="12" y1="22.08" x2="12" y2="12"></line>
    </svg>
  `,
  bindings: html`
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect>
      <rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect>
      <line x1="6" y1="6" x2="6.01" y2="6"></line>
      <line x1="6" y1="18" x2="6.01" y2="18"></line>
    </svg>
  `,
  broadcast: html`
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"></path>
      <path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5"></path>
      <circle cx="12" cy="12" r="2"></circle>
      <path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5"></path>
      <path d="M19.1 4.9C23 8.8 23 15.1 19.1 19"></path>
    </svg>
  `,
  audio: html`
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <path d="M9 18V5l12-2v13"></path>
      <circle cx="6" cy="18" r="3"></circle>
      <circle cx="18" cy="16" r="3"></circle>
    </svg>
  `,
  session: html`
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
      <circle cx="9" cy="7" r="4"></circle>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
    </svg>
  `,
  cron: html`
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <circle cx="12" cy="12" r="10"></circle>
      <polyline points="12 6 12 12 16 14"></polyline>
    </svg>
  `,
  web: html`
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="2" y1="12" x2="22" y2="12"></line>
      <path
        d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
      ></path>
    </svg>
  `,
  discovery: html`
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <circle cx="11" cy="11" r="8"></circle>
      <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
    </svg>
  `,
  canvasHost: html`
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
      <circle cx="8.5" cy="8.5" r="1.5"></circle>
      <polyline points="21 15 16 10 5 21"></polyline>
    </svg>
  `,
  talk: html`
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
      <line x1="12" y1="19" x2="12" y2="23"></line>
      <line x1="8" y1="23" x2="16" y2="23"></line>
    </svg>
  `,
  plugins: html`
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <path d="M12 2v6"></path>
      <path d="m4.93 10.93 4.24 4.24"></path>
      <path d="M2 12h6"></path>
      <path d="m4.93 13.07 4.24-4.24"></path>
      <path d="M12 22v-6"></path>
      <path d="m19.07 13.07-4.24-4.24"></path>
      <path d="M22 12h-6"></path>
      <path d="m19.07 10.93-4.24 4.24"></path>
    </svg>
  `,
  diagnostics: html`
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2"></path>
    </svg>
  `,
  nodeHost: html`
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect>
      <rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect>
      <line x1="6" y1="6" x2="6.01" y2="6"></line>
      <line x1="6" y1="18" x2="6.01" y2="18"></line>
    </svg>
  `,
  setup: html`
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
    </svg>
  `,
  media: html`
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect>
      <line x1="7" y1="2" x2="7" y2="22"></line>
      <line x1="17" y1="2" x2="17" y2="22"></line>
      <line x1="2" y1="12" x2="22" y2="12"></line>
      <line x1="2" y1="7" x2="7" y2="7"></line>
      <line x1="2" y1="17" x2="7" y2="17"></line>
      <line x1="17" y1="7" x2="22" y2="7"></line>
      <line x1="17" y1="17" x2="22" y2="17"></line>
    </svg>
  `,
  approvals: html`
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
      <polyline points="22 4 12 14.01 9 11.01"></polyline>
    </svg>
  `,
  presence: html`
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <circle cx="12" cy="12" r="10"></circle>
      <circle cx="12" cy="12" r="3"></circle>
    </svg>
  `,
  voicewake: html`
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
      <line x1="12" y1="19" x2="12" y2="23"></line>
      <line x1="8" y1="23" x2="16" y2="23"></line>
    </svg>
  `,
  default: html`
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
      <polyline points="14 2 14 8 20 8"></polyline>
    </svg>
  `,
};

// Section metadata — cached to avoid re-creating 30+ i18n lookups on every render
let _sectionMetaCache: Record<string, { label: string; description: string }> | null = null;

function buildSectionMeta(): Record<string, { label: string; description: string }> {
  return {
    env: { label: t("config.sectionEnv"), description: t("config.envDesc") },
    update: { label: t("config.sectionUpdate"), description: t("config.updateDesc") },
    agents: { label: t("config.sectionAgents"), description: t("config.agentsDesc") },
    auth: { label: t("config.sectionAuth"), description: t("config.authDesc") },
    channels: { label: t("config.sectionChannels"), description: t("config.channelsDesc") },
    messages: { label: t("config.sectionMessages"), description: t("config.messagesDesc") },
    commands: { label: t("config.sectionCommands"), description: t("config.commandsDesc") },
    hooks: { label: t("config.sectionHooks"), description: t("config.hooksDesc") },
    skills: { label: t("config.sectionSkills"), description: t("config.skillsDesc") },
    tools: { label: t("config.sectionTools"), description: t("config.toolsDesc") },
    gateway: { label: t("config.sectionGateway"), description: t("config.gatewayDesc") },
    wizard: { label: t("config.sectionWizard"), description: t("config.wizardDesc") },
    meta: { label: t("config.metaLabel"), description: t("config.metaDesc") },
    logging: { label: t("config.loggingLabel"), description: t("config.loggingDesc") },
    browser: { label: t("config.browserLabel"), description: t("config.browserDesc") },
    ui: { label: t("config.uiLabel"), description: t("config.uiDesc") },
    models: { label: t("config.modelsLabel"), description: t("config.modelsDesc") },
    bindings: { label: t("config.bindingsLabel"), description: t("config.bindingsDesc") },
    broadcast: { label: t("config.broadcastLabel"), description: t("config.broadcastDesc") },
    audio: { label: t("config.audioLabel"), description: t("config.audioDesc") },
    session: { label: t("config.sessionLabel"), description: t("config.sessionDesc") },
    cron: { label: t("config.cronLabel"), description: t("config.cronDesc") },
    web: { label: t("config.webLabel"), description: t("config.webDesc") },
    discovery: { label: t("config.discoveryLabel"), description: t("config.discoveryDesc") },
    canvasHost: { label: t("config.canvasHostLabel"), description: t("config.canvasHostDesc") },
    talk: { label: t("config.talkLabel"), description: t("config.talkDesc") },
    plugins: { label: t("config.pluginsLabel"), description: t("config.pluginsDesc") },
    diagnostics: { label: t("config.diagnosticsLabel"), description: t("config.diagnosticsDesc") },
    nodeHost: { label: t("config.nodeHostLabel"), description: t("config.nodeHostDesc") },
    setup: { label: t("config.setupLabel"), description: t("config.setupDesc") },
    media: { label: t("config.mediaLabel"), description: t("config.mediaDesc") },
    approvals: { label: t("config.approvalsLabel"), description: t("config.approvalsDesc") },
    presence: { label: t("config.presenceLabel"), description: t("config.presenceDesc") },
    voicewake: { label: t("config.voicewakeLabel"), description: t("config.voicewakeDesc") },
    cli: { label: t("config.cliLabel"), description: t("config.cliDesc") },
    memory: { label: t("config.memoryLabel"), description: t("config.memoryDesc") },
    acp: { label: t("config.acpLabel"), description: t("config.acpDesc") },
    secrets: { label: t("config.secretsLabel"), description: t("config.secretsDesc") },
  };
}

function getSectionMeta(): Record<string, { label: string; description: string }> {
  if (!_sectionMetaCache) {
    _sectionMetaCache = buildSectionMeta();
  }
  return _sectionMetaCache;
}

/** Invalidate cache when language changes */
export function invalidateSectionMetaCache() {
  _sectionMetaCache = null;
}

// Re-export getSectionMeta for external use
export { getSectionMeta };

// Export for compatibility (dynamically populated)
export const SECTION_META: Record<string, { label: string; description: string }> = {};

function getSectionIcon(key: string) {
  return sectionIcons[key as keyof typeof sectionIcons] ?? sectionIcons.default;
}

// Search result cache — keyed by query string, invalidated when query changes
let _searchCache: Map<string, boolean> | null = null;
let _searchCacheQuery = "";

function matchesSearch(key: string, schema: JsonSchema, query: string): boolean {
  if (!query) return true;

  // Use cache if same query
  if (query === _searchCacheQuery && _searchCache) {
    const cached = _searchCache.get(key);
    if (cached !== undefined) return cached;
  } else {
    _searchCache = new Map();
    _searchCacheQuery = query;
  }

  const result = matchesSearchUncached(key, schema, query);
  _searchCache.set(key, result);
  return result;
}

function matchesSearchUncached(key: string, schema: JsonSchema, query: string): boolean {
  const q = query.toLowerCase();
  const meta = getSectionMeta()[key];

  // Check key name
  if (key.toLowerCase().includes(q)) return true;

  // Check label and description
  if (meta) {
    if (meta.label.toLowerCase().includes(q)) return true;
    if (meta.description.toLowerCase().includes(q)) return true;
  }

  return schemaMatches(schema, q);
}

function schemaMatches(schema: JsonSchema, query: string): boolean {
  if (schema.title?.toLowerCase().includes(query)) return true;
  if (schema.description?.toLowerCase().includes(query)) return true;
  if (schema.enum?.some((value) => String(value).toLowerCase().includes(query))) return true;

  if (schema.properties) {
    for (const [propKey, propSchema] of Object.entries(schema.properties)) {
      if (propKey.toLowerCase().includes(query)) return true;
      if (schemaMatches(propSchema, query)) return true;
    }
  }

  if (schema.items) {
    const items = Array.isArray(schema.items) ? schema.items : [schema.items];
    for (const item of items) {
      if (item && schemaMatches(item, query)) return true;
    }
  }

  if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
    if (schemaMatches(schema.additionalProperties, query)) return true;
  }

  const unions = schema.anyOf ?? schema.oneOf ?? schema.allOf;
  if (unions) {
    for (const entry of unions) {
      if (entry && schemaMatches(entry, query)) return true;
    }
  }

  return false;
}

export function renderConfigForm(props: ConfigFormProps) {
  if (!props.schema) {
    return html`<div class="muted">${t("config.schemaUnavailable")}</div>`;
  }
  const schema = props.schema;
  const value = props.value ?? {};
  if (schemaType(schema) !== "object" || !schema.properties) {
    return html`<div class="callout danger">${t("config.unsupportedSchema")}</div>`;
  }
  const unsupported = new Set(props.unsupportedPaths ?? []);
  const properties = schema.properties;
  const searchQuery = props.searchQuery ?? "";
  const activeSection = props.activeSection;
  const activeSubsection = props.activeSubsection ?? null;

  // Pre-lookup orders to avoid O(n²) hintForPath calls in comparator
  const sectionOrderMap = new Map<string, number>();
  for (const [key] of Object.entries(properties)) {
    sectionOrderMap.set(key, hintForPath([key], props.uiHints)?.order ?? 50);
  }
  const entries = Object.entries(properties).sort((a, b) => {
    const orderA = sectionOrderMap.get(a[0]) ?? 50;
    const orderB = sectionOrderMap.get(b[0]) ?? 50;
    if (orderA !== orderB) return orderA - orderB;
    return a[0].localeCompare(b[0]);
  });

  const filteredEntries = entries.filter(([key, node]) => {
    if (activeSection && key !== activeSection) return false;
    if (searchQuery && !matchesSearch(key, node, searchQuery)) return false;
    return true;
  });

  let subsectionContext: { sectionKey: string; subsectionKey: string; schema: JsonSchema } | null =
    null;
  if (activeSection && activeSubsection && filteredEntries.length === 1) {
    const sectionSchema = filteredEntries[0]?.[1];
    if (
      sectionSchema &&
      schemaType(sectionSchema) === "object" &&
      sectionSchema.properties &&
      sectionSchema.properties[activeSubsection]
    ) {
      subsectionContext = {
        sectionKey: activeSection,
        subsectionKey: activeSubsection,
        schema: sectionSchema.properties[activeSubsection],
      };
    }
  }

  if (filteredEntries.length === 0) {
    return html`
      <div class="config-empty">
        <div class="config-empty__icon">${icons.search}</div>
        <div class="config-empty__text">
          ${
            searchQuery
              ? t("config.noSettingsMatch", { query: searchQuery })
              : t("config.noSettingsInSection")
          }
        </div>
      </div>
    `;
  }

  const sectionMeta = getSectionMeta();
  return html`
    <div class="config-form config-form--modern">
      ${
        subsectionContext
          ? (() => {
              const { sectionKey, subsectionKey, schema: node } = subsectionContext;
              const hint = hintForPath([sectionKey, subsectionKey], props.uiHints);
              const label = resolveLabel([sectionKey, subsectionKey], hint, node, subsectionKey);
              const description = hint?.help ?? node.description ?? "";
              const sectionValue = (value as Record<string, unknown>)[sectionKey];
              const scopedValue =
                sectionValue && typeof sectionValue === "object"
                  ? (sectionValue as Record<string, unknown>)[subsectionKey]
                  : undefined;
              const id = `config-section-${sectionKey}-${subsectionKey}`;
              return html`
              <section class="config-section-card" id=${id}>
                <div class="config-section-card__header">
                  <span class="config-section-card__icon">${getSectionIcon(sectionKey)}</span>
                  <div class="config-section-card__titles">
                    <h3 class="config-section-card__title">${label}</h3>
                    ${
                      description
                        ? html`<p class="config-section-card__desc">${description}</p>`
                        : nothing
                    }
                  </div>
                </div>
                <div class="config-section-card__content">
                  ${renderNode({
                    schema: node,
                    value: scopedValue,
                    path: [sectionKey, subsectionKey],
                    hints: props.uiHints,
                    unsupported,
                    disabled: props.disabled ?? false,
                    showLabel: false,
                    onPatch: props.onPatch,
                  })}
                </div>
              </section>
            `;
            })()
          : filteredEntries.map(([key, node]) => {
              const meta = sectionMeta[key] ?? {
                label: key.charAt(0).toUpperCase() + key.slice(1),
                description: node.description ?? "",
              };

              return html`
              <section class="config-section-card" id="config-section-${key}">
                <div class="config-section-card__header">
                  <span class="config-section-card__icon">${getSectionIcon(key)}</span>
                  <div class="config-section-card__titles">
                    <h3 class="config-section-card__title">${meta.label}</h3>
                    ${
                      meta.description
                        ? html`<p class="config-section-card__desc">${meta.description}</p>`
                        : nothing
                    }
                  </div>
                </div>
                <div class="config-section-card__content">
                  ${renderNode({
                    schema: node,
                    value: (value as Record<string, unknown>)[key],
                    path: [key],
                    hints: props.uiHints,
                    unsupported,
                    disabled: props.disabled ?? false,
                    showLabel: false,
                    onPatch: props.onPatch,
                  })}
                </div>
              </section>
            `;
            })
      }
    </div>
  `;
}
