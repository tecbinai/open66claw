import { markInstallFinished } from "../app-gateway";
import { formatGeneralError } from "../chat/error-hints";
import { getSkillTranslation } from "../data/skill-i18n.js";
import type { GatewayBrowserClient } from "../gateway";
import { t } from "../i18n/index.js";
import type { RemoteSkillsIndex, SkillStatusReport, SkillsMarketResponse } from "../types";

export type SkillsTab = "active" | "library" | "blocked" | "market" | "mcp-store";

/** 目录浏览结果（skills.browse RPC） */
export type BrowseResult = {
  currentPath: string;
  parentPath: string | null;
  directories: Array<{ name: string; path: string; hasSkillMd: boolean }>;
  files: Array<{ name: string; path: string }>;
  drives: string[];
  separator: string;
  isSkillDir: boolean;
  skillSubdirCount: number;
};

/** 统一视图层级筛选 */
export type SkillsTierGroup = "all" | "core" | "ready" | "needs-config" | "disabled" | "catalog";

/** 安装进度阶段 */
export type InstallProgressStage = "downloading" | "installing" | "verifying" | "done";

/** 安装进度信息 */
export type InstallProgress = {
  stage: InstallProgressStage;
  message: string;
  percent?: number;
};

/** Skills marketplace 服务端搜索结果 */
export type SkillsMarketSearchResult = {
  items: Array<{
    skillId: string;
    name: string;
    /** 中文名称 (from skill-translations.json via skills_marketplace.search) */
    nameCn?: string;
    /** 兼容 MCP marketplace 接口的中文名称 */
    friendlyName?: string;
    /** 兼容 MCP marketplace 接口的中文名称 */
    friendlyNameCn?: string;
    description: string;
    descriptionCn?: string;
    category?: string;
    tags?: string[];
    emoji?: string;
    tier?: string;
    overallScore?: number;
    cnBlocked?: boolean;
    cnAlternative?: string;
    installed?: boolean;
    path: string;
    source?: string;
  }>;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type SkillsState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  skillsLoading: boolean;
  skillsReport: SkillStatusReport | null;
  skillsError: string | null;
  skillsBusyKey: string | null;
  skillEdits: Record<string, string>;
  skillMessages: SkillMessageMap;
  // 安装进度追踪
  skillsInstallProgress: Record<string, InstallProgress>;
  // Remote skills - UI 状态统一使用 skillsXxx 前缀
  skillsActiveTab: SkillsTab;
  skillsRemoteLoading: boolean;
  skillsRemoteIndex: RemoteSkillsIndex | null;
  skillsRemoteError: string | null;
  // Skills Market (new local-index based)
  skillsMarketLoading: boolean;
  skillsMarketResponse: SkillsMarketResponse | null;
  skillsMarketSyncing: boolean;
  skillsMarketLastSyncedAt: string | null;
  skillsMarketError: string | null;
  // Skills Market (SQLite-backed search)
  skillsMarketSearchResult: SkillsMarketSearchResult | null;
  skillsMarketPage: number;
  // Category filter
  skillsActiveCategory: string;
  // Filter — local tab only (not shared with marketplace search)
  skillsFilter: string;
  // Marketplace search keyword — separate from local filter to avoid state pollution
  skillsMarketKeyword: string;
  // Pagination — 每次显示多少条，点「加载更多」递增
  skillsVisibleCount: number;
  // 统一视图层级筛选
  skillsTierGroupFilter: SkillsTierGroup;
  // 导入本地技能
  skillsImportOpen: boolean;
  skillsImportPath: string;
  skillsImportBrowseResult: BrowseResult | null;
  skillsImportLoading: boolean;
  skillsImportError: string | null;
  skillsImportSuccess: string | null;
  // 详情弹窗 — 选中的技能
  selectedSkillKey: string | null;
  selectedMarketSkill: SkillsMarketSearchResult["items"][number] | null;
  // 侧栏 tier 筛选
  sidebarTierFilter: "all" | "core" | "ready" | "needs-config";
};

