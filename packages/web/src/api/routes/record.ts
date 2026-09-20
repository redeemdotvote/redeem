import { and, eq, inArray, sql } from "drizzle-orm";
import { formatUnits } from "viem";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { base } from "../__core/app";
import { getTransfers } from "../chain/events";
import { getBalances, getMarket } from "../chain/market";
import { findToken, SECTORS, TOKENS, votable } from "../chain/tokens";
import { db } from "../database";
import * as schema from "../database/schema";
import { dbSafe } from "../lib/safe";
import { getVenueHoldings } from "../lib/venues";
import { addressSchema, ballotStatus, nowSeconds } from "../lib/shared";
import { buildRow, loadCorporateActions } from "./portfolio";

const WAD = 10n ** 18n;

/** Signed intent and redemption-readiness totals per ticker — the record's own activity. */
export async function activityBySymbol() {
  const [intentRows, queueRows] = await Promise.all([
    db
      .select({ symbol: schema.instructions.symbol, weight: schema.instructions.shareEquivalent, wallet: schema.instructions.wallet })
      .from(schema.instructions)
      .where(eq(schema.instructions.status, "active")),
    db
      .select({ symbol: schema.redemptionRequests.symbol, requested: schema.redemptionRequests.requestedShareEquivalent })
      .from(schema.redemptionRequests)
      .where(eq(schema.redemptionRequests.status, "waiting")),
  ]);
  const out = new Map<string, { intents: number; intentWallets: Set<string>; intentShareEq: bigint; requests: number; requestedShareEq: bigint }>();
  const entry = (symbol: string) => {
    const existing = out.get(symbol);
    if (existing) return existing;
    const fresh = { intents: 0, intentWallets: new Set<string>(), intentShareEq: 0n, requests: 0, requestedShareEq: 0n };
    out.set(symbol, fresh);
    return fresh;
  };
  for (const row of intentRows) {
    const e = entry(row.symbol);
    e.intents += 1;
    e.intentWallets.add(row.wallet);
    e.intentShareEq += BigInt(row.weight);
  }
  for (const row of queueRows) {
    const e = entry(row.symbol);
    e.requests += 1;
    e.requestedShareEq += BigInt(row.requested);
  }
  return out;
}

async function eventCounts() {
  const rows = await db.select({ symbol: schema.ballots.symbol, closesAt: schema.ballots.closesAt, id: schema.ballots.id }).from(schema.ballots);
  const itemCounts = await db
    .select({ ballotId: schema.ballotItems.ballotId, count: sql<number>`count(*)` })
    .from(schema.ballotItems)
    .groupBy(schema.ballotItems.ballotId);
  const itemsByBallot = new Map(itemCounts.map((row) => [row.ballotId, Number(row.count)]));
  const now = nowSeconds();
  const out = new Map<string, { open: number; closed: number; nextClose: number | null }>();
  for (const row of rows) {
    const entry = out.get(row.symbol) ?? { open: 0, closed: 0, nextClose: null };
    const items = itemsByBallot.get(row.id) ?? 0;
    if (row.closesAt > now) {
      entry.open += items;
      entry.nextClose = entry.nextClose === null ? row.closesAt : Math.min(entry.nextClose, row.closesAt);
    } else entry.closed += items;
    out.set(row.symbol, entry);
  }
  return out;
}

const f18 = (value: bigint) => Number(formatUnits(value, 18));

