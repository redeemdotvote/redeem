import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Beneficial ownership, drawn: one Stock Token position resolving through a vault to its holders,
 * pro rata. Quantities are a worked illustration and say so — vault adapters are not indexed yet.
 */
const HOLDERS = [
  { id: "h1", label: "Wallet 1", pct: "12.81%", shareEq: "12.81" },
  { id: "h2", label: "Wallet 2", pct: "61.40%", shareEq: "61.40" },
  { id: "h3", label: "Wallet 3", pct: "25.79%", shareEq: "25.79" },
];
const W = 640;
const H = 220;
const NODE_W = 150;
const NODE_H = 46;

function Node({ x, y, title, sub, tone, dim }: { x: number; y: number; title: string; sub: string; tone: "token" | "vault" | "holder"; dim: boolean }) {
  const fill = tone === "token" ? "#1c6b4a" : tone === "vault" ? "#132a20" : "#0f1a15";
  return (
    <g transform={`translate(${x} ${y})`} opacity={dim ? 0.35 : 1} className="transition-opacity duration-300">
      <rect width={NODE_W} height={NODE_H} rx="5" fill={fill} stroke={tone === "token" ? "#5fbd8f" : "#2e4a3c"} />
      <text x="12" y="19" fontSize="11" fontFamily="Geist, sans-serif" fontWeight="500" fill="#e9ede7">
        {title}
      </text>
      <text x="12" y="35" fontSize="10.5" fontFamily="Geist Mono, monospace" fill="#8fb3a0">
        {sub}
      </text>
    </g>
  );
}

export function OwnershipDiagram({ className }: { className?: string }) {
  const [active, setActive] = useState<string | null>(null);
  const tokenX = 0;
  const vaultX = 245;
  const holderX = 490;
  const midY = H / 2 - NODE_H / 2;
  const holderYs = [8, midY, H - NODE_H - 8];
  const hit = HOLDERS.find((h) => h.id === active);
  return (
    <div className={cn("min-w-0", className)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="A Stock Token position resolving through a vault to its holders">
        <path d={`M${tokenX + NODE_W} ${midY + NODE_H / 2} H ${vaultX}`} stroke="#8fd3b0" strokeWidth="1.25" fill="none" />
        {HOLDERS.map((holder, index) => {
          const y1 = midY + NODE_H / 2;
          const y2 = holderYs[index]! + NODE_H / 2;
          const x1 = vaultX + NODE_W;
          const mx = (x1 + holderX) / 2;
          const on = active === null || active === holder.id;
          return (
            <path key={holder.id} d={`M${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${holderX} ${y2}`} stroke={on ? "#8fd3b0" : "#2b3d33"} strokeWidth={active === holder.id ? 2 : 1.25} fill="none" className="cursor-pointer transition-[stroke] duration-300" onMouseEnter={() => setActive(holder.id)} onMouseLeave={() => setActive(null)} />
          );
        })}
        <Node x={tokenX} y={midY} title="NVDA STOCK TOKEN" sub="100.00 sh-eq" tone="token" dim={false} />
        <Node x={vaultX} y={midY} title="VAULT" sub="holds 100.00 sh-eq" tone="vault" dim={false} />
        {HOLDERS.map((holder, index) => (
          <g key={holder.id} onMouseEnter={() => setActive(holder.id)} onMouseLeave={() => setActive(null)} className="cursor-pointer">
            <Node x={holderX} y={holderYs[index]!} title={holder.label.toUpperCase()} sub={`${holder.pct} · ${holder.shareEq} sh-eq`} tone="holder" dim={active !== null && active !== holder.id} />
          </g>
        ))}
      </svg>
      <div className="mt-5 flex flex-wrap items-baseline justify-between gap-3 border-t border-[#1f2c25] pt-3">
        <div className="font-mono min-h-[20px] text-[13.5px] text-[#cfe0d5]">{hit ? `NVDA → Vault → ${hit.label} → ${hit.shareEq} share-eq` : "Hover a holder to trace the claim"}</div>
        <div className="text-[12px] text-[#7f998c]">Illustrative · vault adapters not indexed yet</div>
      </div>
    </div>
  );
}
