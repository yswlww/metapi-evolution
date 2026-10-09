# 新版 UI vs 現行 UI 頁面對比報告

**報告日期：** 2026-09-10  
**對比目標：**  
- **新版 UI：** `/New metapi Evolution Webui/metapi/`（Design Arena 還原的 React + Tailwind SPA，bundle 版本，源碼部分還原）  
- **現行 UI：** `src/web/`（本倉庫主線 Web UI，React + 自訂 CSS Variables）

---

## 一、整體架構差異

| 維度 | 新版 UI | 現行 UI |
|---|---|---|
| 框架 | React + React Router + Tailwind v4 | React + React Router + 自訂 CSS Variables |
| 路由結構 | `/` Landing 頁 → `/app/*` 子路由 | `/` 直接進入 Dashboard，無 Landing 頁 |
| 樣式系統 | Tailwind utility + CSS color tokens | CSS Variables（`--color-*`）+ CSS classes |
| 深色模式 | `data-theme` attr（dark / light） | `data-theme` attr（system / light / dark 三態） |
| 語言支持 | en / zh-Hant / zh-Hans（三語） | zh / en（雙語） |
| 登入畫面 | Landing 頁含 CTA，登入在 Landing 頁內 | 獨立 Login 全螢幕登入面 |
| 側邊欄 | 固定 264px sidebar（不可收合） | 可收合 sidebar（collapsible），移動端用 Drawer |
| 頂部導航 | Topbar（全局搜尋、通知鈴、語言、主題切換）+ Sidebar | Topbar（控制台 / 模型廣場 / 操練場 / 關於 + 語言 / 搜尋 / 通知 / 主題 / 用戶頭像）+ Sidebar 雙導航 |
| 移動端 | 側邊欄 Drawer overlay | MobileDrawer + 專門 mobile 組件（MobileCard, MobileBatchBar, MobileFilterSheet, MobileDrawer） |
| 狀態提示 | 連結式 sidebar 圖示（lucide-react） | 自訂 SVG inline icons |
| 組件數（src 目錄） | 12 個 src 元件（pages 未全部還原） | 40+ 個元件，含完整 mobile、chart、modal、toast 系統 |

---

## 二、新版 UI 頁面清單（12 頁）

| 路由 | 頁面 | 功能摘要 |
|---|---|---|
| `/` | Landing | 品牌首頁、hero、登入 CTA |
| `/app` | Dashboard | 總覽 KPI 卡片、支出走勢圖（14天）、site/account 計數 |
| `/app/marketplace` | Marketplace | 模型廣場：搜尋、品牌篩選、模型卡片列表 |
| `/app/routes` | Routes | 路由管理：路由表格 + 新增路由抽屜 |
| `/app/sites` | Sites | 站點管理：站點卡片 + 健康狀態指示 |
| `/app/accounts` | Accounts | 帳號管理：帳號列表 + 餘額/狀態 |
| `/app/tokens` | Tokens | 令牌管理：令牌列表 + 新增 |
| `/app/logs` | ProxyLogs | 使用日誌：統計卡片 + 日誌表格 |
| `/app/monitor` | Monitor | 可用性監控：站點狀態 + 歷史 sparkline |
| `/app/checkins` | Checkins | 簽到記錄：簽到日曆/列表 |
| `/app/playground` | Playground | 模型操練場：text / image / video 三模式 tab |
| `/app/settings` | Settings | 設定（3 tabs：General / Notifications / Security） |

---

## 三、現行 UI 頁面清單（18 頁）

| 路由 | 頁面 | 功能摘要 |
|---|---|---|
| `/` | Dashboard | 總覽 KPI、可用性圖表、效能卡片、近期活動 |
| `/sites` | Sites | 站點管理（含 SiteCreatedModal、完整 CRUD） |
| `/site-announcements` | SiteAnnouncements | **站點公告管理** |
| `/accounts` | Accounts | 連線管理（含 AccountModelsModal、驗證回饋、批次操作） |
| `/oauth` | OAuthManagement | **OAuth 管理**（OAuthModelsModal、配額、連線管理） |
| `/tokens` | Tokens | 令牌管理 |
| `/checkin` | CheckinLog | 簽到記錄 |
| `/routes` | TokenRoutes | 路由管理（含路由 profiles、cooldown、model候選索引） |
| `/logs` | ProxyLogs | 使用日誌（server-driven、billing 詳情、debug trace） |
| `/monitor` | Monitors | 可用性監控（含即時狀態、歷史 sparkline） |
| `/settings` | Settings | 設定（proxy transport、system proxy、factory reset、route cooldown、route selector、downstream API key、model availability probe） |
| `/downstream-keys` | DownstreamKeys | **下游密鑰管理**（DownstreamKeyDrawer、DownstreamKeyEditorModal） |
| `/events` | ProgramLogs | **程序日誌** |
| `/settings/import-export` | ImportExport | **匯入/匯出** |
| `/settings/notify` | NotificationSettings | **通知設定** |
| `/models` | Models | **模型廣場**（含 marketplace metadata、model tester session） |
| `/playground` | ModelTester | 模型操練場（含 ConversationComposer、DebugPanel、forced channel） |
| `/about` | About | **關於頁面**（含 Update Center 歷史） |

