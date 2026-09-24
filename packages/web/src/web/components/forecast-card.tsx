import { Check, ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { useWallet } from "../hooks/use-wallet";
import { dateTime, dateTimeUtc, isoDate } from "../lib/format";
import { useForecast, useSignForecast } from "../queries/forecasts";
import { Button, Eyebrow, Mark, Note, Spinner } from "./ui";

/** The standing caption on anything forecast-shaped. */
export function ForecastLabel({ className }: { className?: string }) {
  return (
    <Mark tone="muted" className={className}>
      Forecast · nothing staked · not a vote
    </Mark>
  );
}

const FILL: Record<"for" | "against" | "neutral", string> = { for: "bg-emerald", against: "bg-rust", neutral: "bg-grey-green/45" };

/**
 * One item's forecast: pick the side you think carries, sign it, watch the crowd. Any wallet may
 * forecast, holding or not, because a forecast carries no weight anywhere. It resolves against the
 * issuer's Form 8-K and scores one line on the forecast record. Money never enters.
 */
export function ForecastCard({ itemId, compact = false, className }: { itemId: string; compact?: boolean; className?: string }) {
  const wallet = useWallet();
  const query = useForecast(itemId, wallet.address);
  const sign = useSignForecast();
  const [pick, setPick] = useState<string | null>(null);
  const d = query.data;

  useEffect(() => {
    if (d?.yours) setPick(d.yours.prediction);
  }, [d?.yours?.prediction]);

  if (!d) return null;
  const canSign = Boolean(wallet.address) && Boolean(pick) && d.open && !sign.isPending && d.yours?.prediction !== pick;

  return (
    <section className={cn("rounded-[16px] border border-line bg-cream p-6", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Eyebrow>Forecast</Eyebrow>
          {d.resolution ? <Mark tone="ink">Resolved · {d.resolution.label}</Mark> : d.open ? <Mark tone="live">Open</Mark> : <Mark tone="muted">Locked</Mark>}
        </div>
        <ForecastLabel />
      </div>
      <h3 className={cn("font-serif mt-3 text-ink", compact ? "text-[20px]" : "text-[24px]")}>{d.resolution ? "How shareholders decided, and how the crowd called it." : "How will holders of record vote this?"}</h3>

      {/* The crowd */}
      <div className="mt-4 space-y-2.5">
        {d.sides.map((side) => (
          <div key={side.value}>
            <div className="flex items-baseline justify-between gap-4">
              <span className="eyebrow-ink">
                {side.label}
                {d.resolution?.carried === side.value ? <span className="ml-2 text-emerald">✓ carried</span> : null}
              </span>
              <span className="font-mono text-[13px] text-ink">
                {side.count} <span className="text-[11px] text-grey-green">{side.share.toFixed(0)}%</span>
              </span>
            </div>
            <div className="mt-1 h-[3px] w-full bg-line">
              <div className={cn("h-full transition-[width] duration-700", FILL[side.tone])} style={{ width: `${side.share}%` }} />
            </div>
          </div>
        ))}
      </div>
      <div className="font-mono mt-2 flex items-center justify-between text-[11.5px] text-grey-green">
        <span>
          {d.total} {d.total === 1 ? "forecast" : "forecasts"} · one per wallet
        </span>
        <span>{d.resolution ? `Meeting ${isoDate(d.meetingDate)}` : `Locks ${dateTimeUtc(d.locksAt)}`}</span>
      </div>

      {/* Yours */}
      {d.yours ? (
        <Note tone={d.yours.state === "correct" ? "emerald" : d.yours.state === "wrong" ? "warn" : "muted"} className="mt-4">
          <span className="inline-flex items-center gap-1.5 font-medium">
            <Check className="size-3.5" /> You called {d.yours.label} · {d.yours.state === "pending" ? "pending" : d.yours.state === "correct" ? "right" : "wrong"}
          </span>
          <span className="block text-[12.5px] text-grey-green">Signed {dateTime(d.yours.createdAt)}</span>
        </Note>
      ) : null}

      {d.open ? (
        <div className="mt-4">
          <div className="grid grid-cols-2 gap-2">
            {d.sides.map((side) => {
              const selected = pick === side.value;
              return (
                <button key={side.value} type="button" onClick={() => setPick(side.value)} className={cn("rounded-[10px] border px-3 py-2.5 text-left transition-colors", selected ? (side.tone === "against" ? "border-rust bg-rust text-paper" : "border-emerald bg-emerald text-paper") : "border-line-2 bg-paper text-ink hover:border-ink")}>
                  <span className="font-serif block text-[18px] leading-none">{side.label}</span>
                  <span className={cn("mt-1 block text-[10.5px] tracking-[0.1em] uppercase", selected ? "text-paper/80" : "text-grey-green")}>{side.tone === "for" ? "carries" : side.tone === "against" ? "does not" : "wins"}</span>
                </button>
              );
            })}
          </div>
          {!wallet.address ? (
            <Button className="mt-3 w-full" variant="outline" onClick={wallet.connect} disabled={wallet.isConnecting}>
              {wallet.isConnecting ? <Spinner className="size-3.5" /> : null} Connect to forecast
            </Button>
          ) : (
            <Button className="mt-3 w-full" variant="outline" disabled={!canSign} onClick={() => wallet.address && pick && sign.mutate({ wallet: wallet.address, itemId, prediction: pick })}>
              {sign.isPending ? <Spinner className="size-3.5" /> : null}
              {d.yours && d.yours.prediction === pick ? "Forecast recorded" : d.yours ? "Change forecast · EIP-712" : "Sign forecast · EIP-712"}
            </Button>
          )}
          {sign.isError ? <Note tone="danger" className="mt-3">{sign.error instanceof Error ? sign.error.message : "Signing failed."}</Note> : null}
          <p className="mt-3 text-[11.5px] leading-relaxed text-grey-green">
            Any wallet may forecast, holding or not; a forecast carries no weight in the tally, the queue or XP. It is scored against the issuer's Form 8-K when that is filed. Score is right minus wrong, so hedging across wallets nets to nothing.{" "}
            <Link to="/forecasts" className="text-emerald hover:underline">
              The forecast record
            </Link>
            .
          </p>
        </div>
      ) : d.resolution ? (
        <p className="mt-4 text-[12px] leading-relaxed text-grey-green">
          Resolved from the issuer's{" "}
          <a href={d.resolution.source.docUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-emerald hover:underline">
            {d.resolution.source.form} filed {isoDate(d.resolution.source.filedAt)} <ExternalLink className="size-3" />
          </a>
          . Forecasts and the result are kept side by side; neither changes the other.
        </p>
      ) : (
        <p className="mt-4 text-[12px] text-grey-green">Forecasts locked {dateTimeUtc(d.locksAt)}. They resolve when the issuer files the result on Form 8-K.</p>
      )}
    </section>
  );
}
