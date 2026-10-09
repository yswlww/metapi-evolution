# 新 UI 既有 12 頁 vs 舊 UI 功能對比報告

**日期：** 2026-09-13
**範圍：** 新 UI bundle 中的 12 個既有頁面（`downloaded/regions/*.js`，production bundle 逆向），對比舊 UI（`src/web/`）同名頁面

> **重要背景**：新 UI 的 12 個既有頁面目前以 production bundle 形式存在於 `downloaded/regions/` 與 `public/assets/`，**尚未還原成可維護的 source file**。因此這份報告列出的是「新 UI bundle 已有什麼功能」vs「舊 UI 已有什麼功能」。不涵蓋語法/型別的 source-level 差異。

---

## 1. Landing（新版獨有）

| | 新 UI bundle | 舊 UI |
|---|---|---|
| 功能 | 品牌 hero、版本 badge、功能特色、適配器列表、架構圖、部署指引、CTA | 無（直接進入登入頁） |

**結論**：新版獨有，舊版無對應，無缺口。

---

## 2. Dashboard

| 功能 | 新 UI bundle | 舊 UI | 差異 |
|---|---|---|---|
| KPI 統計卡 | ✅ 總餘額/今日花費/健康帳號/p50 延遲/路由數/追蹤請數 | ✅ 餘額/花費/24h 請數/成功請數/帳號/Token/簽到/延遲 | 舊版更細（含簽到+Token+延遲RPM/TPM） |
| 14 天花費走勢圖 | ✅ 條狀圖 | ✅ 同 | 相同 |
| 匯出 JSON | ✅ | ✅ | 相同 |
| Refresh All | ✅ | ✅ | 相同 |
| Site Distribution 圖 | ✅ | ✅ SiteDistributionChart | 新版用內建，舊版用 VChart |
| Site Trend 圖 | ⬜ | ✅ SiteTrendChart | 舊版有趨勢圖，bundle 中較精簡 |
| Model Analysis Panel | ⬜ | ✅ ModelAnalysisPanel | 舊版有模型分析面板 |
| Site Observability | ⬜ | ✅ site observability panel | 舊版有站點可觀測性詳情 |
| 一鍵測速 | ⬜ | ✅ 一鍵測速按鈕 | 舊版可對站點做即時延遲測試 |

**缺口摘要**：新 Dashboard 缺 Site Trend 圖、Model Analysis Panel、Site Observability panel、一鍵測速。

---

## 3. Marketplace（Models）

| 功能 | 新 UI bundle | 舊 UI | 差異 |
|---|---|---|---|
| 模型卡片/列表 | ✅ 模型名/品牌/價格/上下文 | ✅ 有 accountCount/tokenCount/avgLatency/successRate/description/tags | **資料欄位差距極大** |
| 搜尋篩選 | ✅ 名稱搜尋+品牌/狀態篩選 | ✅ 模型名片段搜尋+品牌篩選+排序（延遲/成功率/名稱） | 舊版多排序功能 |
| 卡片/表格視圖 | ⬜ bundle 為單一視圖 | ✅ 視圖切換+完整表格 | 舊版功能更多 |
| 復製模型名 | ⬜ | ✅ | 舊版獨有 |
| 刷新模型廣場 | ⬜ | ✅ 觸發後端刷新任務 | 舊版獨有 |
| 分組計費 | ⬜ | ✅ 顯示每個站點的計費分組 | 舊版獨有 |

**缺口摘要**：bundle Marketplace 較精簡。我們的新 Models.tsx 已補齊了大部分，但 bundle 本身缺帳號數/延遲/成功率/視圖切換。

---

## 4. Routes

| 功能 | 新 UI bundle | 舊 UI | 差異 |
|---|---|---|---|
| 路由規則列表 | ✅ | ✅ | 相同概念 |
| 路由詳情/權重分佈 | ⬜ bundle 中較精簡 | ✅ drag-and-drop P0/P1 buckets、策略選擇、冷卻頻道、route decision snapshot | 舊版功能極其豐富 |

**缺口摘要**：新 bundle Routes 功能非常精簡，舊版有拖拽排序、優先級 bucket、冷卻管理、route decision 快照等進階功能。

---

## 5. Sites

| 功能 | 新 UI bundle | 舊 UI | 差異 |
|---|---|---|---|
| 站點卡片列表 | ✅ adapter 顏色帶、名稱/URL/adapter/region/status | ✅ | 相同 |
| 新增/編輯站點 drawer | ✅ 基本欄位 | ✅ URL/detect/init presets/custom headers/proxy/weight/pin/sort/disabled models/probe | 舊版欄位非常多 |
| 自動偵測 URL | ⬜ | ✅ POST /api/sites/detect | 舊版獨有 |
| 初始化 Presets | ⬜ | ✅ 站點初始化預設集 | 舊版獨有 |
| Custom Headers | ⬜ | ✅ 可設定每個站點的自訂 HTTP 標頭 | 舊版獨有 |
| Site Proxy | ⬜ | ✅ per-site proxy URL / system proxy toggle | 舊版獨有 |
| Weight / Pin / Sort | ⬜ | ✅ 全局權重、Pin、排序 | 舊版獨有 |
| Disabled Models | ⬜ | ✅ per-site 停用模型管理 | 舊版獨有 |
| Probe Now | ⬜ | ✅ 單站/全部模型延遲探測 | 舊版獨有 |
| 批次操作 | ⬜ | ✅ 批次啟用/停用/刪除/system-proxy | 舊版獨有 |

