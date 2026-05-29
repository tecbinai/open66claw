# 模型设置页面完整梳理文档

> 用于 UI 改版参考。梳理现有 model-config 页面的所有功能区块、控制器逻辑、Gateway 接口、子组件和事件系统。
> 生成日期：2026-03-09

---

## 一、页面整体结构（HTML 布局）

```
<model-config-view>                        — LitElement Web Component
│
├── 【Loading / Error 状态】
│   ├── loading-state                      — "加载中…" 骨架
│   └── error-state                        — Gateway 未连接 / 加载失败
│
└── .mc-scroll                             — 主滚动容器
    │
    ├── 【Toast 通知区】
    │   ├── error-toast                    — 操作错误提示（红色）
    │   └── info-toast                     — 模型切换成功提示（蓝色，3s 自动消失）
    │
    ├── 【① 新手引导横幅】onboarding
    │   ├── 第 1 步: 配置聊天能力        — 推荐 Kimi Code（免费/无实名/即刻可用）
    │   └── 第 2 步: 解锁 AI 记忆（必需） — 硅基流动/美团 LongCat/蚂蚁百灵（全部免费）
    │
    ├── 【② 6 张能力卡】cap-grid (3×2 网格)
    │   ├── 💬 聊天（text）               — 单能力卡片
    │   ├── 🎨 图片（vision + imageGen）  — 多子能力卡片（看图 / 画图）
    │   ├── 📹 视频（video + videoGen）   — 多子能力卡片（视频理解 / 视频生成）
    │   ├── 🎙️ 语音（audio + tts）       — 多子能力卡片（语音识别 / 语音合成）
    │   ├── 💻 编程（code）               — 单能力卡片
    │   └── 🧠 记忆（embedding + memoryExtraction） — 多子能力卡片（向量嵌入 / 记忆提取）
    │       每张卡片包含：
    │       ├── cap-card__head             — 图标 + 名称 + 状态圆点（绿色/灰色）
    │       ├── 单能力: 模型名 + 服务商 + 能力等级警告
    │       │   或 多能力: 子能力行列表（每行: 圆点 + 标签 + 模型名）
    │       ├── cap-card__action           — "切换模型 ›" / "查看模型 ›" / "收起 ‹"
    │       └── qs-panel（展开时）          — 内联快速切换面板
    │           ├── qs-scroll              — 可滚动模型列表（max-height: 280px）
    │           │   └── qs-item × N        — 模型条目（名称 + 服务商 + 强/中/弱徽章 + ✓/spinner）
    │           ├── "查看全部模型 ›"         — 打开完整模型选择器弹窗
    │           └── "添加更多服务商 ↓"       — 滚动到底部添加区
    │
    ├── <hr> 分割线
    │
    ├── 【③ 已配置的服务商】prov-section
    │   ├── section-label                  — "已配置的服务商（拖拽调整优先级）"
    │   └── prov-list                      — Provider 行列表
    │       └── prov-row.configured × N    — 可拖拽排序行
    │           ├── drag-handle ⠿          — 拖拽手柄
    │           ├── prov-row__rank          — 优先级编号（1, 2, 3…）
    │           ├── prov-row__icon          — 服务商图标
    │           ├── prov-row__info          — 名称 + tagline（免费额度高亮红色）
    │           ├── health-badge            — 健康状态徽章（正常/余额异常/Key无效/限流/降级/宕机）
    │           ├── prov-row__caps          — 能力标签组（聊天/编程/看图…）
    │           └── [管理] 按钮             — 打开 Provider 管理弹窗
    │
    ├── 【④ 必需服务商提示横幅】sf-banner × N
    │   └── 每个未配置的必需 Provider 独立一行
    │       ├── 图标 + 标题 + 描述         — "请配置硅基流动（必需）"
    │       └── [立即配置] 按钮
    │
    └── 【⑤ 添加更多服务商】add-section
        └── 按分组折叠显示
            ├── 🔥 代码助手 (Coding Plan)  — 默认展开，4 个 Provider
            ├── ⭐ 国内主流推荐             — 默认展开，5 个 Provider
            ├── 🇨🇳 更多国内服务           — 默认折叠，5 个 Provider
            ├── 🌐 国际服务                — 默认折叠，5 个 Provider
            └── 🔧 本地模型 & 自定义        — 默认折叠，3 个 Provider
                每个 prov-row:
                ├── 图标 + 名称 + tagline
                ├── 能力标签组
                └── [配置] 按钮

【弹窗层】
├── 模型选择器弹窗 (ms-modal)              — 条件渲染: modelSelectorOpen
├── Provider 配置向导弹窗 (modal)           — 条件渲染: providerConfigOpen
└── Provider 管理弹窗 (modal)               — 条件渲染: providerManageOpen
```

---

## 二、功能区块清单

### 2.1 能力卡片区

| 功能           | 说明                                                         | 涉及方法                       |
| -------------- | ------------------------------------------------------------ | ------------------------------ |
| 6 大能力分组   | 聊天/图片/视频/语音/编程/记忆，3×2 网格布局                  | `_renderCapabilities()`        |
| 单能力卡片     | 显示当前模型名+服务商+能力等级警告                           | `_renderSingleSubStatus()`     |
| 多子能力卡片   | 子能力行列表，每行独立显示状态                               | `_renderMultiSubStatus()`      |
| 能力等级警告   | weak→红色"模型能力较弱"；moderate→黄色"复杂任务可能力不从心" | `_renderSingleSubStatus()`     |
| 内联快速切换   | 点击卡片展开模型列表，直接切换                               | `_renderQuickSwitch()`         |
| 记忆提取信息   | 虚拟子能力，显示提取 LLM 优先级链                            | `_renderMultiSubQuickSwitch()` |
| 向量库绑定警告 | 已绑定时显示维度+向量数，提醒切换需重建                      | `_renderMultiSubQuickSwitch()` |
| Pro 回退通知   | bge-m3 连续失败时显示自动切换为收费版提示                    | `_renderMultiSubQuickSwitch()` |

### 2.2 Provider 管理区

