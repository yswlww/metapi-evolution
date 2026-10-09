# 新舊 Webui 功能覆蓋重新核對報告

核對日期：2026-10-08

## 1. 結論

**新 Webui 尚未完整包含舊 UI 的功能，不建議現在移除舊 UI 或直接將新版當成無損替代。**

新版已具備大部分主要頁面與不少真實 API 讀寫，但「存在頁面／API 函式」不等於「完整操作流程已覆蓋」。目前仍有：

1. 真正缺少的管理能力，例如帳號／令牌批次操作、explicit-group 路由、操練場多輪對話與串流。
2. 有控制項但沒有持久化或接到錯誤操作，例如通知配置儲存、進階設定部分控制項、立即模型探測。
3. 後端契約或顯示單位不一致，例如路由策略、模型成功率、日誌事件分類。
4. 保留原型資料／固定展示內容的路徑。
5. 部分行動版操作缺失，以及標準部署仍指向舊 UI。

不能由檔案數、頁面數、API 端點數換算可信的功能覆蓋百分比；本報告不提供未定義分母的「完成率」。

## 2. 核對範圍與證據限制

- 舊 UI：`src/web/`。
- 新 UI：`New metapi Evolution Webui/metapi/src/`。
- 以目前工作目錄為準，**包含尚未 commit 的 i18n 修改**，並非僅檢查 `6680866`。
- 檢查可達路由、頁面 handler、資料轉換、API payload、相關後端契約與舊 UI 行為測試。
- 將不同但等效的操作視為覆蓋；不將純外觀、CSS 或元件命名差異當成功能缺失。
- 這次沒有用真實上游帳號做完整瀏覽器端到端測試，也沒有發送部署、刪除、工廠重設等寫入請求。下列缺陷以程式碼與契約核對確認，不代表每一項均已在瀏覽器重現。
- 實際執行新 UI `npm run typecheck` 與 `npm run build`：皆成功。Build 有單一 JS chunk 約 845 kB、超過 500 kB 的警告；不是 build 失敗。
- 編譯通過不能證明 OAuth、權限限制、儲存流程或後端欄位語義正確。

為縮短表格，下文 `OLD/` 表示 `src/web/`，`NEW/` 表示 `New metapi Evolution Webui/metapi/src/`。

## 3. 頁面與功能域矩陣

「部分」表示主要入口存在，但不能認定已等價替代舊版。

