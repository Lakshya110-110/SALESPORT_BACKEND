# SalesPort — Web (Next.js)

Production web console for the SalesPort CRM. Next.js 14 App Router + TypeScript + Tailwind + TanStack Query.

## Prerequisites

- **Node.js 20 LTS** (or 22). Install from https://nodejs.org — check "Add to PATH".
- The Django backend running locally: `cd ../backend && DB_ENGINE=sqlite python manage.py runserver 127.0.0.1:8000` (see `../salesport_backend/README.md`).

## Run

```bash
# From D:\lakshya\CRM\web
cp .env.local.example .env.local     # or use the default (points at localhost:8000)
npm install
npm run dev                          # http://localhost:3000
```

Open http://localhost:3000 — you'll land on the phone → OTP login. Sign in with **9876543210** (admin phone from the seed).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Next dev server, port 3000, HMR |
| `npm run build` | Production build |
| `npm start` | Serve the built app, port 3000 |
| `npm run lint` | ESLint (next/core-web-vitals) |
| `npm run typecheck` | TypeScript strict check |

## Layout

```
web/
├── src/
│   ├── app/                        # App Router
│   │   ├── layout.tsx              # root: fonts + <Providers>
│   │   ├── providers.tsx           # QueryClient + theme boot
│   │   ├── globals.css             # imports tokens.css + Tailwind + scrollbar
│   │   ├── fonts.ts                # next/font/google — Sora + Inter + JetBrains Mono
│   │   ├── page.tsx                # index — redirect to /login or /dashboard
│   │   ├── (auth)/
│   │   │   ├── layout.tsx
│   │   │   └── login/page.tsx      # phone → OTP login (split panel)
│   │   └── (app)/
│   │       ├── layout.tsx          # AppShell = Rail + main
│   │       └── dashboard/page.tsx  # placeholder (Phase 3 replaces it)
│   ├── components/
│   │   ├── ui/                     # design system primitives
│   │   │   ├── Button.tsx          # §09 buttons — primary/secondary/outline/ghost/danger/success/warning + md/sm/icon
│   │   │   ├── Input.tsx           # §10 input with label/help/error
│   │   │   ├── PhoneField.tsx      # §10 +91 prefixed input
│   │   │   ├── OtpBoxes.tsx        # §10 6-digit OTP row w/ paste + auto-advance
│   │   │   └── ThemeToggle.tsx     # toggles body.dark, persists sp_theme
│   │   ├── shell/
│   │   │   ├── Rail.tsx            # A-11 collapsible icon rail (250 / 72)
│   │   │   ├── SectionHeader.tsx   # A-12 sticky topbar with shadow-on-scroll
│   │   │   └── AppShell.tsx        # Rail + main + auth guard
│   │   └── auth/
│   │       └── LoginPanel.tsx      # phone → OTP mutations against /api/auth/
│   ├── lib/
│   │   ├── api/
│   │   │   ├── client.ts           # fetch wrapper + 401 refresh retry
│   │   │   ├── endpoints.ts        # typed per-resource endpoint helpers
│   │   │   └── types.ts            # DRF response shapes
│   │   ├── auth/
│   │   │   └── session.ts          # localStorage-backed session (sp_access/refresh/user)
│   │   └── utils/
│   │       └── cn.ts               # clsx + tailwind-merge
│   └── styles/
│       └── tokens.css              # design system tokens (::root + body.dark)
├── tailwind.config.ts              # theme extend that references tokens
├── postcss.config.mjs
├── next.config.mjs
├── tsconfig.json
├── .env.local.example
└── package.json
```

## Design system

Every color, radius, shadow, and font here reads from `src/styles/tokens.css`, which mirrors [`../SalesPort_CRM_Design_System.html`](../SalesPort_CRM_Design_System.html). Do not hardcode hexes in components — use Tailwind classes that resolve to CSS variables (`bg-primary`, `text-subtle`, `rounded-card`, `shadow-sm`, `font-display`).

Dark mode swaps on `body.dark`. `<Providers>` boots the persisted theme from `localStorage["sp_theme"]` (falls back to `prefers-color-scheme`).

## What's built (Phase 2)

- ✅ Root shell (fonts, providers, tokens, dynamic scrollbar, focus-visible ring)
- ✅ Phone → OTP admin login against `/api/auth/request-otp/` + `/verify-otp/`
- ✅ AppShell with client-side auth guard, redirects to `/login` on missing token
- ✅ Collapsible icon rail (A-11) with 5 nav groups, admin-only Admin group, logout
- ✅ Sticky section header (A-12) with search field, notification bell, theme toggle
- ✅ Dashboard placeholder wired to `GET /api/dashboard/`

## What's next

- **Phase 3** — real Dashboard: KPIs, pipeline-by-stage, consultant leaderboard, charts, staggered entrance
- **Phase 4** — Enquiries list + detail (the core), with filter engine, calendar picker, negotiation viz
- **Phase 5** — remaining modules (Meetings, Proposals, Companies, Contacts, Users, Master Data, Reports, Notifications)