| 功能           | 说明                                                | 涉及方法                         |
| -------------- | --------------------------------------------------- | -------------------------------- |
| 已配置列表     | 按优先级排序显示已配置的 Provider                   | `_renderMyProviders()`           |
| 拖拽排序       | Pointer Events 实现，拖拽调整 Provider 优先级       | `_onPointerDragStart/Move/End()` |
| 健康状态       | 6 种状态徽章：正常/余额异常/Key 无效/限流/降级/宕机 | `getHealthStatusText/Color()`    |
| 分组折叠       | 未配置 Provider 按 5 个分组显示，可展开/折叠        | `_renderGroupedProviders()`      |
| 必需服务商提示 | 硅基流动/美团/蚂蚁 未配置时显示醒目 Banner          | `_renderEssentialBanner()`       |
| 新手引导       | 全空时显示两步引导：配置聊天 → 解锁记忆             | `_renderOnboarding()`            |

### 2.3 模型选择器弹窗

| 功能            | 说明                                      | 涉及方法                       |
| --------------- | ----------------------------------------- | ------------------------------ |
| 当前模型 Banner | 显示当前模型+服务商+手动锁定/自动分配状态 | `_renderModelSelector()`       |
| 多子能力 Tab    | 图片/视频/语音等多子能力卡片的 Tab 切换   | `_onModelSelectorTabSwitch()`  |
| 搜索过滤        | 模型名/服务商名模糊搜索                   | `_modelSelectorSearch`         |
| 服务商筛选      | 下拉选择按服务商过滤                      | `_modelSelectorProviderFilter` |
| 上下文窗口筛选  | >=32K / >=128K / >=256K 快速筛选          | `_modelSelectorContextFilter`  |
| 能力等级筛选    | 强/中/弱 三档筛选                         | `_modelSelectorStrengthFilter` |
| 未配置区域      | 可折叠，按服务商分组，提供"添加配置"入口  | `_msUnconfiguredExpanded`      |
| 模型切换        | 点击模型→发起 switchModel RPC→成功后刷新  | `_onModelSelect()`             |

### 2.4 Provider 配置向导弹窗

| 功能         | 说明                                                 | 涉及方法/步骤                                     |
| ------------ | ---------------------------------------------------- | ------------------------------------------------- |
| 步骤指示器   | 4 步进度条（guide → apikey → detecting → result）    | `_renderProviderConfig()`                         |
| 引导步骤     | 能力标签+获取 Key 步骤+外链                          | `_renderGuideStep()`                              |
| API Key 输入 | Key 输入框 + Base URL（可选）+ 自定义模型名（可选）  | `_renderApiKeyStep()`                             |
| 火山引擎特殊 | LLM / Voice 双 Tab，Voice 需要 App ID + Access Token | `_renderVolcLlmForm()` / `_renderVolcVoiceForm()` |
| TTS 偏好设置 | 音色选择/语速/情感/音调 四项配置                     | `_renderVolcTtsConfig()`                          |
| 自动检测     | 提交 Key → 后端并发探测模型 → 实时进度反馈           | `detectAndConfigureProvider()`                    |
| 检测进度     | 3 阶段动画：验证中 → 扫描模型 → 保存配置             | `_renderDetectingStep()`                          |
| 取消检测     | AbortController 中止+超时自动中止                    | `cancelDetection()`                               |
| 配置完成     | 显示自动启用的能力列表                               | `_renderResultStep()`                             |

### 2.5 Provider 管理弹窗

| 功能          | 说明                            | 涉及方法                   |
| ------------- | ------------------------------- | -------------------------- |
| 查看配置      | 显示脱敏 API Key + Base URL     | `_renderManageModal()`     |
| 手动添加模型  | 输入模型 ID 手动添加到 Provider | `_onAddModel()`            |
| 测试连接      | 发起连接测试，显示成功/失败     | `testProviderConnection()` |
| 删除 Provider | 二次确认后删除配置              | `deleteProviderConfig()`   |

---

## 三、控制器层（数据 + 逻辑）

### 3.1 主要状态属性（ModelConfigState）

```typescript
// === 数据加载 ===
modelConfigLoading: boolean;           // 加载中
modelConfigError: string | null;       // 错误信息

// === 能力列表 ===
capabilities: Capability[];            // 后端返回的能力卡片列表（10 个）

// === 模型选择器 ===
modelSelectorOpen: boolean;            // 弹窗开关
modelSelectorCapability: Capability | null;  // 当前选择的能力
modelSelectorModels: ModelInfo[];      // 可用模型列表
modelSelectorLoading: boolean;         // 加载模型中
modelSelectorSwitching: boolean;       // 切换模型中

// === Provider 配置向导 ===
providerConfigOpen: boolean;           // 弹窗开关
providerConfigProvider: ProviderInfo | null;  // 当前配置的 Provider
providerConfigApiKey: string;          // 用户输入的 API Key
providerConfigBaseUrl: string;         // Base URL（自定义端点用）
providerConfigCustomModel: string;     // 自定义模型名
providerConfigStep: ProviderConfigStep;     // guide | apikey | detecting | result
providerConfigAutoEnabled: Record<string, string> | null; // 检测后自动启用的能力
providerConfigTesting: boolean;        // 连接测试中
providerConfigTestResult: { success: boolean; message: string } | null;

// === 检测进度 ===
providerConfigDetecting: boolean;      // 检测进行中
providerConfigDetectPhase: DetectPhase; // validating | scanning | saving | done
providerConfigDetectElapsed: number;   // 已耗时（秒）
providerConfigDetectTotal: number;     // 模型总数
providerConfigDetectCompleted: number; // 已完成数
providerConfigDetectModels: DetectModelEntry[]; // 逐模型结果列表
providerConfigDetectAbort: AbortController | null; // 取消句柄
_detectElapsedTimer: ReturnType<typeof setInterval> | null; // 计时器
_detectTimeoutTimer: ReturnType<typeof setTimeout> | null;  // 超时器

// === 火山引擎语音专属 ===
providerConfigVolcAppId: string;       // 语音 App ID
providerConfigVolcAccessToken: string; // 语音 Access Token
providerConfigVolcTab: "llm" | "voice"; // 当前 Tab
providerConfigVolcSaving: boolean;     // 语音凭证保存中
providerConfigVolcCredsStatus: { configured: boolean; maskedAppId?: string; maskedToken?: string } | null;
providerConfigVolcTtsVoice: string;    // TTS 音色（默认 "BV405_streaming"）
providerConfigVolcTtsSpeed: number;    // TTS 语速（默认 2.0）
providerConfigVolcTtsEmotion: string;  // TTS 情感（默认 "happy"）
providerConfigVolcTtsPitch: number;    // TTS 音调（默认 1.0）
providerConfigVolcTtsPrefsLoaded: boolean;

// === Provider 列表 ===
providers: ProviderInfo[];             // 全部 Provider 列表
providerGroups: ProviderGroupInfo[];   // 分组元数据

// === Provider 管理弹窗 ===
providerManageOpen: boolean;           // 弹窗开关
providerManageTarget: ProviderInfo | null; // 管理目标
providerManageApiKey: string;          // 脱敏 Key
providerManageDeleting: boolean;       // 删除进行中
providerManageError: string | null;    // 操作错误

// === 健康状态 ===
providerHealthMap: Record<string, ProviderHealthInfo>; // Provider → 健康信息
providerHealthLoading: boolean;

// === 优先级排序 ===
providerPriority: string[];            // Provider ID 优先级列表
providerPrioritySaving: boolean;       // 保存中

// === 测试连接 ===
providerTestingId: string | null;      // 正在测试的 Provider ID
providerTestResult: { providerId: string; success: boolean; status: string; message: string } | null;
```

