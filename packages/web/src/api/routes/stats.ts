import { eq, gt, sql } from "drizzle-orm";
import { formatUnits } from "viem";
import { base } from "../__core/app";
import { publicClient } from "../chain/chain";
import { getMarket } from "../chain/market";
import { findToken, TOKENS, votable } from "../chain/tokens";
import { db } from "../database";
import { SCHEMA_VERSION, readMarker } from "../database/migrate";
import * as schema from "../database/schema";
import { loadRecordIndex, SEASON } from "../lib/records";
import { dbSafe } from "../lib/safe";
import { nowSeconds } from "../lib/shared";
import { activityBySymbol } from "./record";

const count = (rows: Array<{ count: number }>) => Number(rows[0]?.count ?? 0);
const f18 = (value: string | bigint) => Number(formatUnits(BigInt(value), 18));

export const stats = {
  /**
   * The numbers on the home page: what is listed, what is open, what has been signed. Chain
   * numbers come from the market read; the signed layer degrades to zeros if the database is out.
   */
  home: base.handler(async () => {
    const now = nowSeconds();
    const [signed, market] = await Promise.all([
      dbSafe(
        "stats",
        null,
        async () => {
          const [openBallots, instructionCount, walletCount, attestationCount, itemCount] = await Promise.all([
            db.select({ id: schema.ballots.id, symbol: schema.ballots.symbol }).from(schema.ballots).where(gt(schema.ballots.closesAt, now)),
            db.select({ count: sql<number>`count(*)` }).from(schema.instructions).where(eq(schema.instructions.status, "active")),
            db.select({ count: sql<number>`count(distinct ${schema.instructions.wallet})` }).from(schema.instructions),
            db.select({ count: sql<number>`count(*)` }).from(schema.attestations),
            db.select({ count: sql<number>`count(*)` }).from(schema.ballotItems),
          ]);
          const activity = await activityBySymbol();
          let intentShareEq = 0n;
          let requestedShareEq = 0n;
          let requests = 0;
          const requestWallets = await db.select({ count: sql<number>`count(distinct ${schema.redemptionRequests.wallet})` }).from(schema.redemptionRequests);
          for (const entry of activity.values()) {
            intentShareEq += entry.intentShareEq;
            requestedShareEq += entry.requestedShareEq;
            requests += entry.requests;
          }
          const openIds = openBallots.map((row) => row.id);
          const openItems = openIds.length ? await db.select({ count: sql<number>`count(*)` }).from(schema.ballotItems).where(sql`${schema.ballotItems.ballotId} in ${openIds}`) : [{ count: 0 }];
          return {
            openBallotItems: count(openItems),
            openCompanies: new Set(openBallots.map((row) => row.symbol)).size,
            ballotItems: count(itemCount),
            intents: count(instructionCount),
            intentShareEq: Number(intentShareEq) / 1e18,
            requests,
            requestedShareEq: Number(requestedShareEq) / 1e18,
            wallets: count(walletCount),
            queueWallets: count(requestWallets),
            attestations: count(attestationCount),
          };
        },
      ),
      getMarket().catch(() => null),
    ]);
    const s = signed.value;
    return {
      stocks: TOKENS.length,
      votable: TOKENS.filter(votable).length,
      openBallotItems: s?.openBallotItems ?? 0,
      openCompanies: s?.openCompanies ?? 0,
      ballotItems: s?.ballotItems ?? 0,
      intents: s?.intents ?? 0,
      intentShareEq: s?.intentShareEq ?? 0,
      requests: s?.requests ?? 0,
      requestedShareEq: s?.requestedShareEq ?? 0,
      wallets: s?.wallets ?? 0,
      queueWallets: s?.queueWallets ?? 0,
      attestations: s?.attestations ?? 0,
      shareEquivalentRecorded: market ? market.value.assets.reduce((sum, asset) => sum + asset.totalSupplyUIFloat, 0) : null,
      actions: 0,
      blockNumber: market?.value.blockNumber ?? null,
      blockTimestamp: market?.value.blockTimestamp ?? null,
      dataAgeMs: market?.ageMs ?? null,
      stale: market?.stale ?? false,
      dbDown: signed.dbDown,
      supplyValueUsd: market ? market.value.assets.reduce((sum, asset) => sum + (asset.marketValueUsd ?? 0), 0) : null,
      priced: market ? market.value.assets.filter((asset) => asset.priceUsd !== null).length : 0,
      season: SEASON,
    };
  }),

  /** The public status page: is the chain readable, is the database up, how fresh is the record. */
  status: base.handler(async () => {
    const started = Date.now();
    const rpc = await publicClient
      .getBlockNumber({ cacheTime: 0 })
      .then((block) => ({ ok: true as const, blockNumber: block.toString(), latencyMs: Date.now() - started }))
      .catch((error: unknown) => ({ ok: false as const, blockNumber: null, latencyMs: Date.now() - started, error: error instanceof Error ? error.message.slice(0, 160) : "unreachable" }));
    const market = await getMarket().catch(() => null);
    const database = await dbSafe("status", null, async () => {
      const [ballots, items, instructions, requests, attestations, cursors, schemaVersion, seed] = await Promise.all([
        db.select({ count: sql<number>`count(*)` }).from(schema.ballots),
        db.select({ count: sql<number>`count(*)` }).from(schema.ballotItems),
        db.select({ count: sql<number>`count(*)` }).from(schema.instructions),
        db.select({ count: sql<number>`count(*)` }).from(schema.redemptionRequests),
        db.select({ count: sql<number>`count(*)` }).from(schema.attestations),
        db.select().from(schema.indexerCursors),
        readMarker("schema:version"),
        readMarker("seed:ballots"),
      ]);
      return {
        ballots: count(ballots),
        items: count(items),
        instructions: count(instructions),
        requests: count(requests),
        attestations: count(attestations),
        schemaVersion,
        schemaCurrent: schemaVersion === SCHEMA_VERSION,
        seedFingerprint: seed,
        cursors: cursors
          .filter((row) => !row.key.includes(":"))
          .map((row) => ({ key: row.key, lastBlock: row.lastBlock, status: row.status, detail: row.detail, updatedAt: row.updatedAt })),
      };
    });
    return {
      checkedAt: Date.now(),
      build: (process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7) || "local",
      region: process.env.VERCEL_REGION ?? null,
      rpc,
      market: market
        ? { ok: true as const, blockNumber: market.value.blockNumber, blockTimestamp: market.value.blockTimestamp, ageMs: market.ageMs, stale: market.stale, assets: market.value.assets.length, priced: market.value.assets.filter((asset) => asset.priceUsd !== null).length }
        : { ok: false as const, blockNumber: null, blockTimestamp: null, ageMs: null, stale: true, assets: 0, priced: 0 },
      database: database.dbDown || !database.value ? { ok: false as const } : { ok: true as const, ...database.value },
      tokens: TOKENS.length,
    };
  }),

  /** The public leaderboard: earliest signers, widest records, largest verified positions per ticker. */
  leaderboard: base.handler(async () => {
    const index = await loadRecordIndex();
    const weightBySymbolWallet = new Map<string, Map<string, bigint>>();
    for (const event of index.events) {
      if (event.kind !== "intent") continue;
      let holders = weightBySymbolWallet.get(event.symbol);
      if (!holders) {
        holders = new Map();
        weightBySymbolWallet.set(event.symbol, holders);
      }
      const weight = BigInt(event.weight);
      const previous = holders.get(event.wallet) ?? 0n;
      if (weight > previous) holders.set(event.wallet, weight);
    }
    const totalBy = (wallet: string) => {
      let sum = 0n;
      for (const holders of weightBySymbolWallet.values()) sum += holders.get(wallet) ?? 0n;
      return f18(sum);
    };
    const walletRows = [...index.wallets.entries()].map(([wallet, entry]) => ({ wallet, number: entry.number, at: entry.at, tickers: entry.symbols.size, shareEq: totalBy(wallet) }));
    const largest = [...weightBySymbolWallet.entries()]
      .map(([symbol, holders]) => {
        const [wallet, weight] = [...holders.entries()].sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0))[0]!;
        return { symbol, name: findToken(symbol)?.name ?? symbol, logo: findToken(symbol)?.logo ?? null, wallet, shareEq: f18(weight), holders: holders.size };
      })
      .sort((a, b) => b.shareEq - a.shareEq)
      .slice(0, 25);
    return {
      season: SEASON,
      wallets: index.wallets.size,
      events: index.events.length,
      earliest: walletRows.sort((a, b) => a.number - b.number).slice(0, 25),
      widest: [...walletRows].sort((a, b) => b.tickers - a.tickers || a.number - b.number).slice(0, 25),
      largest,
    };
  }),
};
