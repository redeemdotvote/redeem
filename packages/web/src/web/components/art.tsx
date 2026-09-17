import { cn } from "@/lib/utils";

/** Generated Redeem artwork, served from /redeem/art. Composed into the page, never boxed. */
export function Artwork({ name, className, alt = "", themed = false }: { name: string; className?: string; alt?: string; themed?: boolean }) {
  const eager = name.startsWith("hero") ? "eager" : "lazy";
  if (!themed) return <img src={`/redeem/art/${name}.jpg`} alt={alt} aria-hidden={alt === "" ? true : undefined} className={cn("block", className)} loading={eager} />;
  // A themed plate exists twice — lit on ivory and lit on charcoal — and both are in the markup so
  // the swap happens in CSS at the same instant the palette does.
  return (
    <>
      <img src={`/redeem/art/${name}.jpg`} alt={alt} aria-hidden={alt === "" ? true : undefined} className={cn("block dark:hidden", className)} loading={eager} />
      <img src={`/redeem/art/${name}-dark.jpg`} alt={alt} aria-hidden={alt === "" ? true : undefined} className={cn("hidden dark:block", className)} loading={eager} />
    </>
  );
}

/**
 * A ledger marker laid over artwork: a hairline leader from a point on the object to a small
 * engraved label and mono value. Positions are percentages of the artwork box.
 */
export function Annotation({ x, y, label, value, side = "right", className, dark = false }: { x: number; y: number; label: string; value: React.ReactNode; side?: "left" | "right"; className?: string; dark?: boolean }) {
  const line = dark ? "bg-[#8fb3a0]" : "bg-ink/50";
  const text = dark ? "text-[#e9ede7]" : "text-ink";
  const lab = dark ? "text-[#8fb3a0]" : "text-grey-green";
  return (
    <div className={cn("pointer-events-none absolute", className)} style={{ left: `${x}%`, top: `${y}%` }}>
      <span className={cn("absolute top-0 left-0 size-[6px] -translate-x-1/2 -translate-y-1/2 rounded-full", dark ? "bg-[#8fb3a0]" : "bg-ink")} />
      <span className={cn("absolute top-0 h-px w-10", line, side === "right" ? "left-0" : "right-0")} />
      <div className={cn("absolute -top-3", side === "right" ? "left-12 text-left" : "right-12 text-right")}>
        <div className={cn("text-[10px] font-medium tracking-[0.14em] uppercase whitespace-nowrap", lab)}>{label}</div>
        <div className={cn("font-mono text-[12.5px] whitespace-nowrap", text)}>{value}</div>
      </div>
    </div>
  );
}
