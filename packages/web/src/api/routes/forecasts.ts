import { randomUUID } from "node:crypto";
import { ORPCError } from "@orpc/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { TypedDataDefinition } from "viem";
import { z } from "zod";
import { base } from "../__core/app";
import { buildForecastTypedData, serializeTypedData } from "../ballots/typed-data";
import { ChallengeError, consumeChallenge, issueChallenge } from "../challenges";
import { findToken } from "../chain/tokens";
import { db } from "../database";
import * as schema from "../database/schema";
import { outcomeForItem } from "../lib/outcomes";
import { addressSchema, ballotStatus, nowSeconds } from "../lib/shared";

type BallotRow = typeof schema.ballots.$inferSelect;
type ItemRow = typeof schema.ballotItems.$inferSelect;
type ForecastRow = typeof schema.forecasts.$inferSelect;

/**
 * Forecasts. A position on how the vote will go, open to any wallet, holding or not. Nothing is
 * staked: the only thing a forecast can win is a line on the forecast record. It resolves against
 * the issuer's Form 8-K, Item 5.07, once that is on file, so the answer key is public and never
 * ours. A wallet gets one active forecast per item; the score is correct minus wrong, so spreading
 * both sides across wallets nets to nothing.
 */
export interface Side {
  value: string;
  label: string;
  tone: "for" | "against" | "neutral";
}

/** The sides that can carry on an item, in plain words. Abstain and delegate are not outcomes. */
export function sidesFor(item: Pick<ItemRow, "itemType" | "choices">): Side[] {
  const choices = JSON.parse(item.choices) as Array<{ value: string; label: string; tone: Side["tone"] }>;
  if (item.itemType === "say_on_frequency") {
    return choices.filter((choice) => /_years?$/.test(choice.value)).map((choice) => ({ value: choice.value, label: choice.label, tone: choice.tone }));
  }
  if (item.itemType === "election") {
    return [
      { value: "for", label: "Elected", tone: "for" },
      { value: "against", label: "Not elected", tone: "against" },
    ];
  }
  return [
    { value: "for", label: "Passes", tone: "for" },
    { value: "against", label: "Fails", tone: "against" },
  ];
}

/** Forecasts lock when intent does: three days ahead of the meeting. */
export const locksAt = (ballot: Pick<BallotRow, "closesAt">) => ballot.closesAt;

export function resolutionFor(ballot: Pick<BallotRow, "id">, item: Pick<ItemRow, "index" | "itemType" | "choices">) {
  const outcome = outcomeForItem(ballot.id, item.index);
  if (!outcome?.carried) return null;
  const side = sidesFor(item).find((entry) => entry.value === outcome.carried) ?? null;
  return { carried: outcome.carried, label: side?.label ?? outcome.carried, source: outcome.source, result: outcome.result };
}

async function loadItem(id: string): Promise<{ item: ItemRow; ballot: BallotRow }> {
  const [item] = await db.select().from(schema.ballotItems).where(eq(schema.ballotItems.id, id)).limit(1);
  if (!item) throw new ORPCError("NOT_FOUND", { message: "No such ballot item." });
  const [ballot] = await db.select().from(schema.ballots).where(eq(schema.ballots.id, item.ballotId)).limit(1);
  if (!ballot) throw new ORPCError("NOT_FOUND", { message: "No such ballot." });
  return { item, ballot };
}

async function activeForecasts(itemIds: string[]): Promise<ForecastRow[]> {
  if (itemIds.length === 0) return [];
  return db
    .select()
    .from(schema.forecasts)
    .where(and(inArray(schema.forecasts.ballotItemId, itemIds), eq(schema.forecasts.status, "active")))
    .orderBy(desc(schema.forecasts.createdAt));
}

export function crowd(sides: Side[], rows: ForecastRow[]) {
  const counts = new Map(sides.map((side) => [side.value, 0]));
  for (const row of rows) counts.set(row.prediction, (counts.get(row.prediction) ?? 0) + 1);
  const total = rows.length;
  const out = sides.map((side) => ({ ...side, count: counts.get(side.value) ?? 0, share: total ? Math.round(((counts.get(side.value) ?? 0) / total) * 1000) / 10 : 0 }));
  const leading = out.reduce<(typeof out)[number] | null>((best, side) => (side.count > 0 && (!best || side.count > best.count) ? side : best), null);
  return { sides: out, total, leading: leading ? { value: leading.value, label: leading.label, share: leading.share } : null };
}

interface ForecastPayload {
  ballotItemId: string;
  ballotId: string;
  symbol: string;
  prediction: string;
}

