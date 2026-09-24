import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { AssetLogo } from "../components/brand";
import { ForecastLabel } from "../components/forecast-card";
import { Page, PageHead } from "../components/layout";
import { ChainLine } from "../components/robinhood-chain";
import { Mark, Skeleton } from "../components/ui";
import { useWallet } from "../hooks/use-wallet";
import { dateTimeUtc, isoDate, shortAddress } from "../lib/format";
import { useForecastBoard, useWalletForecasts } from "../queries/forecasts";

/**
 * The forecast record. Who has called shareholder votes right, which open items the crowd is
 * calling, and what just resolved. Every number comes from signed forecasts scored against the
 * issuer's own Form 8-K. Nothing was staked to make any of it.
 */
export default function ForecastsPage() {
  const board = useForecastBoard();
  const wallet = useWallet();
  const mine = useWalletForecasts(wallet.address);
  const d = board.data;
  return (
    <Page>
      <PageHead
        eyebrow={<span className="inline-flex flex-wrap items-center gap-4">Forecast record <ChainLine caption={null} /></span>}
        title={
          <>
            Call the vote <span className="italic">before</span> the vote.
          </>
        }
        body="Any wallet can forecast how holders of record will vote an item. Forecasts lock with intent, resolve against the issuer's Form 8-K, and score right minus wrong. Nothing is staked, nothing is paid out, and a forecast never touches a tally, a queue or XP."
        aside={
          d ? (
            <div className="grid grid-cols-2 gap-x-10 gap-y-4 sm:grid-cols-4">
              <div>
                <div className="eyebrow">Forecasters</div>
                <div className="font-mono mt-1 text-[26px] text-ink">{d.forecasters}</div>
              </div>
              <div>
                <div className="eyebrow">Forecasts</div>
                <div className="font-mono mt-1 text-[26px] text-ink">{d.forecasts}</div>
              </div>
              <div>
                <div className="eyebrow">Resolved</div>
                <div className="font-mono mt-1 text-[26px] text-ink">{d.resolved}</div>
              </div>
              <div>
                <div className="eyebrow">Crowd right</div>
                <div className="font-mono mt-1 text-[26px] text-ink">{d.crowdAccuracy === null ? "—" : `${d.crowdAccuracy.toFixed(0)}%`}</div>
              </div>
            </div>
          ) : null
        }
      />

      {wallet.address && mine.data ? (
        <div className="surface-plain mb-10 flex flex-wrap items-center justify-between gap-4 rounded-[14px] px-5 py-4">
          <div>
            <div className="eyebrow">Your forecast record</div>
            <div className="font-mono mt-1 text-[15px] text-ink">
              {mine.data.record ? (
                <>
                  Score {mine.data.record.score} · {mine.data.record.correct} right · {mine.data.record.wrong} wrong · {mine.data.record.pending} pending{mine.data.rank ? ` · #${mine.data.rank} of ${mine.data.of}` : ""}
                </>
              ) : (
                "No forecasts yet."
              )}
            </div>
          </div>
          {mine.data.forecasts.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {mine.data.forecasts.slice(0, 8).map((row) => (
                <Link key={row.id} to={`/intents/${row.itemId}`} className={cn("font-mono rounded-[8px] border px-2 py-1 text-[11.5px]", row.state === "correct" ? "border-emerald/50 text-emerald" : row.state === "wrong" ? "border-rust/50 text-rust" : "border-line-2 text-ink")}>
                  {row.symbol} {row.index} · {row.label}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {!d ? (
        <Skeleton className="h-64" />
      ) : (
        <div className="grid gap-x-12 gap-y-12 border-t border-line-2 pt-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <section>
            <h2 className="font-serif text-[26px] text-ink">Best callers</h2>
            <p className="mt-1 text-[13px] text-grey-green">Score is right minus wrong on resolved items. Pending forecasts do not count until the issuer files.</p>
            {d.top.length === 0 ? (
              <p className="mt-6 text-[14px] text-grey-green">
                Nobody has forecast yet. Open any live item and call it:{" "}
                <Link to="/intents?status=active" className="text-emerald hover:underline">
                  open items
                </Link>
                .
              </p>
            ) : (
              <ol className="mt-4 border-t border-line-2">
                {d.top.map((row, index) => (
                  <li key={row.wallet} className="flex items-center justify-between gap-3 border-b border-line py-3">
                    <span className="flex items-center gap-3">
                      <span className="font-mono w-8 text-[13px] text-grey-green">{index + 1}</span>
                      <Link to={`/w/${row.wallet}`} className="font-mono text-[13.5px] text-ink hover:underline">
                        {shortAddress(row.wallet, 5)}
                      </Link>
                    </span>
                    <span className="font-mono flex flex-col items-end text-[12px] text-grey-green sm:flex-row sm:items-baseline sm:gap-3">
                      <span className={cn("text-[13.5px]", row.score > 0 ? "text-emerald" : row.score < 0 ? "text-rust" : "text-ink")}>{row.score > 0 ? `+${row.score}` : row.score}</span>
                      <span className="whitespace-nowrap">
                        {row.correct}✓ {row.wrong}✗ {row.pending} open
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <div className="space-y-12">
            <section>
              <div className="flex items-end justify-between gap-4">
                <div>
                  <h2 className="font-serif text-[26px] text-ink">Open calls</h2>
                  <p className="mt-1 text-[13px] text-grey-green">Items the crowd is forecasting now. Locks with the intent cutoff.</p>
                </div>
                <ForecastLabel />
              </div>
              {d.open.length === 0 ? (
                <p className="mt-6 text-[14px] text-grey-green">
                  No open forecasts yet. Every live item takes one:{" "}
                  <Link to="/intents?status=active" className="text-emerald hover:underline">
                    open items
                  </Link>
                  .
                </p>
              ) : (
                <ol className="mt-4 border-t border-line-2">
                  {d.open.map((item) => (
                    <li key={item.id}>
                      <Link to={`/intents/${item.id}`} className="grid gap-2 border-b border-line py-3.5 transition-colors hover:bg-cream sm:grid-cols-[minmax(0,1fr)_170px] sm:items-center">
                        <span className="flex min-w-0 items-start gap-3">
                          <AssetLogo symbol={item.symbol} logo={item.logo} size="sm" />
                          <span className="min-w-0">
                            <span className="block truncate text-[14.5px] text-ink">
                              <span className="font-mono mr-2 text-[12px] text-grey-green">{item.symbol} {item.index}</span>
                              {item.title}
                            </span>
                            <span className="mt-0.5 block text-[12px] text-grey-green">Locks {dateTimeUtc(item.locksAt)}</span>
                          </span>
                        </span>
                        <span className="font-mono text-[12.5px] text-ink sm:text-right">
                          {item.leading ? `${item.leading.share.toFixed(0)}% say ${item.leading.label.toLowerCase()}` : "no calls"} · {item.total}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <section>
              <h2 className="font-serif text-[26px] text-ink">Recently resolved</h2>
              <p className="mt-1 text-[13px] text-grey-green">What the crowd called against what the issuer reported.</p>
              {d.recentlyResolved.length === 0 ? (
                <p className="mt-6 text-[14px] text-grey-green">Nothing has resolved yet. The first result lands when an issuer files its 8-K for a forecast item.</p>
              ) : (
                <ol className="mt-4 border-t border-line-2">
                  {d.recentlyResolved.map((item) => (
                    <li key={item.id}>
                      <Link to={`/intents/${item.id}`} className="grid gap-2 border-b border-line py-3.5 transition-colors hover:bg-cream sm:grid-cols-[minmax(0,1fr)_220px] sm:items-center">
                        <span className="flex min-w-0 items-start gap-3">
                          <AssetLogo symbol={item.symbol} logo={item.logo} size="sm" />
                          <span className="min-w-0">
                            <span className="block truncate text-[14.5px] text-ink">
                              <span className="font-mono mr-2 text-[12px] text-grey-green">{item.symbol} {item.index}</span>
                              {item.title}
                            </span>
                            <span className="mt-0.5 block text-[12px] text-grey-green">Meeting {isoDate(item.meetingDate)} · resolved {item.resolution!.label.toLowerCase()}</span>
                          </span>
                        </span>
                        <span className="flex items-center gap-2 sm:justify-end">
                          <span className="font-mono text-[12.5px] text-ink">{item.leading ? `${item.leading.share.toFixed(0)}% said ${item.leading.label.toLowerCase()}` : "no calls"}</span>
                          {item.crowdRight === null ? null : <Mark tone={item.crowdRight ? "live" : "warn"}>{item.crowdRight ? "Crowd right" : "Crowd wrong"}</Mark>}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        </div>
      )}
      <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-grey-green">
        <Mark tone="muted">Nothing staked · not a vote · not advice</Mark>
        <span>Forecasts exist so the record shows what people expected before the result was known. Redeem takes no money on them and pays none out. The REDEEM token has no role here.</span>
      </div>
    </Page>
  );
}
