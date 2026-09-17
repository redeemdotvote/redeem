import { useEffect, useMemo, useState } from "react";
import { Link, useSearch } from "wouter";
import { cn } from "@/lib/utils";
import { RecordCards } from "../components/record-cards";
import { ChainLine, PostRef } from "../components/robinhood-chain";
import { AssetLogo } from "../components/brand";
import { Page } from "../components/layout";
import { Num } from "../components/number";
import { Button, Checkbox, Def, Display, Eyebrow, FieldLabel, Input, Mark, Note, Select, Skeleton, Spinner } from "../components/ui";
import { useWallet } from "../hooks/use-wallet";
import { dateTime, relative, shares } from "../lib/format";
import { usePortfolio } from "../queries/portfolio";
import { useRedemptionStatus, useRedemptionTerms, useRequestRedemption } from "../queries/redemption";

const ACKS: Array<{ key: "not_live" | "eligibility_by_issuer" | "restrictions" | "no_guarantee"; label: string }> = [
  { key: "not_live", label: "In-kind redemption is on the issuer's roadmap and is not currently live." },
  { key: "eligibility_by_issuer", label: "Robinhood, not Redeem, determines actual redemption eligibility. Redeem is not the issuer and does not custody tokens." },
  { key: "restrictions", label: "Availability is subject to issuer and platform rules; geographical restrictions apply and US persons may be restricted where applicable." },
  { key: "no_guarantee", label: "Joining the queue records a signed request and does not guarantee redemption, settlement or priority." },
];

const STATES = [
  ["Ready pack", "Every acknowledgement on file, jurisdiction stated, request within the held share-equivalent."],
  ["Waiting", "In the ticker's queue, in the order signatures arrived. No window is open."],
  ["Restricted", "Jurisdiction or issuer rule may exclude the request. Recorded, flagged, not promised."],
  ["Future window", "The issuer has not opened redemption. Every request sits here until it does."],
  ["Not eligible", "Determined by the issuer when a window opens — never by Redeem."],
  ["Not available", "The current state of in-kind redemption for every Stock Token."],
];

