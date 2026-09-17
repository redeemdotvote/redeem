import { useState } from "react";
import { cn } from "../lib/utils";

/** The Redeem mark: three record leaves, deep emerald to pale sage. Supplied by the brand owner; reproduced as vector. */
export function Mark({ className }: { className?: string }) {
  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      <svg viewBox="0 0 100 100" fill="none" className="size-full" aria-hidden>
        <defs>
          <linearGradient id="rm-a" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#e3e8d8" />
            <stop offset="1" stopColor="#9db89f" />
          </linearGradient>
          <linearGradient id="rm-b" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#8fb39a" />
            <stop offset="1" stopColor="#4f8266" />
          </linearGradient>
          <linearGradient id="rm-c" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#1e6c4b" />
            <stop offset="1" stopColor="#0d3324" />
          </linearGradient>
        </defs>
        <g className="stroke-paper" strokeWidth="3" strokeLinejoin="round" paintOrder="stroke">
          <path d="M50 20q0-6 6-3l24 12q2 1 2 4v50L50 66Z" fill="url(#rm-a)" />
          <path d="M35 30q0-6 6-3l25 13q2 1 2 4v42L35 71Z" fill="url(#rm-b)" />
          <path d="M20 40q0-6 6-3l30 16q2 1 2 4v13l20 12q3 2 3 5t-4 5H40q-20 0-20-20Z" fill="url(#rm-c)" />
        </g>
      </svg>
    </span>
  );
}

export function Wordmark({ size = "md", className }: { size?: "sm" | "md" | "lg"; className?: string }) {
  const marks = { sm: "size-6", md: "size-7", lg: "size-9" };
  const words = { sm: "text-[17px]", md: "text-[20px]", lg: "text-[28px]" };
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <Mark className={marks[size]} />
      <span className={cn("font-serif font-medium tracking-[-0.01em] text-ink", words[size])}>Redeem</span>
    </span>
  );
}

const LOGO_FILES: Record<string, string> = { chainlink: "chainlink", robinhood: "robinhood", ethereum: "ethereum" };

export function BrandLogo({ name, className }: { name: string; className?: string }) {
  const file = LOGO_FILES[name];
  if (!file) return null;
  return (
    <span
      aria-hidden
      className={cn("inline-block shrink-0 bg-current", className)}
      style={{ maskImage: `url(/assets/logos/${file}.svg)`, WebkitMaskImage: `url(/assets/logos/${file}.svg)`, maskSize: "contain", WebkitMaskSize: "contain", maskRepeat: "no-repeat", WebkitMaskRepeat: "no-repeat", maskPosition: "center", WebkitMaskPosition: "center" }}
    />
  );
}

/** An asset's logo on a white disc, ticker fallback when none is on file. */
export function AssetLogo({ symbol, logo, size = "md", className }: { symbol: string; logo?: string | null; size?: "xs" | "sm" | "md" | "lg" | "xl"; className?: string }) {
  const [failed, setFailed] = useState(false);
  const tiles = { xs: "size-5 p-[3px]", sm: "size-7 p-[5px]", md: "size-9 p-[7px]", lg: "size-14 p-2.5", xl: "size-20 p-4" };
  const text = { xs: "text-[7px]", sm: "text-[8px]", md: "text-[9px]", lg: "text-[11px]", xl: "text-[14px]" };
  const show = logo && !failed;
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-white", tiles[size], className)}>
      {show ? <img src={logo} alt="" width={64} height={64} decoding="async" onError={() => setFailed(true)} className="size-full object-contain" style={{ colorScheme: "light" }} /> : <span className={cn("font-mono font-medium text-[#131614]", text[size])}>{symbol.slice(0, 4)}</span>}
    </span>
  );
}
