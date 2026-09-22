import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useSignMessage, useSignTypedData } from "wagmi";
import { cn } from "@/lib/utils";
import { AssetLogo } from "./brand";
import { Button, Checkbox, Eyebrow, Input, Mark, Note } from "./ui";
import { useWallet } from "../hooks/use-wallet";
import { client } from "../lib/api";
import { getReferral } from "../lib/referral";
import { shares } from "../lib/format";
import { useIntentItems } from "../queries/intents";
import { usePortfolio } from "../queries/portfolio";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Record everything, in one pass. Every open proxy item for a stock the wallet holds is listed
 * with three big choices; every held stock can be added to its redemption queue. Then the wallet
 * signs each one in turn with a progress bar. Nothing is chosen for the holder: an item with no
 * choice is skipped, and the queue needs the same four acknowledgements as the long form.
 */
const UINT_FIELDS = new Set(["rawBalance", "uiMultiplier", "shareEquivalent", "block"]);
const ACKS = ["not_live", "eligibility_by_issuer", "restrictions", "no_guarantee"] as const;

type Step = { kind: "intent"; id: string; symbol: string; title: string; choice: string } | { kind: "queue"; symbol: string; shareEq: string };

export function RecordAll({ className }: { className?: string }) {
  const wallet = useWallet();
  const address = wallet.address;
  const portfolio = usePortfolio(address);
  const held = portfolio.data?.held ?? [];
  const open = useIntentItems({ status: "active", page: 1, pageSize: 50, wallet: address });
  const heldSymbols = useMemo(() => new Set(held.map((row) => row.symbol)), [held]);
  const items = (open.data?.items ?? []).filter((item) => heldSymbols.has(item.symbol) && !item.instructed);
  const { signTypedDataAsync } = useSignTypedData();
  const { signMessageAsync } = useSignMessage();
  const queryClient = useQueryClient();

  const [choices, setChoices] = useState<Record<string, string>>({});
  const [queue, setQueue] = useState<Record<string, boolean>>({});
  const [acked, setAcked] = useState(false);
  const [jurisdiction, setJurisdiction] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number; current: string; failed: string[] } | null>(null);
  const [finished, setFinished] = useState(false);

  const steps: Step[] = [
    ...items.filter((item) => choices[item.id]).map((item) => ({ kind: "intent" as const, id: item.id, symbol: item.symbol, title: item.title, choice: choices[item.id]! })),
    ...held.filter((row) => queue[row.symbol]).map((row) => ({ kind: "queue" as const, symbol: row.symbol, shareEq: row.shareEquivalentFloat.toString() })),
  ];
  const queueCount = steps.filter((step) => step.kind === "queue").length;
  const ready = steps.length > 0 && (queueCount === 0 || (acked && jurisdiction.trim().length >= 2));

  async function run() {
    if (!address) return;
    const failed: string[] = [];
    setFinished(false);
    for (const [index, step] of steps.entries()) {
      setProgress({ done: index, total: steps.length, current: step.kind === "intent" ? `${step.symbol}: ${step.title}` : `${step.symbol} redemption queue`, failed });
      try {
        if (step.kind === "intent") {
          const prepared = await client.intents.prepare({ wallet: address, itemId: step.id, choice: step.choice });
          const typed = prepared.typedData as unknown as { domain: Record<string, unknown>; types: Record<string, Array<{ name: string; type: string }>>; primaryType: string; message: Record<string, unknown> };
          const message = Object.fromEntries(Object.entries(typed.message).map(([key, value]) => [key, UINT_FIELDS.has(key) ? BigInt(value as string) : value]));
          const signature = await signTypedDataAsync({ domain: typed.domain, types: typed.types, primaryType: typed.primaryType, message } as unknown as Parameters<typeof signTypedDataAsync>[0]);
          await client.intents.commit({ challengeId: prepared.challengeId, signature, ref: getReferral() });
        } else {
          const prepared = await client.redemption.prepare({ wallet: address, symbol: step.symbol, requestedShareEquivalent: step.shareEq, jurisdiction: jurisdiction.trim(), acknowledgements: [...ACKS] });
          const signature = await signMessageAsync({ message: prepared.message });
          await client.redemption.commit({ challengeId: prepared.challengeId, signature, ref: getReferral() });
        }
      } catch (error) {
        failed.push(`${step.kind === "intent" ? step.title : `${step.symbol} queue`}: ${error instanceof Error ? error.message.split("\n")[0] : "failed"}`);
      }
    }
    setProgress({ done: steps.length, total: steps.length, current: "", failed });
    setFinished(true);
    void queryClient.invalidateQueries();
  }

  if (!address) return null;
  if (portfolio.isLoading || open.isLoading) return null;
  if (held.length === 0) return null;

  return (
    <section id="record" className={cn("scroll-mt-24 rounded-[16px] border border-line bg-cream p-6", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Eyebrow>Record everything</Eyebrow>
          <h2 className="font-serif mt-1 text-[28px] text-ink">One pass. A signature each. No gas.</h2>
        </div>
        <Mark tone="muted">Intent · not a vote · not a redemption</Mark>
      </div>

      {progress ? (
        <div className="mt-6">
          <div className="h-[6px] w-full overflow-hidden rounded-full bg-line">
            <div className="h-full rounded-full bg-emerald transition-[width] duration-300" style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} />
          </div>
          <div className="mt-2 flex justify-between text-[13px]">
            <span className="text-ink">{finished ? `Done: ${progress.total - progress.failed.length} of ${progress.total} recorded.` : `Signing ${progress.done + 1} of ${progress.total}: ${progress.current}`}</span>
            <span className="font-mono text-grey-green">{progress.done}/{progress.total}</span>
          </div>
          {progress.failed.length > 0 ? (
            <Note tone="warn" className="mt-3">
              {progress.failed.map((line) => (
                <span key={line} className="block text-[12.5px]">
                  {line}
                </span>
              ))}
            </Note>
          ) : null}
          {finished ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild>
                <Link to={`/w/${address}`}>See your record</Link>
              </Button>
              <Button variant="ghost" onClick={() => setProgress(null)}>
                Back
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <>
          {items.length > 0 ? (
            <div className="mt-5">
              <div className="eyebrow">Open proxy items for stocks you hold · pick a choice or leave it</div>
              <ol className="mt-2 border-t border-line-2">
                {items.map((item) => (
                  <li key={item.id} className="grid gap-3 border-b border-line py-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                    <span className="flex min-w-0 items-start gap-3">
                      <AssetLogo symbol={item.symbol} logo={item.logo} size="sm" className="mt-0.5" />
                      <span className="min-w-0">
                        <span className="block truncate text-[14.5px] text-ink">
                          <span className="font-mono mr-2 text-[12px] text-grey-green">{item.index}</span>
                          {item.title}
                        </span>
                        <span className="block text-[12px] text-grey-green">
                          {item.symbol} · board: {item.boardRecommendation} ·{" "}
                          <Link to={`/intents/${item.id}`} className="text-emerald hover:underline">
                            details
                          </Link>
                        </span>
                      </span>
                    </span>
                    <span className="flex gap-1.5">
                      {item.choices
                        .filter((choice) => choice.value !== "delegate")
                        .map((choice) => {
                          const selected = choices[item.id] === choice.value;
                          return (
                            <button key={choice.value} type="button" onClick={() => setChoices((prev) => ({ ...prev, [item.id]: selected ? "" : choice.value }))} className={cn("h-9 rounded-[8px] border px-3 text-[12.5px] font-medium transition-colors", selected ? (choice.tone === "for" ? "border-emerald bg-emerald text-paper" : choice.tone === "against" ? "border-rust bg-rust text-paper" : "border-ink bg-ink text-paper") : "border-line-2 bg-paper text-ink hover:border-ink")}>
                              {choice.label}
                            </button>
                          );
                        })}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            <p className="mt-4 text-[14px] text-grey-green">No open proxy items for the stocks you hold right now.</p>
          )}

          <div className="mt-6">
            <div className="eyebrow">Pre-register for redemption · your full holding, per stock</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {held.map((row) => (
                <button key={row.symbol} type="button" onClick={() => setQueue((prev) => ({ ...prev, [row.symbol]: !prev[row.symbol] }))} className={cn("inline-flex h-9 items-center gap-2 rounded-[8px] border px-3 text-[13px] transition-colors", queue[row.symbol] ? "border-ink bg-ink text-paper" : "border-line-2 bg-paper text-ink hover:border-ink")}>
                  <AssetLogo symbol={row.symbol} logo={row.logo} size="xs" /> {row.symbol} <span className={queue[row.symbol] ? "text-paper/70" : "text-grey-green"}>{shares(row.shareEquivalentFloat)}</span>
                </button>
              ))}
              <button type="button" onClick={() => setQueue(Object.fromEntries(held.map((row) => [row.symbol, true])))} className="h-9 px-2 text-[12.5px] text-emerald hover:underline">
                all
              </button>
            </div>
            {queueCount > 0 ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px]">
                <Checkbox checked={acked} onChange={setAcked} label={<span className="text-[13px]">I acknowledge that in-kind redemption is not live, that Robinhood alone decides eligibility, that restrictions may apply, and that a queue place guarantees nothing.</span>} />
                <Input value={jurisdiction} onChange={(event) => setJurisdiction(event.target.value)} placeholder="Jurisdiction, e.g. US" className="h-9 text-[13px]" />
              </div>
            ) : null}
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button size="lg" variant="emerald" disabled={!ready} onClick={run}>
              Sign {steps.length || ""} {steps.length === 1 ? "record" : "records"}
            </Button>
            <span className="text-[12.5px] text-grey-green">Your wallet asks once per record. Each is a signature, never a transaction.</span>
          </div>
        </>
      )}
    </section>
  );
}
