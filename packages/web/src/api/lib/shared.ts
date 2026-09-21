import { formatUnits, getAddress, type Address } from "viem";
import { z } from "zod";

export const addressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, "Expected a 0x wallet address")
  .transform((value) => getAddress(value) as Address);

/** 18-decimal fixed point to a trimmed decimal string, for text a human is about to sign. */
export function formatWad(value: bigint, maxDecimals = 6): string {
  const full = formatUnits(value, 18);
  if (!full.includes(".")) return full;
  const [whole, fraction] = full.split(".");
  const trimmed = (fraction ?? "").slice(0, maxDecimals).replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : (whole ?? "0");
}

export const nowSeconds = () => Math.floor(Date.now() / 1000);

export type BallotStatus = "active" | "closed";

/** Redeem opened for signatures on 2026-09-14. A meeting whose cutoff fell before that could never have been signed. */
export const RECORD_OPENED_AT = Math.floor(Date.UTC(2026, 8, 14) / 1000);
export const isHistorical = (closesAt: number) => closesAt < RECORD_OPENED_AT;

export function ballotStatus(closesAt: number): BallotStatus {
  return closesAt > nowSeconds() ? "active" : "closed";
}
