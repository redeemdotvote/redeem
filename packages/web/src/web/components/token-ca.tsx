import { ArrowUpRight, Check, Copy } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { REDEEM_TOKEN, tokenExplorerUrl } from "../lib/token";
import { shortAddress } from "../lib/format";

/** The contract address, with copy and explorer. `full` prints all 42 characters; otherwise it is shortened on small screens. */
export function TokenCA({ className, dark, full = false, label = true }: { className?: string; dark?: boolean; full?: boolean; label?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard?.writeText(REDEEM_TOKEN.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  return (
    <span className={cn("inline-flex max-w-full items-center gap-2 rounded-[10px] border py-1 pr-1 pl-3", dark ? "border-[#24332b] bg-[#0f1713] text-[#e9ede7]" : "border-line bg-cream text-ink", className)}>
      {label ? <span className={cn("text-[10.5px] font-medium tracking-[0.12em] uppercase", dark ? "text-[#8fb3a0]" : "text-grey-green")}>$REDEEM · CA</span> : null}
      <button type="button" onClick={copy} title="Copy contract address" className="font-mono min-w-0 truncate text-[12.5px] hover:underline">
        {full ? (
          <>
            <span className="hidden sm:inline">{REDEEM_TOKEN.address}</span>
            <span className="sm:hidden">{shortAddress(REDEEM_TOKEN.address, 6)}</span>
          </>
        ) : (
          shortAddress(REDEEM_TOKEN.address, 5)
        )}
      </button>
      <button type="button" onClick={copy} aria-label="Copy contract address" className={cn("grid size-7 shrink-0 place-items-center rounded-[8px]", dark ? "text-[#8fb3a0] hover:text-[#e9ede7]" : "text-grey-green hover:text-ink")}>
        {copied ? <Check className="size-3.5 text-emerald" /> : <Copy className="size-3.5" />}
      </button>
      <a href={tokenExplorerUrl} target="_blank" rel="noreferrer" aria-label="View on the Robinhood Chain explorer" className={cn("grid size-7 shrink-0 place-items-center rounded-[8px]", dark ? "text-[#8fb3a0] hover:text-[#e9ede7]" : "text-grey-green hover:text-ink")}>
        <ArrowUpRight className="size-3.5" />
      </a>
    </span>
  );
}
