#!/usr/bin/env node

/**
 * 上游追踪数据采集脚本
 *
 * 检测 3 个生态项目的更新：
 *   1. OpenClaw 上游 (GitHub)
 *   2. OpenClaw-CN (Gitee)
 *   3. EasyClaw (GitHub)
 *
 * 用法:
 *   node scripts/upstream-watch/check-upstream.mjs [--target all|openclaw|openclaw-cn|easyclaw] [--force]
 *
 * 输出: dev/upstream-tracking/reports/YYYY-MM-DD.json
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const TRACKING_DIR = join(ROOT, "dev", "upstream-tracking");
const REPORTS_DIR = join(TRACKING_DIR, "reports");
const STATE_FILE = join(TRACKING_DIR, "state.json");
const API_SURFACE_FILE = join(TRACKING_DIR, "api-surface.json");
const VERSION_FILE = join(ROOT, ".openclaw-version");

// ─── CLI args ───────────────────────────────────────────

const args = process.argv.slice(2);
const target = getArg("--target") || "all";
const force = args.includes("--force");

function getArg(name) {
  const idx = args.indexOf(name);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : null;
}

// ─── HTTP helpers ───────────────────────────────────────

async function githubApi(path, token) {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "OpenClawCN-Upstream-Watch/1.0",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`https://api.github.com${path}`, { headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API ${path} → ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

async function giteeApi(path) {
  const token = process.env.GITEE_TOKEN;
  const params = token ? `?access_token=${token}` : "";
  const res = await fetch(`https://gitee.com/api/v5${path}${params}`, {
    headers: { "User-Agent": "OpenClawCN-Upstream-Watch/1.0" },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gitee API ${path} → ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

// ─── Classification ─────────────────────────────────────

const CLASSIFY_RULES = {
  breaking: {
    patterns: [
      /BREAKING/i,
      /breaking.?change/i,
      /removed?\s+(export|hook|api|type)/i,
      /renamed?\s+(hook|api|type)/i,
      /signature\s+change/i,
      /deprecated.*removed/i,
    ],
    impact: "critical",
  },
  security: {
    patterns: [
      /CVE-\d{4}-\d+/i,
      /security\s+fix/i,
      /vuln(erability)?/i,
      /XSS|SSRF|injection|CSRF/i,
      /GHSA-/i,
    ],
    impact: "high",
  },
  plugin_api: {
    patterns: [
      /plugin.?sdk/i,
      /hook.?(name|runner|handler)/i,
      /register(Tool|Hook|Channel|Provider|Service|Cli)/i,
      /PluginHook(Name|Handler)/i,
      /OpenClawPlugin(Api|Definition)/i,
    ],
    impact: "high",
  },
  feature: {
    patterns: [
      /feat(\(|:|\s)/i,
      /add(ed|s)?\s+(support|hook|tool|channel|provider)/i,
      /new\s+(plugin|extension|channel|provider)/i,
    ],
    impact: "medium",
  },
  bugfix: {
    patterns: [/fix(\(|:|\s)/i, /bug\s*fix/i, /hotfix/i],
    impact: "low",
  },
};

/** CN 生态关键词 — 用于扫描 OpenClaw-CN / EasyClaw 的 commit message */
const CN_INTEREST_KEYWORDS = [
  // 国产模型
  /deepseek/i,
  /硅基|siliconflow/i,
  /月之暗面|moonshot|kimi/i,
  /智谱|zhipu|glm/i,
  /通义|qwen|dashscope/i,
  /豆包|doubao|volcengine/i,
  /百度|qianfan|ernie/i,
  /minimax/i,
  /火山/i,
  // 通道
  /飞书|feishu|lark/i,
  /钉钉|dingtalk/i,
  /企微|wecom|wechat.?work/i,
  /微信|wechat/i,
  /QQ|qqbot/i,
  // 功能
  /provider/i,
  /channel/i,
  /hook/i,
  /plugin/i,
  /extension/i,
  /MCP/i,
  /tool/i,
  /skill/i,
  // 安全
  /security/i,
  /SSRF/i,
  /XSS/i,
  /注入|injection/i,
  // 部署
  /docker/i,
  /deploy/i,
  /ansible/i,
];

function classify(text) {
  for (const [category, rule] of Object.entries(CLASSIFY_RULES)) {
    if (rule.patterns.some((p) => p.test(text))) {
      return { category, impact: rule.impact };
    }
  }
  return { category: "other", impact: "info" };
}

function isInteresting(text) {
  return CN_INTEREST_KEYWORDS.some((p) => p.test(text));
}

// ─── Impact Analysis (lightweight, for CI) ──────────────