### 3.2 View 层额外状态（@state）

```typescript
// === 快速切换面板 ===
_quickSwitchCap: string | null;        // 当前展开的能力卡 ID
_quickSwitchModels: ModelInfo[];       // 单能力模型列表
_quickSwitchSubModels: Map<string, { cap: Capability | undefined; models: ModelInfo[] }>; // 多子能力
_quickSwitchLoading: boolean;
_quickSwitchError: string | null;

// === 向量库/记忆 ===
_embeddingBinding: { bound: boolean; vecModel: string | null; vecDims: number | null; vecCount: number; fallenBackToPro?: boolean } | null;
_extractionStatus: { provider: string | null; model: string | null; status: "active" | "inactive" } | null;

// === 手动添加模型 ===
_addModelId: string;
_addModelLoading: boolean;
_addModelMsg: { type: "ok" | "warn" | "err"; text: string } | null;

// === 切换提示 ===
_switchToast: { model: string; provider: string } | null;
_switchToastTimer: ReturnType<typeof setTimeout> | null;

// === 模型选择器筛选 ===
_modelSelectorSearch: string;
_modelSelectorProviderFilter: string | null;
_modelSelectorContextFilter: number | null;
_modelSelectorStrengthFilter: string | null;
_modelSelectorActiveSubIndex: number;
_modelSelectorUserCap: UserCapDef | null;
_msProviderDropdownOpen: boolean;
_msUnconfiguredExpanded: boolean;

// === 拖拽排序 ===
_dragFromIndex: number | null;
_dragOverIndex: number | null;
_dragClone: HTMLElement | null;
_dragOffsetY: number;
_dragRows: HTMLElement[];
```

### 3.3 核心方法

| 方法                           | 文件                        | 功能                                                       |
| ------------------------------ | --------------------------- | ---------------------------------------------------------- |
| `loadCapabilities()`           | controllers/model-config.ts | 调用 capability_matrix.summary → 更新能力卡片              |
| `loadProviders()`              | controllers/model-config.ts | 调用 capability_matrix.providers.list → 更新 Provider 列表 |
| `loadProviderGroups()`         | controllers/model-config.ts | 调用 capability_matrix.providerGroups → 更新分组           |
| `loadProviderHealth()`         | controllers/model-config.ts | 调用 capability_matrix.health → 更新健康状态               |
| `loadProviderPriority()`       | controllers/model-config.ts | 调用 capability_matrix.priority.get → 更新优先级           |
| `openModelSelector()`          | controllers/model-config.ts | 打开模型选择器 + 加载模型列表（含 stale 防护）             |
| `closeModelSelector()`         | controllers/model-config.ts | 关闭模型选择器 + 清空状态                                  |
| `openProviderConfig()`         | controllers/model-config.ts | 打开 Provider 配置向导（重置所有字段）                     |
| `closeProviderConfig()`        | controllers/model-config.ts | 关闭配置向导 + 清空状态                                    |
| `detectAndConfigureProvider()` | controllers/model-config.ts | 提交 Key → 后端检测 → 进度事件 → 自动绑定                  |
| `handleDetectProgressEvent()`  | controllers/model-config.ts | 处理检测进度 broadcast 事件                                |
| `handleDetectCompleteEvent()`  | controllers/model-config.ts | 处理检测完成 broadcast 事件                                |
| `cancelDetection()`            | controllers/model-config.ts | AbortController 中止检测                                   |
| `openProviderManage()`         | controllers/model-config.ts | 打开管理弹窗 + 加载脱敏配置                                |
| `deleteProviderConfig()`       | controllers/model-config.ts | 删除 Provider 配置                                         |
| `testProviderConnection()`     | controllers/model-config.ts | 发起连接测试                                               |
| `saveProviderPriority()`       | controllers/model-config.ts | 保存优先级排序                                             |
| `reorderProviders()`           | controllers/model-config.ts | 拖拽后重新排序                                             |
| `toggleProviderGroup()`        | controllers/model-config.ts | 展开/折叠 Provider 分组                                    |
| `navigateToProviderConfig()`   | controllers/model-config.ts | 从模型选择器跳转到 Provider 配置                           |

### 3.4 View 层关键方法

