import { Link, useParams } from "wouter";
import { Page, PageHead } from "../components/layout";
import { Lookup } from "../components/lookup";
import { ChainLine } from "../components/robinhood-chain";
import { Mark, Skeleton } from "../components/ui";
import { useWallet } from "../hooks/use-wallet";
import { dateTime, shares, shortAddress, usd } from "../lib/format";
import { useTopHolders } from "../queries/holders";

/** /holders/:symbol — the top hundred holders of one Stock Token on Robinhood Chain. */
export default function HoldersPage() {
  const params = useParams<{ symbol: string }>();
  const symbol = (params.symbol ?? "").toUpperCase();
  const wallet = useWallet();
  const top = useTopHolders(symbol);
  const d = top.data;
  return (
    <Page narrow>
      <PageHead
        eyebrow={<span className="inline-flex flex-wrap items-center gap-4">Top holders · {symbol} <ChainLine caption={null} /></span>}
        title={
          <>
            The largest <span className="italic">{symbol}</span> token holders.
          </>
        }
        body={d?.available ? `${d.holders.toLocaleString("en-US")} wallets hold ${symbol} on Robinhood Chain, ${shares(d.totalShareEq)} shares-equivalent between them, read at block ${Number(d.snapshotBlock).toLocaleString("en-US")}. Liquidity pools are marked; they hold on behalf of their providers.` : "Holder ranks for this token have not been computed yet."}
      />
      {!d ? (
        <Skeleton className="h-72" />
      ) : !d.available ? (
        <p className="border-t border-line-2 pt-6 text-[14.5px] text-grey-green">Come back shortly, or open the record page for live supply.</p>
      ) : (
        <>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-t border-line-2 pt-6">
            <Lookup size="md" className="max-w-[460px]" />
            <Link to={`/record/${symbol}`} className="text-[13.5px] text-emerald hover:underline">
              {symbol} record →
            </Link>
          </div>
          <ol>
            {d.rows.map((row) => {
              const mine = wallet.address?.toLowerCase() === row.address;
              return (
                <li key={row.address} className={`grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 border-b border-line py-3 ${mine ? "bg-emerald/5" : ""}`}>
                  <span className={`font-mono text-[15px] ${row.rank <= 3 ? "text-emerald" : "text-grey-green"}`}>#{row.rank}</span>
                  <span className="flex min-w-0 items-center gap-2">
                    <Link to={`/w/${row.address}`} className="font-mono truncate text-[13px] text-ink hover:underline">
                      <span className="hidden md:inline">{row.address}</span>
                      <span className="md:hidden">{shortAddress(row.address, 6)}</span>
                    </Link>
                    {row.pool ? <Mark tone="muted">pool</Mark> : null}
                    {mine ? <Mark tone="live">you</Mark> : null}
                  </span>
                  <span className="text-right">
                    <span className="font-mono block text-[14px] text-ink">{shares(row.shareEq)} sh-eq</span>
                    <span className="block text-[11.5px] text-grey-green">
                      {row.share.toFixed(2)}%{d.priceUsd ? ` · ${usd(row.shareEq * d.priceUsd, { compact: true })}` : ""}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
          <p className="mt-6 text-[12.5px] leading-relaxed text-grey-green">Built from every address that ever received {symbol}, with each balance read exactly from the contract at block {Number(d.snapshotBlock).toLocaleString("en-US")} ({d.generatedAt ? dateTime(d.generatedAt) : ""}). Balances move; ranks are refreshed with each snapshot.</p>
        </>
      )}
    </Page>
  );
}
