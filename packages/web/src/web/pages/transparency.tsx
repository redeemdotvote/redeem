import { Link } from "wouter";
import { AssetLogo } from "../components/brand";
import { Page, PageHead } from "../components/layout";
import { IntentLabel } from "../components/status";
import { Button, Def, Eyebrow, Mark, Skeleton, Spinner } from "../components/ui";
import { ChainLine, PostRef } from "../components/robinhood-chain";
import { dateTime, relative, shares, shortHash } from "../lib/format";
import { useAttest, useAttestations, usePendingAttestation } from "../queries/intents";
import { useCorporateActions } from "../queries/portfolio";
import { useHomeStats } from "../queries/stats";

const SOURCES = [
  ["Token registry", "api.robinhood.com/rhj/assets, joined with SEC EDGAR company data and the Chainlink feed directory for Robinhood Chain."],
  ["Proxy items", "Each issuer's DEF 14A on SEC EDGAR, extracted into items with the board recommendation and the vote required. Every item links to its filing."],
  ["Balances and multipliers", "Token contracts on Robinhood Chain via Multicall3, server side, cross-checked against balanceOfUI() and totalSupplyUI()."],
  ["Prices", "Chainlink AggregatorV3 feeds deployed on Robinhood Chain (35 tokens). Tokens without a feed show no price; weight never depends on price."],
];