| 方法                             | 功能                                            |
| -------------------------------- | ----------------------------------------------- |
| `_loadData()`                    | 并发加载 5 项数据 → 异步加载本地引擎 + 提取状态 |
| `_onCapCardClick()`              | 能力卡点击 → 切换快速切换面板（加载模型列表）   |
| `_onQuickSwitch()`               | 快速切换面板中选择模型 → 调用 switchModel RPC   |
| `_onQuickSwitchSub()`            | 多子能力快速切换                                |
| `_openFullModelSelector()`       | 从快速切换跳转到完整模型选择器弹窗              |
| `_onModelSelect()`               | 模型选择器中选择模型 → switchModel + 刷新       |
| `_doSwitchModel()`               | 执行模型切换 RPC（共享逻辑）                    |
| `_onProviderClick()`             | 点击未配置 Provider → 打开配置向导              |
| `_onManageProvider()`            | 点击已配置 Provider → 打开管理弹窗              |
| `_onQuickSetup()`                | 新手引导/必需 Banner 一键配置 → 打开配置向导    |
| `_onConfigNextStep()`            | 配置向导下一步                                  |
| `_onConfigPrevStep()`            | 配置向导上一步                                  |
| `_onDetectSubmit()`              | 提交 Key 开始检测                               |
| `_onPointerDragStart/Move/End()` | Pointer Events 拖拽排序实现                     |
| `_onAddModel()`                  | Provider 管理弹窗中手动添加模型                 |
| `_loadEmbeddingBinding()`        | 加载向量库绑定状态                              |
| `_loadExtractionStatus()`        | 加载记忆提取 LLM 状态                           |
| `_loadVolcCredsStatus()`         | 加载火山引擎语音凭证状态                        |

---

## 四、Gateway 接口清单

### 4.1 RPC 方法（request/response）

| 方法                                        | 参数                                  | 返回值                                           | 用途                                                   |
| ------------------------------------------- | ------------------------------------- | ------------------------------------------------ | ------------------------------------------------------ |
| `capability_matrix.summary`                 | `{}`                                  | `{ capabilities: CapMatrixEntry[] }`             | 获取 10 个能力卡片状态+当前绑定模型                    |
| `capability_matrix.providers.list`          | `{}`                                  | `{ providers: ProviderInfo[] }`                  | 获取 22 个 Provider 列表（含 configured/activeModels） |
| `capability_matrix.providerGroups`          | `{}`                                  | `{ groups: ProviderGroupMeta[] }`                | 获取 5 个分组元数据                                    |
| `capability_matrix.models`                  | `{ providerId: string }`              | `{ models: ModelInfo[] }`                        | 获取某 Provider 的已配置模型列表                       |
| `capability_matrix.switchModel`             | `{ capability, providerId, modelId }` | `{ success: true }`                              | 切换能力绑定的模型                                     |
| `capability_matrix.provider.detect`         | `{ providerId, apiKey, baseUrl? }`    | `{ success, autoEnabled?, error? }`              | 自动检测+配置 Provider                                 |
| `capability_matrix.provider.getConfig`      | `{ providerId }`                      | `{ configured, maskedApiKey, baseUrl, models }`  | 获取 Provider 脱敏配置                                 |
| `capability_matrix.provider.delete`         | `{ providerId }`                      | `{ ok: true }`                                   | 删除 Provider 配置                                     |
| `capability_matrix.provider.testConnection` | `{ providerId, apiKey?, baseUrl? }`   | `{ ok, error? }`                                 | 测试 Provider 连接                                     |
| `capability_matrix.provider.addModel`       | `{ providerId, modelId, modelName? }` | `{ ok: true }`                                   | 手动添加模型                                           |
| `capability_matrix.health`                  | `{}`                                  | `{ health: Record<string, ProviderHealthInfo> }` | 获取 Provider 健康状态                                 |
| `capability_matrix.priority.get`            | `{}`                                  | `{ priority: string[] }`                         | 获取 Provider 优先级列表                               |
| `capability_matrix.priority.save`           | `{ priority: string[] }`              | `{ ok: true }`                                   | 保存 Provider 优先级                                   |
| `capability_matrix.extractionStatus`        | `{}`                                  | `{ status }`                                     | 获取记忆提取 LLM 状态                                  |
| `capability_matrix.embeddingBinding`        | `{}`                                  | `{ binding }`                                    | 获取向量库 embedding 绑定信息                          |

### 4.2 WebSocket 事件（broadcast，检测进度推送）

| 事件源                             | 触发点            | payload 结构                                          | 处理逻辑               |
| ---------------------------------- | ----------------- | ----------------------------------------------------- | ---------------------- |
| `openclawcn:detect-progress`       | Provider 检测中   | `{ providerId, modelId, modelName, status, message }` | 更新 detectModels 列表 |
| `openclawcn:detect-complete`       | Provider 检测完成 | `{ providerId, success, models[], autoEnabled }`      | 更新 step → result     |
| `openclawcn:local-engine-progress` | 本地模型安装进度  | `{ modelId, percent, speed, eta }`                    | 更新安装进度           |
| `openclawcn:voice-setup`           | 聊天页话筒按钮    | 无                                                    | 打开豆包语音配置 Tab   |
| `openclawcn:model-switched`        | 模型切换完成      | `{ capability, providerId, modelId }`                 | 通知其他页面刷新       |

---

## 五、后端 Handler 架构

### 5.1 文件清单

| 文件                                                     | 角色                           | 行数 |
| -------------------------------------------------------- | ------------------------------ | ---- |
| `extensions/cn-adapter/gateway/ui-bridge.ts`             | Gateway 方法注册（桥接层）     | ~300 |
| `extensions/cn-adapter/gateway/provider-registry.ts`     | Provider 元数据 + 能力卡片定义 | ~400 |
| `extensions/cn-adapter/gateway/provider-config-store.ts` | 配置读写（双文件策略）         | ~250 |
| `extensions/cn-adapter/gateway/probe-model.ts`           | API Key 验证 + 模型探测        | ~300 |

### 5.2 数据存储（双文件策略）

