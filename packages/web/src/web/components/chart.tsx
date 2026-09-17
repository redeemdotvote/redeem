import { useId } from "react";
import { cn } from "@/lib/utils";

interface Point {
  t: number;
  v: number;
}

/**
 * A stepped multiplier line: flat until a UIMultiplierUpdated event, then a vertical move.
 * Thin ink line, soft mint fill, engraved axis marks. Nothing is smoothed — a multiplier does
 * not drift, it steps.
 */
export function MultiplierChart({ actions, current, currentAt, className, height = 160 }: { actions: Array<{ effectiveAt: number; oldMultiplier: string; newMultiplier: string }>; current: number; currentAt: number; className?: string; height?: number }) {
  const id = useId();
  const sorted = [...actions].sort((a, b) => a.effectiveAt - b.effectiveAt);
  const points: Point[] = [];
  const now = currentAt;
  const first = sorted[0];
  const start = first ? Math.min(first.effectiveAt - 86_400 * 30, now - 86_400 * 90) : now - 86_400 * 90;
  points.push({ t: start, v: first ? Number(BigInt(first.oldMultiplier)) / 1e18 : current });
  for (const action of sorted) {
    points.push({ t: action.effectiveAt, v: Number(BigInt(action.oldMultiplier)) / 1e18 });
    points.push({ t: action.effectiveAt, v: Number(BigInt(action.newMultiplier)) / 1e18 });
  }
  points.push({ t: now, v: current });

  const W = 640;
  const H = height;
  const padX = 8;
  const padY = 18;
  const minV = Math.min(...points.map((p) => p.v));
  const maxV = Math.max(...points.map((p) => p.v));
  const spread = maxV - minV || Math.max(maxV * 0.002, 0.0001);
  const lo = minV - spread * 0.35;
  const hi = maxV + spread * 0.35;
  const x = (t: number) => padX + ((t - start) / Math.max(1, now - start)) * (W - padX * 2);
  const y = (v: number) => padY + (1 - (v - lo) / (hi - lo)) * (H - padY * 2);
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`).join(" ");
  const area = `${path} L${x(now).toFixed(1)} ${H - padY} L${x(start).toFixed(1)} ${H - padY} Z`;
  const ticks = [lo + (hi - lo) * 0.2, lo + (hi - lo) * 0.5, lo + (hi - lo) * 0.8];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={cn("w-full", className)} preserveAspectRatio="none" role="img" aria-label="Multiplier history">
      <defs>
        <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--emerald)" stopOpacity="0.16" />
          <stop offset="100%" stopColor="var(--emerald)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {ticks.map((tick) => (
        <g key={tick}>
          <line x1={padX} x2={W - padX} y1={y(tick)} y2={y(tick)} stroke="var(--line)" strokeWidth="1" />
          <text x={W - padX} y={y(tick) - 4} textAnchor="end" fontSize="9" fill="var(--grey-green)" fontFamily="Geist Mono, monospace">
            {tick.toFixed(6)}×
          </text>
        </g>
      ))}
      <path d={area} fill={`url(#${id}-fill)`} />
      <path d={path} fill="none" stroke="var(--ink)" strokeWidth="1.25" vectorEffect="non-scaling-stroke" className="draw" />
      {sorted.map((action) => (
        <circle key={action.effectiveAt} cx={x(action.effectiveAt)} cy={y(Number(BigInt(action.newMultiplier)) / 1e18)} r="3" fill="var(--paper)" stroke="var(--emerald)" strokeWidth="1.5" />
      ))}
      <circle cx={x(now)} cy={y(current)} r="3" fill="var(--emerald)" />
    </svg>
  );
}

/** A thin sparkline for ledger hover states. */
export function Sparkline({ values, className, width = 96, height = 24 }: { values: number[]; className?: string; width?: number; height?: number }) {
  if (values.length < 2) return <svg width={width} height={height} className={className} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = width / (values.length - 1);
  const d = values.map((v, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)} ${(height - 2 - ((v - min) / range) * (height - 4)).toFixed(1)}`).join(" ");
  return (
    <svg width={width} height={height} className={className} aria-hidden>
      <path d={d} fill="none" stroke="var(--emerald)" strokeWidth="1.25" />
    </svg>
  );
}

/** Ownership by path back to a holder: a single divided rule, indexed segments filled, the rest hatched. */
export function OwnershipRule({ segments, className }: { segments: Array<{ key: string; label: string; shareEquivalent: number | null; indexed: boolean }>; className?: string }) {
  const id = useId();
  const total = segments.reduce((sum, seg) => sum + (seg.shareEquivalent ?? 0), 0);
  return (
    <div className={cn("min-w-0", className)}>
      <svg viewBox="0 0 640 10" className="h-[10px] w-full" preserveAspectRatio="none" aria-hidden>
        <defs>
          <pattern id={`${id}-hatch`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--line-2)" strokeWidth="2" />
          </pattern>
        </defs>
        {(() => {
          let cursor = 0;
          return segments.map((seg) => {
            const width = seg.indexed && total > 0 ? ((seg.shareEquivalent ?? 0) / total) * 560 : 20;
            const el = <rect key={seg.key} x={cursor} y="0" width={Math.max(width - 2, 0)} height="10" fill={seg.indexed ? "var(--emerald)" : `url(#${id}-hatch)`} />;
            cursor += width;
            return el;
          });
        })()}
      </svg>
      <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
        {segments.map((seg) => (
          <div key={seg.key}>
            <div className="flex items-center gap-1.5">
              <span className={cn("inline-block size-[6px]", seg.indexed ? "bg-emerald" : "border border-line-2")} />
              <span className="eyebrow whitespace-nowrap">{seg.label}</span>
            </div>
            <div className={cn("font-mono mt-1 text-[13px]", seg.indexed ? "text-ink" : "text-grey-green")}>{seg.indexed ? `${(seg.shareEquivalent ?? 0).toLocaleString("en-US", { maximumFractionDigits: 2 })} sh-eq` : "Not indexed yet"}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
