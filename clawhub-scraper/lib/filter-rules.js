// ─── 中国友好过滤规则 ───

// 黑名单：需要翻墙 / 平台限制
export const BLOCKED = {
  vpn_required: {
    keywords: [
      'google', 'gmail', 'youtube', 'google drive', 'google maps',
      'google calendar', 'google sheets', 'google docs', 'google cloud',
      'googleapis', 'google.com',
      'twitter', 'x.com', 'tweet', 'x api',
      'facebook', 'instagram', 'meta api',
      'whatsapp',
      'telegram', 'tg://', 't.me/',
      'slack', 'slack.com',
      'reddit', 'reddit.com',
      'twitch', 'twitch.tv',
      'line messenger', 'line.me',
      'pinterest', 'snapchat',
    ],
    slugs: new Set([
      'wacli', 'bluebubbles', 'imsg', 'xurl',
      'gog', 'goplaces', 'gifgrep',
    ]),
  },
  apple_only: {
    keywords: [
      'apple notes', 'apple reminders', 'apple music', 'apple calendar',
      'apple contacts', 'apple mail', 'apple photos', 'apple media',
      'appletv', 'apple tv', 'siri', 'homekit', 'airplay',
      'messages.app', 'icloud',
    ],
    slugs: new Set([
      'apple-notes', 'apple-reminders', 'apple-music', 'apple-calendar',
      'apple-contacts', 'apple-mail', 'apple-mail-search', 'apple-mail-search-safe',
      'apple-media', 'apple-photos', 'apple-docs', 'apple-docs-mcp',
      'apple-remind-me', 'appletv',
      'things-mac', 'bear-notes', 'peekaboo', 'songsee',
      'blucli', 'sonoscli',
    ]),
  },
  us_payment: {
    keywords: ['venmo', 'cashapp', 'cash app', 'zelle', 'plaid'],
    slugs: new Set([]),
  },
};

// 白名单标签（用于分类，不影响过滤结果）
export const FRIENDLY_TAGS = {
  dev_tools: ['git', 'docker', 'kubernetes', 'k8s', 'terraform', 'ansible', 'jenkins', 'ci/cd', 'github', 'gitlab'],
  databases: ['mongodb', 'postgresql', 'postgres', 'mysql', 'redis', 'sqlite', 'elasticsearch'],
  ai_ml: ['openai', 'ollama', 'llm', 'embedding', 'whisper', 'tts', 'langchain', 'huggingface'],
  productivity: ['notion', 'obsidian', 'trello', 'todoist', 'linear', 'jira', 'asana'],
  file_processing: ['pdf', 'csv', 'excel', 'image', 'video', 'audio', 'markdown', 'latex'],
  devops: ['linux', 'nginx', 'systemd', 'tmux', 'ssh', 'monitoring', 'prometheus', 'grafana'],
  security: ['security', 'vulnerability', 'pentest', 'encryption', 'password', '1password', 'bitwarden'],
  cloud: ['aws', 'azure', 's3', 'cloudflare', 'vercel'],
  cn_services: ['wechat', 'weixin', 'dingtalk', 'feishu', 'lark', 'alibaba', 'aliyun', 'tencent', 'baidu', 'bilibili', 'gitee'],
  coding: ['python', 'javascript', 'typescript', 'rust', 'golang', 'java', 'ruby', 'php'],
};

/**
 * Classify a skill row → { china_friendly, reason, tags }
 */
export function classify(skill) {
  const text = [skill.slug, skill.display_name, skill.summary, skill.skill_md_raw || '']
    .join(' ').toLowerCase();

  const blocks = [];
  const tags = [];

  // Check blocklists
  for (const [cat, { keywords, slugs }] of Object.entries(BLOCKED)) {
    if (slugs.has(skill.slug)) {
      blocks.push(`[${cat}] slug:${skill.slug}`);
      continue;
    }
    for (const kw of keywords) {
      if (text.includes(kw)) {
        blocks.push(`[${cat}] kw:"${kw}"`);
        break;
      }
    }
  }

  // Check darwin-only metadata
  try {
    const meta = JSON.parse(skill.metadata_json || '{}');
    const os = meta?.os || meta?.openclaw?.os || [];
    if (Array.isArray(os) && os.length === 1 && os[0] === 'darwin') {
      blocks.push('[apple_only] os:darwin');
    }
  } catch {}

  // Friendly tags
  for (const [cat, keywords] of Object.entries(FRIENDLY_TAGS)) {
    for (const kw of keywords) {
      if (text.includes(kw)) { tags.push(cat); break; }
    }
  }

  if (blocks.length > 0) {
    return { china_friendly: false, reason: blocks.join('; '), tags: blocks.map(b => b.match(/\[(\w+)\]/)?.[1]).filter(Boolean) };
  }
  return { china_friendly: true, reason: tags.length ? tags.join(',') : 'general', tags: tags.length ? tags : ['general'] };
}
