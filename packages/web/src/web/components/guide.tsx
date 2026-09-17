import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Button } from "./ui";

/**
 * The first-visit walkthrough. Six short cards, each pointed at the real control it describes
 * (the Record Book, the Intents and Redeem pages, the wallet button, search), with the rest of the
 * page dimmed. It opens once on a first visit to the home page, and again from the "Walkthrough"
 * links in the header, the hero and the footer, or from ?guide=1. Progress is not saved: it is
 * two minutes long and restarting it is the point.
 */

const KEY = "redeem-guide";
const EVENT = "redeem:guide";
/** Read once at load: React may run the mount effect twice in development, and the flag is stripped from the URL on the first pass. */
const OPEN_ON_LOAD = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("guide") === "1";

type Step = {
  id: string;
  /** data-guide value of the control this step points at; none = centred card. */
  target?: string;
  eyebrow: string;
  title: string;
  body: string;
  note?: string;
};

const STEPS: Step[] = [
  {
    id: "welcome",
    eyebrow: "Welcome to Redeem",
    title: "Every token leaves a record.",
    body: "Redeem is an independent record layer for Robinhood Stock Tokens on Robinhood Chain. It reads what each wallet holds, lets holders sign what they would want, and keeps redemption demand on file. It custodies nothing.",
    note: "A recorded intent is not a shareholder vote. Stock Tokens give economic exposure; voting and in-kind redemption are on the issuer's roadmap.",
  },
  {
    id: "record",
    target: "record-book",
    eyebrow: "01 · The Record Book",
    title: "One ledger for every official Stock Token.",
    body: "Raw supply, the multiplier that carries splits and dividends, the share-equivalent it produces, and the Chainlink value, read live from the contracts. Click any row to open its record and history.",
  },
  {
    id: "intents",
    target: "nav-intents",
    eyebrow: "02 · Intents",
    title: "Sign what you would want.",
    body: "Each issuer's proxy items, extracted from its SEC filing. A holder signs For, Against, Abstain or Delegate with their wallet: no gas, no approval, weighted by the share-equivalent they hold. Tallies are attested with a Merkle root at cutoff.",
    note: "Every tally is labelled INTENT · NOT A SHAREHOLDER VOTE.",
  },
  {
    id: "redeem",
    target: "nav-redeem",
    eyebrow: "03 · Redeem",
    title: "Readiness, per security.",
    body: "In-kind redemption is not live. A holder can place a signed, numbered request in a ticker's queue with the acknowledgements a window would need, so the file is complete before one opens. Nothing here promises settlement.",
  },
  {
    id: "wallet",
    target: "connect",
    eyebrow: "04 · Your positions",
    title: "Connect, or just look.",
    body: "Connect a wallet to see your share-equivalents and sign, or open My positions and paste any address for a read-only view. Signing is the only thing a wallet ever does here.",
  },
  {
    id: "search",
    target: "search",
    eyebrow: "05 · Find anything",
    title: "⌘K opens search.",
    body: "Tickers, companies, contract addresses, wallets, corporate actions and pages, from any screen. The public API on the API page returns the same record as JSON.",
  },
];

export function startGuide() {
  window.dispatchEvent(new CustomEvent(EVENT));
}

function seen(): boolean {
  try {
    return localStorage.getItem(KEY) === "done";
  } catch {
    return true;
  }
}

function markSeen() {
  try {
    localStorage.setItem(KEY, "done");
  } catch {}
}

type Rect = { top: number; left: number; width: number; height: number };

function findTarget(id: string): HTMLElement | null {
  const nodes = Array.from(document.querySelectorAll<HTMLElement>(`[data-guide="${id}"]`));
  return nodes.find((node) => node.getClientRects().length > 0 && node.offsetWidth > 0) ?? null;
}

