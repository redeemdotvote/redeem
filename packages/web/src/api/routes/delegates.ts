import { createHash } from "node:crypto";
import { ORPCError } from "@orpc/server";
import { eq, gt, inArray, sql } from "drizzle-orm";
import { formatUnits, verifyMessage, type Address, type Hex } from "viem";
import { z } from "zod";
import { base } from "../__core/app";
import { getMarket } from "../chain/market";
import { findToken } from "../chain/tokens";
import { db } from "../database";
import * as schema from "../database/schema";
import { addressSchema, nowSeconds } from "../lib/shared";
import { countedWeight } from "./intents";

/**
 * Delegates. A holder who signs a delegate intent names an address; this module gives that
 * address a name, a statement and a public tally of the weight named to it. Weight is computed
 * from receipts on every read: per ticker, the largest single-item sum of counted weight naming
 * the delegate (a holder names the same weight on each item of a meeting, so items are not added
 * together). It moves when receipts move and it is never money. A delegate intent confers no
 * proxy authority, and Redeem carries no way to pay for one.
 */
const ZERO = "0x0000000000000000000000000000000000000000";
const FRESH_SECONDS = 600;
const NAME = /^[A-Za-z0-9][A-Za-z0-9 ._-]{1,31}$/;
const f18 = (value: bigint) => Number(formatUnits(value, 18));

export function delegateMessage(wallet: string, name: string, statement: string, link: string, issuedAt: number) {
  const digest = createHash("sha256").update(statement).digest("hex");
  return `Redeem delegates\nwallet: ${wallet.toLowerCase()}\nname: ${name}\nstatement sha256: ${digest}\nlink: ${link || "none"}\nissued: ${issuedAt}\n\nA delegate profile is a name for an address holders may name on a delegate intent. It confers no proxy authority, carries no vote, and may not be bought, sold or compensated.`;
}

interface Named {
  delegate: string;
  wallet: string;
  symbol: string;
  itemId: string;
  ballotId: string;
  weight: bigint;
  open: boolean;
}

/** Every active delegate intent, with the weight that counts and whether its meeting is still open. */
async function namedWeights(): Promise<Named[]> {
  const rows = await db.select().from(schema.instructions).where(sql`${schema.instructions.status} = 'active' and ${schema.instructions.choice} = 'delegate' and ${schema.instructions.delegate} != ${ZERO}`);
  if (rows.length === 0) return [];
  const ballotIds = [...new Set(rows.map((row) => row.ballotId))];
  const ballots = await db.select({ id: schema.ballots.id, closesAt: schema.ballots.closesAt }).from(schema.ballots).where(inArray(schema.ballots.id, ballotIds));
  const now = nowSeconds();
  const openBy = new Map(ballots.map((ballot) => [ballot.id, ballot.closesAt > now]));
  return rows.map((row) => ({ delegate: row.delegate.toLowerCase(), wallet: row.wallet.toLowerCase(), symbol: row.symbol, itemId: row.ballotItemId, ballotId: row.ballotId, weight: countedWeight(row), open: openBy.get(row.ballotId) ?? false }));
}

interface Standing {
  wallet: string;
  perSymbol: Array<{ symbol: string; logo: string | null; shareEq: number; valueUsd: number | null; backers: number; items: number; open: boolean }>;
  backers: number;
  items: number;
  shareEq: number;
  valueUsd: number | null;
}

/** Fold named weights into one standing per delegate address, priced where a Chainlink feed exists. */
async function standings(): Promise<Map<string, Standing>> {
  const [named, market] = await Promise.all([namedWeights(), getMarket().catch(() => null)]);
  const priceBy = new Map((market?.value.assets ?? []).map((asset) => [asset.symbol, asset.priceUsd]));
  const out = new Map<string, Standing>();
  const grouped = new Map<string, Named[]>();
  for (const entry of named) {
    const list = grouped.get(entry.delegate) ?? [];
    list.push(entry);
    grouped.set(entry.delegate, list);
  }
  for (const [delegate, entries] of grouped) {
    const perSymbol: Standing["perSymbol"] = [];
    const symbols = [...new Set(entries.map((entry) => entry.symbol))];
    for (const symbol of symbols) {
      const mine = entries.filter((entry) => entry.symbol === symbol);
      // One item's sum per ticker: the largest, so a wallet naming the delegate on five items of one meeting counts once.
      const byItem = new Map<string, bigint>();
      for (const entry of mine) byItem.set(entry.itemId, (byItem.get(entry.itemId) ?? 0n) + entry.weight);
      let best = 0n;
      for (const weight of byItem.values()) if (weight > best) best = weight;
      const shareEq = f18(best);
      const price = priceBy.get(symbol) ?? null;
      perSymbol.push({ symbol, logo: findToken(symbol)?.logo ?? null, shareEq, valueUsd: price === null ? null : shareEq * price, backers: new Set(mine.map((entry) => entry.wallet)).size, items: byItem.size, open: mine.some((entry) => entry.open) });
    }
    perSymbol.sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0) || b.shareEq - a.shareEq);
    const priced = perSymbol.filter((row) => row.valueUsd !== null);
    out.set(delegate, {
      wallet: delegate,
      perSymbol,
      backers: new Set(entries.map((entry) => entry.wallet)).size,
      items: new Set(entries.map((entry) => entry.itemId)).size,
      shareEq: perSymbol.reduce((sum, row) => sum + row.shareEq, 0),
      valueUsd: priced.length ? priced.reduce((sum, row) => sum + (row.valueUsd ?? 0), 0) : null,
    });
  }
  return out;
}

