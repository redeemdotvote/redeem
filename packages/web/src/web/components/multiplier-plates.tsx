import { motion } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * The multiplier, drawn: three emerald plates over an engraved rule, one ivory record card on
 * top. The card never changes; the stack beneath it does. Vector, in the site's own palette, so it
 * belongs to the section it sits in and separates gently when it enters view.
 */
export function MultiplierPlates({ className }: { className?: string }) {
  const plate = (y: number, thick: number, key: string, fillTop: string, fillLeft: string, fillRight: string, delay: number, lift: number) => (
    <motion.g key={key} initial={{ y: 0 }} whileInView={{ y: -lift }} viewport={{ once: true, margin: "-60px" }} transition={{ duration: 1.2, delay, ease: [0.22, 1, 0.36, 1] }}>
      {/* left face */}
      <path d={`M120 ${y + 60} L320 ${y + 160} L320 ${y + 160 + thick} L120 ${y + 60 + thick} Z`} fill={fillLeft} />
      {/* right face */}
      <path d={`M320 ${y + 160} L520 ${y + 60} L520 ${y + 60 + thick} L320 ${y + 160 + thick} Z`} fill={fillRight} />
      {/* top face */}
      <path d={`M120 ${y + 60} L320 ${y - 40} L520 ${y + 60} L320 ${y + 160} Z`} fill={fillTop} />
      <path d={`M120 ${y + 60} L320 ${y - 40} L520 ${y + 60} L320 ${y + 160} Z`} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1" />
    </motion.g>
  );
  return (
    <svg viewBox="0 0 640 520" className={cn("w-full", className)} role="img" aria-label="Three multiplier plates under one unchanged record card">
      <defs>
        <linearGradient id="mp-top" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3d9a6f" stopOpacity="0.85" />
          <stop offset="1" stopColor="#1c6b4a" stopOpacity="0.85" />
        </linearGradient>
        <linearGradient id="mp-top-2" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2f8a60" stopOpacity="0.9" />
          <stop offset="1" stopColor="#155a3d" stopOpacity="0.9" />
        </linearGradient>
        <linearGradient id="mp-top-3" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#257a52" />
          <stop offset="1" stopColor="#0f4a32" />
        </linearGradient>
      </defs>
      {/* shadow */}
      <ellipse cx="320" cy="470" rx="230" ry="26" fill="var(--ink)" opacity="0.08" />
      {/* engraved rule base */}
      <g>
        <path d="M120 360 L320 460 L320 500 L120 400 Z" fill="var(--line-2)" />
        <path d="M320 460 L520 360 L520 400 L320 500 Z" fill="var(--mint-2)" />
        <path d="M120 360 L320 260 L520 360 L320 460 Z" fill="var(--mint)" />
        {Array.from({ length: 21 }).map((_, i) => {
          const t = i / 20;
          const x = 120 + t * 200;
          const y = 360 + t * 100;
          const long = i % 5 === 0;
          return <path key={i} d={`M${x} ${y + 4} L${x} ${y + (long ? 22 : 12)}`} stroke="var(--ink)" strokeOpacity={long ? 0.5 : 0.28} strokeWidth="1.2" />;
        })}
      </g>
      {plate(260, 34, "p3", "url(#mp-top-3)", "#0d3f2b", "#155a3d", 0.1, 0)}
      {plate(200, 26, "p2", "url(#mp-top-2)", "#13513a", "#1c6b4a", 0.2, 22)}
      {plate(150, 16, "p1", "url(#mp-top)", "#1b6346", "#27805a", 0.3, 44)}
      {/* record card, unchanged */}
      <motion.g initial={{ y: 0 }} whileInView={{ y: -44 }} viewport={{ once: true, margin: "-60px" }} transition={{ duration: 1.2, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}>
        <path d="M250 190 L320 155 L400 195 L330 230 Z" fill="var(--cream)" stroke="var(--line-2)" strokeWidth="1" />
        <path d="M268 194 L318 169 M278 200 L328 175 M288 206 L338 181" stroke="var(--line-2)" strokeWidth="1" />
      </motion.g>
    </svg>
  );
}