const WATCHED_FILES = [
  "src/plugins/types.ts",
  "src/plugins/hooks.ts",
  "src/plugins/registry.ts",
  "src/hooks/types.ts",
  "src/agents/pi-embedded-runner/run/attempt.ts",
  "src/agents/pi-embedded-runner/run.ts",
  "CHANGELOG.md",
  "package.json",
];

function analyzeImpact(change) {
  const impact = {
    patchCompat: "none",
    pluginApiCompat: "none",
    absorptionOpportunity: false,
    agentReviewNeeded: false,
    watchedFilesChanged: [],
  };

  const files = change.files || [];
  const fileNames = files.map((f) => (typeof f === "string" ? f : f.filename || f));

  // Check patch compat (attempt.ts / run.ts)
  if (fileNames.some((f) => f.includes("attempt.ts") || f.match(/run\.ts$/))) {
    impact.patchCompat = "check_needed";
    impact.agentReviewNeeded = true;
  }

  // Check plugin API compat
  if (fileNames.some((f) => f.match(/src\/plugins\/(types|hooks|registry)\.ts/))) {
    impact.pluginApiCompat = "changed";
    impact.agentReviewNeeded = true;
  }

  // Check absorption opportunity (new files in extensions/ or providers/)
  const newExtensions = fileNames.filter(
    (f) => f.startsWith("extensions/") && change.status === "added",
  );
  const newProviders = fileNames.filter(
    (f) => f.startsWith("src/providers/") && change.status === "added",
  );
  if (newExtensions.length > 0 || newProviders.length > 0) {
    impact.absorptionOpportunity = true;
  }

  // Watched files
  impact.watchedFilesChanged = fileNames.filter((f) => WATCHED_FILES.some((w) => f.includes(w)));

  // Classification triggers review
  if (["breaking", "security", "plugin_api"].includes(change.classification?.category)) {
    impact.agentReviewNeeded = true;
  }

  return impact;
}

// ─── Check: OpenClaw upstream ───────────────────────────