function publicProfile(row: typeof schema.delegates.$inferSelect | undefined) {
  return row ? { name: row.name, statement: row.statement, link: row.link, registeredAt: row.createdAt, updatedAt: row.updatedAt } : null;
}

export const delegates = {
  /** Every delegate with a profile or with weight named to it, ranked by the value of that weight. */
  list: base.handler(async () => {
    const [profiles, weights] = await Promise.all([db.select().from(schema.delegates), standings()]);
    const profileBy = new Map(profiles.map((row) => [row.wallet, row]));
    const wallets = new Set([...profileBy.keys(), ...weights.keys()]);
    const rows = [...wallets].map((wallet) => {
      const standing = weights.get(wallet);
      return {
        wallet,
        profile: publicProfile(profileBy.get(wallet)),
        backers: standing?.backers ?? 0,
        items: standing?.items ?? 0,
        shareEq: standing?.shareEq ?? 0,
        valueUsd: standing?.valueUsd ?? null,
        tickers: (standing?.perSymbol ?? []).map((row) => row.symbol),
      };
    });
    rows.sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0) || b.shareEq - a.shareEq || b.backers - a.backers || (a.profile ? 0 : 1) - (b.profile ? 0 : 1));
    return {
      registered: profiles.length,
      named: weights.size,
      backers: new Set([...weights.values()].flatMap((standing) => standing.perSymbol.map(() => standing.wallet))).size,
      valueUsd: [...weights.values()].reduce((sum, standing) => sum + (standing.valueUsd ?? 0), 0),
      rows,
    };
  }),

  /** One delegate: profile, weight per ticker, who named them, and the open items where they can still be named. */
  get: base.input(z.object({ wallet: addressSchema })).handler(async ({ input }) => {
    const wallet = input.wallet.toLowerCase();
    const [[profile], weights, named] = await Promise.all([db.select().from(schema.delegates).where(eq(schema.delegates.wallet, wallet)).limit(1), standings(), namedWeights()]);
    const standing = weights.get(wallet) ?? null;
    const mine = named.filter((entry) => entry.delegate === wallet);
    const itemIds = [...new Set(mine.map((entry) => entry.itemId))];
    const items = itemIds.length ? await db.select().from(schema.ballotItems).where(inArray(schema.ballotItems.id, itemIds)) : [];
    const itemBy = new Map(items.map((item) => [item.id, item]));
    const now = nowSeconds();
    const openBallots = await db.select().from(schema.ballots).where(gt(schema.ballots.closesAt, now));
    const openItems = openBallots.length ? await db.select().from(schema.ballotItems).where(inArray(schema.ballotItems.ballotId, openBallots.map((ballot) => ballot.id))) : [];
    const ballotBy = new Map(openBallots.map((ballot) => [ballot.id, ballot]));
    const backers = new Map<string, { wallet: string; symbols: Set<string>; shareEq: number }>();
    for (const entry of mine) {
      const backer = backers.get(entry.wallet) ?? { wallet: entry.wallet, symbols: new Set<string>(), shareEq: 0 };
      if (!backer.symbols.has(entry.symbol)) backer.shareEq += f18(entry.weight);
      backer.symbols.add(entry.symbol);
      backers.set(entry.wallet, backer);
    }
    const ranked = [...weights.values()].sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0) || b.shareEq - a.shareEq);
    const rank = ranked.findIndex((entry) => entry.wallet === wallet);
    return {
      wallet,
      profile: publicProfile(profile),
      rank: rank >= 0 ? rank + 1 : null,
      of: ranked.length,
      standing: standing ? { backers: standing.backers, items: standing.items, shareEq: standing.shareEq, valueUsd: standing.valueUsd, perSymbol: standing.perSymbol } : null,
      backers: [...backers.values()].sort((a, b) => b.shareEq - a.shareEq).slice(0, 50).map((backer) => ({ wallet: backer.wallet, symbols: [...backer.symbols], shareEq: backer.shareEq })),
      namedOn: itemIds
        .map((itemId) => {
          const item = itemBy.get(itemId);
          const entries = mine.filter((entry) => entry.itemId === itemId);
          return item ? { id: item.id, symbol: item.symbol, index: item.index, title: item.title, backers: new Set(entries.map((entry) => entry.wallet)).size, shareEq: f18(entries.reduce((sum, entry) => sum + entry.weight, 0n)), open: entries[0]?.open ?? false } : null;
        })
        .filter((row): row is NonNullable<typeof row> => row !== null)
        .sort((a, b) => Number(b.open) - Number(a.open) || b.shareEq - a.shareEq),
      /** Every open item on the record, so a visitor can name this delegate on the ones they hold. */
      openItems: openItems
        .map((item) => ({ id: item.id, symbol: item.symbol, logo: findToken(item.symbol)?.logo ?? null, index: item.index, title: item.title, closesAt: ballotBy.get(item.ballotId)?.closesAt ?? 0, companyName: ballotBy.get(item.ballotId)?.companyName ?? item.symbol }))
        .sort((a, b) => a.closesAt - b.closesAt || a.symbol.localeCompare(b.symbol) || a.index.localeCompare(b.index)),
    };
  }),

  /** Register or update a profile. The wallet signs the exact text, which names what a profile is and is not. */
  register: base
    .input(z.object({ wallet: addressSchema, name: z.string().trim().min(2).max(32), statement: z.string().trim().min(20).max(600), link: z.string().trim().max(200).optional(), issuedAt: z.number().int(), signature: z.string() }))
    .handler(async ({ input }) => {
      if (!NAME.test(input.name)) throw new ORPCError("BAD_REQUEST", { message: "Names are 2 to 32 characters: letters, numbers, spaces, dots, dashes." });
      if (/robinhood|redeem team|official/i.test(input.name)) throw new ORPCError("BAD_REQUEST", { message: "That name would imply an affiliation the record cannot verify." });
      const link = input.link ?? "";
      if (link) {
        let url: URL;
        try {
          url = new URL(link);
        } catch {
          throw new ORPCError("BAD_REQUEST", { message: "The link is not a valid URL." });
        }
        if (url.protocol !== "https:") throw new ORPCError("BAD_REQUEST", { message: "Links must use https." });
      }
      if (Math.abs(nowSeconds() - input.issuedAt) > FRESH_SECONDS) throw new ORPCError("BAD_REQUEST", { message: "That signature has expired. Sign again." });
      const message = delegateMessage(input.wallet, input.name, input.statement, link, input.issuedAt);
      const ok = await verifyMessage({ address: input.wallet as Address, message, signature: input.signature as Hex }).catch(() => false);
      if (!ok) throw new ORPCError("UNAUTHORIZED", { message: "The signature does not match this wallet." });
      const wallet = input.wallet.toLowerCase();
      const taken = await db.select({ wallet: schema.delegates.wallet }).from(schema.delegates).where(sql`lower(${schema.delegates.name}) = ${input.name.toLowerCase()}`).limit(1);
      if (taken[0] && taken[0].wallet !== wallet) throw new ORPCError("CONFLICT", { message: "That name is already registered to another address." });
      const now = new Date();
      await db
        .insert(schema.delegates)
        .values({ wallet, name: input.name, statement: input.statement, link: link || null, signature: input.signature, createdAt: now, updatedAt: now })
        .onConflictDoUpdate({ target: schema.delegates.wallet, set: { name: input.name, statement: input.statement, link: link || null, signature: input.signature, updatedAt: now } });
      return { wallet, name: input.name };
    }),

  /** Names for a set of addresses, so receipts and pickers can show who was named. */
  names: base.input(z.object({ wallets: z.array(z.string()).max(100) })).handler(async ({ input }) => {
    const lower = [...new Set(input.wallets.map((wallet) => wallet.toLowerCase()))];
    if (lower.length === 0) return {};
    const rows = await db.select({ wallet: schema.delegates.wallet, name: schema.delegates.name }).from(schema.delegates).where(inArray(schema.delegates.wallet, lower));
    return Object.fromEntries(rows.map((row) => [row.wallet, row.name]));
  }),
};