export type SkillMessage = {
  kind: "success" | "error";
  message: string;
};

export type SkillMessageMap = Record<string, SkillMessage>;

type LoadSkillsOptions = {
  clearMessages?: boolean;
};

function setSkillMessage(state: SkillsState, key: string, message?: SkillMessage) {
  if (!key.trim()) return;
  const next = { ...state.skillMessages };
  if (message) next[key] = message;
  else delete next[key];
  state.skillMessages = next;
}

function getErrorMessage(err: unknown) {
  if (err instanceof Error) return err.message;
  return String(err);
}

/** CN: 将 raw error 转为用户友好的中文提示 */
function friendlyError(err: unknown, context?: string): string {
  return formatGeneralError(getErrorMessage(err), context).detail;
}

/** 详情弹窗选中 */
export function selectSkill(state: SkillsState, skillKey: string | null) {
  state.selectedSkillKey = skillKey;
}
export function selectMarketSkill(
  state: SkillsState,
  item: SkillsMarketSearchResult["items"][number] | null,
) {
  state.selectedMarketSkill = item;
}

/** Pending reload requested while a loadSkills was already in flight */
let _pendingReload = false;

export async function loadSkills(state: SkillsState, options?: LoadSkillsOptions) {
  const _t0 = performance.now();
  if (options?.clearMessages && Object.keys(state.skillMessages).length > 0) {
    state.skillMessages = {};
  }
  if (!state.client || !state.connected) return;
  if (state.skillsLoading) {
    // Another load is in flight — schedule a reload after it finishes
    _pendingReload = true;
    return;
  }
  state.skillsLoading = true;
  state.skillsError = null;
  try {
    const res = (await state.client.request("skills.status", {})) as SkillStatusReport | undefined;
    if (res) {
      // CN: inject Chinese translations from local JSON
      for (const skill of res.skills) {
        const tr = getSkillTranslation(skill.name);
        if (tr) {
          if (!skill.nameZh && tr.nameZh) skill.nameZh = tr.nameZh;
          if (!skill.descriptionZh && tr.descZh) skill.descriptionZh = tr.descZh;
        }
      }
      state.skillsReport = res;
    }
    console.log(
      `[perf][UI] loadSkills (skills.status) = ${(performance.now() - _t0).toFixed(1)}ms`,
    );
  } catch (err) {
    state.skillsError = friendlyError(err, "加载技能列表");
    console.log(`[perf][UI] loadSkills FAILED = ${(performance.now() - _t0).toFixed(1)}ms`);
  } finally {
    state.skillsLoading = false;
  }
  // If someone requested a reload while we were busy, do it now
  if (_pendingReload) {
    _pendingReload = false;
    await loadSkills(state);
  }
}

export function updateSkillEdit(state: SkillsState, skillKey: string, value: string) {
  state.skillEdits = { ...state.skillEdits, [skillKey]: value };
}

export async function updateSkillEnabled(state: SkillsState, skillKey: string, enabled: boolean) {
  if (!state.client || !state.connected) return;
  state.skillsBusyKey = skillKey;
  state.skillsError = null;
  try {
    await state.client.request("skills.update", { skillKey, enabled });
    await loadSkills(state);
    setSkillMessage(state, skillKey, {
      kind: "success",
      message: enabled ? "技能已启用" : "技能已禁用",
    });
  } catch (err) {
    const message = friendlyError(err, "技能操作");
    state.skillsError = message;
    setSkillMessage(state, skillKey, {
      kind: "error",
      message,
    });
  } finally {
    state.skillsBusyKey = null;
  }
}

