# web

Unified server — the Hono/oRPC API under `/api` and the React frontend from one process.

- API: `src/api` (routes in `src/api/routes`, chain reads in `src/api/chain`, ballots in `src/api/ballots`)
- Web: `src/web` (pages in `src/web/pages`, hooks in `src/web/queries`)
- Data: `src/api/data/stocks.json`, `src/api/data/ballots.json`
- Scripts: `scripts/ingest-proxies.py` (rebuild ballots from EDGAR), `scripts/verify-flows.ts` (offline signing + Merkle check)

```bash
bun run dev        # from the repo root
bun run typecheck
bun run build
```
