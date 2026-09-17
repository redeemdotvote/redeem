import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The official Robinhood Chain logo, used exactly as provided by the Robinhood Chain brand kit:
 * black on light surfaces, white on dark, never recoloured, cropped or combined into a lockup.
 * Redeem is independent and not affiliated with or endorsed by Robinhood; the mark names the
 * network the record is read from.
 */
export function ChainLogo({ className, height = 18, dark }: { className?: string; height?: number; dark?: boolean }) {
  if (dark === true) return <img src="/assets/logos/robinhood-chain-white.svg" alt="Robinhood Chain" style={{ height }} className={cn("block w-auto", className)} />;
  if (dark === false) return <img src="/assets/logos/robinhood-chain-black.svg" alt="Robinhood Chain" style={{ height }} className={cn("block w-auto", className)} />;
  return (
    <>
      <img src="/assets/logos/robinhood-chain-black.svg" alt="Robinhood Chain" style={{ height }} className={cn("block w-auto dark:hidden", className)} />
      <img src="/assets/logos/robinhood-chain-white.svg" alt="Robinhood Chain" style={{ height }} className={cn("hidden w-auto dark:block", className)} />
    </>
  );
}

/** The feather symbol, for compact spots only (status indicators, favicon-scale marks). */
export function ChainFeather({ className, size = 14, dark }: { className?: string; size?: number; dark?: boolean }) {
  const style = { height: size, width: "auto" as const };
  if (dark === true) return <img src="/assets/logos/robinhood-feather-light.svg" alt="" aria-hidden style={style} className={cn("block", className)} />;
  if (dark === false) return <img src="/assets/logos/robinhood-feather-dark.svg" alt="" aria-hidden style={style} className={cn("block", className)} />;
  return (
    <>
      <img src="/assets/logos/robinhood-feather-dark.svg" alt="" aria-hidden style={style} className={cn("block dark:hidden", className)} />
      <img src="/assets/logos/robinhood-feather-light.svg" alt="" aria-hidden style={style} className={cn("hidden dark:block", className)} />
    </>
  );
}

/** A quiet "read from" line: status dot, the logo, optional caption. */
export function ChainLine({ caption = "Read from", className, dark, height = 16 }: { caption?: string | null; className?: string; dark?: boolean; height?: number }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span className="size-[6px] rounded-full bg-emerald" />
      {caption ? <span className={cn("text-[13px]", dark ? "text-[#b5c4ba]" : "text-ink-2")}>{caption}</span> : null}
      <ChainLogo height={height} dark={dark} />
    </span>
  );
}

export const TENEV_POST = {
  url: "https://x.com/vladtenev/status/2099546848558305423",
  text: "In-kind redemption and voting are coming for Robinhood Stock Tokens",
  author: "Vlad Tenev",
  role: "Co-founder and CEO, Robinhood",
  date: "September 14, 2026",
  handle: "@vladtenev",
};

/** One-line reference to the post that Redeem is built for. */
export function PostRef({ className, dark }: { className?: string; dark?: boolean }) {
  return (
    <a href={TENEV_POST.url} target="_blank" rel="noreferrer" className={cn("group inline-flex max-w-full flex-wrap items-baseline gap-x-2 gap-y-1 text-[13.5px]", dark ? "text-[#b5c4ba] hover:text-[#e9ede7]" : "text-ink-2 hover:text-ink", className)}>
      <span className={cn("font-serif text-[15px] italic", dark ? "text-[#8fd3b0]" : "text-emerald")}>“{TENEV_POST.text}”</span>
      <span className="text-grey-green">
        {TENEV_POST.author} · {TENEV_POST.date}
      </span>
      <ArrowUpRight className="size-3.5 shrink-0 text-grey-green transition-transform group-hover:translate-x-px group-hover:-translate-y-px" />
    </a>
  );
}
