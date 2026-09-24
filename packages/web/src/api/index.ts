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
import { buildStatus, stats } from "./routes/stats";
import { buildReport, reports } from "./routes/reports";
import { getTimestamp } from "./lib/timestamps";
import { buildBundle } from "./lib/bundle";
import { channels, collectEvents, dailyDigest, runAlerts } from "./lib/alerts";
import { tierFor } from "./lib/tier";
import { recordDatePosition } from "./lib/record-date";
import { hooks } from "./routes/hooks";
import { holders } from "./routes/holders";
import { forecasts } from "./routes/forecasts";
import { delegates } from "./routes/delegates";
import { getVenueHoldings, resolveHolder, VENUES_GENERATED_AT } from "./lib/venues";
import { and, eq } from "drizzle-orm";
import { erc20Abi, formatUnits, isAddress } from "viem";
import { publicClient } from "./chain/chain";
import { cached } from "./chain/cache";

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
  reports,
  hooks,
  holders,
  forecasts,
  delegates,
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

/** Holder Intent Reports and their timestamp proofs, as plain files anyone can fetch and verify. */
const frozen = async (key: string, part: "document" | "ots", filename: string) => {
  const row = await getTimestamp(key);
  if (!row) return json({ error: "not_stamped", detail: "Nothing is frozen under this key yet. Documents are frozen after the cutoff, when at least one intent was recorded." }, 404);
  if (part === "document") return new Response(row.document, { headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `inline; filename="${filename}.json"`, "cache-control": "public, max-age=300" } });
  if (!row.ots) return json({ error: "stamp_pending", detail: "The calendars could not be reached; the stamp is retried on the next read." }, 503);
  return new Response(new Uint8Array(Buffer.from(row.ots, "base64")), { headers: { "content-type": "application/vnd.opentimestamps.v1", "content-disposition": `attachment; filename="${filename}.json.ots"`, "cache-control": "public, max-age=300" } });
};
inner.get("/api/v1/reports/:ballotId", async (c) => {
  try {
    return json(await buildReport(c.req.param("ballotId")));
  } catch {
    return json({ error: "unknown_meeting" }, 404);
  }
});
inner.get("/api/v1/reports/:ballotId/document", (c) => frozen(`report:${c.req.param("ballotId")}`, "document", `redeem-report-${c.req.param("ballotId")}`));
inner.get("/api/v1/reports/:ballotId/proof.ots", (c) => frozen(`report:${c.req.param("ballotId")}`, "ots", `redeem-report-${c.req.param("ballotId")}`));
inner.get("/api/v1/attestations/:itemId/document", (c) => frozen(`attestation:${c.req.param("itemId")}`, "document", `redeem-attestation-${c.req.param("itemId")}`));
inner.get("/api/v1/attestations/:itemId/proof.ots", (c) => frozen(`attestation:${c.req.param("itemId")}`, "ots", `redeem-attestation-${c.req.param("itemId")}`));
inner.get("/api/v1/attestations", async () => {
  const rows = await db.select().from(schema.attestations);
  const out = [];
  for (const row of rows) {
    if (row.leafCount === 0) continue;
    const stamp = await getTimestamp(`attestation:${row.ballotItemId}`);
    out.push({ itemId: row.ballotItemId, ballotId: row.ballotId, symbol: row.symbol, merkleRoot: row.merkleRoot, leafCount: row.leafCount, blockNumber: row.blockNumber, attestedAt: Math.floor(row.createdAt.getTime() / 1000), digest: stamp?.digest ?? null, stamped: stamp?.status === "stamped" });
  }
  return json({ note: "Intent, not a shareholder vote.", attestations: out });
});

/** A wallet's holding on a past date (YYYY-MM-DD), rebuilt from Transfer logs; `coverage` says whether the scan reached that far. */
inner.get("/api/v1/positions/:wallet/at/:date/:symbol", async (c) => {
  const wallet = c.req.param("wallet");
  const date = c.req.param("date");
  if (!isAddress(wallet) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: "invalid_request" }, 400);
  const position = await recordDatePosition(wallet, c.req.param("symbol"), date).catch(() => null);
  return position ? json({ chainId: 4663, wallet, ...position }) : json({ error: "unknown_token" }, 404);
});

/** Machine-readable operations feed: chain, market cache, database counts, indexers, coverage. */
inner.get("/api/v1/ops/status.json", async () => json(await buildStatus()));

