import { ArrowUpRight, CheckCircle2, AlertTriangle, FileCheck2 } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { isAddress } from "viem";
import { AssetLogo } from "../components/brand";
import { WalletGate } from "../components/connect-wallet";
import { Page, PageHead } from "../components/layout";
import { Ledger, LHead, LRow, LTd, LTh, SecurityRow } from "../components/ledger";
import { Num } from "../components/number";
import { IntentLabel } from "../components/status";
import { Button, Eyebrow, Mark, Note, Skeleton, Spinner } from "../components/ui";
import { useWallet } from "../hooks/use-wallet";
import { ageLabel, dateTime, dateTimeUtc, isoDate, multiplier, pct, relative, shares, shortAddress, shortHash, usd, wad } from "../lib/format";
import { useReceipts } from "../queries/intents";
import { usePortfolio } from "../queries/portfolio";
import { useRecordBook } from "../queries/record";
import { useCreateStatement, useStatements } from "../queries/statements";
import { ChainLine } from "../components/robinhood-chain";

export default function PortfolioPage() {
  const wallet = useWallet();
  const [, navigate] = useLocation();
  const search = useSearch();
  const viewing = useMemo(() => {
    const address = new URLSearchParams(search).get("address");
    return address && isAddress(address) ? address : undefined;
  }, [search]);
  /** A pasted address gives a read-only view of any wallet; the connected wallet is the default. */
  const address = viewing ?? wallet.address;
  const readOnly = Boolean(viewing) && viewing?.toLowerCase() !== wallet.address?.toLowerCase();
  const book = usePortfolio(address);
  const record = useRecordBook(address);
  const receipts = useReceipts(address);
  const statements = useStatements(address);
  const create = useCreateStatement();
  const [expanded, setExpanded] = useState<string | null>(null);
  const data = book.data;
  const held = data?.held ?? [];
  const recordBySymbol = new Map((record.data?.rows ?? []).map((row) => [row.symbol, row]));
  const openBySymbol = new Map((record.data?.rows ?? []).map((row) => [row.symbol, row.openEvents]));
  const mineBySymbol = new Map((receipts.data?.receipts ?? []).filter((r) => r.status === "active").map((r) => [r.symbol, r]));

  return (
    <Page>
      <PageHead
        eyebrow={address ? `${readOnly ? "Record for" : "Your record"} · ${shortAddress(address, 6)}${readOnly ? " · read-only" : ""}` : "Your record"}
        title={
          data ? (
            <>
              <span className="font-mono block text-[44px] tracking-[-0.02em] sm:text-[64px] lg:text-[84px]">
                <Num value={data.totals.valueUsd} format={(v) => usd(v)} />
              </span>
            </>
          ) : (
            <>
              Your <span className="italic">record.</span>
            </>
          )
        }
        body={data ? <ChainLine caption="Positions read from" /> : "Every Stock Token this wallet holds on Robinhood Chain, with the multiplier math shown and checked against the contract. Public data stays public; this page is yours."}
        aside={
          data ? (
            <div className="grid grid-cols-3 gap-x-10 gap-y-4 lg:text-right">
              <div>
                <div className="eyebrow">Economic exposure</div>
                <div className="mt-1 text-[12.5px] text-grey-green">Chainlink-valued · {data.totals.unpriced} unpriced</div>
              </div>
              <div>
                <div className="eyebrow">Positions</div>
                <div className="font-mono mt-1 text-[26px] text-ink">{data.totals.positions}</div>
              </div>
              <div>
                <div className="eyebrow">Total share-equivalents</div>
                <div className="font-mono mt-1 text-[26px] text-ink">
                  <Num value={data.totals.shareEquivalent} format={(v) => v.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 })} />
                </div>
              </div>
            </div>
          ) : null
        }
      />

      {!address ? (
        <WalletGate title="Connect to read your positions" body="Balances are read from Robinhood Chain by the server, in one batched call, and checked against the contract's own balanceOfUI(). Any address can also be pasted into ⌘K for a read-only view." />
      ) : book.isLoading ? (
        <Skeleton className="h-64" />
      ) : held.length === 0 ? (
        <div className="border-t border-line-2 py-16 text-center">
          <div className="font-serif text-[26px] text-ink">No Stock Tokens in this wallet</div>
          <p className="mx-auto mt-2 max-w-md text-[14px] text-grey-green">
            {shortAddress(address)} holds none of the {record.data?.totals.tokens ?? 194} official tokens at block {data?.blockNumber}.
          </p>
        </div>
      ) : (
        <>
          <div className="hidden border-t border-line-2 md:block">
            <Ledger>
              <LHead>
                <LTh>Position</LTh>
                <LTh align="right">Raw tokens</LTh>
                <LTh align="right" hide="lg">
                  Multiplier
                </LTh>
                <LTh align="right">Share-equivalent</LTh>
                <LTh align="right">Chainlink value</LTh>
                <LTh hide="xl">Contract check</LTh>
                <LTh align="right" hide="lg">
                  Last corporate action
                </LTh>
                <LTh align="right">Intent</LTh>
                <LTh align="right" hide="lg">
                  Queue
                </LTh>
              </LHead>
              <tbody>
                {held.map((row) => (
                  <Fragment key={row.symbol}>
                  <LRow onClick={() => setExpanded((value) => (value === row.symbol ? null : row.symbol))} className={expanded === row.symbol ? "bg-mint/60" : ""}>
                    <LTd>
                      <span className="flex items-center gap-3">
                        <AssetLogo symbol={row.symbol} logo={row.logo} size="sm" />
                        <span>
                          <span className="block text-[15px] font-medium text-ink">{row.symbol}</span>
                          <span className="block max-w-[200px] truncate text-[12px] text-grey-green">{row.name}</span>
                        </span>
                      </span>
                    </LTd>
                    <LTd align="right" mono muted>
                      {wad(row.rawBalance, 4)}
                    </LTd>
                    <LTd align="right" mono hide="lg" muted={row.uiMultiplierFloat === 1}>
                      {multiplier(row.uiMultiplierFloat, 6)}×
                    </LTd>
                    <LTd align="right" mono className="text-[15px] text-ink">
                      {shares(row.shareEquivalentFloat)}
                    </LTd>
                    <LTd align="right" mono muted={row.priceUsd === null}>
                      {row.priceUsd === null ? "no feed" : usd(row.valueUsd)}
                    </LTd>
                    <LTd hide="xl">
                      {row.verified ? (
                        <span className="inline-flex items-center gap-1 text-[12px] text-emerald">
                          <CheckCircle2 className="size-3.5" /> balanceOfUI() matches
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[12px] text-amber">
                          <AlertTriangle className="size-3.5" /> unconfirmed
                        </span>
                      )}
                    </LTd>
                    <LTd align="right" hide="lg" muted className="font-mono text-[12.5px]">
                      {row.lastCorporateAction ? `${pct(row.lastCorporateAction.changeBps / 100, 3)} · ${dateTimeUtc(row.lastCorporateAction.effectiveAt)}` : "None"}
                    </LTd>
                    <LTd align="right">
                      {mineBySymbol.get(row.symbol) ? (
                        <span className="eyebrow-ink">{mineBySymbol.get(row.symbol)!.choiceLabel}</span>
                      ) : (openBySymbol.get(row.symbol) ?? 0) > 0 ? (
                        <Link to={`/intents?symbol=${row.symbol}&status=active`} onClick={(event) => event.stopPropagation()}>
                          <Mark tone="live">{openBySymbol.get(row.symbol)} open</Mark>
                        </Link>
                      ) : (
                        <span className="text-[12px] text-grey-green">—</span>
                      )}
                    </LTd>
                    <LTd align="right" mono hide="lg" muted={(recordBySymbol.get(row.symbol)?.requests ?? 0) === 0}>
                      {(recordBySymbol.get(row.symbol)?.requests ?? 0) > 0 ? `${shares(recordBySymbol.get(row.symbol)!.requestedShareEq)} sh-eq` : "—"}
                    </LTd>
                  </LRow>
                  {expanded === row.symbol ? (
                    <tr key={`${row.symbol}-detail`} className="border-b border-line bg-mint/30">
                      <td colSpan={9} className="px-1 py-4">
                        <div className="grid gap-6 text-[13.5px] md:grid-cols-4">
                          <div>
                            <div className="eyebrow">Accounting</div>
                            <div className="font-mono mt-1.5 text-ink">
                              {wad(row.rawBalance, 6)} × {multiplier(row.uiMultiplierFloat, 8)} = {shares(row.shareEquivalentFloat)}
                            </div>
                            <div className="mt-1 text-[12px] text-grey-green">{row.verified ? "balanceOfUI() matches" : `differs by ${row.verificationDelta}`}</div>
                          </div>
                          <div>
                            <div className="eyebrow">Chainlink</div>
                            <div className="font-mono mt-1.5 text-ink">{row.priceUsd === null ? "no feed" : `${usd(row.priceUsd)} / token`}</div>
                            <div className="mt-1 text-[12px] text-grey-green">{row.priceUpdatedAt ? relative(row.priceUpdatedAt) : "value not priced"}</div>
                          </div>
                          <div>
                            <div className="eyebrow">Pending multiplier</div>
                            <div className="font-mono mt-1.5 text-ink">{row.pendingMultiplierFloat ? `${multiplier(row.pendingMultiplierFloat, 6)}× at ${dateTimeUtc(row.effectiveAt)}` : "None"}</div>
                          </div>
                          <div className="flex items-end gap-2 md:justify-end">
                            <Button asChild size="sm" variant="outline">
                              <Link to={`/record/${row.symbol}`}>Open record</Link>
                            </Button>
                            <Button asChild size="sm" variant="outline">
                              <Link to={`/redeem?symbol=${row.symbol}`}>Readiness</Link>
                            </Button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                  </Fragment>
                ))}
              </tbody>
            </Ledger>
          </div>
          <div className="border-t border-line-2 md:hidden">
            {held.map((row) => (
              <SecurityRow key={row.symbol} leading={<AssetLogo symbol={row.symbol} logo={row.logo} size="sm" />} title={row.symbol} subtitle={`${wad(row.rawBalance, 4)} raw × ${multiplier(row.uiMultiplierFloat, 4)}`} primary={`${shares(row.shareEquivalentFloat)} sh-eq`} secondary={row.priceUsd === null ? "no feed" : usd(row.valueUsd)} onClick={() => navigate(`/record/${row.symbol}`)} />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[12px] text-grey-green">
            <span>
              Block {data?.blockNumber} · read {ageLabel(data?.dataAgeMs)}
              {data?.degraded ? " · served from cache" : ""}
            </span>
            <span>Share-equivalent is the primary unit. Token quantity is shown for reconciliation only.</span>
          </div>
        </>
      )}

      {address ? (
        <div className="mt-20 grid gap-16 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <section>
            <div className="flex items-end justify-between gap-4">
              <div>
                <Eyebrow>Signed intents</Eyebrow>
                <h2 className="font-serif mt-2 text-[30px] text-ink">Your instruction record</h2>
              </div>
              <IntentLabel />
            </div>
            {receipts.isLoading ? (
              <Skeleton className="mt-6 h-32" />
            ) : (receipts.data?.receipts.length ?? 0) === 0 ? (
              <p className="mt-5 max-w-[56ch] text-[14px] text-grey-green">
                No intent signed yet.{" "}
                <Link to="/intents?status=active" className="text-emerald hover:underline">
                  Open items
                </Link>{" "}
                for the securities you hold can be signed in a few seconds; nothing moves and nothing is spent.
              </p>
            ) : (
              <ol className="mt-6 border-t border-line-2">
                {receipts.data!.receipts.map((receipt) => (
                  <li key={receipt.id}>
                    <Link to={`/receipts/${receipt.id}`} className="grid gap-2 border-b border-line py-4 transition-colors hover:bg-mint/60 sm:grid-cols-[minmax(0,1fr)_120px_140px] sm:items-center">
                      <span className="flex min-w-0 items-start gap-3">
                        <AssetLogo symbol={receipt.symbol} logo={receipt.logo} size="sm" className="mt-0.5" />
                        <span className="min-w-0">
                          <span className="block truncate text-[14.5px] text-ink">
                            <span className="font-mono mr-2 text-[12px] text-grey-green">{receipt.index}</span>
                            {receipt.title}
                          </span>
                          <span className="mt-1 block text-[12px] text-grey-green">
                            {receipt.symbol} · meeting {isoDate(receipt.meetingDate)} · {dateTime(receipt.createdAt)}
                            {receipt.status === "superseded" ? " · superseded" : receipt.attested ? " · attested" : ""}
                          </span>
                        </span>
                      </span>
                      <span className="eyebrow-ink">{receipt.choiceLabel}</span>
                      <span className="font-mono text-[13px] text-ink sm:text-right">{shares(receipt.countedWeightFloat)} sh-eq</span>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section>
            <Eyebrow>Certified statements</Eyebrow>
            <h2 className="font-serif mt-2 text-[30px] text-ink">Freeze the record</h2>
            <p className="mt-2 max-w-[52ch] text-[14px] text-ink-2">A statement serialises this wallet's positions at the current block to canonical JSON and hashes it with SHA-256. Print it, download it, re-hash it without trusting Redeem.</p>
            <div className="mt-5 flex items-center gap-3">
              <Button variant="emerald" disabled={create.isPending || held.length === 0 || readOnly} onClick={() => address && create.mutate({ wallet: address })}>
                {create.isPending ? <Spinner className="size-3.5" /> : <FileCheck2 className="size-4" />} Certify statement
              </Button>
              {create.data ? (
                <Link to={`/statements/${create.data.id}`} className="inline-flex items-center gap-1 text-[13.5px] font-medium text-emerald hover:underline">
                  Open certificate <ArrowUpRight className="size-3.5" />
                </Link>
              ) : null}
            </div>
            {create.isError ? <Note tone="danger" className="mt-3">{create.error instanceof Error ? create.error.message : "Could not certify."}</Note> : null}
            <ol className="mt-6 border-t border-line-2">
              {(statements.data?.snapshots ?? []).map((row) => (
                <li key={row.id}>
                  <Link to={`/statements/${row.id}`} className="flex items-center justify-between gap-4 border-b border-line py-3.5 text-[13.5px] hover:bg-mint/60">
                    <span>
                      <span className="block text-ink">Block {row.blockNumber}</span>
                      <span className="font-mono block text-[11.5px] text-grey-green">sha256 {shortHash(row.digest)}</span>
                    </span>
                    <span className="text-right">
                      <span className="font-mono block text-ink">{usd(Number(row.totalUsd))}</span>
                      <span className="block text-[11.5px] text-grey-green">
                        {row.positionCount} positions · {relative(row.createdAt)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </section>
        </div>
      ) : null}
    </Page>
  );
}
