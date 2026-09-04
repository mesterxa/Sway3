# مساعد الساعات

مساعد تجاري عربي لبائع الساعات؛ الموقع للعرض والطلبات، وتيليغرام للأوامر والمحادثة وإدارة المخزون.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/watch-sales-assistant run dev` — run the Expo mobile/web interface
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `GEMINI_API_KEY` — Gemini API key, kept in Replit Secrets
- Telegram is connected through the Replit Telegram connector; accept the Telegram connection prompt before starting the API.
- Optional env: `TELEGRAM_ARCHIVE_CHAT_ID` for a private Telegram archive, `TELEGRAM_WEB_APP_URL` for the Mini App button

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/api-server/src/telegram.ts` — Telegram polling, Arabic intent routing, media handling, and bot replies
- `artifacts/api-server/src/lib/gemini.ts` — Gemini text and product-media analysis
- `artifacts/api-server/src/lib/product-store.ts` — durable product catalog storage
- `artifacts/api-server/data/products.json` — local catalog data file
- `artifacts/watch-sales-assistant/` — Expo interface for viewing orders, customers, reminders, debts, and inventory
- `lib/api-spec/openapi.yaml` — source of truth for generated API contracts

## Architecture decisions

- Telegram is the command surface; the app interface is intentionally focused on viewing business information and the customer/order experience.
- Gemini is called server-side so the API key never reaches the mobile app or Telegram messages.
- Product media is sent to Gemini inline only when it is at most 8MB, matching the supported integration input limit; the original Telegram file ID is retained for archive/display workflows.
- Product data is kept in a small JSON store for the imported prototype so the current project does not require a database migration.

## Product

 - Arabic Telegram assistant with free-form Gemini conversation
 - Reminders, debts, notes, and memory
 - Add a product by text or by sending an image/video; Gemini proposes the name and description
 - Product listing/deletion commands and inventory synchronization to the app
 - Telegram private archive support for received media

## User preferences

- The user wants Telegram to be the conversation and command channel, not the website.
- The user wants Gemini to understand Arabic conversation and manage products from Telegram.

## Gotchas

- Do not put API keys or Telegram tokens in messages, source files, or logs.
- If the Telegram connector is not accepted, the API still runs but reports Telegram as disconnected.
- A media message without a visible price is still saved, but its product price remains unspecified until the owner sends a price command.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- See `PROJECT_COMPLETION.md` for the continuation roadmap and deferred production hardening.
