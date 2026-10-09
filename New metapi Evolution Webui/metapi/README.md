# Metapi · Federated AI Gateway（UI 打包版）

這是從 Design Arena 部署還原的 **Metapi · Federated AI Gateway** 前端專案
（原生成模型：claude-opus-4-7-thinking）。

## 快速開始

```bash
npm install
npm run dev        # 開發模式（含內建 /api mock）
npm run build      # 產出 dist/
npm run preview    # 預覽（同樣含 /api mock）
```

打開 `http://localhost:5173`（dev）或 `http://localhost:4173`（preview）。

## 專案結構

```
metapi/
├── index.html            # 入口（已移除錄製/統計腳本，其餘與線上版一致）
├── vite.config.ts        # Vite + 內建 /api/* mock 中介層（GET/POST/PUT/DELETE）
├── api-data/             # 從線上部署抓取的 9 支 API 快照（sites、accounts、
│                         #   routes、tokens、models、logs、events、monitor、checkins）
├── public/
│   ├── favicon.svg
│   └── assets/           # 原始生產版 JS/CSS bundle（完整 UI 行為）
└── src/                  # 從 bundle 逆向重建的 React/TS 參考源碼（部分）
    ├── i18n/dicts.ts     # 完整三語字典（en / zh-Hant / zh-Hans，500+ keys）
    ├── index.css         # 完整 Tailwind v4 主題（dark/light tokens + 自訂類別）
    ├── lib/              # api、format、adapters 工具（與原版邏輯一致）
    ├── contexts/         # ThemeContext（dark/light）、LangContext（三語）
    └── components/       # Sidebar、TopBar、NotificationBell、PageHeader、
                          #   Sparkline、StatusDot、Loading、EditDrawer、
                          #   LangSwitcher、ThemeToggle、NavLink
```

## 說明

- **public/assets/** 內的 bundle 就是線上版本尊：`npm run preview` 後所見
  與原部署完全一致（著色系統、三語切換、12 個頁面、ticker、互動抽屜等）。
- `vite.config.ts` 的中介層讓 `/api/*` 在本地可用：GET 回傳快照資料，
  POST/PUT/DELETE 會在記憶體中修改 sites / accounts / tokens / routes
  （重啟即還原）。要上真後端時，把這些請求指向你的 Metapi 服務即可。
- **src/ 是重建中的源碼**：外殼層（provider、layout 組件、樣式、i18n、
  共用組件）已完整重建且與原版行為一致；12 個 pages 尚未全部還原，
  不能直接 import 取代 bundle。若要把 src/ 扶正成真正的源碼樹，
  建議以原 bundle 為基準逐頁對照（bundle 中保留了
  `data-source-loc="src/xxx.tsx:行:列"` 標註，可精確定位每個元件的原始結構）。

## 介面一覽

| 路由 | 頁面 |
| --- | --- |
| `/` | Landing（品牌首頁） |
| `/app` | Dashboard 儀表板 |
| `/app/marketplace` | 模型廣場 |
| `/app/routes` | 智能路由 |
| `/app/sites` `/app/accounts` `/app/tokens` | 聯邦：站點 / 帳號 / 令牌 |
| `/app/logs` `/app/monitor` `/app/checkins` | 觀測：日誌 / 監控 / 簽到 |
| `/app/playground` | 操練場 |
| `/app/settings` | 設定 |

主題：dark / light（`html[data-theme]`），語言：en / 繁體中文 / 简体中文
（localStorage 持久化，keys 為 `metapi.theme`、`metapi.lang`）。
