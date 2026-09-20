import { ORPCError } from "@orpc/server";
import { eq, inArray } from "drizzle-orm";
import { formatUnits } from "viem";
import { z } from "zod";
import { base } from "../__core/app";
import { getMarket } from "../chain/market";
import { findToken } from "../chain/tokens";
import { db } from "../database";
import * as schema from "../database/schema";
import { ballotStatus } from "../lib/shared";
import { canonicalJson, ensureTimestamp, getTimestamp, publicTimestamp } from "../lib/timestamps";
import { activeInstructions, attestItem, countedWeight, publicBallot, stampAttestation, tallyFor } from "./intents";

/**
 * The Holder Intent Report: one document per stockholder meeting, saying what the holders of that
 * company's Stock Token recorded on each proxy item, next to what the board recommended. While the
 * meeting's cutoff is ahead the report is live and provisional. Once it has passed, every item with
 * receipts is attested, the report is frozen as canonical JSON and stamped with OpenTimestamps.
 *
 * It reports; it does not ask anyone to vote, grant a proxy, or do anything at the meeting.
 */
const f18 = (value: bigint) => Number(formatUnits(value, 18));

type Alignment = "with_board" | "against_board" | "split" | "no_recommendation" | "no_intent";

function alignment(recommendation: string, leading: string | null): Alignment {
  if (!leading) return "no_intent";
  if (!recommendation || recommendation === "none") return "no_recommendation";
  if (leading === recommendation) return "with_board";
  if (leading === "abstain" || leading === "delegate") return "split";
  return "against_board";
}

export async function buildReport(ballotId: string) {
  const [ballot] = await db.select().from(schema.ballots).where(eq(schema.ballots.id, ballotId)).limit(1);
  if (!ballot) throw new ORPCError("NOT_FOUND", { message: "No such meeting on file." });
  const items = (await db.select().from(schema.ballotItems).where(eq(schema.ballotItems.ballotId, ballot.id))).sort((a, b) => a.ordinal - b.ordinal);
  const rows = await activeInstructions(items.map((item) => item.id));
  const closed = ballotStatus(ballot.closesAt) === "closed";
  const token = findToken(ballot.symbol);

  // After the cutoff, every item that has receipts is attested (idempotent) and its attestation stamped.
  const attestations = new Map<string, Awaited<ReturnType<typeof attestItem>>>();
  if (closed) {
    const withReceipts = new Set(rows.map((row) => row.ballotItemId));
    for (const item of items) {
      if (!withReceipts.has(item.id)) continue;
      const attestation = await attestItem(item, ballot).catch(() => null);
      if (attestation) {
        attestations.set(item.id, attestation);
        await stampAttestation(item, attestation).catch(() => null);
      }
    }
  }
  const existing = items.length ? await db.select().from(schema.attestations).where(inArray(schema.attestations.ballotItemId, items.map((item) => item.id))) : [];
  for (const row of existing) if (!attestations.has(row.ballotItemId)) attestations.set(row.ballotItemId, row);
  // Re-read receipts after attestation so the close weights are the ones reported.
  const finalRows = closed && attestations.size ? await activeInstructions(items.map((item) => item.id)) : rows;

  const perWallet = new Map<string, bigint>();
  for (const row of finalRows) {
    const weight = countedWeight(row);
    if (weight > (perWallet.get(row.wallet) ?? 0n)) perWallet.set(row.wallet, weight);
  }
  let recorded = 0n;
  for (const weight of perWallet.values()) recorded += weight;
  const circulating = await getMarket()
    .then((market) => market.value.assets.find((asset) => asset.symbol === ballot.symbol)?.totalSupplyUIFloat ?? null)
    .catch(() => null);

  const reportItems = await Promise.all(
    items.map(async (item) => {
      const attestation = attestations.get(item.id) ?? null;
      const tally = attestation ? (JSON.parse(attestation.tally) as ReturnType<typeof tallyFor>) : tallyFor(item, finalRows.filter((row) => row.ballotItemId === item.id));
      const stamp = attestation ? await getTimestamp(`attestation:${item.id}`) : null;
      return {
        id: item.id,
        index: item.index,
        title: item.title,
        itemType: item.itemType,
        proponent: item.proponent,
        boardRecommendation: item.boardRecommendation,
        leading: tally.leading,
        leadingLabel: tally.rows.find((row) => row.value === tally.leading)?.label ?? null,
        alignment: alignment(item.boardRecommendation, tally.leading),
        tally,
        merkleRoot: attestation?.merkleRoot ?? null,
        leafCount: attestation?.leafCount ?? tally.wallets,
        timestamp: publicTimestamp(stamp),
      };
    }),
  );

  const withIntent = reportItems.filter((item) => item.alignment !== "no_intent");
  const summary = {
    wallets: perWallet.size,
    shareEq: f18(recorded),
    shareEqWad: recorded.toString(),
    circulatingShareEq: circulating,
    shareOfCirculating: circulating ? (f18(recorded) / circulating) * 100 : null,
    itemsWithIntent: withIntent.length,
    withBoard: withIntent.filter((item) => item.alignment === "with_board").length,
    againstBoard: withIntent.filter((item) => item.alignment === "against_board").length,
  };

  // Freeze and stamp the whole report once, after the cutoff, if anything was recorded.
  let timestamp = await getTimestamp(`report:${ballot.id}`);
  if (closed && perWallet.size > 0 && (!timestamp || timestamp.status !== "stamped")) {
    const document = canonicalJson({
      type: "redeem.holder-intent-report",
      version: 1,
      note: "Intent of Robinhood Stock Token holders. Not a shareholder vote and not a proxy solicitation.",
      ballot: { id: ballot.id, symbol: ballot.symbol, companyName: ballot.companyName, form: ballot.form, accession: ballot.accession, filedAt: ballot.filedAt, meetingType: ballot.meetingType, meetingDate: ballot.meetingDate, recordDate: ballot.recordDate, closesAt: ballot.closesAt },
      summary: { wallets: summary.wallets, shareEqWad: summary.shareEqWad, itemsWithIntent: summary.itemsWithIntent, withBoard: summary.withBoard, againstBoard: summary.againstBoard },
      items: reportItems.map((item) => ({
        id: item.id,
        index: item.index,
        title: item.title,
        boardRecommendation: item.boardRecommendation,
        leading: item.leading,
        alignment: item.alignment,
        tally: { rows: item.tally.rows.map((row) => ({ value: row.value, weight: row.weight, wallets: row.wallets })), totalWeight: item.tally.totalWeight, wallets: item.tally.wallets },
        merkleRoot: item.merkleRoot,
        leafCount: item.leafCount,
        attestationDigest: item.timestamp?.digest ?? null,
      })),
    });
    timestamp = await ensureTimestamp(`report:${ballot.id}`, "report", document).catch(() => timestamp);
  }

  return {
    ballot: publicBallot(ballot),
    token: token ? { symbol: token.symbol, name: token.name, logo: token.logo, address: token.address } : null,
    state: closed ? (perWallet.size > 0 ? ("final" as const) : ("closed_empty" as const)) : ("provisional" as const),
    summary,
    items: reportItems,
    timestamp: publicTimestamp(timestamp),
  };
}