| 功能域 | 新版已有 | 已確認的缺口／差異 | 結論 |
|---|---|---|---|
| 登入／導覽殼層 | 真實 token 驗證、登出、搜尋彈窗、通知鈴、亮暗主題 | 舊版定時 session 到期檢查未保留；主題只有 light/dark，沒有持續跟隨系統模式；通知只在掛載時載入；搜尋模型結果未保留精確定位 | 部分 |
| 儀表板 | 摘要、站點可用性、分布、趨勢、模型用量、單站測速 API | 新版模型分析固定 7 日表格，不能當成舊版完整分析面板的等價覆蓋；趨勢為簡化展示；仍需逐指標端到端驗收 | 部分 |
| 站點管理 | 新增、編輯、偵測、刪除、啟停、批次啟停／刪除、代理與 disabled-models 編輯 | 舊版批次系統代理、置頂／自訂排序操作、可用模型選擇與建立後接續帳號工作流未完整保留 | 部分 |
| 上游帳號 | 密碼登入／access token／API key 新增、token 驗證、餘額、健康刷新、rebind、簽到、刪除 | 缺少舊版批次維護、完整既有帳號編輯、連線分類與模型管理 modal；目前 `+ MODELS` 只是逗號輸入 prompt | 部分 |
| 帳號令牌 | 新增、預設、啟停、顯示、同步、刪除 | 缺少分組發現、完整編輯、批次啟停／刪除、搜尋／篩選等舊 TokensPanel 能力 | 部分 |
| OAuth | 提供商／連線／配額、路由單元、proxy 變更、refresh 等 API | 啟動與 rebind 丟棄授權結果，沒有接續授權 session 流程；匯入 payload 把內容縮成 email；缺模型管理等 | 不完整，含流程阻塞 |
| 智慧路由 | pattern 路由 CRUD、重建、冷卻清除、批次啟停、單一頻道新增／刪除／啟停／排序 | explicit-group 路由缺失；策略值不符；頻道 token 重綁、priority bucket、概率診斷、篩選／排序等不足 | 不完整，含契約錯誤 |
| 下游密鑰 | CRUD、完整 key 複製／顯示、額度、批次啟停／刪除／reset、部分白名單 | 排除凭證只有展示文案；清空限制時未傳空值；批次 metadata、標籤篩選、逐 key 概覽缺失；行動版批次選取缺失 | 不完整 |
| 模型廣場 | 真實模型列表、刷新、搜尋、部分篩選／排序、卡片／表格 | 成功率放大 100 倍、價格固定 0／欄位錯映射、帳號數按站名去重；完整 metadata／定價明細、品牌與分頁未完整保留 | 不完整，含資料錯誤 |
| 操練場 | 單次非串流文字測試、protocol／forcedChannel 輸入、job polling、JSON 輸出 | 多輪、串流／取消、檔案、圖片編輯、影片完整流程、embeddings、search、自訂 request、session replay、完整 debug 缺失 | 明顯不等價 |
| 簽到 | 列表、搜尋／狀態／日期篩選、全部觸發、cron 儲存 | 舊版 interval-hours 排程模式未保留；結構化 failureReason 降為簡化文字，診斷展示不等價 | 部分 |
| 使用日誌 | 後端分頁、基本篩選、詳細 JSON、debug trace 列表、匯出 | 串流／首 token／billing 明細、meta 篩選、刷新控制、完整追蹤設定／attempt 診斷缺失；fallback detail 有虛構 HTTP 狀態 | 部分，含誤導展示 |
| 站點公告 | 列表、搜尋、同步、清除、標记已讀 API | 新 mapping 讀 summary/message/read，實際後端是 content/readAt；正文與已讀狀態無法正確還原；缺舊內容展示與 focus 定位 | 部分，含契約錯誤 |
| 程式日誌 | 列表、已讀、清除、搜尋、展示更多 | 真實事件類型被壓成 system；最多先載入 50 筆，Load More 不是伺服器分頁；舊版任務結果判斷／未讀篩選不足 | 部分，含資料分類錯誤 |
| 可用性監控 | overview、摘要、異常帳號、風險路由列表、刷新 | 缺 health-check 動作、近期失敗請求與詳細 channel 數；風險路由 reason 不是後端欄位 | 部分 |
| 系統設定 | cron、日誌清理、系統代理、payload JSON、transport／concurrency、部分路由設定與 DB 操作 | 部分控制項沒保存；立即 probe 接錯函式；interval 排程、queue-wait、完整 payload builder、DB runtime／SSL／overwrite 不足 | 不完整 |
| 通知設定 | 5 類通知的啟停、cooldown、全域測試；Settings 分頁另有可寫配置 | 獨立 Notifications 頁的配置 drawer Save 不寫入；部分 Telegram 欄位缺失；頁面會在載入失敗時保留原型展示 | 不完整，含假成功 |
| 匯入／匯出 | JSON 匯出、檔案匯入、確認、WebDAV 推送／拉取／寫設定 | 不讀回已存 WebDAV 配置；空白密碼自動清除；autoSyncEnabled 沒可用開關；匯入預覽按原型 sections 欄位計數 | 部分，含設定覆蓋風險 |
| 關於／更新中心 | 當前版本、檢查、GitHub deploy、rollback API | 更新配置、Docker tag、任務日誌、歷史 revision 選擇不足；rollback 用 currentVersion 代替歷史 revision | 部分 |
| 三語與行動版 | EN／繁中／簡中架構、多處響應式佈局 | 仍有真實英文 UI 文案／掛載後儲存的已翻譯文字不隨語言更新；行動版下游 key 批次操作缺失 | 不能宣稱全面等價 |
| 標準 build／部署 | 新 UI 有獨立 Vite build | 根目錄 Vite root 仍是舊 `src/web`，新 UI 尚未接入標準 build:web／正式產物路徑 | 尚未完成替換 |

### 不是缺口的兩個項目

- 舊 `/tokens` 不是獨立應用頁面：`OLD/pages/Tokens.tsx:5-10` redirect 到 `/accounts?segment=tokens`。新版把令牌放在 Accounts，**不能僅因沒有 `/tokens` 路由就判定缺功能**；真正缺的是 TokensPanel 的操作能力。
- 新 `/app/marketplace` redirect 到 `/app/models`，`Marketplace.tsx` 不會被渲染。未把不可達的原型頁當成已完成的模型廣場。

