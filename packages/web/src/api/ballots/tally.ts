import { formatUnits } from "viem";
import type { Choice } from "./seed";

export interface TallyRow {
  value: string;
  label: string;
  tone: Choice["tone"];
  /** Summed share equivalent, 18-decimal string. */
  weight: string;
  weightFloat: number;
  wallets: number;
  /** Share of the total weight, 0–100. */
  share: number;
}

export interface Tally {
  rows: TallyRow[];
  totalWeight: string;
  totalWeightFloat: number;
  wallets: number;
  /** Which choice leads by weight, or null when nothing is recorded. */
  leading: string | null;
}

export interface Weighted {
  choice: string;
  weight: bigint;
}

export function computeTally(choices: Choice[], entries: Weighted[]): Tally {
  const sums = new Map<string, { weight: bigint; wallets: number }>();
  for (const choice of choices) sums.set(choice.value, { weight: 0n, wallets: 0 });
  let total = 0n;
  for (const entry of entries) {
    const bucket = sums.get(entry.choice);
    if (!bucket) continue;
    bucket.weight += entry.weight;
    bucket.wallets += 1;
    total += entry.weight;
  }
  const rows = choices.map((choice) => {
    const bucket = sums.get(choice.value) ?? { weight: 0n, wallets: 0 };
    return {
      value: choice.value,
      label: choice.label,
      tone: choice.tone,
      weight: bucket.weight.toString(),
      weightFloat: Number(formatUnits(bucket.weight, 18)),
      wallets: bucket.wallets,
      share: total === 0n ? 0 : Number((bucket.weight * 10_000n) / total) / 100,
    };
  });
  const leading = rows.reduce<TallyRow | null>((best, row) => (row.wallets > 0 && (!best || BigInt(row.weight) > BigInt(best.weight)) ? row : best), null);
  return {
    rows,
    totalWeight: total.toString(),
    totalWeightFloat: Number(formatUnits(total, 18)),
    wallets: entries.length,
    leading: leading?.value ?? null,
  };
}

/** Canonical receipt form — the exact bytes a Merkle leaf is hashed over. */
export function canonicalReceipt(row: {
  id: string;
  ballotItemId: string;
  wallet: string;
  choice: string;
  shareEquivalent: string;
  closeWeight: string | null;
  blockNumber: number;
  signature: string;
}): string {
  return JSON.stringify({
    schema: "redeem.receipt.v1",
    id: row.id,
    ballotItem: row.ballotItemId,
    wallet: row.wallet.toLowerCase(),
    choice: row.choice,
    signedWeight: row.shareEquivalent,
    countedWeight: row.closeWeight ?? row.shareEquivalent,
    block: row.blockNumber,
    signature: row.signature,
  });
}
