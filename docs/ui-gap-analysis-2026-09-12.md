# 新 UI 八頁 vs 舊 UI 功能對比缺口清單

**建立日期：** 2026-09-12
**目的：** 逐一對比新 UI（`New metapi Evolution Webui/metapi/src/pages/`）與舊 UI（`src/web/pages/`）同名頁面，列出缺少的功能，作為補齊藍圖。
**狀態欄：** ✅ 已有 / ⬜ 缺少 / 🔶 部分

---

## 1. DownstreamKeys（下游密鑰）

### 舊 UI 功能
- 新增/編輯/刪除下游密鑰（含確認刪除單個/批量）
- 名稱、下游密鑰（+ 隨機產生）、主分組、請求額度、成本額度、過期時間、立即啟用、備註說明、標籤
- 進階：站點倍率 JSON、模型白名單（搜尋+全選）、群組/模型模式白名單（搜尋+regex）、排除站點、排除 API Key/令牌
- 篩選：關鍵字（含 `/regex/` 語法）+ inline tags、狀態、分組
- 列表：狀態徽章、tag chips、額度、最近使用、名稱模糊搜尋
- 批量操作：啟用/停用/刪除/重置用量/更新元資料（分組+標籤操作）
- 摘要：總計、作廢/逾期、總用量、用量趨勢圖
- 每個 key：顯示完整 key、複製

### 新 UI 現況
- ✅ 基本欄位（名稱、key+隨機、主分組、額度、時間、啟用、備註、標籤、scopes）
- ✅ 進階區（站點倍率 JSON、模型白名單、群組路由白名單、排除站點、排除憑證 notice）
- ✅ REVEAL/COPY + Toast
- ✅ **批量操作**（選取 → 批次啟用/停用/重置用量/刪除 + 清除選取）
- ✅ **刪除確認**（單個 + 批量：modal 確認）
- ✅ 狀態篩選（group/status）
- 🔶 用量趨勢圖（Sparkline + 柱狀，可接受）
- 🔶 分組/標籤操作批量 UI 簡化

---

## 2. OAuth 管理

### 舊 UI 功能
- Provider 卡片/選擇（platform、requiresProjectId、enabled、loginType）
- 連線表格：帳號/信箱、站點、狀態、Usage/Quota（官方/響應頭推斷）、代理/專案
- 篩選：provider、狀態、站點、搜尋（含 models preview、accountKey、projectId）
- 每行操作：rebind、proxy 設定、刪除、檢視模型
- Drawer：create/rebind/proxy
  - create：provider 選擇、Project ID（可選）、代理設定（system proxy / custom proxy URL）、啟動 OAuth popup 登入
  - proxy：system proxy toggle、custom proxy URL
- OAuth 登入流程：`openOAuthPopup`（popup 540x760）、手動 callback URL、授權碼交換
- 配額：5h + 7d 窗口（官方/推斷）、批次刷新、單個刷新
- Route units：建立（name + strategy round_robin / stick_until_unavailable）、合併選中連線、拆分、membership
- 批量：多選 → 合併進 route unit / 批次刪除 / quota batch refresh
- 匯入：拖拽/paste JSON（sub2api 格式檢測、JWT 解析 email/accountKey/expiry）、批次匯入、每項預覽/狀態
- Models modal：每個連線的模型清單
- 欄位可見度選單（showColumnMenu）

### 新 UI 現況
- ✅ Provider cards（有 status/connection count）
- ✅ 連線表格（account、provider、status、quota、route units、last refresh）
- ✅ 篩選（provider、status、搜尋）+ REBIND/PROXY 按鈕
- ✅ **Site Base URL / Project ID / 代理設定**（system proxy + custom proxy URL per connection）— 使用者指出後已補齊
- ✅ **連線多選 + 批次刷新配額 / 批次合併進 Route Unit / 清除選取**
- ✅ **每行 REFRESH QUOTA**
- ✅ **Route Unit 建立**（名稱 + round_robin/sticky 策略）+ 卡片顯示策略
- ✅ **匯入**（貼上 JSON → PREVIEW IMPORT → 逐項解析 email/provider/valid + APPLY IMPORT）
- ⬜ 真正的 OAuth popup 登入流程 + 手動 callback（目前 create 是流程說明）
- ⬜ Quota 5h/7d 窗口（目前只有靜態 quota bar）
- ⬜ Route Unit 合併/拆分既有連線（目前建立全新 unit，串接既有連線尚未做）
- ⬜ Models modal（每個連線的模型清單）
- ⬜ 欄位可見度選單（showColumnMenu）

---

## 3. 站點公告 SiteAnnouncements

### 舊 UI 功能
- 公告列表：等級（info/maintenance/security/release）、未讀標記、來源、發布時間
- 操作：刷新（同步任務）、全部標記已讀、清空公告、單條標記已讀
- 未讀計數 / 狀態顯示
- 同步採「任務」模式（啟動同步任務、顯示進行中/成功）

### 新 UI 現況
- ✅ 公告卡片（等級 chip、UNREAD、來源、時間）
- ✅ MARK ALL READ、SYNC、單條 MARK READ
- ✅ 未讀/級別統計卡 + 搜尋 + 等級篩選
- ✅ **清空公告**（CLEAR ALL）
- 🔶 同步回饋（新 UI 是 inline flash，舊版有任務狀態顯示）

---

## 4. 程序日誌 ProgramLogs