| 文件                          | 内容                                                                                      | 所有权                    |
| ----------------------------- | ----------------------------------------------------------------------------------------- | ------------------------- |
| `~/.openclaw/openclaw.json`   | `models.providers.{id}` (apiKey/baseUrl/models) + `agents.defaults.model`                 | 上游共用，schema 严格校验 |
| `~/.openclaw/cn-adapter.json` | `cnModelCapability.capabilities.{key}` (providerId/modelId/auto) + `cnProviderPriority[]` | cn-adapter 独立文件       |

### 5.3 Provider 注册表（22 个 Provider，5 个分组）

| 分组 ID          | 名称                   | 默认展开 | Provider 数                                                               |
| ---------------- | ---------------------- | -------- | ------------------------------------------------------------------------- |
| `cn-codeplan`    | 代码助手 (Coding Plan) | ✅       | 4: kimi-coding, aliyun-codeplan, glm-codeplan, minimax-codeplan           |
| `cn-recommended` | 国内主流推荐           | ✅       | 5: aliyun-bailian, volcengine-ark, siliconflow, ant-ling, meituan-longcat |
| `cn-more`        | 更多国内服务           | ❌       | 5: deepseek, glm, moonshot, minimax, tencent-hunyuan                      |
| `international`  | 国际服务               | ❌       | 5: openai, anthropic, google, nvidia, openrouter                          |
| `local-custom`   | 本地模型 & 自定义      | ❌       | 3: ollama, openai-compatible, anthropic-compatible                        |

### 5.4 能力卡片定义（10 个能力）

| Key         | 名称     | 说明                                   |
| ----------- | -------- | -------------------------------------- |
| `text`      | 聊天对话 | 核心能力，同步到 agents.defaults.model |
| `code`      | 代码生成 | 编程专用                               |
| `vision`    | 图片理解 | 看图（v2 key: image-understanding）    |
| `imageGen`  | 图片生成 | 画图（v2 key: image-generation）       |
| `video`     | 视频理解 | 视频分析                               |
| `videoGen`  | 视频生成 | 视频创作                               |
| `audio`     | 语音识别 | ASR                                    |
| `tts`       | 语音合成 | TTS                                    |
| `embedding` | 向量嵌入 | 记忆系统核心                           |
| `toolCall`  | 工具调用 | 函数调用                               |

### 5.5 模型探针策略

1. 用第一个测试模型发 `POST /chat/completions max_tokens=1` 快速验证 Key
2. 401/403 → Key 无效，快速失败
3. Key 有效 → 返回预定义模型列表（不逐个探测，节省时间）
4. 特殊 Provider 适配：
   - **Anthropic**: `/messages` + `x-api-key` header
   - **Google**: URL 参数 `?key=`
   - **Ollama**: 无需 Key，`GET /api/tags` 获取本地模型
   - **Kimi Code**: 自定义 User-Agent + Node.js http 模块

### 5.6 关键业务逻辑

**自动主模型设置**（saveProviderConfig）：

- 如果是第一个配置的 text provider 且 `agents.defaults.model` 没设置
- 自动设为主模型 `${providerId}/${textModel.id}`

**自动能力绑定**（capability_matrix.provider.detect）：

- 检测成功 → 遍历 Provider 的 capabilities
- 每个能力绑定到第一个检测成功的模型
- 同时写入 cn-adapter.json 的 cnModelCapability

**text 能力同步**（switchCapabilityModel）：

- 切换 text 能力时，额外同步到 `openclaw.json` 的 `agents.defaults.model`
- 保证上游 OpenClaw 也能读取到正确的主模型

---

## 六、事件系统

### 6.1 DOM 事件绑定

| 元素                 | 事件             | 处理逻辑                          |
| -------------------- | ---------------- | --------------------------------- |
| .cap-card            | @click           | 切换快速切换面板展开/折叠         |
| .cap-card            | @keydown(Enter)  | 同上（键盘可达）                  |
| .qs-item             | @click           | 快速切换模型                      |
| .qs-more             | @click           | 打开完整模型选择器 / 滚动到添加区 |
| .prov-row.configured | @pointerdown     | 开始拖拽排序                      |
| .prov-row [管理]     | @click           | 打开管理弹窗                      |
| .prov-row [配置]     | @click           | 打开配置向导                      |
| .prov-group-header   | @click           | 切换分组展开/折叠                 |
| .modal-overlay       | @click           | 关闭弹窗（检测中除外）            |
| .modal-overlay       | @keydown(Escape) | 关闭弹窗                          |
| .ms-search input     | @input           | 模型搜索                          |
| .ms-filter-chip      | @click           | 切换筛选条件                      |
| .ms-item             | @click           | 选择模型                          |
| API Key input        | @input           | 更新 providerConfigApiKey         |
| Base URL input       | @input           | 更新 providerConfigBaseUrl        |
| [开始检测] 按钮      | @click           | 提交检测                          |
| [取消] 按钮          | @click           | 取消检测/关闭弹窗                 |
| [删除] 按钮          | @click           | 删除 Provider                     |
| error-toast [×]      | @click           | 清除错误                          |
| info-toast [×]       | @click           | 清除切换提示                      |

### 6.2 全局自定义事件

| 事件名                             | 方向            | 用途           |
| ---------------------------------- | --------------- | -------------- |
| `openclawcn:detect-progress`       | Gateway → View  | 检测进度推送   |
| `openclawcn:detect-complete`       | Gateway → View  | 检测完成通知   |
| `openclawcn:local-engine-progress` | 本地引擎 → View | 安装进度       |
| `openclawcn:voice-setup`           | 聊天页 → View   | 跳转到语音配置 |
| `openclawcn:model-switched`        | View → 全局     | 模型切换通知   |

### 6.3 Lifecycle 回调

```typescript
connectedCallback() {
  // 注册 4 个全局事件监听
  globalThis.addEventListener("openclawcn:detect-progress", _boundDetectProgress);
  globalThis.addEventListener("openclawcn:detect-complete", _boundDetectComplete);
  globalThis.addEventListener("openclawcn:local-engine-progress", _boundLeProgress);
  globalThis.addEventListener("openclawcn:voice-setup", _boundVoiceSetup);
  // 有 client + connected → 加载数据
  if (this.client && this.connected) this._loadData();
}

disconnectedCallback() {
  // 移除所有全局事件监听
  globalThis.removeEventListener(...);
}

updated(changedProperties) {
  // client 或 connected 变化 → 重新加载数据
  if ((changedProperties.has("client") || changedProperties.has("connected")) && this.client && this.connected && !this._dataLoaded) {
    this._loadData();
  }
}
```