---

## 四、現行 UI 獨有頁面（新版 UI 缺少，共 8 頁）

| 路由 | 頁面 | 功能 | 重要程度 |
|---|---|---|---|
| `/site-announcements` | SiteAnnouncements | 站點公告管理：各站點公告內容 CRUD、展示設定 | ⭐⭐⭐ 中高 |
| `/oauth` | OAuthManagement | OAuth 管理：OAuth 供應商連線、配額追蹤、route unit 策略（round-robin / stick-until-unavailable）、批次刪除、匯入 | ⭐⭐⭐⭐ 高 |
| `/downstream-keys` | DownstreamKeys | 下游 API 密鑰管理：密鑰產生/編輯抽屜、使用趨勢圖（DownstreamKeyTrendChart）、site distribution 圖 | ⭐⭐⭐⭐ 高 |
| `/events` | ProgramLogs | 程序日誌：後端事件流檢視（task 狀態更新追蹤） | ⭐⭐⭐ 中高 |
| `/settings/import-export` | ImportExport | 設定匯入/匯出：全站配置匯出為 JSON、從 JSON 匯入（含合併/覆蓋模式） | ⭐⭐⭐ 中高 |
| `/settings/notify` | NotificationSettings | 通知設定：Webhook URL 設定、通知事件類型開關、測試發送 | ⭐⭐ 中 |
| `/about` | About | 關於頁面：版本資訊、Update Center（版本歷史、更新狀態） | ⭐⭐ 中 |
| `/models` | Models（top nav 連結） | 模型廣場：獨立 top nav 頁面（Marketplace metadata、model tester session 資訊） | ⭐⭐ 低（功能與 `/playground` 有部分重疊） |

---

## 五、新版 UI 獨有頁面（現行 UI 缺少，共 1 頁）

| 路由 | 頁面 | 功能 | 重要程度 |
|---|---|---|---|
| `/` (Landing) | Landing | 品牌首頁：hero 標題、能力介紹（3 大優勢）、相容性聲明、登入 CTA、GitHub/文檔連結 | ⭐⭐ 低（純展示，不影響功能） |

---

## 六、路由結構差異對照表

| 功能區塊 | 新版 UI 路由 | 現行 UI 路由 | 備註 |
|---|---|---|---|
| 儀表板 | `/app` | `/` | 新版用 `/app` prefix |
| 站點管理 | `/app/sites` | `/sites` | 功能對應 |
| 帳號管理 | `/app/accounts` | `/accounts` | 功能對應 |
| 令牌管理 | `/app/tokens` | `/tokens` | 功能對應 |
| 簽到記錄 | `/app/checkins` | `/checkin` | 路由命名不同（checkins vs checkin） |
| 路由管理 | `/app/routes` | `/routes` | 功能對應 |
| 使用日誌 | `/app/logs` | `/logs` | 功能對應 |
| 可用性監控 | `/app/monitor` | `/monitor` | 功能對應 |
| 模型操練場 | `/app/playground` | `/playground` | 功能對應 |
| 設定 | `/app/settings` | `/settings` | 現行 Settings 功能更豐富 |
| 模型廣場 | `/app/marketplace` | `/models`（top nav） | 新版 route 與現行 top nav 對應 |
| **站點公告** | ❌ 缺失 | `/site-announcements` | — |
| **OAuth 管理** | ❌ 缺失 | `/oauth` | — |
| **下游密鑰** | ❌ 缺失 | `/downstream-keys` | — |
| **程序日誌** | ❌ 缺失 | `/events` | — |
| **匯入/匯出** | ❌ 缺失 | `/settings/import-export` | — |
| **通知設定** | ❌ 缺失 | `/settings/notify` | — |
| **關於頁面** | ❌ 缺失 | `/about` | — |

---

## 七、功能深度差異（同名頁面）

