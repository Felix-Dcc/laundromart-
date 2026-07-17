# Project Structure Overview

LaundroMart is a monorepo with three applications sharing one API: a React
Native mobile app (customers, riders, providers), a React web dashboard
(admins / super admins), and a Node.js backend.

## 📁 Directory Organization

```
laundry-management-system/
│
├── 📱 mobile/                     # React Native (Expo SDK 54) mobile app
│   ├── src/
│   │   ├── api/                  # Axios client (env-driven base URL)
│   │   ├── components/           # Reusable UI (GlassCard, BrandLogo,
│   │   │                         #   LiveRiderMap, StatusTimeline, …)
│   │   ├── context/              # AuthContext, NotificationContext
│   │   ├── navigation/           # App/User/Rider/Provider/Admin navigators
│   │   ├── screens/              # auth/ user/ rider/ provider/ admin/ common/
│   │   ├── services/             # realtime (Socket.IO client), location, …
│   │   ├── theme/                # colors.js (incl. brand palette)
│   │   └── utils/
│   ├── assets/                   # Brand icons, splash, logos (generated —
│   │                             #   see scripts/brand/generate_icons.py)
│   ├── scripts/
│   │   ├── preflight.js          # Store-submission checks (npm run preflight)
│   │   └── brand/                # Icon/wordmark generator
│   ├── App.js
│   ├── app.config.js             # Expo config — reads env, guards prod builds
│   ├── eas.json                  # EAS build/submit profiles
│   └── package.json
│
├── 🔧 backend/                    # Node.js / Express REST API + Socket.IO
│   ├── prisma/
│   │   ├── migrations/           # Migration history
│   │   ├── schema.prisma         # Database schema (PostgreSQL)
│   │   └── seed.js               # Seed / demo data
│   ├── src/
│   │   ├── config/               # Env-driven config (fail-fast validation)
│   │   ├── lib/                  # prisma, logger, redis (optional), orderShape
│   │   ├── middleware/           # auth (JWT + roles)
│   │   ├── routes/               # auth, orders, payments, rider, provider,
│   │   │                         #   superadmin, support, analytics, …
│   │   ├── services/             # orderStateMachine + orderService (single
│   │   │                         #   source of truth for order status),
│   │   │                         #   dispatch, payment, promo, realtime, …
│   │   └── index.js              # Entry point
│   ├── Dockerfile                # Production image (non-root, healthcheck)
│   ├── docker-entrypoint.sh      # Applies schema (prisma db push), starts API
│   ├── railway.json              # Railway deploy config
│   ├── ecosystem.config.js       # PM2 config (non-Docker deploys)
│   └── env.example
│
├── 🖥️ admin-web/                  # React (Vite) super-admin dashboard
│   └── src/
│       ├── pages/                # Dashboard, LiveOps, Orders, Users,
│       │                         #   Providers, Riders, Payments, Analytics,
│       │                         #   Promotions, Security, Support, …
│       ├── components/           # Sidebar, Topbar, Layout, ui kit
│       ├── context/              # Auth, Theme
│       ├── api/  lib/            # API client, socket
│       └── styles.css            # Design system (light/dark)
│
├── 🌐 nginx/                      # Reverse proxy (self-hosted Docker deploys)
│   ├── conf.d/laundromat.conf    #   HTTP config + ACME webroot
│   ├── conf.d/*.ssl.conf.example #   Production TLS template
│   └── certs/                    #   TLS certs mounted here (never committed)
│
├── ⚙️ .github/workflows/ci.yml   # CI pipeline
├── 📜 scripts/backup-db.sh       # Database backup helper
├── 🐳 docker-compose.yml          # Postgres + Redis + API + nginx stack
├── 📄 DEPLOYMENT.md               # Deployment guide (Docker, PM2, TLS)
├── 📄 README.md                   # Main project documentation
├── 📄 PROJECT_STRUCTURE.md        # This file
└── 📄 .gitignore
```

## 🗂️ Key Directories

### `/mobile`
React Native app for the three field roles — customer, rider, provider — plus a
lightweight admin view. Glassmorphism UI, live GPS rider tracking on Google
Maps, push notifications, verified-weight pricing flow, Paystack payments.
Built and shipped with EAS (`npm run build:production` runs preflight first).

### `/backend`
Express API with Socket.IO real-time layer. PostgreSQL via Prisma. All order
status changes flow through the state-machine service (`orderStateMachine.js`
+ `orderService.js`) — never write order status directly. JWT auth with
rotating refresh tokens, RBAC (user / rider / provider / admin / superadmin),
rate limiting, audit logging, TOTP 2FA for admins.

### `/admin-web`
Vite + React dashboard for platform governance: KPIs, live operations map,
order/user/provider/rider management, payments and refunds, promotions,
broadcasts, support ticketing, audit logs, security controls.

## 📋 Conventions

1. **Separation of concerns** — the three apps are independent; the API is the
   only shared surface.
2. **Single source of truth for order state** — the backend state machine owns
   every transition; clients render, never decide.
3. **Environment-driven config** — no secrets or hosts hardcoded; see
   `backend/env.example` and `mobile/.env.example`.
4. **CNG (no native folders)** — `mobile/android`/`ios` are generated at build
   time from `app.config.js`; never commit them.
5. **Brand from one definition** — every icon/logo is generated by
   `mobile/scripts/brand/generate_icons.py`; colors mirror
   `mobile/src/theme/colors.js` (`colors.brand`).

## 🚀 Running & Deploying

- Local development: `npm run backend` and `npm run mobile` from the repo root.
- Store submission checks: `npm run preflight` in `mobile/`.
- Deployment (Docker, Railway, PM2, TLS): see `DEPLOYMENT.md`.
