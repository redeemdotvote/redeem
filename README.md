# Redeem — the record layer for Robinhood Stock Tokens

Redeem maintains a verifiable record of official Stock Token share-equivalents, holder intent and
redemption demand on Robinhood Chain (chain id 4663) — before shareholder rights come onchain.
Stock Tokens provide economic exposure today; voting and in-kind redemption are on the issuer's
roadmap. Redeem records intent (never a shareholder vote), keeps correct multiplier-aware
share-equivalent accounting, and packages redemption readiness per ticker.

Light theme is the default; dark is a toggle in the header and is remembered.

## What is in the box

| Route | What it does |
|-------|--------------|
| `/` | Hero with a live record snapshot, record strip, tape, infrastructure status, the Record Book with inspector, corporate actions, the share-equivalent calculation, how it works, beneficial ownership, trust matrix |
| `/record` | The Record Book: every official token as a ledger row (raw supply, multiplier, share-eq, value, queue, last action) with a side inspector |
| `/record/:symbol` | One security record: share-equivalents recorded, ownership rule, multiplier ledger + chart, intent events, your position |
| `/markets` | Security master: ticker, sector, official contract, price, multiplier, share-eq, latest action |
| `/portfolio` | Your record (or any address via `?address=`): positions ledger with raw vs share-eq, intent and queue, signed intents, certified statements |
| `/intents`, `/intents/:id` | Proxy items on file; sign an EIP-712 intent (for / against / abstain / delegate); public distribution labelled INTENT · NOT A SHAREHOLDER VOTE |
| `/receipts/:id` | One signed intent, re-verified, with its Merkle proof once attested |
| `/redeem` | Redemption readiness: per-ticker queues, acknowledgements, terms hash, window status (not open) |
| `/developers` | The REST API (`/api/v1/...`) |
| `/how-it-works`, `/transparency` | The mechanism, accounting, precedent, what Redeem is not, FAQ, sources, attestations, indexer |

## How an intent works

1. Ballots come from each issuer's DEF 14A on SEC EDGAR (`packages/web/scripts/ingest-proxies.py`).
2. When a holder signs, the server reads `balanceOf` × `uiMultiplier` from the token contract and
   pins the block. The browser never supplies its own weight.
3. The holder signs an EIP-712 `BallotInstruction` (domain `Redeem` v1, chain 4663) — for, against,
   abstain or delegate. No gas, no approval, nothing moves. It is intent, not a shareholder vote.
4. The server verifies the signature against the payload it issued and stores both verbatim.
5. At close every weight is re-read; the smaller of signed and held counts. Receipts are hashed
   (keccak256 of a canonical JSON) into a sorted-pair Merkle tree; the root and per-receipt proofs
   are published on the item and on `/transparency`.

The public Robinhood Chain RPC keeps no historical state, so weight is taken at signing time and
re-checked at close, rather than read at the issuer's record date. Every receipt says which block.

## Running it

```bash
bun install
bun run dev          # http://localhost:8080 — API and web from one Vite process
bun run build        # production build
bun run start        # pm2-managed production server (serves packages/web/dist + /api)
bun run typecheck
```

Configuration lives in the root `.env`:

- `DATABASE_URL` — libsql URL. A local file works (`file:/absolute/path/redeem.db`); Turso works with `DATABASE_AUTH_TOKEN`.
- `RPC_URL` — optional comma-separated extra Robinhood Chain RPC endpoints.
- `VITE_WALLETCONNECT_PROJECT_ID` — optional Reown project id; without it, injected wallets still work.
- `OPENAI_API_KEY` — only used by the ingestion script.

Tables are created at boot with idempotent DDL (and added columns are migrated in place); proxy
items are mirrored from `ballots.json`, so a fresh database is ready on the first request.

## REST API

```
GET /api/v1/record                      security master with live multipliers and supply
GET /api/v1/record/:symbol              one security record + corporate actions
GET /api/v1/record/:symbol/multipliers  UIMultiplierUpdated ledger
GET /api/v1/positions/:wallet           raw, multiplier, share-eq, contract check, Chainlink value
GET /api/v1/intents/:itemId/receipts    signed receipts for one proxy item
```