export const reports = {
  /** Meetings with a report worth opening: every open one, and every closed one where something was recorded. */
  list: base.handler(async () => {
    const [ballots, instructions, items] = await Promise.all([
      db.select().from(schema.ballots),
      db.select({ ballotId: schema.instructions.ballotId, wallet: schema.instructions.wallet }).from(schema.instructions).where(eq(schema.instructions.status, "active")),
      db.select({ ballotId: schema.ballotItems.ballotId }).from(schema.ballotItems),
    ]);
    const wallets = new Map<string, Set<string>>();
    for (const row of instructions) {
      const set = wallets.get(row.ballotId) ?? new Set<string>();
      set.add(row.wallet);
      wallets.set(row.ballotId, set);
    }
    const itemCount = new Map<string, number>();
    for (const row of items) itemCount.set(row.ballotId, (itemCount.get(row.ballotId) ?? 0) + 1);
    return ballots
      .map((ballot) => ({ ...publicBallot(ballot), wallets: wallets.get(ballot.id)?.size ?? 0, items: itemCount.get(ballot.id) ?? 0, logo: findToken(ballot.symbol)?.logo ?? null, name: findToken(ballot.symbol)?.name ?? ballot.companyName }))
      .filter((ballot) => ballot.status === "active" || ballot.wallets > 0)
      .sort((a, b) => (a.status === b.status ? (a.status === "active" ? a.closesAt - b.closesAt : b.closesAt - a.closesAt) : a.status === "active" ? -1 : 1));
  }),

  get: base.input(z.object({ ballotId: z.string() })).handler(({ input }) => buildReport(input.ballotId)),
};
