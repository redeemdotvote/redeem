import type { RouterClient } from "@orpc/server";
import { createApp } from "./__core/app";
import { seedBallots } from "./ballots/seed";
import { getCorporateActions } from "./chain/events";
import { getBalances, getMarket, shareEquivalentWad } from "./chain/market";
import { findToken, TOKENS } from "./chain/tokens";
import { loadRecordIndex, SEASON } from "./lib/records";
import { loadReferrals } from "./lib/referrals";
import { computeXp } from "./lib/xp";
import { loadCorporateActions } from "./routes/portfolio";
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

/**
 * A badge for bios and READMEs: wallet number, XP, tickers on file, Season. SVG, so it needs no
 * image runtime and renders anywhere an <img> does. Public data only; the address is the only input.
 */
const esc = (value: string) => value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] ?? ch);
inner.get("/api/v1/badge/:wallet", async (c) => {
  const raw = c.req.param("wallet").replace(/\.svg$/i, "");
  if (!isAddress(raw)) return json({ error: "invalid_address" }, 400);
  const wallet = raw.toLowerCase();
  const dark = c.req.query("theme") === "dark";
  const [index, referrals] = await Promise.all([loadRecordIndex(), loadReferrals()]);
  const mine = index.wallets.get(wallet) ?? null;
  const xp = computeXp(index, referrals, wallet).total;
  const paper = dark ? "#0d1210" : "#f4f4ee";
  const ink = dark ? "#e9ede7" : "#131614";
  const grey = dark ? "#9aa79e" : "#55645b";
  const line = dark ? "#2c3a31" : "#cfd6cf";
  const emerald = dark ? "#5fbd8f" : "#1c6b4a";
  const short = `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;
  const headline = mine ? `Wallet #${mine.number}` : "Not recorded yet";
  const sub = mine ? `${mine.symbols.size} ${mine.symbols.size === 1 ? "ticker" : "tickers"} on file · ${xp} XP · ${SEASON.label}` : "Sign one intent to enter the file";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="96" viewBox="0 0 420 96" role="img" aria-label="Redeem record badge for ${esc(short)}">
  <rect x="0.5" y="0.5" width="419" height="95" rx="12" fill="${paper}" stroke="${line}"/>
  <text x="20" y="34" font-family="Georgia, 'Iowan Old Style', serif" font-size="22" fill="${ink}">Redeem</text>
  <text x="104" y="33" font-family="Helvetica, Arial, sans-serif" font-size="10" letter-spacing="1.4" fill="${grey}">RECORD OF SHARE-EQUIVALENTS</text>
  <text x="20" y="64" font-family="Menlo, 'IBM Plex Mono', monospace" font-size="20" fill="${mine ? ink : grey}">${esc(headline)}</text>
  <text x="20" y="82" font-family="Helvetica, Arial, sans-serif" font-size="11" fill="${grey}">${esc(sub)}</text>
  <text x="400" y="64" text-anchor="end" font-family="Menlo, 'IBM Plex Mono', monospace" font-size="12" fill="${ink}">${esc(short)}</text>
  <text x="400" y="82" text-anchor="end" font-family="Helvetica, Arial, sans-serif" font-size="9" letter-spacing="1.2" fill="${emerald}">INTENT · NOT A VOTE</text>
</svg>`;
  return new Response(svg, { headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "public, max-age=300" } });
});

/**
 * A JSON Feed (https://jsonfeed.org/version/1.1) of what changed: multiplier updates as they are
 * mirrored from chain and proxy items as they are extracted from EDGAR. Poll it, pipe it into a
 * bot, a webhook relay or a reader. `since` (unix seconds) and `type` (actions | items) narrow it.
 */
inner.get("/api/v1/feed", async (c) => {
  const since = Number(c.req.query("since") ?? 0) || 0;
  const type = c.req.query("type");
  const origin = new URL(c.req.url).origin;
  const [history, ballots] = await Promise.all([
    type === "items" ? Promise.resolve({ actions: [] as Awaited<ReturnType<typeof loadCorporateActions>>["actions"], stale: false }) : loadCorporateActions().catch(() => ({ actions: [], stale: true })),
    type === "actions" ? Promise.resolve([]) : db.select().from(schema.ballots),
  ]);
  const items: Array<{ id: string; url: string; title: string; content_text: string; date_published: string; tags: string[]; _redeem: Record<string, unknown> }> = [];
  for (const action of history.actions) {
    if (action.effectiveAt < since) continue;
    const bps = action.changeBps;
    items.push({
      id: `action:${action.txHash}:${action.logIndex}`,
      url: `${origin}/record/${action.symbol}`,
      title: `${action.symbol} multiplier ${bps >= 0 ? "+" : ""}${(bps / 100).toFixed(3)}%`,
      content_text: `UIMultiplierUpdated on ${action.symbol}: ${action.oldMultiplier} → ${action.newMultiplier}, effective ${new Date(action.effectiveAt * 1000).toISOString()}.`,
      date_published: new Date(action.effectiveAt * 1000).toISOString(),
      tags: ["corporate-action", action.symbol],
      _redeem: { type: "action", symbol: action.symbol, oldMultiplier: action.oldMultiplier, newMultiplier: action.newMultiplier, changeBps: bps, effectiveAt: action.effectiveAt, txHash: action.txHash, block: action.blockNumber },
    });
  }
  for (const ballot of ballots) {
    if (ballot.publishedAt < since) continue;
    items.push({
      id: `ballot:${ballot.id}`,
      url: `${origin}/intents?symbol=${ballot.symbol}`,
      title: `${ballot.symbol} · ${ballot.meetingType} meeting ${ballot.meetingDate} · proxy items on file`,
      content_text: `${ballot.companyName} ${ballot.form} filed ${ballot.filedAt}. Intent cutoff ${new Date(ballot.closesAt * 1000).toISOString()}. Intent, not a shareholder vote.`,
      date_published: new Date(ballot.publishedAt * 1000).toISOString(),
      tags: ["proxy-items", ballot.symbol],
      _redeem: { type: "ballot", symbol: ballot.symbol, ballotId: ballot.id, form: ballot.form, filedAt: ballot.filedAt, meetingDate: ballot.meetingDate, closesAt: ballot.closesAt, docUrl: ballot.docUrl },
    });
  }
  items.sort((a, b) => (a.date_published < b.date_published ? 1 : -1));
  return json({
    version: "https://jsonfeed.org/version/1.1",
    title: "Redeem · Stock Token record feed",
    home_page_url: origin,
    feed_url: `${origin}/api/v1/feed`,
    description: "Multiplier updates mirrored from Robinhood Chain and proxy items extracted from EDGAR. Intent, not a shareholder vote.",
    items: items.slice(0, 200),
  });
});

const app = {
  fetch: async (request: Request) => {
    await boot;
    return inner.fetch(request);
  },
};

export default app;