export async function saveSkillApiKey(state: SkillsState, skillKey: string) {
  if (!state.client || !state.connected) return;
  state.skillsBusyKey = skillKey;
  state.skillsError = null;
  try {
    const apiKey = state.skillEdits[skillKey] ?? "";
    await state.client.request("skills.update", { skillKey, apiKey });
    await loadSkills(state);
    setSkillMessage(state, skillKey, {
      kind: "success",
      message: "API 密钥已保存",
    });
  } catch (err) {
    const message = friendlyError(err, "技能操作");
    state.skillsError = message;
    setSkillMessage(state, skillKey, {
      kind: "error",
      message,
    });
  } finally {
    state.skillsBusyKey = null;
  }
}

export async function installSkill(
  state: SkillsState,
  skillKey: string,
  name: string,
  installId: string,
) {
  if (!state.client || !state.connected) return;
  state.skillsBusyKey = skillKey;
  state.skillsError = null;

  // Show initial progress (real-time updates arrive via WS "skill.install.progress")
  setInstallProgress(state, name, {
    stage: "downloading",
    message: "正在准备安装...",
    percent: 5,
  });

  try {
    const result = (await state.client.request("skills.install", {
      name,
      installId,
      timeoutMs: 120000,
    })) as { ok?: boolean; message?: string };

    // Show completion progress
    setInstallProgress(state, name, {
      stage: "done",
      message: result?.message ?? "安装成功！",
      percent: 100,
    });

    // Refresh skills list — skill should move from needs-config to ready
    await loadSkills(state);
    setSkillMessage(state, skillKey, {
      kind: "success",
      message: result?.message ?? "已安装",
    });

    // Clear progress after brief delay
    setTimeout(() => {
      setInstallProgress(state, name, null);
    }, 1500);
  } catch (err) {
    const message = friendlyError(err, "技能安装");
    state.skillsError = message;
    // Mark as "done" first to block late-arriving WS progress events
    setInstallProgress(state, name, { stage: "done", message, percent: 0 });
    setSkillMessage(state, skillKey, {
      kind: "error",
      message,
    });
    // Then clear after a brief delay
    setTimeout(() => {
      setInstallProgress(state, name, null);
    }, 1500);
  } finally {
    state.skillsBusyKey = null;
  }
}

export async function toggleSkillPinned(state: SkillsState, skillKey: string, pinned: boolean) {
  if (!state.client || !state.connected) return;
  state.skillsBusyKey = skillKey;
  state.skillsError = null;
  try {
    await state.client.request("skills.update", { skillKey, pinned });
    await loadSkills(state);
    setSkillMessage(state, skillKey, {
      kind: "success",
      message: pinned ? "已置顶" : "已取消置顶",
    });
  } catch (err) {
    const message = friendlyError(err, "技能操作");
    state.skillsError = message;
    setSkillMessage(state, skillKey, {
      kind: "error",
      message,
    });
  } finally {
    state.skillsBusyKey = null;
  }
}

// ============================================================================
// Core Skills — promote / demote / limit
// ============================================================================

/**
 * 核心技能硬上限 — 技能不是越多越好！
 *
 * 每个核心技能的描述都会注入 system prompt，在每一次 API 请求中消耗 token。
 * 过多核心技能会：
 * - 浪费大量 token（70+ 技能 ≈ 数千 token / 请求）
 * - 对 32K/64K 上下文窗口模型频繁触发 compaction
 * - 降低 AI 回答质量（上下文被压缩）
 *
 * 上游默认限制 150 个 / 30000 字符（DEFAULT_MAX_SKILLS_IN_PROMPT）。
 * 建议保持 ~50 个即可，最多不超过 150 个。
 */
export const CORE_SKILLS_MAX = 150;

export function countCoreSkills(report: SkillStatusReport | null): number {
  if (!report) return 0;
  // Core = eligible + not disabled + not blocked (matches groupByTier "core" bucket).
  // These skills ARE injected into every LLM request by the upstream prompt builder.
  return report.skills.filter(
    (s) => s.eligible && !s.disabled && !s.blockedByAllowlist && s.missing.os.length === 0,
  ).length;
}

