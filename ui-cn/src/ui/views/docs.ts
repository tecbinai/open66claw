/**
 * 文档中心视图
 * 场景卡片式入口 + 搜索优先设计
 */

import { html, nothing } from "lit";
import {
  docsIndex,
  getDocById,
  getRelatedDocs,
  getAllDocs,
  type DocMeta,
  type DocCategory,
} from "../../docscn/docs-index.js";
import { t } from "../i18n/index.js";
import { toSanitizedMarkdownHtml } from "../markdown.js";
import {
  addDocFavorite,
  removeDocFavorite,
  isDocFavorite,
  addDocHistory,
  getDocHistory,
  loadDocsStorage,
} from "../storage.js";

export type DocsViewState = {
  mode: "home" | "search" | "reading";
  searchQuery: string;
  searchResults: DocMeta[];
  currentDocId: string | null;
  showSearchModal: boolean;
};

export type DocsViewProps = {
  state: DocsViewState;
  onSearchQueryChange: (query: string) => void;
  onDocSelect: (docId: string) => void;
  onBack: () => void;
  onToggleFavorite: (docId: string) => void;
  onOpenSearchModal: () => void;
  onCloseSearchModal: () => void;
};

/**
 * 简单的模糊搜索实现
 */
export function searchDocs(query: string): DocMeta[] {
  if (!query.trim()) return [];
  const normalizedQuery = query.toLowerCase().trim();
  const allDocs = getAllDocs();

  // 计算每个文档的匹配分数
  const scored = allDocs.map((doc) => {
    let score = 0;
    const title = doc.title.toLowerCase();
    const summary = doc.summary.toLowerCase();
    const keywords = doc.keywords.map((k) => k.toLowerCase());

    // 标题精确匹配 - 最高分
    if (title === normalizedQuery) score += 100;
    // 标题包含 - 高分
    else if (title.includes(normalizedQuery)) score += 50;
    // 摘要包含 - 中分
    if (summary.includes(normalizedQuery)) score += 30;
    // 关键词匹配 - 中分
    for (const keyword of keywords) {
      if (keyword.includes(normalizedQuery) || normalizedQuery.includes(keyword)) {
        score += 20;
      }
    }
    // 分词匹配
    const queryWords = normalizedQuery.split(/\s+/);
    for (const word of queryWords) {
      if (word.length < 2) continue;
      if (title.includes(word)) score += 10;
      if (summary.includes(word)) score += 5;
      for (const keyword of keywords) {
        if (keyword.includes(word)) score += 8;
      }
    }

    return { doc, score };
  });

  // 过滤并排序
  return scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map((item) => item.doc);
}

/**
 * 渲染文档主页
 */
function renderDocsHome(props: DocsViewProps) {
  const storage = loadDocsStorage();
  const history = getDocHistory();
  const favorites = storage.favorites;

  return html`
    <div class="docs-home">
      <!-- 搜索框 -->
      <div class="docs-search-bar" @click=${props.onOpenSearchModal}>
        <span class="docs-search-icon">🔍</span>
        <span class="docs-search-placeholder">${t("docs.searchPlaceholder")}</span>
        <span class="docs-search-shortcut">⌘K</span>
      </div>

      <!-- 分类卡片 -->
      <div class="docs-categories">
        ${docsIndex.categories.map(
          (category) => html`
            <div
              class="docs-category-card"
              style="--card-color: ${category.color}"
              @click=${() => {
                // 点击分类卡片，展示该分类的第一个文档
                const firstDocId = category.docs[0];
                if (firstDocId) {
                  props.onDocSelect(firstDocId);
                }
              }}
            >
              <div class="docs-category-icon">${category.icon}</div>
              <div class="docs-category-content">
                <div class="docs-category-title">${category.title}</div>
                <div class="docs-category-desc">${category.description}</div>
              </div>
              <div class="docs-category-count">${category.docs.length} 篇</div>
            </div>
          `,
        )}
      </div>

      <!-- 底部区域：历史和收藏 -->
      <div class="docs-bottom-section">
        ${
          history.length > 0
            ? html`
              <div class="docs-section">
                <div class="docs-section-title">📖 最近浏览</div>
                <div class="docs-section-list">
                  ${history.slice(0, 5).map((item) => {
                    const doc = getDocById(item.id);
                    if (!doc) return nothing;
                    return html`
                      <div
                        class="docs-list-item"
                        @click=${() => props.onDocSelect(item.id)}
                      >
                        <span class="docs-list-item-title">${doc.title}</span>
                        <span class="docs-list-item-time"
                          >${formatTimeAgo(item.timestamp)}</span
                        >
                      </div>
                    `;
                  })}
                </div>
              </div>
            `
            : nothing
        }
        ${
          favorites.length > 0
            ? html`
              <div class="docs-section">
                <div class="docs-section-title">⭐ 收藏的文档</div>
                <div class="docs-section-list">
                  ${favorites.slice(0, 5).map((docId) => {
                    const doc = getDocById(docId);
                    if (!doc) return nothing;
                    return html`
                      <div
                        class="docs-list-item"
                        @click=${() => props.onDocSelect(docId)}
                      >
                        <span class="docs-list-item-title">${doc.title}</span>
                      </div>
                    `;
                  })}
                </div>
              </div>
            `
            : nothing
        }
      </div>
    </div>
  `;
}