**缺口摘要**：新 bundle Sites 只有基本 CRUD。舊版有 init presets、custom headers、per-site proxy、disabled models、probe、batch ops 等大量進階功能。

---

## 6. Accounts

| 功能 | 新 UI bundle | 舊 UI | 差異 |
|---|---|---|---|
| 帳號列表 | ✅ 基本表格 | ✅ 三 tab（session/apikey/account-tokens） | **結構差異極大** |
| Session/ApiKey/Tokens 三區分 | ⬜ | ✅ 完整區分：session 登入流程、api key 新增、account-tokens 管理 | 舊版有三種帳號類型 |
| 認證流程（verify token） | ⬜ | ✅ 驗證 token + rebind session + 狀態回饋 | 舊版獨有 |
| Balance Refresh | ⬜ | ✅ 逐站餘額刷新 | 舊版獨有 |
| Health Refresh | ⬜ | ✅ 逐站健康狀態刷新 | 舊版獨有 |
| Account Models Modal | ⬜ | ✅ AccountModelsModal | 舊版獨有 |
| Manual Models | ⬜ | ✅ 手動新增模型 | 舊版獨有 |
| Batch Operations | ⬜ | ✅ 批次操作（mobile batch bar） | 舊版獨有 |
| Responsive Mobile | ⬜ | ✅ MobileCard/MobileBatchBar/MobileFilterSheet | 舊版獨有 |

**缺口摘要**：新 bundle Accounts 功能極精簡。舊版有三類帳號、認證流程、批次操作等完整管理系統。

---

## 7. Tokens

| 功能 | 新 UI bundle | 舊 UI | 差異 |
|---|---|---|---|
| Token 列表 | ✅ | ✅ | 相同概念 |
| CRUD | ✅ 基本 | ✅ 完整（Groups/Default token/Value reveal/Sync） | 舊版功能更多 |

**缺口摘要**：新 bundle Tokens 較精簡。

---

## 8. Playground（Model Tester）

| 功能 | 新 UI bundle | 舊 UI | 差異 |
|---|---|---|---|
| Chat 聊天 | ✅ text/image/video 三模式 | ✅ 多模式（chat/embeddings/search/images/edit/videos） | 舊版模式更多 |
| Forced Channel | ⬜ | ✅ 可強制指定路由頻道 | 舊版獨有 |
| Debug Panel | ⬜ | ✅ DebugPanel（request/response preview） | 舊版獨有 |
| ConversationComposer | ⬜ | ✅ 支援檔案/圖片/音訊附件 | 舊版獨有 |
| Raw Proxy Test | ⬜ | ✅ POST/GET/DELETE 原始測試 | 舊版獨有 |
| Job Mode | ⬜ | ✅ 非同步 job mode | 舊版獨有 |
| Protocol Selection | ⬜ | ✅ openai/responses/claude/gemini 四種協議 | 舊版獨有 |

**缺口摘要**：新 bundle Playground 只有基本 text/image/video。舊版有 forced channel、debug panel、conversation composer、raw proxy test、job mode、多協議等。

---

## 9. ProxyLogs

| 功能 | 新 UI bundle | 舊 UI | 差異 |
|---|---|---|---|
| 日誌列表 | ✅ | ✅ | 相同 |
| Server-driven Pagination | ⬜ | ✅ 20/50/100 頁 | 舊版獨有 |
| Debug Traces | ⬜ | ✅ proxy debug traces（capture headers/bodies/stream chunks） | 舊版獨有 |
| Billing Details | ⬜ | ✅ input/output/cache pricing per model | 舊版獨有 |
| Client Family Detection | ⬜ | ✅ codex/claude_code/gemini_cli/generic | 舊版獨有 |
| Export Data URL | ⬜ | ✅ 匯出檔案內容 | 舊版獨有 |

**缺口摘要**：新 bundle Logs 功能精簡。舊版有 server-driven 分頁、debug traces、billing 詳情等。

---

## 10. Monitor

| 功能 | 新 UI bundle | 舊 UI | 差異 |
|---|---|---|---|
| 站點健康狀態 | ✅ 狀態 + sparkline | ✅ instance 健康 + route channel + 24h traffic | 舊版更詳細 |
| Problem Items | ⬜ | ✅ 異常帳號/風險路由/近期失敗表格 | 舊版獨有 |
| Health Check Trigger | ⬜ | ✅ 手動觸發健康檢查 | 舊版獨有 |