## 4. 優先修復：已確認的實際缺陷

### P0 — 會阻止完整操作或讓使用者誤以為已完成

#### P0-1：OAuth 啟動後沒有完成授權流程

- `NEW/lib/source.ts:716-722` 的 `startOAuthProvider()` 返回 `Promise<void>`，丟棄 POST 回應。
- `NEW/pages/OAuthManagement.tsx:861-867` 呼叫後只顯示訊息；沒有展示 authorization URL／device code、保留 session state 或輪詢授權完成。
- rebind 同樣丟棄回應：`NEW/lib/source.ts:734-740`。
- 舊版有 session 輪詢與 manual callback：`OLD/pages/OAuthManagement.tsx:839、1110-1190`。

**影響：呼叫 start 成功不能代表新連線已建立；新版缺少讓使用者完成 consent 的關鍵步驟。**

#### P0-2：獨立通知頁配置儲存是假成功

- `NEW/pages/NotificationSettings.tsx:359-364` 打開 ChannelDrawer。
- Save handler 在 `:400-403` 只有 `onFlash(...)` 與 `onClose()`，沒有任何寫入 API。
- destination／credential 是無儲存狀態的輸入，event-type 按鈕也沒有點擊更新 handler：`:411-438`。
- Settings 頁的另一個通知 drawer 可寫入，不代表這個入口已完成。

**影響：使用者按 Save 看到成功訊息，但新目的地與憑證沒有被保存。**

#### P0-3：WebDAV 空白密碼被當成清除既有密碼

- `NEW/pages/ImportExport.tsx:45` 以空白初始化所有 WebDAV draft，沒有載入已存設定；雖然 `NEW/lib/source.ts:884` 有讀取函式，頁面沒有使用。
- `NEW/pages/ImportExport.tsx:146-147` 在密碼空白時送 `clearPassword: true`。
- 舊版只有明確勾選清除才送該 flag：`OLD/pages/ImportExport.tsx:449-464`。

**影響：只是改 URL／username 或保留密碼不填，也可能清除已存憑證；其他既有設定也可能被預設值覆蓋。**

### P1 — 契約錯誤、控制項無效或管理能力退化

#### P1-1：路由策略選項不符合後端

- `NEW/pages/Routes.tsx:716`：`weighted / round_robin / sticky_cost / cheapest / fallback`。
- 後端契約 `src/server/services/routeRoutingStrategy.ts:1-9`：只有 `weighted / round_robin / stable_first`。
- 不支援的值會被 normalize 成 `weighted`。

**影響：舊版的 stable-first 無法選；使用者選其餘三個新選項時，實際儲存的策略不是畫面選擇。**

#### P1-2：進階設定存在未保存的控制項，立即探測接錯操作

- `NEW/pages/settings/SettingsAdvanced.tsx:83、95` 有 `emptyContentFail`、`routePreset`。
- Save payload `:162-178` 未送這兩項對應設定。
- 「RUN PROBE NOW」在 `:315` 呼叫 `handleProxyTest`，而該函式 `:148-149` 是 `testSystemProxy()`，不是模型可用性探測。
- `Settings.tsx:210` dirty 固定為 false；Cancel `:309-323` 未重設路由權重與 notify draft。

**影響：畫面可改不等於設定被保存；「立即模型探測」不會執行所標示的模型探測。**

#### P1-3：模型數值與定價展示不正確

- 後端 successRate 是 0–100：`src/server/routes/api/stats.ts:1413-1415`。
- `NEW/pages/Models.tsx:177` 再乘 100；93 會被顯示成 9300.0%。
- mapping `:48-50、63-64` 固定 context／價格為 0，並把 `unitCost` 當 input-per-million。
- uniqueAccountCount `:166-173` 按 siteName 去重，算的是站名數而非帳號數。
- 初次 fetch 只要 `includePricing:false`，新版沒有舊版的 metadata／pricing 補充載入流程。

**影響：數字看似有資料，但不能作為模型健康、定價或帳號覆蓋的可信依據。**

#### P1-4：下游 key 無法完整編輯權限限制

- 排除 credential 是靜態文案而非選擇器：`NEW/pages/DownstreamKeys.tsx:1034-1038`。
- save `:842-843` 只有集合非空才送 `allowedRouteIds`／`excludedSiteIds`。