export default function RedeemPage() {
  const wallet = useWallet();
  const search = useSearch();
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const [symbol, setSymbol] = useState(params.get("symbol") ?? "");
  const [amount, setAmount] = useState("");
  const [jurisdiction, setJurisdiction] = useState("");
  const [acks, setAcks] = useState<Record<string, boolean>>({});
  const terms = useRedemptionTerms();
  const status = useRedemptionStatus(wallet.address, symbol || undefined);
  const portfolio = usePortfolio(wallet.address);
  const request = useRequestRedemption();

  useEffect(() => setSymbol(params.get("symbol") ?? ""), [params]);

  const held = portfolio.data?.held ?? [];
  const position = held.find((row) => row.symbol === symbol);
  useEffect(() => {
    if (!symbol && held[0]) setSymbol(held[0].symbol);
  }, [held, symbol]);

  const allAcked = ACKS.every((ack) => acks[ack.key]);
  const mine = status.data?.mine.find((row) => row.symbol === symbol) ?? null;
  const readiness = allAcked && jurisdiction.trim().length >= 2 && Number(amount) > 0 && position && Number(amount) <= position.shareEquivalentFloat ? "pack_complete" : "incomplete";

  return (
    <>
      <section className="env-mint relative overflow-hidden">
        <Page className="relative">
          <div className="grid gap-8 py-14 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-center lg:py-20">
            <div className="rise">
              <div className="flex flex-wrap items-center gap-4">
                <Eyebrow>Redemption readiness</Eyebrow>
                <Mark tone="warn">Not currently live</Mark>
              </div>
              <Display as="h1" size="xl" className="mt-5">
                In-kind readiness, <span className="italic">per security.</span>
              </Display>
              <div className="mt-6">
                <PostRef />
              </div>
              <p className="mt-4 max-w-[56ch] text-[16px] leading-relaxed text-ink-2">
                Robinhood has said 1:1 redemption of Stock Tokens for shares is on its roadmap. Redeem packages demand and eligibility acknowledgements now — a signed, numbered request per ticker, weighted by what the wallet holds — so the file is complete before any window opens. Nothing here promises settlement.
              </p>
              <div className="mt-6">
                <ChainLine caption="Queues per security on" />
              </div>
              <dl className="mt-8 grid max-w-[560px] grid-cols-3 gap-x-8">
                <div>
                  <dt className="eyebrow">Requests</dt>
                  <dd className="font-mono mt-1.5 text-[24px] text-ink">{status.data ? status.data.total : <Skeleton className="h-7 w-10" />}</dd>
                </div>
                <div>
                  <dt className="eyebrow">Share-eq requested</dt>
                  <dd className="font-mono mt-1.5 text-[24px] text-ink">{status.data ? <Num value={status.data.totalRequested} format={shares} /> : <Skeleton className="h-7 w-16" />}</dd>
                </div>
                <div>
                  <dt className="eyebrow">Wallets</dt>
                  <dd className="font-mono mt-1.5 text-[24px] text-ink">{status.data ? status.data.wallets : <Skeleton className="h-7 w-10" />}</dd>
                </div>
              </dl>
            </div>
            <div className="relative hidden lg:block">
              <RecordCards front="queue" labels={["#1", "#2", "#3"]} className="ml-auto max-w-[520px]" />
            </div>
          </div>
        </Page>
      </section>

      <Page>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-b border-line-2 py-5 sm:grid-cols-3 lg:grid-cols-6">
          {(
            [
              ["Window status", "Not open", "warn"],
              ["Ticker", symbol || "—", "ink"],
              ["Queue depth", status.data?.selected ? `${shares(status.data.selected.requested)} sh-eq · ${status.data.selected.requests} req` : "—", "ink"],
              ["Your request", mine ? `${shares(mine.requested)} sh-eq · #${mine.position}` : "None", "ink"],
              ["Ready pack", mine ? (mine.readiness === "pack_complete" ? "Complete" : "Incomplete") : readiness === "pack_complete" ? "Complete" : "Preparing", mine || readiness === "pack_complete" ? "live" : "muted"],
              ["Terms hash", terms.data ? `${terms.data.termsHash.slice(0, 10)}…` : "—", "ink"],
            ] as Array<[string, string, string]>
          ).map(([label, value, tone]) => (
            <div key={label} className="min-w-0">
              <dt className="eyebrow">{label}</dt>
              <dd className={cn("font-mono mt-1.5 flex items-center gap-2 text-[14px] whitespace-nowrap", tone === "warn" ? "text-amber" : tone === "live" ? "text-emerald" : tone === "muted" ? "text-grey-green" : "text-ink")}>
                {tone === "warn" || tone === "live" ? <span className={cn("size-[6px]", tone === "warn" ? "bg-amber" : "bg-emerald")} /> : null}
                {value}
              </dd>
            </div>
          ))}
        </dl>
        <div className="grid gap-x-16 gap-y-14 pt-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          {/* Facility */}
          <section className="surface rounded-[18px] p-6 sm:p-8">
            <div className="flex items-center justify-between">
              <Eyebrow ink>Enter the facility</Eyebrow>
              <Mark tone="warn">Future window</Mark>
            </div>
            {!wallet.address ? (
              <>
                <p className="mt-4 text-[14.5px] text-ink-2">Connect the wallet that holds the Stock Tokens. The request is a plain-text signature over facts the server reads from chain — never a transfer.</p>
                <Button className="mt-5 w-full" size="lg" onClick={wallet.connect} disabled={wallet.isConnecting}>
                  {wallet.isConnecting ? <Spinner className="size-3.5" /> : null} Connect wallet
                </Button>
              </>
            ) : portfolio.isLoading ? (
              <Skeleton className="mt-5 h-40" />
            ) : held.length === 0 ? (
              <Note className="mt-5">This wallet holds no Stock Tokens on Robinhood Chain, so there is nothing to place in a queue.</Note>
            ) : mine ? (
              <div className="mt-5">
                <div className="font-mono text-[44px] leading-none text-ink">#{mine.position}</div>
                <div className="eyebrow mt-2">Your place in the {mine.symbol} queue</div>
                <dl className="mt-5">
                  <Def term="Requested" mono>
                    {shares(mine.requested)} sh-eq
                  </Def>
                  <Def term="Held at signing" mono>
                    {shares(mine.held)} sh-eq
                  </Def>
                  <Def term="Priority">Standard</Def>
                  <Def term="Readiness">{mine.readiness === "pack_complete" ? <span className="text-emerald">Pack complete</span> : "Incomplete"}</Def>
                  <Def term="Status">Waiting · future window</Def>
                  <Def term="Jurisdiction">{mine.jurisdiction}</Def>
                  <Def term="Signed" mono>
                    {dateTime(mine.createdAt)}
                  </Def>
                </dl>
                <p className="mt-4 text-[12px] text-grey-green">Change the ticker above the queue to place a request for another security.</p>
              </div>
            ) : (
              <div className="mt-5 space-y-5">
                <div>
                  <FieldLabel htmlFor="ticker">Ticker</FieldLabel>
                  <Select id="ticker" value={symbol} onChange={(event) => setSymbol(event.target.value)} className="h-11 w-full text-[15px]">
                    {held.map((row) => (
                      <option key={row.symbol} value={row.symbol}>
                        {row.symbol} · {shares(row.shareEquivalentFloat)} sh-eq held
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <FieldLabel htmlFor="amount">Requested share-equivalent</FieldLabel>
                  <div className="relative">
                    <Input id="amount" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ""))} placeholder="0.0000" className="font-mono pr-20 text-[17px]" />
                    <button type="button" onClick={() => position && setAmount(position.shareEquivalentFloat.toFixed(6))} className="absolute top-1/2 right-3 -translate-y-1/2 text-[11px] font-medium tracking-[0.12em] text-emerald uppercase">
                      Max
                    </button>
                  </div>
                  {position ? <p className="mt-1.5 text-[12px] text-grey-green">Held: {shares(position.shareEquivalentFloat)} sh-eq · block {portfolio.data?.blockNumber}</p> : null}
                </div>
                <div>
                  <FieldLabel htmlFor="jurisdiction">Jurisdiction of residence</FieldLabel>
                  <Input id="jurisdiction" value={jurisdiction} onChange={(event) => setJurisdiction(event.target.value)} placeholder="e.g. Singapore" />
                </div>
                <div>
                  <FieldLabel>Eligibility acknowledgements</FieldLabel>
                  <div className="space-y-3">
                    {ACKS.map((ack) => (
                      <Checkbox key={ack.key} checked={Boolean(acks[ack.key])} onChange={(value) => setAcks((prev) => ({ ...prev, [ack.key]: value }))} label={ack.label} />
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between border-t border-line pt-4 text-[12.5px]">
                  <span className="eyebrow">Terms hash</span>
                  <span className="font-mono text-grey-green">{terms.data ? `${terms.data.termsHash.slice(0, 10)}…${terms.data.termsHash.slice(-6)}` : "—"}</span>
                </div>
                <div className="flex items-center justify-between text-[12.5px]">
                  <span className="eyebrow">Readiness</span>
                  <span className={cn("font-mono", readiness === "pack_complete" ? "text-emerald" : "text-grey-green")}>{readiness === "pack_complete" ? "Pack complete" : "Incomplete"}</span>
                </div>
                <Button
                  className="w-full"
                  size="lg"
                  variant="emerald"
                  disabled={readiness !== "pack_complete" || request.isPending}
                  onClick={() => wallet.address && request.mutate({ wallet: wallet.address, symbol, requestedShareEquivalent: amount, jurisdiction, acknowledgements: ACKS.map((ack) => ack.key) })}
                >
                  {request.isPending ? <Spinner className="size-3.5" /> : null} Sign and enter the {symbol || ""} queue
                </Button>
                {request.isError ? <Note tone="danger">{request.error instanceof Error ? request.error.message : "Could not record the request."}</Note> : null}
              </div>
            )}
          </section>

          {/* Queues */}
          <div className="space-y-12">
            <section>
              <Eyebrow>Ticker-specific queues</Eyebrow>
              <h2 className="font-serif mt-2 text-[30px] text-ink">Demand on file</h2>
              {status.isLoading ? (
                <Skeleton className="mt-5 h-32" />
              ) : (status.data?.queues.length ?? 0) === 0 ? (
                <p className="mt-4 text-[14px] text-grey-green">No requests yet. The first one opens a queue for its ticker.</p>
              ) : (
                <ol className="mt-5 border-t border-line-2">
                  {status.data!.queues.map((queue) => {
                    const max = status.data!.queues[0]?.requested || 1;
                    return (
                      <li key={queue.symbol} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 border-b border-line py-4">
                        <AssetLogo symbol={queue.symbol} logo={queue.logo} size="sm" />
                        <div className="min-w-0">
                          <div className="flex items-baseline justify-between gap-4">
                            <span className="text-[15px] font-medium text-ink">
                              {queue.symbol} <span className="text-[12px] font-normal text-grey-green">{queue.name}</span>
                            </span>
                            <span className="font-mono text-[13.5px] text-ink">{shares(queue.requested)} sh-eq</span>
                          </div>
                          <div className="mt-2 h-[3px] w-full bg-line">
                            <div className="h-full bg-emerald" style={{ width: `${(queue.requested / max) * 100}%` }} />
                          </div>
                        </div>
                        <span className="font-mono text-[12px] text-grey-green">
                          {queue.requests} req
                        </span>
                      </li>
                    );
                  })}
                </ol>
              )}
              {(status.data?.recent.length ?? 0) > 0 ? (
                <ol className="mt-6">
                  {status.data!.recent.map((row) => (
                    <li key={`${row.symbol}-${row.position}`} className="flex items-center justify-between gap-4 border-b border-line py-2 text-[13px]">
                      <span className="font-mono text-ink">
                        {row.symbol} · #{row.position} · {row.wallet}
                      </span>
                      <span className="font-mono text-grey-green">
                        {shares(row.requested)} sh-eq · {relative(row.createdAt)}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : null}
            </section>

            <section>
              <Eyebrow>Queue states</Eyebrow>
              <dl className="mt-3 grid gap-x-10 sm:grid-cols-2">
                {STATES.map(([label, body]) => (
                  <div key={label} className="border-b border-line py-3.5">
                    <dt className="eyebrow-ink">{label}</dt>
                    <dd className="mt-1 text-[13.5px] leading-relaxed text-ink-2">{body}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section>
              <Eyebrow>Eligibility, plainly</Eyebrow>
              <ul className="mt-3 max-w-[64ch] space-y-2 text-[14px] leading-relaxed text-ink-2">
                {(terms.data?.terms ?? "").split("\n").map((line) => (
                  <li key={line} className="flex gap-3">
                    <span className="mt-[9px] size-[5px] shrink-0 bg-grey-green/60" />
                    {line}
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-[12.5px] text-grey-green">
                See also{" "}
                <Link to="/how-it-works#plainly" className="text-emerald hover:underline">
                  what Redeem is not
                </Link>
                .
              </p>
            </section>
          </div>
        </div>
      </Page>
    </>
  );
}