export async function promoteSkillToCore(state: SkillsState, skillKey: string) {
  const coreCount = countCoreSkills(state.skillsReport);
  if (coreCount >= CORE_SKILLS_MAX) {
    setSkillMessage(state, skillKey, {
      kind: "error",
      message: `核心技能已达上限 (${CORE_SKILLS_MAX})，请先移除其他核心技能`,
    });
    return;
  }
  await toggleSkillPinned(state, skillKey, true);
}

export async function demoteSkillFromCore(state: SkillsState, skillKey: string) {
  await toggleSkillPinned(state, skillKey, false);
}

/** 每页显示数量 */
export const SKILLS_PAGE_SIZE = 50;

export function setActiveTab(state: SkillsState, tab: SkillsTab) {
  state.skillsActiveTab = tab;
  state.skillsVisibleCount = SKILLS_PAGE_SIZE; // 切 Tab 重置分页
}

export function setActiveCategory(state: SkillsState, category: string) {
  state.skillsActiveCategory = category;
  state.skillsVisibleCount = SKILLS_PAGE_SIZE; // 切分类重置分页
}

export function setTierGroupFilter(state: SkillsState, tier: SkillsTierGroup) {
  state.skillsTierGroupFilter = tier;
  state.skillsVisibleCount = SKILLS_PAGE_SIZE;
}

export function loadMoreSkills(state: SkillsState) {
  state.skillsVisibleCount = (state.skillsVisibleCount || SKILLS_PAGE_SIZE) + SKILLS_PAGE_SIZE;
}

export async function loadRemoteSkills(state: SkillsState) {
  if (!state.client || !state.connected) return;
  if (state.skillsRemoteLoading) return;
  state.skillsRemoteLoading = true;
  state.skillsRemoteError = null;
  try {
    const res = (await state.client.request("skills.remote.list", {})) as
      | RemoteSkillsIndex
      | undefined;
    if (res) {
      state.skillsRemoteIndex = res;
    }
  } catch (err) {
    state.skillsRemoteError = friendlyError(err, "加载远程技能");
  } finally {
    state.skillsRemoteLoading = false;
  }
}

/** 更新安装进度 */
function setInstallProgress(
  state: SkillsState,
  skillName: string,
  progress: InstallProgress | null,
) {
  const next = { ...state.skillsInstallProgress };
  if (progress) {
    next[skillName] = progress;
  } else {
    delete next[skillName];
    // Block late WS events from re-injecting stale progress after clear
    markInstallFinished(skillName);
  }
  state.skillsInstallProgress = next;
}

