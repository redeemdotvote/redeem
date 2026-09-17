import type { RouterClient } from "@orpc/server";
import { createApp } from "./__core/app";
import { seedBallots } from "./ballots/seed";
import { getCorporateActions } from "./chain/events";
import { getBalances, getMarket, shareEquivalentWad } from "./chain/market";
import { findToken, TOKENS } from "./chain/tokens";
import { ensureSchema, db } from "./database";
import * as schema from "./database/schema";
import { intents } from "./routes/intents";
import { ping } from "./routes/ping";
import { portfolio } from "./routes/portfolio";
import { record } from "./routes/record";
import { redemption } from "./routes/redemption";
import { statements } from "./routes/statements";
import { stats } from "./routes/stats";
import { and, eq } from "drizzle-orm";
import { formatUnits, isAddress } from "viem";

// Every chain read lives behind these procedures on purpose: the Robinhood Chain public RPC is
// rate limited, so the browser never touches it for data — only for signing.
export const router = {
  ping,
  stats,
  record,
  intents,
  portfolio,
  statements,
  redemption,
};

export type AppRouter = typeof router;
/** Typed client for the router — used by the web and mobile api clients. */
export type AppRouterClient = RouterClient<AppRouter>;

/** Tables and the intent-event mirror are brought up once per process, before the first request is served. */
const boot = ensureSchema()
  .then(() => seedBallots())
  .catch((error) => {
    console.error("[redeem] boot failed", error);
  });

const inner = createApp(router);

/**
 * The public REST surface — plain GET routes over the same reads, for anyone who would rather
 * curl the record than speak oRPC. Documented on /api in the app.
 */
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, (_key, value) => (typeof value === "bigint" ? value.toString() : value)), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=15" },
  });

inner.get("/api/v1/record", async () => {
  const market = await getMarket();
  return json({
    chainId: 4663,
    block: market.value.blockNumber,
    tokens: market.value.assets.map((asset) => ({
      symbol: asset.symbol,
      name: asset.name,
      contract: asset.address,
      uiMultiplier: asset.uiMultiplier,
      pendingMultiplier: asset.pendingMultiplier,
      effectiveAt: asset.effectiveAt,
      rawSupply: asset.totalSupply,
      shareEquivalentSupply: asset.totalSupplyUI,
      priceUsd: asset.priceUsd,
      priceFeed: asset.feed,
    })),
  });
});

inner.get("/api/v1/record/:symbol", async (c) => {
  const token = findToken(c.req.param("symbol"));
  if (!token) return json({ error: "unknown_token" }, 404);
  const [market, actions] = await Promise.all([getMarket(), getCorporateActions().catch(() => null)]);
  const asset = market.value.assets.find((entry) => entry.symbol === token.symbol);
  return json({
    chainId: 4663,
    block: market.value.blockNumber,
    symbol: token.symbol,
    name: token.name,
    issuer: "Robinhood Assets (Jersey) Limited",
    contract: token.address,
    isin: token.isin,
    priceFeed: token.feed,
    uiMultiplier: asset?.uiMultiplier ?? null,
    pendingMultiplier: asset?.pendingMultiplier ?? null,
    effectiveAt: asset?.effectiveAt ?? null,
    rawSupply: asset?.totalSupply ?? null,
    shareEquivalentSupply: asset?.totalSupplyUI ?? null,
    priceUsd: asset?.priceUsd ?? null,
    priceUpdatedAt: asset?.priceUpdatedAt ?? null,
    corporateActions: (actions?.value ?? []).filter((action) => action.symbol === token.symbol),
  });
});

inner.get("/api/v1/record/:symbol/multipliers", async (c) => {
  const token = findToken(c.req.param("symbol"));
  if (!token) return json({ error: "unknown_token" }, 404);
  const actions = await getCorporateActions().catch(() => null);
  return json({ symbol: token.symbol, contract: token.address, events: (actions?.value ?? []).filter((action) => action.symbol === token.symbol) });
});

inner.get("/api/v1/positions/:wallet", async (c) => {
  const wallet = c.req.param("wallet");
  if (!isAddress(wallet)) return json({ error: "invalid_address" }, 400);
  const [market, balances] = await Promise.all([getMarket(), getBalances(wallet)]);
  const multiplierBySymbol = new Map(market.value.assets.map((asset) => [asset.symbol, asset]));
  const positions = balances.value
    .filter((entry) => BigInt(entry.rawBalance) > 0n)
    .map((entry) => {
      const asset = multiplierBySymbol.get(entry.symbol);
      const multiplier = BigInt(asset?.uiMultiplier ?? "1000000000000000000");
      const shareEquivalent = shareEquivalentWad(BigInt(entry.rawBalance), multiplier);
      return {
        symbol: entry.symbol,
        contract: TOKENS.find((token) => token.symbol === entry.symbol)?.address ?? null,
        rawBalance: entry.rawBalance,
        uiMultiplier: multiplier.toString(),
        shareEquivalent: shareEquivalent.toString(),
        contractBalanceOfUI: entry.balanceOfUI,
        verified: entry.balanceOfUI !== null && BigInt(entry.balanceOfUI) === shareEquivalent,
        priceUsd: asset?.priceUsd ?? null,
        valueUsd: asset?.priceUsd === null || asset?.priceUsd === undefined ? null : Number(formatUnits(BigInt(entry.rawBalance), 18)) * asset.priceUsd,
      };
    });
  return json({ chainId: 4663, block: market.value.blockNumber, wallet, positions });
});

inner.get("/api/v1/intents/:itemId/receipts", async (c) => {
  const itemId = c.req.param("itemId");
  const rows = await db
    .select()
    .from(schema.instructions)
    .where(and(eq(schema.instructions.ballotItemId, itemId), eq(schema.instructions.status, "active")));
  return json({
    itemId,
    note: "Intent, not a shareholder vote.",
    receipts: rows.map((row) => ({
      id: row.id,
      wallet: row.wallet,
      choice: row.choice,
      delegate: row.delegate,
      shareEquivalent: row.shareEquivalent,
      countedWeight: row.closeWeight,
      block: row.blockNumber,
      signature: row.signature,
      typedData: JSON.parse(row.typedData),
    })),
  });
});

const app = {
  fetch: async (request: Request) => {
    await boot;
    return inner.fetch(request);
  },
};

export default app;
