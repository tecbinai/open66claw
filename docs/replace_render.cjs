const fs = require("fs");
const path = "d:/newopenclaw/ui-cn/src/ui/views/model-config.ts";
const content = fs.readFileSync(path, "utf8");
const lines = content.split("\n");

// Find boundaries
let startIdx = null,
  endIdx = null;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("ONBOARDING BANNER") && lines[i].includes("═══════")) {
    startIdx = i;
  }
  if (lines[i].includes("MODEL SELECTOR MODAL") && lines[i].includes("═══════")) {
    endIdx = i;
    break;
  }
}

console.log(`Replacing lines ${startIdx + 1} to ${endIdx} (before MODEL SELECTOR)`);

const newRender = `  /* ═══════ CAPABILITY LIST (left column, vertical) ═══════ */
  private _renderCapabilityList() {
    return html\`
      <div class="cap-list">
        \${USER_CAPABILITIES.map(uc => this._renderCapCard(uc))}
      </div>
    \`;
  }

  private _renderCapCard(userCap: UserCapDef) {
    const active = this._isUserCapActive(userCap);
    const hasMultiSubs = userCap.subs.length > 1;

    return html\`
      <div class="cap-card \${active ? 'active' : 'inactive'}">
        <div
          class="cap-card__clickable"
          tabindex="0" role="button"
          @click=\${() => this._onCapCardClick(userCap)}
          @keydown=\${(e: KeyboardEvent) => { if (e.key === "Enter") this._onCapCardClick(userCap); }}
        >
          <div class="cap-card__head">
            <div class="cap-card__icon">\${userCap.icon}</div>
            <div class="cap-card__name">\${userCap.name}</div>
            <div class="cap-card__dot \${active ? 'on' : 'off'}"></div>
          </div>
          \${hasMultiSubs
            ? this._renderMultiSubStatus(userCap)
            : this._renderSingleSubStatus(userCap)}
          <div class="cap-card__action">\${active ? '切换模型 ›' : '选择模型 ›'}</div>
        </div>
      </div>
    \`;
  }

  /** 单能力卡片的状态渲染 */
  private _renderSingleSubStatus(userCap: UserCapDef) {
    const cap = this._resolveSubCap(userCap.subs[0]);
    if (cap?.status === "active" && cap.currentModel && cap.currentModel.providerId !== "local") {
      return html\`
        <div class="cap-card__model">\${cap.currentModel.modelName}</div>
        <div class="cap-card__provider">\${cap.currentModel.providerName}</div>
      \`;
    }
    return html\`<div class="cap-card__empty">未开通</div>\`;
  }

  /** 多能力卡片的子能力状态渲染 */
  private _renderMultiSubStatus(userCap: UserCapDef) {
    return html\`
      <div class="cap-card__subs">
        \${userCap.subs.map(sub => {
          if (sub.keys.includes("memoryExtraction")) {
            const ext = this._extractionStatus;
            const extActive = ext?.status === "active";
            const PROVIDER_NAMES: Record<string, string> = {
              "meituan-longcat": "美团", "ant-ling": "蚂蚁百灵",
              siliconflow: "硅基流动", modelscope: "魔搭",
              deepseek: "深度求索", moonshot: "月之暗面",
              "kimi-coding": "Kimi", "qwen-dashscope": "通义千问",
              glm: "智谱", zhipu: "智谱", doubao: "豆包",
              "tencent-hunyuan": "腾讯混元", openai: "OpenAI",
              groq: "Groq", together: "Together",
            };
            let modelLabel = "";
            if (extActive && ext) {
              const provLabel = PROVIDER_NAMES[ext.provider!] ?? ext.provider ?? "";
              const FREE_EXTRACTION_PROVIDERS = new Set([
                "meituan-longcat", "ant-ling", "siliconflow", "modelscope",
              ]);
              const isMainModel = ext.provider && !FREE_EXTRACTION_PROVIDERS.has(ext.provider);
              modelLabel = isMainModel
                ? \`\${ext.model}（跟随主模型）\`
                : \`\${ext.model}（\${provLabel}）\`;
            }
            return html\`
              <div class="cap-card__sub">
                <span class="cap-card__sub-dot \${extActive ? 'on' : 'off'}"></span>
                <span class="cap-card__sub-label">\${sub.label}</span>
                \${extActive
                  ? html\`<span class="cap-card__sub-model">\${modelLabel}</span>\`
                  : html\`<span class="cap-card__sub-model cap-card__sub-model--off">未配置</span>\`}
              </div>
            \`;
          }
          const cap = this._resolveSubCap(sub);
          const subActive = cap?.status === "active" && cap.currentModel && cap.currentModel.providerId !== "local";
          return html\`
            <div class="cap-card__sub">
              <span class="cap-card__sub-dot \${subActive ? 'on' : 'off'}"></span>
              <span class="cap-card__sub-label">\${sub.label}</span>
              \${subActive
                ? html\`<span class="cap-card__sub-model">\${cap!.currentModel!.modelName}</span>\`
                : html\`<span class="cap-card__sub-model cap-card__sub-model--off">未开通</span>\`}
            </div>
          \`;
        })}
      </div>
    \`;
  }

  /* ═══════ RECOMMENDED PROVIDERS (top 3 cards) ═══════ */
  private _renderRecommendedProviders() {
    const recIds = [QUICK_SETUP_PROVIDER, ...ESSENTIAL_PROVIDERS];
    const recProviders = recIds
      .map(id => this._s.providers.find(p => p.providerId === id))
      .filter((p): p is ProviderInfo => !!p)
      .slice(0, 3);

    if (recProviders.length === 0) return nothing;

    return html\`
      <div class="rec-grid">
        \${recProviders.map(p => {
          const isFree = p.tagline?.includes("免费");
          return html\`
            <div class="rec-card" @click=\${() => this._onProviderClick(p)}>
              <div class="rec-card__head">
                <span class="rec-card__icon">\${p.icon}</span>
                <span class="rec-card__name">\${p.name}</span>
              </div>
              \${p.tagline ? html\`<div class="rec-card__desc">\${renderTagline(p.tagline)}</div>\` : nothing}
              <div class="rec-card__caps">
                \${p.capabilities.map(c => html\`<span class="cap-tag">\${CAPABILITY_NAME_MAP[c] ?? c}</span>\`)}
              </div>
              <div class="rec-card__footer">
                <span class="rec-card__price \${isFree ? 'rec-card__price--free' : 'rec-card__price--paid'}">
                  \${isFree ? '免费' : ''}
                </span>
                \${p.configured
                  ? html\`<span class="rec-card__btn rec-card__btn--configured">已配置</span>\`
                  : html\`<button class="rec-card__btn" @click=\${(e: Event) => { e.stopPropagation(); this._onProviderClick(p); }}>开通</button>\`}
              </div>
            </div>
          \`;
        })}
      </div>
    \`;
  }

  /* ═══════ CONFIGURED PROVIDERS (large cards) ═══════ */
  private _renderConfiguredProviders() {
    const configured = this._getConfiguredSorted();
    if (configured.length === 0) return nothing;

    return html\`
      <div class="cfg-list">
        \${configured.map(p => {
          const health = this._s.providerHealthMap[p.providerId];
          const healthStatus = health?.status ?? "normal";
          return html\`
            <div class="cfg-card">
              <div class="cfg-card__head">
                <div class="cfg-card__icon">\${p.icon}</div>
                <div class="cfg-card__info">
                  <div class="cfg-card__name">\${p.name}</div>
                  \${p.tagline ? html\`<div class="cfg-card__tagline">\${renderTagline(p.tagline)}</div>\` : nothing}
                </div>
                <div class="health-badge" style="color:\${getHealthStatusColor(healthStatus)}; border-color: \${getHealthStatusColor(healthStatus)}30; background: \${getHealthStatusColor(healthStatus)}10">
                  <span class="health-badge__dot" style="background:\${getHealthStatusColor(healthStatus)}"></span>
                  \${getHealthStatusText(healthStatus)}
                </div>
              </div>
              <div class="cfg-card__caps">
                \${p.capabilities.map(c => html\`<span class="cap-tag">\${CAPABILITY_NAME_MAP[c] ?? c}</span>\`)}
              </div>
              <div class="cfg-card__actions">
                <button class="cfg-card__btn" @click=\${(e: Event) => { e.stopPropagation(); this._openSortPopover(e); }}>排序</button>
                <button class="cfg-card__btn" @click=\${(e: Event) => { e.stopPropagation(); this._openProviderModels(p); }}>查看模型</button>
                <button class="cfg-card__btn cfg-card__btn--primary" @click=\${(e: Event) => { e.stopPropagation(); this._onManageProvider(p); }}>管理</button>
              </div>
            </div>
          \`;
        })}
      </div>
    \`;
  }

  /** 打开排序浮动框 */
  private _openSortPopover(e: Event) {
    const btn = e.target as HTMLElement;
    this._sortAnchorRect = btn.getBoundingClientRect();
    this._prioritySortOrder = this._getConfiguredSorted().map(p => p.providerId);
    this._prioritySortOpen = true;
  }

  /** 打开某个 provider 的首个能力的模型选择器 */
  private async _openProviderModels(p: ProviderInfo) {
    // 找到该 provider 支持的第一个能力
    const cap = p.capabilities
      .map(c => this._s.capabilities.find(cap => cap.capability === c))
      .find(c => c);
    if (cap) {
      this._modelSelectorSearch = "";
      this._modelSelectorProviderFilter = p.providerId;
      this._modelSelectorContextFilter = null;
      this._modelSelectorStrengthFilter = null;
      this._modelSelectorActiveSubIndex = 0;
      this._modelSelectorUserCap = null;
      this._msProviderDropdownOpen = false;
      this._msUnconfiguredExpanded = false;
      const h = this._host();
      await openModelSelector(h, cap);
      this._sync(h);
    }
  }

  /* ═══════ UNCONFIGURED PROVIDERS (3-col grid) ═══════ */
  private _renderUnconfiguredProviders() {
    const unconfigured = this._s.providers.filter(p => !p.configured);
    if (unconfigured.length === 0) return nothing;

    return html\`
      <div class="add-section">
        <div class="uncfg-grid">
          \${unconfigured.map(p => html\`
            <div class="uncfg-card" @click=\${() => this._onProviderClick(p)}>
              <div class="uncfg-card__head">
                <span class="uncfg-card__icon">\${p.icon}</span>
                <span class="uncfg-card__name">\${p.name}</span>
              </div>
              <div class="uncfg-card__caps">
                \${p.capabilities.map(c => html\`<span class="cap-tag">\${CAPABILITY_NAME_MAP[c] ?? c}</span>\`)}
              </div>
              \${p.tagline ? html\`<div class="uncfg-card__tagline">\${renderTagline(p.tagline)}</div>\` : nothing}
              <button class="uncfg-card__btn" @click=\${(e: Event) => { e.stopPropagation(); this._onProviderClick(p); }}>配置</button>
            </div>
          \`)}
        </div>
      </div>
    \`;
  }

  /* ═══════ PRIORITY SORT POPOVER ═══════ */
  private _renderPrioritySortPopover() {
    const providers = this._prioritySortOrder
      .map(id => this._s.providers.find(p => p.providerId === id))
      .filter((p): p is ProviderInfo => !!p);

    const anchorRect = this._sortAnchorRect;
    const top = anchorRect ? anchorRect.bottom + 8 : 200;
    const left = anchorRect ? Math.min(anchorRect.left, window.innerWidth - 320) : 200;

    return html\`
      <div class="sort-popover-backdrop" @click=\${() => { this._prioritySortOpen = false; }}></div>
      <div class="sort-popover" style="top:\${top}px;left:\${left}px">
        <div class="sort-popover__header">
          <span class="sort-popover__title">服务商优先级排序</span>
          <button class="sort-popover__close" @click=\${() => { this._prioritySortOpen = false; }}>&times;</button>
        </div>
        <div class="sort-popover__body">
          \${providers.map((p, idx) => html\`
            <div class="sort-popover__item \${this._dragOverIndex === idx ? 'drag-over' : ''}"
              data-idx="\${idx}"
              @pointerdown=\${(e: PointerEvent) => this._onSortPointerDown(e, idx)}
            >
              <span class="sort-popover__handle">⠿</span>
              <span class="sort-popover__rank">\${idx + 1}</span>
              <span class="sort-popover__name">\${p.name}</span>
              <div class="sort-popover__arrows">
                <button class="sort-popover__arrow" ?disabled=\${idx === 0} @click=\${(e: Event) => { e.stopPropagation(); this._moveSortItem(idx, -1); }}>▲</button>
                <button class="sort-popover__arrow" ?disabled=\${idx === providers.length - 1} @click=\${(e: Event) => { e.stopPropagation(); this._moveSortItem(idx, 1); }}>▼</button>
              </div>
            </div>
          \`)}
        </div>
        <div class="sort-popover__footer">
          <button class="sort-popover__cancel" @click=\${() => { this._prioritySortOpen = false; }}>取消</button>
          <button class="sort-popover__save" @click=\${() => this._saveSortOrder()}>保存</button>
        </div>
      </div>
    \`;
  }

  /** 排序浮动框内拖拽 */
  private _onSortPointerDown(e: PointerEvent, index: number) {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("button")) return;

    const startY = e.clientY;
    let dragging = false;

    const onMove = (ev: PointerEvent) => {
      if (!dragging && Math.abs(ev.clientY - startY) < 5) return;
      dragging = true;

      // 命中检测
      const body = this.renderRoot?.querySelector('.sort-popover__body');
      if (!body) return;
      const items = Array.from(body.querySelectorAll<HTMLElement>('.sort-popover__item'));
      for (let i = 0; i < items.length; i++) {
        const r = items[i].getBoundingClientRect();
        if (ev.clientY >= r.top && ev.clientY <= r.bottom) {
          if (this._dragOverIndex !== i) this._dragOverIndex = i;
          break;
        }
      }
    };

    const onUp = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      if (!dragging) return;

      const toIdx = this._dragOverIndex;
      this._dragOverIndex = null;
      if (toIdx !== null && toIdx !== index) {
        const newOrder = [...this._prioritySortOrder];
        const [moved] = newOrder.splice(index, 1);
        newOrder.splice(toIdx, 0, moved);
        this._prioritySortOrder = newOrder;
      }
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }

  /** ↑↓ 按钮移动排序项 */
  private _moveSortItem(idx: number, direction: number) {
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= this._prioritySortOrder.length) return;
    const newOrder = [...this._prioritySortOrder];
    [newOrder[idx], newOrder[newIdx]] = [newOrder[newIdx], newOrder[idx]];
    this._prioritySortOrder = newOrder;
  }

  /** 保存排序 */
  private async _saveSortOrder() {
    const h = this._host();
    await saveProviderPriority(h, this._prioritySortOrder);
    this._sync(h);
    this._prioritySortOpen = false;
  }

`;

// Splice
const result = [...lines.slice(0, startIdx), ...newRender.split("\n"), ...lines.slice(endIdx)];

fs.writeFileSync(path, result.join("\n"), "utf8");
console.log("Done. Old:", lines.length, "lines, New:", result.length, "lines");
