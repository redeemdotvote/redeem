import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { useHomeStats } from "../queries/stats";

/**
 * The founding hundred, in one line. Every number is the real count of wallets that have signed;
 * the line only changes what is said about it: how many founding numbers are left.
 */
export function FoundingLine({ className, dark }: { className?: string; dark?: boolean }) {
  const stats = useHomeStats();
  const founding = stats.data?.founding;
  if (!founding) return null;
  const recorded = stats.data?.recordedWallets ?? 0;
  const open = founding.remaining > 0;
  return (
    <Link to="/genesis" className={cn("group inline-flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13.5px]", dark ? "text-[#b5c4ba]" : "text-ink-2", className)}>
      <span className={cn("size-[6px]", open ? "bg-emerald" : "bg-grey-green/60")} />
      {open ? (
        <>
          <span className={cn("font-medium", dark ? "text-[#e9ede7]" : "text-ink")}>{recorded === 0 ? "Founding wallet #1 is open." : `Wallet #${recorded} is on file.`}</span>
          <span>
            <span className="font-mono">{founding.remaining}</span> of {founding.limit} founding record numbers left.
          </span>
        </>
      ) : (
        <span>
          The founding {founding.limit} are on file. <span className="font-mono">{recorded.toLocaleString("en-US")}</span> wallets recorded.
        </span>
      )}
      <span className="text-emerald group-hover:underline">Genesis →</span>
    </Link>
  );
}
