import { ArrowRight, Search } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { startGuide } from "./guide";
import { dateTimeUtc, pct, shares, shortAddress } from "../lib/format";
import { useCorporateActions } from "../queries/portfolio";
import { useRecordBook } from "../queries/record";
import { AssetLogo } from "./brand";

type Result = { key: string; group: "Securities" | "Wallets" | "Corporate actions" | "Pages"; title: string; sub?: string; trail?: string; logo?: string | null; symbol?: string; to: string };

const PAGES: Array<[string, string, string]> = [
  ["Walkthrough", "A two-minute guide to what Redeem is and does", "#walkthrough"],
  ["Record Book", "One ledger for every official Stock Token", "/record"],
  ["Markets", "Security master", "/markets"],
  ["Portfolio", "Your positions and signed record", "/portfolio"],
  ["Intents", "Proxy items on file", "/intents"],
  ["Redemption readiness", "Ticker-specific queues", "/redeem"],
  ["API", "The Stock Token record layer", "/developers"],
  ["How it works", "The mechanism, plainly", "/how-it-works"],
];

/** The command palette: securities, contracts, wallets, corporate actions and pages, from ⌘K. */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [, navigate] = useLocation();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const book = useRecordBook();
  const actions = useCorporateActions();

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const results = useMemo<Result[]>(() => {
    const q = query.trim().toLowerCase();
    const rows = book.data?.rows ?? [];
    const out: Result[] = [];
    if (/^0x[a-f0-9]{40}$/i.test(q)) {
      const token = rows.find((row) => row.address.toLowerCase() === q);
      if (token) out.push({ key: `c-${token.symbol}`, group: "Securities", title: token.symbol, sub: `${token.tokenName} · official contract`, trail: `${shares(token.shareEquivalent)} sh-eq`, logo: token.logo, symbol: token.symbol, to: `/record/${token.symbol}` });
      else out.push({ key: "wallet", group: "Wallets", title: shortAddress(q, 8), sub: "View positions for this wallet", trail: "read-only", to: `/portfolio?address=${q}` });
    }
    const matched = q ? rows.filter((row) => row.symbol.toLowerCase().startsWith(q) || row.name.toLowerCase().includes(q) || row.tokenName.toLowerCase().includes(q)) : [...rows].sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0));
    for (const row of matched.slice(0, q ? 6 : 5)) {
      out.push({ key: `s-${row.symbol}`, group: "Securities", title: row.symbol, sub: `${row.tokenName.replace(" • Robinhood Token", " stock token")} · official`, trail: `${shares(row.shareEquivalent)} sh-eq`, logo: row.logo, symbol: row.symbol, to: `/record/${row.symbol}` });
    }
    const events = (actions.data?.actions ?? []).filter((action) => !q || action.symbol.toLowerCase().startsWith(q) || "multiplier".includes(q) || "corporate action".includes(q));
    for (const action of events.slice(0, q ? 4 : 3)) {
      out.push({ key: `a-${action.txHash}-${action.logIndex}`, group: "Corporate actions", title: `${action.symbol} · UIMultiplierUpdated`, sub: `${pct(action.changeBps / 100, 3)} · effective ${dateTimeUtc(action.effectiveAt)}`, trail: "open record", to: `/record/${action.symbol}` });
    }
    for (const [title, sub, to] of PAGES) {
      if (!q || title.toLowerCase().includes(q) || sub.toLowerCase().includes(q)) out.push({ key: `p-${to}`, group: "Pages", title, sub, to });
    }
    return out.slice(0, 14);
  }, [book.data, actions.data, query]);

  useEffect(() => setActive(0), [query]);

  const go = (result: Result) => {
    onClose();
    if (result.to === "#walkthrough") startGuide();
    else navigate(result.to);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  let lastGroup = "";
  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div className="fixed inset-0 z-[60] bg-charcoal/45 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} onClick={onClose} />
          <motion.div
            role="dialog"
            aria-label="Search records"
            className="fixed inset-x-3 top-[8vh] z-[61] mx-auto max-w-[720px] overflow-hidden rounded-[16px] border border-line bg-cream shadow-diffuse sm:inset-x-6"
            initial={{ opacity: 0, y: -8, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.99 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex items-center gap-3 border-b border-line px-5">
              <Search className="size-4 text-grey-green" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setActive((value) => Math.min(value + 1, results.length - 1));
                  } else if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setActive((value) => Math.max(value - 1, 0));
                  } else if (event.key === "Enter") {
                    const hit = results[active];
                    if (hit) go(hit);
                  }
                }}
                placeholder="Ticker, asset, contract, wallet address, corporate action…"
                className="h-14 w-full bg-transparent text-[16px] text-ink outline-none placeholder:text-grey-green/70"
              />
              <kbd className="font-mono hidden rounded-[6px] border border-line px-1.5 py-0.5 text-[11px] text-grey-green sm:block">esc</kbd>
            </div>
            <ul className="max-h-[60vh] overflow-y-auto py-2">
              {results.length === 0 ? <li className="px-5 py-8 text-center text-[14px] text-grey-green">Nothing on the record matches.</li> : null}
              {results.map((result, index) => {
                const header = result.group !== lastGroup ? result.group : null;
                lastGroup = result.group;
                return (
                  <li key={result.key}>
                    {header ? <div className="eyebrow px-5 pt-3 pb-1.5">{header}</div> : null}
                    <button
                      type="button"
                      onMouseEnter={() => setActive(index)}
                      onClick={() => go(result)}
                      className={cn("flex w-full items-center gap-3 px-5 py-2.5 text-left", index === active ? "bg-mint" : "")}
                    >
                      {result.symbol ? <AssetLogo symbol={result.symbol} logo={result.logo} size="sm" /> : <span className="grid size-7 place-items-center rounded-full border border-line text-grey-green"><ArrowRight className="size-3.5" /></span>}
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] text-ink">{result.title}</span>
                        {result.sub ? <span className="block truncate text-[12.5px] text-grey-green">{result.sub}</span> : null}
                      </span>
                      {result.trail ? <span className="font-mono shrink-0 text-[12.5px] text-grey-green">{result.trail}</span> : null}
                      {index === active ? <span className="hidden text-[12px] text-emerald sm:inline">Open →</span> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}

/** The nav trigger. Looks like a field, opens the palette. */
export function SearchTrigger({ onOpen, className, label = "Search records" }: { onOpen: () => void; className?: string; label?: string }) {
  return (
    <button type="button" onClick={onOpen} className={cn("flex h-9 items-center gap-2.5 rounded-[10px] border border-line bg-cream/70 pr-2 pl-3 text-[13.5px] text-grey-green transition-colors hover:border-ink hover:text-ink", className)}>
      <Search className="size-3.5" />
      <span className="flex-1 text-left">{label}</span>
      <kbd className="font-mono rounded-[5px] border border-line px-1.5 py-0.5 text-[10.5px]">⌘K</kbd>
    </button>
  );
}

/** Global ⌘K binding. */
export function useCommandPalette() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return { open, setOpen };
}