---

## 七、CSS 样式架构

模型设置页面使用 LitElement 的 `static styles = css\`...\`` 内联样式（Shadow DOM），不依赖外部 CSS 文件。

### 7.1 样式模块

```
ModelConfigView static styles
├── :host                         — 容器（flex column, 100% height, 暗色主题）
├── .mc-scroll                    — 主滚动容器（custom scrollbar 5px）
│
├── SECTION LABELS                — .section-label（11px, uppercase, muted）
├── SECTION DIVIDER               — .section-divider（1px border-top）
│
├── ONBOARDING BANNER             — .onboarding（渐变背景，fade-in 动画）
│   ├── .onboarding__title/desc
│   ├── .onboarding__step         — 引导步骤卡片
│   └── .onboarding__essential-list
│
├── ESSENTIAL PROVIDER BANNER     — .sf-banner（紫色渐变）
│
├── ERROR / INFO TOAST            — .error-toast / .info-toast
│
├── CAPABILITY CARDS              — .cap-grid（3 列响应式：900px→2 列，500px→1 列）
│   ├── .cap-card                 — 卡片（hover 上移 1px，active 绿色边框）
│   ├── .cap-card__head/icon/name/dot
│   ├── .cap-card__model/provider
│   ├── .cap-card__subs           — 子能力行
│   ├── .cap-card.expanded        — 展开态（蓝色边框+阴影）
│   └── card-in animation         — 6 张卡片依次入场（50ms 间隔）
│
├── QUICK SWITCH PANEL            — .qs-panel/.qs-scroll/.qs-item
│   ├── .qs-item:hover            — 高亮背景
│   ├── .qs-item.current          — 绿色背景 + ✓
│   ├── .qs-item.switching        — 半透明 + spinner
│   └── .qs-sub-group/.qs-sub-label — 多子能力分组
│
├── PROVIDER SECTIONS             — .prov-section/.prov-list/.prov-row
│   ├── .prov-row.configured      — 左绿色边框 + 可拖拽
│   ├── .prov-row__icon/info/caps
│   ├── .prov-row__btn--manage    — 管理按钮
│   └── .prov-row__btn--add       — 配置按钮
│
├── PROVIDER GROUPS               — .prov-group-header/.prov-group-arrow
│
├── MODAL (shared)                — .modal-overlay/.modal/.modal-header/.modal-body
│
├── MODEL SELECTOR MODAL          — .ms-modal/.ms-toolbar/.ms-search/.ms-filters
│   ├── .ms-current               — 当前模型 banner
│   ├── .ms-tabs                  — 多子能力 Tab
│   ├── .ms-filter-chip           — 筛选芯片
│   ├── .ms-dropdown              — 服务商下拉
│   ├── .ms-item                  — 模型条目（hover/current/switching）
│   └── .ms-unconfigured-section  — 未配置折叠区
│
├── PROVIDER CONFIG MODAL         — .step-indicator/.step-bar
│   ├── .guide-steps              — 引导步骤
│   ├── .form-group               — 表单项
│   ├── .detect-progress          — 检测进度
│   └── .volc-tabs/.volc-tab      — 火山引擎双 Tab
│
├── MANAGE MODAL                  — 表单+删除确认
│
├── BUTTONS (shared)              — .btn/.btn--primary/.btn--ghost/.btn--danger
│
├── BADGES                        — .badge--strong/.badge--moderate/.badge--weak
│
├── STRENGTH WARN                 — .strength-warn--weak/.strength-warn--moderate
│
├── DRAG & DROP                   — .drag-handle/.prov-row__rank/.drag-over
│
├── HEALTH BADGE                  — .health-badge/.health-badge__dot
│
└── ANIMATIONS
    ├── fade-in                   — opacity 0→1, translateY 6px→0
    ├── card-in                   — opacity 0→1, translateY 8px→0（6 段延迟）
    ├── spin                      — 360° 旋转（spinner 用）
    └── toast-slide-in            — translateY -10px→0
```

### 7.2 响应式断点

| 断点        | 行为        |
| ----------- | ----------- |
| `>900px`    | 能力卡 3 列 |
| `500-900px` | 能力卡 2 列 |
| `<500px`    | 能力卡 1 列 |

---

## 八、完整数据流

### 8.1 页面初始化流程

```
ModelConfigView.connectedCallback()
    ↓
注册 4 个全局事件监听
    ↓
client && connected → _loadData()
    ↓
Promise.all([
  loadCapabilities(h)          → capability_matrix.summary
  loadProviders(h)             → capability_matrix.providers.list
  loadProviderGroups(h)        → capability_matrix.providerGroups
  loadProviderHealth(h)        → capability_matrix.health
  loadProviderPriority(h)      → capability_matrix.priority.get
])
    ↓
_sync(h) → requestUpdate() → render()
    ↓
异步加载（非阻塞）:
├── _loadExtractionStatus()    → capability_matrix.extractionStatus
└── _loadEmbeddingBinding()    → capability_matrix.embeddingBinding
```

### 8.2 Provider 配置流程

```
用户点击 [配置] 按钮
    ↓
openProviderConfig(h, provider)
→ 打开弹窗，步骤 = guide（有引导则显示）/ apikey（无引导则直接输入）
    ↓
用户输入 API Key（+ 可选 Base URL / Custom Model）
    ↓
用户点击 [开始检测]
    ↓
detectAndConfigureProvider(h)
├─ 设置 step = "detecting"
├─ 发起 RPC: capability_matrix.provider.detect
│   ├─ 后端: testProviderConnection() 验证 Key
│   │   └─ 401/403 → 返回 { success: false, error: "Key 无效" }
│   ├─ 后端: 返回预定义模型列表
│   ├─ 后端: saveProviderConfig() → 写入 openclaw.json
│   ├─ 后端: 自动绑定能力 → 写入 cn-adapter.json
│   └─ 响应: { success: true, autoEnabled: { text: "modelId", ... } }
├─ 启动计时器（每秒更新 detectElapsed）
└─ 启动超时器（30s 超时）
    ↓
RPC 响应
├─ success → step = "result"，显示自动启用的能力
└─ fail → 显示错误信息，回退到 apikey 步骤
    ↓
用户关闭弹窗
→ closeProviderConfig() + 刷新 capabilities + providers
```