/** Weight for one wallet on one item: what it holds now, what it held on the record date, and what it signed. */
inner.get("/api/v1/weights/:itemId/:wallet", async (c) => {
  const wallet = c.req.param("wallet");
  const itemId = c.req.param("itemId");
  if (!isAddress(wallet)) return json({ error: "invalid_address" }, 400);
  const [item] = await db.select().from(schema.ballotItems).where(eq(schema.ballotItems.id, itemId)).limit(1);
  if (!item) return json({ error: "unknown_item" }, 404);
  const [ballot] = await db.select().from(schema.ballots).where(eq(schema.ballots.id, item.ballotId)).limit(1);
  const [market, balances, signed] = await Promise.all([
    getMarket(),
    getBalances(wallet),
    db.select().from(schema.instructions).where(and(eq(schema.instructions.ballotItemId, itemId), eq(schema.instructions.wallet, wallet.toLowerCase()), eq(schema.instructions.status, "active"))).limit(1),
  ]);
  const asset = market.value.assets.find((entry) => entry.symbol === item.symbol);
  const raw = BigInt(balances.value.find((entry) => entry.symbol === item.symbol)?.rawBalance ?? "0");
  const multiplier = BigInt(asset?.uiMultiplier ?? "1000000000000000000");
  const atRecordDate = ballot?.recordDate ? await recordDatePosition(wallet, item.symbol, ballot.recordDate).catch(() => null) : null;
  return json({
    chainId: 4663,
    itemId,
    wallet,
    symbol: item.symbol,
    block: market.value.blockNumber,
    current: { rawBalance: raw.toString(), uiMultiplier: multiplier.toString(), shareEquivalent: shareEquivalentWad(raw, multiplier).toString() },
    recordDate: atRecordDate ? { date: atRecordDate.recordDate, block: atRecordDate.block, shareEquivalent: atRecordDate.shareEquivalent, coverage: atRecordDate.coverage } : null,
    signed: signed[0] ? { shareEquivalent: signed[0].shareEquivalent, countedWeight: signed[0].closeWeight, block: signed[0].blockNumber } : null,
    rule: "Counted weight is the smaller of the signed share-equivalent and the share-equivalent held at cutoff.",
  });
});

/** Top holders of one token (snapshot), and a wallet's ranks. */
inner.get("/api/v1/holders/:symbol", async (c) => json(await holders.top.callable({ context: { headers: new Headers() } })({ symbol: c.req.param("symbol") })));
inner.get("/api/v1/holders/rank/:wallet", async (c) => {
  const wallet = c.req.param("wallet");
  if (!isAddress(wallet)) return json({ error: "invalid_address" }, 400);
  return json(await holders.ranks.callable({ context: { headers: new Headers() } })({ wallet }));
});

/** Forecasts: the crowd on one item, and the forecast record. Nothing staked, scored against Form 8-K. */
inner.get("/api/v1/forecasts/board", async () => json({ note: "Forecasts, not votes. Nothing is staked; resolution is the issuer's Form 8-K, Item 5.07.", ...(await forecasts.board.callable({ context: { headers: new Headers() } })()) }));
inner.get("/api/v1/forecasts/:itemId", async (c) => {
  try {
    return json({ note: "Forecasts, not votes. Nothing is staked; resolution is the issuer's Form 8-K, Item 5.07.", ...(await forecasts.item.callable({ context: { headers: new Headers() } })({ id: c.req.param("itemId") })) });
  } catch {
    return json({ error: "unknown_item" }, 404);
  }
});

/** Delegates: every named address ranked by the weight named to it, and one delegate in full. Weight, never money. */
inner.get("/api/v1/delegates", async () => json({ note: "Weight named on delegate intents. It confers no proxy authority and may not be bought, sold or compensated.", ...(await delegates.list.callable({ context: { headers: new Headers() } })()) }));
inner.get("/api/v1/delegates/:wallet", async (c) => {
  const wallet = c.req.param("wallet");
  if (!isAddress(wallet)) return json({ error: "invalid_address" }, 400);
  return json(await delegates.get.callable({ context: { headers: new Headers() } })({ wallet }));
});

/** The public redemption queue, in total or for one ticker (with every position and its signature). */
inner.get("/api/v1/queue", async () => json(await redemption.board.callable({ context: { headers: new Headers() } })({})));
inner.get("/api/v1/queue/:symbol", async (c) => json(await redemption.board.callable({ context: { headers: new Headers() } })({ symbol: c.req.param("symbol") })));

