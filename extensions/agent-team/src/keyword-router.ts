/**
 * Keyword Router — Basic keyword matching for team message routing.
 *
 * CJK-aware: handles Chinese keywords without word boundary requirements.
 *
 * Migrated from clawdbot extensions/agent-team/src/keyword-router.ts
 */

import type { KeywordMatch, KeywordRoute, MemberInfo } from "./types.js";

/**
 * Match a user message against a set of keyword routes.
 * Returns the best match (highest priority, then longest pattern), or null.
 */
export function matchKeywordRoute(message: string, routes: KeywordRoute[]): KeywordMatch | null {
  if (!message || routes.length === 0) return null;

  const lowerMsg = message.toLowerCase();
  const matches: Array<KeywordMatch & { priority: number }> = [];

  for (const route of routes) {
    const pattern = route.pattern.toLowerCase();
    if (!pattern) continue;

    const idx = lowerMsg.indexOf(pattern);
    if (idx === -1) continue;

    // Confidence: longer pattern match = higher confidence
    const confidence = Math.min(1, pattern.length / Math.max(lowerMsg.length, 1));

    matches.push({
      agentId: route.agentId,
      confidence,
      matchedPattern: route.pattern,
      priority: route.priority ?? 100,
    });
  }

  if (matches.length === 0) return null;

  // Sort: lower priority number first, then higher confidence
  matches.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return b.confidence - a.confidence;
  });

  const best = matches[0];
  return {
    agentId: best.agentId,
    confidence: best.confidence,
    matchedPattern: best.matchedPattern,
  };
}

/**
 * Extract keywords from a member's role description.
 * Used to auto-generate routing table entries from team composition.
 *
 * Strategy: split on common separators, filter short/stop words.
 * CJK-aware: preserves Chinese phrases as-is (no word boundary splitting).
 */
export function extractKeywordsFromRole(roleDescription: string): string[] {
  if (!roleDescription) return [];

  // Common Chinese stop words to exclude
  const stopWords = new Set([
    "的",
    "了",
    "是",
    "在",
    "和",
    "与",
    "或",
    "把",
    "被",
    "从",
    "到",
    "对",
    "让",
    "向",
    "为",
    "用",
    "以",
    "及",
    "等",
    "都",
    "也",
    "就",
    "会",
    "能",
    "可以",
    "进行",
    "负责",
    "管理",
    "处理",
    "the",
    "a",
    "an",
    "and",
    "or",
    "for",
    "to",
    "of",
    "in",
    "on",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "being",
    "have",
    "has",
    "do",
    "does",
    "did",
    "will",
    "would",
    "could",
    "should",
    "may",
    "can",
    "this",
    "that",
    "these",
    "those",
    "with",
    "from",
    "by",
  ]);

  // Split on punctuation, spaces, common separators, Chinese particles/conjunctions,
  // and CJK-Latin script boundaries (e.g. "负责customer" → "负责", "customer")
  const tokens = roleDescription
    .replace(/([\u4e00-\u9fff\u3400-\u4dbf])([a-zA-Z])/g, "$1 $2")
    .replace(/([a-zA-Z])([\u4e00-\u9fff\u3400-\u4dbf])/g, "$1 $2")
    .split(/[，。、；：！？\s,.:;!?/\\|+&和与或及等的了出给上下]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !stopWords.has(t.toLowerCase()));

  // For long CJK tokens (>= 4 chars), also extract 2-char bigrams
  // so "搜索配图" also matches "配图", "为文案生成" also matches "文案"
  const all = [...tokens];
  const cjkRange = /^[\u4e00-\u9fff\u3400-\u4dbf]+$/;
  for (const t of tokens) {
    if (t.length >= 4 && cjkRange.test(t)) {
      for (let i = 0; i <= t.length - 2; i++) {
        const bigram = t.slice(i, i + 2);
        if (!stopWords.has(bigram)) {
          all.push(bigram);
        }
      }
    }
  }

  // Deduplicate while preserving order
  return [...new Set(all)];
}

/**
 * Build keyword routes from team member info.
 * Each member's role is decomposed into keywords that route to that member.
 * Pre-defined keywords from deploy-bridge (member.keywords) take higher
 * priority than auto-extracted keywords from the role description.
 */
export function buildRoutesFromMembers(members: MemberInfo[]): KeywordRoute[] {
  const routes: KeywordRoute[] = [];

  for (const member of members) {
    // Add member name as highest-priority route
    if (member.name) {
      routes.push({
        pattern: member.name,
        agentId: member.id,
        priority: 10,
      });
    }

    // Pre-defined keywords from blueprint/learning (higher priority than auto-extracted)
    const preDefinedSet = new Set<string>();
    if (Array.isArray(member.keywords)) {
      for (const kw of member.keywords) {
        if (kw && kw.length >= 2) {
          routes.push({
            pattern: kw,
            agentId: member.id,
            priority: 30,
          });
          preDefinedSet.add(kw.toLowerCase());
        }
      }
    }

    // Auto-extract keywords from role description (lower priority, skip duplicates)
    const keywords = extractKeywordsFromRole(member.role);
    for (const kw of keywords) {
      if (!preDefinedSet.has(kw.toLowerCase())) {
        routes.push({
          pattern: kw,
          agentId: member.id,
          priority: 50,
        });
      }
    }
  }

  return routes;
}