### 舊 UI 功能
- 事件列表：類型（代理/令牌/餘額/資訊/站點公告/簽到）、狀態（成功/失敗/警告/跳過/進行中/已開始/已完成）
- 篩選：全部類型、狀態、搜尋
- 操作：標記已讀、全部標記已讀、清空日誌、載入更多（無限滾動）
- 未讀計數

### 新 UI 現況
- ✅ 事件卡片（statusLabel chip、type tag、UNREAD、時間）
- ✅ MARK ALL READ、CLEAR ALL、READ、搜尋 + 類型/狀態篩選
- ✅ **無限滾動「載入更多」**（LOAD MORE，分批顯示）
- 🔶 事件類型標籤：新 UI 用 oauth/key/announcement/system/export，舊版用 代理/令牌/餘額/站點公告/簽到（語意對應）

---

## 5. 匯入匯出 ImportExport

### 舊 UI 功能
- 匯出：選擇範圍（all / connections+routes / 系統設定）、匯出 JSON
- 匯入：拖拽或貼上 JSON、解析摘要（sections、記錄數）、確認覆寫（保留本機日誌/公告/快取/統計）
- WebDAV：URL/使用者/密碼、位移選項、確認、手動 push/pull、autorad同步 cron
- 狀態：已同步/尚未同步、上次錯誤
- 支援舊格式：ALL-API-Hub V2、legacy

### 新 UI 現況
- ✅ 匯出範圍選擇 + JSON 下載
- ✅ 匯入 drop zone + 預覽摘要 + 套用
- ✅ WebDAV 設定 drawer（URL/user/password/export type/auto-sync cron）
- ✅ **WebDAV 立即匯出/拉取動作 + 同步狀態顯示**
- ✅ **匯入覆寫警告 + 確認步驟（保留本機日誌/公告/快取/統計）**
- ✅ **legacy sub2api / ALL-API-Hub V2 格式檢測**
- 🔶 匯入後實際合併資料（目前僅 prototype 提示）

---

## 6. 通知設定 NotificationSettings

### 舊 UI 功能
- 冷卻秒數（notifyCooldownSec）— 全局
- 5 張渠道卡片：
  - **Webhook & Bark**（一卡兩通道）：webhookEnabled/webhookUrl、barkEnabled/barkUrl
  - **Server酱 (SendKey)**：serverChanEnabled + key（留空不改）
  - **Telegram Bot**：telegramEnabled、telegramApiBaseUrl、telegramChatId、telegramUseSystemProxy、telegramMessageThreadId、bot token
  - **SMTP**：smtpEnabled、smtpHost、smtpPort、smtpSecure、smtpUser、smtpPass、smtpFrom、smtpTo
- 全局按鈕：保存通知設置、發送測試通知

### 新 UI 現況
- ✅ 5 渠道卡片（webhook/bark/serverchan/telegram/smtp）+ 啟用/停用 + CONFIGURE drawer + TEST
- ✅ 事件類型選擇、上次送達狀態
- ✅ **全局冷卻秒數欄位**（notifyCooldownSec）
- 🔶 每卡 TEST（舊版全局發送，新 UI 每卡有 TEST，更好）
- 🔶 Telegram 進階欄位（API base URL、thread id、use system proxy）在 drawer 中

---

## 7. 模型廣場 Models

### 舊 UI 功能
- 品牌/供應商歸類、品牌篩選（全部品牌）
- 搜尋模型（名稱片段）
- 排序：低延遲、成功率、名稱
- 卡片/表格視圖切換
- 每模型：品牌、描述、標籤、能力、價格（輸入/輸出 per M）、上下文、平均延遲、成功率、帳號數、令牌數、接口能力
- 去重帳號數（唯一帳號）
- 複製模型名
- 刷新模型廣場（已開始刷新）
- 計費方式分組（分組計費）

### 新 UI 現況
- ✅ 模型卡片（provider、family、status、modalities、capabilities、input/output 價格、context、site overrides）
- ✅ 搜尋 + provider/status 篩選
- ✅ 統計卡（models/available、preview、providers、sites）
- ✅ **排序**（名稱/帳號數/成功率/延遲 + 升降序）
- ✅ **卡片/表格視圖切換**
- ✅ **帳號數/令牌數/延遲/成功率** 顯示（卡片 + 表格）
- ✅ **複製模型名**（+ Toast）
- ✅ **刷新模型廣場** 動作
- ✅ **品牌分組歸類**（含「其他」）
- 🔶 分組計費（groupPricing）未實作（原型資料簡化）

---

## 8. 關於 About

### 舊 UI 功能
- 品牌標語：「中转站的中转站」+ 說明（聚合 New API/One API/OneHub 等）
- 核心特色：統一代理網關、自動模型發現、智能路由引擎、多站點聚合、自動簽到、多渠道告警
- 技術棧：React（用戶界面庫）、Tailwind（原子化樣式）、TypeScript（端到端型別安全）、SQLite/ORM（輕量嵌入式資料庫）
- 數據與隱私：完全自託管、本地 SQLite、不向第三方發送數據、代理請求直連
- 項目連結：模型廣場、自動簽到、統一代理網關、智能路由引擎、多站點聚合、多渠道告警、輕量部署、自動模型發現
- 版本資訊

### 新 UI 現況
- ✅ 品牌 hero（productName、tagline、version、license、build、released）
- ✅ 能力 cards、技術棧表格、資源連結、版本紀錄
- ✅ **數據與隱私區塊**（自託管、本地 SQLite、不發送第三方）
- 🔶 核心特色詳述（新 UI 能力 cards 較精簡）
- 🔶 項目連結（新 UI resources 有 repo/releases/docs）