**影響：把既有群組路由／排除站點全部取消時，payload 沒送空陣列，無法表達「清除全部」；也不能管理舊版支援的 explicit-token／default-API-key 排除。**

#### P1-5：ProgramLogs 分類與分頁不等價

- `NEW/pages/ProgramLogs.tsx:62-64` 只認 `oauth/key/announcement/system/export`，其餘壓成 system。
- 舊版／後端實際有 checkin、balance、token、proxy、status、site_notice 等事件。
- `NEW/lib/source.ts:785-788` 只 fetch `limit=50`；Load More 在 `ProgramLogs.tsx:305` 只是顯示更多既有陣列項目。

**影響：真實事件被錯誤分類；無法用 Load More 檢視 50 筆以外的紀錄。**

#### P1-6：使用日誌缺少完整診斷，fallback 還會合成 HTTP 資訊

- `NEW/pages/ProxyLogs.tsx:373-388` fallback 固定 `POST /v1/chat/completions`、`status: 200 OK` 與合成 trace header。
- 不能把失敗请求、Claude／Responses 请求的真實內容替換成這個模板。
- 完整 tracing 開關／capture 設定、retention、attempt 診斷、client/site meta filter、刷新操作尚未保留。

**影響：故障排查可能被虛構成功狀態／錯誤端點誤導。**

#### P1-7：監控畫面仍有契約缺口

- 新風險路由 reads displayName／reason：`NEW/pages/Monitor.tsx:17、138-139`。
- 後端實際給 title／modelPattern 與 channel／cooldown／failed 數：`src/server/routes/api/monitor.ts:260-269`。
- modelPattern 仍可能顯示，所以不是「所有列都只有 route-id」；但 display title／原因／詳細數字沒有正確呈現。
- `OLD/pages/Monitors.tsx:151-162` 的 `refreshAccountHealth({wait:true})` 與近期失敗请求面板未完整搬到新版。

#### P1-8：站點公告正文與已讀狀態讀錯欄位

- `NEW/pages/SiteAnnouncements.tsx:38-61` 定義並讀取 `summary/message/source/read/publishedAt/createdAt`。
- 後端 `src/server/routes/api/siteAnnouncements.ts:65-72、140-149` 直接回傳資料列，保留 `content`、`readAt`、`firstSeenAt` 等欄位，不會轉換成新版假設的欄位。
- 舊頁面 `OLD/pages/SiteAnnouncements.tsx:224-227` 使用 `readAt` 與 `SiteAnnouncementContent(content)`。

**影響：實際公告正文可能空白；已讀公告重新載入後又被標成未讀。呼叫 mark-read API 成功並沒有解決重新讀取時的 mapping 錯誤。**

## 5. 最主要的功能缺失

### 5.1 操練場不是等價版本

舊 `OLD/pages/ModelTester.tsx` 有：

- 多輪 messages 與編輯／重放。
- 串流處理、AbortController、取消 job。
- session localStorage 恢復與持久化。
- conversation file upload／引用。
- embeddings、search、images generate/edit、videos create/inspect。
- 自訂 payload／參數與完整 DebugPanel。

證據：舊版 imports `:11-35`、state `:661-709`、session `:762、908`、upload `:1045`、stream `:1536、1556`、取消 `:2076`。

新 `NEW/pages/Playground.tsx` 只有單次 prompt＋一個 user message、`stream:false`、固定 JSON envelope、輪詢結果；圖片／影片模式 catalog 在 API mode 保持空（`:48-50`），video 沒自己的 endpoint 分支（`:81-95`），切換模式還保留 text model。

**不是單純少了漂亮的對話介面，而是整個測試能力範圍縮小。**

### 5.2 路由只保留 pattern 工作流

- 新 create 固定 `routeMode:"pattern"`：`NEW/pages/Routes.tsx:193-204`。
- 舊版有 explicit-group、sourceRouteIds、source model picker：`OLD/pages/TokenRoutes.tsx:497-537`、`OLD/pages/token-routes/ManualRoutePanel.tsx`。
- 缺少既有 channel token 重綁／follow-default 編輯、selection-probability、cached decision refresh／task、route-wide decisions、品牌／站點／能力／群組 filter。
- 新排序把各 channel priority 重編成 index（`NEW/pages/Routes.tsx:311-327`），不能視為保留舊 priority-bucket 語義的等價操作。