export async function installRemoteSkill(state: SkillsState, skillName: string) {
  // 检查连接状态，给出友好提示而不是静默失败
  if (!state.client || !state.connected) {
    const message = "服务未连接，请刷新页面或检查 Gateway 是否正常运行";
    state.skillsRemoteError = message;
    state.skillsMarketError = message;
    setSkillMessage(state, skillName, {
      kind: "error",
      message,
    });
    return;
  }
  state.skillsBusyKey = skillName;
  state.skillsRemoteError = null;
  state.skillsMarketError = null;

  // 阶段1: 开始下载
  setInstallProgress(state, skillName, {
    stage: "downloading",
    message: "正在从云端下载技能包...",
    percent: 20,
  });

  // 模拟下载进度（因为后端是一次性返回结果）
  const progressTimer = setInterval(() => {
    // Stop phantom updates if disconnected or install already finished
    if (!state.connected) {
      clearInterval(progressTimer);
      return;
    }
    const current = state.skillsInstallProgress[skillName];
    if (!current || current.stage === "done" || current.stage === "verifying") {
      clearInterval(progressTimer);
      return;
    }
    if (current.stage === "downloading" && (current.percent ?? 0) < 80) {
      setInstallProgress(state, skillName, {
        stage: "downloading",
        message: "正在从云端下载技能包...",
        percent: Math.min((current.percent ?? 20) + 10, 80),
      });
    }
  }, 500);

  try {
    // Step 1: 从云端下载技能到本地 ~/.openclaw/skills/{skillId}/
    // 使用 CN-adapter 的 skills_marketplace.download，它会通过详情接口获取 content 保存为 SKILL.md
    const downloadResult = (await state.client.request("skills_marketplace.download", {
      skillId: skillName,
    })) as { ok?: boolean; skillId?: string; installedTo?: string; message?: string };

    clearInterval(progressTimer);

    if (!downloadResult?.ok && !downloadResult?.installedTo) {
      throw new Error(downloadResult?.message ?? "云端下载失败");
    }

    // 阶段2: 安装验证
    setInstallProgress(state, skillName, {
      stage: "verifying",
      message: "正在验证安装...",
      percent: 90,
    });

    // 立即在内存中标记为已安装（乐观更新，避免等待服务端 re-search 的延迟）
    if (state.skillsMarketSearchResult) {
      const item = state.skillsMarketSearchResult.items.find(
        (i) => i.skillId === skillName || i.name === skillName,
      );
      if (item) item.installed = true;
    }

    // Refresh both lists (local skills + market) and re-search SQLite
    // loadMarketSkills 更新 JSON 索引缓存，searchMarketSkills 刷新 SQLite 搜索结果
    // 两者都需要，否则 UI 显示的 installed 状态不会更新
    await Promise.all([loadSkills(state), loadMarketSkills(state), searchMarketSkills(state)]);

    // 阶段3: 完成
    setInstallProgress(state, skillName, {
      stage: "done",
      message: "安装成功！",
      percent: 100,
    });

    setSkillMessage(state, skillName, {
      kind: "success",
      message: "已安装（技能文件）",
    });

    // 延迟清除进度状态，留在技能市场页面（不跳转，卡片已显示"已安装"状态）
    setTimeout(() => {
      setInstallProgress(state, skillName, null);
    }, 1500);
  } catch (err) {
    clearInterval(progressTimer);
    const message = friendlyError(err, "技能安装");
    state.skillsRemoteError = message;
    state.skillsMarketError = message;
    // Mark as "done" first to block late WS events, then clear after delay
    setInstallProgress(state, skillName, { stage: "done", message, percent: 0 });
    setSkillMessage(state, skillName, {
      kind: "error",
      message,
    });
    setTimeout(() => {
      setInstallProgress(state, skillName, null);
    }, 1500);
  } finally {
    state.skillsBusyKey = null;
  }
}

// ============================================================================
// Skills Market — Uninstall
// ============================================================================

export async function uninstallRemoteSkill(state: SkillsState, skillName: string) {
  if (!state.client || !state.connected) {
    state.skillsMarketError = "服务未连接";
    return;
  }
  state.skillsBusyKey = skillName;
  state.skillsMarketError = null;

  try {
    const result = (await state.client.request("skills_marketplace.uninstall", {
      skillId: skillName,
    })) as { ok?: boolean; skillId?: string; message?: string };

    if (!result?.skillId) {
      throw new Error(result?.message ?? "卸载失败");
    }

    // 更新内存中的安装状态
    if (state.skillsMarketSearchResult) {
      const item = state.skillsMarketSearchResult.items.find(
        (i) => i.skillId === skillName || i.name === skillName,
      );
      if (item) item.installed = false;
    }

    // 刷新市场和本地列表
    await Promise.all([loadSkills(state), loadMarketSkills(state), searchMarketSkills(state)]);

    setSkillMessage(state, skillName, {
      kind: "success",
      message: "已卸载",
    });
  } catch (err) {
    const message = friendlyError(err, "技能卸载");
    state.skillsMarketError = message;
    setSkillMessage(state, skillName, { kind: "error", message });
  } finally {
    state.skillsBusyKey = null;
  }
}

// ============================================================================
// Skills Market — 统一走 skills_marketplace.search（云端优先 + 本地 fallback）
// ============================================================================