### 8.3 模型切换流程

```
用户在快速切换面板 / 模型选择器中点击模型
    ↓
_doSwitchModel(capability, modelInfo)
├─ _switchingModelId = modelInfo.modelId
├─ client.request("capability_matrix.switchModel", { capability, providerId, modelId })
│   └─ 后端: switchCapabilityModel()
│       ├─ 写入 cn-adapter.json 的 cnModelCapability
│       └─ 若 capability === "text" → 同步到 openclaw.json 的 agents.defaults.model
├─ 成功 → _switchToast = { model, provider }（3s 后自动消失）
├─ 刷新 capabilities（重新加载卡片状态）
├─ 发出 CustomEvent("openclawcn:model-switched")
└─ _switchingModelId = null
```

### 8.4 拖拽排序流程

```
pointerdown on .prov-row.configured
    ↓
_onPointerDragStart(event, index)
├─ 记录 _dragFromIndex, _dragOffsetY
├─ 创建 _dragClone（克隆元素，absolute 定位）
├─ 监听 pointermove / pointerup
└─ setPointerCapture(event.pointerId)
    ↓
pointermove
├─ 移动 _dragClone 跟随鼠标
├─ 计算 _dragOverIndex（最近的行索引）
└─ 更新视觉反馈（drag-over 样式）
    ↓
pointerup
├─ 移除 _dragClone
├─ 若 _dragFromIndex !== _dragOverIndex
│   └─ reorderProviders(fromIndex, toIndex)
│       ├─ 更新 providerPriority 数组
│       └─ saveProviderPriority() → capability_matrix.priority.save
└─ 清空拖拽状态
```

---

## 九、类型定义

### 9.1 核心类型

```typescript
// 能力卡片
interface Capability {
  capability: string; // 能力 key (text/code/vision/...)
  name: string; // 显示名
  description: string;
  icon: string;
  status: "active" | "unconfigured" | "missing";
  currentModel: {
    providerId: string;
    providerName: string;
    modelId: string;
    modelName: string;
    isFree: boolean;
    quality?: number; // 1-5
    maxContextTokens?: number;
    capabilities?: Record<string, number>;
    strengthTier?: string; // "strong" | "moderate" | "weak"
    auto?: boolean; // true=自动分配, false=手动锁定
  } | null;
  availableModels: number;
}

// 模型信息
interface ModelInfo {
  providerId: string;
  providerName: string;
  providerIcon: string;
  modelId: string;
  modelName: string;
  pricing: { type: "free" | "paid"; details?: string };
  configured: boolean;
  active: boolean;
  quality?: number;
  maxContextTokens?: number;
  capabilities?: Record<string, number>;
  strengthTier?: string;
}

// Provider 信息
interface ProviderInfo {
  providerId: string;
  name: string;
  icon: string;
  group: string;
  tagline: string;
  apiKeyUrl: string;
  apiKeyGuide: string[];
  capabilities: string[];
  configured: boolean;
  activeModels: number;
  needsBaseUrl: boolean;
  defaultBaseUrl: string;
  apiKeyOptional: boolean;
}

// Provider 分组
interface ProviderGroupInfo {
  id: string;
  name: string;
  description: string;
  icon: string;
  defaultExpanded: boolean;
  order: number;
  expanded: boolean; // 运行时状态
}

// 健康状态
interface ProviderHealthInfo {
  status:
    | "normal"
    | "billing_error"
    | "auth_invalid"
    | "rate_limited"
    | "degraded"
    | "down"
    | "unknown";
  message?: string;
  lastCheckedAt: number;
}

// 检测结果
interface DetectModelEntry {
  modelId: string;
  modelName: string;
  status: "pending" | "ok" | "failed" | "skipped";
  message?: string;
}

// 配置步骤
type ProviderConfigStep = "guide" | "apikey" | "detecting" | "result";
type DetectPhase = "validating" | "scanning" | "saving" | "done";
```

### 9.2 后端类型

```typescript
// Provider 配置存储
interface ProviderEntry {
  apiKey: string;
  baseUrl?: string;
  api?: string;
  headers?: Record<string, string>;
  models?: Array<{ id: string; name: string }>;
}

// 能力绑定
interface CapabilityBinding {
  providerId: string;
  modelId: string;
  auto: boolean;
}

// 探针结果
interface ProbeResult {
  ok: boolean;
  fatal?: boolean;
  reason?: "auth_failed" | "model_not_found" | "transient" | "network" | "other";
  message?: string;
}

interface DetectResult {
  success: boolean;
  error?: string;
  models: Array<{ id: string; name: string; status: string }>;
}
```

---

## 十、涉及文件清单

