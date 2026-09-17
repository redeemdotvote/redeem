import { useQuery } from "@tanstack/react-query";
import { Page } from "../components/layout";
import { Display, Eyebrow, Mark } from "../components/ui";
import { ChainLine } from "../components/robinhood-chain";

const ENDPOINTS = [
  {
    method: "GET",
    path: "/api/v1/positions/:wallet",
    title: "Position endpoint",
    body: "Every Stock Token a wallet holds: raw balanceOf, uiMultiplier, share-equivalent, the contract's own balanceOfUI() and whether the two agree, plus the Chainlink value where a feed exists.",
    example: `curl -s https://redeem-desktop.vercel.app/api/v1/positions/0x8366a39cc670b4001a1121b8f6a443a643e40951`,
    response: `{
  "chainId": 4663,
  "block": "64986784",
  "wallet": "0x8366…0951",
  "positions": [
    {
      "symbol": "NVDA",
      "contract": "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC",
      "rawBalance": "32161215030000000000000",
      "uiMultiplier": "1000775159164630595",
      "shareEquivalent": "32186147423120170538143",
      "contractBalanceOfUI": "32186147423120170538143",
      "verified": true,
      "priceUsd": 215.13,
      "valueUsd": 6922921.57
    }
  ]
}`,
  },
  {
    method: "GET",
    path: "/api/v1/record/:symbol",
    title: "Record endpoint",
    body: "One security record: official contract, ISIN, price feed, current and pending multiplier, effectiveAt, raw and share-equivalent supply, and every corporate action on file.",
    example: `curl -s https://redeem-desktop.vercel.app/api/v1/record/NVDA`,
    response: `{
  "symbol": "NVDA",
  "issuer": "Robinhood Assets (Jersey) Limited",
  "contract": "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC",
  "uiMultiplier": "1000775159164630595",
  "pendingMultiplier": null,
  "rawSupply": "…",
  "shareEquivalentSupply": "…",
  "corporateActions": [ { "oldMultiplier": "…", "newMultiplier": "…", "effectiveAt": 1789604133, "txHash": "0x…" } ]
}`,
  },
  {
    method: "GET",
    path: "/api/v1/record/:symbol/multipliers",
    title: "Multiplier history",
    body: "The UIMultiplierUpdated ledger for one token — previous ratio, new ratio, effective timestamp, block and transaction — mirrored from chain so it survives a rate-limited RPC.",
    example: `curl -s https://redeem-desktop.vercel.app/api/v1/record/HPE/multipliers`,
    response: `{ "symbol": "HPE", "events": [ { "oldMultiplier": "1000000000000000000", "newMultiplier": "1001716957939304938", "changeBps": 17.16, "effectiveAt": 1789604133 } ] }`,
  },
  {
    method: "GET",
    path: "/api/v1/intents/:itemId/receipts",
    title: "Intent export",
    body: "Every active receipt for one proxy item: wallet, choice, delegate, share-equivalent, block, signature and the EIP-712 payload — enough to recompute the tally and the Merkle root without asking Redeem.",
    example: `curl -s https://redeem-desktop.vercel.app/api/v1/intents/AMC-2026-09-24-1/receipts`,
    response: `{ "itemId": "AMC-2026-09-24-1", "note": "Intent, not a shareholder vote.", "receipts": [ … ] }`,
  },
  {
    method: "GET",
    path: "/api/v1/feed",
    title: "Change feed",
    body: "A JSON Feed of what changed: every UIMultiplierUpdated mirrored from chain and every proxy statement extracted from EDGAR, newest first. Poll it from a bot, a webhook relay or a feed reader. `since` (unix seconds) returns only newer entries; `type=actions` or `type=items` narrows it.",
    example: `curl -s "https://redeem-desktop.vercel.app/api/v1/feed?type=actions&since=1789000000"`,
    response: `{
  "version": "https://jsonfeed.org/version/1.1",
  "title": "Redeem · Stock Token record feed",
  "items": [
    {
      "id": "action:0x…:12",
      "title": "HPE multiplier +0.172%",
      "date_published": "2026-09-16T12:15:33.000Z",
      "tags": ["corporate-action", "HPE"],
      "_redeem": { "type": "action", "symbol": "HPE", "oldMultiplier": "…", "newMultiplier": "…", "changeBps": 17.16, "txHash": "0x…" }
    }
  ]
}`,
  },
  {
    method: "GET",
    path: "/api/v1/badge/:wallet",
    title: "Badge",
    body: "An SVG badge for a README, a profile or a bio page: wallet number, tickers on file, XP and the Season, drawn from the record on every request. Add `?theme=dark` for dark backgrounds. Public data only.",
    example: `<img src="https://redeem-desktop.vercel.app/api/v1/badge/0x8366a39cc670b4001a1121b8f6a443a643e40951" alt="Redeem record" />`,
    response: `<svg width="420" height="96" …>  Wallet #12 · 3 tickers on file · 175 XP · Season 0  </svg>`,
  },
  {
    method: "GET",
    path: "/api/v1/record",
    title: "Security master",
    body: "The whole allowlist with live multipliers and supply — the same read the Record Book is built on.",
    example: `curl -s https://redeem-desktop.vercel.app/api/v1/record`,
    response: `{ "chainId": 4663, "block": "…", "tokens": [ … 194 entries … ] }`,
  },
];

