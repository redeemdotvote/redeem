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
    example: `curl -s https://redeem.example/api/v1/positions/0x8366a39cc670b4001a1121b8f6a443a643e40951`,
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
    example: `curl -s https://redeem.example/api/v1/record/NVDA`,
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
    example: `curl -s https://redeem.example/api/v1/record/HPE/multipliers`,
    response: `{ "symbol": "HPE", "events": [ { "oldMultiplier": "1000000000000000000", "newMultiplier": "1001716957939304938", "changeBps": 17.16, "effectiveAt": 1789604133 } ] }`,
  },
  {
    method: "GET",
    path: "/api/v1/intents/:itemId/receipts",
    title: "Intent export",
    body: "Every active receipt for one proxy item: wallet, choice, delegate, share-equivalent, block, signature and the EIP-712 payload — enough to recompute the tally and the Merkle root without asking Redeem.",
    example: `curl -s https://redeem.example/api/v1/intents/AMC-2026-09-24-1/receipts`,
    response: `{ "itemId": "AMC-2026-09-24-1", "note": "Intent, not a shareholder vote.", "receipts": [ … ] }`,
  },
  {
    method: "GET",
    path: "/api/v1/record",
    title: "Security master",
    body: "The whole allowlist with live multipliers and supply — the same read the Record Book is built on.",
    example: `curl -s https://redeem.example/api/v1/record`,
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
              curl -s {origin || "https://redeem.example"}/api/v1/record/NVDA
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
