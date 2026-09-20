import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearch } from "wouter";
import { RecordCards } from "../components/record-cards";
import { ChainLine, PostRef } from "../components/robinhood-chain";
import { FoundingLine } from "../components/founding";
import { SplitBar } from "../components/bars";
import { AssetLogo } from "../components/brand";
import { Page } from "../components/layout";
import { Countdown, EventStatus, IntentLabel, Recommendation } from "../components/status";
import { Button, Display, Eyebrow, Input, Mark, Select, Skeleton, Tabs } from "../components/ui";
import { useWallet } from "../hooks/use-wallet";
import { dateTimeUtc, isoDate, shares } from "../lib/format";
import { useIntentItems } from "../queries/intents";
import { useRecordBook } from "../queries/record";

type Status = "all" | "active" | "closed";

export default function IntentsPage() {
  const wallet = useWallet();
  const search = useSearch();
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const [status, setStatus] = useState<Status>((params.get("status") as Status) || "active");
  const [symbol, setSymbol] = useState(params.get("symbol") ?? "");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const book = useRecordBook();

  useEffect(() => {
    setStatus((params.get("status") as Status) || "active");
    setSymbol(params.get("symbol") ?? "");
    setPage(1);
  }, [params]);

  const items = useIntentItems({ status, symbol: symbol || undefined, q: q || undefined, page, wallet: wallet.address });
  const data = items.data;
  // Nothing open? Show the last filings for the same filter as a preview, so the list is never blank.
  const empty = !items.isLoading && (data?.items.length ?? 0) === 0;
  const preview = useIntentItems({ status: "closed", symbol: symbol || undefined, q: q || undefined, page: 1, pageSize: 6 });
  const tickers = (book.data?.rows ?? []).filter((row) => row.openEvents > 0 || row.closedEvents > 0);

  return (
    <>
      <section className="env-hero relative overflow-hidden">
        <Page className="relative">
          <div className="grid gap-8 py-14 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-center lg:py-20">
            <div className="rise">
              <Eyebrow>Intents · proxy items on file</Eyebrow>
              <Display as="h1" size="xl" className="mt-5">
                What you would want, <span className="italic">on the record.</span>
              </Display>
              <p className="mt-6 max-w-[56ch] text-[16px] leading-relaxed text-ink-2">
                Each item comes from an issuer's proxy statement. A holder signs an EIP-712 statement of intent weighted by the share-equivalent they hold. It is recorded, tallied and attested — and it is intent, not a shareholder vote.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2">
                <IntentLabel />
                <ChainLine caption="Weighted by holdings on" />
              </div>
              <div className="mt-4 flex flex-col items-start gap-3">
                <PostRef />
                <FoundingLine />
                <Link to="/reports" className="text-[13.5px] font-medium text-emerald hover:underline">
                  Holder Intent Reports, per meeting →
                </Link>
              </div>
            </div>
            <div className="relative hidden lg:block">
              <RecordCards front="intent" className="mx-auto max-w-[560px]" />
            </div>
          </div>
        </Page>
      </section>

      <Page>
        <div className="flex flex-col gap-3 pt-8 md:flex-row md:items-end md:justify-between">
          <Tabs
            value={status}
            onChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
            options={[
              { value: "active", label: "Open", count: data?.counts.active },
              { value: "closed", label: "Closed", count: data?.counts.closed },
              { value: "all", label: "All" },
            ]}
            className="border-b-0"
          />
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-grey-green" />
              <Input
                value={q}
                onChange={(event) => {
                  setQ(event.target.value);
                  setPage(1);
                }}
                placeholder="Search items"
                className="h-9 w-[200px] pl-8 text-[13px]"
              />
            </div>
            <Select
              value={symbol}
              onChange={(event) => {
                setSymbol(event.target.value);
                setPage(1);
              }}
              aria-label="Ticker"
            >
              <option value="">All tickers</option>
              {tickers.map((row) => (
                <option key={row.symbol} value={row.symbol}>
                  {row.symbol} · {row.name}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="mt-2 hidden grid-cols-[minmax(0,1fr)_260px_180px] gap-6 border-y border-line-2 py-2.5 lg:grid">
          <div className="eyebrow">Item</div>
          <div className="eyebrow">Intent signalled</div>
          <div className="eyebrow text-right">Cutoff</div>
        </div>

        {items.isLoading ? (
          <div className="mt-4 space-y-px">
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton key={index} className="h-20" />
            ))}
          </div>
        ) : empty ? (
          <div className="border-t border-line-2 py-10">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-3">
                  <Eyebrow>Preview</Eyebrow>
                  <Mark tone="warn">Signing opens when the next filing is live</Mark>
                </div>
                <h2 className="font-serif mt-2 text-[26px] text-ink">{status === "active" ? `Nothing open${symbol ? ` for ${symbol}` : ""} right now.` : "No items match."}</h2>
                <p className="mt-1 max-w-[62ch] text-[14px] text-grey-green">
                  {symbol
                    ? `The next DEF 14A ${symbol} files lands here within a day of EDGAR, with every item extracted and open for intent until the cutoff. Below: the last items on file.`
                    : "Items appear within a day of each proxy statement reaching EDGAR. Below: the most recent items on file, closed, for the shape of what is coming."}
                </p>
              </div>
              <Link to={symbol ? `/record/${symbol}` : "/record"} className="text-[13.5px] font-medium text-emerald hover:underline">
                {symbol ? `Open the ${symbol} record` : "Open the Record Book"}
              </Link>
            </div>
            {preview.isLoading ? (
              <Skeleton className="mt-6 h-40" />
            ) : (preview.data?.items.length ?? 0) === 0 ? (
              <p className="mt-6 text-[13.5px] text-grey-green">No filings on record{symbol ? ` for ${symbol}` : ""} yet.</p>
            ) : (
              <ol className="mt-6 border-t border-line-2 opacity-80">
                {preview.data!.items.map((item) => (
                  <li key={item.id}>
                    <Link to={`/intents/${item.id}`} className="grid gap-3 border-b border-line py-4 transition-colors hover:bg-mint/60 lg:grid-cols-[minmax(0,1fr)_260px_180px] lg:items-center lg:gap-6">
                      <div className="flex min-w-0 items-start gap-3">
                        <AssetLogo symbol={item.symbol} logo={item.logo} size="sm" className="mt-0.5" />
                        <div className="min-w-0">
                          <div className="truncate text-[15px] text-ink">
                            <span className="font-mono mr-2 text-[12px] text-grey-green">{item.index}</span>
                            {item.title}
                          </div>
                          <div className="mt-1 text-[12px] text-grey-green">
                            {item.symbol} · meeting {isoDate(item.ballot.meetingDate)} · closed {isoDate(new Date(item.ballot.closesAt * 1000).toISOString())}
                          </div>
                        </div>
                      </div>
                      <span className="font-mono text-[12.5px] text-grey-green">{shares(item.tally.totalWeightFloat)} sh-eq recorded</span>
                      <span className="text-right text-[12px] text-grey-green">Closed · preview</span>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </div>
        ) : (
          <ol className="border-t border-line-2 lg:border-t-0">
            {data!.items.map((item) => {
              const active = item.ballot.status === "active";
              return (
                <li key={item.id}>
                  <Link to={`/intents/${item.id}`} className="grid gap-4 border-b border-line py-5 transition-colors hover:bg-mint/60 lg:grid-cols-[minmax(0,1fr)_260px_180px] lg:items-center lg:gap-6">
                    <div className="flex min-w-0 items-start gap-3">
                      <AssetLogo symbol={item.symbol} logo={item.logo} size="sm" className="mt-0.5" />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="font-mono text-[12.5px] text-ink">{item.symbol}</span>
                          <span className="text-[12.5px] text-grey-green">
                            {item.ballot.meetingType === "special" ? "Special" : "Annual"} meeting · {isoDate(item.ballot.meetingDate)} · record date {item.ballot.recordDate ? isoDate(item.ballot.recordDate) : "n/s"}
                          </span>
                          <span className="font-mono text-[11.5px] text-grey-green">{item.ballot.id}</span>
                          <EventStatus status={item.ballot.status} />
                          {item.instructed ? <Mark tone="emerald">You signed</Mark> : null}
                        </div>
                        <div className="mt-1.5 font-serif text-[20px] leading-snug text-ink sm:text-[22px]">
                          <span className="font-mono mr-2 text-[12px] text-grey-green">{item.index}</span>
                          {item.title}
                        </div>
                        <div className="mt-2">
                          <Recommendation value={item.boardRecommendation} />
                        </div>
                      </div>
                    </div>
                    <div>
                      {item.tally.wallets > 0 ? (
                        <>
                          <div className="font-mono text-[13.5px] text-ink">
                            {shares(item.tally.totalWeightFloat)} sh-eq · {item.tally.wallets} wallet{item.tally.wallets === 1 ? "" : "s"}
                          </div>
                          <SplitBar rows={item.tally.rows} className="mt-2 max-w-[220px]" />
                          <div className="mt-1.5 text-[11px] tracking-[0.12em] text-grey-green uppercase">Intent · not a shareholder vote</div>
                        </>
                      ) : (
                        <span className="text-[13px] text-grey-green">No intent recorded yet</span>
                      )}
                    </div>
                    <div className="lg:text-right">
                      {active ? (
                        <>
                          <Countdown to={item.ballot.closesAt} className="font-mono text-[14px] text-emerald" />
                          <div className="text-[11.5px] text-grey-green">{dateTimeUtc(item.ballot.closesAt)}</div>
                        </>
                      ) : (
                        <span className="text-[13px] text-grey-green">Closed {dateTimeUtc(item.ballot.closesAt)}</span>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ol>
        )}

        <div className="mt-3 flex items-center justify-between gap-3 text-[12px] text-grey-green">
          <span>
            Page {data?.page ?? 1} of {data?.pages ?? 1} · {data?.total ?? 0} items
          </span>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} aria-label="Previous page">
              <ChevronLeft className="size-4" />
            </Button>
            <Button size="sm" variant="outline" disabled={page >= (data?.pages ?? 1)} onClick={() => setPage((value) => value + 1)} aria-label="Next page">
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </Page>
    </>
  );
}
