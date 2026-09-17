import { ArrowUpRight, X } from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { explorerAddress } from "../lib/chain";
import { multiplier, pct, shares, shortAddress, shortDate, usd } from "../lib/format";
import { AssetLogo } from "./brand";
import { Def } from "./ui";

export interface InspectableRow {
  symbol: string;
  name: string;
  tokenName: string;
  logo: string | null;
  address: string;
  rawSupply: number;
  uiMultiplier: number;
  pendingMultiplier: number | null;
  effectiveAt: number | null;
  shareEquivalent: number;
  priceUsd: number | null;
  priceUpdatedAt: number | null;
  valueUsd: number | null;
  intents: number;
  intentShareEq: number;
  requests: number;
  requestedShareEq: number;
  openEvents: number;
  actionCount: number;
  lastAction: { effectiveAt: number; changeBps: number; txHash: string } | null;
  held: boolean;
  heldShareEq: number;
}

/** The object inspector: one security, the fields that matter, one action. */
export function RecordInspector({ row, onClose, className }: { row: InspectableRow; onClose?: () => void; className?: string; blockTimestamp?: number }) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <AssetLogo symbol={row.symbol} logo={row.logo} size="md" />
          <div>
            <div className="text-[17px] font-medium text-ink">{row.symbol}</div>
            <div className="text-[13px] text-grey-green">{row.name}</div>
          </div>
        </div>
        {onClose ? (
          <button type="button" onClick={onClose} aria-label="Close inspector" className="grid size-8 place-items-center rounded-[8px] text-grey-green hover:text-ink lg:hidden">
            <X className="size-4" />
          </button>
        ) : null}
      </div>

      <div className="mt-6">
        <div className="font-mono text-[32px] leading-none text-ink">{row.shareEquivalent.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        <div className="eyebrow mt-2">Share-equivalent</div>
      </div>

      <dl className="mt-5">
        <Def term="Value" mono>
          {row.valueUsd === null ? <span className="text-grey-green">No feed</span> : usd(row.valueUsd, { compact: true })}
        </Def>
        <Def term="Multiplier" mono>
          {multiplier(row.uiMultiplier, 6)}×{row.pendingMultiplier ? <span className="text-amber"> → {multiplier(row.pendingMultiplier, 6)}×</span> : null}
        </Def>
        <Def term="Raw supply" mono>
          {row.rawSupply.toLocaleString("en-US", { maximumFractionDigits: 2 })}
        </Def>
        <Def term="Holders">
          <span className="text-grey-green">Not indexed</span>
        </Def>
        <Def term="Queue" mono>
          {row.requests > 0 ? `${shares(row.requestedShareEq)} sh-eq` : <span className="text-grey-green">None</span>}
        </Def>
        <Def term="Last action" mono>
          {row.lastAction ? `${pct(row.lastAction.changeBps / 100, 3)} · ${shortDate(row.lastAction.effectiveAt)}` : <span className="text-grey-green">None</span>}
        </Def>
        <Def term="Contract" mono>
          <a href={explorerAddress(row.address)} target="_blank" rel="noreferrer" className="hover:text-emerald">
            {shortAddress(row.address, 5)}
          </a>
        </Def>
        {row.held ? (
          <Def term="Your position" mono>
            {shares(row.heldShareEq)} sh-eq
          </Def>
        ) : null}
      </dl>
      <Link to={`/record/${row.symbol}`} className="mt-5 inline-flex items-center gap-1.5 text-[14.5px] font-medium text-emerald hover:underline">
        Open record <ArrowUpRight className="size-4" />
      </Link>
    </div>
  );
}