const FUTURE = [
  ["Beneficial ownership adapters", "Vault, lending, LP and nested positions resolved pro rata to holders. The interface is named; the indexers are not live."],
  ["Historical positions", "Balance at a past block once an archive source is available — the public RPC serves current state only."],
  ["On-chain attestation", "Merkle roots written to an attestation contract on Robinhood Chain. Roots are published in the API today."],
];

/** A real call to the record endpoint, rendered as the terminal it is. */
function LiveResponse() {
  const query = useQuery({
    queryKey: ["api-demo", "NVDA"],
    queryFn: async () => {
      const started = performance.now();
      const response = await fetch("/api/v1/record/NVDA");
      const body = (await response.json()) as Record<string, unknown>;
      const actions = Array.isArray(body.corporateActions) ? (body.corporateActions as unknown[]).length : 0;
      const { corporateActions: _dropped, ...rest } = body;
      return { status: response.status, ms: Math.round(performance.now() - started), body: { ...rest, corporateActions: `[${actions} events]` } };
    },
    staleTime: 30_000,
  });
  const lines = query.data ? JSON.stringify(query.data.body, null, 2).split("\n") : [];
  return (
    <div className="rounded-[14px] border border-[#24332b] bg-[#0a100d]/90 shadow-[0_40px_90px_-40px_rgba(0,0,0,0.8)]">
      <div className="flex items-center justify-between gap-4 border-b border-[#1f2c25] px-4 py-2.5">
        <div className="font-mono flex items-center gap-2.5 text-[12.5px] text-[#cfe0d5]">
          <span className="rounded-[5px] bg-[#1c6b4a] px-1.5 py-0.5 text-[10.5px] text-[#e9ede7]">GET</span>
          /api/v1/record/NVDA
        </div>
        <div className="font-mono text-[12px] text-[#8fb3a0]">{query.data ? `${query.data.status} · ${query.data.ms} ms` : query.isError ? "unreachable" : "…"}</div>
      </div>
      <pre className="font-mono max-h-[360px] overflow-auto px-4 py-3 text-[12.5px] leading-[1.6]">
        {lines.length === 0 ? (
          <span className="text-[#6f8a7b]">{query.isError ? "The record endpoint could not be reached." : "reading the record…"}</span>
        ) : (
          lines.map((line, index) => {
            const match = line.match(/^(\s*)"([^"]+)":\s?(.*)$/);
            if (!match) return <div key={index} className="text-[#8fb3a0]">{line}</div>;
            const [, indent, key, value] = match;
            const isString = value?.startsWith('"');
            return (
              <div key={index}>
                <span>{indent}</span>
                <span className="text-[#8fd3b0]">"{key}"</span>
                <span className="text-[#6f8a7b]">: </span>
                <span className={isString ? "text-[#e9ede7]" : "text-[#d9c98a]"}>{value}</span>
              </div>
            );
          })
        )}
      </pre>
    </div>
  );
}