/** Every wallet's record, from every active forecast: resolved ones scored, open ones pending. */
export async function forecastRecords() {
  const rows = await db.select().from(schema.forecasts).where(eq(schema.forecasts.status, "active"));
  const itemIds = [...new Set(rows.map((row) => row.ballotItemId))];
  const items = itemIds.length ? await db.select().from(schema.ballotItems).where(inArray(schema.ballotItems.id, itemIds)) : [];
  const ballotIds = [...new Set(rows.map((row) => row.ballotId))];
  const ballots = ballotIds.length ? await db.select().from(schema.ballots).where(inArray(schema.ballots.id, ballotIds)) : [];
  const itemById = new Map(items.map((item) => [item.id, item]));
  const ballotById = new Map(ballots.map((ballot) => [ballot.id, ballot]));
  const records = new Map<string, { wallet: string; correct: number; wrong: number; pending: number; first: number }>();
  const scored = rows.map((row) => {
    const item = itemById.get(row.ballotItemId);
    const ballot = ballotById.get(row.ballotId);
    const resolution = item && ballot ? resolutionFor(ballot, item) : null;
    const state: "correct" | "wrong" | "pending" = resolution ? (resolution.carried === row.prediction ? "correct" : "wrong") : "pending";
    const at = Math.floor(row.createdAt.getTime() / 1000);
    const record = records.get(row.wallet) ?? { wallet: row.wallet, correct: 0, wrong: 0, pending: 0, first: at };
    record[state] += 1;
    record.first = Math.min(record.first, at);
    records.set(row.wallet, record);
    return { row, item, ballot, resolution, state };
  });
  const ranked = [...records.values()]
    .map((record) => ({ ...record, score: record.correct - record.wrong, resolved: record.correct + record.wrong, accuracy: record.correct + record.wrong ? Math.round((record.correct / (record.correct + record.wrong)) * 1000) / 10 : null }))
    .sort((a, b) => b.score - a.score || b.correct - a.correct || (b.accuracy ?? 0) - (a.accuracy ?? 0) || a.first - b.first);
  return { scored, ranked, itemById, ballotById };
}

