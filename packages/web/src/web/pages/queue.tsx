import { useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { AssetLogo } from "../components/brand";
import { Page, PageHead } from "../components/layout";
import { useQueueBoard } from "../components/queue-board";
import { ChainLine } from "../components/robinhood-chain";
import { Button, Eyebrow, Input, Mark, Skeleton } from "../components/ui";
import { dateTimeUtc, shares, shortAddress, usd } from "../lib/format";

/**
 * /queue and /queue/:symbol — the public redemption queue. Every position, in signing order, with
 * the wallet, the size, the block and the signature, so anyone can check a place without asking.
 */
export default function QueuePage() {
  const params = useParams<{ symbol?: string }>();
  const symbol = params.symbol?.toUpperCase();
  const [, navigate] = useLocation();
  const board = useQueueBoard(symbol);
  const [find, setFind] = useState("");
  const b = board.data;
  const mine = find && b ? b.positions.find((row) => row.wallet.toLowerCase() === find.trim().toLowerCase()) : null;
  return (
    <Page>
      <PageHead
        eyebrow={<span className="inline-flex flex-wrap items-center gap-4">{symbol ? `${symbol} redemption queue` : "Redemption queue"} · public <ChainLine caption={null} /></span>}
        title={
          symbol ? (
            <>
              Who is in line for <span className="italic">{symbol}.</span>
            </>
          ) : (
            <>
              Every place in line, <span className="italic">in public.</span>
            </>
          )
        }
        body="A queue position is a signed, numbered request to redeem Stock Tokens for shares, weighted by what the wallet held at signing. Positions are assigned in signing order per ticker and never move. Redeem cannot open a window or grant priority; the issuer alone decides if, when and in what order redemption happens. This is the public file of who asked first."
        aside={
          b ? (
            <div className="grid grid-cols-3 gap-x-10 lg:text-right">
              <div>
                <div className="eyebrow">In the queue</div>
                <div className="font-mono mt-1 text-[26px] text-ink">{usd(symbol ? (b.tickers.find((t) => t.symbol === symbol)?.valueUsd ?? 0) : b.totalValueUsd)}</div>
              </div>
              <div>
                <div className="eyebrow">Positions</div>
                <div className="font-mono mt-1 text-[26px] text-ink">{symbol ? b.positions.length : b.requests}</div>
              </div>
              <div>
                <div className="eyebrow">Next place</div>
                <div className="font-mono mt-1 text-[26px] text-emerald">#{symbol ? b.positions.length + 1 : "1+"}</div>
              </div>
            </div>
          ) : null
        }
      />
      {!b ? (
        <Skeleton className="h-64" />
      ) : symbol ? (
        <div className="border-t border-line-2 pt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link to="/queue" className="text-[13px] text-grey-green hover:text-ink">
              ← All tickers
            </Link>
            <div className="flex items-center gap-2">
              <Input value={find} onChange={(event) => setFind(event.target.value)} placeholder="Find a wallet 0x…" className="font-mono h-9 w-[280px] text-[12.5px]" />
              <Button asChild>
                <Link to={`/redeem?symbol=${symbol}`}>Take #{b.positions.length + 1}</Link>
              </Button>
            </div>
          </div>
          {find ? <p className="mt-3 text-[13.5px] text-ink-2">{mine ? `That wallet holds place #${mine.position} with ${shares(mine.shareEq)} share-eq.` : "That wallet is not in this queue."}</p> : null}
          {b.positions.length === 0 ? (
            <p className="py-12 text-center text-[15px] text-ink-2">Nobody has pre-registered for {symbol} yet. Place #1 is open.</p>
          ) : (
            <ol className="mt-5 border-t border-line-2">
              {b.positions.map((row) => (
                <li key={row.position} className="grid grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-4 border-b border-line py-3 sm:grid-cols-[56px_minmax(0,1fr)_140px_160px_auto]">
                  <span className="font-mono text-[18px] text-emerald">#{row.position}</span>
                  <Link to={`/portfolio?address=${row.wallet}`} className="font-mono min-w-0 truncate text-[13px] text-ink hover:underline">
                    <span className="hidden md:inline">{row.wallet}</span>
                    <span className="md:hidden">{shortAddress(row.wallet, 6)}</span>
                  </Link>
                  <span className="font-mono hidden text-[13px] text-ink sm:block">{shares(row.shareEq)} sh-eq</span>
                  <span className="hidden text-[12px] text-grey-green sm:block">{dateTimeUtc(row.signedAt)} · block {row.blockNumber.toLocaleString("en-US")}</span>
                  <span className="font-mono text-[13px] text-ink">{row.valueUsd === null ? "no feed" : usd(row.valueUsd)}</span>
                </li>
              ))}
            </ol>
          )}
          <p className="mt-4 text-[12.5px] text-grey-green">
            Every row carries its signature at <span className="font-mono">/api/v1/queue/{symbol}</span>; a wallet's whole file verifies at{" "}
            <Link to="/verify" className="text-emerald hover:underline">
              /verify
            </Link>
            .
          </p>
        </div>
      ) : (
        <div className="border-t border-line-2 pt-2">
          {b.tickers.length === 0 ? (
            <p className="py-12 text-center text-[15px] text-ink-2">The queue is open and empty. Place #1 is available on every ticker.</p>
          ) : (
            <ol>
              {b.tickers.map((ticker, index) => (
                <li key={ticker.symbol}>
                  <button type="button" onClick={() => navigate(`/queue/${ticker.symbol}`)} className="grid w-full grid-cols-[28px_auto_minmax(0,1fr)_auto] items-center gap-4 border-b border-line py-4 text-left hover:bg-mint/60">
                    <span className="font-mono text-[12px] text-grey-green">{index + 1}</span>
                    <AssetLogo symbol={ticker.symbol} logo={ticker.logo} size="sm" />
                    <span className="min-w-0">
                      <span className="block text-[16px] text-ink">
                        {ticker.symbol} <span className="text-[12.5px] text-grey-green">{ticker.name}</span>
                      </span>
                      <span className="block text-[12.5px] text-grey-green">
                        {shares(ticker.shareEq)} sh-eq · {ticker.wallets} {ticker.wallets === 1 ? "wallet" : "wallets"}
                        {ticker.circulating ? ` · ${((ticker.shareEq / ticker.circulating) * 100).toFixed(3)}% of circulating` : ""}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="font-mono block text-[16px] text-ink">{ticker.valueUsd === null ? "no feed" : usd(ticker.valueUsd)}</span>
                      <span className="block text-[12px] text-emerald">next is #{ticker.nextPosition}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
      <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2">
        <Mark tone="muted">A place in a public file · not a right to redeem</Mark>
        <Eyebrow>Valued at the live Chainlink price</Eyebrow>
      </div>
    </Page>
  );
}
