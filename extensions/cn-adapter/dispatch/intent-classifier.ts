/**
 * Intent Classifier — pure rule-based classification (no LLM dependency).
 *
 * Simplified from clawdbot's intent-classifier.ts:
 * - Removed LLM fallback (classifyByLLM)
 * - Removed synonym-expander dependency
 * - Removed complexity-classifier dependency
 * - Kept core keyword/regex scoring with CJK support
 *
 * This replaces cn-adapter's existing `inferIntentFromTools()` in prompt-inject.ts
 * with a more accurate rule-based classifier.
 */

import { createCnLogger } from "../utils/logger.js";
import type { CompiledIntent, IntentDefinition, RuleMatchResult } from "./types.js";

const log = createCnLogger("dispatch/intent-classifier");

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Keyword-only matching caps at this confidence. */
const KEYWORD_MAX_SCORE = 0.6;
/** Regex-only matching caps at this confidence. */
const REGEX_MAX_SCORE = 0.8;
/** Bonus for both keyword + regex matching the same intent. */
const COMBINED_BONUS = 0.1;
/** Catch-all intent (no patterns) gets this fixed low score. */
const CATCHALL_SCORE = 0.1;

// CJK character detection — used to decide matching strategy
const CJK_RE = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/;

// Cache for keyword boundary RegExp objects (bounded FIFO)
const KEYWORD_CACHE_MAX = 1000;
const keywordRegexCache = new Map<string, RegExp>();

function getKeywordBoundaryRegex(keyword: string): RegExp {
  let re = keywordRegexCache.get(keyword);
  if (!re) {
    re = new RegExp(`\\b${escapeRegex(keyword)}\\b`, "i");
    if (keywordRegexCache.size >= KEYWORD_CACHE_MAX) {
      const oldest = keywordRegexCache.keys().next().value;
      if (oldest !== undefined) keywordRegexCache.delete(oldest);
    }
    keywordRegexCache.set(keyword, re);
  }
  return re;
}

// ---------------------------------------------------------------------------
// Compile intents (pre-process for fast matching)
// ---------------------------------------------------------------------------

/**
 * Compile raw intent definitions into optimized form with pre-compiled regex
 * and lowercased keywords.
 */
export function compileIntents(intents: IntentDefinition[]): CompiledIntent[] {
  return intents.map((intent) => ({
    ...intent,
    compiledRegex: intent.patterns.regex.map((r) => {
      try {
        return new RegExp(r, "i");
      } catch {
        log.warn(`Invalid regex in intent ${intent.id}: ${r}`);
        return /(?!)/; // never-match regex
      }
    }),
    lowerKeywords: intent.patterns.keywords.map((k) => k.toLowerCase()),
    lowerExcludeKeywords: intent.patterns.excludeKeywords?.map((k) => k.toLowerCase()),
  }));
}

// ---------------------------------------------------------------------------
// Rule-based Classifier
// ---------------------------------------------------------------------------

/**
 * Score a single intent against the user prompt using rules.
 * Returns null if no patterns match at all.
 */
