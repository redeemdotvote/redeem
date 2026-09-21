import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { AssetLogo } from "./brand";
import { Page } from "./layout";
import { ChainLogo } from "./robinhood-chain";
import { Countdown } from "./status";
import { Button, Eyebrow, Mark, Skeleton } from "./ui";
import { orpc } from "../lib/api";
import { Num } from "./number";
import { shares, usd } from "../lib/format";

export function useQueueBoard(symbol?: string) {
  return useQuery(orpc.redemption.board.queryOptions({ input: symbol ? { symbol } : {}, staleTime: 20_000, refetchInterval: 30_000, placeholderData: keepPreviousData }));
}

/** Cumulative queue value by signing time, as a step line. Drawn only from signed requests. */
function Curve({ points, className }: { points: Array<{ at: number; valueUsd: number }>; className?: string }) {
  if (points.length < 2) return null;
  const w = 600;
  const h = 90;
  const t0 = points[0]!.at;
  const t1 = Math.max(points[points.length - 1]!.at, Math.floor(Date.now() / 1000));
  const max = points[points.length - 1]!.valueUsd || 1;
  const x = (at: number) => ((at - t0) / Math.max(1, t1 - t0)) * w;
  const y = (value: number) => h - (value / max) * (h - 6) - 2;
  let d = `M0 ${h}`;
  let last = 0;
  for (const point of points) {
    d += ` L${x(point.at).toFixed(1)} ${y(last).toFixed(1)} L${x(point.at).toFixed(1)} ${y(point.valueUsd).toFixed(1)}`;
    last = point.valueUsd;
  }
  d += ` L${w} ${y(last).toFixed(1)}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={className} aria-hidden>
      <path d={`${d} L${w} ${h} Z`} fill="var(--emerald)" opacity="0.1" />
      <path d={d} fill="none" stroke="var(--emerald)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/**
 * The number on the homepage: the dollar value of Stock Tokens pre-registered for redemption,
 * per ticker, with the next real deadline. Every dollar is a signed request valued at the live
 * Chainlink price. When the queue is still small the panel says so and shows what is on chain,
 * rather than dressing the number up.
 */
export function QueuePanel() {
  const board = useQueueBoard();
  const b = board.data;
  if (!b) {
    return (
      <section className="border-y border-line-2 py-10">
        <Page>
          <Skeleton className="h-40" />
        </Page>
      </section>
    );
  }
  const top = b.tickers.slice(0, 5);
  return (
    <section className="border-y border-line-2 bg-cream">
      <Page>
        <div className="grid gap-8 py-10 lg:grid-cols-[minmax(0,0.46fr)_minmax(0,0.54fr)] lg:gap-14 lg:py-12">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="relative flex size-[7px]">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald opacity-60" />
                <span className="relative inline-flex size-[7px] rounded-full bg-emerald" />
              </span>
              <Eyebrow>In the redemption queue · live</Eyebrow>
              <ChainLogo height={14} />
            </div>
            <div className="font-mono mt-4 text-[52px] leading-none tracking-[-0.02em] text-ink sm:text-[72px] lg:text-[84px]">
              <Num value={b.totalValueUsd} format={(v) => usd(v, v >= 100_000 ? { compact: true } : undefined)} />
            </div>
            <p className="mt-3 max-w-[48ch] text-[15px] leading-relaxed text-ink-2">
              of Stock Tokens pre-registered for 1:1 share redemption, by {b.wallets} {b.wallets === 1 ? "wallet" : "wallets"} across {b.tickers.length} {b.tickers.length === 1 ? "ticker" : "tickers"}
              {b.onChainValueUsd ? `, out of ${usd(b.onChainValueUsd, { compact: true })} on Robinhood Chain` : ""}. Signed, numbered, public.
            </p>
            <Curve points={b.curve} className="mt-5 h-[70px] w-full max-w-[520px]" />
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <Link to="/redeem">Join the queue</Link>
              </Button>
              <Link to="/queue" className="text-[14px] font-medium text-emerald hover:underline">
                See every position →
              </Link>
            </div>
          </div>
          <div>
            <div className="flex items-baseline justify-between border-b border-line-2 pb-2">
              <Eyebrow>By ticker</Eyebrow>
              <span className="font-mono text-[12px] text-grey-green">{b.block ? `block ${Number(b.block).toLocaleString("en-US")}` : ""}</span>
            </div>
            {top.length === 0 ? (
              <p className="py-6 text-[14.5px] text-ink-2">Nobody has pre-registered yet. Position #1 is open on every one of 194 tickers.</p>
            ) : (
              <ol>
                {top.map((ticker) => (
                  <li key={ticker.symbol}>
                    <Link to={`/queue/${ticker.symbol}`} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 border-b border-line py-3 hover:bg-mint/60">
                      <AssetLogo symbol={ticker.symbol} logo={ticker.logo} size="sm" />
                      <span className="min-w-0">
                        <span className="block text-[15px] font-medium text-ink">{ticker.symbol}</span>
                        <span className="block text-[12px] text-grey-green">
                          {shares(ticker.shareEq)} sh-eq · {ticker.wallets} {ticker.wallets === 1 ? "wallet" : "wallets"} · next is #{ticker.nextPosition}
                        </span>
                      </span>
                      <span className="font-mono text-[15px] text-ink">{ticker.valueUsd === null ? "no feed" : usd(ticker.valueUsd)}</span>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
            {b.tickers.some((ticker) => ticker.valueUsd === null) ? <p className="mt-2 text-[12px] text-grey-green">Tickers without a Chainlink feed count in share-equivalents and are left out of the dollar total.</p> : null}
            {b.nextDeadline ? (
              <Link to={`/reports/${b.nextDeadline.ballotId}`} className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-line bg-paper px-4 py-3 hover:border-ink">
                <span>
                  <Mark tone="warn">Next deadline</Mark>
                  <span className="mt-1 block text-[14px] text-ink">
                    {b.nextDeadline.symbol} intent closes before the {b.nextDeadline.meetingDate} meeting
                  </span>
                </span>
                <Countdown to={b.nextDeadline.closesAt} className="font-mono text-[20px] text-ink" />
              </Link>
            ) : null}
          </div>
        </div>
      </Page>
    </section>
  );
}