export const record = {
  /**
   * The Record Book: one ledger row per official Stock Token — raw supply, multiplier,
   * share-equivalent, Chainlink valuation, intent and redemption activity, last corporate action.
   */
  book: base.input(z.object({ wallet: addressSchema.optional() }).optional()).handler(async ({ input }) => {
    const [market, history, activitySafe, eventsSafe, balances] = await Promise.all([
      getMarket(),
      loadCorporateActions(),
      dbSafe("activity", new Map() as Awaited<ReturnType<typeof activityBySymbol>>, activityBySymbol),
      dbSafe("events", new Map() as Awaited<ReturnType<typeof eventCounts>>, eventCounts),
      input?.wallet ? getBalances(input.wallet) : Promise.resolve(null),
    ]);
    const activity = activitySafe.value;
    const events = eventsSafe.value;
    const dbDown = activitySafe.dbDown || eventsSafe.dbDown;
    const stateBySymbol = new Map(market.value.assets.map((asset) => [asset.symbol, asset]));
    const balanceBySymbol = new Map((balances?.value ?? []).map((entry) => [entry.symbol, entry.rawBalance]));

    const rows = TOKENS.map((token) => {
      const state = stateBySymbol.get(token.symbol);
      const act = activity.get(token.symbol);
      const ev = events.get(token.symbol) ?? { open: 0, closed: 0, nextClose: null };
      const lastAction = history.actions.find((action) => action.symbol === token.symbol) ?? null;
      const raw = BigInt(balanceBySymbol.get(token.symbol) ?? "0");
      const multiplier = state ? BigInt(state.uiMultiplier) : WAD;
      return {
        symbol: token.symbol,
        name: token.name,
        tokenName: token.tokenName,
        kind: token.kind,
        sector: token.sector,
        exchange: token.exchange,
        logo: token.logo,
        address: token.address,
        feed: token.feed,
        votable: votable(token),
        rawSupply: state?.totalSupplyFloat ?? 0,
        uiMultiplier: state?.uiMultiplierFloat ?? 1,
        pendingMultiplier: state?.pendingMultiplierFloat ?? null,
        effectiveAt: state?.effectiveAt ?? null,
        shareEquivalent: state?.totalSupplyUIFloat ?? 0,
        priceUsd: state?.priceUsd ?? null,
        priceUpdatedAt: state?.priceUpdatedAt ?? null,
        priceStale: state?.priceStale ?? false,
        valueUsd: state?.marketValueUsd ?? null,
        intents: act?.intents ?? 0,
        intentWallets: act?.intentWallets.size ?? 0,
        intentShareEq: act ? f18(act.intentShareEq) : 0,
        requests: act?.requests ?? 0,
        requestedShareEq: act ? f18(act.requestedShareEq) : 0,
        openEvents: ev.open,
        closedEvents: ev.closed,
        nextClose: ev.nextClose,
        lastAction: lastAction ? { effectiveAt: lastAction.effectiveAt, changeBps: lastAction.changeBps, txHash: lastAction.txHash } : null,
        actionCount: history.actions.filter((action) => action.symbol === token.symbol).length,
        held: raw > 0n,
        heldShareEq: raw > 0n ? f18((raw * multiplier) / WAD) : 0,
      };
    });

    return {
      blockNumber: market.value.blockNumber,
      blockTimestamp: market.value.blockTimestamp,
      dataAgeMs: market.ageMs,
      degraded: market.stale || history.stale,
      /** True when the signed layer (intents, queues, events) could not be read; chain columns are still live. */
      dbDown,
      sectors: SECTORS,
      rows,
      totals: {
        tokens: rows.length,
        shareEquivalent: rows.reduce((sum, row) => sum + row.shareEquivalent, 0),
        valueUsd: rows.reduce((sum, row) => sum + (row.valueUsd ?? 0), 0),
        priced: rows.filter((row) => row.priceUsd !== null).length,
        intents: rows.reduce((sum, row) => sum + row.intents, 0),
        intentShareEq: rows.reduce((sum, row) => sum + row.intentShareEq, 0),
        requests: rows.reduce((sum, row) => sum + row.requests, 0),
        requestedShareEq: rows.reduce((sum, row) => sum + row.requestedShareEq, 0),
        actions: history.actions.length,
        openEvents: rows.reduce((sum, row) => sum + row.openEvents, 0),
      },
    };
  }),

  /** One security record in full. */
  detail: base.input(z.object({ symbol: z.string(), wallet: addressSchema.optional() })).handler(async ({ input }) => {
    const token = findToken(input.symbol);
    if (!token) throw new ORPCError("NOT_FOUND", { message: `${input.symbol.toUpperCase()} is not an official Stock Token on Robinhood Chain.` });

    const [market, history, activity, ballotRows] = await Promise.all([
      getMarket(),
      loadCorporateActions(),
      activityBySymbol(),
      db.select().from(schema.ballots).where(eq(schema.ballots.symbol, token.symbol)),
    ]);
    const asset = market.value.assets.find((entry) => entry.symbol === token.symbol);
    if (!asset) throw new ORPCError("NOT_FOUND", { message: `${token.symbol} is not indexed yet.` });

    const ballotIds = ballotRows.map((row) => row.id);
    const items = ballotIds.length ? await db.select().from(schema.ballotItems).where(inArray(schema.ballotItems.ballotId, ballotIds)) : [];
    const instructionCounts = ballotIds.length
      ? await db
          .select({ ballotItemId: schema.instructions.ballotItemId, count: sql<number>`count(*)`, weight: sql<string>`sum(cast(${schema.instructions.shareEquivalent} as real))` })
          .from(schema.instructions)
          .where(and(inArray(schema.instructions.ballotId, ballotIds), eq(schema.instructions.status, "active")))
          .groupBy(schema.instructions.ballotItemId)
      : [];
    const countByItem = new Map(instructionCounts.map((row) => [row.ballotItemId, { count: Number(row.count), weight: Number(row.weight ?? 0) / 1e18 }]));

    const events = ballotRows
      .map((ballot) => ({
        id: ballot.id,
        meetingType: ballot.meetingType,
        meetingDate: ballot.meetingDate,
        recordDate: ballot.recordDate,
        closesAt: ballot.closesAt,
        status: ballotStatus(ballot.closesAt),
        docUrl: ballot.docUrl,
        filedAt: ballot.filedAt,
        companyName: ballot.companyName,
        items: items
          .filter((item) => item.ballotId === ballot.id)
          .sort((a, b) => a.ordinal - b.ordinal)
          .map((item) => ({
            id: item.id,
            index: item.index,
            title: item.title,
            itemType: item.itemType,
            boardRecommendation: item.boardRecommendation,
            intents: countByItem.get(item.id)?.count ?? 0,
            intentShareEq: countByItem.get(item.id)?.weight ?? 0,
          })),
      }))
      .sort((a, b) => b.closesAt - a.closesAt);

    let row = null;
    let transfers: Awaited<ReturnType<typeof getTransfers>>["value"]["transfers"] = [];
    let transfersPartial = false;
    if (input.wallet) {
      const balances = await getBalances(input.wallet);
      const balance = balances.value.find((entry) => entry.symbol === token.symbol);
      row = buildRow(asset, BigInt(balance?.rawBalance ?? "0"), balance?.balanceOfUI ?? null, history.actions);
      try {
        const result = await getTransfers(input.wallet, 25);
        transfers = result.value.transfers.filter((transfer) => transfer.symbol === token.symbol);
        transfersPartial = result.value.partial;
      } catch {
        transfersPartial = true;
      }
    }

    const act = activity.get(token.symbol);
    const totalSupply = BigInt(asset.totalSupply);
    const venues = await getVenueHoldings()
      .then((holdings) => holdings.value.filter((holding) => holding.symbol === token.symbol))
      .catch(() => []);
    const pooled = venues.reduce((sum, venue) => sum + venue.shareEquivalent, 0);
    return {
      token: {
        symbol: token.symbol,
        name: token.name,
        tokenName: token.tokenName,
        address: token.address,
        isin: token.isin,
        kind: token.kind,
        cik: token.cik,
        sector: token.sector,
        sicDescription: token.sicDescription,
        fiscalYearEnd: token.fiscalYearEnd,
        exchange: token.exchange,
        stateOfIncorporation: token.stateOfIncorporation,
        feed: token.feed,
        logo: token.logo,
        votable: votable(token),
      },
      asset,
      row,
      transfers,
      transfersPartial,
      actions: history.actions.filter((action) => action.symbol === token.symbol),
      events,
      activity: {
        intents: act?.intents ?? 0,
        intentWallets: act?.intentWallets.size ?? 0,
        intentShareEq: act ? f18(act.intentShareEq) : 0,
        requests: act?.requests ?? 0,
        requestedShareEq: act ? f18(act.requestedShareEq) : 0,
      },
      supply: {
        rawFloat: Number(formatUnits(totalSupply, 18)),
        uiFloat: asset.totalSupplyUIFloat,
        computedUi: ((totalSupply * BigInt(asset.uiMultiplier)) / WAD).toString(),
        matches: ((totalSupply * BigInt(asset.uiMultiplier)) / WAD).toString() === asset.totalSupplyUI,
      },
      /** Where the share-equivalents sit. Only direct wallets are indexed today; the rest is named so the seam is visible. */
      ownership: [
        { key: "direct", label: "Wallets · other", shareEquivalent: Math.max(0, asset.totalSupplyUIFloat - pooled), indexed: true },
        { key: "lp", label: `Liquidity pools · ${venues.length}`, shareEquivalent: pooled, indexed: true },
        { key: "vault", label: "Vaults", shareEquivalent: null, indexed: false },
        { key: "lending", label: "Lending collateral", shareEquivalent: null, indexed: false },
        { key: "nested", label: "Nested positions", shareEquivalent: null, indexed: false },
      ],
      /** The venues holding this token that the record can look through, largest first. */
      venues,
      blockNumber: market.value.blockNumber,
      blockTimestamp: market.value.blockTimestamp,
      dataAgeMs: market.ageMs,
      degraded: market.stale || history.stale,
    };
  }),
};
