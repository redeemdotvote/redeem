import { createHmac, randomBytes } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { eq, gt } from "drizzle-orm";
import { getMarket } from "../chain/market";
import { db } from "../database";
import * as schema from "../database/schema";
import { loadCorporateActions } from "../routes/portfolio";
import { loadRecordIndex } from "./records";

/**
 * Alerts: what changed on the record since the last run, delivered to whichever channels are
 * configured. Telegram needs TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID. X needs X_API_KEY,
 * X_API_SECRET, X_ACCESS_TOKEN and X_ACCESS_SECRET. Holder webhooks need nothing. With no channel
 * configured a run still advances nothing and sends nothing; the preview shows what would go out.
 */
const CURSOR = "alerts:cursor";
const SITE = process.env.PUBLIC_SITE_URL ?? "https://www.redeem.vote";
const MAX_PER_RUN = 12;

export interface AlertEvent {
  id: string;
  type: "multiplier" | "proxy_items" | "attestation" | "digest";
  at: number;
  symbol: string | null;
  text: string;
  url: string;
  data: Record<string, unknown>;
}

export function channels() {
  return {
    telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
    x: Boolean(process.env.X_API_KEY && process.env.X_API_SECRET && process.env.X_ACCESS_TOKEN && process.env.X_ACCESS_SECRET),
  };
}

export async function collectEvents(since: number): Promise<AlertEvent[]> {
  const [history, ballots, attestations] = await Promise.all([
    loadCorporateActions().catch(() => ({ actions: [], stale: true })),
    db.select().from(schema.ballots).where(gt(schema.ballots.publishedAt, since)),
    db.select().from(schema.attestations),
  ]);
  const events: AlertEvent[] = [];
  for (const action of history.actions) {
    if (action.effectiveAt <= since) continue;
    const pct = (action.changeBps / 100).toFixed(3);
    events.push({ id: `action:${action.txHash}:${action.logIndex}`, type: "multiplier", at: action.effectiveAt, symbol: action.symbol, text: `${action.symbol} multiplier ${action.changeBps >= 0 ? "+" : ""}${pct}% on Robinhood Chain. Token balances do not change; share-equivalents do.`, url: `${SITE}/record/${action.symbol}`, data: { symbol: action.symbol, oldMultiplier: action.oldMultiplier, newMultiplier: action.newMultiplier, changeBps: action.changeBps, txHash: action.txHash } });
  }
  for (const ballot of ballots) {
    events.push({ id: `ballot:${ballot.id}`, type: "proxy_items", at: ballot.publishedAt, symbol: ballot.symbol, text: `New proxy items on file for ${ballot.symbol} (${ballot.companyName}, meeting ${ballot.meetingDate}). Token holders can record intent until the cutoff. Intent, not a vote.`, url: `${SITE}/reports/${ballot.id}`, data: { ballotId: ballot.id, symbol: ballot.symbol, meetingDate: ballot.meetingDate, closesAt: ballot.closesAt, docUrl: ballot.docUrl } });
  }
  const seenBallots = new Set<string>();
  for (const row of attestations) {
    const at = Math.floor(row.createdAt.getTime() / 1000);
    if (at <= since || row.leafCount === 0 || seenBallots.has(row.ballotId)) continue;
    seenBallots.add(row.ballotId);
    events.push({ id: `report:${row.ballotId}`, type: "attestation", at, symbol: row.symbol, text: `Final Holder Intent Report for ${row.symbol}: what token holders said they would want, attested and timestamped into Bitcoin. Intent, not a vote.`, url: `${SITE}/reports/${row.ballotId}`, data: { ballotId: row.ballotId, symbol: row.symbol, merkleRoot: row.merkleRoot } });
  }
  return events.sort((a, b) => a.at - b.at);
}

export async function dailyDigest(): Promise<AlertEvent> {
  const [market, index] = await Promise.all([getMarket(), loadRecordIndex().catch(() => null)]);
  const shareEq = market.value.assets.reduce((sum, asset) => sum + asset.totalSupplyUIFloat, 0);
  const value = market.value.assets.reduce((sum, asset) => sum + (asset.marketValueUsd ?? 0), 0);
  const wallets = index?.wallets.size ?? 0;
  const left = Math.max(0, 100 - wallets);
  const compact = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : n.toFixed(0));
  const text = `Block ${Number(market.value.blockNumber).toLocaleString("en-US")} recorded. ${compact(shareEq)} share-equivalents across ${market.value.assets.length} Stock Tokens, $${compact(value)} by Chainlink. ${wallets} ${wallets === 1 ? "wallet" : "wallets"} on file${left > 0 ? `, ${left} founding numbers left` : ""}.`;
  return { id: `digest:${new Date().toISOString().slice(0, 10)}`, type: "digest", at: Math.floor(Date.now() / 1000), symbol: null, text, url: `${SITE}/genesis`, data: { block: market.value.blockNumber, shareEq, valueUsd: value, wallets } };
}

/* ------------------------------------------------------------------ channels */

async function sendTelegram(event: AlertEvent) {
  const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text: `${event.text}\n${event.url}`, disable_web_page_preview: false }), signal: AbortSignal.timeout(8000) });
  return response.ok;
}