/**
 * 渲染文档阅读页
 */
function renderDocsReading(props: DocsViewProps) {
  const doc = props.state.currentDocId ? getDocById(props.state.currentDocId) : null;
  if (!doc) {
    return html`
      <div class="docs-error">文档不存在</div>
    `;
  }

  const isFavorite = isDocFavorite(doc.id);
  const relatedDocs = getRelatedDocs(doc.id);
  const category = docsIndex.categories.find((c) => c.id === doc.category);

  // 渲染 Markdown 内容
  const contentHtml = doc.content ? toSanitizedMarkdownHtml(doc.content) : "";

  return html`
    <div class="docs-reading">
      <!-- 顶部导航栏 -->
      <div class="docs-reading-header">
        <button class="docs-back-btn" @click=${props.onBack}>
          ← 返回
        </button>
        <div class="docs-reading-title">${doc.title}</div>
        <div class="docs-reading-actions">
          <button
            class="docs-action-btn ${isFavorite ? "active" : ""}"
            @click=${() => props.onToggleFavorite(doc.id)}
            title="${isFavorite ? "取消收藏" : "收藏"}"
          >
            ${isFavorite ? "★" : "☆"}
          </button>
        </div>
      </div>

      <!-- 面包屑 -->
      ${
        category
          ? html`
            <div class="docs-breadcrumb">
              <span class="docs-breadcrumb-icon">${category.icon}</span>
              <span class="docs-breadcrumb-text">${category.title}</span>
              <span class="docs-breadcrumb-sep">›</span>
              <span class="docs-breadcrumb-current">${doc.title}</span>
            </div>
          `
          : nothing
      }

      <!-- 文档内容 -->
      <div class="docs-content">
        <div class="docs-markdown" .innerHTML=${contentHtml}></div>
      </div>

      <!-- 相关文档 -->
      ${
        relatedDocs.length > 0
          ? html`
            <div class="docs-related">
              <div class="docs-related-title">📎 相关文档</div>
              <div class="docs-related-list">
                ${relatedDocs.map(
                  (relatedDoc) => html`
                    <div
                      class="docs-related-item"
                      @click=${() => props.onDocSelect(relatedDoc.id)}
                    >
                      <div class="docs-related-item-title">${relatedDoc.title}</div>
                      <div class="docs-related-item-summary">${relatedDoc.summary}</div>
                    </div>
                  `,
                )}
              </div>
            </div>
          `
          : nothing
      }
    </div>
  `;
}

/**
 * 渲染搜索模态框
 */
