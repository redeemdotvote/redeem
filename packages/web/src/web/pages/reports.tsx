import { Link } from "wouter";
import { AssetLogo } from "../components/brand";
import { Page, PageHead } from "../components/layout";
import { ChainLine } from "../components/robinhood-chain";
import { Countdown } from "../components/status";
import { Mark, Skeleton } from "../components/ui";
import { isoDate } from "../lib/format";
import { useReports } from "../queries/reports";

/** /reports — one Holder Intent Report per stockholder meeting. */
export default function ReportsPage() {
  const reports = useReports();
  return (
    <Page>
      <PageHead
        eyebrow={<span className="inline-flex flex-wrap items-center gap-4">Holder Intent Reports <ChainLine caption={null} /></span>}
        title={
          <>
            What token holders <span className="italic">would have wanted.</span>
          </>
        }
        body="One report per stockholder meeting: what the holders of that company's Stock Token recorded on each proxy item, next to the board's recommendation. Live until the cutoff, then frozen, hashed and timestamped so it can never be quietly rewritten."
      />
      {reports.isLoading ? (
        <Skeleton className="h-64" />
      ) : (reports.data?.length ?? 0) === 0 ? (
        <p className="border-t border-line-2 py-12 text-[14.5px] text-grey-green">No meetings are open right now. Reports appear here as soon as a proxy statement is on file.</p>
      ) : (
        <ol className="border-t border-line-2">
          {reports.data!.map((report) => (
            <li key={report.id}>
              <Link to={`/reports/${report.id}`} className="grid gap-3 border-b border-line py-5 transition-colors hover:bg-mint/60 sm:grid-cols-[minmax(0,1fr)_160px_170px] sm:items-center sm:gap-6">
                <span className="flex min-w-0 items-center gap-3">
                  <AssetLogo symbol={report.symbol} logo={report.logo} size="sm" />
                  <span className="min-w-0">
                    <span className="block truncate text-[16px] text-ink">
                      {report.name} <span className="font-mono text-[12.5px] text-grey-green">{report.symbol}</span>
                    </span>
                    <span className="block text-[12.5px] text-grey-green">
                      {report.meetingType === "special" ? "Special" : "Annual"} meeting · {isoDate(report.meetingDate)} · {report.items} items
                    </span>
                  </span>
                </span>
                <span className="font-mono text-[13px] text-ink">
                  {report.wallets} {report.wallets === 1 ? "wallet" : "wallets"} recorded
                </span>
                <span className="sm:text-right">{report.status === "active" ? <Mark tone="live">Live · <Countdown to={report.closesAt} /></Mark> : <Mark tone="ink">Final · timestamped</Mark>}</span>
              </Link>
            </li>
          ))}
        </ol>
      )}
      <p className="mt-8 max-w-[70ch] text-[12.5px] leading-relaxed text-grey-green">A report describes recorded intent. It is not a shareholder vote, not a proxy solicitation, and asks nobody to vote, grant a proxy or take any action at a meeting. Redeem is independent and is not affiliated with Robinhood or any issuer.</p>
    </Page>
  );
}
