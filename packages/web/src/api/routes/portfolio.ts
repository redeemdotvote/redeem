import { formatUnits } from "viem";
import { z } from "zod";
import { base } from "../__core/app";
import { getCorporateActions, getIndexerStatus, getTransfers, type CorporateAction } from "../chain/events";
import { getBalances, getMarket, shareEquivalentWad, type MarketState } from "../chain/market";
import { addressSchema } from "../lib/shared";

export interface LedgerRow {
  symbol: string;
  name: string;
  kind: MarketState["kind"];
  logo: string | null;
  address: string;
  feed: string | null;
  rawBalance: string;
  rawBalanceFloat: number;
  uiMultiplier: string;
  uiMultiplierFloat: number;
  shareEquivalent: string;
  shareEquivalentFloat: number;
  contractBalanceOfUI: string | null;
  verified: boolean;
  verificationDelta: string;
  priceUsd: number | null;
  underlyingPriceUsd: number | null;
  valueUsd: number | null;
  priceUpdatedAt: number | null;
  priceStale: boolean;
  pendingMultiplier: string | null;
  pendingMultiplierFloat: number | null;
  effectiveAt: number | null;
  oraclePaused: boolean;
  lastCorporateAction: CorporateAction | null;
}

export function buildRow(
  market: MarketState,
  rawBalance: bigint,
  contractBalanceOfUI: string | null,
  actions: CorporateAction[],
): LedgerRow {
  const uiMultiplier = BigInt(market.uiMultiplier);
  const shareEquivalent = shareEquivalentWad(rawBalance, uiMultiplier);
  const contractUi = contractBalanceOfUI === null ? null : BigInt(contractBalanceOfUI);
  const delta = contractUi === null ? 0n : shareEquivalent - contractUi;
  const rawBalanceFloat = Number(formatUnits(rawBalance, 18));
  const symbolActions = actions.filter((action) => action.symbol === market.symbol);

  return {
    symbol: market.symbol,
    name: market.name,
    kind: market.kind,
    logo: market.logo,
    address: market.address,
    feed: market.feed,
    rawBalance: rawBalance.toString(),
    rawBalanceFloat,
    uiMultiplier: market.uiMultiplier,
    uiMultiplierFloat: market.uiMultiplierFloat,
    shareEquivalent: shareEquivalent.toString(),
    shareEquivalentFloat: Number(formatUnits(shareEquivalent, 18)),
    contractBalanceOfUI,
    verified: contractUi === null ? false : delta === 0n,
    verificationDelta: delta.toString(),
    priceUsd: market.priceUsd,
    underlyingPriceUsd:
      market.priceUsd !== null && market.uiMultiplierFloat > 0 ? market.priceUsd / market.uiMultiplierFloat : null,
    // The feed already carries the multiplier, so value is raw tokens × feed answer.
    valueUsd: market.priceUsd === null ? null : rawBalanceFloat * market.priceUsd,
    priceUpdatedAt: market.priceUpdatedAt,
    priceStale: market.priceStale,
    pendingMultiplier: market.pendingMultiplier,
    pendingMultiplierFloat: market.pendingMultiplierFloat,
    effectiveAt: market.effectiveAt,
    oraclePaused: market.oraclePaused,
    lastCorporateAction: symbolActions[0] ?? null,
  };
}

export async function loadCorporateActions(): Promise<{ actions: CorporateAction[]; stale: boolean }> {
  try {
    const result = await getCorporateActions();
    return { actions: result.value, stale: result.stale };
  } catch {
    return { actions: [], stale: true };
  }
}

export const portfolio = {
  /** Everything the portfolio needs for a wallet: every held token, the multiplier math and the totals. */
  forWallet: base.input(z.object({ wallet: addressSchema })).handler(async ({ input }) => {
    const [market, balances, history] = await Promise.all([getMarket(), getBalances(input.wallet), loadCorporateActions()]);
    const balanceBySymbol = new Map(balances.value.map((entry) => [entry.symbol, entry]));

    const rows = market.value.assets
      .map((asset) => {
        const balance = balanceBySymbol.get(asset.symbol);
        return buildRow(asset, BigInt(balance?.rawBalance ?? "0"), balance?.balanceOfUI ?? null, history.actions);
      })
      .filter((row) => BigInt(row.rawBalance) > 0n)
      .sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0) || b.shareEquivalentFloat - a.shareEquivalentFloat);

    return {
      wallet: input.wallet,
      blockNumber: market.value.blockNumber,
      blockTimestamp: market.value.blockTimestamp,
      held: rows,
      totals: {
        valueUsd: rows.reduce((sum, row) => sum + (row.valueUsd ?? 0), 0),
        shareEquivalent: rows.reduce((sum, row) => sum + row.shareEquivalentFloat, 0),
        positions: rows.length,
        unverified: rows.filter((row) => !row.verified).length,
        unpriced: rows.filter((row) => row.priceUsd === null).length,
      },
      dataAgeMs: Math.max(market.ageMs, balances.ageMs),
      degraded: market.stale || balances.stale || history.stale,
    };
  }),

  /** Transfer history for a wallet across all tokens. */
  transfers: base
    .input(z.object({ wallet: addressSchema, limit: z.number().int().min(1).max(100).default(25) }))
    .handler(async ({ input }) => {
      try {
        const result = await getTransfers(input.wallet, input.limit);
        return {
          transfers: result.value.transfers,
          degraded: result.stale,
          partial: result.value.partial,
          truncated: result.value.truncated,
          scannedFromBlock: result.value.scannedFromBlock,
          scannedToBlock: result.value.scannedToBlock,
        };
      } catch {
        return { transfers: [], degraded: true, partial: true, truncated: false, scannedFromBlock: 0, scannedToBlock: 0 };
      }
    }),

  /** Corporate action feed across every token, plus how current the scan is. */
  corporateActions: base.handler(async () => {
    const [history, cursors] = await Promise.all([loadCorporateActions(), getIndexerStatus()]);
    return {
      actions: history.actions,
      indexer: cursors.map((cursor) => ({
        key: cursor.key,
        lastBlock: cursor.lastBlock,
        status: cursor.status,
        detail: cursor.detail,
        updatedAt: cursor.updatedAt,
      })),
      degraded: history.stale,
    };
  }),
};