async function checkOpenclaw(state) {
  const token = process.env.GITHUB_TOKEN;
  const { repoOwner, repoName, baseCommit, latestKnownVersion } = state.openclaw;

  console.log(`[openclaw] Checking ${repoOwner}/${repoName}...`);

  // 1. Get latest release
  let latestRelease = null;
  try {
    const releases = await githubApi(`/repos/${repoOwner}/${repoName}/releases?per_page=5`, token);
    if (releases.length > 0) {
      latestRelease = releases[0];
    }
  } catch (e) {
    // Fallback: check tags
    try {
      const tags = await githubApi(`/repos/${repoOwner}/${repoName}/tags?per_page=5`, token);
      if (tags.length > 0) {
        latestRelease = { tag_name: tags[0].name, body: "" };
      }
    } catch {
      console.warn(`[openclaw] Cannot fetch releases or tags: ${e.message}`);
    }
  }

  const hasNewVersion = latestRelease && latestRelease.tag_name !== latestKnownVersion;

  // 2. Get recent commits (since our base)
  let recentCommits = [];
  try {
    const commits = await githubApi(`/repos/${repoOwner}/${repoName}/commits?per_page=30`, token);
    recentCommits = commits.map((c) => ({
      sha: c.sha.slice(0, 9),
      message: c.commit.message.split("\n")[0],
      date: c.commit.committer.date,
      author: c.commit.author.name,
    }));
  } catch (e) {
    console.warn(`[openclaw] Cannot fetch commits: ${e.message}`);
  }

  // 3. Classify changes
  const classifiedChanges = recentCommits
    .filter((c) => c.sha !== baseCommit?.slice(0, 9))
    .map((c) => ({
      ...c,
      classification: classify(c.message),
    }));

  // 4. Check for breaking changes in changelog (if new release)
  let changelogBreaking = [];
  if (hasNewVersion && latestRelease.body) {
    const breakingSection = latestRelease.body.match(/### Breaking[\s\S]*?(?=###|$)/i);
    if (breakingSection) {
      changelogBreaking = breakingSection[0]
        .split("\n")
        .filter((l) => l.startsWith("- ") || l.startsWith("* "))
        .map((l) => l.replace(/^[-*]\s*/, ""));
    }
  }

  return {
    currentVersion: latestKnownVersion,
    currentCommit: baseCommit,
    latestVersion: latestRelease?.tag_name || latestKnownVersion,
    latestCommit: recentCommits[0]?.sha || baseCommit,
    hasNewVersion,
    newCommitsCount: classifiedChanges.length,
    changes: classifiedChanges.slice(0, 20),
    changelogBreaking,
    summary: hasNewVersion
      ? `新版本 ${latestRelease.tag_name}（当前 ${latestKnownVersion}）`
      : classifiedChanges.length > 0
        ? `${classifiedChanges.length} 个新 commit`
        : "无更新",
  };
}

// ─── Check: OpenClaw-CN (Gitee) ────────────────────────

async function checkOpenclawCn(state) {
  const { repoOwner, repoName, latestKnownCommit } = state.openclawCn;

  console.log(`[openclaw-cn] Checking ${repoOwner}/${repoName} on Gitee...`);

  let recentCommits = [];
  try {
    const commits = await giteeApi(`/repos/${repoOwner}/${repoName}/commits?per_page=30`);
    recentCommits = commits.map((c) => ({
      sha: c.sha.slice(0, 9),
      message: (c.commit?.message || "").split("\n")[0],
      date: c.commit?.committer?.date,
      author: c.commit?.author?.name,
    }));
  } catch (e) {
    console.warn(`[openclaw-cn] Cannot fetch commits: ${e.message}`);
    return { error: e.message, interestingChanges: [] };
  }

  // Filter to new commits only
  const newCommits = latestKnownCommit
    ? recentCommits.filter((c) => c.sha !== latestKnownCommit.slice(0, 9))
    : recentCommits;

  // Find interesting commits (CN-relevant keywords)
  const interestingChanges = newCommits
    .filter((c) => isInteresting(c.message))
    .map((c) => ({
      ...c,
      classification: classify(c.message),
      matchedKeywords: CN_INTEREST_KEYWORDS.filter((p) => p.test(c.message)).map((p) => p.source),
    }));

  return {
    latestCommit: recentCommits[0]?.sha || latestKnownCommit,
    newCommitsCount: newCommits.length,
    interestingChanges: interestingChanges.slice(0, 15),
    summary:
      interestingChanges.length > 0
        ? `${interestingChanges.length} 个有趣的更新（共 ${newCommits.length} 个新 commit）`
        : newCommits.length > 0
          ? `${newCommits.length} 个新 commit（无特别关注项）`
          : "无更新",
  };
}

// ─── Check: EasyClaw (GitHub) ───────────────────────────

async function checkEasyclaw(state) {
  const token = process.env.GITHUB_TOKEN;
  const { repoOwner, repoName, latestKnownVersion, latestKnownCommit } = state.easyclaw;

  console.log(`[easyclaw] Checking ${repoOwner}/${repoName}...`);

  // 1. Check releases
  let latestRelease = null;
  try {
    const releases = await githubApi(`/repos/${repoOwner}/${repoName}/releases?per_page=5`, token);
    if (releases.length > 0) latestRelease = releases[0];
  } catch (e) {
    console.warn(`[easyclaw] Cannot fetch releases: ${e.message}`);
  }

  const hasNewVersion = latestRelease && latestRelease.tag_name !== latestKnownVersion;

  // 2. Recent commits
  let recentCommits = [];
  try {
    const commits = await githubApi(`/repos/${repoOwner}/${repoName}/commits?per_page=20`, token);
    recentCommits = commits.map((c) => ({
      sha: c.sha.slice(0, 9),
      message: c.commit.message.split("\n")[0],
      date: c.commit.committer.date,
      files: c.files?.map((f) => f.filename) || [],
    }));
  } catch (e) {
    console.warn(`[easyclaw] Cannot fetch commits: ${e.message}`);
  }

  // 3. Find interesting changes
  const interestingChanges = recentCommits
    .filter(
      (c) =>
        isInteresting(c.message) ||
        c.files?.some(
          (f) =>
            f.startsWith("extensions/") ||
            f.startsWith("packages/proxy-router/") ||
            f.startsWith("packages/rules/") ||
            f.startsWith("packages/policy/") ||
            f.startsWith("packages/secrets/") ||
            f.startsWith("packages/telemetry/"),
        ),
    )
    .map((c) => ({
      ...c,
      classification: classify(c.message),
    }));

  return {
    currentVersion: latestKnownVersion,
    latestVersion: latestRelease?.tag_name || latestKnownVersion,
    latestCommit: recentCommits[0]?.sha || latestKnownCommit,
    hasNewVersion,
    interestingChanges: interestingChanges.slice(0, 10),
    summary: hasNewVersion
      ? `新版本 ${latestRelease.tag_name}`
      : interestingChanges.length > 0
        ? `${interestingChanges.length} 个有趣的更新`
        : "无特别更新",
  };
}

// ─── Main ───────────────────────────────────────────────

async function main() {
  // Load state
  const state = JSON.parse(readFileSync(STATE_FILE, "utf-8"));

  // Read .openclaw-version if exists
  if (existsSync(VERSION_FILE)) {
    const [commit, version] = readFileSync(VERSION_FILE, "utf-8").trim().split(/\s+/);
    state.openclaw.baseCommit = commit;
    state.openclaw.latestKnownVersion = version || state.openclaw.latestKnownVersion;
  }

  const report = {
    date: new Date().toISOString().slice(0, 10),
    timestamp: new Date().toISOString(),
    target,
    sources: {},
    overallSummary: [],
    actionItems: [],
  };

  // Run checks based on target
  if (target === "all" || target === "openclaw") {
    try {
      report.sources.openclaw = await checkOpenclaw(state);
      // Run impact analysis on classified changes
      for (const change of report.sources.openclaw.changes || []) {
        change.impact = analyzeImpact(change);
      }
    } catch (e) {
      report.sources.openclaw = { error: e.message };
      console.error(`[openclaw] Error: ${e.message}`);
    }
  }

  if (target === "all" || target === "openclaw-cn") {
    try {
      report.sources.openclawCn = await checkOpenclawCn(state);
    } catch (e) {
      report.sources.openclawCn = { error: e.message };
      console.error(`[openclaw-cn] Error: ${e.message}`);
    }
  }

  if (target === "all" || target === "easyclaw") {
    try {
      report.sources.easyclaw = await checkEasyclaw(state);
    } catch (e) {
      report.sources.easyclaw = { error: e.message };
      console.error(`[easyclaw] Error: ${e.message}`);
    }
  }

  // Build action items
  const ocl = report.sources.openclaw;
  if (ocl && !ocl.error) {
    if (ocl.hasNewVersion) {
      report.actionItems.push({
        priority: "high",
        action: `上游发布新版本 ${ocl.latestVersion}，需验证兼容性`,
        source: "openclaw",
      });
    }
    if (ocl.changelogBreaking?.length > 0) {
      report.actionItems.push({
        priority: "critical",
        action: `上游有 ${ocl.changelogBreaking.length} 个 Breaking Change`,
        details: ocl.changelogBreaking,
        source: "openclaw",
      });
    }
    const criticalChanges = (ocl.changes || []).filter(
      (c) => c.classification?.impact === "critical" || c.classification?.impact === "high",
    );
    if (criticalChanges.length > 0) {
      report.actionItems.push({
        priority: "high",
        action: `${criticalChanges.length} 个高优先级上游变更需要审阅`,
        source: "openclaw",
      });
    }
  }

  const cn = report.sources.openclawCn;
  if (cn && !cn.error && cn.interestingChanges?.length > 0) {
    report.actionItems.push({
      priority: "medium",
      action: `OpenClaw-CN 有 ${cn.interestingChanges.length} 个有趣的更新`,
      source: "openclaw-cn",
    });
  }

  const ec = report.sources.easyclaw;
  if (ec && !ec.error && ec.hasNewVersion) {
    report.actionItems.push({
      priority: "medium",
      action: `EasyClaw 发布新版本 ${ec.latestVersion}`,
      source: "easyclaw",
    });
  }

  // Summary
  report.overallSummary = report.actionItems.map((a) => `[${a.priority}] ${a.action}`);
  if (report.actionItems.length === 0) {
    report.overallSummary = ["所有项目无重要更新"];
  }

  // Update state
  if (ocl && !ocl.error) {
    state.openclaw.latestKnownVersion = ocl.latestVersion;
    state.openclaw.latestKnownCommit = ocl.latestCommit;
  }
  if (cn && !cn.error && cn.latestCommit) {
    state.openclawCn.latestKnownCommit = cn.latestCommit;
  }
  if (ec && !ec.error) {
    if (ec.latestVersion) state.easyclaw.latestKnownVersion = ec.latestVersion;
    if (ec.latestCommit) state.easyclaw.latestKnownCommit = ec.latestCommit;
  }
  state.lastCheck = report.timestamp;

  // Write outputs
  mkdirSync(REPORTS_DIR, { recursive: true });
  const reportPath = join(REPORTS_DIR, `${report.date}.json`);
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

  // Console summary
  console.log("\n" + "=".repeat(60));
  console.log("  上游追踪报告  " + report.date);
  console.log("=".repeat(60));
  for (const line of report.overallSummary) {
    console.log("  " + line);
  }
  console.log("=".repeat(60));
  console.log(`报告已写入: ${reportPath}`);

  // GitHub Actions outputs
  if (process.env.GITHUB_OUTPUT) {
    const outputs = [
      `has_new_version=${ocl?.hasNewVersion || false}`,
      `latest_tag=${ocl?.latestVersion || ""}`,
      `action_items_count=${report.actionItems.length}`,
      `has_critical=${report.actionItems.some((a) => a.priority === "critical")}`,
      `has_high=${report.actionItems.some((a) => a.priority === "high" || a.priority === "critical")}`,
      `summary=${report.overallSummary.join(" | ")}`,
      `report_path=${reportPath}`,
    ];
    writeFileSync(process.env.GITHUB_OUTPUT, outputs.join("\n") + "\n", { flag: "a" });
  }

  // Exit code: 0=ok, 1=has critical items
  if (report.actionItems.some((a) => a.priority === "critical")) {
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exitCode = 2;
});
