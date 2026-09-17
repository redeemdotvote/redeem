import { cn } from "@/lib/utils";
import { Link } from "wouter";

/**
 * What a Stock Token carries today next to what a share carries, row by row, as the issuer's
 * terms describe it. The two "not today" rows are exactly where Redeem sits: it records intent
 * where there is no vote yet, and readiness where there is no redemption yet.
 */
const ROWS: Array<{ right: string; share: string; token: string; redeem?: { label: string; href: string } }> = [
  { right: "Economic exposure", share: "Yes", token: "Yes. Tokens track the share 1:1, per the issuer." },
  { right: "Dividends and splits", share: "Paid to the holder", token: "Carried through the multiplier; the token count never changes." },
  { right: "Shareholder vote", share: "Yes, through the broker or the holder of record", token: "Not today. Voting is on the issuer's roadmap.", redeem: { label: "Redeem records intent", href: "/intents" } },
  { right: "Redeem for the share", share: "You already hold it", token: "Not today. In-kind redemption is on the issuer's roadmap.", redeem: { label: "Redeem queues readiness", href: "/redeem" } },
  { right: "Transfer", share: "Broker hours, T+1 settlement", token: "Onchain, wallet to wallet, on Robinhood Chain." },
  { right: "Custody", share: "Your broker, usually in street name", token: "Your wallet. The backing shares sit with the issuer's custodian." },
  { right: "The record", share: "The transfer agent's file", token: "This record: share-equivalents, intent, readiness." },
];

export function RightsTable({ symbol, className }: { symbol?: string; className?: string }) {
  return (
    <div className={cn("overflow-hidden border-t border-line-2", className)}>
      <div className="hidden grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1.4fr)] gap-x-6 border-b border-line py-2.5 md:grid">
        <div className="eyebrow">Right</div>
        <div className="eyebrow">A share{symbol ? ` of ${symbol}` : ""}</div>
        <div className="eyebrow">A Stock Token{symbol ? ` for ${symbol}` : ""}</div>
      </div>
      {ROWS.map((row) => (
        <div key={row.right} className="grid gap-x-6 gap-y-1.5 border-b border-line py-4 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1.4fr)]">
          <div className="text-[15px] font-medium text-ink">{row.right}</div>
          <div className="text-[14.5px] text-ink-2">
            <span className="eyebrow mr-2 md:hidden">Share</span>
            {row.share}
          </div>
          <div className="text-[14.5px] text-ink-2">
            <span className="eyebrow mr-2 md:hidden">Token</span>
            {row.token}
            {row.redeem ? (
              <>
                {" "}
                <Link to={row.redeem.href} className="font-medium text-emerald hover:underline">
                  {row.redeem.label}
                </Link>
                .
              </>
            ) : null}
          </div>
        </div>
      ))}
      <p className="pt-3 text-[12.5px] text-grey-green">As described in the issuer's terms for Stock Tokens. Redeem is independent and records intent and readiness only; it cannot create a vote or a redemption.</p>
    </div>
  );
}
