import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { AssetLogo } from "../components/brand";
import { Page } from "../components/layout";
import { PHOTOS, PhotoBand } from "../components/photo";
import { Ledger, LHead, LRow, LTd, LTh, SecurityRow } from "../components/ledger";
import { Input, Mark, Select, Skeleton, Tag } from "../components/ui";
import { ChainLine } from "../components/robinhood-chain";
import { ageLabel, dateTimeUtc, multiplier, relative, shares, shortAddress, usd } from "../lib/format";
import { useRecordBook } from "../queries/record";

type Sort = "symbol" | "value" | "shareEq" | "price" | "action" | "intent";

export default function MarketsPage() {
  const [, navigate] = useLocation();
  const book = useRecordBook();
  const [q, setQ] = useState("");
  const [sector, setSector] = useState("all");
  const [kind, setKind] = useState("all");
  const [sort, setSort] = useState<Sort>("symbol");

  const rows = useMemo(() => {
    const all = book.data?.rows ?? [];
    const query = q.trim().toLowerCase();
    return all
      .filter((row) => (sector === "all" || row.sector === sector) && (kind === "all" || row.kind === kind) && (!query || row.symbol.toLowerCase().includes(query) || row.name.toLowerCase().includes(query)))
      .sort((a, b) => {
        switch (sort) {
          case "value":
            return (b.valueUsd ?? -1) - (a.valueUsd ?? -1);
          case "shareEq":
            return b.shareEquivalent - a.shareEquivalent;
          case "price":
            return (b.priceUsd ?? -1) - (a.priceUsd ?? -1);
          case "action":
            return (b.lastAction?.effectiveAt ?? 0) - (a.lastAction?.effectiveAt ?? 0);
          case "intent":
            return b.intentShareEq - a.intentShareEq;
          default:
            return a.symbol.localeCompare(b.symbol);
        }
      });
  }, [book.data, q, sector, kind, sort]);

  const totals = book.data?.totals;
  return (
    <>
      <PhotoBand photo={PHOTOS.canyon} tone="dark" minHeight={460} className="-mt-px" eager>
        <Page className="pt-24 pb-14 lg:pt-32 lg:pb-16">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div className="max-w-[720px]">
              <div className="flex flex-wrap items-center gap-4">
                <span className="eyebrow">Markets · security master</span>
                <ChainLine caption={null} dark />
              </div>
              <h1 className="display mt-4 text-[38px] text-[#e9ede7] sm:text-[50px] lg:text-[60px]">
                Official Stock Tokens on <span className="italic text-[#8fd3b0]">Robinhood Chain.</span>
              </h1>
              <p className="mt-5 max-w-[60ch] text-[15.5px] leading-relaxed text-[#b5c4ba]">The issuer's allowlist, verified against the contracts: ticker, asset, official contract, share-equivalent recorded, multiplier, Chainlink valuation and the latest corporate action. Nothing here is listed that Robinhood Assets (Jersey) Limited has not issued.</p>
            </div>
            <dl className="grid grid-cols-3 gap-x-10">
              {(
                [
                  ["Securities", totals?.tokens],
                  ["Priced feeds", totals?.priced],
                  ["Actions mirrored", totals?.actions],
                ] as Array<[string, number | undefined]>
              ).map(([label, value]) => (
                <div key={label}>
                  <dd className="font-mono text-[28px] leading-none text-[#e9ede7]">{value ?? <Skeleton className="h-7 w-12" />}</dd>
                  <dt className="mt-2 text-[12.5px] text-[#8fb3a0]">{label}</dt>
                </div>
              ))}
            </dl>
          </div>
        </Page>
      </PhotoBand>
    <Page>
      <div className="flex flex-col gap-3 pt-6 md:flex-row md:items-center md:justify-between">
        <div className="relative w-full md:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-grey-green" />
          <Input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search ticker or company" className="h-9 pl-8 text-[13px]" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={kind} onChange={(event) => setKind(event.target.value)} aria-label="Asset class">
            <option value="all">All classes</option>
            <option value="stock">US stocks</option>
            <option value="foreign">Foreign issuers</option>
            <option value="etf">ETFs</option>
          </Select>
          <Select value={sector} onChange={(event) => setSector(event.target.value)} aria-label="Sector">
            <option value="all">All sectors</option>
            {(book.data?.sectors ?? []).map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </Select>
          <Select value={sort} onChange={(event) => setSort(event.target.value as Sort)} aria-label="Sort">
            <option value="symbol">Sort · Ticker</option>
            <option value="value">Sort · USD value</option>
            <option value="shareEq">Sort · Share-equivalent</option>
            <option value="price">Sort · Price</option>
            <option value="intent">Sort · Intent</option>
            <option value="action">Sort · Latest action</option>
          </Select>
        </div>
      </div>

      <div className="mt-2 hidden md:block">
        {book.isLoading ? (
          <div className="mt-4 space-y-px">
            {Array.from({ length: 12 }).map((_, index) => (
              <Skeleton key={index} className="h-14" />
            ))}
          </div>
        ) : (
          <Ledger>
            <LHead>
              <LTh>Ticker</LTh>
              <LTh hide="lg">Sector</LTh>
              <LTh hide="xl">Official contract</LTh>
              <LTh align="right">Price</LTh>
              <LTh align="right" hide="md">
                Multiplier
              </LTh>
              <LTh align="right">Share-eq recorded</LTh>
              <LTh align="right" hide="lg">
                USD value
              </LTh>
              <LTh align="right" hide="lg">
                Intent
              </LTh>
              <LTh align="right" hide="xl">
                Latest action
              </LTh>
            </LHead>
            <tbody>
              {rows.map((row) => (
                <LRow key={row.symbol} onClick={() => navigate(`/record/${row.symbol}`)}>
                  <LTd>
                    <span className="flex items-center gap-3">
                      <AssetLogo symbol={row.symbol} logo={row.logo} size="sm" />
                      <span className="min-w-0">
                        <span className="flex items-center gap-2 text-[15px] font-medium text-ink">
                          {row.symbol}
                          {row.kind === "etf" ? <Tag>ETF</Tag> : row.kind === "foreign" ? <Tag>ADR</Tag> : null}
                        </span>
                        <span className="block max-w-[220px] truncate text-[12px] text-grey-green">{row.name}</span>
                      </span>
                    </span>
                  </LTd>
                  <LTd hide="lg" muted className="text-[12.5px]">
                    {row.sector}
                  </LTd>
                  <LTd hide="xl" mono muted>
                    <span className="inline-flex items-center gap-1.5">
                      {shortAddress(row.address, 5)}
                      <span className="size-[5px] bg-emerald" title="Verified against the issuer's list" />
                    </span>
                  </LTd>
                  <LTd align="right" mono muted={row.priceUsd === null}>
                    {row.priceUsd === null ? "no feed" : usd(row.priceUsd)}
                    {row.priceUsd !== null && row.priceUpdatedAt ? <span className="block text-[10.5px] text-grey-green">{relative(row.priceUpdatedAt)}</span> : null}
                  </LTd>
                  <LTd align="right" mono hide="md" muted={row.uiMultiplier === 1}>
                    {multiplier(row.uiMultiplier, 6)}×
                  </LTd>
                  <LTd align="right" mono className="text-ink">
                    {shares(row.shareEquivalent)}
                  </LTd>
                  <LTd align="right" mono hide="lg" muted={row.valueUsd === null}>
                    {row.valueUsd === null ? "—" : usd(row.valueUsd, { compact: true })}
                  </LTd>
                  <LTd align="right" hide="lg">
                    {row.openEvents > 0 ? <Mark tone="live">{row.openEvents} open</Mark> : row.intents > 0 ? <span className="font-mono text-[12.5px]">{shares(row.intentShareEq)}</span> : <span className="text-[12px] text-grey-green">—</span>}
                  </LTd>
                  <LTd align="right" hide="xl" muted className="font-mono text-[12.5px]">
                    {row.lastAction ? dateTimeUtc(row.lastAction.effectiveAt) : "None"}
                  </LTd>
                </LRow>
              ))}
            </tbody>
          </Ledger>
        )}
      </div>
      <div className="mt-2 md:hidden">
        {rows.map((row) => (
          <SecurityRow key={row.symbol} leading={<AssetLogo symbol={row.symbol} logo={row.logo} size="sm" />} title={row.symbol} subtitle={row.name} primary={row.priceUsd === null ? `${shares(row.shareEquivalent)} sh-eq` : usd(row.priceUsd)} secondary={row.priceUsd === null ? "no feed" : `${shares(row.shareEquivalent)} sh-eq`} onClick={() => navigate(`/record/${row.symbol}`)} />
        ))}
      </div>
      <div className="mt-4 border-t border-line pt-3 text-[12px] text-grey-green">
        {rows.length} securities · block {book.data?.blockNumber ?? "—"} · read {ageLabel(book.data?.dataAgeMs)} · registry from api.robinhood.com/rhj/assets, joined with SEC EDGAR and the Chainlink feed directory
      </div>
    </Page>
    </>
  );
}