export default function TransparencyPage() {
  const attestations = useAttestations();
  const pending = usePendingAttestation();
  const attest = useAttest();
  const stats = useHomeStats();
  const actions = useCorporateActions();
  return (
    <Page>
      <PageHead eyebrow="Transparency" title={<>What the record is <span className="italic">built from.</span></>} body={<span className="flex flex-col gap-3"><span>Sources, method, infrastructure status and every attested tally so far.</span><ChainLine caption="Read from" /><PostRef /></span>} />
      <div className="grid gap-x-16 gap-y-12 border-t border-line-2 pt-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="space-y-12">
          <section>
            <div className="flex items-end justify-between">
              <Eyebrow>Attestations</Eyebrow>
              <IntentLabel />
            </div>
            {attestations.isLoading ? (
              <Skeleton className="mt-4 h-24" />
            ) : (attestations.data?.length ?? 0) === 0 ? (
              <p className="mt-3 text-[14px] text-grey-green">Nothing has closed with intent yet. The first attestation posts when an open item with recorded intent reaches its cutoff.</p>
            ) : (
              <ol className="mt-3 border-t border-line-2">
                {attestations.data!.map((row) => (
                  <li key={row.id}>
                    <Link to={`/intents/${row.ballotItemId}`} className="flex items-center justify-between gap-4 border-b border-line py-3.5 text-[13.5px] hover:bg-mint/60">
                      <span className="flex min-w-0 items-center gap-3">
                        <AssetLogo symbol={row.symbol} logo={row.logo} size="sm" />
                        <span className="min-w-0">
                          <span className="block truncate text-ink">
                            {row.symbol} · {row.index} · {row.title}
                          </span>
                          <span className="font-mono block text-[11.5px] text-grey-green">
                            {shortHash(row.merkleRoot)} · {row.leafCount} receipts · {shares(row.tally.totalWeightFloat)} sh-eq
                          </span>
                        </span>
                      </span>
                      <span className="shrink-0 text-[12px] text-grey-green">{relative(row.createdAt)}</span>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
            {(pending.data?.items.length ?? 0) > 0 ? (
              <div className="mt-6">
                <Eyebrow>Closed, awaiting attestation</Eyebrow>
                <ul className="mt-2 border-t border-line-2">
                  {pending.data!.items.map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-4 border-b border-line py-3 text-[13.5px]">
                      <span>
                        {item.symbol} · {item.index} · {item.title}
                      </span>
                      <Button size="sm" variant="outline" disabled={attest.isPending} onClick={() => attest.mutate({ itemId: item.id })}>
                        {attest.isPending ? <Spinner className="size-3" /> : null} Attest
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
          <section>
            <Eyebrow>How far the record reaches</Eyebrow>
            <p className="mt-2 max-w-[62ch] text-[14.5px] leading-relaxed text-ink-2">Four links would carry a token holder's intent to a company meeting. Redeem runs the first three and says plainly that the fourth does not exist.</p>
            <ol className="mt-4 border-t border-line-2">
              {(
                [
                  ["Signed intent", "live", "A wallet signs an EIP-712 statement weighted by the share-equivalents it holds. Every receipt is public and recoverable to its wallet."],
                  ["Attested tally", "live", "At cutoff each weight is re-read, the receipts are hashed into a Merkle root, and the root is published with every proof."],
                  ["Timestamped report", "live", "The attestation and the meeting's Holder Intent Report are frozen and timestamped into Bitcoin through OpenTimestamps. No contract is involved."],
                  ["A vote at the meeting", "none", "Nobody votes this record. Stock Tokens carry no shareholder vote today, Redeem holds no shares, and it has no proxy authority. The issuer's reported result is shown beside the record for comparison, from its Form 8-K."],
                ] as Array<[string, string, string]>
              ).map(([title, state, body]) => (
                <li key={title} className="grid gap-1 border-b border-line py-3.5 sm:grid-cols-[200px_minmax(0,1fr)_90px] sm:gap-5">
                  <span className="text-[14.5px] font-medium text-ink">{title}</span>
                  <span className="text-[13.5px] leading-relaxed text-ink-2">{body}</span>
                  <span className="sm:text-right">{state === "live" ? <Mark tone="live">Live</Mark> : <Mark tone="muted">Does not exist</Mark>}</span>
                </li>
              ))}
            </ol>
          </section>
          <section>
            <Eyebrow>Live endpoints</Eyebrow>
            <dl className="mt-3">
              {(
                [
                  ["/api/v1/ops/status.json", "Machine-readable operations feed: chain head, market cache age, database counts, indexer cursors, results and venues on file."],
                  ["/api/v1/record", "The security master with live multipliers and supply."],
                  ["/api/v1/weights/:itemId/:wallet", "A wallet's weight on one item: held now, held on the record date, and signed."],
                  ["/api/v1/intents/:itemId/receipts", "Every active receipt for one item, with signatures."],
                  ["/api/v1/reports/:ballotId", "The Holder Intent Report, its frozen document and its timestamp proof."],
                  ["/api/v1/feed", "JSON Feed of multiplier changes and new proxy items."],
                  ["/api/rpc/intents/prepare → commit", "The write path: the server reads the position, issues the exact payload, and verifies the signature before anything is stored."],
                ] as Array<[string, string]>
              ).map(([path, body]) => (
                <div key={path} className="grid gap-1 border-b border-line py-2.5 sm:grid-cols-[minmax(0,300px)_minmax(0,1fr)] sm:gap-5">
                  <dt className="font-mono text-[12.5px] break-all text-ink">{path}</dt>
                  <dd className="text-[13px] text-ink-2">{body}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section>
            <Eyebrow>Method</Eyebrow>
            <dl className="mt-3">
              <Def term="Weight">share-eq = balanceOf × uiMultiplier ÷ 1e18 at the signing block; re-read at cutoff; the smaller counts.</Def>
              <Def term="Receipt">EIP-712 payload and signature stored verbatim; canonical JSON of id, item, wallet, choice, weights, block, signature.</Def>
              <Def term="Tree">keccak256 leaves in signing order, sorted-pair hashing, odd leaf paired with itself.</Def>
              <Def term="Channel">Roots published here and in the API. On-chain attestation is planned and will be labelled when live.</Def>
            </dl>
          </section>
        </div>
        <div className="space-y-12">
          <section>
            <Eyebrow>Sources</Eyebrow>
            <dl className="mt-3">
              {SOURCES.map(([name, detail]) => (
                <div key={name} className="border-b border-line py-3.5">
                  <dt className="text-[14.5px] font-medium text-ink">{name}</dt>
                  <dd className="mt-1 text-[13px] leading-relaxed text-ink-2">{detail}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section>
            <div className="flex items-center justify-between">
              <Eyebrow>Infrastructure</Eyebrow>
              {actions.data?.degraded ? <Mark tone="warn">Indexer behind</Mark> : <Mark tone="live">Live</Mark>}
            </div>
            <dl className="mt-3">
              <Def term="Chain head" mono>
                {stats.data?.blockNumber ?? "—"}
              </Def>
              <Def term="Chain time" mono>
                {stats.data?.blockTimestamp ? dateTime(stats.data.blockTimestamp) : "—"}
              </Def>
              <Def term="Corporate actions mirrored" mono>
                {actions.data?.actions.length ?? "—"}
              </Def>
              {(actions.data?.indexer ?? []).map((cursor) => (
                <Def key={cursor.key} term={cursor.key.replace(/_/g, " ")}>
                  <span className="text-[12.5px]">
                    {cursor.status} · block {cursor.lastBlock}
                  </span>
                </Def>
              ))}
              <Def term="Intents recorded" mono>
                {stats.data?.intents ?? "—"}
              </Def>
              <Def term="Redemption requests" mono>
                {stats.data?.requests ?? "—"}
              </Def>
            </dl>
          </section>
        </div>
      </div>
    </Page>
  );
}
