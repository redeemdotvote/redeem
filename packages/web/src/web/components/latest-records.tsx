import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { Link } from "wouter";
import { AssetLogo } from "./brand";
import { Page } from "./layout";
import { orpc } from "../lib/api";
import { relative, shares } from "../lib/format";

/** Counters below this many wallets say less than the record itself does, so they are not shown. */
export const COUNTER_THRESHOLD = 25;

export function useRecentRecords() {
  return useQuery(orpc.stats.recent.queryOptions({ staleTime: 15_000, refetchInterval: 30_000, placeholderData: keepPreviousData }));
}

/**
 * The latest signatures, as they arrive. Every row is a real receipt. With nothing signed yet it
 * says so, and says which number the next signature takes.
 */
export function LatestRecords({ className }: { className?: string }) {
  const recent = useRecentRecords();
  const data = recent.data;
  if (!data) return null;
  return (
    <section className={className}>
      <Page>
        <div className="flex items-center gap-4 border-y border-line py-3">
          <span className="flex shrink-0 items-center gap-2">
            <span className="relative flex size-[7px]">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald opacity-60" />
              <span className="relative inline-flex size-[7px] rounded-full bg-emerald" />
            </span>
            <span className="eyebrow">Latest records</span>
          </span>
          {data.events.length === 0 ? (
            <span className="text-[13.5px] text-ink-2">
              The file is open and nobody has signed yet.{" "}
              <Link to="/genesis" className="font-medium text-emerald hover:underline">
                The next signature is wallet #{data.nextWalletNumber}.
              </Link>
            </span>
          ) : (
            <div className="no-scrollbar tape-mask flex min-w-0 flex-1 gap-6 overflow-x-auto">
              {data.events.map((event, index) => (
                <Link key={`${event.wallet}-${event.at}-${index}`} to={`/record/${event.symbol}`} className="flex shrink-0 items-center gap-2 text-[13px] text-ink-2 hover:text-ink">
                  <AssetLogo symbol={event.symbol} logo={event.logo} size="xs" />
                  <span className="font-mono text-ink">{event.wallet}</span>
                  <span>
                    {event.kind === "intent" ? "recorded intent with" : "pre-registered"} {shares(event.shareEq)} sh-eq of {event.symbol}
                  </span>
                  <span className="text-grey-green">· {relative(event.at)}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </Page>
    </section>
  );
}
