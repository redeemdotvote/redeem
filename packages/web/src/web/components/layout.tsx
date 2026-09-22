import { ChevronDown, CircleHelp, Menu, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useHomeStats } from "../queries/stats";
import { ageLabel } from "../lib/format";
import { Wordmark } from "./brand";
import { ConnectWallet } from "./connect-wallet";
import { CommandPalette, SearchTrigger, useCommandPalette } from "./search";
import { ThemeToggle } from "./theme-toggle";
import { ChainLogo, PostRef } from "./robinhood-chain";
import { Guide, startGuide } from "./guide";
import { ConnectNotice } from "./connect-notice";
import { TokenCA } from "./token-ca";
import { captureReferral } from "../lib/referral";
import { PHOTO_LIST } from "./photo";

/** Four things a visitor can do. Everything else lives under More and in the footer. */
const NAV = [
  { href: "/record", label: "Record" },
  { href: "/intents", label: "Sign" },
  { href: "/redeem", label: "Queue" },
  { href: "/portfolio", label: "You" },
];

const MORE: Array<{ href: string; label: string; note: string }> = [
  { href: "/markets", label: "Markets", note: "All 194 Stock Tokens, prices and multipliers" },
  { href: "/queue", label: "Public queue", note: "Every redemption place, in order" },
  { href: "/reports", label: "Intent reports", note: "What holders wanted, per meeting" },
  { href: "/calendar", label: "Meeting calendar", note: "Record dates, cutoffs, results" },
  { href: "/genesis", label: "Genesis", note: "The founding hundred" },
  { href: "/leaderboard", label: "Record holders", note: "Earliest, widest, largest" },
  { href: "/token", label: "$REDEEM", note: "The official token" },
  { href: "/developers", label: "API", note: "Keyless JSON for builders" },
  { href: "/verify", label: "Verify", note: "Check a record in your browser" },
  { href: "/how-it-works", label: "How it works", note: "The mechanism, plainly" },
  { href: "/transparency", label: "Transparency", note: "How far the record reaches" },
  { href: "/status", label: "Status", note: "Chain, cache, database" },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const palette = useCommandPalette();

  useEffect(() => {
    setOpen(false);
    if (!location.includes("#")) window.scrollTo({ top: 0 });
  }, [location]);

  useEffect(() => {
    captureReferral();
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <CommandPalette open={palette.open} onClose={() => palette.setOpen(false)} />
      <header className={cn("no-print sticky top-0 z-40 border-b transition-[background-color,border-color,backdrop-filter] duration-300", scrolled ? "border-line bg-paper/80 backdrop-blur-md" : "border-transparent bg-transparent")}>
        <div className="gutter mx-auto flex h-[60px] max-w-[1600px] items-center gap-6">
          <Link to="/" className="inline-flex items-center">
            <Wordmark />
          </Link>
          <nav className="hidden items-center gap-1 lg:flex">
            {NAV.map((item) => {
              const active = location === item.href || location.startsWith(`${item.href}/`);
              return (
                <Link key={item.href} to={item.href} data-guide={item.href === "/intents" ? "nav-intents" : item.href === "/redeem" ? "nav-redeem" : undefined} className={cn("rounded-[8px] px-2.5 py-1.5 text-[14px] whitespace-nowrap transition-colors", active ? "text-ink" : "text-grey-green hover:text-ink")}>
                  {item.label}
                </Link>
              );
            })}
            <div className="group relative">
              <button type="button" className={cn("inline-flex items-center gap-1 rounded-[8px] px-2.5 py-1.5 text-[14px] transition-colors", MORE.some((item) => location.startsWith(item.href)) ? "text-ink" : "text-grey-green group-hover:text-ink")}>
                More <ChevronDown className="size-3.5" />
              </button>
              <div className="invisible absolute top-full left-0 z-50 w-[520px] pt-2 opacity-0 transition-[opacity,visibility] group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                <div className="surface grid grid-cols-2 gap-x-6 gap-y-0.5 rounded-[14px] p-3">
                  {MORE.map((item) => (
                    <Link key={item.href} to={item.href} className="rounded-[8px] px-2.5 py-2 hover:bg-mint">
                      <span className="block text-[13.5px] text-ink">{item.label}</span>
                      <span className="block text-[11.5px] text-grey-green">{item.note}</span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <span data-guide="search" className="hidden xl:flex">
              <SearchTrigger onOpen={() => palette.setOpen(true)} className="w-[210px]" />
            </span>
            <LiveChain />
            <button type="button" onClick={startGuide} className="hidden size-8 place-items-center rounded-[8px] text-grey-green hover:text-ink lg:grid" aria-label="Walkthrough" title="Walkthrough">
              <CircleHelp className="size-4" />
            </button>
            <ThemeToggle />
            <div data-guide="connect" className="hidden sm:block">
              <ConnectWallet />
            </div>
            <button type="button" onClick={() => palette.setOpen(true)} data-guide="search" className="grid size-8 place-items-center rounded-[8px] text-grey-green xl:hidden" aria-label="Search">
              <Search className="size-4" />
            </button>
            <button type="button" onClick={() => setOpen((value) => !value)} className="grid size-8 place-items-center rounded-[8px] text-grey-green lg:hidden" aria-label="Menu">
              {open ? <X className="size-4" /> : <Menu className="size-4" />}
            </button>
          </div>
        </div>
        {open ? (
          <div className="gutter border-t border-line bg-paper pt-4 pb-5 lg:hidden">
            <nav className="flex flex-col">
              {NAV.map((item) => (
                <Link key={item.href} to={item.href} className={cn("border-b border-line py-3 text-[16px]", location === item.href ? "text-ink" : "text-ink-2")}>
                  {item.label}
                </Link>
              ))}
              <div className="grid grid-cols-2 gap-x-6 pt-3">
                {MORE.map((item) => (
                  <Link key={item.href} to={item.href} className="py-2 text-[13.5px] text-grey-green">
                    {item.label}
                  </Link>
                ))}
              </div>
            </nav>
            <div className="mt-4 sm:hidden [&_button]:w-full [&_button]:justify-center [&>div]:w-full">
              <ConnectWallet size="md" />
            </div>
          </div>
        ) : null}
      </header>

      <main className="flex-1">{children}</main>

      <Footer />
      <Guide />
      <ConnectNotice />
    </div>
  );
}

type StatsQuery = ReturnType<typeof useHomeStats>;

/** live: a fresh read; stale: the last good read is on screen while a refresh fails; reading: nothing yet. */
function liveTone(stats: StatsQuery): "live" | "stale" | "reading" {
  if (!stats.data?.blockNumber) return "reading";
  if (stats.isError || stats.data.stale) return "stale";
  return "live";
}

/** The network mark in the header: the logo plus a green "live · block N" once the chain has been read. */
function LiveChain() {
  const stats = useHomeStats();
  const tone = liveTone(stats);
  return (
    <Link to="/status" className="hidden items-center gap-2.5 md:inline-flex" title={tone === "live" ? "Robinhood Chain · live" : tone === "stale" ? "Robinhood Chain · reconnecting, last read shown" : "Reading Robinhood Chain"}>
      <span className={cn("size-[6px] rounded-full", tone === "live" ? "bg-emerald" : tone === "stale" ? "bg-amber" : "bg-grey-green/50")} />
      <ChainLogo height={16} />
      {stats.data?.blockNumber ? (
        <span className={cn("font-mono hidden text-[11.5px] xl:inline", tone === "live" ? "text-emerald" : "text-amber")}>
          {tone === "live" ? "live" : "reconnecting"} · {Number(stats.data.blockNumber).toLocaleString("en-US")}
        </span>
      ) : null}
    </Link>
  );
}

function Footer() {
  const stats = useHomeStats();
  return (
    <footer className="no-print mt-28 border-t border-line">
      <div className="gutter mx-auto max-w-[1600px] py-10">
        <div className="grid gap-10 md:grid-cols-[1.2fr_1fr_1fr]">
          <div>
            <Wordmark />
            <p className="mt-3 max-w-[38ch] text-[14px] leading-relaxed text-ink-2">The record layer for Robinhood Stock Tokens: share-equivalents, holder intent, redemption readiness.</p>
          </div>
          <nav className="grid grid-cols-2 gap-x-8 gap-y-2 text-[14px]">
            {[...NAV, ...MORE].map((item) => (
              <Link key={item.href} to={item.href} className="text-grey-green hover:text-ink">
                {item.label}
              </Link>
            ))}
            <button type="button" onClick={startGuide} className="text-left text-grey-green hover:text-ink">
              Walkthrough
            </button>
          </nav>
          <div className="text-[12.5px] text-grey-green">
            <div className="eyebrow mb-2">Network</div>
            <div className="flex items-center gap-2.5">
              <span className={cn("size-[6px] rounded-full", liveTone(stats) === "live" ? "bg-emerald" : liveTone(stats) === "stale" ? "bg-amber" : "bg-grey-green/50")} />
              <ChainLogo height={18} />
            </div>
            <div className={cn("font-mono mt-2 text-[12.5px]", liveTone(stats) === "live" ? "text-emerald" : liveTone(stats) === "stale" ? "text-amber" : "text-grey-green")}>
              {stats.data?.blockNumber ? `${liveTone(stats) === "live" ? "live" : "reconnecting"} · block ${Number(stats.data.blockNumber).toLocaleString("en-US")}` : stats.isError ? "reconnecting to Robinhood Chain" : "reading"}
              {stats.dataUpdatedAt ? ` · ${ageLabel(Date.now() - stats.dataUpdatedAt)}` : ""}
            </div>
            <Link to="/status" className="mt-2 inline-block text-[12.5px] text-grey-green hover:text-ink">
              Status page
            </Link>
          </div>
        </div>
        <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-5">
          <PostRef />
          <TokenCA full />
        </div>
        <p className="mt-4 max-w-[90ch] text-[12.5px] leading-relaxed text-grey-green">
          Redeem is independent and is not affiliated with or endorsed by Robinhood. Stock Tokens provide economic exposure and are not legal shares today;
          voting and in-kind redemption for token holders are on the issuer's roadmap. A recorded intent is not a shareholder vote. Not investment, legal or tax advice.
        </p>
        <p className="mt-3 max-w-[90ch] text-[12px] leading-relaxed text-grey-green">
          Photographs via Wikimedia Commons:{" "}
          {PHOTO_LIST.map((photo, index) => (
            <span key={photo.src}>
              <a href={photo.href} target="_blank" rel="noreferrer" className="hover:text-ink hover:underline">
                {photo.caption}
              </a>{" "}
              by {photo.author} ({photo.licence}){index < PHOTO_LIST.length - 1 ? "; " : "."}
            </span>
          ))}
        </p>
      </div>
    </footer>
  );
}

/** Page container: the 1600px sheet with fluid gutters. */
export function Page({ children, className, narrow = false }: { children: React.ReactNode; className?: string; narrow?: boolean }) {
  return <div className={cn("gutter mx-auto w-full", narrow ? "max-w-[1100px]" : "max-w-[1600px]", className)}>{children}</div>;
}

/** Editorial page head: eyebrow, serif display, one measure of copy, optional statement on the right. */
export function PageHead({ eyebrow, title, body, aside, className, size = "lg" }: { eyebrow?: React.ReactNode; title: React.ReactNode; body?: React.ReactNode; aside?: React.ReactNode; className?: string; size?: "lg" | "xl" }) {
  return (
    <div className={cn("rise flex flex-col justify-between gap-8 pt-12 pb-10 lg:flex-row lg:items-end", className)}>
      <div className="max-w-[760px]">
        {eyebrow ? <div className="eyebrow mb-4">{eyebrow}</div> : null}
        <h1 className={cn("display text-ink", size === "xl" ? "text-[44px] sm:text-[60px] lg:text-[76px]" : "text-[38px] sm:text-[48px] lg:text-[60px]")}>{title}</h1>
        {body ? <p className="mt-5 max-w-[60ch] text-[16px] leading-relaxed text-ink-2">{body}</p> : null}
      </div>
      {aside ? <div className="shrink-0">{aside}</div> : null}
    </div>
  );
}

export function SectionHead({ eyebrow, title, body, aside, className, dark = false }: { eyebrow?: React.ReactNode; title: React.ReactNode; body?: React.ReactNode; aside?: React.ReactNode; className?: string; dark?: boolean }) {
  return (
    <div className={cn("flex flex-col justify-between gap-6 md:flex-row md:items-end", className)}>
      <div className="max-w-[720px]">
        {eyebrow ? <div className="eyebrow mb-3">{eyebrow}</div> : null}
        <h2 className={cn("display text-[32px] sm:text-[40px] lg:text-[48px]", dark ? "text-[#e9ede7]" : "text-ink")}>{title}</h2>
        {body ? <p className={cn("mt-4 max-w-[60ch] text-[15.5px] leading-relaxed", dark ? "text-[#b5c4ba]" : "text-ink-2")}>{body}</p> : null}
      </div>
      {aside}
    </div>
  );
}
