import { formatUnits } from "viem";

/** Every number on screen is formatted here so the columns stay consistent. */

export function usd(value: number | null | undefined, options?: { compact?: boolean; digits?: number }): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  if (options?.compact) {
    const abs = Math.abs(value);
    if (abs >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
    if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
    if (abs >= 10_000) return `$${(value / 1_000).toFixed(1)}K`;
  }
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: options?.digits ?? 2,
    maximumFractionDigits: options?.digits ?? 2,
  });
}

export function num(value: number | null | undefined, decimals = 4): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** Share counts: compact above a thousand, up to four decimals below. */
export function shares(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return `${(value / 1_000).toFixed(1)}K`;
  if (abs >= 100) return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (abs === 0) return "0";
  return value.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: abs < 1 ? 4 : 2 });
}

export function compact(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

/** 18-decimal fixed point string → trimmed decimal string. */
export function wad(value: string | null | undefined, decimals = 6): string {
  if (!value) return "—";
  try {
    const full = formatUnits(BigInt(value), 18);
    if (!full.includes(".")) return full;
    const [whole, fraction] = full.split(".");
    const trimmed = (fraction ?? "").slice(0, decimals).replace(/0+$/, "");
    return trimmed ? `${whole}.${trimmed}` : (whole ?? "0");
  } catch {
    return "—";
  }
}

/** Multipliers live very close to 1, so they get more decimals than anything else. */
export function multiplier(value: number | null | undefined, decimals = 8): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function pct(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(decimals)}%`;
}

export function shortAddress(address?: string | null, size = 4): string {
  if (!address) return "—";
  if (address.length <= size * 2 + 4) return address;
  return `${address.slice(0, 2 + size)}…${address.slice(-size)}`;
}

export function shortHash(hash?: string | null): string {
  if (!hash) return "—";
  return `${hash.slice(0, 10)}…${hash.slice(-8)}`;
}

function toDate(input: number | string | Date): Date {
  return typeof input === "number" ? new Date(input * 1000) : input instanceof Date ? input : new Date(input);
}

export function dateTime(input: number | string | Date | null | undefined): string {
  if (input === null || input === undefined) return "—";
  const date = toDate(input);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function dateTimeUtc(input: number | string | Date | null | undefined): string {
  if (input === null || input === undefined) return "—";
  const date = toDate(input);
  if (Number.isNaN(date.getTime())) return "—";
  return `${date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" })} UTC`;
}

/** "Sep 24, 2026" from an ISO date, without the timezone shifting the day. */
export function isoDate(input: string | null | undefined, options?: { year?: boolean }): string {
  if (!input) return "—";
  const [y, m, d] = input.split("-").map(Number);
  if (!y || !m || !d) return input;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: options?.year === false ? undefined : "numeric", timeZone: "UTC" });
}

export function relative(input: number | string | Date | null | undefined): string {
  if (input === null || input === undefined) return "—";
  const date = toDate(input);
  if (Number.isNaN(date.getTime())) return "—";
  const deltaSeconds = (date.getTime() - Date.now()) / 1000;
  const absolute = Math.abs(deltaSeconds);
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
    ["second", 1],
  ];
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, seconds] of units) {
    if (absolute >= seconds || unit === "second") return formatter.format(Math.round(deltaSeconds / seconds), unit);
  }
  return "—";
}

/** "Closes in 4 days" / "Closes in 6 hours" from a unix timestamp. */
export function closesIn(closesAt: number): string {
  const delta = closesAt - Date.now() / 1000;
  if (delta <= 0) return "Closed";
  if (delta < 3600) return `Closes in ${Math.max(1, Math.round(delta / 60))} min`;
  if (delta < 86_400) return `Closes in ${Math.round(delta / 3600)} hours`;
  const days = Math.round(delta / 86_400);
  return `Closes in ${days} day${days === 1 ? "" : "s"}`;
}

export function ageLabel(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return "just now";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.round(seconds / 60)}m ago`;
}

/** "Sep 17" from a unix timestamp, in UTC. */
export function shortDate(input: number | null | undefined): string {
  if (input === null || input === undefined) return "—";
  return new Date(input * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}
