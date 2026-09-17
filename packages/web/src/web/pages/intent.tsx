import { ArrowLeft, ArrowUpRight, Check, ExternalLink, Download } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { cn } from "@/lib/utils";
import { Distribution } from "../components/bars";
import { AssetLogo } from "../components/brand";
import { Page } from "../components/layout";
import { Countdown, EventStatus, IntentLabel, ITEM_TYPE_LABEL, Recommendation } from "../components/status";
import { Button, Def, Display, Eyebrow, Input, Mark, Note, Skeleton, Spinner, Tag } from "../components/ui";
import { useWallet } from "../hooks/use-wallet";
import { dateTime, dateTimeUtc, isoDate, relative, shares, shortHash } from "../lib/format";
import { useAttest, useIntentItem, useSignIntent } from "../queries/intents";

const EFFECT: Record<string, string> = { against: "same effect as a vote against", no_effect: "no effect on the outcome", not_applicable: "does not apply" };

export default function IntentPage() {
  const params = useParams<{ id: string }>();
  const id = params.id ?? "";
  const wallet = useWallet();
  const query = useIntentItem(id, wallet.address);
  const sign = useSignIntent();
  const attest = useAttest();
  const [choice, setChoice] = useState<string | null>(null);
  const [delegate, setDelegate] = useState("");

  const data = query.data;
  const item = data?.item;
  const event = data?.ballot;
  const active = event?.status === "active";

  useEffect(() => {
    if (data?.yours) {
      setChoice(data.yours.choice);
      if (data.yours.delegate && !/^0x0{40}$/.test(data.yours.delegate)) setDelegate(data.yours.delegate);
    }
  }, [data?.yours]);

  useEffect(() => {
    if (data && !active && !data.attestation && data.tally.wallets > 0 && !attest.isPending && !attest.isError) attest.mutate({ itemId: id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.item.id, data?.attestation, active]);

  if (query.isLoading || !data || !item || !event) {
    return (
      <Page>
        <div className="pt-10">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="mt-6 h-72" />
          {query.isError ? <Note tone="danger" className="mt-6">{query.error instanceof Error ? query.error.message : "Could not load this item."}</Note> : null}
        </div>
      </Page>
    );
  }

  const tally = data.tally;
  const isDelegate = choice === "delegate";
  const canSign = Boolean(wallet.address) && Boolean(choice) && Boolean(data.power?.holds) && !sign.isPending && (!isDelegate || /^0x[a-fA-F0-9]{40}$/.test(delegate)) && !(data.yours?.choice === choice && (!isDelegate || data.yours?.delegate?.toLowerCase() === delegate.toLowerCase()));

  const timeline = [
    { label: "Published to the record", at: event.publishedAt, done: true },
    { label: "Intent cutoff", at: event.closesAt, done: !active },
    { label: "Tally attested", at: data.attestation ? Math.floor(new Date(data.attestation.createdAt).getTime() / 1000) : null, done: Boolean(data.attestation) },
    { label: `${event.meetingType === "special" ? "Special" : "Annual"} meeting`, at: null, date: event.meetingDate, done: event.meetingDate < new Date().toISOString().slice(0, 10) },
  ];

  return (
    <Page>
      <div className="flex flex-wrap items-center gap-2 pt-8 text-[13px] text-grey-green">
        <Link to="/intents" className="inline-flex items-center gap-1 hover:text-ink">
          <ArrowLeft className="size-3.5" /> Intents
        </Link>
        <span>/</span>
        <Link to={`/record/${item.symbol}`} className="inline-flex items-center gap-1.5 hover:text-ink">
          <AssetLogo symbol={item.symbol} logo={data.token?.logo} size="xs" /> {data.token?.name ?? item.symbol}
        </Link>
        <span>/</span>
        <span className="text-ink">Item {item.index}</span>
      </div>

      {/* Statement head */}
      <div className="grid gap-10 border-b border-line-2 pt-10 pb-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:items-end">
        <div className="rise">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-[13px] text-ink">{item.symbol}</span>
            <span className="eyebrow">
              {event.meetingType === "special" ? "Special" : "Annual"} meeting · {isoDate(event.meetingDate)}
            </span>
            <EventStatus status={event.status} attested={Boolean(data.attestation)} />
          </div>
          <Display as="h1" size="md" className="mt-5 max-w-[26ch]">
            <span className="font-mono mr-3 text-[16px] text-grey-green align-middle">{item.index}</span>
            {item.title}
          </Display>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Recommendation value={item.boardRecommendation} />
            <Tag>{ITEM_TYPE_LABEL[item.itemType] ?? item.itemType}</Tag>
            {item.proponent === "shareholder" ? <Tag>Shareholder proposal</Tag> : null}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-8 gap-y-5 lg:justify-items-end lg:text-right">
          <div>
            <div className="eyebrow">Record date</div>
            <div className="font-mono mt-1 text-[15px] text-ink">{event.recordDate ? isoDate(event.recordDate) : "Not stated"}</div>
          </div>
          <div>
            <div className="eyebrow">Intent cutoff</div>
            <div className="font-mono mt-1 text-[15px] text-ink">{active ? <Countdown to={event.closesAt} className="text-emerald" /> : "Closed"}</div>
            <div className="text-[11.5px] text-grey-green">{dateTimeUtc(event.closesAt)}</div>
          </div>
          <div className="col-span-2">
            <div className="eyebrow">Share-eq recorded</div>
            <div className="font-mono mt-1 text-[34px] leading-none text-ink sm:text-[44px]">{shares(tally.totalWeightFloat)}</div>
            {data.circulatingShareEq ? (
              <div className="mt-3 lg:ml-auto lg:max-w-[360px]">
                <div className="h-[6px] w-full overflow-hidden rounded-full bg-line">
                  <div className="h-full rounded-full bg-emerald transition-[width] duration-700" style={{ width: `${Math.min(100, (tally.totalWeightFloat / data.circulatingShareEq) * 100)}%` }} />
                </div>
                <div className="font-mono mt-1.5 flex justify-between text-[11.5px] text-grey-green">
                  <span>{((tally.totalWeightFloat / data.circulatingShareEq) * 100).toFixed(2)}% of circulating</span>
                  <span>{shares(data.circulatingShareEq)} circulating share-eq</span>
                </div>
              </div>
            ) : null}
            <div className="mt-2">
              <IntentLabel />
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-x-16 gap-y-12 pt-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div className="space-y-12">
          <section>
            <Eyebrow>The matter</Eyebrow>
            <p className="mt-3 max-w-[66ch] text-[17px] leading-relaxed text-ink">{item.summary}</p>
            {item.nominees.length > 0 ? (
              <div className="mt-5">
                <div className="eyebrow mb-2">Nominees</div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[14px] text-ink-2">
                  {item.nominees.map((name) => (
                    <span key={name}>{name}</span>
                  ))}
                </div>
              </div>
            ) : null}
            <dl className="mt-6 max-w-[620px]">
              <Def term="Vote required at the meeting">{item.approvalStandard ?? "As stated in the proxy"}</Def>
              <Def term="An abstention">{item.abstainEffect ? EFFECT[item.abstainEffect] : "see the proxy statement"}</Def>
              <Def term="A broker non-vote">{item.brokerNonVoteEffect ? EFFECT[item.brokerNonVoteEffect] : "see the proxy statement"}</Def>
              <Def term="NYSE Rule 452">{item.routine === null ? "Not stated" : item.routine ? "Routine" : "Non-routine"}</Def>
              <Def term="Source">
                <a href={event.docUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-emerald hover:underline">
                  {event.form} filed {isoDate(event.filedAt)} <ExternalLink className="size-3" />
                </a>
              </Def>
            </dl>
            <p className="mt-3 text-[12.5px] text-grey-green">Extracted from the filing; where the two differ, the filing governs. The board recommendation is context only and never changes the recorded intent.</p>
          </section>

          <section>
            <div className="flex items-end justify-between gap-4">
              <div>
                <Eyebrow>Public tally</Eyebrow>
                <h2 className="font-serif mt-2 text-[30px] text-ink">Intent distribution</h2>
              </div>
              <IntentLabel />
            </div>
            <Distribution rows={tally.rows} total={tally.totalWeightFloat} className="mt-6 max-w-[680px]" />
            {data.receipts.length > 0 ? (
              <div className="mt-8">
                <div className="grid grid-cols-[minmax(0,1fr)_100px_120px_110px] gap-3 border-b border-line-2 py-2">
                  <div className="eyebrow">Wallet</div>
                  <div className="eyebrow">Intent</div>
                  <div className="eyebrow text-right">Share-eq</div>
                  <div className="eyebrow text-right">Signed</div>
                </div>
                {data.receipts.map((receipt) => (
                  <Link key={receipt.id} to={`/receipts/${receipt.id}`} className="grid grid-cols-[minmax(0,1fr)_100px_120px_110px] items-center gap-3 border-b border-line py-2.5 text-[13px] hover:bg-mint/60">
                    <span className="font-mono text-[12.5px] text-ink">{receipt.wallet}</span>
                    <span className="eyebrow-ink">{receipt.choiceLabel}</span>
                    <span className="font-mono text-right text-ink">
                      {shares(receipt.weightFloat)}
                      {receipt.weightFloat !== receipt.signedWeightFloat ? <span className="ml-1 text-amber" title="Reduced at close">↓</span> : null}
                    </span>
                    <span className="text-right text-[12px] text-grey-green">{relative(receipt.createdAt)}</span>
                  </Link>
                ))}
              </div>
            ) : null}
          </section>

          <section className={cn("rounded-[16px] border p-6", data.attestation ? "border-emerald/40 bg-emerald/5" : "border-line bg-cream")}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Eyebrow>Attestation</Eyebrow>
                {data.attestation ? <Mark tone="live">Attested</Mark> : active ? <Mark tone="warn">Posts at cutoff</Mark> : <Mark tone="muted">{attest.isPending ? "Computing" : "No intent recorded"}</Mark>}
              </div>
              <span className="font-mono text-[12px] text-grey-green">{data.receipts.length} {data.receipts.length === 1 ? "receipt" : "receipts"}</span>
            </div>
            <div className="font-mono mt-4 text-[15px] leading-snug break-all text-ink sm:text-[17px]">{data.attestation ? data.attestation.merkleRoot : "0x" + "·".repeat(64)}</div>
            <p className="mt-2 text-[12.5px] leading-relaxed text-grey-green">
              {data.attestation
                ? `Merkle root over ${data.attestation.leafCount} receipts, in order, with the weight counted at cutoff. Every receipt carries its proof; anyone can recompute the root from the export without asking Redeem.`
                : active
                  ? "At the cutoff every active receipt is re-weighed against the chain and hashed into one root. Until then the tally below is live and unattested."
                  : "Nothing to attest: no wallet recorded an intent on this item before the cutoff."}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button asChild size="sm" variant={data.attestation ? "emerald" : "outline"}>
                <a href={`/api/v1/intents/${item.id}/receipts`} target="_blank" rel="noreferrer">
                  <Download className="size-3.5" /> Download receipts
                </a>
              </Button>
              <Button asChild size="sm" variant="ghost">
                <Link to="/how-it-works#faq">How to verify</Link>
              </Button>
              <span className="ml-auto text-[11.5px] text-grey-green">{data.attestation?.txHash ? `Onchain · ${shortHash(data.attestation.txHash)}` : "Published here · onchain attestation contract planned"}</span>
            </div>
            <dl className="mt-5 max-w-[680px] border-t border-line pt-2">
              <Def term="Execution">No shareholder vote is executed. Voting rights for token holders are on the issuer's roadmap.</Def>
              <Def term="Weight">Share-equivalent read from Robinhood Chain when signed, pinned to that block. Re-read at cutoff; the smaller counts.</Def>
            </dl>
          </section>
        </div>

        <aside className="space-y-8">
          <section className="surface-plain rounded-[16px] p-6">
            <div className="flex items-center justify-between">
              <Eyebrow>Your intent</Eyebrow>
              <IntentLabel />
            </div>
            {!wallet.address ? (
              <>
                <p className="mt-3 text-[14px] text-ink-2">Connect a wallet to read its {item.symbol} share-equivalent and sign. The public record above needs no wallet.</p>
                <Button className="mt-4 w-full" onClick={wallet.connect} disabled={wallet.isConnecting}>
                  {wallet.isConnecting ? <Spinner className="size-3.5" /> : null} Connect wallet
                </Button>
              </>
            ) : !data.power ? (
              <Skeleton className="mt-4 h-16" />
            ) : (
              <>
                <div className="font-mono mt-3 text-[34px] leading-none text-ink">{shares(data.power.shareEquivalentFloat)}</div>
                <div className="mt-1.5 text-[12px] text-grey-green">
                  {item.symbol} share-equivalents · block {data.power.blockNumber}
                </div>
                {data.yours ? (
                  <Note tone="emerald" className="mt-4">
                    <span className="inline-flex items-center gap-1.5 font-medium">
                      <Check className="size-3.5 text-emerald" /> Recorded: {data.yours.choiceLabel}
                    </span>
                    <span className="block text-[12.5px] text-grey-green">
                      {shares(data.yours.shareEquivalentFloat)} sh-eq · {dateTime(data.yours.createdAt)} ·{" "}
                      <Link to={`/receipts/${data.yours.id}`} className="text-emerald hover:underline">
                        receipt
                      </Link>
                    </span>
                  </Note>
                ) : null}
                {!data.power.holds ? <Note tone="warn" className="mt-4">This wallet holds no {item.symbol} on Robinhood Chain, so there is no share-equivalent to record.</Note> : null}
              </>
            )}

            {active ? (
              <div className="mt-6">
                <div className={cn("grid gap-2", item.choices.length > 4 ? "grid-cols-2" : "grid-cols-2")}>
                  {item.choices.map((option) => {
                    const selected = choice === option.value;
                    const tone = option.tone === "for" ? "emerald" : option.tone === "against" ? "rust" : "ink";
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setChoice(option.value)}
                        title={option.help}
                        className={cn(
                          "flex min-h-[64px] flex-col items-start justify-center rounded-[12px] border px-4 py-3 text-left transition-[background-color,border-color,color,transform] active:scale-[0.99]",
                          selected
                            ? tone === "emerald"
                              ? "border-emerald bg-emerald text-paper"
                              : tone === "rust"
                                ? "border-rust bg-rust text-paper"
                                : "border-ink bg-ink text-paper"
                            : "border-line-2 bg-cream text-ink hover:border-ink",
                        )}
                      >
                        <span className="font-serif text-[22px] leading-none">{option.label}</span>
                        <span className={cn("mt-1.5 text-[11px] tracking-[0.1em] uppercase", selected ? "text-paper/80" : "text-grey-green")}>{option.tone === "for" ? "counts toward" : option.tone === "against" ? "counts against" : option.value === "delegate" ? "name an address" : "present, no preference"}</span>
                      </button>
                    );
                  })}
                </div>
                {choice ? <p className="mt-2 text-[12px] text-grey-green">{choice === "abstain" && item.abstainEffect === "against" ? `Under ${event.companyName}'s standard an abstention counts against.` : item.choices.find((option) => option.value === choice)?.help}</p> : null}
                {isDelegate ? <Input value={delegate} onChange={(e) => setDelegate(e.target.value)} placeholder="Delegate address 0x…" className="font-mono mt-3 text-[13px]" /> : null}
                <Button
                  className="mt-4 w-full"
                  variant="emerald"
                  size="lg"
                  disabled={!canSign}
                  onClick={() => wallet.address && choice && sign.mutate({ wallet: wallet.address, itemId: item.id, choice, ...(isDelegate ? { delegate } : {}) })}
                >
                  {sign.isPending ? <Spinner className="size-3.5" /> : null}
                  {!wallet.address ? "Connect a wallet to sign" : data.yours && data.yours.choice === choice ? "Intent recorded" : "Sign intent · EIP-712"}
                </Button>
                {sign.isError ? <Note tone="danger" className="mt-3">{sign.error instanceof Error ? sign.error.message : "Signing failed."}</Note> : null}
                <p className="mt-3 text-[11.5px] leading-relaxed text-grey-green">A typed signature, not a transaction. No deposit, no gas, no approval. Signing again before the cutoff supersedes the earlier intent; both stay in your record.</p>
              </div>
            ) : (
              <Note className="mt-5">Intent closed {dateTimeUtc(event.closesAt)}.</Note>
            )}
          </section>

          <section>
            <Eyebrow>Status</Eyebrow>
            <ol className="mt-3">
              {timeline.map((step) => (
                <li key={step.label} className="flex items-baseline justify-between gap-4 border-b border-line py-2.5 text-[13.5px]">
                  <span className="flex items-center gap-2.5">
                    <span className={cn("size-[6px]", step.done ? "bg-ink" : "border border-line-2")} />
                    <span className={step.done ? "text-ink" : "text-grey-green"}>{step.label}</span>
                  </span>
                  <span className="font-mono text-[12px] text-grey-green">{step.at ? dateTimeUtc(step.at) : step.date ? isoDate(step.date) : "—"}</span>
                </li>
              ))}
            </ol>
            {event.meetingUrl ? (
              <a href={event.meetingUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-[12.5px] text-emerald hover:underline">
                Meeting site <ArrowUpRight className="size-3" />
              </a>
            ) : null}
          </section>

          {data.siblings.length > 1 ? (
            <section>
              <Eyebrow>Other items at this meeting</Eyebrow>
              <ol className="mt-3">
                {data.siblings
                  .filter((sibling) => sibling.id !== item.id)
                  .map((sibling) => (
                    <li key={sibling.id}>
                      <Link to={`/intents/${sibling.id}`} className="flex gap-3 border-b border-line py-2.5 text-[13.5px] text-ink-2 hover:text-ink">
                        <span className="font-mono text-[12px] text-grey-green">{sibling.index}</span>
                        <span className="line-clamp-2">{sibling.title}</span>
                      </Link>
                    </li>
                  ))}
              </ol>
            </section>
          ) : null}
          <Mark tone="muted">Independent · not affiliated with the issuer</Mark>
        </aside>
      </div>
    </Page>
  );
}
