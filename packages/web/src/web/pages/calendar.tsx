import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { AssetLogo } from "../components/brand";
import { Page, PageHead } from "../components/layout";
import { ChainLine } from "../components/robinhood-chain";
import { Countdown } from "../components/status";
import { Eyebrow, Mark, Skeleton } from "../components/ui";
import { orpc } from "../lib/api";
import { isoDate, shares } from "../lib/format";

type Row = { id: string; symbol: string; name: string; logo: string | null; meetingType: string; recordDate: string | null; meetingDate: string; closesAt: number; state: string; items: number; wallets: number; shareEq: number; reported: boolean };

/** /calendar — every meeting on file: record date, intent cutoff, meeting date, what was recorded, whether the result is in. */
export default function CalendarPage() {
  const calendar = useQuery(orpc.stats.calendar.queryOptions({ staleTime: 60_000, placeholderData: keepPreviousData }));
  const c = calendar.data;
  return (
    <Page>
      <PageHead
        eyebrow={<span className="inline-flex flex-wrap items-center gap-4">Meeting calendar <ChainLine caption={null} /></span>}
        title={
          <>
            Record dates, cutoffs, <span className="italic">meetings.</span>
          </>
        }
        body="Each issuer sets a record date in its proxy statement, holds its meeting weeks later, and reports the result within four business days. Intent on Redeem closes three days before the meeting. Dates are shown only where the filing states them."
        aside={
          c ? (
            <div className="grid grid-cols-3 gap-x-10 lg:text-right">
              <div>
                <div className="eyebrow">Open for intent</div>
                <div className="font-mono mt-1 text-[26px] text-emerald">{c.open.length}</div>
              </div>
              <div>
                <div className="eyebrow">Meetings held</div>
                <div className="font-mono mt-1 text-[26px] text-ink">{c.held.length}</div>
              </div>
              <div>
                <div className="eyebrow">Results on file</div>
                <div className="font-mono mt-1 text-[26px] text-ink">{c.reportedCount}</div>
              </div>
            </div>
          ) : null
        }
      />
      {!c ? (
        <Skeleton className="h-72" />
      ) : (
        <div className="space-y-12 border-t border-line-2 pt-8">
          <Section title="Open for intent" empty="No meeting is open for intent right now. The next proxy statement on EDGAR opens one." rows={c.open} open />
          {c.awaiting.length > 0 ? <Section title="Cutoff passed, meeting ahead" empty="" rows={c.awaiting} /> : null}
          <Section title="Held" empty="No meetings held yet." rows={c.held} limit={60} />
        </div>
      )}
    </Page>
  );
}

function Section({ title, rows, empty, open = false, limit }: { title: string; rows: Row[]; empty: string; open?: boolean; limit?: number }) {
  const shown = limit ? rows.slice(0, limit) : rows;
  return (
    <section>
      <div className="flex items-baseline justify-between gap-4">
        <Eyebrow>{title}</Eyebrow>
        <span className="font-mono text-[12px] text-grey-green">{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <p className="mt-3 text-[14px] text-grey-green">{empty}</p>
      ) : (
        <>
          <div className="mt-3 hidden grid-cols-[minmax(0,1.4fr)_110px_150px_110px_150px_120px] gap-4 border-y border-line-2 py-2 lg:grid">
            {["Company", "Record date", "Intent cutoff", "Meeting", "Recorded", "Result"].map((head) => (
              <div key={head} className="eyebrow">
                {head}
              </div>
            ))}
          </div>
          <ol>
            {shown.map((row) => (
              <li key={row.id}>
                <Link to={`/reports/${row.id}`} className="grid grid-cols-2 gap-x-4 gap-y-1.5 border-b border-line py-3.5 text-[13.5px] [&>span:first-child]:col-span-2 lg:[&>span:first-child]:col-span-1 transition-colors hover:bg-mint/60 lg:grid-cols-[minmax(0,1.4fr)_110px_150px_110px_150px_120px] lg:items-center lg:gap-4">
                  <span className="flex min-w-0 items-center gap-3">
                    <AssetLogo symbol={row.symbol} logo={row.logo} size="sm" />
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] text-ink">
                        {row.name} <span className="font-mono text-[12px] text-grey-green">{row.symbol}</span>
                      </span>
                      <span className="block text-[12px] text-grey-green">
                        {row.meetingType === "special" ? "Special" : "Annual"} · {row.items} items
                      </span>
                    </span>
                  </span>
                  <span className="font-mono text-[12.5px] text-ink-2"><span className="eyebrow mr-2 lg:hidden">Record date</span>{row.recordDate ? isoDate(row.recordDate) : "Not stated"}</span>
                  <span className="font-mono text-[12.5px]"><span className="eyebrow mr-2 lg:hidden">Cutoff</span>{open ? <Countdown to={row.closesAt} className="text-emerald" /> : <span className="text-grey-green">{isoDate(new Date(row.closesAt * 1000).toISOString())}</span>}</span>
                  <span className="font-mono text-[12.5px] text-ink-2"><span className="eyebrow mr-2 lg:hidden">Meeting</span>{isoDate(row.meetingDate)}</span>
                  <span className="font-mono text-[12.5px] text-ink"><span className="eyebrow mr-2 lg:hidden">Recorded</span>{row.wallets > 0 ? `${shares(row.shareEq)} sh-eq · ${row.wallets}w` : <span className="text-grey-green">nothing yet</span>}</span>
                  <span className={row.reported || row.state === "held" ? "" : "hidden lg:block"}>{row.reported ? <Mark tone="ink">8-K on file</Mark> : row.state === "held" ? <Mark tone="muted">Not reported</Mark> : <span className="text-[12px] text-grey-green">—</span>}</span>
                </Link>
              </li>
            ))}
          </ol>
          {limit && rows.length > limit ? <p className="mt-3 text-[12.5px] text-grey-green">Showing the latest {limit} of {rows.length}.</p> : null}
        </>
      )}
    </section>
  );
}
