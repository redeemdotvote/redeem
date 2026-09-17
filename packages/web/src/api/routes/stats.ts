import { eq, gt, sql } from "drizzle-orm";
import { base } from "../__core/app";
import { getMarket } from "../chain/market";
import { TOKENS, votable } from "../chain/tokens";
import { db } from "../database";
import * as schema from "../database/schema";
import { nowSeconds } from "../lib/shared";
import { activityBySymbol } from "./record";

export const stats = {
  /** The numbers on the home page: what is listed, what is open, what has been signed. */
  home: base.handler(async () => {
    const now = nowSeconds();
    const [openBallots, instructionCount, walletCount, attestationCount, itemCount, market] = await Promise.all([
      db.select({ id: schema.ballots.id, symbol: schema.ballots.symbol }).from(schema.ballots).where(gt(schema.ballots.closesAt, now)),
      db.select({ count: sql<number>`count(*)` }).from(schema.instructions).where(eq(schema.instructions.status, "active")),
      db.select({ count: sql<number>`count(distinct ${schema.instructions.wallet})` }).from(schema.instructions),
      db.select({ count: sql<number>`count(*)` }).from(schema.attestations),
      db.select({ count: sql<number>`count(*)` }).from(schema.ballotItems),
      getMarket().catch(() => null),
    ]);
    const activity = await activityBySymbol();
    let intentShareEq = 0n;
    let requestedShareEq = 0n;
    let requests = 0;
    for (const entry of activity.values()) {
      intentShareEq += entry.intentShareEq;
      requestedShareEq += entry.requestedShareEq;
      requests += entry.requests;
    }
    const openIds = openBallots.map((row) => row.id);
    const openItems = openIds.length
      ? await db.select({ count: sql<number>`count(*)` }).from(schema.ballotItems).where(sql`${schema.ballotItems.ballotId} in ${openIds}`)
      : [{ count: 0 }];
    return {
      stocks: TOKENS.length,
      votable: TOKENS.filter(votable).length,
      openBallotItems: Number(openItems[0]?.count ?? 0),
      openCompanies: new Set(openBallots.map((row) => row.symbol)).size,
      ballotItems: Number(itemCount[0]?.count ?? 0),
      intents: Number(instructionCount[0]?.count ?? 0),
      intentShareEq: Number(intentShareEq) / 1e18,
      requests,
      requestedShareEq: Number(requestedShareEq) / 1e18,
      shareEquivalentRecorded: market ? market.value.assets.reduce((sum, asset) => sum + asset.totalSupplyUIFloat, 0) : null,
      actions: 0,
      wallets: Number(walletCount[0]?.count ?? 0),
      attestations: Number(attestationCount[0]?.count ?? 0),
      blockNumber: market?.value.blockNumber ?? null,
      blockTimestamp: market?.value.blockTimestamp ?? null,
      supplyValueUsd: market ? market.value.assets.reduce((sum, asset) => sum + (asset.marketValueUsd ?? 0), 0) : null,
      priced: market ? market.value.assets.filter((asset) => asset.priceUsd !== null).length : 0,
    };
  }),
};
