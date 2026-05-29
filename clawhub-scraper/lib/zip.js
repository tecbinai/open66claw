import AdmZip from 'adm-zip';

/**
 * Extract SKILL.md and file list from a ZIP buffer
 */
export function extractSkillMd(buffer) {
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries();
  const files = entries.map((e) => e.entryName);

  // Find SKILL.md at root or one level deep
  const skillEntry = entries.find(
    (e) => e.entryName === 'SKILL.md' || e.entryName.endsWith('/SKILL.md')
  );

  return {
    content: skillEntry ? skillEntry.getData().toString('utf8') : null,
    files,
  };
}