同名頁面的功能覆蓋差異：

| 頁面 | 新版 UI 功能 | 現行 UI 額外功能 |
|---|---|---|
| Dashboard | KPI 卡片、支出走勢 | +效能卡片、site 速度按鈕、可用性圖表、漸進式渲染 |
| Sites | 站點列表、健康狀態 | +SiteCreatedModal、完整 CRUD 抽屜、site badge |
| Accounts | 帳號列表、餘額 | +AccountModelsModal、驗證回饋、批次操作、rebind panel、mobile batch bar |
| Routes | 路由表格 | +routing profiles、route cooldown、model 候選索引、zero-channel routes |
| Logs | 日誌表格 | +server-driven logs、billing 詳情、debug trace、log path meta |
| Monitor | 站點狀態、sparkline | +internal 狀態、即時更新 |
| Settings | general / notify / security 三 tab（check-in cron、webhook/Bark/Server酱/Telegram/SMTP 通知、admin token、IP allowlist、加密 secret） | +proxy transport、system proxy、factory reset、route cooldown、route selector、downstream API key modal、model availability probe、schedule log cleanup、payload rules |
| Playground | text / image / video 三 tab | +ConversationComposer、DebugPanel、forced channel 支援 |
| Tokens | 基本 CRUD | 功能相當 |

---

## 八、API 層差異

| 維度 | 新版 UI | 現行 UI |
|---|---|---|
| API 呼叫方式 | 直接 `apiGet/apiPost/apiPut/apiDelete`（通用 fetch wrapper） | 專用 `api` 物件，每個端點有獨立方法 + 型別定義 |
| 快取/輪詢 | 無快取，直接 fetch | 含本地快取、輪詢機制（proxy test jobs、events） |
| 錯誤處理 | 簡單 throw Error | 完整 error 解析（含 response body、status code mapping） |
| API 端點覆蓋 | 9 個快照端點（sites, accounts, routes, tokens, models, logs, events, monitor, checkins） | 60+ 專用方法，覆蓋完整 backend API（含 OAuth、downstream keys、import/export、notification settings、proxy test jobs） |

---

## 九、元件系統差異

| 類別 | 新版 UI | 現行 UI |
|---|---|---|
| 表單元件 | EditDrawer | EditDrawer, CenteredModal, DeleteConfirmModal, ModernSelect, ResponsiveFormGrid |
| 圖表 | Sparkline（mini chart） | Sparkline, SiteTrendChart, SiteDistributionChart, DownstreamKeyTrendChart |
| 行動端 | 基本 mobile sidebar drawer | MobileCard, MobileBatchBar, MobileFilterSheet, MobileDrawer, MobileLayout |
| 通知 | NotificationBell（icon + badge） | NotificationPanel（完整 dropdown + unread tracking + event polling） |
| 搜尋 | 無 | SearchModal（Ctrl+K 全局搜尋） |
| 提示 | 無 | Toast + TooltipLayer + AnimatedVisibility |
| 篩選 | 基本 filter | ResponsiveFilterPanel（含 mobile filter sheet） |
| 批次操作 | 無 | ResponsiveBatchActionBar |
| 模型分析 | 無 | ModelAnalysisPanel |
| 站點公告展示 | 無 | SiteAnnouncementPresentation |

---

## 十、摘要

**新版 UI 共 12 頁，現行 UI 共 18 頁。**

現行 UI 比新版 UI 多出的 8 個獨有頁面：

1. **SiteAnnouncements**（站點公告）— `/site-announcements`
2. **OAuthManagement**（OAuth 管理）— `/oauth`
3. **DownstreamKeys**（下游密鑰）— `/downstream-keys`
4. **ProgramLogs**（程序日誌）— `/events`
5. **ImportExport**（匯入/匯出）— `/settings/import-export`
6. **NotificationSettings**（通知設定）— `/settings/notify`
7. **About**（關於頁面）— `/about`
8. **Models**（模型廣場 top nav 連結）— `/models`（新版用 `/app/marketplace` 對應，功能重疊但實作不同）

**新版 UI 獨有 1 頁**：Landing 品牌首頁（`/`），現行 UI 無此頁。

**核心差距**：新版 UI 是精簡化的 12 頁原型設計（由 Design Arena 生成），現行 UI 是功能完整的 18 頁實作版本，額外覆蓋了 OAuth 管理、下游密鑰、站點公告、程序日誌、匯入匯出、通知設定、關於等進階管理功能，且各共有頁面的功能深度也普遍更豐富。