/**
 * 加载技能市场列表（首次进入市场 tab 时调用）
 * 后端自动决定走云端还是本地 SQLite
 */
export async function loadMarketSkills(state: SkillsState) {
  const _t0 = performance.now();
  if (!state.client || !state.connected) return;
  if (state.skillsMarketLoading) return;
  state.skillsMarketLoading = true;
  state.skillsMarketError = null;
  try {
    const result = (await state.client.request("skills_marketplace.search", {
      keyword: state.skillsMarketKeyword || undefined,
      category:
        (state.skillsActiveCategory || "all") === "all" ? undefined : state.skillsActiveCategory,
      page: 1,
      pageSize: 20,
      orderBy: "overall_score",
      orderDirection: "DESC",
    })) as SkillsMarketSearchResult | undefined;
    if (result) {
      state.skillsMarketSearchResult = result;
      state.skillsMarketPage = result.page;
      state.skillsMarketSyncing = false;
      state.skillsMarketLastSyncedAt = new Date().toISOString();
    }
    console.log(
      `[perf][UI] loadMarketSkills = ${(performance.now() - _t0).toFixed(1)}ms (${result?.total ?? 0} total)`,
    );
  } catch (err) {
    state.skillsMarketError = friendlyError(err, "技能市场");
    console.log(`[perf][UI] loadMarketSkills FAILED = ${(performance.now() - _t0).toFixed(1)}ms`);
  } finally {
    state.skillsMarketLoading = false;
  }
}

/**
 * 强制刷新技能市场（用户手动触发，绕过缓存）
 */
export async function refreshMarketSkills(state: SkillsState) {
  if (!state.client || !state.connected) return;
  state.skillsMarketLoading = true;
  state.skillsMarketSyncing = true;
  state.skillsMarketError = null;
  try {
    const result = (await state.client.request("skills_marketplace.search", {
      keyword: state.skillsMarketKeyword || undefined,
      category:
        (state.skillsActiveCategory || "all") === "all" ? undefined : state.skillsActiveCategory,
      page: 1,
      pageSize: 20,
      orderBy: "overall_score",
      orderDirection: "DESC",
      force: true,
    })) as SkillsMarketSearchResult | undefined;
    if (result) {
      state.skillsMarketSearchResult = result;
      state.skillsMarketPage = result.page;
      state.skillsMarketLastSyncedAt = new Date().toISOString();
    }
  } catch (err) {
    state.skillsMarketError = friendlyError(err, "技能市场");
  } finally {
    state.skillsMarketLoading = false;
    state.skillsMarketSyncing = false;
  }
}

// ============================================================================
// Skills Market Search (SQLite-backed) - 服务端搜索+分页
// ============================================================================

/**
 * 服务端搜索技能市场（FTS5 全文搜索 + 分页）
 * 使用 skills_marketplace.search RPC 端点
 */
export async function searchMarketSkills(
  state: SkillsState,
  options?: {
    keyword?: string;
    category?: string;
    page?: number;
    pageSize?: number;
  },
) {
  if (!state.client || !state.connected) return;
  state.skillsMarketLoading = true;
  state.skillsMarketError = null;
  try {
    const result = (await state.client.request("skills_marketplace.search", {
      keyword: options?.keyword ?? (state.skillsMarketKeyword || undefined),
      category:
        (options?.category || state.skillsActiveCategory || "all") === "all"
          ? undefined
          : options?.category || state.skillsActiveCategory,
      page: options?.page ?? state.skillsMarketPage ?? 1,
      pageSize: options?.pageSize ?? 20,
      orderBy: "overall_score",
      orderDirection: "DESC",
    })) as SkillsMarketSearchResult | undefined;
    if (result) {
      state.skillsMarketSearchResult = result;
      state.skillsMarketPage = result.page;
    }
  } catch (err) {
    state.skillsMarketError = friendlyError(err, "技能市场");
  } finally {
    state.skillsMarketLoading = false;
  }
}

/**
 * 翻页：加载下一页
 */
