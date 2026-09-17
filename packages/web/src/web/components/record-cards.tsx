import { motion } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * Records in a tray, drawn: an emerald-glass tray on the site's own paper, holding ivory record
 * cards that lean forward. Labels are real tickers (or queue places). Vector, so it matches the
 * section it sits in, in both themes, and the cards settle into place when they enter view.
 */
export function RecordCards({ labels = ["NVDA", "AAPL", "MSFT", "GOOGL", "SPY"], className, front }: { labels?: string[]; className?: string; front?: "intent" | "queue" | "record" }) {
  const cards = labels.slice(0, 5).reverse();
  return (
    <svg viewBox="0 0 640 480" className={cn("w-full", className)} role="img" aria-label="Record cards standing in a tray">
      <defs>
        <linearGradient id="rc-glass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3d9a6f" stopOpacity="0.55" />
          <stop offset="1" stopColor="#1c6b4a" stopOpacity="0.75" />
        </linearGradient>
      </defs>
      <ellipse cx="320" cy="430" rx="230" ry="24" fill="var(--ink)" opacity="0.08" />
      {/* tray back and floor */}
      <path d="M120 330 L320 230 L520 330 L320 430 Z" fill="var(--mint)" />
      <path d="M120 330 L320 430 L320 462 L120 362 Z" fill="url(#rc-glass)" />
      <path d="M320 430 L520 330 L520 362 L320 462 Z" fill="#1c6b4a" opacity="0.85" />
      {/* cards, back to front */}
      {cards.map((label, i) => {
        const n = cards.length - 1 - i; // 0 = back
        const shift = i * 28;
        const x = 250 - shift * 0.55;
        const y = 150 + shift * 0.9;
        const isFront = i === cards.length - 1;
        return (
          <motion.g key={label} initial={{ y: 18, opacity: 0 }} whileInView={{ y: 0, opacity: 1 }} viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.9, delay: 0.12 * n, ease: [0.22, 1, 0.36, 1] }}>
            {/* card: parallelogram standing in the tray, leaning forward */}
            <path d={`M${x} ${y} L${x + 210} ${y - 105} L${x + 210} ${y + 45} L${x} ${y + 150} Z`} fill="var(--cream)" stroke="var(--line-2)" strokeWidth="1" />
            <text transform={`translate(${x + 22} ${y + 26}) skewY(-26.57)`} fontFamily="Geist Mono, monospace" fontSize="13" fill="var(--ink)">
              {label}
            </text>
            {isFront ? (
              <g transform={`translate(${x + 22} ${y + 52}) skewY(-26.57)`}>
                {front === "queue" ? (
                  <>
                    <text y="0" fontFamily="Geist, sans-serif" fontSize="9" letterSpacing="1" fill="var(--grey-green)">
                      READINESS
                    </text>
                    <rect x="0" y="10" width="150" height="3" fill="var(--line-2)" />
                    <rect x="0" y="10" width="112" height="3" fill="var(--emerald)" />
                    <text y="30" fontFamily="Geist Mono, monospace" fontSize="9" fill="var(--ink)">
                      pack complete
                    </text>
                  </>
                ) : front === "intent" ? (
                  <>
                    {[
                      ["FOR", 120],
                      ["AGAINST", 34],
                      ["ABSTAIN", 12],
                    ].map(([name, w], k) => (
                      <g key={name as string} transform={`translate(0 ${k * 22})`}>
                        <text y="0" fontFamily="Geist, sans-serif" fontSize="8.5" letterSpacing="1" fill="var(--grey-green)">
                          {name}
                        </text>
                        <rect x="0" y="6" width="150" height="3" fill="var(--line-2)" />
                        <rect x="0" y="6" width={w as number} height="3" fill={k === 0 ? "var(--emerald)" : k === 1 ? "var(--rust)" : "var(--grey-green)"} />
                      </g>
                    ))}
                  </>
                ) : (
                  <>
                    {[0, 1, 2, 3].map((k) => (
                      <rect key={k} x="0" y={k * 14} width={k === 3 ? 90 : 150} height="2" fill="var(--line-2)" />
                    ))}
                  </>
                )}
              </g>
            ) : null}
            {isFront ? <circle cx={x + 170} cy={y + 96} r="14" fill="none" stroke="var(--line-2)" strokeWidth="1" transform={`skewY(-26.57) translate(0 ${(x + 170) * 0.5})`} /> : null}
          </motion.g>
        );
      })}
      {/* tray front lip */}
      <path d="M120 362 L320 462 L520 362" fill="none" stroke="#1c6b4a" strokeOpacity="0.5" strokeWidth="1.5" />
    </svg>
  );
}
