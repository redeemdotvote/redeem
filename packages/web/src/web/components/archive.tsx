import { motion } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * The securities archive, drawn: a brushed-aluminium frame, frosted emerald glass, five ivory
 * record folders on glass shelves, each with a metal index tab. Vector, in the site's palette, so
 * it sits on paper or charcoal without an edge. Tab positions are exported for the index leaders.
 */
export const ARCHIVE_TABS = [0, 1, 2, 3, 4].map((i) => (150 + i * 66 + 10) / 560); // fraction of height
export const ARCHIVE_FRONT_X = 250 / 640; // fraction of width where the front face begins

export function ArchiveIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 640 560" className={cn("w-full", className)} role="img" aria-label="A securities archive holding five indexed record folders">
      <defs>
        <linearGradient id="ar-alu" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#e9ebe6" />
          <stop offset="0.5" stopColor="#c3c8c1" />
          <stop offset="1" stopColor="#dfe2dc" />
        </linearGradient>
        <linearGradient id="ar-alu-v" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#eef0eb" />
          <stop offset="1" stopColor="#b8bdb6" />
        </linearGradient>
        <linearGradient id="ar-glass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#bfe0cf" stopOpacity="0.55" />
          <stop offset="1" stopColor="#6fa88a" stopOpacity="0.7" />
        </linearGradient>
        <linearGradient id="ar-side" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#a9cfb9" stopOpacity="0.8" />
          <stop offset="1" stopColor="#5c9478" stopOpacity="0.9" />
        </linearGradient>
        <linearGradient id="ar-front" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.28" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.06" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0.2" />
        </linearGradient>
        <linearGradient id="ar-folder" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f3eedd" />
          <stop offset="1" stopColor="#e4dcc4" />
        </linearGradient>
      </defs>
      <ellipse cx="380" cy="528" rx="200" ry="18" fill="#000" opacity="0.14" />
      {/* top face */}
      <path d="M250 120 L320 78 L540 78 L470 120 Z" fill="url(#ar-alu)" />
      {/* right face */}
      <path d="M470 120 L540 78 L540 462 L470 504 Z" fill="url(#ar-side)" />
      <path d="M470 120 L540 78 L540 462 L470 504 Z" fill="none" stroke="#c9cfc7" strokeWidth="6" strokeLinejoin="round" />
      {/* cavity */}
      <rect x="250" y="120" width="220" height="384" fill="url(#ar-glass)" />
      {/* shelves and folders, back to front */}
      {[0, 1, 2, 3, 4].map((i) => {
        const y = 150 + i * 66;
        return (
          <motion.g key={i} initial={{ x: -6, opacity: 0 }} whileInView={{ x: 0, opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.8, delay: 0.1 + i * 0.08, ease: [0.22, 1, 0.36, 1] }}>
            <rect x="256" y={y + 56} width="208" height="3" fill="#dff0e6" opacity="0.9" />
            <path d={`M268 ${y + 14} L442 ${y + 4} L446 ${y + 56} L272 ${y + 56} Z`} fill="url(#ar-folder)" />
            <path d={`M268 ${y + 14} L442 ${y + 4}`} stroke="#fff" strokeOpacity="0.7" strokeWidth="1" />
            <rect x="338" y={y + 2} width="44" height="14" rx="3" fill="url(#ar-alu-v)" stroke="#a9aea8" strokeWidth="0.75" />
          </motion.g>
        );
      })}
      {/* front glass */}
      <rect x="250" y="120" width="220" height="384" fill="url(#ar-front)" />
      {/* frame */}
      <rect x="250" y="120" width="220" height="384" fill="none" stroke="url(#ar-alu)" strokeWidth="10" strokeLinejoin="round" />
      <path d="M250 120 L320 78 L540 78 L470 120" fill="none" stroke="#c9cfc7" strokeWidth="6" strokeLinejoin="round" />
      <circle cx="262" cy="130" r="2.5" fill="#9aa09a" />
      <circle cx="458" cy="130" r="2.5" fill="#9aa09a" />
      <circle cx="262" cy="494" r="2.5" fill="#9aa09a" />
      <circle cx="458" cy="494" r="2.5" fill="#9aa09a" />
    </svg>
  );
}