export async function searchMarketSkillsNextPage(state: SkillsState) {
  const current = state.skillsMarketSearchResult;
  if (!current || current.page >= current.totalPages) return;
  await searchMarketSkills(state, { page: current.page + 1 });
}

/**
 * 翻页：加载上一页
 */
export async function searchMarketSkillsPrevPage(state: SkillsState) {
  const current = state.skillsMarketSearchResult;
  if (!current || current.page <= 1) return;
  await searchMarketSkills(state, { page: current.page - 1 });
}

/**
 * 无限滚动：加载下一页并追加到已有结果
 */
export async function loadMoreMarketSkills(state: SkillsState) {
  const current = state.skillsMarketSearchResult;
  if (!current || current.page >= current.totalPages) return;
  if (state.skillsMarketLoading) return;

  state.skillsMarketLoading = true;
  state.skillsMarketError = null;
  try {
    const nextPage = current.page + 1;
    const result = (await state.client?.request("skills_marketplace.search", {
      keyword: state.skillsMarketKeyword || undefined,
      category:
        (state.skillsActiveCategory || "all") === "all" ? undefined : state.skillsActiveCategory,
      page: nextPage,
      pageSize: 20,
      orderBy: "overall_score",
      orderDirection: "DESC",
    })) as SkillsMarketSearchResult | undefined;
    if (result) {
      state.skillsMarketSearchResult = {
        ...result,
        items: [...current.items, ...result.items],
      };
      state.skillsMarketPage = result.page;
    }
  } catch (err) {
    state.skillsMarketError = friendlyError(err, "技能市场");
  } finally {
    state.skillsMarketLoading = false;
  }
}

// ============================================================================
// Skills Import — 本地技能导入
// ============================================================================

export async function openSkillImport(state: SkillsState) {
  state.skillsImportOpen = true;
  state.skillsImportPath = "";
  state.skillsImportBrowseResult = null;
  state.skillsImportError = null;
  state.skillsImportSuccess = null;
  state.skillsImportLoading = false;
  await browseSkillDir(state);
}

export function closeSkillImport(state: SkillsState) {
  state.skillsImportOpen = false;
  state.skillsImportPath = "";
  state.skillsImportBrowseResult = null;
  state.skillsImportError = null;
  state.skillsImportSuccess = null;
  state.skillsImportLoading = false;
}

export async function browseSkillDir(state: SkillsState, path?: string) {
  if (!state.client || !state.connected) return;
  state.skillsImportLoading = true;
  state.skillsImportError = null;
  try {
    const params: { path?: string } = {};
    if (path) params.path = path;
    const result = (await state.client.request("skills.browse", params)) as
      | BrowseResult
      | undefined;
    if (result) {
      state.skillsImportBrowseResult = result;
      state.skillsImportPath = result.currentPath;
    }
  } catch (err) {
    state.skillsImportError = friendlyError(err, "技能导入");
  } finally {
    state.skillsImportLoading = false;
  }
}

export async function importSkill(state: SkillsState, path: string, mode: "copy" | "reference") {
  if (!state.client || !state.connected) return;
  state.skillsImportLoading = true;
  state.skillsImportError = null;
  state.skillsImportSuccess = null;
  try {
    const result = (await state.client.request("skills.import", { path, mode })) as
      | { ok: boolean; imported: string[]; mode: string }
      | undefined;
    if (result?.ok) {
      await loadSkills(state, { clearMessages: true });
      // 显示成功提示，1.5 秒后自动关闭弹窗
      state.skillsImportLoading = false;
      const names = result.imported?.join(", ") || "";
      state.skillsImportSuccess = names
        ? `${t("skills.import.success" as never)}：${names}`
        : (t("skills.import.success" as never) as string);
      setTimeout(() => closeSkillImport(state), 1500);
    }
  } catch (err) {
    state.skillsImportError = friendlyError(err, "技能导入");
  } finally {
    state.skillsImportLoading = false;
  }
}