## Data

- `packages/web/src/api/data/stocks.json` — token registry built from Robinhood's asset list
  (`api.robinhood.com/rhj/assets`), SEC EDGAR company data and the Chainlink feed directory.
- `packages/web/src/api/data/ballots.json` — ballots extracted from proxy statements.
  Refresh with `python3 packages/web/scripts/ingest-proxies.py` (needs `OPENAI_API_KEY`).
- `packages/web/public/logos/tokens/` — company logos, one per ticker.
- `packages/web/public/redeem/photos/` — three Creative Commons photographs of Wall Street from
  Wikimedia Commons, used as full-bleed plates. Credits live in `src/web/components/photo.tsx`
  and are printed beside each plate and in the footer.
- Illustrations (archive, multiplier plates, record cards, ownership diagram) are vector components
  under `src/web/components/`; `public/redeem/art/og.jpg` is the social image.

## Alerts, webhooks and scheduled runs

`GET /api/cron/alerts?digest=1` runs once a day from Vercel Cron (the schedule is written into the
Build Output config by `scripts/vercel-build.ts`) and needs `CRON_SECRET`, which Vercel sends as a
bearer token. Any external scheduler can call it more often with the same header. Channels switch on
when their variables exist: `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`; `X_API_KEY`, `X_API_SECRET`,
`X_ACCESS_TOKEN`, `X_ACCESS_SECRET`. Holder webhooks need nothing. `GET /api/v1/alerts/preview`
shows what would be posted without sending it. `REDEEM_TIERS="holder:100000,steward:1000000"`
overrides the webhook thresholds; `PUBLIC_SITE_URL` sets the links in alert text.

Look-through venues live in `src/api/data/venues.json`; refresh them with
`bun scripts/discover-venues.ts` from `packages/web` and commit the result.

## The REDEEM token

The project's official token on Robinhood Chain (chain id 4663):

`0x3473cCcfD7c186aae98CbebBf8388251237D3896`

ERC-20, name "Redeem Inc", symbol `REDEEM`, 18 decimals, fixed supply 1,000,000,000. This is the
only official address. The token has no role in the record: intent weight is the Stock Token's
share-equivalent, and REDEEM does not change tallies, queue positions, record numbers or XP.
`/token` and `GET /api/v1/token` show the same facts, read live from the contract.

## Deploying to Vercel

`packages/web` deploys through the Build Output API: `scripts/vercel-build.ts` runs the Vite
build, bundles `src/vercel-entry.ts` (the whole Hono app behind a Node request handler) into one
function with Bun, and writes the routes: `/api/*` to the function, static files, then
`index.html` for every app route. Project settings: root directory `packages/web`, "include
source files outside the root directory" on (the Vite config reads `__ports.cjs` from the repo
root), install `cd ../.. && bun install`, build `bun scripts/vercel-build.ts`, no framework preset.
Smoke-test the bundle locally with `bun scripts/vercel-serve.ts` after a build.

Environment variables: `RPC_URL`, `VITE_REOWN_PROJECT_ID` (the Reown / WalletConnect project id; `VITE_WALLETCONNECT_PROJECT_ID` is still read as a fallback; add every domain the site runs on to the project's allowlist in the Reown dashboard), and `DATABASE_URL` +
`DATABASE_AUTH_TOKEN` pointing at a Turso database (`libsql://...`). The function is bundled
with the libsql web client, so only remote `libsql:`/`https:` URLs work there; `file:` and
`:memory:` are for local runs under Bun. Schema DDL and the ballot seed run once per database
(markers in `indexer_cursors`), so cold starts cost one read.

## Positioning

Redeem is independent infrastructure. It is not affiliated with Robinhood Markets, Inc., Robinhood
Assets (Jersey) Limited, Say, or any issuer. Stock Tokens provide economic exposure and are not
legal shares today. A recorded intent is not a shareholder vote and not a legal proxy. A queue
request is not a redemption and promises no settlement. Redeem does not custody tokens.