function scoreIntentByRules(promptLower: string, intent: CompiledIntent): RuleMatchResult | null {
  const { lowerKeywords, compiledRegex, id } = intent;

  // Catch-all intent (no patterns defined) → lowest confidence
  if (lowerKeywords.length === 0 && compiledRegex.length === 0) {
    return {
      intentId: id,
      confidence: CATCHALL_SCORE,
      matchedBy: "combined",
      matchDetails: "catch-all",
    };
  }

  // --- Keyword scoring ---
  let keywordScore = 0;
  let keywordMatched = 0;
  let singleCharCJKMatches = 0;
  const matchedKeywords: string[] = [];

  for (const kw of lowerKeywords) {
    if (kw.length === 0) continue;

    // CJK keywords: substring match (Chinese doesn't have word boundaries)
    // ASCII keywords: word boundary match (cached RegExp)
    const isCJK = CJK_RE.test(kw);
    const matches = isCJK
      ? promptLower.includes(kw)
      : getKeywordBoundaryRegex(kw).test(promptLower);

    if (matches) {
      keywordMatched++;
      matchedKeywords.push(kw);
      // Single CJK chars are prone to false positives
      if (isCJK && kw.length === 1) {
        singleCharCJKMatches++;
      }
    }
  }

  if (keywordMatched > 0 && lowerKeywords.length > 0) {
    let effectiveMatches = keywordMatched;
    if (singleCharCJKMatches > 0 && singleCharCJKMatches === keywordMatched) {
      effectiveMatches *= 0.5;
    }
    keywordScore = Math.min(
      KEYWORD_MAX_SCORE,
      (effectiveMatches / lowerKeywords.length) * KEYWORD_MAX_SCORE * 3,
    );
  }

  // --- Regex scoring ---
  let regexScore = 0;
  let regexMatched = 0;
  const matchedRegexIdx: number[] = [];

  for (let i = 0; i < compiledRegex.length; i++) {
    if (compiledRegex[i]!.test(promptLower)) {
      regexMatched++;
      matchedRegexIdx.push(i);
    }
  }

  if (regexMatched > 0 && compiledRegex.length > 0) {
    regexScore = Math.min(
      REGEX_MAX_SCORE,
      (regexMatched / compiledRegex.length) * REGEX_MAX_SCORE * 2,
    );
  }

  // --- No match at all ---
  if (keywordScore === 0 && regexScore === 0) {
    return null;
  }

  // --- Exclude keywords penalty ---
  let excluded = false;
  const excludeKws = intent.lowerExcludeKeywords;
  if (excludeKws && excludeKws.length > 0) {
    excluded = excludeKws.some((ek) => {
      const isCJKExclude = CJK_RE.test(ek);
      return isCJKExclude
        ? promptLower.includes(ek)
        : getKeywordBoundaryRegex(ek).test(promptLower);
    });
    if (excluded) {
      keywordScore *= 0.2;
      regexScore *= 0.2;
    }
  }

  // --- Combined score ---
  let confidence = Math.min(1.0, keywordScore + regexScore);
  let matchedBy: RuleMatchResult["matchedBy"] = "keyword";

  if (keywordScore > 0 && regexScore > 0) {
    confidence = Math.min(1.0, confidence + COMBINED_BONUS);
    matchedBy = "combined";
  } else if (regexScore > 0) {
    matchedBy = "regex";
  }

  // Build match details
  const details: string[] = [];
  if (matchedKeywords.length > 0) {
    details.push(`keywords:[${matchedKeywords.join(",")}]`);
  }
  if (matchedRegexIdx.length > 0) {
    details.push(`regex:[#${matchedRegexIdx.join(",#")}]`);
  }
  if (excluded) {
    details.push("excluded");
  }

  return {
    intentId: id,
    confidence,
    matchedBy,
    matchDetails: details.join(" "),
  };
}

/**
 * Run all intent rules against the prompt.
 * Returns matches sorted by confidence (descending). Only returns non-null results.
 */
export function classifyByRules(prompt: string, intents: CompiledIntent[]): RuleMatchResult[] {
  const promptLower = prompt.toLowerCase();
  const results: RuleMatchResult[] = [];

  for (const intent of intents) {
    const result = scoreIntentByRules(promptLower, intent);
    if (result) {
      results.push(result);
    }
  }

  // Sort by confidence descending
  results.sort((a, b) => b.confidence - a.confidence);
  return results;
}

/**
 * Main classification entry point (rules only, no LLM fallback).
 * Returns the best match or "general" default.
 */
export function classifyIntent(
  prompt: string,
  intents: CompiledIntent[],
  confidenceThreshold = 0.3,
): { intentId: string; confidence: number; classifierUsed: "rules" | "default" } {
  const ruleResults = classifyByRules(prompt, intents);

  if (ruleResults.length > 0 && ruleResults[0]!.confidence >= confidenceThreshold) {
    return {
      intentId: ruleResults[0]!.intentId,
      confidence: ruleResults[0]!.confidence,
      classifierUsed: "rules",
    };
  }

  // Fallback: best rule match even below threshold, or "general"
  if (ruleResults.length > 0) {
    return {
      intentId: ruleResults[0]!.intentId,
      confidence: ruleResults[0]!.confidence,
      classifierUsed: "rules",
    };
  }

  return {
    intentId: "general",
    confidence: 0,
    classifierUsed: "default",
  };
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
