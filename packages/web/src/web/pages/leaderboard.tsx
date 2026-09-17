import { Link } from "wouter";
import { AssetLogo } from "../components/brand";
import { ChainLine } from "../components/robinhood-chain";
import { Page, PageHead } from "../components/layout";
import { Mark, Skeleton } from "../components/ui";
import { relative, shares, shortAddress } from "../lib/format";
import { useLeaderboard } from "../queries/stats";

/**
 * Record holders. Three public tables derived from signing order and signed weight: who recorded
 * first, who has recorded the most tickers, and the largest verified position on file per ticker.
 * Numbers here are positions in a file, not points, votes or claims.
 */
export default function LeaderboardPage() {
  const board = useLeaderboard();
  const d = board.data;
  return (
    <Page>
      <PageHead
        eyebrow={<span className="inline-flex flex-wrap items-center gap-4">Record holders · {d?.season.label ?? "Season 0"} <ChainLine caption={null} /></span>}
        title={
          <>
            Who recorded <span className="italic">first.</span>
          </>
        }
        body="Every signature is numbered by the order it arrived. Wallet numbers, record numbers per ticker and the largest verified positions are derived from the receipts on every read, never stored, and carry no rights."
        aside={
          d ? (
            <div className="grid grid-cols-3 gap-x-10">
              <div>
                <div className="eyebrow">Wallets recorded</div>
                <div className="font-mono mt-1 text-[26px] text-ink">{d.wallets}</div>
              </div>
              <div>
                <div className="eyebrow">Signatures</div>
                <div className="font-mono mt-1 text-[26px] text-ink">{d.events}</div>
              </div>
              <div>
                <div className="eyebrow">Referrals</div>
                <div className="font-mono mt-1 text-[26px] text-ink">{d.referrals}</div>
              </div>
            </div>
          ) : null
        }
      />
      {!d ? (
        <Skeleton className="h-64" />
      ) : d.wallets === 0 ? (
        <div className="border-t border-line-2 py-16 text-center">
          <div className="font-serif text-[26px] text-ink">The file is open. Nobody has signed yet.</div>
          <p className="mx-auto mt-2 max-w-md text-[14px] text-grey-green">
            The first wallet to record an intent or join a queue becomes wallet #1.{" "}
            <Link to="/portfolio" className="text-emerald hover:underline">
              Connect and record
            </Link>
            .
          </p>
        </div>
      ) : (
        <div className="grid gap-x-12 gap-y-12 border-t border-line-2 pt-10 md:grid-cols-2 xl:grid-cols-4">
          <Table title="Most XP" sub="Derived from signed records and credited referrals. Not a token.">
            {d.xp.map((row, index) => (
              <li key={row.wallet} className="flex items-center justify-between gap-3 border-b border-line py-3">
                <span className="flex items-center gap-3">
                  <span className="font-mono w-10 text-[13px] text-grey-green">{index + 1}</span>
                  <Link to={`/portfolio?address=${row.wallet}`} className="font-mono text-[13.5px] text-ink hover:underline">
                    {shortAddress(row.wallet, 5)}
                  </Link>
                </span>
                <span className="font-mono text-[13px] text-emerald">{row.xp.toLocaleString("en-US")} XP</span>
              </li>
            ))}
          </Table>
          <Table title="Earliest signers" sub="Wallet number is the order of a wallet's first signature.">
            {d.earliest.map((row) => (
              <li key={row.wallet} className="flex items-center justify-between gap-3 border-b border-line py-3">
                <span className="flex items-center gap-3">
                  <span className="font-mono w-10 text-[13px] text-emerald">#{row.number}</span>
                  <Link to={`/portfolio?address=${row.wallet}`} className="font-mono text-[13.5px] text-ink hover:underline">
                    {shortAddress(row.wallet, 5)}
                  </Link>
                </span>
                <span className="text-right text-[12px] text-grey-green">
                  {row.tickers} {row.tickers === 1 ? "ticker" : "tickers"} · {relative(row.at)}
                </span>
              </li>
            ))}
          </Table>
          <Table title="Widest records" sub="Distinct tickers a wallet has signed for.">
            {d.widest.map((row) => (
              <li key={row.wallet} className="flex items-center justify-between gap-3 border-b border-line py-3">
                <span className="flex items-center gap-3">
                  <span className="font-mono w-10 text-[13px] text-ink">{row.tickers}</span>
                  <Link to={`/portfolio?address=${row.wallet}`} className="font-mono text-[13.5px] text-ink hover:underline">
                    {shortAddress(row.wallet, 5)}
                  </Link>
                </span>
                <span className="font-mono text-[12.5px] text-grey-green">{shares(row.shareEq)} sh-eq</span>
              </li>
            ))}
          </Table>
          <Table title="Largest verified position" sub="Per ticker: the biggest share-equivalent read at signing.">
            {d.largest.map((row) => (
              <li key={row.symbol} className="flex items-center justify-between gap-3 border-b border-line py-3">
                <span className="flex items-center gap-3">
                  <AssetLogo symbol={row.symbol} logo={row.logo} size="sm" />
                  <span>
                    <Link to={`/record/${row.symbol}`} className="block text-[14px] text-ink hover:underline">
                      {row.symbol}
                    </Link>
                    <Link to={`/portfolio?address=${row.wallet}`} className="font-mono block text-[11.5px] text-grey-green hover:underline">
                      {shortAddress(row.wallet, 5)} · {row.holders} recorded
                    </Link>
                  </span>
                </span>
                <span className="font-mono text-[13px] text-ink">{shares(row.shareEq)} sh-eq</span>
              </li>
            ))}
          </Table>
        </div>
      )}
      <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-grey-green">
        <Mark tone="muted">Not a token · not a vote · not a claim on the issuer</Mark>
        <span>XP and record numbers exist so being early and thorough in the file is visible. Nothing here is spendable, and there is no Redeem token.</span>
      </div>
    </Page>
  );
}

function Table({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-serif text-[26px] text-ink">{title}</h2>
      <p className="mt-1 text-[13px] text-grey-green">{sub}</p>
      <ol className="mt-4 border-t border-line-2">{children}</ol>
    </section>
  );
}