export const forecasts = {
  /** The crowd on one item, and the caller's own forecast. */
  item: base.input(z.object({ id: z.string(), wallet: addressSchema.optional() })).handler(async ({ input }) => {
    const { item, ballot } = await loadItem(input.id);
    const rows = await activeForecasts([item.id]);
    const sides = sidesFor(item);
    const mine = input.wallet ? (rows.find((row) => row.wallet === input.wallet!.toLowerCase()) ?? null) : null;
    const resolution = resolutionFor(ballot, item);
    return {
      itemId: item.id,
      open: ballotStatus(ballot.closesAt) === "active",
      locksAt: locksAt(ballot),
      meetingDate: ballot.meetingDate,
      ...crowd(sides, rows),
      resolution,
      yours: mine ? { id: mine.id, prediction: mine.prediction, label: sides.find((side) => side.value === mine.prediction)?.label ?? mine.prediction, createdAt: mine.createdAt, state: resolution ? (resolution.carried === mine.prediction ? ("correct" as const) : ("wrong" as const)) : ("pending" as const) } : null,
    };
  }),

  /** Crowd summaries for every item of one ticker, keyed by item id, for desks and lists. */
  bySymbol: base.input(z.object({ symbol: z.string() })).handler(async ({ input }) => {
    const symbol = input.symbol.toUpperCase();
    const items = await db.select().from(schema.ballotItems).where(eq(schema.ballotItems.symbol, symbol));
    const rows = await activeForecasts(items.map((item) => item.id));
    const out: Record<string, { total: number; leading: { value: string; label: string; share: number } | null }> = {};
    for (const item of items) {
      const summary = crowd(sidesFor(item), rows.filter((row) => row.ballotItemId === item.id));
      out[item.id] = { total: summary.total, leading: summary.leading };
    }
    return out;
  }),

  /** Step one: the server writes the exact EIP-712 payload for the chosen side. */
  prepare: base.input(z.object({ wallet: addressSchema, itemId: z.string(), prediction: z.string() })).handler(async ({ input }) => {
    const { item, ballot } = await loadItem(input.itemId);
    if (ballotStatus(ballot.closesAt) !== "active") throw new ORPCError("BAD_REQUEST", { message: "Forecasts on this item have locked." });
    const side = sidesFor(item).find((entry) => entry.value === input.prediction);
    if (!side) throw new ORPCError("BAD_REQUEST", { message: "That is not a side this item can resolve to." });
    const token = findToken(item.symbol);
    const challenge = issueChallenge<ForecastPayload>(input.wallet, ({ nonce, issuedAt }) => ({
      typedData: buildForecastTypedData({
        ballotItemId: item.id,
        proposal: `${ballot.companyName} — Item ${item.index}: ${item.title}`,
        stock: token?.symbol ?? item.symbol,
        wallet: input.wallet,
        prediction: side.value,
        locksAt: new Date(locksAt(ballot) * 1000).toISOString(),
        issuedAt,
        nonce,
      }),
      payload: { ballotItemId: item.id, ballotId: ballot.id, symbol: item.symbol, prediction: side.value },
    }));
    return { challengeId: challenge.id, typedData: JSON.parse(serializeTypedData(challenge.typedData!)) as TypedDataDefinition };
  }),

  /** Step two: verify the signature against the issued payload and record the forecast. */
  commit: base.input(z.object({ challengeId: z.string(), signature: z.string() })).handler(async ({ input }) => {
    let challenge;
    try {
      challenge = await consumeChallenge<ForecastPayload>(input.challengeId, input.signature);
    } catch (error) {
      if (error instanceof ChallengeError) throw new ORPCError("BAD_REQUEST", { message: error.message });
      throw error;
    }
    const payload = challenge.payload;
    const wallet = challenge.wallet.toLowerCase();
    const { ballot } = await loadItem(payload.ballotItemId);
    if (ballotStatus(ballot.closesAt) !== "active") throw new ORPCError("BAD_REQUEST", { message: "Forecasts on this item locked while you were signing." });
    const [previous] = await db
      .select()
      .from(schema.forecasts)
      .where(and(eq(schema.forecasts.wallet, wallet), eq(schema.forecasts.ballotItemId, payload.ballotItemId), eq(schema.forecasts.status, "active")))
      .limit(1);
    const [row] = await db
      .insert(schema.forecasts)
      .values({ id: randomUUID(), ballotItemId: payload.ballotItemId, ballotId: payload.ballotId, symbol: payload.symbol, wallet, prediction: payload.prediction, typedData: serializeTypedData(challenge.typedData!), signature: input.signature, status: "active" })
      .returning();
    if (previous) await db.update(schema.forecasts).set({ status: "superseded" }).where(eq(schema.forecasts.id, previous.id));
    return { id: row?.id ?? "", superseded: previous?.id ?? null };
  }),

  /** The forecast record: who has called the most votes right, what is open, what just resolved. */
  board: base.handler(async () => {
    const { scored, ranked, itemById, ballotById } = await forecastRecords();
    const now = nowSeconds();
    const byItem = new Map<string, typeof scored>();
    for (const entry of scored) {
      const list = byItem.get(entry.row.ballotItemId) ?? [];
      list.push(entry);
      byItem.set(entry.row.ballotItemId, list);
    }
    const summarise = (itemId: string) => {
      const item = itemById.get(itemId)!;
      const ballot = ballotById.get(item.ballotId)!;
      const entries = byItem.get(itemId) ?? [];
      const summary = crowd(sidesFor(item), entries.map((entry) => entry.row));
      return { id: item.id, symbol: item.symbol, logo: findToken(item.symbol)?.logo ?? null, index: item.index, title: item.title, companyName: ballot.companyName, meetingDate: ballot.meetingDate, locksAt: locksAt(ballot), total: summary.total, sides: summary.sides, leading: summary.leading, resolution: resolutionFor(ballot, item) };
    };
    const open = [...byItem.keys()]
      .filter((itemId) => (ballotById.get(itemById.get(itemId)!.ballotId)?.closesAt ?? 0) > now)
      .map(summarise)
      .sort((a, b) => b.total - a.total || a.locksAt - b.locksAt)
      .slice(0, 12);
    const resolved = [...byItem.keys()]
      .map(summarise)
      .filter((entry) => entry.resolution)
      .sort((a, b) => b.meetingDate.localeCompare(a.meetingDate))
      .slice(0, 12)
      .map((entry) => ({ ...entry, crowdRight: entry.leading ? entry.leading.value === entry.resolution!.carried : null }));
    const judged = resolved.filter((entry) => entry.crowdRight !== null);
    return {
      forecasters: ranked.length,
      forecasts: scored.length,
      resolved: scored.filter((entry) => entry.state !== "pending").length,
      crowdAccuracy: judged.length ? Math.round((judged.filter((entry) => entry.crowdRight).length / judged.length) * 1000) / 10 : null,
      top: ranked.slice(0, 50),
      open,
      recentlyResolved: resolved,
    };
  }),

  /** One wallet's forecasts, newest first, each with its state. */
  wallet: base.input(z.object({ wallet: addressSchema })).handler(async ({ input }) => {
    const wallet = input.wallet.toLowerCase();
    const { scored, ranked } = await forecastRecords();
    const mine = scored.filter((entry) => entry.row.wallet === wallet).sort((a, b) => b.row.createdAt.getTime() - a.row.createdAt.getTime());
    const rank = ranked.findIndex((entry) => entry.wallet === wallet);
    const record = rank >= 0 ? ranked[rank]! : null;
    return {
      wallet,
      rank: rank >= 0 ? rank + 1 : null,
      of: ranked.length,
      record: record ? { score: record.score, correct: record.correct, wrong: record.wrong, pending: record.pending, accuracy: record.accuracy } : null,
      forecasts: mine.map((entry) => ({
        id: entry.row.id,
        itemId: entry.row.ballotItemId,
        symbol: entry.row.symbol,
        logo: findToken(entry.row.symbol)?.logo ?? null,
        index: entry.item?.index ?? "",
        title: entry.item?.title ?? "",
        meetingDate: entry.ballot?.meetingDate ?? null,
        prediction: entry.row.prediction,
        label: entry.item ? (sidesFor(entry.item).find((side) => side.value === entry.row.prediction)?.label ?? entry.row.prediction) : entry.row.prediction,
        state: entry.state,
        resolvedTo: entry.resolution?.label ?? null,
        createdAt: entry.row.createdAt,
      })),
    };
  }),
};
