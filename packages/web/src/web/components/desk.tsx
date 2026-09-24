import { ArrowUpRight } from "lucide-react";
import { Link } from "wouter";
import { Page } from "./layout";
import { Button, Display, Eyebrow, Mark, Skeleton } from "./ui";
import { shares, shortDate } from "../lib/format";
import { useRecord, useRecordBook } from "../queries/record";
import { useForecastsBySymbol } from "../queries/forecasts";

/**
 * Desks. One security gets a front-page treatment: what the token carries, what holders have said
 * they would want, how deep the queue is. The angle for each is drawn from the record itself
 * (rank by recorded value on Robinhood Chain), never from claims about trading we cannot see.
 */
export const DESKS: Record<string, { angle: string; blurb: string; meme?: boolean }> = {
  AMC: { angle: "The file the retail base asked for.", blurb: "AMC shareholders vote. AMC Stock Token holders do not, yet. This desk keeps the two side by side: the proxy items shareholders will vote on, the intent token holders have signed, and the readiness queue for the day the rights arrive." },
  NVDA: { angle: "The name people reach for first, on the record.", blurb: "NVDA is the Stock Token most Robinhood Chain wallets start with. Every wallet that holds it can put its share-equivalent, its intent and its redemption readiness on file before the rights exist." },
  TSLA: { angle: "Retail's stock, with a retail record.", blurb: "TSLA meetings draw more retail attention than almost any other. Token holders cannot vote them yet; they can record what they would have wanted, weighted by what they hold." },
  AAPL: { angle: "The bluest chip, held in a wallet.", blurb: "AAPL on Robinhood Chain is the same economic exposure without the broker. The record shows what that exposure is in share-equivalents, and what its holders want done with it." },
  AMZN: { angle: "A mega-cap in a self-custodied wallet.", blurb: "AMZN Stock Token holders sit outside street name entirely. Redeem is the file a holder of record would keep for them: position, intent, readiness." },
  SPY: { angle: "The index, tokenized, on file.", blurb: "SPY is the fund people park in. Fund holders vote on fund matters; token holders record intent here, and pre-register for in-kind redemption with the same signed request as any stock." },
  GME: { angle: "The stock that taught retail to read a proxy.", blurb: "GME shareholders turned meetings into events. GME Stock Token holders sit outside every one of them. This desk keeps the items, the intent signed against them, the forecast of how the vote goes, and the queue for the day the rights arrive.", meme: true },
  DJT: { angle: "The most argued-over ticker, on a quiet record.", blurb: "DJT draws opinion from every side. A record does not take one: it lists the items, what token holders signed, what forecasters expected, and what holders of record decided when the 8-K lands.", meme: true },
  MSTR: { angle: "A balance sheet with a shareholder base to match.", blurb: "MSTR meetings decide share authorizations that move the whole strategy. Token holders cannot vote them; they can record intent, weight it by what they hold, and call the result before it is known.", meme: true },
  PLTR: { angle: "Retail's software stock, kept on file.", blurb: "PLTR has one of the widest retail bases on the chain. This desk holds its proxy items, the intent its token holders signed, and the forecast record beside the issuer's result.", meme: true },
  RDDT: { angle: "The company whose users are its shareholders.", blurb: "RDDT sold shares to its own community at listing. Its token holders are one step further out. Intent, forecast and readiness are all kept here, on the record, with nothing implied about rights that do not exist yet.", meme: true },
  BB: { angle: "The comeback ticker, with a record to keep.", blurb: "BB has been a retail name through two full cycles. Its meetings are on file back to 2023 with the shareholder results; new items open here for intent and forecast as they are filed.", meme: true },
};

export const DESK_SYMBOLS = Object.keys(DESKS);
export const MEME_SYMBOLS = DESK_SYMBOLS.filter((symbol) => DESKS[symbol]?.meme);
export const CORE_SYMBOLS = DESK_SYMBOLS.filter((symbol) => !DESKS[symbol]?.meme);

