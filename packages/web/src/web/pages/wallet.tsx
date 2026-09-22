import { Share2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import { isAddress } from "viem";
import { AssetLogo } from "../components/brand";
import { CertificateSheet, type CertificateData } from "../components/certificate";
import { Page } from "../components/layout";
import { Lookup } from "../components/lookup";
import { ChainLine } from "../components/robinhood-chain";
import { Button, Eyebrow, Mark, Skeleton } from "../components/ui";
import { useWallet } from "../hooks/use-wallet";
import { shares, shortAddress, usd, wad } from "../lib/format";
import { usePortfolio, useWalletStatus } from "../queries/portfolio";
import { useRecordBook } from "../queries/record";
import { useHolderRanks } from "../queries/holders";

/**
 * /w/:address — the simple, public view of any wallet's Stock Token record. Big numbers, plain
 * words, one card to share. Everything deeper (XP, receipts, statements, webhooks) stays on /portfolio.
 */
export default function WalletPage() {
  const params = useParams<{ address: string }>();
  const address = params.address ?? "";
  const valid = isAddress(address);
  const wallet = useWallet();
  const mine = wallet.address?.toLowerCase() === address.toLowerCase();
  const book = usePortfolio(valid ? address : undefined);
  const record = useRecordBook();
  const status = useWalletStatus(valid ? address : undefined);
  const ranks = useHolderRanks(valid ? address : undefined);
  const [card, setCard] = useState<string | null>(null);
  const data = book.data;
  const held = data?.held ?? [];
  const openBy = useMemo(() => new Map((record.data?.rows ?? []).map((row) => [row.symbol, row.openEvents])), [record.data]);
  const openCount = held.reduce((sum, row) => sum + (openBy.get(row.symbol) ?? 0), 0);
  const rankBy = new Map((ranks.data?.ranks ?? []).map((rank) => [rank.symbol, rank]));
  const best = (ranks.data?.ranks ?? []).filter((rank) => rank.rank !== null).sort((a, b) => a.rank! - b.rank!)[0] ?? null;

  const cardData: CertificateData | null = (() => {
    if (!card || !data) return null;
    const row = held.find((entry) => entry.symbol === card);
    if (!row) return null;
    const rec = status.data?.records.find((entry) => entry.symbol === card) ?? null;
    return { symbol: row.symbol, name: row.name, shareEquivalent: row.shareEquivalentFloat, rawTokens: Number(wad(row.rawBalance, 8).replace(/,/g, "")), multiplier: row.uiMultiplierFloat, blockNumber: String(data.blockNumber), wallet: address, recordNumber: rec?.recordNumber ?? null, holdersRecorded: rec?.holdersRecorded ?? null, queuePosition: rec?.queuePosition ?? null, walletNumber: status.data?.walletNumber ?? null, season: status.data?.season ?? { label: "Season 0", note: "Recorded before the first in-kind window" }, issuedAt: new Date(), origin: window.location.origin };
  })();

  if (!valid) {
    return (
      <Page narrow>
        <div className="py-20">
          <h1 className="display text-[36px] text-ink">That is not a wallet address.</h1>
          <Lookup className="mt-6" />
        </div>
      </Page>
    );
  }

  return (
    <Page narrow>
      <div className="pt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ChainLine caption="Read from" />
          <Lookup size="md" className="max-w-[480px]" />
        </div>
      </div>

      <header className="mt-10 border-b border-line-2 pb-8">
        <div className="flex flex-wrap items-center gap-3">
          <Eyebrow>{mine ? "Your record" : "Wallet record"}</Eyebrow>
          <span className="font-mono text-[13px] text-ink">{shortAddress(address, 6)}</span>
          {status.data?.walletNumber ? <Mark tone="emerald">Wallet #{status.data.walletNumber}{status.data.walletNumber <= 100 ? " · Founding 100" : ""}</Mark> : null}
        </div>
        {!data ? (
          <Skeleton className="mt-6 h-24 w-2/3" />
        ) : held.length === 0 ? (
          <>
            <h1 className="display mt-5 text-[40px] text-ink sm:text-[56px]">No Stock Tokens here.</h1>
            <p className="mt-3 max-w-[52ch] text-[15.5px] text-ink-2">This wallet holds none of the 194 official Stock Tokens on Robinhood Chain at block {Number(data.blockNumber).toLocaleString("en-US")}.</p>
          </>
        ) : (
          <>
            <h1 className="display mt-5 text-[40px] leading-[1] text-ink sm:text-[60px]">
              <span className="font-mono">{usd(data.totals.valueUsd)}</span> in {held.length} {held.length === 1 ? "stock" : "stocks"}.
            </h1>
            <p className="mt-4 max-w-[56ch] text-[16px] leading-relaxed text-ink-2">
              {best ? (
                <>
                  This wallet is the <span className="font-medium text-ink">#{best.rank} largest {best.symbol} token holder</span> on Robinhood Chain{best.holders ? ` of ${best.holders.toLocaleString("en-US")}` : ""}.{" "}
                </>
              ) : null}
              {openCount > 0 ? `${openCount} proxy ${openCount === 1 ? "item is" : "items are"} open for stocks it holds.` : "Nothing is open to sign for these stocks right now."}
            </p>
          </>
        )}
      </header>

      {held.length > 0 ? (
        <>
          <ol className="mt-2">
            {held.map((row) => {
              const rank = rankBy.get(row.symbol);
              const open = openBy.get(row.symbol) ?? 0;
              return (
                <li key={row.symbol} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 border-b border-line py-4">
                  <AssetLogo symbol={row.symbol} logo={row.logo} size="md" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-3">
                      <span className="text-[17px] font-medium text-ink">{row.symbol}</span>
                      <span className="truncate text-[13px] text-grey-green">{row.name}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
                      <span className="font-mono text-ink">{shares(row.shareEquivalentFloat)} shares-equivalent</span>
                      {rank?.rank ? (
                        <Link to={`/holders/${row.symbol}`} className="text-emerald hover:underline">
                          #{rank.rank} of {rank.holders?.toLocaleString("en-US")} holders
                        </Link>
                      ) : rank?.percentile ? (
                        <Link to={`/holders/${row.symbol}`} className="text-emerald hover:underline">
                          top {rank.percentile}% of {rank.holders?.toLocaleString("en-US")} holders
                        </Link>
                      ) : null}
                      {open > 0 ? (
                        <Link to={`/intents?symbol=${row.symbol}&status=active`} className="text-emerald hover:underline">
                          {open} open to sign
                        </Link>
                      ) : null}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-[16px] text-ink">{row.priceUsd === null ? "no feed" : usd(row.valueUsd)}</div>
                    <button type="button" onClick={() => setCard(row.symbol)} className="mt-1 inline-flex items-center gap-1 text-[12px] text-grey-green hover:text-ink">
                      <Share2 className="size-3" /> card
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            {mine ? (
              <Button asChild size="lg">
                <Link to="/portfolio#record">Record everything</Link>
              </Button>
            ) : (
              <Button size="lg" onClick={wallet.connect}>
                This you? Connect to record
              </Button>
            )}
            <Link to={`/portfolio?address=${address}`} className="text-[14px] text-grey-green hover:text-ink">
              Full record →
            </Link>
          </div>
          <p className="mt-6 text-[12.5px] leading-relaxed text-grey-green">Shares-equivalent = tokens × the issuer's multiplier. Stock Tokens give economic exposure and do not carry a shareholder vote today. Holder ranks are read from every wallet's balance on Robinhood Chain at a recent block; pools are labelled, not ranked as people.</p>
        </>
      ) : null}
      {cardData ? <CertificateSheet data={cardData} onClose={() => setCard(null)} /> : null}
    </Page>
  );
}
