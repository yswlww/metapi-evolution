# Webui 功能對等修復與驗收報告

日期：2026-10-08

對照文件：`docs/ui-functional-parity-report-2026-10-08.md`。

## 結論

原報告列出的 P0/P1 實際缺陷已完成程式修復，主要管理與操練場工作流已補齊，並整合到標準 Web build。新版與舊版仍同時保留；這不是「所有真實上游／部署環境已完成無損替換驗收」的宣告。

所有修改留在目前工作區，未 commit、push 或部署。既有未提交翻譯修改與其他使用者檔案均保留；兩個未追蹤 server concurrency 模組的編譯阻塞已依後續要求修復，完整 typecheck／build 已通過。

## 修復範圍

| 原報告項目 | 已落地的修復 |
|---|---|
| P0-1 OAuth | 保留 start/rebind 授權 session 回應；真實 provider 選擇、consent URL、manual callback、輪詢完成／錯誤與關閉取消。原生匯入保留完整憑證，支援多檔 items 匯入及部分失敗結果。OAuth 模型查看／刷新與持久化 route-unit ID／成員維護。 |
| P0-2 通知假成功 | 兩個入口共用真正寫入的 ChannelConfigDrawer；完整 Telegram／SMTP 欄位；儲存失敗不關閉；不回退到原型目的地。沒有後端契約的事件路由／送達歷史不再偽裝為可管理功能。 |
| P0-3 WebDAV | 讀回已存設定；空白密碼保留、明確勾選才清除；enabled、export scope、autosync、cron 可保存。設定讀取失敗不可將預設值覆蓋回去。真實備份格式預覽與檔案選擇器。 |
| P1-1 路由策略 | 僅使用 weighted／round_robin／stable_first。補齊 explicit_group／sourceRouteIds、來源選擇、頻道 token／default／priority／weight 編輯；移動整個 priority bucket 而非扁平重編。 |
| P1-2 設定／探測 | 保存 empty-content 判定、canonical routing presets／五項權重、queue wait；dirty 與 Cancel 正確恢復。模型立即探測使用 /api/models/probe。系統代理測試傳送草稿 proxyUrl，不誤測已存代理。 |
| P1-3 模型資料 | successRate 保持 0–100；按 account ID 去重；載入真實 pricing／metadata，區分 per-call／per-million，未知價格／context 顯示未知。品牌／站點篩選與分頁、精確模型搜尋定位。 |
| P1-4 下游權限 | allowedRouteIds／excludedSiteIds／excludedCredentialRefs 清空時傳 []；真實 account_token/default_api_key 排除選擇。siteWeightMultipliers 清空傳 {}，非法 JSON 阻止保存。行動版選取、批次 metadata／tag 篩選及逐 key 概覽。 |
| P1-5 程式日誌 | 保留真實事件分類；伺服器 limit/offset 分頁、type/unread 篩選、任務結果判定。已讀操作保留已載入的頁面範圍，局部搜尋明示其範圍。 |
| P1-6 使用日誌 | 移除合成 HTTP200／端點／trace header；修復重複分頁與二次篩選。真實 detail／billing／串流／首 byte 欄位；capture／targets／retention／attempt 診斷；手動／自動刷新。摘要明示 all-status 範圍，翻頁不重跑 meta 聚合；日期上界使用下一個本地午夜（exclusive）。 |
| P1-7 監控 | 真實 title/modelPattern、頻道／冷卻／失敗數、近期失敗請求與 health refresh(wait:true)；失敗不顯示成功。 |
| P1-8 公告 | 使用 content/readAt/firstSeenAt/lastSeenAt；安全 Markdown/HTML 內容展示；讀後重新載入；focus 深連結採 500 筆批次、有界自動搜尋及手動繼續。 |
| 帳號／token／站點 | 既有帳號 editor、批次啟停／刪除／餘額、連線分類、pin/order、模型管理；token editor/group discovery/search/filter/batch；站點系統代理批次、pin/order、模型選擇與建立後接續帳號入口。 |
| 操練場 | 將舊 ModelTester 抽成共享 domain component，兩個 UI 復用同一套多輪／edit/replay／串流／Stop／job cancellation／session／file replay／embeddings/search/images/edit/videos/custom/debug。主機注入 auth/語言/toast；樣式限定在 tester 範圍。離頁中止串流，但不刪除可恢復的背景 job。 |
| 簽到 | cron／interval-hours 模式讀寫，1–24 小時間隔驗證與結構化 failureReason。 |
| 更新／DB／payload | 更新 config、Docker tags/digest、task logs/status、歷史 revision rollback；DB runtime/save/restart 提示、SSL、明確 overwrite；payload visual builder／Codex preset 復用舊純 helper。 |
| 殼層／語言／行動版 | 12 小時 session 到期與跨頁同步；系統主題持續跟隨；通知刷新與權威 unread count、寫入失敗不偽裝已讀；搜尋 focusModel 精確定位；可鍵盤操作且遵守 disabled fieldset 的原生 checkbox Toggle。通知草稿不因語言切換／其他渠道保存消失。 |
| 標準 build | 根目錄 build:web 輸出新版 dist/web 與舊版 dist/web/legacy；/legacy/ 深連結 fallback、router basename、React 去重與 lazy page loading。加入標準新版 typecheck／全部新版測試 runner／fixture browser smoke。 |

### 額外根因修復