### 5.3 帳號、令牌與 OAuth 模型維護不完整

- 舊帳號支援完整編輯、批次處理、pin／sort、模型檢查與模型 modal：`OLD/pages/Accounts.tsx:589、649、969、1039、3512`。
- 新版只有新增與逐列維護；既有 account 的 `updateAccount()` 目前主要用於簽到開關，不存在等价完整 account editor。
- 舊 TokensPanel 有 token group discovery、token edit、batch：`OLD/pages/tokens/TokensPanel.tsx:231、443、484`；新 Accounts token 區無等價流程。
- 舊 OAuthModelsModal 的探索／檢查／展示未搬入新版。

### 5.4 更新中心與 DB 維護只保留部分操作

- 舊 UpdateCenterSection 支援 config、Docker tags、task 日誌、history revision rollback。
- 新 About 僅有 check、GitHub deploy、rollback；rollback 送 currentVersion（`NEW/pages/About.tsx:80`），沒有從 history 取 revision。
- DB runtime config 讀／寫、SSL／overwrite 控制沒有對等入口；new migrate 硬編 `overwrite:false`。
- payload rules 只剩 JSON textarea，沒有舊 visual builder／preset；queue wait 與部分 routing 控制缺失。

### 5.5 行動版與 i18n 不能宣稱全部完成

- 下游 key desktop table 有選取 checkbox，mobile cards 沒同等 selection（`NEW/pages/DownstreamKeys.tsx:481-487、605-673`）。行動版無法自行進入批次選取流程。
- 並非所有新版頁面都沒有 mobile 支援：Routes panel 已能堆疊、OAuth／Models／Keys 也有部分 mobile branches；本報告不採用「完全沒有行動版」這種過度結論。
- `NEW/pages/Playground.tsx:172、234、243、268、274` 仍有可見英文 UI 字串，這些不是 token／URL 格式範例。
- `NEW/components/AppShell.tsx:226、297、307` 也仍有英文 UI 文案；Notifications mount effect 把已翻譯文字存入 state 但不依語言重跑（`NotificationSettings.tsx:60-87`）。
- 因此 **dict key 齊全、沒有重複 key，不代表所有可見文字都跟著語言切換**。

## 6. 標準部署與驗收差異

- 根目錄 `vite.config.ts:16-20` 仍以 `src/web` 為 root、輸出 `dist/web`。
- 根目錄 `package.json:33-36` 的 build:web／build 仍使用這份配置。
- 新 UI 有自己的 package／Vite，輸出自己目錄的 dist；不能認定已切换正式產品。
- 舊 UI 有 113 個非測試 TS/TSX 檔案、145 個測試檔；新 UI 54 個非測試檔、3 個測試檔（routes、prototype、view-model）。**這只說明行為回歸保障不足，不直接換算功能覆蓋率。**
- 本次 build／typecheck 已通過，但沒有全面 E2E；尤其本報告列出的 P0/P1 沒有被編譯檢查擋住。

## 7. 建議補齊順序

1. **真實流程與假成功**：OAuth completion／import、NotificationDrawer 真保存、WebDAV 密碼保留與讀回設定。
2. **後端契約與限制保存**：routing strategy、model rates／prices／account count、下游權限 clear semantics、advanced settings／probe、events／monitor 欄位。
3. **核心操作能力**：帳號／token editor＋batch、explicit-group routes＋channel binding、完整操練場。
4. **觀測與維運**：真實 log details、debug capture／attempt、decision task、更新歷史／task logs、DB runtime。
5. **操作等價性**：mobile batch／row actions、filter／sort／pagination、三語即時切換。
6. **正式切換前驗收**：建立以舊 UI 行為測試為清單的 parity tests，使用測試後端驗證重載後仍保存，再接入標準 build／部署。

每一階段都應分成小 patch。驗收單位應是「從選取／輸入到寫入、重載後狀態、錯誤提示、行動版入口」的完整流程，不是有沒有同名按鈕。

## 8. 最終建議

現在將新版定位為 **已接入真實後端、但尚在功能遷移中的 UI** 較準確。保留舊 UI 作為功能與行為的參照，優先修復已確認的 P0/P1，再補齊管理與操練場工作流。

本次僅分析、執行 build/typecheck 並產出報告；沒有修改應用功能、沒有 commit／push、沒有執行真實資料破壞性或部署操作。
