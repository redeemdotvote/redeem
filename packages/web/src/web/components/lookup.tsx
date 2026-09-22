import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { isAddress } from "viem";
import { cn } from "@/lib/utils";
import { useWallet } from "../hooks/use-wallet";
import { Button } from "./ui";

/** The one input: paste any Robinhood Chain address, or connect, and see the record for it. */
export function Lookup({ className, size = "lg" }: { className?: string; size?: "md" | "lg" }) {
  const [, navigate] = useLocation();
  const wallet = useWallet();
  const [value, setValue] = useState("");
  const ok = isAddress(value.trim());
  const go = () => ok && navigate(`/w/${value.trim()}`);
  return (
    <form
      className={cn("flex w-full max-w-[640px] flex-col gap-2 sm:flex-row", className)}
      onSubmit={(event) => {
        event.preventDefault();
        go();
      }}
    >
      <label className="relative flex-1">
        <span className="sr-only">Wallet address</span>
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Paste any wallet address · 0x…"
          spellCheck={false}
          autoComplete="off"
          className={cn("font-mono w-full rounded-[12px] border border-line-2 bg-cream text-ink outline-none placeholder:font-sans placeholder:text-grey-green focus:border-ink", size === "lg" ? "h-12 px-4 text-[14px]" : "h-10 px-3.5 text-[13px]")}
        />
      </label>
      <div className="flex gap-2">
        <Button type="submit" size={size} disabled={!ok} className="flex-1 sm:flex-none">
          See the record <ArrowRight className="size-4" />
        </Button>
        <Button type="button" size={size} variant="outline" onClick={() => (wallet.address ? navigate("/portfolio") : wallet.connect())}>
          {wallet.address ? "Mine" : "Connect"}
        </Button>
      </div>
    </form>
  );
}