/** Look-through: which pools and vaults hold Stock Tokens, and one wallet's pro rata share of any contract. */
inner.get("/api/v1/venues", async (c) => {
  const symbol = c.req.query("symbol")?.toUpperCase();
  const holdings = await getVenueHoldings();
  const rows = symbol ? holdings.value.filter((holding) => holding.symbol === symbol) : holdings.value;
  return json({ chainId: 4663, registryGeneratedAt: VENUES_GENERATED_AT, ageMs: holdings.ageMs, note: "V3 positions are resolved to the pool, not yet to each provider.", venues: rows });
});
inner.get("/api/v1/resolve/:contract", async (c) => {
  const contract = c.req.param("contract");
  const wallet = c.req.query("wallet") ?? null;
  if (!isAddress(contract) || (wallet && !isAddress(wallet))) return json({ error: "invalid_address" }, 400);
  return json(await resolveHolder(contract, wallet as `0x${string}` | null));
});

/** What the alert channels would post for the last week, and which channels are configured. Sends nothing. */
inner.get("/api/v1/alerts/preview", async () => {
  const since = Math.floor(Date.now() / 1000) - 7 * 86_400;
  const [events, digest] = await Promise.all([collectEvents(since), dailyDigest().catch(() => null)]);
  return json({ channels: channels(), since, digest, events: events.slice(-25).reverse() });
});

/** The scheduled run. Requires CRON_SECRET as a bearer token (Vercel Cron sends it); `?digest=1` adds the daily line. */
inner.get("/api/cron/alerts", async (c) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || c.req.header("authorization") !== `Bearer ${secret}`) return json({ error: "unauthorized" }, 401);
  return json(await runAlerts({ digest: c.req.query("digest") === "1" }));
});

inner.get("/api/v1/token/tier/:wallet", async (c) => {
  const wallet = c.req.param("wallet");
  if (!isAddress(wallet)) return json({ error: "invalid_address" }, 400);
  return json(await tierFor(wallet));
});

/** Everything one wallet has signed, as a single self-verifying file. */
inner.get("/api/v1/wallets/:wallet/bundle", async (c) => {
  const wallet = c.req.param("wallet");
  if (!isAddress(wallet)) return json({ error: "invalid_address" }, 400);
  const bundle = await buildBundle(wallet);
  return new Response(JSON.stringify(bundle, null, 2), { headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `inline; filename="redeem-bundle-${wallet.toLowerCase()}.json"`, "cache-control": "no-store" } });
});

/** The official REDEEM token, read from its contract. Falls back to the last verified values if the RPC refuses. */
const REDEEM_TOKEN_ADDRESS = "0x3473cCcfD7c186aae98CbebBf8388251237D3896" as const;
inner.get("/api/v1/token", async () => {
  const known = { address: REDEEM_TOKEN_ADDRESS, chainId: 4663, name: "Redeem Inc", symbol: "REDEEM", decimals: 18, totalSupply: "1000000000000000000000000000" };
  try {
    const read = await cached("redeem-token", 300_000, async () => {
      const [name, symbol, decimals, totalSupply, block] = await Promise.all([
        publicClient.readContract({ address: REDEEM_TOKEN_ADDRESS, abi: erc20Abi, functionName: "name" }),
        publicClient.readContract({ address: REDEEM_TOKEN_ADDRESS, abi: erc20Abi, functionName: "symbol" }),
        publicClient.readContract({ address: REDEEM_TOKEN_ADDRESS, abi: erc20Abi, functionName: "decimals" }),
        publicClient.readContract({ address: REDEEM_TOKEN_ADDRESS, abi: erc20Abi, functionName: "totalSupply" }),
        publicClient.getBlockNumber(),
      ]);
      return { name, symbol, decimals, totalSupply: totalSupply.toString(), block: block.toString() };
    });
    return json({ ...known, ...read.value, verified: true, explorer: `https://robinhoodchain.blockscout.com/token/${REDEEM_TOKEN_ADDRESS}`, note: "The only official REDEEM address. It has no role in intent weight, queues or XP." });
  } catch {
    return json({ ...known, block: null, verified: false, explorer: `https://robinhoodchain.blockscout.com/token/${REDEEM_TOKEN_ADDRESS}`, note: "The only official REDEEM address. It has no role in intent weight, queues or XP." });
  }
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
