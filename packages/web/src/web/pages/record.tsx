import { ArrowUpDown, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { AssetLogo } from "../components/brand";
import { Page, PageHead } from "../components/layout";
import { SecurityRow } from "../components/ledger";
import { Num } from "../components/number";
import { RecordInspector } from "../components/record-inspector";
import { RecordTable } from "../components/record-table";
import { Sheet } from "../components/sheet";
import { Input, Select, Skeleton, Stat, Tabs } from "../components/ui";
import { ChainLine } from "../components/robinhood-chain";
import { useWallet } from "../hooks/use-wallet";
import { ageLabel, multiplier, shares, usd } from "../lib/format";
import { useRecordBook } from "../queries/record";

type View = "all" | "held" | "active" | "priced";
type Sort = "value" | "shareEq" | "symbol" | "intent" | "queue" | "action";

const SORTS: Array<{ value: Sort; label: string }> = [
  { value: "value", label: "USD value" },
  { value: "shareEq", label: "Share-equivalent" },
  { value: "symbol", label: "Ticker" },
  { value: "intent", label: "Intent recorded" },
  { value: "queue", label: "Redemption demand" },
  { value: "action", label: "Latest action" },
];

export default function RecordBookPage() {
  const wallet = useWallet();
  const book = useRecordBook(wallet.address);
  const [view, setView] = useState<View>("all");
  const [sort, setSort] = useState<Sort>("value");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);

  const rows = useMemo(() => {
    const all = book.data?.rows ?? [];
    const query = q.trim().toLowerCase();
    return all
      .filter((row) => {
        if (view === "held" && !row.held) return false;
        if (view === "active" && row.intents === 0 && row.requests === 0 && row.openEvents === 0) return false;
        if (view === "priced" && row.priceUsd === null) return false;
        if (query && !row.symbol.toLowerCase().includes(query) && !row.name.toLowerCase().includes(query)) return false;
        return true;
      })
      .sort((a, b) => {
        switch (sort) {
          case "shareEq":
            return b.shareEquivalent - a.shareEquivalent;
          case "symbol":
            return a.symbol.localeCompare(b.symbol);
          case "intent":
            return b.intentShareEq - a.intentShareEq || b.intents - a.intents;
          case "queue":
            return b.requestedShareEq - a.requestedShareEq;
          case "action":
            return (b.lastAction?.effectiveAt ?? 0) - (a.lastAction?.effectiveAt ?? 0);
          default:
            return (b.valueUsd ?? -1) - (a.valueUsd ?? -1) || b.shareEquivalent - a.shareEquivalent;
        }
      });
  }, [book.data, view, sort, q]);

  const totals = book.data?.totals;
  const held = book.data?.rows.filter((row) => row.held).length ?? 0;
  const current = rows.find((row) => row.symbol === selected) ?? rows[0] ?? null;

  return (
    <Page>
      <PageHead
        eyebrow={<span className="inline-flex flex-wrap items-center gap-4">Record Book <ChainLine caption="Read from" /></span>}
        title={
          <>
            The <span className="italic">Record Book.</span>
          </>
        }
        body="Every official Stock Token, one row each: raw ERC-20 supply, the issuer's multiplier, the share-equivalent it resolves to, Chainlink valuation where a feed exists, recorded intent and redemption demand. Read live from the contracts."
        aside={
          <div className="grid grid-cols-2 gap-x-10 gap-y-6 sm:grid-cols-3">
            <Stat label="Share-eq recorded" size="lg" value={totals ? <Num value={totals.shareEquivalent} format={shares} /> : <Skeleton className="h-9 w-24" />} />
            <Stat label="Recorded value" size="lg" value={totals ? <Num value={totals.valueUsd} format={(v) => usd(v, { compact: true })} /> : <Skeleton className="h-9 w-24" />} sub={totals ? `${totals.priced} of ${totals.tokens} priced` : undefined} />
            <Stat label="Intent recorded" size="lg" tone="emerald" value={totals ? <Num value={totals.intentShareEq} format={shares} /> : <Skeleton className="h-9 w-24" />} sub={totals ? `${totals.intents} signed · ${totals.requests} redemption` : undefined} />
          </div>
        }
      />

      <div className="flex flex-col gap-4 border-t border-line-2 pt-5 md:flex-row md:items-center md:justify-between">
        <Tabs
          value={view}
          onChange={setView}
          options={[
            { value: "all", label: "All securities", count: book.data?.totals.tokens },
            { value: "active", label: "With activity" },
            { value: "priced", label: "Chainlink-priced", count: book.data?.totals.priced },
            ...(wallet.address ? [{ value: "held" as const, label: "Held by me", count: held }] : []),
          ]}
          className="border-b-0"
        />
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-grey-green" />
            <Input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Ticker or name" className="h-9 w-[200px] pl-8 text-[13.5px]" />
          </div>
          <Select value={sort} onChange={(event) => setSort(event.target.value as Sort)} aria-label="Sort">
            {SORTS.map((option) => (
              <option key={option.value} value={option.value}>
                Sort · {option.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0">
          {book.isLoading ? (
            <div className="mt-4 space-y-px">
              {Array.from({ length: 12 }).map((_, index) => (
                <Skeleton key={index} className="h-16" />
              ))}
            </div>
          ) : (
            <>
              <div className="hidden md:block">
                <RecordTable rows={rows} selected={current?.symbol ?? null} onSelect={setSelected} wallet={Boolean(wallet.address)} />
                {rows.length === 0 ? <div className="py-16 text-center text-[14px] text-grey-green">Nothing on the record matches.</div> : null}
              </div>
              <div className="md:hidden">
                {rows.map((row) => (
                  <SecurityRow
                    key={row.symbol}
                    leading={<AssetLogo symbol={row.symbol} logo={row.logo} size="sm" />}
                    title={row.symbol}
                    subtitle={row.name}
                    primary={`${shares(row.shareEquivalent)} sh-eq`}
                    secondary={row.valueUsd === null ? `${multiplier(row.uiMultiplier, 4)}×` : usd(row.valueUsd, { compact: true })}
                    onClick={() => {
                      setSelected(row.symbol);
                      setSheet(true);
                    }}
                  />
                ))}
              </div>
            </>
          )}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3 text-[12.5px] text-grey-green">
            <span>
              {rows.length} of {totals?.tokens ?? 0} securities · block {book.data?.blockNumber ?? "—"} · read {ageLabel(book.data?.dataAgeMs)}
              {book.data?.degraded ? " · served from cache" : ""}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ArrowUpDown className="size-3" /> share-eq = raw × uiMultiplier ÷ 1e18 · Chainlink feeds are multiplier-aware and never scaled again
            </span>
          </div>
        </div>
        <aside className="hidden lg:block">
          <div className="sticky top-[76px] border-l border-line-2 pl-8">
            <div className="eyebrow mb-4">Inspector</div>
            {current ? <RecordInspector row={current} blockTimestamp={book.data?.blockTimestamp} /> : <Skeleton className="h-64" />}
          </div>
        </aside>
      </div>
      <Sheet open={sheet} onClose={() => setSheet(false)} title="Record inspector">
        {current ? <RecordInspector row={current} blockTimestamp={book.data?.blockTimestamp} onClose={() => setSheet(false)} /> : null}
      </Sheet>
    </Page>
  );
}
