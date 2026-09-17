import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { multiplier, pct, shares, shortDate, usd } from "../lib/format";
import { AssetLogo } from "./brand";
import { Ledger, LHead, LTd, LTh } from "./ledger";
import type { InspectableRow } from "./record-inspector";

/**
 * The security-master ledger. Rows are selectable; the selected row drives the inspector.
 * Columns follow the record: asset, contract, raw supply, multiplier, share-equivalent, value,
 * holders, queue, last action. Numbers are tabular and right-aligned.
 */
export function RecordTable({ rows, selected, onSelect, wallet = false, animate = false, className }: { rows: InspectableRow[]; selected: string | null; onSelect: (symbol: string) => void; wallet?: boolean; animate?: boolean; className?: string }) {
  return (
    <Ledger className={className}>
      <LHead>
        <LTh>Asset</LTh>
        <LTh align="right">Raw supply</LTh>
        <LTh align="right" hide="md">
          Multiplier
        </LTh>
        <LTh align="right">Share-equivalent</LTh>
        <LTh align="right">USD value</LTh>
        <LTh align="right" hide="lg">
          Holders
        </LTh>
        {wallet ? <LTh align="right">Held</LTh> : null}
        <LTh align="right" hide="xl">
          Last action
        </LTh>
      </LHead>
      <tbody>
        {rows.map((row, index) => {
          const active = selected === row.symbol;
          const Row = animate ? motion.tr : "tr";
          const motionProps = animate ? { initial: { opacity: 0, y: 6 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: "-20px" }, transition: { duration: 0.4, delay: Math.min(index, 8) * 0.04 } } : {};
          return (
            <Row
              key={row.symbol}
              {...(motionProps as object)}
              onClick={() => onSelect(row.symbol)}
              className={cn("cursor-pointer border-b border-line transition-colors duration-150 last:border-b-0", active ? "bg-mint" : "hover:bg-mint/60")}
            >
              <LTd>
                <span className="flex items-center gap-3">
                  <AssetLogo symbol={row.symbol} logo={row.logo} size="md" />
                  <span className="min-w-0">
                    <span className="block text-[16px] leading-tight font-medium text-ink">{row.symbol}</span>
                    <span className="block max-w-[220px] truncate text-[12.5px] text-grey-green">{row.name}</span>
                  </span>
                </span>
              </LTd>
              <LTd align="right" mono>
                {shares(row.rawSupply)}
              </LTd>
              <LTd align="right" mono hide="md" muted={row.uiMultiplier === 1}>
                {multiplier(row.uiMultiplier, 6)}×{row.pendingMultiplier ? <span className="ml-1 text-amber">→</span> : null}
              </LTd>
              <LTd align="right" mono className="text-[15px] text-ink">
                {shares(row.shareEquivalent)}
              </LTd>
              <LTd align="right" mono muted={row.valueUsd === null}>
                {row.valueUsd === null ? "no feed" : usd(row.valueUsd, { compact: true })}
              </LTd>
              <LTd align="right" hide="lg" muted className="text-[13px]">
                Not indexed
              </LTd>
              {wallet ? (
                <LTd align="right" mono muted={!row.held}>
                  {row.held ? shares(row.heldShareEq) : "—"}
                </LTd>
              ) : null}
              <LTd align="right" hide="xl" muted className="font-mono text-[12.5px]">
                {row.lastAction ? `Multiplier ${pct(row.lastAction.changeBps / 100, 3)} · ${shortDate(row.lastAction.effectiveAt)}` : "—"}
              </LTd>
            </Row>
          );
        })}
      </tbody>
    </Ledger>
  );
}
