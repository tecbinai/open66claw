import { tMaybe } from "../i18n/index.js";
import type { ConfigUiHints } from "../types";

export type JsonSchema = {
  type?: string | string[];
  title?: string;
  description?: string;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema | JsonSchema[];
  additionalProperties?: JsonSchema | boolean;
  enum?: unknown[];
  const?: unknown;
  default?: unknown;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  allOf?: JsonSchema[];
  nullable?: boolean;
};

export function schemaType(schema: JsonSchema): string | undefined {
  if (!schema) return undefined;
  if (Array.isArray(schema.type)) {
    const filtered = schema.type.filter((t) => t !== "null");
    return filtered[0] ?? schema.type[0];
  }
  return schema.type;
}

export function defaultValue(schema?: JsonSchema): unknown {
  if (!schema) return "";
  if (schema.default !== undefined) return schema.default;
  const type = schemaType(schema);
  switch (type) {
    case "object":
      return {};
    case "array":
      return [];
    case "boolean":
      return false;
    case "number":
    case "integer":
      return 0;
    case "string":
      return "";
    default:
      return "";
  }
}

export function pathKey(path: Array<string | number>): string {
  return path.filter((segment) => typeof segment === "string").join(".");
}

// -- Wildcard index for O(1) hint lookups --
// Instead of scanning 900+ hints on every miss, we pre-build an index of
// wildcard patterns grouped by segment count, so matching is O(wildcards_of_same_length).
let _wildcardIndexHints: ConfigUiHints | null = null;
let _wildcardIndex: Map<number, Array<{ segments: string[]; key: string }>> | null = null;

function getWildcardIndex(hints: ConfigUiHints): Map<number, Array<{ segments: string[]; key: string }>> {
  if (_wildcardIndexHints === hints && _wildcardIndex) return _wildcardIndex;
  const index = new Map<number, Array<{ segments: string[]; key: string }>>();
  for (const hintKey of Object.keys(hints)) {
    if (!hintKey.includes("*")) continue;
    const segments = hintKey.split(".");
    let bucket = index.get(segments.length);
    if (!bucket) {
      bucket = [];
      index.set(segments.length, bucket);
    }
    bucket.push({ segments, key: hintKey });
  }
  _wildcardIndexHints = hints;
  _wildcardIndex = index;
  return index;
}

// Result cache: avoids repeated lookups for the same path+hints combination.
let _hintCacheHints: ConfigUiHints | null = null;
const _hintCache = new Map<string, ConfigUiHints[string] | undefined>();

export function hintForPath(path: Array<string | number>, hints: ConfigUiHints) {
  const key = pathKey(path);

  // Fast path: direct hit
  const direct = hints[key];
  if (direct) return direct;

  // Check result cache (same hints object)
  if (hints !== _hintCacheHints) {
    _hintCache.clear();
    _hintCacheHints = hints;
  } else if (_hintCache.has(key)) {
    return _hintCache.get(key);
  }

  // Wildcard matching using pre-built index
  const segments = key.split(".");
  const index = getWildcardIndex(hints);
  const bucket = index.get(segments.length);
  let result: ConfigUiHints[string] | undefined;
  if (bucket) {
    for (const entry of bucket) {
      let match = true;
      for (let i = 0; i < segments.length; i += 1) {
        if (entry.segments[i] !== "*" && entry.segments[i] !== segments[i]) {
          match = false;
          break;
        }
      }
      if (match) {
        result = hints[entry.key];
        break;
      }
    }
  }

  _hintCache.set(key, result);
  return result;
}

export function humanize(raw: string) {
  return raw
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .replace(/^./, (m) => m.toUpperCase());
}

export function resolveLabel(
  path: Array<string | number>,
  hint: { label?: string } | undefined,
  schema: { title?: string },
  fallbackKey?: string,
): string {
  const key = pathKey(path);
  const i18nKey = `config.field.${key}`;
  const translated = tMaybe(i18nKey);
  if (translated !== i18nKey) return translated;

  // For array paths (containing numeric indices), try wildcard variants:
  //   path ["agents","list",0,"tools","profile"]
  //   → "config.field.agents.list.*.tools.profile"   (star variant)
  //   → "config.field.agents.list[].tools.profile"    (bracket variant)
  if (path.some((s) => typeof s === "number")) {
    const starKey = `config.field.${path.map((s) => (typeof s === "number" ? "*" : s)).join(".")}`;
    const starResult = tMaybe(starKey);
    if (starResult !== starKey) return starResult;

    const bracketParts: string[] = [];
    for (const seg of path) {
      if (typeof seg === "number") {
        if (bracketParts.length > 0) bracketParts[bracketParts.length - 1] += "[]";
      } else {
        bracketParts.push(seg);
      }
    }
    const bracketKey = `config.field.${bracketParts.join(".")}`;
    const bracketResult = tMaybe(bracketKey);
    if (bracketResult !== bracketKey) return bracketResult;
  }

  return hint?.label ?? schema.title ?? humanize(fallbackKey ?? String(path.at(-1)));
}

/**
 * Resolves a human-friendly label for a config field's value.
 * Looks up i18n key `config.value.<dotted.path>.<value>`, falls back to raw value.
 */
export function resolveValueLabel(path: Array<string | number>, value: unknown): string {
  const raw = String(value ?? "");
  const dotPath = path.filter((s) => typeof s === "string").join(".");
  const i18nKey = `config.value.${dotPath}.${raw}`;
  const translated = tMaybe(i18nKey);
  if (translated !== i18nKey) return translated;
  return raw;
}

/**
 * Resolves a help text for a config field.
 * Looks up i18n key `config.help.<dotted.path>`, falls back to hint.help or schema.description.
 */
export function resolveHelp(
  path: Array<string | number>,
  hint: { help?: string } | undefined,
  schema: { description?: string },
): string | undefined {
  const dotPath = path.filter((s) => typeof s === "string").join(".");
  const i18nKey = `config.help.${dotPath}`;
  const translated = tMaybe(i18nKey);
  if (translated !== i18nKey) return translated;
  return hint?.help ?? schema.description;
}

export function isSensitivePath(path: Array<string | number>): boolean {
  const key = pathKey(path).toLowerCase();
  return (
    key.includes("token") ||
    key.includes("password") ||
    key.includes("secret") ||
    key.includes("apikey") ||
    key.endsWith("key")
  );
}
