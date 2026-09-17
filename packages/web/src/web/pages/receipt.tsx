import { ArrowLeft, CheckCircle2, Download, Printer, XCircle } from "lucide-react";
import { Link, useParams } from "wouter";
import { AssetLogo } from "../components/brand";
import { Page } from "../components/layout";
import { IntentLabel } from "../components/status";
import { Button, Def, Display, Eyebrow, Mark, Note, Skeleton } from "../components/ui";
import { explorerAddress } from "../lib/chain";
import { dateTime, isoDate, shares, wad } from "../lib/format";
import { useReceipt } from "../queries/intents";

export default function ReceiptPage() {
  const params = useParams<{ id: string }>();
  const query = useReceipt(params.id ?? "");
  const data = query.data;

  if (query.isLoading || !data) {
    return (
      <Page>
        <div className="pt-10">
          <Skeleton className="h-64" />
          {query.isError ? <Note tone="danger" className="mt-6">{query.error instanceof Error ? query.error.message : "No such receipt."}</Note> : null}
        </div>
      </Page>
    );
  }

  const download = () => {
    const bundle = { schema: "redeem.receipt-bundle.v1", note: "Intent, not a shareholder vote.", receipt: data.canonical, typedData: data.typedData, signature: data.signature, proof: data.proof, attestation: data.attestation ? { merkleRoot: data.attestation.merkleRoot, leafCount: data.attestation.leafCount, blockNumber: data.attestation.blockNumber } : null };
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `redeem-intent-${data.id.slice(0, 8)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const isDelegate = data.choice === "delegate";

  return (
    <Page className="print-page">
      <div className="no-print pt-8">
        <Link to="/portfolio" className="inline-flex items-center gap-1.5 text-[13px] text-grey-green hover:text-ink">
          <ArrowLeft className="size-3.5" /> Your record
        </Link>
      </div>
      <div className="grid gap-8 border-b border-line-2 pt-8 pb-10 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <Eyebrow ink>Intent receipt</Eyebrow>
            {data.status === "superseded" ? <Mark tone="muted">Superseded</Mark> : <Mark tone="live">Active</Mark>}
            {data.attestation ? <Mark tone="emerald">Attested</Mark> : null}
            <IntentLabel />
          </div>
          <div className="mt-6 flex items-center gap-4">
            <AssetLogo symbol={data.symbol} logo={data.token?.logo} size="lg" />
            <Display as="h1" size="md">
              {data.choiceLabel} · {data.symbol}
            </Display>
          </div>
          <p className="mt-4 max-w-[70ch] text-[14.5px] text-ink-2">
            <Link to={`/intents/${data.item.id}`} className="text-emerald hover:underline">
              Item {data.item.index}: {data.item.title}
            </Link>{" "}
            · {data.ballot.companyName} · meeting {isoDate(data.ballot.meetingDate)}
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

      <div className="grid gap-x-16 gap-y-10 pt-10 lg:grid-cols-2">
        <dl>
          <Def term="Signer" mono>
            <a href={explorerAddress(data.wallet)} target="_blank" rel="noreferrer" className="break-all hover:text-emerald">
              {data.wallet}
            </a>
          </Def>
          <Def term="Token contract" mono>
            <span className="break-all">{data.contractAddress}</span>
          </Def>
          {isDelegate ? (
            <Def term="Delegate" mono>
              <span className="break-all">{data.delegate}</span>
            </Def>
          ) : null}
          <Def term="Signed at" mono>
            {dateTime(data.createdAt)}
          </Def>
          <Def term="Block" mono>
            {data.blockNumber}
          </Def>
        </dl>
        <dl>
          <Def term="Raw balance" mono>
            {wad(data.rawBalance, 6)}
          </Def>
          <Def term="uiMultiplier" mono>
            {wad(data.uiMultiplier, 8)}
          </Def>
          <Def term="Signed share-equivalent" mono>
            {shares(data.shareEquivalentFloat)}
          </Def>
          <Def term="Counted at cutoff" mono>
            {data.closeWeight ? shares(data.countedWeightFloat) : "Pending cutoff"}
          </Def>
        </dl>
      </div>

      <div className="grid gap-x-16 gap-y-12 pt-12 lg:grid-cols-2">
        <section>
          <div className="flex items-center justify-between">
            <Eyebrow>Signature</Eyebrow>
            {data.signatureValid ? (
              <span className="inline-flex items-center gap-1 text-[12px] text-emerald">
                <CheckCircle2 className="size-3.5" /> Verifies against the payload
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[12px] text-rust">
                <XCircle className="size-3.5" /> Does not verify
              </span>
            )}
          </div>
          <div className="font-mono mt-3 rounded-[10px] border border-line bg-cream p-3 text-[11.5px] break-all text-ink-2">{data.signature}</div>
          <p className="mt-2 text-[12.5px] text-grey-green">EIP-712 over the payload below, domain Redeem v1, on Robinhood Chain. Recover the signer with any EIP-712 library and compare.</p>
        </section>
        <section>
          <div className="flex items-center justify-between">
            <Eyebrow>Merkle proof</Eyebrow>
            {data.proof ? (
              data.proof.valid ? (
                <span className="inline-flex items-center gap-1 text-[12px] text-emerald">
                  <CheckCircle2 className="size-3.5" /> Leaf {data.proof.index + 1} of {data.attestation?.leafCount}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[12px] text-rust">
                  <XCircle className="size-3.5" /> Not in the attested set
                </span>
              )
            ) : (
              <span className="text-[12px] text-grey-green">Available after cutoff</span>
            )}
          </div>
          {data.proof ? (
            <dl className="mt-3">
              <Def term="Root" mono>
                <span className="break-all text-[11.5px]">{data.proof.root}</span>
              </Def>
              <Def term="Leaf" mono>
                <span className="break-all text-[11.5px]">{data.proof.leaf}</span>
              </Def>
              <Def term="Siblings" mono>
                {data.proof.siblings.length === 0 ? "single leaf" : <span className="break-all text-[11.5px]">{data.proof.siblings.join(" ")}</span>}
              </Def>
            </dl>
          ) : (
            <p className="mt-3 text-[13px] text-ink-2">At cutoff, receipts are hashed into a sorted-pair Merkle tree and the root is published. This receipt's proof appears here.</p>
          )}
        </section>
      </div>

      <section className="pt-12">
        <Eyebrow>Signed payload · stored verbatim</Eyebrow>
        <pre className="font-mono mt-3 max-h-[440px] overflow-auto rounded-[12px] border border-line bg-cream p-4 text-[11.5px] leading-relaxed whitespace-pre-wrap text-ink-2">{JSON.stringify(data.typedData, null, 2)}</pre>
        <div className="eyebrow mt-5 mb-2">Canonical receipt · Merkle leaf preimage</div>
        <pre className="font-mono overflow-auto rounded-[12px] border border-line bg-cream p-4 text-[11.5px] leading-relaxed break-all whitespace-pre-wrap text-ink-2">{data.canonical}</pre>
      </section>
      <p className="mt-8 max-w-[90ch] text-[12px] leading-relaxed text-grey-green">This receipt records a token holder's intent. It is not a legal proxy, not a shareholder vote, and instructs no issuer, broker or transfer agent.</p>
    </Page>
  );
}
