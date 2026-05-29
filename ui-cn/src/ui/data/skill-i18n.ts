/**
 * Skill translations lookup service.
 * Build-time bundled JSON + runtime Map for O(1) lookup.
 * Zero network requests, zero async.
 */
import rawTranslations from "./skill-translations.json" with { type: "json" };

export type SkillTranslation = {
  nameZh: string;
  descZh: string;
};

// Build the Map once at module load time
const translationMap = new Map<string, SkillTranslation>();

for (const [key, value] of Object.entries(rawTranslations)) {
  if (key.startsWith("_")) continue; // skip metadata fields
  const entry = value as { nameZh?: string; descZh?: string };
  if (entry.nameZh || entry.descZh) {
    translationMap.set(key, {
      nameZh: entry.nameZh ?? "",
      descZh: entry.descZh ?? "",
    });
  }
}

/** Get translation for a skill name. Returns undefined if not found. */
export function getSkillTranslation(skillName: string): SkillTranslation | undefined {
  return translationMap.get(skillName);
}