export function renderDocsSearchModal(props: DocsViewProps) {
  if (!props.state.showSearchModal) return nothing;

  const results = props.state.searchResults;
  const query = props.state.searchQuery;

  return html`
    <div class="docs-search-modal-overlay" @click=${props.onCloseSearchModal}>
      <div class="docs-search-modal" @click=${(e: Event) => e.stopPropagation()}>
        <div class="docs-search-modal-input-wrapper">
          <span class="docs-search-modal-icon">🔍</span>
          <input
            type="text"
            class="docs-search-modal-input"
            placeholder="输入关键词搜索文档..."
            .value=${query}
            @input=${(e: InputEvent) => {
              const value = (e.target as HTMLInputElement).value;
              props.onSearchQueryChange(value);
            }}
            autofocus
          />
          ${
            query
              ? html`
                <button
                  class="docs-search-clear"
                  @click=${() => props.onSearchQueryChange("")}
                >
                  ✕
                </button>
              `
              : nothing
          }
        </div>

        <div class="docs-search-results">
          ${
            results.length > 0
              ? html`
                <div class="docs-search-results-header">
                  📄 找到 ${results.length} 个结果
                </div>
                ${results.map(
                  (doc) => html`
                    <div
                      class="docs-search-result-item"
                      @click=${() => {
                        props.onDocSelect(doc.id);
                        props.onCloseSearchModal();
                      }}
                    >
                      <div class="docs-search-result-title">
                        ${highlightMatch(doc.title, query)}
                      </div>
                      <div class="docs-search-result-summary">
                        ${highlightMatch(doc.summary, query)}
                      </div>
                      <div class="docs-search-result-keywords">
                        ${doc.keywords
                          .slice(0, 3)
                          .map((kw) => html`<span class="docs-keyword-tag">${kw}</span>`)}
                      </div>
                    </div>
                  `,
                )}
              `
              : query
                ? html`
                  <div class="docs-search-empty">
                    <div class="docs-search-empty-icon">🔍</div>
                    <div class="docs-search-empty-text">
                      没有找到匹配 "${query}" 的文档
                    </div>
                    <div class="docs-search-empty-hint">
                      试试其他关键词，或浏览分类目录
                    </div>
                  </div>
                `
                : html`
                    <div class="docs-search-hint">
                      <div class="docs-search-hint-title">💡 搜索提示</div>
                      <div class="docs-search-hint-list">
                        <div class="docs-search-hint-item">输入 <code>安全</code> 查看安全相关文档</div>
                        <div class="docs-search-hint-item">输入 <code>telegram</code> 查看 Telegram 配置</div>
                        <div class="docs-search-hint-item">输入 <code>模型</code> 查看 AI 模型配置</div>
                      </div>
                    </div>
                  `
          }
        </div>

        <div class="docs-search-modal-footer">
          <span class="docs-search-footer-hint">
            <kbd>↑↓</kbd> 选择 <kbd>Enter</kbd> 打开 <kbd>Esc</kbd> 关闭
          </span>
        </div>
      </div>
    </div>
  `;
}

/**
 * 高亮匹配文本
 */
function highlightMatch(text: string, query: string): string {
  if (!query.trim()) return text;
  const regex = new RegExp(`(${escapeRegExp(query)})`, "gi");
  return text.replace(regex, '<mark class="docs-highlight">$1</mark>');
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 格式化时间
 */
function formatTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  if (hours < 24) return `${hours} 小时前`;
  if (days < 7) return `${days} 天前`;
  return new Date(timestamp).toLocaleDateString();
}

/**
 * 主渲染函数
 */
export function renderDocs(props: DocsViewProps) {
  const { state } = props;

  return html`
    <div class="docs-container">
      ${state.mode === "reading" ? renderDocsReading(props) : renderDocsHome(props)}
    </div>
    ${renderDocsSearchModal(props)}
  `;
}

/**
 * 创建初始状态
 */
export function createDocsViewState(): DocsViewState {
  return {
    mode: "home",
    searchQuery: "",
    searchResults: [],
    currentDocId: null,
    showSearchModal: false,
  };
}

/**
 * 状态更新辅助函数
 */
export function updateDocsViewState(
  state: DocsViewState,
  updates: Partial<DocsViewState>,
): DocsViewState {
  return { ...state, ...updates };
}

/**
 * 处理文档选择
 */
export function handleDocSelect(state: DocsViewState, docId: string): DocsViewState {
  addDocHistory(docId);
  return {
    ...state,
    mode: "reading",
    currentDocId: docId,
    showSearchModal: false,
  };
}

/**
 * 处理返回
 */
export function handleDocsBack(state: DocsViewState): DocsViewState {
  return {
    ...state,
    mode: "home",
    currentDocId: null,
  };
}

/**
 * 处理搜索
 */
export function handleDocsSearch(state: DocsViewState, query: string): DocsViewState {
  const results = searchDocs(query);
  return {
    ...state,
    searchQuery: query,
    searchResults: results,
  };
}

/**
 * 处理收藏切换
 */
export function handleToggleFavorite(docId: string): void {
  if (isDocFavorite(docId)) {
    removeDocFavorite(docId);
  } else {
    addDocFavorite(docId);
  }
}
