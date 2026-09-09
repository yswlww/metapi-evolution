<div align="center">

# Metapi Evolution

**A relay for relays — aggregate scattered AI relay stations into one unified gateway**

Bring together all your New API / One API / OneHub / Done Hub / Veloera / AxonHub / Sub2API sites
into **one API Key, one endpoint** — with automatic model discovery, smart routing, and cost optimization.

[Live Demo](#-live-demo) · [Docs](https://yswlww.github.io/metapi-evolution) · [Quick Start](#-quick-start) · [Download Desktop](https://github.com/yswlww/metapi-evolution/releases) · [Report an Issue](https://github.com/yswlww/metapi-evolution/issues)

<p>
<a href="https://github.com/yswlww/metapi-evolution/releases">
  <img alt="Release" src="https://img.shields.io/github/v/release/yswlww/metapi-evolution?label=Release&logo=github&style=flat">
</a>
<a href="https://github.com/yswlww/metapi-evolution/stargazers">
  <img alt="Stars" src="https://img.shields.io/github/stars/yswlww/metapi-evolution?style=flat&logo=github&label=Stars">
</a>
<a href="https://hub.docker.com/r/kennethww/metapi">
  <img alt="Docker Pulls" src="https://img.shields.io/docker/pulls/kennethww/metapi?style=flat&logo=docker&label=Docker%20Pulls">
</a>
<a href="https://github.com/yswlww/metapi-evolution/actions/workflows/ci.yml">
  <img alt="CI" src="https://img.shields.io/github/actions/workflow/status/yswlww/metapi-evolution/ci.yml?branch=main&label=CI&logo=github&style=flat">
</a>
<a href="LICENSE">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-brightgreen?style=flat">
</a>
<img alt="Node.js" src="https://img.shields.io/badge/Node.js-25%2B-339933?logo=node.js&style=flat">
<img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-6.x-3178C6?logo=typescript&style=flat">
<a href="https://zeabur.com/templates/DOX5PR">
  <img alt="Deploy on Zeabur" src="https://zeabur.com/button.svg" height="28">
</a>
<a href="https://render.com/deploy?repo=https://github.com/yswlww/metapi-evolution">
  <img alt="Deploy to Render" src="https://render.com/images/deploy-to-render-button.svg" height="28">
</a>
</p>

<p align="center">
  <a href="README.md">中文</a> |
  <a href="README_EN.md"><strong>English</strong></a>
</p>

</div>

---

## 🌐 Live Demo

> Try Metapi Evolution without deploying — full-featured demo instance:

| | |
|---|---|
| 🔗 **Demo URL** | [metapi-t9od.onrender.com](https://metapi-t9od.onrender.com/) |
| 🔑 **Admin Token** | `123456` |

> **⚠️ Security Notice**: This is a public demo. **Do NOT enter any real API keys, credentials, or site information.** Data may be reset at any time.
> **ℹ️ Note**: Demo runs on Render free tier + OpenRouter free models (only `:free` suffixed models available). First visit may take 30-60s to wake up.

---

## 🤔 Why Metapi Evolution?

The AI ecosystem is seeing a growing number of aggregation relay stations based on New API / One API and similar projects. Managing balances, model lists, and API keys across multiple sites is scattered and time-consuming. **Metapi Evolution acts as the Meta-Aggregation Layer on top of these relay stations**, unifying multiple sites into one endpoint — all downstream tools (Cursor, Claude Code, Codex, Open WebUI, etc.) can seamlessly access all models.

| With multiple relay sites… | How Metapi Evolution Solves It |
| --- | --- |
| 🔑 One key per site, tedious client config | **Unified proxy endpoint + optional per-project downstream keys** — all site models auto-aggregated under `/v1/*` |
| 💸 No idea which site offers the cheapest model | **Smart routing** auto-selects the optimal channel by cost, balance, and usage |
| 🔄 Site goes down, manual switching is a hassle | **Auto-failover** — failed channels cool down and traffic shifts automatically |
| 📊 Balances scattered everywhere | **Centralized dashboard** — at-a-glance overview with low-balance alerts |
| ✅ Daily check-ins across sites | **Auto check-in** — scheduled execution with reward tracking |
| 🤷 Don't know which site has which models | **Auto model discovery** — new upstream models appear with zero config |

**Supported upstreams** go beyond traditional aggregation panels:

- **Aggregation panels**: [New API](https://github.com/QuantumNous/new-api), [One API](https://github.com/songquanpeng/one-api), [OneHub](https://github.com/MartialBE/one-hub), [DoneHub](https://github.com/deanxv/done-hub), [Veloera](https://github.com/Veloera/Veloera), [AnyRouter](https://anyrouter.top), [Sub2API](https://github.com/Wei-Shaw/sub2api), [AxonHub](https://github.com/looplj/axonhub)
- **Generic compatible APIs**: OrcaRouter (OpenAI-compatible API keys), OpenAI / Claude / Gemini compatible endpoints, and `cliproxyapi` / CPA
- **Official presets**: Alibaba Cloud / Zhipu / Doubao Coding Plans, DeepSeek, Moonshot (Kimi), MiniMax, ModelScope
- **OAuth connections**: Codex, Claude, Gemini CLI, Antigravity

<details>
<summary><strong>📊 Screenshots (click to expand)</strong></summary>

<table>
  <tr>
    <td align="center">
      <img src="docs/screenshots/dashboard.png" alt="dashboard" style="width:100%;height:auto;"/>
      <div><b>Dashboard</b> — Balance distribution, spending trends, system overview</div>
    </td>
    <td align="center">
      <img src="docs/screenshots/model-marketplace.png" alt="model-marketplace" style="width:100%;height:auto;"/>
      <div><b>Model Marketplace</b> — Cross-site model coverage, pricing comparison, measured metrics</div>
    </td>
  </tr>
  <tr>
    <td align="center">
      <img src="docs/screenshots/routes.png" alt="routes" style="width:100%;height:auto;"/>
      <div><b>Smart Routing</b> — Multi-channel probability distribution, cost-priority routing</div>
    </td>
    <td align="center">
      <img src="docs/screenshots/accounts.png" alt="accounts" style="width:100%;height:auto;"/>
      <div><b>Account Management</b> — Multi-site multi-account, health state tracking</div>
    </td>
  </tr>
  <tr>
    <td align="center">
      <img src="docs/screenshots/sites.png" alt="sites" style="width:100%;height:auto;"/>
      <div><b>Site Management</b> — Upstream site configuration and status overview</div>
    </td>
    <td align="center">
      <img src="docs/screenshots/tokens.png" alt="tokens" style="width:100%;height:auto;"/>
      <div><b>Token Management</b> — API Token lifecycle management</div>
    </td>
  </tr>
  <tr>
    <td align="center">
      <img src="docs/screenshots/playground.png" alt="playground" style="width:100%;height:auto;"/>
      <div><b>Model Playground</b> — Interactive online model testing</div>
    </td>
    <td align="center">
      <img src="docs/screenshots/checkin.png" alt="checkin" style="width:100%;height:auto;"/>
      <div><b>Check-in Log</b> — Auto check-in status and reward tracking</div>
    </td>
  </tr>
  <tr>
    <td align="center">
      <img src="docs/screenshots/proxy-logs.png" alt="proxy-logs" style="width:100%;height:auto;"/>
      <div><b>Usage Logs</b> — Proxy request logs and cost breakdown</div>
    </td>
    <td align="center">
      <img src="docs/screenshots/monitor.png" alt="monitor" style="width:100%;height:auto;"/>
      <div><b>Availability Monitor</b> — Channel health real-time monitoring</div>
    </td>
  </tr>
  <tr>
    <td align="center">
      <img src="docs/screenshots/settings.png" alt="settings" style="width:100%;height:auto;"/>
      <div><b>System Settings</b> — Global parameters and security configuration</div>
    </td>
    <td align="center">
      <img src="docs/screenshots/notification-settings.png" alt="notification-settings" style="width:100%;height:auto;"/>
      <div><b>Notification Settings</b> — Multi-channel alert and push configuration</div>
    </td>
  </tr>
</table>

</details>

---

## 🚀 Quick Start

<a href="https://zeabur.com/templates/DOX5PR">
  <img alt="Deploy on Zeabur" src="https://zeabur.com/button.svg" height="28">
</a>
<a href="https://render.com/deploy?repo=https://github.com/yswlww/metapi-evolution">
  <img alt="Deploy to Render" src="https://render.com/images/deploy-to-render-button.svg" height="28">
</a>

### Docker Compose (Recommended)

```bash
mkdir metapi && cd metapi

cat > docker-compose.yml << 'EOF'
services:
  metapi:
    image: kennethww/metapi:latest
    ports:
      - "127.0.0.1:${PORT:-4000}:${PORT:-4000}"
    volumes:
      - ./data:/app/data
    environment:
      AUTH_TOKEN: ${AUTH_TOKEN:?AUTH_TOKEN is required}
      PROXY_TOKEN: ${PROXY_TOKEN:?PROXY_TOKEN is required}
      ACCOUNT_CREDENTIAL_SECRET: "${ACCOUNT_CREDENTIAL_SECRET:-}"
      CHECKIN_CRON: "${CHECKIN_CRON:-0 8 * * *}"
      BALANCE_REFRESH_CRON: "${BALANCE_REFRESH_CRON:-0 * * * *}"
      PORT: ${PORT:-4000}
      DATA_DIR: /app/data
      TZ: ${TZ:-Asia/Shanghai}
      NOTIFY_COOLDOWN_SEC: ${NOTIFY_COOLDOWN_SEC:-300}
      ADMIN_IP_ALLOWLIST: "${ADMIN_IP_ALLOWLIST:-}"
      SYSTEM_PROXY_URL: "${SYSTEM_PROXY_URL:-}"
      GEMINI_CLI_CLIENT_ID: "${GEMINI_CLI_CLIENT_ID:-}"
      GEMINI_CLI_CLIENT_SECRET: "${GEMINI_CLI_CLIENT_SECRET:-}"
      ANTIGRAVITY_CLIENT_ID: "${ANTIGRAVITY_CLIENT_ID:-}"
      ANTIGRAVITY_CLIENT_SECRET: "${ANTIGRAVITY_CLIENT_SECRET:-}"
      TELEGRAM_ENABLED: ${TELEGRAM_ENABLED:-false}
      TELEGRAM_BOT_TOKEN: "${TELEGRAM_BOT_TOKEN:-}"
      TELEGRAM_CHAT_ID: "${TELEGRAM_CHAT_ID:-}"
      TELEGRAM_API_BASE_URL: "${TELEGRAM_API_BASE_URL:-}"
      TELEGRAM_MESSAGE_THREAD_ID: "${TELEGRAM_MESSAGE_THREAD_ID:-}"
      TELEGRAM_USE_SYSTEM_PROXY: ${TELEGRAM_USE_SYSTEM_PROXY:-false}
    restart: unless-stopped
EOF

# Set tokens and start
# AUTH_TOKEN = Admin panel login token (enter this value when logging in)
export AUTH_TOKEN=your-admin-token
# PROXY_TOKEN = Token for downstream clients to call /v1/*
export PROXY_TOKEN=your-proxy-sk-token
docker compose up -d
```

<details>
<summary><strong>One-line Docker command</strong></summary>

```bash
docker run -d --name metapi \
  -p 4000:4000 \
  -e AUTH_TOKEN=your-admin-token \
  -e PROXY_TOKEN=your-proxy-sk-token \
  -e TZ=Asia/Shanghai \
  -v ./data:/app/data \
  --restart unless-stopped \
  kennethww/metapi:latest
```

</details>

After starting, visit `http://localhost:4000` and log in with your `AUTH_TOKEN`!

> [!NOTE]
> Docker images support `amd64`, `arm64`, and `armv7l` (`linux/arm/v7`) server deployments.
> Current `armv7l` support is limited to server / Docker usage and does not include Electron desktop packaging support.

<!-- markdownlint-disable-next-line MD028 -->
> [!IMPORTANT]
> Make sure to change `AUTH_TOKEN` and `PROXY_TOKEN` — do not use default values. Data is stored in the `./data` directory and persists across upgrades.

> [!TIP]
> The initial admin token is the `AUTH_TOKEN` configured at startup.
> If running outside Compose without explicitly setting `AUTH_TOKEN`, the default is `change-me-admin-token` (for local debugging only).
> The desktop installer falls into this category on first launch too: if you do not inject `AUTH_TOKEN`, the default admin token is also `change-me-admin-token`.
> If you change the admin token in the Settings panel, use the new token for subsequent logins.

**Desktop app**: download Windows / macOS / Linux installers from [Releases](https://github.com/yswlww/metapi-evolution/releases) — ready out of the box, with a data directory independent from Docker deployments.

For Docker Compose, reverse proxy, upgrades, and database options, see the [Deployment Guide](https://yswlww.github.io/metapi-evolution/deployment).

---

## ✨ Core Features

<details open>
<summary><strong>🌐 Unified Proxy Gateway</strong></summary>

- Compatible with **OpenAI** and **Claude** downstream formats, works with all mainstream clients
- Supports Responses / Chat Completions / Messages / Completions (Legacy) / Embeddings / Images / Models, plus standard `/v1/files`
- Full SSE streaming support with automatic format conversion (OpenAI <-> Claude)

</details>

<details open>
<summary><strong>🧠 Smart Routing Engine</strong></summary>

- Auto-discovers all available models from upstream sites — **zero-config** route table generation
- Four-tier cost signal: **measured cost -> account-configured cost -> catalog reference price -> default fallback**
- Multi-channel probabilistic distribution weighted by cost (40%), balance (30%), and usage (30%)
- Failed channels auto-cool down (default 10-minute cooldown); auto-retry with channel switching on failure
- Routing decisions are visually explainable — every choice is transparent and auditable

</details>

<details open>
<summary><strong>📡 Multi-Platform Aggregation</strong></summary>

| Platform | Adapter | Description |
| --- | --- | --- |
| **New API** | `new-api` | Next-gen LLM gateway |
| **One API** | `one-api` | Classic OpenAI API aggregation |
| **OneHub** | `onehub` | Enhanced One API fork |
| **DoneHub** | `done-hub` | Enhanced OneHub fork |
| **Veloera** | `veloera` | API gateway platform |
| **AxonHub** | `axonhub` | OpenAI-compatible gateway with Responses-first routing |
| **Sub2API** | `sub2api` | Subscription-based relay |
| **OrcaRouter** | `orcarouter` | OpenAI-compatible API key proxy with model discovery |

Adapters cover shared capabilities such as model discovery, balance access, token management, and proxy integration; login, check-in, and user-info flows vary by platform.

</details>

<details open>
<summary><strong>👥 Account & Token Management</strong></summary>

- **Multi-site, multi-account**: Each site supports multiple accounts, each account can hold multiple API tokens
- **Health tracking**: `healthy` / `unhealthy` / `degraded` / `disabled` four-state machine
- **Encrypted credential storage**: All sensitive credentials are encrypted in the local database
- **Auto-renewal**: Tokens are automatically re-authenticated when expired
- **Cascading control**: Disabling a site automatically disables all associated accounts

</details>

<details>
<summary><strong>🏪 Model Marketplace · ✅ Auto Check-in · 💰 Balance Management (click to expand)</strong></summary>

**Model Marketplace**

- Cross-site model coverage overview: which models are available, how many accounts cover them, pricing comparison
- Latency, success rate, and other measured metrics
- Upstream model catalog caching with brand classification (OpenAI, Anthropic, Google, DeepSeek, etc.)
- Interactive model tester for online verification

**Auto Check-in**

- Cron-scheduled automatic check-in (default: daily at 08:00) with smart reward parsing and failure notifications
- Per-account execution with enable/disable control; concurrency locking prevents duplicate check-ins
- Full check-in logging with history queries

**Balance Management**

- Scheduled balance refresh (default: every hour), batch updates for all active accounts
- Income tracking: daily/cumulative income with spending trend analysis
- Balance fallback estimation: infer balance changes from proxy logs when API is unavailable
- Auto re-login on credential expiry

</details>

<details>
<summary><strong>🔔 Alerts & Notifications · 📊 Data Dashboard · 🎮 Model Playground (click to expand)</strong></summary>

**Alerts & Notifications** — five channels:

| Channel | Description |
| --- | --- |
| **Webhook** | Custom HTTP push |
| **Bark** | iOS push notifications |
| **ServerChan** | WeChat notifications |
| **Telegram Bot** | Telegram message notifications |
| **SMTP Email** | Standard email notifications |

Alert scenarios: low balance warning, site/account anomalies, check-in failures, proxy request failures, token expiry reminders, daily summary reports. Alert cooldown mechanism (default: 300 seconds) prevents duplicate notifications.

**Data Dashboard**

- Site balance pie chart, daily spending trend graphs
- Global search (sites, accounts, models)
- System event logs, proxy request logs (model, status, latency, token usage, cost estimation)

**Model Playground**

- Interactive chat testing to instantly verify model availability and response quality
- Select any routed model to compare outputs across different channels
- Streaming / non-streaming dual mode testing

</details>

<details open>
<summary><strong>🏛️ Architecture Overview</strong></summary>

<div align="center">
  <img src="docs/screenshots/metapi-architecture.png" alt="Metapi Evolution: Federated AI Model Aggregation Gateway Architecture" style="max-width: 100%; height: auto;" />
</div>

- **Downstream clients** (Cursor · Claude Code · Codex · Open WebUI, etc.) → `Authorization: Bearer <PROXY_TOKEN>`
- **Metapi Evolution gateway**: unified `/v1` proxy · smart routing · model discovery · format conversion (OpenAI ⇄ Claude) · check-in / balance / alerts / dashboard
- **Upstream platforms**: New API · One API · OneHub · DoneHub · Veloera · AxonHub · Sub2API …

</details>

<details open>
<summary><strong>📦 Lightweight Deployment</strong></summary>

- **Single Docker container** with a default local data directory, plus optional external MySQL / PostgreSQL runtime DB
- Docker images support `amd64`, `arm64`, and `armv7l` (`linux/arm/v7`) server deployments
- Full data import/export for worry-free migration

</details>

---

## 🔧 Client Integration at a Glance

Metapi Evolution exposes standard OpenAI / Claude compatible endpoints. Point any client at two values:

| Setting | Value |
| --- | --- |
| **Base URL** | `http://your-host:4000` (most clients append `/v1` automatically) |
| **API Key** | Your configured `PROXY_TOKEN` |

Main endpoints: `/v1/responses` · `/v1/chat/completions` · `/v1/messages` · `/v1/completions` · `/v1/embeddings` · `/v1/images/generations` · `/v1/files` · `/v1/models`

From **System Settings → Downstream API Key Strategy** you can issue per-project downstream keys with expiry, cost/request limits, model & route allowlists, and site weight multipliers.

For detailed per-client setup (Open WebUI / Cherry Studio / Cursor / Claude Code, etc.), see the [Client Integration Guide](https://yswlww.github.io/metapi-evolution/client-integration).

---

## 🏗️ Tech Stack & Development

| Layer | Technology |
| --- | --- |
| **Backend** | [Fastify](https://fastify.dev) — High-performance Node.js framework |
| **Frontend** | [React 18](https://react.dev) + [Vite](https://vitejs.dev) |
| **Language** | [TypeScript](https://www.typescriptlang.org) — End-to-end type safety |
| **Styling** | [Tailwind CSS v4](https://tailwindcss.com) — Utility-first CSS framework |
| **Database** | SQLite / MySQL / PostgreSQL + [Drizzle ORM](https://orm.drizzle.team) |
| **Charts** | [VChart](https://visactor.io/vchart) (@visactor/react-vchart) |
| **Scheduling** | [node-cron](https://github.com/node-cron/node-cron) |
| **Containerization** | Docker (Debian slim) + Docker Compose |
| **Testing** | [Vitest](https://vitest.dev) |

```bash
npm install               # Install dependencies
npm run db:migrate        # Run database migrations
npm run dev               # Start dev environment (frontend + backend hot reload)

npm run build             # Build frontend + backend
npm run build:web         # Build frontend only (Vite)
npm run build:server      # Build backend only (TypeScript)
npm run dist:desktop:mac:intel  # Build mac Intel (x64) desktop installer
npm test                  # Run all tests (500+ files / 3,100+ cases)
npm run docs:dev          # Preview the docs site locally
```

<details>
<summary><strong>📖 Full documentation index</strong></summary>

| Category | Link | Description |
| --- | --- | --- |
| Quick Start | [getting-started](https://yswlww.github.io/metapi-evolution/getting-started) | Get running in 10 minutes |
| Deployment | [deployment](https://yswlww.github.io/metapi-evolution/deployment) | Compose / reverse proxy / upgrades |
| Configuration | [configuration](https://yswlww.github.io/metapi-evolution/configuration) | All environment variables and routing params |
| Client Integration | [client-integration](https://yswlww.github.io/metapi-evolution/client-integration) | Open WebUI / Cursor, etc. |
| Upstream Integration | [upstream-integration](https://yswlww.github.io/metapi-evolution/upstream-integration) | Per-platform setup |
| FAQ | [faq](https://yswlww.github.io/metapi-evolution/faq) | Common errors and fixes |

The docs source lives in the [`docs/`](docs/) directory; every push to `main` deploys to GitHub Pages automatically.

</details>

---

## 🔒 Data & Privacy

Metapi Evolution is fully self-hosted. All data (accounts, tokens, routes, logs) stays in your own deployment environment. No data is sent to any third party. Proxy requests are transmitted directly between your server and upstream sites only.

---

## 🏛️ Origin and Evolution

### Origin and continuity

`metapi-evolution` is a community-maintained, unofficial independent continuation of [`cita-777/metapi`](https://github.com/cita-777/metapi), not an unrelated restart. This repository preserves the full Git commit history, historical release tags, and contributor records of the original project, and continues under the [MIT License](LICENSE). Copyright notices, attribution, and credit for the original authors and all historical contributors remain preserved and respected. It is not an official continuation endorsed by the original author or upstream repository, and it does not represent the views of the original author or upstream maintainers.

### Independent maintenance and compatibility

This branch is developed independently by community maintainers for their own use cases. [`yswlww/metapi-evolution`](https://github.com/yswlww/metapi-evolution) is the maintenance home for this independent continuation and hosts this branch's ongoing development, issues, pull requests, and releases. The desktop app now ships under an independent identity: application ID `io.github.yswlww.metapi.desktop` and product name `Metapi-Evolution`, with the desktop data directory kept compatible (the legacy `Metapi` data directory is still used). Existing desktop installs do not migrate to the new identity via auto-update and must be upgraded manually. The `kennethww/metapi` Docker image, the `metapi` npm package name, server-side configuration, environment variables, data directories, and upgrade paths are unchanged. Additionally, the legacy and new desktop apps share one data directory, so quit the legacy desktop app (including its tray icon) before launching the new build — otherwise the new instance exits immediately due to the single-instance lock.

### Upstream reference policy

This project evolves independently and does not directly merge upstream branches, pull requests, or commit series. Upstream code and commits are treated only as technical references; any candidate change must be independently assessed for applicability, security, and compatibility, then independently implemented and fully tested before adoption.

---

## 🤝 Contributing

All forms of contribution are welcome!

- 🐛 Report bugs — [Submit an Issue](https://github.com/yswlww/metapi-evolution/issues)
- 💡 Feature suggestions — [Start a Discussion](https://github.com/yswlww/metapi-evolution/issues)
- 🔧 Code contributions — [Submit a Pull Request](https://github.com/yswlww/metapi-evolution/pulls)
- 📝 Contributing guide — [CONTRIBUTING.md](CONTRIBUTING.md)
- 📜 Code of conduct — [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)

---

## 🛡️ Security

If you discover a security issue, please refer to [SECURITY.md](SECURITY.md) and report it privately.

---

## 📜 License

[MIT](LICENSE)

---

## 🙏 Thanks

Thanks to everyone who has contributed code, bug reports, ideas, and real-world feedback to Metapi Evolution. A lot of the product polish in this project came directly from community usage and iteration.

Special thanks to all contributors:

<!-- metapi-contributors:start -->
<p align="left">
  <a href="https://github.com/cita-777"><img src="https://avatars.githubusercontent.com/u/177306803?v=4&s=48" width="48" height="48" alt="cita-777" title="cita-777"/></a> <a href="https://github.com/Hureru"><img src="https://avatars.githubusercontent.com/u/121702350?v=4&s=48" width="48" height="48" alt="Hureru" title="Hureru"/></a> <a href="https://github.com/bnvnvnv"><img src="https://avatars.githubusercontent.com/u/4243616?v=4&s=48" width="48" height="48" alt="bnvnvnv" title="bnvnvnv"/></a> <a href="https://github.com/ksmaze"><img src="https://avatars.githubusercontent.com/u/480916?v=4&s=48" width="48" height="48" alt="ksmaze" title="ksmaze"/></a> <a href="https://github.com/DeliciousBuding"><img src="https://avatars.githubusercontent.com/u/101502465?v=4&s=48" width="48" height="48" alt="DeliciousBuding" title="DeliciousBuding"/></a> <a href="https://github.com/Shinku-Chen"><img src="https://avatars.githubusercontent.com/u/17696928?v=4&s=48" width="48" height="48" alt="Shinku-Chen" title="Shinku-Chen"/></a> <a href="https://github.com/weijiafu14"><img src="https://avatars.githubusercontent.com/u/17469139?v=4&s=48" width="48" height="48" alt="weijiafu14" title="weijiafu14"/></a> <a href="https://github.com/ShicYang"><img src="https://avatars.githubusercontent.com/u/61652316?v=4&s=48" width="48" height="48" alt="ShicYang" title="ShicYang"/></a> <a href="https://github.com/Babylonehy"><img src="https://avatars.githubusercontent.com/u/42328751?v=4&s=48" width="48" height="48" alt="Babylonehy" title="Babylonehy"/></a> <a href="https://github.com/zmoon460"><img src="https://avatars.githubusercontent.com/u/42328751?v=4&s=48" width="48" height="48" alt="zmoon460" title="zmoon460"/></a>
  <a href="https://github.com/Brucents"><img src="https://avatars.githubusercontent.com/u/81791987?v=4&s=48" width="48" height="48" alt="Brucents" title="Brucents"/></a> <a href="https://github.com/ImgBotApp"><img src="https://avatars.githubusercontent.com/u/31427850?v=4&s=48" width="48" height="48" alt="ImgBotApp" title="ImgBotApp"/></a> <a href="https://github.com/Zhou-Ruichen"><img src="https://avatars.githubusercontent.com/u/191002401?v=4&s=48" width="48" height="48" alt="Zhou-Ruichen" title="Zhou-Ruichen"/></a> <a href="https://github.com/nodca"><img src="https://avatars.githubusercontent.com/u/96775880?v=4&s=48" width="48" height="48" alt="nodca" title="nodca"/></a> <a href="https://github.com/puyujian"><img src="https://avatars.githubusercontent.com/u/46592377?v=4&s=48" width="48" height="48" alt="puyujian" title="puyujian"/></a> <a href="https://github.com/rcocco"><img src="https://avatars.githubusercontent.com/u/46603462?v=4&s=48" width="48" height="48" alt="rcocco" title="rcocco"/></a> <a href="https://github.com/xuyufengfei"><img src="https://avatars.githubusercontent.com/u/188047874?v=4&s=48" width="48" height="48" alt="xuyufengfei" title="xuyufengfei"/></a>
</p>
<!-- metapi-contributors:end -->

---

## ⭐ Star History

[![Star History Chart](https://api.star-history.com/svg?repos=yswlww/metapi-evolution&type=date&legend=top-left&v=2)](https://www.star-history.com/#yswlww/metapi-evolution&type=date&legend=top-left)

---

<div align="center">

**If Metapi Evolution helps you, a Star is the best support!**

<sub>Built with love by the AI community</sub>

</div>
