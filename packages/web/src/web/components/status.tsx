import { useEffect, useState } from "react";
import { Mark, Tag } from "./ui";

export const ITEM_TYPE_LABEL: Record<string, string> = {
  election: "Director election",
  ratify_auditor: "Auditor ratification",
  say_on_pay: "Say on pay",
  say_on_frequency: "Say-on-pay frequency",
  equity_plan: "Equity plan",
  charter_amendment: "Charter amendment",
  bylaw_amendment: "Bylaw amendment",
  share_authorization: "Share authorization",
  reverse_split: "Reverse split",
  merger: "Merger",
  shareholder_proposal: "Shareholder proposal",
  adjournment: "Adjournment",
  other: "Other",
};

const RECOMMENDATION: Record<string, string> = { for: "Board: for", against: "Board: against", one_year: "Board: 1 year", two_years: "Board: 2 years", three_years: "Board: 3 years", none: "No board recommendation" };

export function Recommendation({ value }: { value: string }) {
  return <Tag>{RECOMMENDATION[value] ?? RECOMMENDATION.none}</Tag>;
}

export function EventStatus({ status, attested, historical }: { status: "active" | "closed"; attested?: boolean; historical?: boolean }) {
  if (status === "active") return <Mark tone="live">Open for intent</Mark>;
  if (historical) return <Mark tone="muted">Historical</Mark>;
  if (attested) return <Mark tone="emerald">Attested</Mark>;
  return <Mark tone="muted">Closed</Mark>;
}

/** The label that goes next to every tally. Never omitted. */
export function IntentLabel({ dark = false, className }: { dark?: boolean; className?: string }) {
  return <span className={`text-[10.5px] font-medium tracking-[0.14em] uppercase ${dark ? "text-[#8fb3a0]" : "text-grey-green"} ${className ?? ""}`}>Intent · not a shareholder vote</span>;
}

/** DD H MM countdown to a unix timestamp, ticking once a minute. */
export function Countdown({ to, className }: { to: number; className?: string }) {
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() / 1000), 30_000);
    return () => clearInterval(id);
  }, []);
  const delta = Math.max(0, to - now);
  const d = Math.floor(delta / 86_400);
  const h = Math.floor((delta % 86_400) / 3600);
  const m = Math.floor((delta % 3600) / 60);
  if (delta <= 0) return <span className={className}>Closed</span>;
  return (
    <span className={className}>
      {String(d).padStart(2, "0")}d {String(h).padStart(2, "0")}h {String(m).padStart(2, "0")}m
    </span>
  );
}
