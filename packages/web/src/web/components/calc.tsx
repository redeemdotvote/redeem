import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { multiplier, usd } from "../lib/format";
import { useRecordBook } from "../queries/record";
import { Num } from "./number";
import { Select } from "./ui";

/** How the number is made: live multiplier and Chainlink answer for the chosen token; the quantity is the reader's. */
export function ShareEqCalculator({ className, defaultSymbol = "NVDA" }: { className?: string; defaultSymbol?: string }) {
  const book = useRecordBook();
  const priced = useMemo(() => (book.data?.rows ?? []).filter((row) => row.priceUsd !== null).sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0)), [book.data]);
  const [symbol, setSymbol] = useState(defaultSymbol);
  const [raw, setRaw] = useState("42.88");
  const row = priced.find((entry) => entry.symbol === symbol) ?? priced[0];
  const rawNumber = Number(raw) || 0;
  const shareEq = row ? rawNumber * row.uiMultiplier : 0;
  const value = row && row.priceUsd !== null ? rawNumber * row.priceUsd : 0;
  const fmt6 = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 6, maximumFractionDigits: 6 });

  return (
    <div className={cn("min-w-0", className)}>
      <div className="grid gap-x-6 gap-y-6 md:grid-cols-[1fr_auto_1fr_auto_1.2fr] md:items-end">
        <div>
          <input value={raw} inputMode="decimal" onChange={(event) => setRaw(event.target.value.replace(/[^0-9.]/g, ""))} className="font-mono w-full border-b border-line-2 bg-transparent pb-1 text-[38px] leading-none text-ink outline-none focus:border-ink sm:text-[46px]" aria-label="Raw tokens" />
          <div className="eyebrow mt-2">Raw</div>
        </div>
        <div className="font-serif hidden text-[44px] leading-none text-grey-green md:block">×</div>
        <div>
          <div className="font-mono text-[38px] leading-none text-ink sm:text-[46px]">{row ? multiplier(row.uiMultiplier, 6) : "—"}</div>
          <div className="eyebrow mt-2">Multiplier</div>
        </div>
        <div className="font-serif hidden text-[44px] leading-none text-grey-green md:block">=</div>
        <div>
          <div className="font-mono text-[38px] leading-none text-emerald sm:text-[46px]">
            <Num value={shareEq} format={fmt6} duration={0.5} />
          </div>
          <div className="eyebrow mt-2">Share-equivalent</div>
        </div>
      </div>
      <div className="mt-8 flex flex-wrap items-end justify-between gap-6 border-t border-line pt-5">
        <div className="flex flex-wrap gap-x-12 gap-y-4">
          <div>
            <div className="font-mono text-[22px] leading-none text-ink">{row?.priceUsd !== null && row ? usd(row.priceUsd) : "—"}</div>
            <div className="eyebrow mt-2">Chainlink</div>
          </div>
          <div>
            <div className="font-mono text-[22px] leading-none text-ink">
              <Num value={value} format={(v) => usd(v)} duration={0.5} />
            </div>
            <div className="eyebrow mt-2">Value</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[13px] text-grey-green">Live values for</span>
          <Select value={row?.symbol ?? ""} onChange={(event) => setSymbol(event.target.value)} aria-label="Token">
            {priced.map((entry) => (
              <option key={entry.symbol} value={entry.symbol}>
                {entry.symbol}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <p className="mt-4 text-[14px] text-ink-2">Chainlink pricing is already multiplier-aware. Redeem never applies the multiplier twice.</p>
    </div>
  );
}
