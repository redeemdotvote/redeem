import { asc } from "drizzle-orm";
import { db } from "../database";
import * as schema from "../database/schema";

/**
 * Record numbers. Every signature (an intent or a queue request) is an event; the first event a
 * wallet signs for a ticker gives it that ticker's next record number, and the first event a
 * wallet signs at all gives it its Redeem wallet number. Numbers are derived from signing order,
 * never stored, so they cannot drift from the receipts they describe. They are a position in a
 * file, not a claim on anything.
 */
export const SEASON = { id: "0", label: "Season 0", note: "Recorded before the first in-kind window" } as const;

export interface RecordEvent {
  wallet: string;
  symbol: string;
  at: number;
  /** share-equivalent as a wad string, for the largest-position tables */
  weight: string;
  kind: "intent" | "queue";
}

export interface RecordIndex {
  events: RecordEvent[];
  /** symbol → wallet → { number, at } */
  bySymbol: Map<string, Map<string, { number: number; at: number }>>;
  /** wallet → { number, at, symbols } in first-signature order */
  wallets: Map<string, { number: number; at: number; symbols: Set<string> }>;
}

export async function loadRecordIndex(): Promise<RecordIndex> {
  const [intents, requests] = await Promise.all([
    db
      .select({ wallet: schema.instructions.wallet, symbol: schema.instructions.symbol, createdAt: schema.instructions.createdAt, weight: schema.instructions.shareEquivalent, status: schema.instructions.status })
      .from(schema.instructions)
      .orderBy(asc(schema.instructions.createdAt)),
    db
      .select({ wallet: schema.redemptionRequests.wallet, symbol: schema.redemptionRequests.symbol, createdAt: schema.redemptionRequests.createdAt, weight: schema.redemptionRequests.heldShareEquivalent })
      .from(schema.redemptionRequests)
      .orderBy(asc(schema.redemptionRequests.createdAt)),
  ]);
  const events: RecordEvent[] = [
    ...intents.map((row) => ({ wallet: row.wallet.toLowerCase(), symbol: row.symbol, at: toSeconds(row.createdAt), weight: row.weight, kind: "intent" as const })),
    ...requests.map((row) => ({ wallet: row.wallet.toLowerCase(), symbol: row.symbol, at: toSeconds(row.createdAt), weight: row.weight, kind: "queue" as const })),
  ].sort((a, b) => a.at - b.at);

  const bySymbol = new Map<string, Map<string, { number: number; at: number }>>();
  const wallets = new Map<string, { number: number; at: number; symbols: Set<string> }>();
  for (const event of events) {
    let holders = bySymbol.get(event.symbol);
    if (!holders) {
      holders = new Map();
      bySymbol.set(event.symbol, holders);
    }
    if (!holders.has(event.wallet)) holders.set(event.wallet, { number: holders.size + 1, at: event.at });
    let w = wallets.get(event.wallet);
    if (!w) {
      w = { number: wallets.size + 1, at: event.at, symbols: new Set() };
      wallets.set(event.wallet, w);
    }
    w.symbols.add(event.symbol);
  }
  return { events, bySymbol, wallets };
}

function toSeconds(value: Date | number | null): number {
  if (value instanceof Date) return Math.floor(value.getTime() / 1000);
  return Number(value ?? 0);
}
