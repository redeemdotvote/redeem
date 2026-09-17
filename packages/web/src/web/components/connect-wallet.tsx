import { LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWallet } from "../hooks/use-wallet";
import { shortAddress } from "../lib/format";
import { Button, Spinner } from "./ui";

export function ConnectWallet({ className, size = "sm" }: { className?: string; size?: "sm" | "md" | "lg" }) {
  const wallet = useWallet();
  if (wallet.isConnected && wallet.address) {
    return (
      <div className={cn("flex items-center gap-1.5", className)}>
        {wallet.wrongNetwork ? (
          <Button size="sm" variant="outline" onClick={wallet.switchToRobinhood} disabled={wallet.isSwitching} className="border-amber/50 text-amber">
            {wallet.isSwitching ? <Spinner className="size-3" /> : "Switch to Robinhood Chain"}
          </Button>
        ) : null}
        <span className="font-mono flex h-8 items-center gap-2 rounded-[8px] border border-line px-2.5 text-[12px] text-ink">
          <span className="size-[6px] bg-emerald" />
          {shortAddress(wallet.address)}
        </span>
        <button type="button" onClick={() => wallet.disconnect()} aria-label="Disconnect wallet" title="Disconnect" className="grid size-8 place-items-center rounded-[8px] text-grey-green hover:text-ink">
          <LogOut className="size-3.5" />
        </button>
      </div>
    );
  }
  return (
    <div className={cn("flex flex-col items-end gap-1", className)}>
      <Button size={size} onClick={wallet.connect} disabled={wallet.isConnecting}>
        {wallet.isConnecting ? <Spinner className="size-3.5" /> : null}
        Connect wallet
      </Button>
      {wallet.error ? <span className="max-w-[260px] text-right text-[10px] text-rust">{wallet.error}</span> : null}
    </div>
  );
}

/** Shown where a page needs an address before it can show anything personal. Public data stays visible around it. */
export function WalletGate({ title, body, className }: { title: string; body: string; className?: string }) {
  const wallet = useWallet();
  return (
    <div className={cn("surface-plain rounded-[16px] px-6 py-12 text-center sm:px-10", className)}>
      <div className="eyebrow">Personal record</div>
      <h3 className="font-serif mt-3 text-[28px] text-ink">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-[14.5px] leading-relaxed text-grey-green">{body}</p>
      <div className="mt-6 flex flex-col items-center gap-2">
        <Button size="lg" onClick={wallet.connect} disabled={wallet.isConnecting}>
          {wallet.isConnecting ? <Spinner className="size-3.5" /> : null} Connect wallet
        </Button>
        {wallet.error ? <p className="text-xs text-rust">{wallet.error}</p> : null}
      </div>
      <p className="mt-6 text-[12px] text-grey-green">Reads public balances and signs statements. Never a transaction, an approval or a transfer.</p>
    </div>
  );
}