export function Guide() {
  const [location] = useLocation();
  const [step, setStep] = useState<number | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [narrow, setNarrow] = useState(false);
  const current = step === null ? null : STEPS[step];

  // Opening: first visit to the home page, the custom event, or ?guide=1.
  useEffect(() => {
    const open = () => {
      // The tour points at controls on the home page. From anywhere else, load the home page
      // with the flag and let the fresh page open the tour once its targets exist.
      if (window.location.pathname !== "/") {
        window.location.assign("/?guide=1");
        return;
      }
      setStep(0);
    };
    window.addEventListener(EVENT, open);
    if (OPEN_ON_LOAD) {
      if (window.location.search) history.replaceState(null, "", window.location.pathname);
      const t = setTimeout(open, 500);
      return () => {
        clearTimeout(t);
        window.removeEventListener(EVENT, open);
      };
    }
    if (location === "/" && !seen()) {
      const t = setTimeout(() => setStep(0), 1400);
      return () => {
        clearTimeout(t);
        window.removeEventListener(EVENT, open);
      };
    }
    return () => window.removeEventListener(EVENT, open);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = useCallback(() => {
    markSeen();
    setStep(null);
    setRect(null);
  }, []);
  const next = useCallback(
    () =>
      setStep((value) =>
        value === null ? null : value + 1 >= STEPS.length ? (markSeen(), null) : value + 1,
      ),
    [],
  );
  const back = useCallback(
    () => setStep((value) => (value === null || value === 0 ? value : value - 1)),
    [],
  );

  // Measure the target for the current step, and keep measuring while the page moves.
  useLayoutEffect(() => {
    if (!current) return;
    if (!current.target) {
      setRect(null);
      return;
    }
    // The target may still be rendering (the tour can be opened from another page), so look
    // for it a few times before settling on a centred card.
    let el: HTMLElement | null = null;
    let raf = 0;
    let tries = 0;
    let poll = 0;
    let settle = 0;
    const measure = () => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    const onMove = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    const attach = () => {
      el = findTarget(current.target!);
      if (!el) {
        if (tries++ < 12) poll = window.setTimeout(attach, 150);
        else setRect(null);
        return;
      }
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      measure();
      settle = window.setTimeout(measure, 450);
      window.addEventListener("scroll", onMove, { passive: true });
      window.addEventListener("resize", onMove);
    };
    setRect(null);
    attach();
    return () => {
      clearTimeout(poll);
      clearTimeout(settle);
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onMove);
      window.removeEventListener("resize", onMove);
    };
  }, [current]);

  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < 720);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (step === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
      else if (event.key === "ArrowRight" || event.key === "Enter") next();
      else if (event.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = rect ? "" : "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [step, rect, close, next, back]);

  // Where the card sits: under the target when there is room, above it otherwise, centred when
  // there is no target. On phones it is a sheet along the bottom edge.
  const cardStyle = useMemo<React.CSSProperties>(() => {
    if (narrow || !rect) return {};
    const width = 380;
    const height = 320;
    const gap = 14;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const left = Math.min(Math.max(16, rect.left), vw - width - 16);
    const top = Math.min(Math.max(16, rect.top), vh - height - 16);
    const below = rect.top + rect.height + gap;
    if (below + height <= vh - 8) return { top: below, left, width };
    if (rect.top - gap - height >= 8) return { bottom: vh - rect.top + gap, left, width };
    if (rect.left + rect.width + gap + width <= vw - 16) return { top, left: rect.left + rect.width + gap, width };
    if (rect.left - gap - width >= 16) return { top, left: rect.left - gap - width, width };
    return { bottom: 16, right: 16, width };
  }, [rect, narrow]);

  if (step === null || !current || typeof document === "undefined") return null;
  const last = step === STEPS.length - 1;
  const pad = 8;

  return createPortal(
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="Walkthrough">
      {rect ? (
        <div
          aria-hidden
          className="absolute rounded-[12px] ring-1 ring-emerald/70 transition-[top,left,width,height] duration-300 ease-out"
          style={{
            top: rect.top - pad,
            left: rect.left - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
            boxShadow: "0 0 0 9999px rgb(11 18 14 / 0.58)",
          }}
        />
      ) : (
        <div aria-hidden className="absolute inset-0 bg-[rgb(11_18_14_/_0.58)]" />
      )}
      <button
        type="button"
        aria-label="Close walkthrough"
        onClick={close}
        className="absolute inset-0 cursor-default"
      />
      <div
        key={current.id}
        className={cn(
          "surface rise absolute rounded-[16px] p-5 sm:p-6",
          narrow
            ? "inset-x-3 bottom-3"
            : !rect
              ? "top-1/2 left-1/2 w-[min(440px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2"
              : "",
        )}
        style={cardStyle}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="eyebrow">{current.eyebrow}</div>
          <button
            type="button"
            onClick={close}
            className="-mt-1 -mr-1 grid size-7 place-items-center rounded-[8px] text-grey-green hover:text-ink"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>
        <h2 className="font-serif mt-2 text-[26px] leading-[1.05] text-ink sm:text-[30px]">
          {current.title}
        </h2>
        <p className="mt-3 text-[14.5px] leading-relaxed text-ink-2">{current.body}</p>
        {current.note ? (
          <p className="mt-3 border-l-2 border-emerald pl-3 text-[13px] leading-relaxed text-grey-green">
            {current.note}
          </p>
        ) : null}
        <div className="mt-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[12px] whitespace-nowrap text-grey-green">
              {step + 1} / {STEPS.length}
            </span>
            <span className="flex items-center gap-1" aria-hidden>
              {STEPS.map((s, index) => (
                <span
                  key={s.id}
                  className={cn(
                    "h-[3px] w-4 rounded-full transition-colors",
                    index <= step ? "bg-emerald" : "bg-line-2",
                  )}
                />
              ))}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {step > 0 ? (
              <Button size="sm" variant="ghost" onClick={back} aria-label="Back">
                <ArrowLeft className="size-3.5" />
              </Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={close}>
                Skip
              </Button>
            )}
            {last ? (
              <Button size="sm" asChild onClick={close}>
                <Link to="/record">Open Record Book</Link>
              </Button>
            ) : (
              <Button size="sm" onClick={next}>
                Next <ArrowRight className="size-3.5" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
