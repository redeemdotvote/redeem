import { z } from "zod";
import { base } from "../__core/app";
import { getMarket } from "../chain/market";
import { findToken, TOKENS } from "../chain/tokens";
import snapshot from "../data/holders.json";
import { addressSchema } from "../lib/shared";

/**
 * Holder ranks, from the snapshot built by scripts/snapshot-holders.ts: every address that ever
 * received a token, balances read exactly with balanceOf at one block. A wallet inside the top
 * hundred gets an exact rank; anyone else gets a percentile from the cut points. Pools are
 * labelled so a liquidity pool is never presented as a person.
 */
interface TokenSnapshot {
  holders: number;
  candidates: number;
  totalHeld: string;
  top: Array<{ address: string; balance: string; pool: boolean }>;
  cuts: string[];
}
const SNAPSHOT = snapshot as unknown as { generatedAt: string | null; block: string | null; tokens: Record<string, TokenSnapshot> };
const WAD = 10n ** 18n;
const f18 = (value: bigint) => Number(value) / 1e18;

export function rankOf(symbol: string, wallet: string, balance: bigint) {
  const token = SNAPSHOT.tokens[symbol];
  if (!token || token.holders === 0) return null;
  const lower = wallet.toLowerCase();
  const exact = token.top.findIndex((entry) => entry.address === lower);
  if (exact >= 0) return { symbol, rank: exact + 1, percentile: null, holders: token.holders, exact: true };
  if (balance === 0n) return { symbol, rank: null, percentile: null, holders: token.holders, exact: false };
  // cuts[p] is the balance at the p-th percentile from the top; the first cut the balance beats is the percentile.
  let percentile = 100;
  for (let p = 0; p < token.cuts.length; p++) {
    if (balance >= BigInt(token.cuts[p]!)) {
      percentile = Math.max(1, p);
      break;
    }
  }
  return { symbol, rank: null, percentile, holders: token.holders, exact: false };
}

export const holders = {
  /** A wallet's rank in every token it holds. */
  ranks: base.input(z.object({ wallet: addressSchema })).handler(async ({ input }) => {
    const { getBalances } = await import("../chain/market");
    const balances = await getBalances(input.wallet);
    const ranks = balances.value
      .filter((entry) => BigInt(entry.rawBalance) > 0n)
      .map((entry) => rankOf(entry.symbol, input.wallet, BigInt(entry.rawBalance)))
      .filter((rank): rank is NonNullable<typeof rank> => Boolean(rank));
    return { wallet: input.wallet, snapshotBlock: SNAPSHOT.block, generatedAt: SNAPSHOT.generatedAt, ranks };
  }),

  /** The top hundred holders of one token, with balances as share-equivalents. */
  top: base.input(z.object({ symbol: z.string() })).handler(async ({ input }) => {
    const token = findToken(input.symbol);
    const entry = token ? SNAPSHOT.tokens[token.symbol] : undefined;
    if (!token || !entry) return { symbol: input.symbol.toUpperCase(), available: false as const, holders: 0, rows: [], snapshotBlock: SNAPSHOT.block, generatedAt: SNAPSHOT.generatedAt };
    const market = await getMarket().catch(() => null);
    const asset = market?.value.assets.find((candidate) => candidate.symbol === token.symbol);
    const multiplier = BigInt(asset?.uiMultiplier ?? WAD);
    const total = BigInt(entry.totalHeld);
    return {
      symbol: token.symbol,
      name: token.name,
      logo: token.logo,
      available: true as const,
      holders: entry.holders,
      totalShareEq: f18((total * multiplier) / WAD),
      priceUsd: asset?.priceUsd ?? null,
      snapshotBlock: SNAPSHOT.block,
      generatedAt: SNAPSHOT.generatedAt,
      rows: entry.top.map((row, index) => {
        const balance = BigInt(row.balance);
        return { rank: index + 1, address: row.address, pool: row.pool, shareEq: f18((balance * multiplier) / WAD), share: total > 0n ? Number((balance * 10_000n) / total) / 100 : 0 };
      }),
    };
  }),

  /** Every token's holder count, for the Markets and record pages. */
  counts: base.handler(() => ({
    snapshotBlock: SNAPSHOT.block,
    generatedAt: SNAPSHOT.generatedAt,
    counts: Object.fromEntries(TOKENS.map((token) => [token.symbol, SNAPSHOT.tokens[token.symbol]?.holders ?? null])),
  })),
};
