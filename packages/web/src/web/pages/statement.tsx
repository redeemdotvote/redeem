import { ArrowLeft, CheckCircle2, Download, Printer, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { AssetLogo } from "../components/brand";
import { Page } from "../components/layout";
import { Ledger, LHead, LRow, LTd, LTh } from "../components/ledger";
import { Button, Def, Display, Eyebrow, Note, Skeleton } from "../components/ui";
import { explorerAddress } from "../lib/chain";
import { dateTime, multiplier, shares, usd, wad } from "../lib/format";
import { useRecordBook } from "../queries/record";
import { useStatement } from "../queries/statements";

function useClientDigest(json?: string) {
  const [state, setState] = useState<{ digest: string | null; error: string | null }>({ digest: null, error: null });
  useEffect(() => {
    if (!json) return;
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) {
      setState({ digest: null, error: "No SubtleCrypto in this context — verify the file locally." });
      return;
    }
    let cancelled = false;
    subtle
      .digest("SHA-256", new TextEncoder().encode(json))
      .then((buffer) => !cancelled && setState({ digest: [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join(""), error: null }))
      .catch(() => !cancelled && setState({ digest: null, error: "Could not hash in this browser." }));
    return () => {
      cancelled = true;
    };
  }, [json]);
  return state;
}

export default function StatementPage() {
  const params = useParams<{ id: string }>();
  const query = useStatement(params.id ?? "");
  const book = useRecordBook();
  const data = query.data;
  const client = useClientDigest(data?.json);
  const matches = client.digest !== null && data ? client.digest === data.digest : null;
  const logos = new Map((book.data?.rows ?? []).map((row) => [row.symbol, row.logo]));

  const download = () => {
    if (!data) return;
    const blob = new Blob([data.json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `redeem-statement-${data.digest.slice(0, 12)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (query.isLoading || !data) {
    return (
      <Page>
        <div className="pt-10">
          <Skeleton className="h-64" />
          {query.isError ? <Note tone="danger" className="mt-6">{query.error instanceof Error ? query.error.message : "No such statement."}</Note> : null}
        </div>
      </Page>
    );
  }

  return (
    <Page className="print-page">
      <div className="no-print pt-8">
        <Link to="/portfolio" className="inline-flex items-center gap-1.5 text-[13px] text-grey-green hover:text-ink">
          <ArrowLeft className="size-3.5" /> Your record
        </Link>
      </div>
      <div className="grid gap-8 border-b border-line-2 pt-8 pb-10 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div>
          <Eyebrow ink>Certified statement</Eyebrow>
          <Display as="h1" size="md" className="mt-4">
            Positions at block {data.blockNumber}
          </Display>
          <p className="mt-3 text-[13.5px] text-grey-green">
            Robinhood Chain · observed {dateTime(data.payload.observedAt)} · chain time {dateTime(data.payload.blockTimestamp)}
          </p>
        </div>
        <div className="no-print flex gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="size-3.5" /> Print
          </Button>
          <Button variant="outline" size="sm" onClick={download}>
            <Download className="size-3.5" /> JSON
          </Button>
        </div>
      </div>
      <div className="grid gap-x-16 pt-8 lg:grid-cols-2">
        <dl>
          <Def term="Wallet" mono>
            <a href={explorerAddress(data.wallet)} target="_blank" rel="noreferrer" className="break-all hover:text-emerald">
              {data.payload.wallet}
            </a>
          </Def>
          <Def term="Positions" mono>
            {data.payload.totals.positions}
          </Def>
        </dl>
        <dl>
          <Def term="Share-equivalent" mono>
            {wad(data.payload.totals.shareEquivalent, 4)}
          </Def>
          <Def term="Value at observation" mono>
            {usd(data.payload.totals.valueUsd)}
          </Def>
        </dl>
      </div>
      <div className="mt-8">
        <Ledger>
          <LHead>
            <LTh>Position</LTh>
            <LTh align="right">Raw tokens</LTh>
            <LTh align="right">Multiplier</LTh>
            <LTh align="right">Share-equivalent</LTh>
            <LTh align="right">Value</LTh>
            <LTh>Check</LTh>
          </LHead>
          <tbody>
            {data.payload.positions.map((position) => (
              <LRow key={position.symbol}>
                <LTd>
                  <span className="flex items-center gap-2.5">
                    <AssetLogo symbol={position.symbol} logo={logos.get(position.symbol)} size="sm" />
                    <span>
                      <span className="block font-medium text-ink">{position.symbol}</span>
                      <span className="block text-[12px] text-grey-green">{position.name}</span>
                    </span>
                  </span>
                </LTd>
                <LTd align="right" mono>
                  {wad(position.rawBalance, 6)}
                </LTd>
                <LTd align="right" mono>
                  {multiplier(Number(wad(position.uiMultiplier, 10)), 8)}
                </LTd>
                <LTd align="right" mono className="text-ink">
                  {shares(Number(wad(position.shareEquivalent, 6)))}
                </LTd>
                <LTd align="right" mono>
                  {usd(position.valueUsd)}
                </LTd>
                <LTd>{position.mathVerified ? <span className="text-[12px] text-emerald">verified</span> : <span className="text-[12px] text-amber">unconfirmed</span>}</LTd>
              </LRow>
            ))}
          </tbody>
        </Ledger>
      </div>
      <section className="pt-10">
        <div className="flex items-center justify-between">
          <Eyebrow>SHA-256 digest</Eyebrow>
          {matches === null ? null : matches ? (
            <span className="inline-flex items-center gap-1 text-[12px] text-emerald">
              <CheckCircle2 className="size-3.5" /> Re-hashed in this browser · matches
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[12px] text-rust">
              <XCircle className="size-3.5" /> Browser hash differs
            </span>
          )}
        </div>
        <div className="font-mono mt-3 rounded-[10px] border border-line bg-cream p-3 text-[12px] break-all">{data.digest}</div>
        <p className="mt-2 text-[12.5px] text-grey-green">
          Server re-hash {data.recomputedDigest === data.digest ? "matches" : "differs"}. Download the JSON and run <span className="font-mono">shasum -a 256</span> on it — it must equal the digest above.
          {client.error ? ` ${client.error}` : ""}
        </p>
      </section>
      <p className="mt-8 text-[11.5px] leading-relaxed text-grey-green">{data.payload.disclosure}</p>
    </Page>
  );
}