export default function ApiPage() {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return (
    <>
      <section className="chamber relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(60%_60%_at_70%_40%,rgba(31,107,74,0.25),transparent_70%)]" />
        <Page className="relative">
          <div className="grid gap-12 py-16 lg:grid-cols-[minmax(0,0.5fr)_minmax(0,0.5fr)] lg:items-center lg:py-24">
          <div className="max-w-[640px]">
            <div className="eyebrow">Redeem API</div>
            <h1 className="display mt-4 text-[44px] text-[#e9ede7] sm:text-[60px] lg:text-[76px]">
              The Stock Token <span className="italic text-[#8fd3b0]">record layer.</span>
            </h1>
            <p className="mt-6 max-w-[54ch] text-[16px] leading-relaxed text-[#b5c4ba]">
              Plain JSON over GET. No key, no SDK. Every number is read from the contracts on Robinhood Chain through Multicall3 and cached for a few seconds; every intent is returned with the signature that proves it.
            </p>
            <div className="mt-6">
              <ChainLine caption="Every read is from" dark />
            </div>
            <div className="font-mono mt-6 rounded-[12px] border border-[#24332b] bg-[#0f1713] px-4 py-3 text-[13px] text-[#cfe0d5]">
              curl -s {origin || "https://redeem-desktop.vercel.app"}/api/v1/record/NVDA
            </div>
          </div>
          <LiveResponse />
          </div>
        </Page>
      </section>

      <Page>
        <div className="grid gap-x-16 pt-14 lg:grid-cols-[220px_minmax(0,1fr)]">
          <nav className="hidden lg:block">
            <div className="eyebrow mb-3">Endpoints</div>
            <ul className="space-y-2 text-[13.5px]">
              {ENDPOINTS.map((endpoint) => (
                <li key={endpoint.path}>
                  <a href={`#${endpoint.title.toLowerCase().replace(/\s+/g, "-")}`} className="text-grey-green hover:text-ink">
                    {endpoint.title}
                  </a>
                </li>
              ))}
              <li>
                <a href="#future" className="text-grey-green hover:text-ink">
                  Roadmap
                </a>
              </li>
              <li>
                <a href="#tracker" className="text-grey-green hover:text-ink">
                  Tracker one-pager
                </a>
              </li>
              <li>
                <a href="#embed" className="text-grey-green hover:text-ink">
                  Embed &amp; badge
                </a>
              </li>
              <li>
                <a href="#bounties" className="text-grey-green hover:text-ink">
                  Bounties
                </a>
              </li>
            </ul>
          </nav>
          <div>
            {ENDPOINTS.map((endpoint) => (
              <section key={endpoint.path} id={endpoint.title.toLowerCase().replace(/\s+/g, "-")} className="scroll-mt-24 border-t border-line-2 py-12 first:border-t-0 first:pt-0">
                <div className="grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                  <div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono rounded-[6px] bg-ink px-1.5 py-0.5 text-[11px] text-paper">{endpoint.method}</span>
                      <code className="font-mono text-[14px] text-ink">{endpoint.path}</code>
                    </div>
                    <h2 className="font-serif mt-4 text-[30px] text-ink">{endpoint.title}</h2>
                    <p className="mt-3 max-w-[52ch] text-[14.5px] leading-relaxed text-ink-2">{endpoint.body}</p>
                    <a href={`${origin}${endpoint.path.replace(":wallet", "0x8366a39cc670b4001a1121b8f6a443a643e40951").replace(":symbol", "NVDA").replace(":itemId", "AMC-2026-09-24-1")}`} target="_blank" rel="noreferrer" className="mt-4 inline-block text-[13px] font-medium text-emerald hover:underline">
                      Try it live
                    </a>
                  </div>
                  <div className="min-w-0">
                    <div className="eyebrow mb-2">Request</div>
                    <pre className="font-mono overflow-x-auto rounded-[12px] bg-charcoal px-4 py-3 text-[12.5px] leading-relaxed text-[#cfe0d5]">{endpoint.example}</pre>
                    <div className="eyebrow mt-4 mb-2">Response</div>
                    <pre className="font-mono overflow-x-auto rounded-[12px] border border-line bg-cream px-4 py-3 text-[12.5px] leading-relaxed text-ink-2">{endpoint.response}</pre>
                  </div>
                </div>
              </section>
            ))}
            <section id="future" className="scroll-mt-24 border-t border-line-2 py-12">
              <Eyebrow>Roadmap · named, not live</Eyebrow>
              <dl className="mt-4 grid gap-x-10 sm:grid-cols-3">
                {FUTURE.map(([title, body]) => (
                  <div key={title} className="border-t border-line py-4">
                    <dt className="flex items-center gap-2">
                      <Mark tone="warn">Planned</Mark>
                    </dt>
                    <dd className="mt-2">
                      <div className="text-[15px] font-medium text-ink">{title}</div>
                      <p className="mt-1 text-[13.5px] leading-relaxed text-ink-2">{body}</p>
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
            <section id="tracker" className="scroll-mt-24 border-t border-line-2 py-12">
              <Eyebrow>One-pager</Eyebrow>
              <Display size="sm" className="mt-3">
                Add Stock Token share-equivalents to your portfolio tracker.
              </Display>
              <p className="mt-3 max-w-[60ch] text-[14.5px] leading-relaxed text-ink-2">Three calls, no key. Show tokens as share-equivalents, value them with the Chainlink feed, and mark the position verified when the contract agrees.</p>
              <ol className="mt-6 grid gap-6 lg:grid-cols-3">
                {[
                  ["1 · Positions", "One call per wallet returns every held token with rawBalance, uiMultiplier, shareEquivalent and verified.", `${origin}/api/v1/positions/{wallet}`],
                  ["2 · Prices", "Each position carries priceUsd and valueUsd where a Chainlink feed exists; feeds are already multiplier-aware, so never multiply again.", `valueUsd = rawBalance × priceUsd / 1e18`],
                  ["3 · Changes", "Poll the feed with since= to pick up multiplier updates (splits, dividends) and new proxy items; refresh positions when a held symbol appears.", `${origin}/api/v1/feed?type=actions&since={lastSeen}`],
                ].map(([title, body, code]) => (
                  <li key={title} className="border-t border-line pt-4">
                    <div className="text-[15px] font-medium text-ink">{title}</div>
                    <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-2">{body}</p>
                    <pre className="font-mono mt-3 overflow-x-auto rounded-[10px] bg-charcoal px-3 py-2 text-[12px] text-[#cfe0d5]">{code}</pre>
                  </li>
                ))}
              </ol>
              <p className="mt-5 text-[12.5px] text-grey-green">Label the unit "share-eq" and keep the token count for reconciliation. Cache reads for 30 seconds; the public RPC behind them is rate limited and Redeem already batches it.</p>
            </section>

            <section id="embed" className="scroll-mt-24 border-t border-line-2 py-12">
              <Eyebrow>Embed</Eyebrow>
              <Display size="sm" className="mt-3">
                A live card for any security, in an iframe.
              </Display>
              <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
                <div>
                  <p className="max-w-[56ch] text-[14.5px] leading-relaxed text-ink-2">Share-equivalents recorded, multiplier, value, intent and queue depth for one ticker, refreshed on load, with the intent line printed on the card. Works in Notion, Substack, docs sites and anywhere else an iframe does.</p>
                  <pre className="font-mono mt-4 overflow-x-auto rounded-[12px] bg-charcoal px-4 py-3 text-[12.5px] leading-relaxed text-[#cfe0d5]">{`<iframe src="${origin}/embed/NVDA" width="340" height="230" style="border:0" loading="lazy" title="NVDA on Redeem"></iframe>`}</pre>
                  <pre className="font-mono mt-3 overflow-x-auto rounded-[12px] bg-charcoal px-4 py-3 text-[12.5px] leading-relaxed text-[#cfe0d5]">{`![Redeem record](${origin}/api/v1/badge/0xYOURWALLET)`}</pre>
                </div>
                <iframe src="/embed/NVDA" width="340" height="230" style={{ border: 0 }} loading="lazy" title="NVDA on Redeem" className="rounded-[12px] border border-line" />
              </div>
            </section>

            <section id="bounties" className="scroll-mt-24 border-t border-line-2 py-12">
              <Eyebrow>Open bounties</Eyebrow>
              <Display size="sm" className="mt-3">
                Adapters the record needs next.
              </Display>
              <p className="mt-3 max-w-[60ch] text-[14.5px] leading-relaxed text-ink-2">Each one resolves share-equivalents that sit somewhere other than a wallet back to the holder they belong to. Open a pull request against the repository with the adapter and a test against a live position; terms are posted per item.</p>
              <ol className="mt-6 border-t border-line-2">
                {[
                  ["Vault adapters", "Read a vault's share of each Stock Token and attribute it pro rata to vault-share holders. Interface: (vault, block) → [{ wallet, symbol, shareEquivalent }].", "open"],
                  ["Lending collateral", "Attribute Stock Tokens posted as collateral on Robinhood Chain lending markets to the depositor, net of liquidations.", "open"],
                  ["LP positions", "Resolve pool positions holding Stock Tokens to their liquidity providers by share of the pool.", "open"],
                  ["Nested positions", "Vault-in-vault and wrapped positions, resolved recursively with a cycle guard.", "open"],
                  ["Archive reads", "Balance at a past block from any archive source for Robinhood Chain, so weight can be read at the record date rather than at signing.", "open"],
                  ["Attestation contract", "A minimal registry storing each item's Merkle root, cutoff block and receipt count, with a verifier anyone can call.", "scoped"],
                ].map(([title, body, state]) => (
                  <li key={title} className="grid gap-2 border-b border-line py-4 sm:grid-cols-[200px_minmax(0,1fr)_90px] sm:items-start sm:gap-6">
                    <span className="text-[15px] font-medium text-ink">{title}</span>
                    <span className="text-[13.5px] leading-relaxed text-ink-2">{body}</span>
                    <span className="sm:text-right">
                      <Mark tone={state === "open" ? "live" : "warn"}>{state}</Mark>
                    </span>
                  </li>
                ))}
              </ol>
              <p className="mt-4 text-[12.5px] text-grey-green">
                Repository:{" "}
                <a href="https://github.com/redeemdotvote/redeem" target="_blank" rel="noreferrer" className="text-emerald hover:underline">
                  github.com/redeemdotvote/redeem
                </a>
              </p>
            </section>

            <section className="border-t border-line-2 py-12">
              <Display size="sm">Accounting, exactly as the record does it.</Display>
              <pre className="font-mono mt-5 max-w-[640px] overflow-x-auto rounded-[12px] border border-line bg-cream px-4 py-3 text-[12.5px] leading-relaxed text-ink-2">{`shareEquivalent = rawBalance × uiMultiplier ÷ 1e18
valueUsd        = rawBalance × chainlinkAnswer        // the feed is already multiplier-aware
verified        = shareEquivalent == balanceOfUI()   // read from the contract itself`}</pre>
            </section>
          </div>
        </div>
      </Page>
    </>
  );
}
