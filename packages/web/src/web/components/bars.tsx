import { cn } from "@/lib/utils";
import { shares } from "../lib/format";

export interface DistributionRow {
  value: string;
  label: string;
  tone: "for" | "against" | "neutral";
  weightFloat: number;
  wallets: number;
  share: number;
}

const FILL: Record<DistributionRow["tone"], string> = { for: "bg-emerald", against: "bg-rust", neutral: "bg-grey-green/45" };

/**
 * Institutional reporting, not a poll: one proportional rule per choice, share-equivalents in
 * mono, the whole thing captioned INTENT. Empty distributions draw their rules at zero.
 */
export function Distribution({ rows, total, unit = "share-eq", compact = false, className }: { rows: DistributionRow[]; total: number; unit?: string; compact?: boolean; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className={cn("space-y-3", compact && "space-y-2")}>
        {rows.map((row) => (
          <div key={row.value}>
            <div className="flex items-baseline justify-between gap-4">
              <span className={cn("eyebrow-ink", compact && "text-[10px]")}>{row.label}</span>
              <span className={cn("font-mono text-ink", compact ? "text-[12.5px]" : "text-[14px]")}>
                {shares(row.weightFloat)}
                {compact ? null : <span className="ml-2 text-[11px] text-grey-green">{row.share.toFixed(1)}%</span>}
              </span>
            </div>
            <div className={cn("mt-1.5 h-[3px] w-full bg-line", compact && "mt-1 h-[2px]")}>
              <div className={cn("h-full transition-[width] duration-700 ease-out", FILL[row.tone])} style={{ width: `${row.share}%` }} />
            </div>
          </div>
        ))}
      </div>
      <div className={cn("mt-3 flex items-baseline justify-between gap-4 border-t border-line pt-2.5", compact && "mt-2 pt-2")}>
        <span className="eyebrow">Total intent</span>
        <span className={cn("font-mono", compact ? "text-[12.5px]" : "text-[14px]")}>
          {shares(total)} <span className="text-grey-green">{unit}</span>
        </span>
      </div>
    </div>
  );
}

/** A single compact horizontal split — for ledger rows and lists. */
export function SplitBar({ rows, className }: { rows: DistributionRow[]; className?: string }) {
  const any = rows.some((row) => row.share > 0);
  return (
    <div className={cn("flex h-[3px] w-full overflow-hidden bg-line", className)}>
      {any ? rows.map((row) => (row.share > 0 ? <div key={row.value} className={cn("h-full", FILL[row.tone])} style={{ width: `${row.share}%` }} /> : null)) : null}
    </div>
  );
}
