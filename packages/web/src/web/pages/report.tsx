import { ArrowLeft, Download, ExternalLink, Printer, Share2 } from "lucide-react";
import { Link, useParams } from "wouter";
import { SplitBar } from "../components/bars";
import { AssetLogo } from "../components/brand";
import { Page } from "../components/layout";
import { ChainLogo } from "../components/robinhood-chain";
import { Countdown, IntentLabel, Recommendation } from "../components/status";
import { Button, Display, Eyebrow, Mark, Note, Skeleton } from "../components/ui";
import { dateTimeUtc, isoDate, shares, shortHash } from "../lib/format";
import { useReport } from "../queries/reports";

const ALIGNMENT: Record<string, { label: string; tone: "live" | "danger" | "warn" | "muted" }> = {
  with_board: { label: "With the board", tone: "live" },
  against_board: { label: "Against the board", tone: "danger" },
  split: { label: "No position taken", tone: "warn" },
  no_recommendation: { label: "No board position", tone: "muted" },
  no_intent: { label: "Nothing recorded", tone: "muted" },
};

/** /reports/:ballotId — the Holder Intent Report for one meeting. */
export default function ReportPage() {
  const params = useParams<{ ballotId: string }>();
  const ballotId = params.ballotId ?? "";
  const query = useReport(ballotId);
  const r = query.data;
  if (query.isLoading || !r) {
    return (
      <Page narrow>
        <div className="pt-12">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="mt-6 h-72" />
          {query.isError ? <Note tone="danger" className="mt-6">{query.error instanceof Error ? query.error.message : "No such meeting on file."}</Note> : null}
        </div>
      </Page>
    );
  }
  const { ballot, summary } = r;
  const final = r.state === "final";
  const origin = window.location.origin;
  const headline =
    summary.itemsWithIntent === 0
      ? "Nothing recorded yet."
      : summary.againstBoard > 0
        ? `Holders broke with the board on ${summary.againstBoard} of ${summary.itemsWithIntent} ${summary.itemsWithIntent === 1 ? "item" : "items"}.`
        : `Holders sided with the board on ${summary.withBoard} of ${summary.itemsWithIntent} ${summary.itemsWithIntent === 1 ? "item" : "items"}.`;
  const post = `What ${ballot.symbol} Stock Token holders ${final ? "said they would want" : "are saying they want"} at the ${isoDate(ballot.meetingDate)} meeting: ${summary.wallets} ${summary.wallets === 1 ? "wallet" : "wallets"}, ${shares(summary.shareEq)} share-eq recorded. ${headline} Intent, not a vote.${r.timestamp ? ` sha256 ${r.timestamp.digest.slice(0, 16)}…` : ""}`;
  const base = `/api/v1/reports/${ballot.id}`;

  return (
    <Page narrow>
      <div className="no-print flex flex-wrap items-center justify-between gap-3 pt-8">
        <Link to="/reports" className="inline-flex items-center gap-1.5 text-[13px] text-grey-green hover:text-ink">
          <ArrowLeft className="size-3.5" /> Reports
        </Link>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="sm" variant="ghost" onClick={() => window.print()}>
            <Printer className="size-3.5" /> Print / PDF
          </Button>
          <Button asChild size="sm" variant="outline">
            <a href={`https://x.com/intent/post?text=${encodeURIComponent(post)}&url=${encodeURIComponent(`${origin}/reports/${ballot.id}`)}`} target="_blank" rel="noreferrer">
              <Share2 className="size-3.5" /> Post on X
            </a>
          </Button>
        </div>
      </div>

      <article className="print-page">
        <header className="border-b border-line-2 pt-8 pb-8">
          <div className="flex flex-wrap items-center gap-3">
            <Eyebrow>Holder Intent Report</Eyebrow>
            {final ? <Mark tone="ink">Final</Mark> : r.state === "closed_empty" ? <Mark tone="muted">Closed · nothing recorded</Mark> : <Mark tone="live">Live · provisional</Mark>}
            <IntentLabel />
          </div>
          <div className="mt-6 flex items-center gap-4">
            <AssetLogo symbol={ballot.symbol} logo={r.token?.logo} size="lg" />
            <div>
              <div className="font-mono text-[13px] text-ink">{ballot.symbol} · Robinhood Stock Token</div>
              <div className="text-[13px] text-grey-green">
                {ballot.meetingType === "special" ? "Special" : "Annual"} meeting of stockholders · {isoDate(ballot.meetingDate)}
              </div>
            </div>
          </div>
          <Display as="h1" size="md" className="mt-6">
            {ballot.companyName}: <span className="italic">{headline}</span>
          </Display>
          <dl className="mt-8 grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-4">
            <div>
              <dt className="eyebrow">Wallets recorded</dt>
              <dd className="font-mono mt-1 text-[26px] leading-none text-ink">{summary.wallets}</dd>
            </div>
            <div>
              <dt className="eyebrow">Share-eq recorded</dt>
              <dd className="font-mono mt-1 text-[26px] leading-none text-ink">{shares(summary.shareEq)}</dd>
            </div>
            <div>
              <dt className="eyebrow">Of circulating</dt>
              <dd className="font-mono mt-1 text-[26px] leading-none text-ink">{summary.shareOfCirculating === null ? "—" : summary.shareOfCirculating > 0 && summary.shareOfCirculating < 0.01 ? "<0.01%" : `${summary.shareOfCirculating.toFixed(2)}%`}</dd>
              <div className="mt-1 text-[11.5px] text-grey-green">{summary.circulatingShareEq ? `${shares(summary.circulatingShareEq)} share-eq on chain` : ""}</div>
            </div>
            <div>
              <dt className="eyebrow">Intent cutoff</dt>
              <dd className="font-mono mt-1 text-[15px] text-ink">{ballot.status === "active" ? <Countdown to={ballot.closesAt} className="text-emerald" /> : "Closed"}</dd>
              <div className="mt-1 text-[11.5px] text-grey-green">{dateTimeUtc(ballot.closesAt)}</div>
            </div>
          </dl>
        </header>

        <section className="pt-8">
          <div className="hidden grid-cols-[minmax(0,1fr)_90px_minmax(0,220px)_150px] gap-5 border-b border-line-2 pb-2 md:grid">
            <div className="eyebrow">Item</div>
            <div className="eyebrow">Board</div>
            <div className="eyebrow">Holder intent</div>
            <div className="eyebrow text-right">Result</div>
          </div>
          <ol>
            {r.items.map((item) => {
              const a = ALIGNMENT[item.alignment] ?? ALIGNMENT.no_intent!;
              return (
                <li key={item.id} className="grid gap-3 border-b border-line py-5 md:grid-cols-[minmax(0,1fr)_90px_minmax(0,220px)_150px] md:items-center md:gap-5">
                  <div className="min-w-0">
                    <Link to={`/intents/${item.id}`} className="block text-[15px] leading-snug text-ink hover:underline">
                      <span className="font-mono mr-2 text-[12px] text-grey-green">{item.index}</span>
                      {item.title}
                    </Link>
                    {item.merkleRoot && item.leafCount > 0 ? (
                      <div className="font-mono mt-1.5 flex flex-wrap items-center gap-x-3 text-[11.5px] text-grey-green">
                        <span>root {shortHash(item.merkleRoot)}</span>
                        <span>{item.leafCount} {item.leafCount === 1 ? "receipt" : "receipts"}</span>
                        {item.timestamp?.status === "stamped" ? (
                          <a href={`/api/v1/attestations/${item.id}/proof.ots`} className="no-print text-emerald hover:underline">
                            .ots
                          </a>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <div>
                    <Recommendation value={item.boardRecommendation} />
                  </div>
                  <div className="min-w-0">
                    {item.tally.wallets > 0 ? (
                      <>
                        <div className="flex items-baseline justify-between gap-3 text-[13px]">
                          <span className="eyebrow-ink">{item.leadingLabel}</span>
                          <span className="font-mono text-[12px] text-grey-green">
                            {shares(item.tally.totalWeightFloat)} sh-eq · {item.tally.wallets}w
                          </span>
                        </div>
                        <SplitBar rows={item.tally.rows} className="mt-2" />
                      </>
                    ) : (
                      <span className="text-[12.5px] text-grey-green">No intent recorded</span>
                    )}
                  </div>
                  <div className="md:text-right">
                    <Mark tone={a.tone}>{a.label}</Mark>
                    {item.outcome ? (
                      <div className="mt-1.5 text-[11.5px] text-grey-green">
                        Shareholders: {item.outcome.forShare !== null ? `${item.outcome.forShare.toFixed(1)}% for` : (item.outcome.carried ?? "reported").replace("_", " ")}
                        {item.outcome.holdersAgreed === false ? " · holders differed" : ""}
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        <section className="mt-10 rounded-[16px] border border-line bg-cream p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Eyebrow>Proof this report was not rewritten</Eyebrow>
              {r.timestamp?.status === "stamped" ? <Mark tone="live">Timestamped</Mark> : final ? <Mark tone="warn">Stamp pending</Mark> : <Mark tone="muted">Frozen at cutoff</Mark>}
            </div>
            {r.timestamp?.stampedAt ? <span className="font-mono text-[12px] text-grey-green">{dateTimeUtc(r.timestamp.stampedAt)}</span> : null}
          </div>
          {r.timestamp ? (
            <>
              <div className="eyebrow mt-5">SHA-256 of the frozen report</div>
              <div className="font-mono mt-1 text-[14px] break-all text-ink">{r.timestamp.digest}</div>
              <p className="mt-3 max-w-[70ch] text-[13px] leading-relaxed text-ink-2">
                At the cutoff the report was frozen as canonical JSON, hashed, and the hash submitted to the public OpenTimestamps calendars, which commit it into a Bitcoin block. The proof file is "pending" for a few hours until that block confirms; after that it verifies against Bitcoin alone, without Redeem.
              </p>
              <div className="no-print mt-4 flex flex-wrap gap-2">
                <Button asChild size="sm">
                  <a href={`${base}/document`} download>
                    <Download className="size-3.5" /> Frozen report (.json)
                  </a>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <a href={`${base}/proof.ots`}>
                    <Download className="size-3.5" /> Timestamp proof (.ots)
                  </a>
                </Button>
                <Button asChild size="sm" variant="ghost">
                  <a href="https://opentimestamps.org" target="_blank" rel="noreferrer">
                    Verify at opentimestamps.org <ExternalLink className="size-3" />
                  </a>
                </Button>
              </div>
              <pre className="font-mono mt-4 overflow-x-auto rounded-[10px] bg-charcoal px-4 py-3 text-[12px] leading-relaxed text-[#cfe0d5]">{`curl -s  ${origin}${base}/document -o redeem-report-${ballot.id}.json
curl -s  ${origin}${base}/proof.ots -o redeem-report-${ballot.id}.json.ots
shasum -a 256 redeem-report-${ballot.id}.json      # ${r.timestamp.digest.slice(0, 16)}…
ots verify redeem-report-${ballot.id}.json.ots`}</pre>
            </>
          ) : (
            <p className="mt-3 max-w-[70ch] text-[13.5px] leading-relaxed text-ink-2">
              {final || r.state === "closed_empty"
                ? "No wallet recorded an intent before the cutoff, so there is nothing to freeze."
                : "This report is live and changes as holders sign. At the cutoff every receipt is re-weighed against the chain, each item gets a Merkle root, and the whole report is frozen, hashed and timestamped into Bitcoin through OpenTimestamps. No contract, no trust in Redeem."}
            </p>
          )}
        </section>

        <footer className="mt-8 border-t border-line pt-5 text-[12.5px] leading-relaxed text-grey-green">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {r.outcomeSource ? (
              <a href={r.outcomeSource.docUrl} target="_blank" rel="noreferrer" className="text-emerald hover:underline">
                Shareholder result: {r.outcomeSource.form} filed {isoDate(r.outcomeSource.filedAt)}
              </a>
            ) : null}
            <span>Source: {ballot.form} filed {isoDate(ballot.filedAt)},</span>
            <a href={ballot.docUrl} target="_blank" rel="noreferrer" className="text-emerald hover:underline">
              SEC EDGAR
            </a>
            <span className="inline-flex items-center gap-2">
              Weights read from <ChainLogo height={13} />
            </span>
          </div>
          <p className="mt-3 max-w-[80ch]">
            This report describes intent recorded by holders of the {ballot.symbol} Robinhood Stock Token, weighted by share-equivalents read from Robinhood Chain. Stock Tokens do not carry shareholder voting rights today. This is not a shareholder vote, not a proxy solicitation, and it asks no one to vote, grant a proxy or take any action at the meeting. Redeem is independent and is not affiliated with or endorsed by Robinhood or {ballot.companyName}.
          </p>
        </footer>
      </article>
    </Page>
  );
}
