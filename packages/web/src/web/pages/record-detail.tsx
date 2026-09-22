import { ArrowLeft, ArrowUpRight, CheckCircle2, AlertTriangle } from "lucide-react";
import { motion } from "motion/react";
import { Link, useParams } from "wouter";
import { AssetLogo } from "../components/brand";
import { MultiplierChart, OwnershipRule } from "../components/chart";
import { Page } from "../components/layout";
import { RightsTable } from "../components/rights";
import { Num } from "../components/number";
import { EventStatus, IntentLabel, Recommendation } from "../components/status";
import { Button, Def, Display, Eyebrow, Mark, Note, Skeleton, Stat, Tag } from "../components/ui";
import { useWallet } from "../hooks/use-wallet";
import { explorerAddress, explorerTx } from "../lib/chain";
import { ageLabel, dateTime, dateTimeUtc, isoDate, multiplier, pct, relative, shares, shortAddress, shortHash, usd, wad } from "../lib/format";
import { useRecord } from "../queries/record";
import { ChainLogo, PostRef } from "../components/robinhood-chain";

export default function RecordDetailPage() {
  const params = useParams<{ symbol: string }>();
  const symbol = (params.symbol ?? "").toUpperCase();
  const wallet = useWallet();
  const query = useRecord(symbol, wallet.address);
  const data = query.data;

  if (query.isLoading || !data) {
    return (
      <Page>
        <div className="pt-12">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="mt-6 h-24 w-2/3" />
          <Skeleton className="mt-8 h-64" />
          {query.isError ? <Note tone="danger" className="mt-6">{query.error instanceof Error ? query.error.message : "Unknown security."}</Note> : null}
        </div>
      </Page>
    );
  }

  const { token, asset, row, actions, events, activity, supply, ownership, venues } = data;
  const edgar = token.cik ? `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${token.cik}&type=DEF+14A&dateb=&owner=include&count=40` : null;

  return (
    <>
      <section className="env-hero relative overflow-hidden">
        <div aria-hidden className="registration-grid pointer-events-none absolute inset-0" />
        <Page className="relative">
          <div className="pt-8">
            <Link to="/record" className="inline-flex items-center gap-1.5 text-[13px] text-grey-green hover:text-ink">
              <ArrowLeft className="size-3.5" /> Record Book
            </Link>
          </div>
          <div className="grid gap-10 pt-10 pb-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-end">
            <div className="rise">
              <div className="flex items-center gap-4">
                <AssetLogo symbol={token.symbol} logo={token.logo} size="lg" />
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[13px] text-ink">{token.symbol}</span>
                    {token.kind === "etf" ? <Tag>ETF</Tag> : token.kind === "foreign" ? <Tag>Foreign issuer</Tag> : null}
                    {events.some((event) => event.status === "active") ? <Mark tone="live">Open for intent</Mark> : null}
                  </div>
                  <div className="mt-1 text-[13px] text-grey-green">Robinhood Stock Token</div>
                </div>
              </div>
              <Display as="h1" size="xl" className="mt-8">
                {token.name}
              </Display>
              <dl className="mt-8 grid max-w-[560px] grid-cols-2 gap-x-8 gap-y-5 text-[13.5px]">
                <div>
                  <dt className="eyebrow">Official issuer</dt>
                  <dd className="mt-1 text-ink">Robinhood Assets (Jersey) Limited</dd>
                </div>
                <div>
                  <dt className="eyebrow">Contract</dt>
                  <dd className="mt-1">
                    <a href={explorerAddress(token.address)} target="_blank" rel="noreferrer" className="font-mono inline-flex items-center gap-1.5 text-ink hover:text-emerald">
                      {shortAddress(token.address, 6)} <span className="size-[5px] bg-emerald" />
                    </a>
                  </dd>
                </div>
                <div>
                  <dt className="eyebrow">Backing</dt>
                  <dd className="mt-1 text-ink">1:1 shares, per the issuer</dd>
                </div>
                <div>
                  <dt className="eyebrow">Holders</dt>
                  <dd className="mt-1">
                    <Link to={`/holders/${token.symbol}`} className="text-emerald hover:underline">
                      Top 100 holders →
                    </Link>
                  </dd>
                </div>
                <div>
                  <dt className="eyebrow">Network</dt>
                  <dd className="mt-1.5">
                    <ChainLogo height={16} />
                  </dd>
                </div>
              </dl>
            </div>
            <div className="rise-2 lg:text-right">
              <div className="eyebrow">Share-equivalents recorded</div>
              <div className="font-mono mt-3 text-[48px] leading-none text-ink sm:text-[64px] lg:text-[80px]">
                <Num value={supply.uiFloat} format={(v) => v.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 })} />
              </div>
              <div className="mt-3 text-[13px] text-grey-green">
                {shares(supply.rawFloat)} raw tokens × {multiplier(asset.uiMultiplierFloat, 8)} · block {data.blockNumber} · {ageLabel(data.dataAgeMs)}
              </div>
              <div className="mt-6 grid grid-cols-2 gap-x-8 gap-y-5 lg:justify-items-end">
                <Stat label="Chainlink valuation" value={asset.priceUsd === null ? "No feed" : usd(asset.marketValueUsd, { compact: true })} sub={asset.priceUsd === null ? undefined : `${usd(asset.priceUsd)} / token · ${relative(asset.priceUpdatedAt)}`} tone={asset.priceUsd === null ? "muted" : "ink"} />
                <Stat label="Multiplier" value={`${multiplier(asset.uiMultiplierFloat, 6)}×`} sub={asset.pendingMultiplierFloat ? `→ ${multiplier(asset.pendingMultiplierFloat, 6)}× at ${dateTime(asset.effectiveAt)}` : "No pending change"} tone={asset.pendingMultiplierFloat ? "warn" : "ink"} />
              </div>
            </div>
          </div>
        </Page>
      </section>

      <Page>
        <div className="grid gap-x-16 gap-y-14 pt-14 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <div className="space-y-14">
            {/* Rights today */}
            <section>
              <Eyebrow>Rights today</Eyebrow>
              <h2 className="font-serif mt-2 text-[30px] text-ink">A share, a token, and the gap between them.</h2>
              <RightsTable symbol={token.symbol} className="mt-6" />
            </section>

            {/* Ownership */}
            <section>
              <Eyebrow>Beneficial ownership</Eyebrow>
              <h2 className="font-serif mt-2 text-[30px] text-ink">Where the share-equivalents sit</h2>
              <p className="mt-2 max-w-[60ch] text-[14.5px] text-ink-2">Every path resolves, pro rata, back to a holder. Wallets and liquidity pools are read today; vault, lending and nested adapters are named so the seam is visible, not hidden.</p>
              <OwnershipRule segments={ownership} className="mt-8" />
              {venues.length > 0 ? (
                <div className="mt-6">
                  <div className="eyebrow">Liquidity pools holding {token.symbol}</div>
                  <ol className="mt-2 border-t border-line-2">
                    {venues.slice(0, 6).map((venue) => (
                      <li key={venue.venue} className="flex items-center justify-between gap-4 border-b border-line py-2.5 text-[13px]">
                        <a href={explorerAddress(venue.venue)} target="_blank" rel="noreferrer" className="font-mono text-ink hover:text-emerald">
                          {shortAddress(venue.venue, 5)}
                        </a>
                        <span className="text-grey-green">
                          {token.symbol} / {venue.pairedWith ?? "?"}
                          {venue.fee ? ` · ${(venue.fee / 10_000).toFixed(2)}%` : ""}
                        </span>
                        <span className="font-mono text-ink">{shares(venue.shareEquivalent)} sh-eq</span>
                      </li>
                    ))}
                  </ol>
                  <p className="mt-2 text-[12px] text-grey-green">Read from each pool with a view call. Concentrated-liquidity positions are resolved to the pool, not yet to each provider.</p>
                </div>
              ) : null}
            </section>

            {/* Multiplier */}
            <section>
              <div className="flex items-end justify-between gap-4">
                <div>
                  <Eyebrow>Corporate actions</Eyebrow>
                  <h2 className="font-serif mt-2 text-[30px] text-ink">Multiplier ledger</h2>
                </div>
                <div className="font-mono text-[12px] text-grey-green">{actions.length} event{actions.length === 1 ? "" : "s"}</div>
              </div>
              <div className="mt-6 border-y border-line-2 py-4">
                <MultiplierChart actions={actions} current={asset.uiMultiplierFloat} currentAt={data.blockTimestamp} />
              </div>
              {actions.length === 0 ? (
                <p className="py-6 text-[14px] text-grey-green">No UIMultiplierUpdated event has been recorded on this token. Its ERC-20 balance and share-equivalent still agree one to one.</p>
              ) : (
                <ol>
                  {actions.map((action, index) => (
                    <motion.li key={`${action.txHash}:${action.logIndex}`} initial={{ opacity: 0, y: 6 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4, delay: index * 0.05 }} className="grid grid-cols-2 gap-4 border-b border-line py-5 sm:grid-cols-4">
                      <div>
                        <div className="eyebrow">Previous</div>
                        <div className="font-mono mt-1 text-[15px] text-grey-green">{wad(action.oldMultiplier, 8)}×</div>
                      </div>
                      <div>
                        <div className="eyebrow">Current</div>
                        <div className="font-mono mt-1 text-[15px] text-ink">{wad(action.newMultiplier, 8)}×</div>
                      </div>
                      <div>
                        <div className="eyebrow">Change</div>
                        <div className={`font-mono mt-1 text-[15px] ${action.changeBps >= 0 ? "text-emerald" : "text-rust"}`}>{pct(action.changeBps / 100, 4)}</div>
                      </div>
                      <div className="sm:text-right">
                        <div className="eyebrow">Effective</div>
                        <div className="font-mono mt-1 text-[12.5px] text-ink">{dateTimeUtc(action.effectiveAt)}</div>
                        <a href={explorerTx(action.txHash)} target="_blank" rel="noreferrer" className="font-mono text-[11px] text-grey-green hover:text-ink">
                          {shortHash(action.txHash)}
                        </a>
                      </div>
                    </motion.li>
                  ))}
                </ol>
              )}
              <p className="mt-4 text-[12.5px] text-grey-green">The ERC-20 balance does not rebase. Its share-equivalent changes with the ratio.</p>
            </section>

            {/* Intent events */}
            <section>
              <div className="flex items-end justify-between gap-4">
                <div>
                  <Eyebrow>Intent events</Eyebrow>
                  <h2 className="font-serif mt-2 text-[30px] text-ink">Proxy items on file</h2>
                </div>
                <IntentLabel />
              </div>
              <div className="mt-3">
                <PostRef />
              </div>
              {events.length === 0 ? (
                <p className="mt-4 max-w-[60ch] text-[14px] text-grey-green">
                  {!token.votable
                    ? token.kind === "etf"
                      ? "Exchange-traded funds do not hold stockholder meetings with proxy items, so there is nothing to record here."
                      : "This issuer does not file proxy statements with the SEC, so no items have been extracted for it yet."
                    : "No proxy statement has been filed in the current window. Items appear as soon as a DEF 14A is filed."}
                  {edgar ? (
                    <a href={edgar} target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center gap-1 text-emerald hover:underline">
                      EDGAR <ArrowUpRight className="size-3" />
                    </a>
                  ) : null}
                </p>
              ) : (
                <div className="mt-6">
                  {events.map((event) => (
                    <div key={event.id} className="border-t border-line-2 py-6">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="font-serif text-[22px] text-ink">
                            {event.meetingType === "special" ? "Special" : "Annual"} meeting · {isoDate(event.meetingDate)}
                          </div>
                          <div className="mt-1 text-[12.5px] text-grey-green">
                            Record date {event.recordDate ? isoDate(event.recordDate) : "not stated"} · intent cutoff {dateTimeUtc(event.closesAt)} ·{" "}
                            <a href={event.docUrl} target="_blank" rel="noreferrer" className="text-emerald hover:underline">
                              proxy statement
                            </a>
                          </div>
                        </div>
                        <EventStatus status={event.status} />
                      </div>
                      <ol className="mt-4">
                        {event.items.map((item) => (
                          <li key={item.id}>
                            <Link to={`/intents/${item.id}`} className="grid gap-2 border-t border-line py-3.5 transition-colors hover:bg-mint/60 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                              <span className="min-w-0">
                                <span className="block text-[14.5px] leading-snug text-ink">
                                  <span className="font-mono mr-2 text-[12px] text-grey-green">{item.index}</span>
                                  {item.title}
                                </span>
                                <span className="mt-1.5 block">
                                  <Recommendation value={item.boardRecommendation} />
                                </span>
                              </span>
                              <span className="font-mono text-[12.5px] text-grey-green sm:text-right">{item.intents > 0 ? `${shares(item.intentShareEq)} sh-eq signalled` : "No intent yet"}</span>
                            </Link>
                          </li>
                        ))}
                      </ol>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <aside className="space-y-10">
            {/* Your position */}
            <section className="surface-plain rounded-[16px] p-6">
              <Eyebrow>Your position</Eyebrow>
              {!wallet.address ? (
                <>
                  <p className="mt-3 text-[14px] text-ink-2">Connect a wallet to read what it holds. Public record data stays visible without one.</p>
                  <Button className="mt-4 w-full" onClick={wallet.connect}>
                    Connect wallet
                  </Button>
                </>
              ) : !row ? (
                <Skeleton className="mt-4 h-24" />
              ) : row.rawBalanceFloat === 0 ? (
                <p className="mt-3 text-[14px] text-grey-green">This wallet holds no {token.symbol}.</p>
              ) : (
                <>
                  <div className="font-mono mt-3 text-[36px] leading-none text-ink">{shares(row.shareEquivalentFloat)}</div>
                  <div className="eyebrow mt-2">Share-equivalents</div>
                  <dl className="mt-5">
                    <Def term="Raw tokens" mono>
                      {wad(row.rawBalance, 6)}
                    </Def>
                    <Def term="× multiplier" mono>
                      {multiplier(row.uiMultiplierFloat, 8)}
                    </Def>
                    <Def term="Chainlink value" mono>
                      {usd(row.valueUsd)}
                    </Def>
                    <Def term="balanceOfUI()">
                      {row.verified ? (
                        <span className="inline-flex items-center gap-1 text-[12px] text-emerald">
                          <CheckCircle2 className="size-3.5" /> matches
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[12px] text-amber">
                          <AlertTriangle className="size-3.5" /> differs by {row.verificationDelta}
                        </span>
                      )}
                    </Def>
                  </dl>
                  <div className="mt-4 flex gap-2">
                    <Button asChild size="sm" variant="outline">
                      <Link to="/portfolio">All positions</Link>
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <Link to={`/redeem?symbol=${token.symbol}`}>Redemption readiness</Link>
                    </Button>
                  </div>
                </>
              )}
            </section>

            {/* Record facts */}
            <section>
              <Eyebrow>Security record</Eyebrow>
              <dl className="mt-3">
                <Def term="Raw token supply" mono>
                  {supply.rawFloat.toLocaleString("en-US", { maximumFractionDigits: 4 })}
                </Def>
                <Def term="uiMultiplier" mono>
                  {multiplier(asset.uiMultiplierFloat, 10)}
                </Def>
                <Def term="Pending multiplier" mono>
                  {asset.pendingMultiplierFloat ? multiplier(asset.pendingMultiplierFloat, 10) : "None"}
                </Def>
                <Def term="effectiveAt" mono>
                  {asset.effectiveAt ? dateTimeUtc(asset.effectiveAt) : "—"}
                </Def>
                <Def term="Wallet-held" mono>
                  {shares(supply.uiFloat)} sh-eq
                </Def>
                <Def term="Vault-held">Not indexed yet</Def>
                <Def term="Holder count">Not indexed yet</Def>
                <Def term="Intent recorded" mono>
                  {activity.intents > 0 ? `${shares(activity.intentShareEq)} sh-eq · ${activity.intentWallets} wallets` : "None"}
                </Def>
                <Def term="Redemption demand" mono>
                  {activity.requests > 0 ? `${shares(activity.requestedShareEq)} sh-eq · ${activity.requests} requests` : "None"}
                </Def>
                <Def term="totalSupplyUI check">{supply.matches ? <span className="text-emerald">matches raw × multiplier</span> : <span className="text-amber">differs</span>}</Def>
                <Def term="Price feed" mono>
                  {token.feed ? (
                    <a href={explorerAddress(token.feed)} target="_blank" rel="noreferrer" className="hover:text-emerald">
                      {shortAddress(token.feed, 5)}
                    </a>
                  ) : (
                    "None deployed"
                  )}
                </Def>
                {token.isin ? (
                  <Def term="ISIN" mono>
                    {token.isin}
                  </Def>
                ) : null}
                {token.cik ? (
                  <Def term="SEC CIK" mono>
                    <a href={edgar ?? "#"} target="_blank" rel="noreferrer" className="hover:text-emerald">
                      {token.cik.replace(/^0+/, "")}
                    </a>
                  </Def>
                ) : null}
                <Def term="Sector">{token.sector}</Def>
                <Def term="Record timestamp" mono>
                  {dateTimeUtc(data.blockTimestamp)}
                </Def>
              </dl>
              {asset.oraclePaused ? <Note tone="warn" className="mt-4">The issuer has paused the oracle for a corporate action.</Note> : null}
            </section>

            {wallet.address && data.transfers.length > 0 ? (
              <section>
                <div className="flex items-baseline justify-between">
                  <Eyebrow>Your {token.symbol} transfers</Eyebrow>
                  {data.transfersPartial ? <span className="text-[11px] text-grey-green">partial</span> : null}
                </div>
                <ul className="mt-3">
                  {data.transfers.slice(0, 8).map((transfer) => (
                    <li key={`${transfer.txHash}:${transfer.logIndex}`} className="flex items-center justify-between gap-3 border-b border-line py-2.5 text-[13px]">
                      <span className="flex items-center gap-2">
                        <Mark tone={transfer.direction === "in" ? "emerald" : transfer.direction === "out" ? "danger" : "muted"}>{transfer.direction}</Mark>
                        <span className="font-mono">{wad(transfer.value, 4)}</span>
                      </span>
                      <a href={explorerTx(transfer.txHash)} target="_blank" rel="noreferrer" className="font-mono text-[11.5px] text-grey-green hover:text-ink">
                        block {transfer.blockNumber}
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </aside>
        </div>
      </Page>
    </>
  );
}