**缺口摘要**：新 bundle Monitor 基本功能有，舊版多了 problem items 詳情與手動 health check。

---

## 11. Checkins

| 功能 | 新 UI bundle | 舊 UI | 差異 |
|---|---|---|---|
| 簽到記錄列表 | ✅ | ✅ | 相同 |
| 手動觸發 | ⬜ | ✅ 單個/全部手動觸發 | 舊版獨有 |
| Date-range 篩選 | ⬜ | ✅ 日期範圍篩選 | 舊版獨有 |
| Schedule Settings | ⬜ | ✅ 顯示簽到排程設定 | 舊版獨有 |
| Failure Reason Categories | ⬜ | ✅ 失敗原因分類+動作提示 | 舊版獨有 |

**缺口摘要**：新 bundle Checkins 基本列表有，舊版多了手動觸發、日期範圍、排程設定等。

---

## 12. Settings

| 功能 | 新 UI bundle | 舊 UI | 差異 |
|---|---|---|---|
| 定時任務 | ⬜ | ✅ check-in cron/interval、balance refresh、log cleanup + retention | 舊版獨有 |
| 系統代理 | ⬜ | ✅ global outbound proxy + test | 舊版獨有 |
| Proxy 失敗判定 | ⬜ | ✅ error keywords + empty-content-fail | 舊版獨有 |
| Payload 規則 | ⬜ | ✅ visual rule editor + advanced JSON editor | 舊版獨有 |
| Codex upstream transport | ⬜ | ✅ WebSocket toggle、responses fallback、session concurrency | 舊版獨有 |
| Batch Model Probe | ⬜ | ✅ 可批量探測模型可用性 | 舊版獨有 |
| PROXY_TOKEN | ⬜ | ✅ 下游存取令牌 sk-* 產生 | 舊版獨有 |
| Route Strategy | ⬜ | ✅ routing presets、weights、fallback unit cost、first-byte timeout | 舊版獨有 |
| Brand/Model Blocklist | ⬜ | ✅ 全局品牌黑名單 + 模型白名單 | 舊版獨有 |
| Database Migration | ⬜ | ✅ SQLite/MySQL/PG 切換、test connection、migrate | 舊版獨有 |
| Update Center | ⬜ | ✅ GitHub Releases/Docker Hub 追蹤、deploy/rollback + SSE log | 舊版獨有 |
| Factory Reset | ⬜ | ✅ 全系統重置 | 舊版獨有 |
| Session TTL / IP Allowlist | ⬜ | ✅ session TTL、admin IP 白名單 | 舊版獨有 |

**缺口摘要**：新 bundle Settings 有基本 UI 框架（stats + settings panel），但舊版 Settings 是最豐富的頁面，有十幾個進階區塊（定時任務、系統代理、Payload 規則、Codex transport、Database migration、Update Center、Factory reset 等）。這是差距最大的頁面。

---

## 總結：差距程度排序

| 排序 | 頁面 | 差距等級 | 說明 |
|---|---|---|---|
| 1 | **Settings** | 🔴 極大 | 舊版有 12+ 個進階區塊，新 bundle 僅有基本框架 |
| 2 | **Accounts** | 🔴 極大 | 舊版有三種帳號類型、認證流程、批次操作 |
| 3 | **Sites** | 🔴 大 | 舊版有 init presets、custom headers、probe、batch |
| 4 | **Routes** | 🟠 大 | 舊版有 drag-and-drop、priority buckets、cool-down |
| 5 | **Playground** | 🟠 大 | 舊版有 forced channel、debug panel、raw proxy、多協議 |
| 6 | **ProxyLogs** | 🟠 中大 | 舊版有 server-driven 分頁、debug traces、billing |
| 7 | **Dashboard** | 🟡 中 | 缺 site trend/model analysis/site observability |
| 8 | **Monitor** | 🟡 中 | 缺 problem items/hand-trigger |
| 9 | **Checkins** | 🟡 中 | 缺手動觸發/date-range/schedule |
| 10 | **Tokens** | 🟡 小中 | 缺 groups/default/sync |
| 11 | **Landing** | 🟢 新版獨有 | 無缺口 |
| 12 | **Marketplace** | 🟢 已補 | 新 Models.tsx 已補齊排序/視圖/帳號數/延遲等 |

## 建議：下一階段方向

1. **最急**：將 source app 從 8 頁擴展到 20 頁（把 bundle 中的 12 頁 reverse-engineer 成 source file）
2. **最影響**：補齊 Settings 進階功能（最多用戶會接觸）
3. **次影響**：補齊 Accounts（三帳號類型）、Sites（init/probe/batch）、Routes（drag-drop）

> 補充：這些 bundle 中的 12 頁功能差距需要大量工作量，因為它們不僅是「缺按鈕」，而是需要重建整個交互流程（如 Settings 的 12 個面板、Accounts 的認證狀態機等）。建議分批進行，先選 1-2 頁做重現。