export function SecurityDesk({ symbol, compact = false }: { symbol: string; compact?: boolean }) {
  const desk = DESKS[symbol] ?? { angle: `${symbol}, on the record.`, blurb: "" };
  const record = useRecord(symbol);
  const book = useRecordBook();
  const calls = useForecastsBySymbol(symbol);
  const d = record.data;
  const rows = book.data?.rows ?? [];
  const rank = rows.length ? [...rows].sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0)).findIndex((row) => row.symbol === symbol) + 1 : 0;
  const open = d?.events.find((event) => event.status === "active") ?? d?.events[0] ?? null;
  const items = (open?.items ?? []).slice(0, compact ? 4 : 8);
  const holders = rows.find((row) => row.symbol === symbol);
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,0.42fr)_minmax(0,0.58fr)] lg:gap-16">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <Eyebrow>The {symbol} desk</Eyebrow>
          {open?.status === "active" ? <Mark tone="live">Open for intent</Mark> : null}
          {rank > 0 ? <Mark tone="muted">#{rank} by recorded value on Robinhood Chain</Mark> : null}
        </div>
        <Display size="md" className="mt-3">
          {desk.angle}
        </Display>
        <p className="mt-5 max-w-[46ch] text-[15.5px] leading-relaxed text-ink-2">{desk.blurb}</p>
        <dl className="mt-8 grid grid-cols-3 gap-x-6">
          <div>
            <dd className="font-mono text-[22px] text-ink">{d ? shares(d.supply.uiFloat) : <Skeleton className="h-6 w-16" />}</dd>
            <dt className="eyebrow mt-1.5">Share-eq recorded</dt>
          </div>
          <div>
            <dd className="font-mono text-[22px] text-ink">{d ? shares(d.activity.intentShareEq) : <Skeleton className="h-6 w-16" />}</dd>
            <dt className="eyebrow mt-1.5">Share-eq of intent</dt>
          </div>
          <div>
            <dd className="font-mono text-[22px] text-ink">{d ? d.activity.requests : <Skeleton className="h-6 w-16" />}</dd>
            <dt className="eyebrow mt-1.5">Queue requests</dt>
          </div>
        </dl>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button asChild>
            <Link to={compact ? `/desk/${symbol}` : `/record/${symbol}`}>{compact ? `Open the ${symbol} desk` : "Open the record"}</Link>
          </Button>
          <Link to={`/intents?symbol=${symbol}&status=active`} className="inline-flex items-center gap-1 text-[14px] font-medium text-emerald hover:underline">
            Record intent <ArrowUpRight className="size-4" />
          </Link>
          <Link to={`/redeem?symbol=${symbol}`} className="inline-flex items-center gap-1 text-[14px] font-medium text-emerald hover:underline">
            Pre-register redemption <ArrowUpRight className="size-4" />
          </Link>
        </div>
      </div>
      <div>
        <div className="flex items-end justify-between gap-4 border-b border-line-2 pb-3">
          <div>
            <div className="eyebrow">{open ? `${open.meetingType} · meeting ${shortDate(Date.parse(open.meetingDate) / 1000)}` : "Proxy items"}</div>
            <div className="mt-1 text-[13px] text-grey-green">Shareholders vote these. Token holders record intent on them here.</div>
          </div>
          <Mark tone="muted">Intent · not a shareholder vote</Mark>
        </div>
        {!d ? (
          <Skeleton className="mt-4 h-40" />
        ) : items.length === 0 ? (
          <p className="mt-4 text-[14px] text-grey-green">No proxy items on file for {symbol} yet. The next DEF 14A lands here when it is filed{holders ? `; ${shares(holders.shareEquivalent)} share-eq are already on the record` : ""}.</p>
        ) : (
          <ol>
            {items.map((item) => (
              <li key={item.id}>
                <Link to={`/intents/${item.id}`} className="grid gap-2 border-b border-line py-4 transition-colors hover:bg-cream sm:grid-cols-[minmax(0,1fr)_150px] sm:items-center">
                  <span className="flex min-w-0 items-start gap-3">
                    <span className="font-mono mt-0.5 w-6 shrink-0 text-[12px] text-grey-green">{item.index}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-[14.5px] text-ink">{item.title}</span>
                      <span className="mt-0.5 block text-[12px] text-grey-green">
                        Board: {item.boardRecommendation}
                        {calls.data?.[item.id]?.leading ? ` · ${calls.data[item.id]!.leading!.share.toFixed(0)}% forecast ${calls.data[item.id]!.leading!.label.toLowerCase()} (${calls.data[item.id]!.total})` : ""}
                      </span>
                    </span>
                  </span>
                  <span className="font-mono text-[12.5px] text-ink sm:text-right">
                    {item.intents} {item.intents === 1 ? "intent" : "intents"} · {shares(item.intentShareEq)} sh-eq
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}
        {open ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-grey-green">
            <span>
              {open.items.length} items · {open.status === "active" ? "closes" : "closed"} {shortDate(open.closesAt)} ·{" "}
              <a href={open.docUrl} target="_blank" rel="noreferrer" className="text-emerald hover:underline">
                {open.status === "active" ? "DEF 14A on EDGAR" : "Filing on EDGAR"}
              </a>
            </span>
            <Link to="/leaderboard" className="hover:text-ink">
              Record holders →
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** The row of desks under the home desk: one chip per featured security, meme stocks in their own run. */
export function DeskRow({ current }: { current?: string }) {
  const chip = (symbol: string) => (
    <Link key={symbol} to={`/desk/${symbol}`} className={`font-mono rounded-[8px] border px-2.5 py-1 text-[12.5px] transition-colors ${symbol === current ? "border-ink bg-ink text-paper" : "border-line-2 text-ink hover:border-ink"}`}>
      {symbol}
    </Link>
  );
  return (
    <Page>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2 border-t border-line-2 pt-5">
        <span className="eyebrow mr-2">Desks</span>
        {CORE_SYMBOLS.map(chip)}
        <span className="eyebrow mr-2 ml-4">Meme stocks</span>
        {MEME_SYMBOLS.map(chip)}
      </div>
    </Page>
  );
}