| 层次            | 文件路径                                                      | 行数  | 角色                                  |
| --------------- | ------------------------------------------------------------- | ----- | ------------------------------------- |
| 视图层          | `ui-cn/src/ui/views/model-config.ts`                          | ~3500 | 主页面 LitElement 组件                |
| 视图层          | `ui-cn/src/ui/views/local-model-tab.ts`                       | ~200  | 本地模型 Tab（暂隐藏）                |
| 控制器          | `ui-cn/src/ui/controllers/model-config.ts`                    | ~1024 | 核心控制器                            |
| 控制器          | `ui-cn/src/ui/controllers/local-engine.ts`                    | ~300  | 本地引擎控制器                        |
| 兼容层          | `ui-cn/src/ui/controllers/models.ts`                          | ~200  | 旧版模型选择（重映射到 v2 API）       |
| 路由            | `ui-cn/src/ui/navigation.ts`                                  | -     | Tab 路由定义                          |
| 渲染入口        | `ui-cn/src/ui/app-render.ts`                                  | -     | 页面切换渲染                          |
| Gateway 客户端  | `ui-cn/src/ui/gateway.ts`                                     | -     | WebSocket 通信                        |
| Gateway 事件    | `ui-cn/src/ui/app-gateway.ts`                                 | -     | 事件分发                              |
| 后端桥接        | `extensions/cn-adapter/gateway/ui-bridge.ts`                  | ~300  | 注册 capability_matrix.\* 方法        |
| Provider 注册表 | `extensions/cn-adapter/gateway/provider-registry.ts`          | ~400  | 22 个 Provider + 5 个分组 + 10 个能力 |
| 配置存储        | `extensions/cn-adapter/gateway/provider-config-store.ts`      | ~250  | 双文件读写                            |
| 模型探针        | `extensions/cn-adapter/gateway/probe-model.ts`                | ~300  | API Key 验证 + 模型检测               |
| Model Hook      | `extensions/cn-adapter/hooks/model-resolve.ts`                | ~30   | 模型覆盖 hook                         |
| 国际化          | `ui-cn/src/ui/i18n/locales/zh-CN.ts`                          | -     | `nav.modelConfig: "模型设置"`         |
| 测试            | `ui-cn/src/ui/controllers/model-config.test.ts`               | -     | 控制器单元测试                        |
| 测试            | `ui-cn/src/ui/controllers/model-config.detect-events.test.ts` | -     | 检测事件测试                          |

---

## 十一、改版注意事项

### ✅ 可以安全替换的（仅视觉）

- `static styles` 中所有 CSS 样式
- `render()` 中的 HTML 结构和布局
- 图标、颜色、字体、间距、动画效果
- 能力卡片的视觉呈现方式
- 弹窗的视觉设计
- 拖拽排序的视觉反馈

### ⚠️ 替换时需保留接线的

- 所有 `@click`, `@input`, `@keydown`, `@pointerdown` 事件绑定
- 所有 `${this._s.xxx}` / `${this._xxx}` 数据绑定
- 条件渲染逻辑（if/ternary/map）
- CSS class 名如果改了，对应 JS 中 `querySelector` / `class` 判断也要改
- 弹窗的 overlay click-to-close 行为
- 拖拽排序的 Pointer Events 处理链

### ❌ 不能动的（核心逻辑）

- `controllers/model-config.ts` — 所有控制器函数
- `controllers/local-engine.ts` — 本地引擎控制器
- Gateway RPC 调用（方法名 + 参数结构）
- 后端 `ui-bridge.ts` / `provider-config-store.ts` / `probe-model.ts`
- 全局事件名（`openclawcn:*`）
- 状态同步模式（`_host()` / `_sync()`）
- 数据类型定义（TypeScript interfaces）

---

## 十二、Figma 改版对接检查清单

改完新 UI 后，逐项确认：

### 页面加载

- [ ] Loading 骨架正确显示
- [ ] Gateway 未连接时显示错误状态
- [ ] 数据加载完成后正常渲染

### 能力卡片

- [ ] 6 张卡片正常显示（3×2 网格）
- [ ] 响应式布局正常（900px 2 列，500px 1 列）
- [ ] active 状态绿色圆点 + 模型名 + 服务商
- [ ] unconfigured 状态灰色圆点 + "未开通"
- [ ] 多子能力卡片正确显示子能力行
- [ ] 能力等级警告正确显示（weak 红色 / moderate 黄色）
- [ ] 入场动画正确（6 段延迟）

### 快速切换面板

- [ ] 点击卡片展开面板
- [ ] 模型列表正确加载
- [ ] 当前模型 ✓ 标记
- [ ] 切换模型时 spinner 显示
- [ ] 切换成功后 toast 提示（3s 消失）
- [ ] "查看全部模型 ›" 打开选择器弹窗
- [ ] 多子能力分组正确显示

### 模型选择器弹窗

- [ ] 当前模型 Banner 显示
- [ ] 搜索功能正常
- [ ] 服务商筛选下拉正常
- [ ] 上下文窗口筛选正常（32K/128K/256K）
- [ ] 能力等级筛选正常（强/中/弱）
- [ ] 多子能力 Tab 切换正常
- [ ] 未配置区域折叠/展开
- [ ] 点击未配置 Provider 的"添加配置"跳转正确
- [ ] 弹窗 overlay 点击关闭 / Escape 关闭

### Provider 管理

- [ ] 已配置列表显示优先级编号
- [ ] 拖拽排序功能正常
- [ ] 拖拽后优先级保存成功
- [ ] 健康状态徽章正确显示
- [ ] [管理] 按钮打开管理弹窗
- [ ] 管理弹窗显示脱敏 API Key
- [ ] 手动添加模型功能正常
- [ ] 测试连接功能正常
- [ ] 删除 Provider 二次确认正常

### Provider 配置向导

- [ ] 步骤指示器 4 步进度正确
- [ ] 引导步骤显示能力标签+步骤+外链
- [ ] API Key 输入框正常
- [ ] Base URL 输入框（需要时显示）
- [ ] 火山引擎 LLM/Voice 双 Tab 正常
- [ ] TTS 偏好设置正常（音色/语速/情感/音调）
- [ ] 检测进度动画正常
- [ ] 检测完成显示自动启用的能力
- [ ] 检测失败显示错误信息
- [ ] 检测中无法关闭弹窗
- [ ] 取消检测功能正常

### 分组折叠

- [ ] 5 个分组正确显示
- [ ] 默认展开/折叠状态正确
- [ ] 点击折叠/展开正常
- [ ] 分组计数正确

### 通知区

- [ ] 新手引导横幅正确显示/隐藏
- [ ] 必需服务商提示正确显示/隐藏
- [ ] 错误 toast 显示+关闭
- [ ] 切换成功 toast 显示+自动消失

### 跨页面交互

- [ ] 从聊天页 "前往配置" 跳转正确
- [ ] 从聊天页话筒按钮触发语音配置正确
- [ ] 模型切换后聊天页感知更新
- [ ] intent-hint 跳转正确
