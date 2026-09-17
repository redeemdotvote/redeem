import { useParams } from "wouter";
import { AssetLogo } from "../components/brand";
import { ChainLogo } from "../components/robinhood-chain";
import { multiplier, shares, usd } from "../lib/format";
import { useRecord } from "../queries/record";

/**
 * /embed/:symbol — a compact live card with no site chrome, made to sit in an <iframe> on another
 * page. Same numbers as the record page, refreshed on load, with the intent line printed on it.
 */
export default function EmbedPage() {
  const params = useParams<{ symbol: string }>();
  const symbol = (params.symbol ?? "").toUpperCase();
  const record = useRecord(symbol);
  const d = record.data;
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return (
    <a href={`${origin}/record/${symbol}`} target="_blank" rel="noreferrer" className="block min-h-screen bg-paper p-4 text-ink no-underline">
      <div className="surface rounded-[12px] p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2.5">
            {d ? <AssetLogo symbol={symbol} logo={d.token.logo} size="sm" /> : null}
            <span>
              <span className="font-mono block text-[13px] text-ink">{symbol}</span>
              <span className="block text-[11.5px] text-grey-green">{d?.token.name ?? "Robinhood Stock Token"}</span>
            </span>
          </span>
          <ChainLogo height={14} />
        </div>
        <div className="font-mono mt-3 text-[26px] leading-none text-ink">{d ? shares(d.supply.uiFloat) : "…"}</div>
        <div className="mt-1 text-[11px] text-grey-green">share-equivalents recorded{d ? ` · ${multiplier(d.asset.uiMultiplierFloat, 6)}× · ${d.asset.priceUsd === null ? "no feed" : usd(d.asset.marketValueUsd, { compact: true })}` : ""}</div>
        <div className="mt-3 grid grid-cols-2 gap-3 border-t border-line pt-3 text-[11px]">
          <span>
            <span className="font-mono block text-[14px] text-ink">{d ? shares(d.activity.intentShareEq) : "…"}</span>
            <span className="text-grey-green">share-eq of intent</span>
          </span>
          <span>
            <span className="font-mono block text-[14px] text-ink">{d ? d.activity.requests : "…"}</span>
            <span className="text-grey-green">queue requests</span>
          </span>
        </div>
        <div className="mt-3 flex items-center justify-between text-[9.5px] tracking-[0.12em] text-grey-green uppercase">
          <span>Intent · not a shareholder vote</span>
          <span className="font-serif text-[12px] normal-case tracking-normal text-ink">Redeem</span>
        </div>
      </div>
    </a>
  );
}