操練場的 upstream 401/403 不等於管理者登入失效。新增中立 auth-origin contract 與管理 middleware response marker，兩個 UI 客戶端／共享 tester 使用相同分類；真實 admin rejection 仍清除 session，上游憑證錯誤只呈現實際失敗。也修復旧客戶端在收到串流 headers 後移除 abort 連結、以及過期 session 留下 timeout 的問題。

相關共享檔：`src/server/shared/adminAuthFailure.ts`、`src/server/middleware/auth.ts`、`src/web/api.ts`、新版 `src/lib/client.ts`。

## 驗證結果

以下是最終整合後實際執行結果，不是只引用子任務回報。

| 驗證 | 結果 |
|---|---|
| `npm run test:web:evolution` | Node 71/71、Vitest 92/92 通過。包括 persistence、secret preservation、API payload、OAuth lifecycle、draft/cancel、模型資料、分頁與互動回歸。 |
| `npx vitest run --root . src/web src/server/shared/adminAuthFailure.test.ts src/server/middleware/authOrigin.test.ts src/server/frontendEntry.test.ts` | 151 個檔案；499 通過、2 個既有測試 skipped；0 失敗。 |
| `npm run typecheck:web` | 通過。 |
| `npm run typecheck:web:evolution` | 通過，使用標準 build 的 root React 型別。 |
| `npm run typecheck:web:test` | 通過。 |
| 新 UI `npm run typecheck` | 通過，獨立 package 型別。 |
| `npm run typecheck:desktop` | 通過。 |
| `npm run build:web` | 新版＋舊版建置皆通過。新版入口 JS 約 470.75 kB（gzip 141.27 kB）；保留的舊版 VChart vendor 仍有 >500 kB 警告。 |
| `npm run smoke:web:evolution` | 真正 Chromium 載入建置後 17 個新版頁面；通知配置保存＋reload、WebDAV 密碼保留＋reload、精確模型定位、EN/繁中/簡中切換、跟隨系統 theme、mobile key batch selection/nav、session expiry、legacy deep link 全通過；無 page errors。 |
| `npm run repo:drift-check` | 0 violations、0 tracked debt。 |
| `git diff --check` | 通過。 |

Browser smoke 使用隨機本機 port 的 fixture HTTP server。沒有連線真實後端／上游、沒有發送真實 deploy／rollback／factory-reset／DB migrate／credential import。腳本為 `scripts/dev/smoke-evolution-ui.mjs`；可使用系統 Google Chrome，或 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` 指定 browser；沒有 browser 時需先 `npx playwright install chromium`。

### 全倉庫 server 編譯阻塞已解除（後續修復）

使用者後續要求修復的 4 個既有錯誤已於 2026-10-08 解除：

- 新增中立 `src/server/services/siteConcurrencyContract.ts`，承載真實 `SiteConcurrencyLimitError`／`SiteConcurrencyLimitReason`／`ProxySiteLease` 契約；兩個輔助模組不再引用目前 coordinator 尚未提供的 export。
- Response wrapper 將串流活動傳給 lease 的 `touch()`，由 lease 擁有 keepalive 節流，不依賴不存在的 `config.proxySiteConcurrencyLeaseKeepaliveMs`；沒有新增假的設定或 no-op coordinator。
- 補上 EOF、bodyless、source error、consumer cancel、pending-read abort、pre-aborted request、503/Retry-After、斷線 listener 清除與中立契約架構測試。

後續實際驗證：`npm run typecheck`（全部五個階段）與完整 `npm run build`（新版／舊版 Web、server、desktop）通過。`npm test`：484 個檔案通過、1 個檔案 skipped；2853 個測試通過、8 skipped，0 失敗。新版獨立回歸仍為 Node 71/71＋Vitest 92/92。`repo:drift-check` 與 `git diff --check` 通過。全測試輸出含既有故障注入／mock 的 stderr 診斷，但沒有失敗測試。

範圍說明：目前主線沒有呼叫這兩個站點併發輔助模組的代理流程；本次修復其可編譯契約與可驗證生命週期，不代表已合入另一條分支的完整站點限流、schema 或路由整合。没有執行正式 Docker image 建置或部署。


## 驗收限制與沒有捏造的能力

- 尚未使用真實上游帳號完成 OAuth consent、模型 probe、圖片／影片、WebDAV、DB migration 或部署 helper 的端到端測試。
- 後端不供應模型 context length、通知 per-channel event routing／delivery history；UI 不再顯示假的數據或假的可編輯能力。
- Event 搜尋／結果篩選是已載入範圍；type/unread/offset 為伺服器篩選。公告筆數為已載入範圍；深連結超過有界掃描可手動繼續。
- 自訂 dashboard site/day 支援 calls/spend/tokens；success/latency ranking／trend 僅在後端供應的預設 scope 可用。
- Debug body/capture 從未保存的內容不可能事後重建；沒有替代為模板成功回應。
- Token 建立保留目前手動 token 工作流並增加 group discovery，不宣稱新加了所有上游 quota/IP/expiry token issuance wizard。
- 共享操練場樣式使用現代 browser 的 CSS @scope，已在 Chromium 驗證；沒有做全部 browser 的視覺兼容驗收。
- 三語互動 smoke 與新增 controls 的字典／域內翻譯回歸通過，但不宣稱所有 server-provided 文字或每個動態 data field 已被翻譯。

## 重跑命令

```bash
npm run test:web:evolution
npm run typecheck:web:evolution
npm run build:web
npm run smoke:web:evolution
npm run repo:drift-check
```

啟動本地介面可用 `npm run dev`。新版位於 `/app/dashboard`，建置部署保留 `/legacy/` 參照入口。尚未執行正式部署。