const enc = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`);
async function sendX(event: AlertEvent) {
  const url = "https://api.x.com/2/tweets";
  const oauth: Record<string, string> = { oauth_consumer_key: process.env.X_API_KEY!, oauth_nonce: randomBytes(16).toString("hex"), oauth_signature_method: "HMAC-SHA1", oauth_timestamp: String(Math.floor(Date.now() / 1000)), oauth_token: process.env.X_ACCESS_TOKEN!, oauth_version: "1.0" };
  const base = ["POST", enc(url), enc(Object.keys(oauth).sort().map((key) => `${enc(key)}=${enc(oauth[key]!)}`).join("&"))].join("&");
  oauth.oauth_signature = createHmac("sha1", `${enc(process.env.X_API_SECRET!)}&${enc(process.env.X_ACCESS_SECRET!)}`).update(base).digest("base64");
  const header = `OAuth ${Object.keys(oauth).sort().map((key) => `${enc(key)}="${enc(oauth[key]!)}"`).join(", ")}`;
  const response = await fetch(url, { method: "POST", headers: { authorization: header, "content-type": "application/json" }, body: JSON.stringify({ text: `${event.text} ${event.url}`.slice(0, 280) }), signal: AbortSignal.timeout(8000) });
  return response.ok;
}

/** Webhook targets must be public https hosts: no IP literals, no local names, no private ranges. */
export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("That is not a valid URL.");
  }
  if (url.protocol !== "https:") throw new Error("Webhook URLs must use https.");
  if (url.username || url.password) throw new Error("Webhook URLs cannot carry credentials.");
  const host = url.hostname.toLowerCase();
  if (isIP(host) || host === "localhost" || /\.(local|internal|localhost|lan|home|corp)$/.test(host) || !host.includes(".")) throw new Error("Webhook URLs must point at a public hostname.");
  const addresses = await lookup(host, { all: true }).catch(() => []);
  if (addresses.length === 0) throw new Error("That hostname does not resolve.");
  for (const { address } of addresses) {
    if (/^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(address) || /^(::1|fc|fd|fe80|::ffff:)/i.test(address)) throw new Error("Webhook URLs must resolve to a public address.");
  }
  return url;
}

async function deliverWebhooks(event: AlertEvent) {
  const hooks = await db.select().from(schema.webhooks).where(eq(schema.webhooks.active, true));
  let delivered = 0;
  for (const hook of hooks) {
    const body = JSON.stringify({ id: event.id, type: event.type, at: event.at, symbol: event.symbol, text: event.text, url: event.url, data: event.data });
    let ok = false;
    try {
      await assertPublicUrl(hook.url);
      const response = await fetch(hook.url, { method: "POST", redirect: "manual", headers: { "content-type": "application/json", "user-agent": "redeem-webhooks/1", "x-redeem-event": event.type, "x-redeem-signature": `sha256=${createHmac("sha256", hook.secret).update(body).digest("hex")}` }, body, signal: AbortSignal.timeout(5000) });
      ok = response.status >= 200 && response.status < 300;
    } catch {
      ok = false;
    }
    const failures = ok ? 0 : hook.failures + 1;
    await db.update(schema.webhooks).set({ failures, active: failures < 10, lastStatus: ok ? "ok" : "failed", lastDeliveredAt: new Date() }).where(eq(schema.webhooks.id, hook.id));
    if (ok) delivered += 1;
  }
  return delivered;
}

/* ------------------------------------------------------------------ the run */

async function readCursor(): Promise<number | null> {
  const [row] = await db.select().from(schema.indexerCursors).where(eq(schema.indexerCursors.key, CURSOR)).limit(1);
  return row ? row.lastBlock : null;
}
async function writeCursor(at: number, detail: string) {
  const values = { key: CURSOR, lastBlock: at, status: "ok", detail, updatedAt: new Date() };
  await db.insert(schema.indexerCursors).values(values).onConflictDoUpdate({ target: schema.indexerCursors.key, set: { lastBlock: at, detail, updatedAt: values.updatedAt } });
}

export async function runAlerts(options: { digest?: boolean } = {}) {
  const now = Math.floor(Date.now() / 1000);
  let since = await readCursor();
  // The first run starts the clock rather than replaying history into every channel.
  if (since === null) {
    await writeCursor(now, "initialised");
    since = now;
  }
  const events = (await collectEvents(since)).slice(0, MAX_PER_RUN);
  if (options.digest) events.push(await dailyDigest());
  const active = channels();
  const result = { since, events: events.length, telegram: 0, x: 0, webhooks: 0, channels: active };
  for (const event of events) {
    if (active.telegram && (await sendTelegram(event).catch(() => false))) result.telegram += 1;
    if (active.x && (await sendX(event).catch(() => false))) result.x += 1;
    if (event.type !== "digest") result.webhooks += await deliverWebhooks(event);
  }
  const real = events.filter((event) => event.type !== "digest");
  const last = real[real.length - 1];
  if (last) await writeCursor(last.at, `${events.length} events`);
  return result;
}
