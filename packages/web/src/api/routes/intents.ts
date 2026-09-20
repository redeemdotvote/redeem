import { randomUUID } from "node:crypto";
import { ORPCError } from "@orpc/server";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { formatUnits, getAddress, isAddress, verifyTypedData, type Address, type Hex, type TypedDataDefinition } from "viem";
import { z } from "zod";
import { base } from "../__core/app";
import { bindReferral } from "../lib/referrals";
import { attestationDocument } from "../lib/documents";
import { recordDatePosition } from "../lib/record-date";
import { ensureTimestamp, getTimestamp, publicTimestamp } from "../lib/timestamps";
import { leafHash, merkleProof, merkleRoot, verifyProof } from "../ballots/merkle";
import { type Choice } from "../ballots/seed";
import { canonicalReceipt, computeTally, type Tally } from "../ballots/tally";
import { buildInstructionTypedData, serializeTypedData } from "../ballots/typed-data";
import { ChallengeError, consumeChallenge, issueChallenge } from "../challenges";
import { currentBlock, getBalances, getMarket, loadBalancesForWallets, shareEquivalentWad } from "../chain/market";
import { findToken } from "../chain/tokens";
import { db } from "../database";
import * as schema from "../database/schema";
import { addressSchema, ballotStatus, nowSeconds } from "../lib/shared";

type BallotRow = typeof schema.ballots.$inferSelect;
type ItemRow = typeof schema.ballotItems.$inferSelect;
type InstructionRow = typeof schema.instructions.$inferSelect;
export type AttestationRow = typeof schema.attestations.$inferSelect;

function parseChoices(item: ItemRow): Choice[] {
  return JSON.parse(item.choices) as Choice[];
}

function shortWallet(wallet: string) {
  return `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;
}

export function publicBallot(ballot: BallotRow) {
  return {
    id: ballot.id,
    symbol: ballot.symbol,
    companyName: ballot.companyName,
    cik: ballot.cik,
    accession: ballot.accession,
    form: ballot.form,
    filedAt: ballot.filedAt,
    docUrl: ballot.docUrl,
    meetingType: ballot.meetingType,
    meetingDate: ballot.meetingDate,
    meetingTime: ballot.meetingTime,
    meetingFormat: ballot.meetingFormat,
    meetingUrl: ballot.meetingUrl,
    recordDate: ballot.recordDate,
    closesAt: ballot.closesAt,
    publishedAt: ballot.publishedAt,
    status: ballotStatus(ballot.closesAt),
  };
}

export function publicItem(item: ItemRow) {
  return {
    id: item.id,
    ballotId: item.ballotId,
    symbol: item.symbol,
    index: item.index,
    title: item.title,
    summary: item.summary,
    itemType: item.itemType,
    proponent: item.proponent,
    boardRecommendation: item.boardRecommendation,
    approvalStandard: item.approvalStandard,
    abstainEffect: item.abstainEffect,
    brokerNonVoteEffect: item.brokerNonVoteEffect,
    routine: item.routine,
    choices: parseChoices(item),
    nominees: JSON.parse(item.nominees) as string[],
  };
}

/** Weight that counts: the closed weight once a close re-check ran, otherwise the signed weight. */
export function countedWeight(row: InstructionRow): bigint {
  return BigInt(row.closeWeight ?? row.shareEquivalent);
}

export async function activeInstructions(itemIds: string[]): Promise<InstructionRow[]> {
  if (itemIds.length === 0) return [];
  return db
    .select()
    .from(schema.instructions)
    .where(and(inArray(schema.instructions.ballotItemId, itemIds), eq(schema.instructions.status, "active")))
    .orderBy(desc(schema.instructions.createdAt));
}

export function tallyFor(item: ItemRow, rows: InstructionRow[]): Tally {
  return computeTally(
    parseChoices(item),
    rows.map((row) => ({ choice: row.choice, weight: countedWeight(row) })),
  );
}

async function loadItem(id: string): Promise<{ item: ItemRow; ballot: BallotRow }> {
  const [item] = await db.select().from(schema.ballotItems).where(eq(schema.ballotItems.id, id)).limit(1);
  if (!item) throw new ORPCError("NOT_FOUND", { message: "No such ballot item." });
  const [ballot] = await db.select().from(schema.ballots).where(eq(schema.ballots.id, item.ballotId)).limit(1);
  if (!ballot) throw new ORPCError("NOT_FOUND", { message: "No such ballot." });
  return { item, ballot };
}

interface InstructionPayload {
  delegate: string;
  ballotItemId: string;
  ballotId: string;
  symbol: string;
  contractAddress: string;
  choice: string;
  choiceLabel: string;
  rawBalance: string;
  uiMultiplier: string;
  shareEquivalent: string;
  blockNumber: number;
}

/**
 * Closing an item: re-read what every instructing wallet still holds, count the smaller of the
 * signed weight and the held weight, fold the receipts into a Merkle root, and store it. The
 * rule is deliberately one-directional — weight can fall at close, never rise — so moving tokens
 * between wallets after signing cannot count the same shares twice.
 */
/** Freezes an attestation as a canonical document and stamps it with OpenTimestamps. Best effort; never blocks the attestation. */
export async function stampAttestation(item: ItemRow, row: AttestationRow) {
  const tally = JSON.parse(row.tally) as Tally;
  const document = attestationDocument({
    itemId: item.id,
    ballotId: row.ballotId,
    symbol: row.symbol,
    index: item.index,
    title: item.title,
    merkleRoot: row.merkleRoot,
    leafCount: row.leafCount,
    tally,
    blockNumber: row.blockNumber,
    attestedAt: Math.floor(row.createdAt.getTime() / 1000),
  });
  return ensureTimestamp(`attestation:${item.id}`, "attestation", document);
}

export async function attestItem(item: ItemRow, ballot: BallotRow): Promise<AttestationRow> {
  const [existing] = await db.select().from(schema.attestations).where(eq(schema.attestations.ballotItemId, item.id)).limit(1);
  if (existing) return existing;
  if (ballotStatus(ballot.closesAt) !== "closed") {
    throw new ORPCError("BAD_REQUEST", { message: "Intents are still open on this item." });
  }
  const token = findToken(item.symbol);
  if (!token) throw new ORPCError("NOT_FOUND", { message: "Unknown token." });

  const rows = await activeInstructions([item.id]);
  const head = await currentBlock();

  if (rows.length > 0) {
    const [market, balances] = await Promise.all([
      getMarket(),
      loadBalancesForWallets(
        token,
        rows.map((row) => row.wallet as Address),
      ),
    ]);
    const asset = market.value.assets.find((entry) => entry.symbol === token.symbol);
    const multiplier = BigInt(asset?.uiMultiplier ?? "1000000000000000000");
    for (const row of rows) {
      const held = balances.get(row.wallet.toLowerCase()) ?? 0n;
      const heldWeight = shareEquivalentWad(held, multiplier);
      const signed = BigInt(row.shareEquivalent);
      const counted = heldWeight < signed ? heldWeight : signed;
      row.closeBalance = held.toString();
      row.closeWeight = counted.toString();
      await db
        .update(schema.instructions)
        .set({ closeBalance: row.closeBalance, closeWeight: row.closeWeight })
        .where(eq(schema.instructions.id, row.id));
    }
  }

  const ordered = [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
  const leaves = ordered.map((row) => leafHash(canonicalReceipt(row)));
  const root = merkleRoot(leaves);
  const tally = tallyFor(item, ordered);

  const [inserted] = await db
    .insert(schema.attestations)
    .values({
      id: randomUUID(),
      ballotItemId: item.id,
      ballotId: ballot.id,
      symbol: item.symbol,
      merkleRoot: root,
      leafCount: leaves.length,
      tally: JSON.stringify(tally),
      leaves: JSON.stringify(leaves),
      blockNumber: Number(head.number),
      channel: "computed",
    })
    .onConflictDoNothing()
    .returning();
  if (inserted) {
    if (leaves.length > 0) await stampAttestation(item, inserted).catch(() => null);
    return inserted;
  }
  const [raced] = await db.select().from(schema.attestations).where(eq(schema.attestations.ballotItemId, item.id)).limit(1);
  return raced!;
}

export function publicAttestation(row: AttestationRow) {
  return {
    id: row.id,
    ballotItemId: row.ballotItemId,
    symbol: row.symbol,
    merkleRoot: row.merkleRoot,
    leafCount: row.leafCount,
    tally: JSON.parse(row.tally) as Tally,
    blockNumber: row.blockNumber,
    channel: row.channel,
    txHash: row.txHash,
    createdAt: row.createdAt,
  };
}

export const intents = {
  /** Every ballot item, filterable, newest close first, with its tally summary. */
  list: base
    .input(
      z.object({
        status: z.enum(["active", "closed", "all"]).default("all"),
        symbol: z.string().optional(),
        q: z.string().max(80).optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(5).max(50).default(25),
        wallet: addressSchema.optional(),
      }),
    )
    .handler(async ({ input }) => {
      const now = nowSeconds();
      // Counts are over everything the ticker filter leaves, so the Open / Closed chips stay
      // meaningful whichever one is selected.
      const scoped = (await db.select().from(schema.ballots)).filter(
        (row) => !input.symbol || row.symbol === input.symbol.toUpperCase(),
      );
      const ballotById = new Map(scoped.map((row) => [row.id, row]));
      const itemRows = scoped.length
        ? await db.select().from(schema.ballotItems).where(inArray(schema.ballotItems.ballotId, [...ballotById.keys()]))
        : [];
      const q = input.q?.trim().toLowerCase();
      const filtered = itemRows.filter((item) => {
        const ballot = ballotById.get(item.ballotId);
        if (!ballot) return false;
        if (input.status === "active" && ballot.closesAt <= now) return false;
        if (input.status === "closed" && ballot.closesAt > now) return false;
        if (!q) return true;
        return (
          item.title.toLowerCase().includes(q) ||
          item.symbol.toLowerCase().includes(q) ||
          (ballot?.companyName.toLowerCase().includes(q) ?? false)
        );
      });

      // Open items first, closing soonest first; then closed items, most recent first; then by proposal order.
      filtered.sort((a, b) => {
        const ba = ballotById.get(a.ballotId)!;
        const bb = ballotById.get(b.ballotId)!;
        const openA = ba.closesAt > now ? 0 : 1;
        const openB = bb.closesAt > now ? 0 : 1;
        if (openA !== openB) return openA - openB;
        if (ba.closesAt !== bb.closesAt) return openA === 0 ? ba.closesAt - bb.closesAt : bb.closesAt - ba.closesAt;
        if (a.symbol !== b.symbol) return a.symbol.localeCompare(b.symbol);
        return a.ordinal - b.ordinal;
      });

      const total = filtered.length;
      const start = (input.page - 1) * input.pageSize;
      const page = filtered.slice(start, start + input.pageSize);
      const pageIds = page.map((item) => item.id);
      const rows = await activeInstructions(pageIds);
      const mine = new Set(input.wallet ? rows.filter((row) => row.wallet === input.wallet!.toLowerCase()).map((row) => row.ballotItemId) : []);

      return {
        total,
        page: input.page,
        pageSize: input.pageSize,
        pages: Math.max(1, Math.ceil(total / input.pageSize)),
        counts: {
          active: itemRows.filter((item) => (ballotById.get(item.ballotId)?.closesAt ?? 0) > now).length,
          closed: itemRows.filter((item) => (ballotById.get(item.ballotId)?.closesAt ?? 0) <= now).length,
        },
        items: page.map((item) => {
          const ballot = ballotById.get(item.ballotId)!;
          const tally = tallyFor(item, rows.filter((row) => row.ballotItemId === item.id));
          const token = findToken(item.symbol);
          return {
            ...publicItem(item),
            ballot: publicBallot(ballot),
            logo: token?.logo ?? null,
            companyName: ballot.companyName,
            tally,
            instructed: mine.has(item.id),
          };
        }),
      };
    }),

  /** One ballot item in full. */
  item: base.input(z.object({ id: z.string(), wallet: addressSchema.optional() })).handler(async ({ input }) => {
    const { item, ballot } = await loadItem(input.id);
    const token = findToken(item.symbol);
    const siblings = (await db.select().from(schema.ballotItems).where(eq(schema.ballotItems.ballotId, ballot.id))).sort(
      (a, b) => a.ordinal - b.ordinal,
    );
    const rows = await activeInstructions([item.id]);
    const [attestation] = await db.select().from(schema.attestations).where(eq(schema.attestations.ballotItemId, item.id)).limit(1);
    const tally = attestation ? (JSON.parse(attestation.tally) as Tally) : tallyFor(item, rows);
    // Circulating share-equivalents for the quorum-style bar: recorded intent against the token's whole supply.
    const circulatingShareEq = await getMarket()
      .then((market) => market.value.assets.find((entry) => entry.symbol === item.symbol)?.totalSupplyUIFloat ?? null)
      .catch(() => null);

    let yours: InstructionRow | null = null;
    let power: null | {
      rawBalance: string;
      uiMultiplier: string;
      shareEquivalent: string;
      shareEquivalentFloat: number;
      blockNumber: string;
      holds: boolean;
    } = null;
    if (input.wallet && token) {
      yours = rows.find((row) => row.wallet === input.wallet!.toLowerCase()) ?? null;
      const [market, balances] = await Promise.all([getMarket(), getBalances(input.wallet)]);
      const asset = market.value.assets.find((entry) => entry.symbol === token.symbol);
      const balance = balances.value.find((entry) => entry.symbol === token.symbol);
      const raw = BigInt(balance?.rawBalance ?? "0");
      const multiplier = BigInt(asset?.uiMultiplier ?? "1000000000000000000");
      const shares = shareEquivalentWad(raw, multiplier);
      power = {
        rawBalance: raw.toString(),
        uiMultiplier: multiplier.toString(),
        shareEquivalent: shares.toString(),
        shareEquivalentFloat: Number(formatUnits(shares, 18)),
        blockNumber: market.value.blockNumber,
        holds: raw > 0n,
      };
    }

    return {
      item: publicItem(item),
      ballot: publicBallot(ballot),
      token: token
        ? { symbol: token.symbol, name: token.name, address: token.address, logo: token.logo, kind: token.kind, cik: token.cik }
        : null,
      siblings: siblings.map((sibling) => ({ id: sibling.id, index: sibling.index, title: sibling.title })),
      tally,
      circulatingShareEq,
      attestation: attestation ? publicAttestation(attestation) : null,
      timestamp: attestation ? publicTimestamp(await getTimestamp(`attestation:${item.id}`)) : null,
      receipts: rows.slice(0, 50).map((row) => ({
        id: row.id,
        wallet: shortWallet(row.wallet),
        choice: row.choice,
        choiceLabel: row.choiceLabel,
        weightFloat: Number(formatUnits(countedWeight(row), 18)),
        signedWeightFloat: Number(formatUnits(BigInt(row.shareEquivalent), 18)),
        blockNumber: row.blockNumber,
        createdAt: row.createdAt,
      })),
      yours: yours
        ? {
            id: yours.id,
            choice: yours.choice,
            choiceLabel: yours.choiceLabel,
            delegate: yours.delegate,
            shareEquivalent: yours.shareEquivalent,
            shareEquivalentFloat: Number(formatUnits(BigInt(yours.shareEquivalent), 18)),
            blockNumber: yours.blockNumber,
            createdAt: yours.createdAt,
            closeWeight: yours.closeWeight,
          }
        : null,
      power,
    };
  }),

  /** What the wallet held on the issuer's record date, rebuilt from Transfer logs. Informational; never changes counted weight. */
  recordDate: base.input(z.object({ itemId: z.string(), wallet: addressSchema })).handler(async ({ input }) => {
    const { ballot } = await loadItem(input.itemId);
    if (!ballot.recordDate) return { available: false as const, reason: "The proxy statement does not state a record date." };
    const position = await recordDatePosition(input.wallet as Address, ballot.symbol, ballot.recordDate).catch(() => null);
    if (!position) return { available: false as const, reason: "The record-date position could not be read right now." };
    return { available: true as const, ...position };
  }),

  /** Step one: the server reads the wallet's position and issues the exact EIP-712 payload to sign. */
  prepare: base
    .input(z.object({ wallet: addressSchema, itemId: z.string(), choice: z.string(), delegate: z.string().optional() }))
    .handler(async ({ input }) => {
      const { item, ballot } = await loadItem(input.itemId);
      if (ballotStatus(ballot.closesAt) !== "active") {
        throw new ORPCError("BAD_REQUEST", { message: "Intents on this item have closed." });
      }
      const choice = parseChoices(item).find((entry) => entry.value === input.choice);
      if (!choice) throw new ORPCError("BAD_REQUEST", { message: "That choice is not on this item." });
      const ZERO = "0x0000000000000000000000000000000000000000" as Address;
      let delegate: Address = ZERO;
      if (choice.value === "delegate") {
        if (!input.delegate || !isAddress(input.delegate)) throw new ORPCError("BAD_REQUEST", { message: "A delegate intent needs a valid 0x address." });
        delegate = getAddress(input.delegate);
      }
      const token = findToken(item.symbol);
      if (!token) throw new ORPCError("NOT_FOUND", { message: "Unknown token." });

      const [market, balances] = await Promise.all([getMarket(), getBalances(input.wallet)]);
      const asset = market.value.assets.find((entry) => entry.symbol === token.symbol);
      if (!asset) throw new ORPCError("SERVICE_UNAVAILABLE", { message: "Chain state unavailable right now." });
      const balance = balances.value.find((entry) => entry.symbol === token.symbol);
      const rawBalance = BigInt(balance?.rawBalance ?? "0");
      if (rawBalance === 0n) {
        throw new ORPCError("BAD_REQUEST", {
          message: `This wallet holds no ${token.symbol} on Robinhood Chain, so there is no weight to record.`,
        });
      }
      const uiMultiplier = BigInt(asset.uiMultiplier);
      const shareEquivalent = shareEquivalentWad(rawBalance, uiMultiplier);
      const block = BigInt(market.value.blockNumber);

      const challenge = issueChallenge<InstructionPayload>(input.wallet, ({ nonce, issuedAt }) => ({
        typedData: buildInstructionTypedData({
          ballotItemId: item.id,
          proposal: `${ballot.companyName} — Item ${item.index}: ${item.title}`,
          stock: token.symbol,
          token: token.address,
          wallet: input.wallet,
          choice: choice.value,
          delegate,
          rawBalance,
          uiMultiplier,
          shareEquivalent,
          block,
          issuedAt,
          nonce,
        }),
        payload: {
          ballotItemId: item.id,
          ballotId: ballot.id,
          symbol: token.symbol,
          contractAddress: token.address,
          choice: choice.value,
          choiceLabel: choice.label,
          delegate,
          rawBalance: rawBalance.toString(),
          uiMultiplier: uiMultiplier.toString(),
          shareEquivalent: shareEquivalent.toString(),
          blockNumber: Number(block),
        },
      }));

      return {
        challengeId: challenge.id,
        typedData: JSON.parse(serializeTypedData(challenge.typedData!)) as TypedDataDefinition,
        issuedAt: challenge.issuedAt,
        weight: { rawBalance: rawBalance.toString(), shareEquivalent: shareEquivalent.toString(), blockNumber: block.toString() },
      };
    }),

  /** Step two: verify the signature against the issued payload and record the instruction. */
  commit: base.input(z.object({ challengeId: z.string(), signature: z.string(), ref: z.string().max(16).optional() })).handler(async ({ input }) => {
    let challenge;
    try {
      challenge = await consumeChallenge<InstructionPayload>(input.challengeId, input.signature);
    } catch (error) {
      if (error instanceof ChallengeError) throw new ORPCError("BAD_REQUEST", { message: error.message });
      throw error;
    }
    const payload = challenge.payload;
    const wallet = challenge.wallet.toLowerCase();

    const [previous] = await db
      .select()
      .from(schema.instructions)
      .where(
        and(
          eq(schema.instructions.wallet, wallet),
          eq(schema.instructions.ballotItemId, payload.ballotItemId),
          eq(schema.instructions.status, "active"),
        ),
      )
      .limit(1);

    const [row] = await db
      .insert(schema.instructions)
      .values({
        id: randomUUID(),
        ballotItemId: payload.ballotItemId,
        ballotId: payload.ballotId,
        symbol: payload.symbol,
        contractAddress: payload.contractAddress,
        wallet,
        choice: payload.choice,
        choiceLabel: payload.choiceLabel,
        delegate: payload.delegate,
        rawBalance: payload.rawBalance,
        uiMultiplier: payload.uiMultiplier,
        shareEquivalent: payload.shareEquivalent,
        blockNumber: payload.blockNumber,
        typedData: serializeTypedData(challenge.typedData!),
        signature: input.signature,
        status: "active",
        supersedesId: previous?.id ?? null,
      })
      .returning();
    await bindReferral(wallet, input.ref).catch(() => false);
    if (previous) {
      await db.update(schema.instructions).set({ status: "superseded" }).where(eq(schema.instructions.id, previous.id));
    }
    return { id: row?.id ?? "", superseded: previous?.id ?? null };
  }),

  /** Every instruction a wallet has signed, newest first, superseded rows kept visible. */
  receipts: base.input(z.object({ wallet: addressSchema })).handler(async ({ input }) => {
    const rows = await db
      .select()
      .from(schema.instructions)
      .where(eq(schema.instructions.wallet, input.wallet.toLowerCase()))
      .orderBy(desc(schema.instructions.createdAt));
    const itemIds = [...new Set(rows.map((row) => row.ballotItemId))];
    const items = itemIds.length ? await db.select().from(schema.ballotItems).where(inArray(schema.ballotItems.id, itemIds)) : [];
    const ballotIds = [...new Set(rows.map((row) => row.ballotId))];
    const ballotRows = ballotIds.length ? await db.select().from(schema.ballots).where(inArray(schema.ballots.id, ballotIds)) : [];
    const attested = itemIds.length
      ? await db.select().from(schema.attestations).where(inArray(schema.attestations.ballotItemId, itemIds))
      : [];
    const itemById = new Map(items.map((item) => [item.id, item]));
    const ballotById = new Map(ballotRows.map((ballot) => [ballot.id, ballot]));
    const attestedItems = new Set(attested.map((row) => row.ballotItemId));

    return {
      wallet: input.wallet,
      receipts: rows.map((row) => {
        const item = itemById.get(row.ballotItemId);
        const ballot = ballotById.get(row.ballotId);
        return {
          id: row.id,
          ballotItemId: row.ballotItemId,
          symbol: row.symbol,
          logo: findToken(row.symbol)?.logo ?? null,
          companyName: ballot?.companyName ?? row.symbol,
          index: item?.index ?? "",
          title: item?.title ?? "",
          meetingDate: ballot?.meetingDate ?? null,
          closesAt: ballot?.closesAt ?? 0,
          ballotStatus: ballot ? ballotStatus(ballot.closesAt) : "closed",
          choice: row.choice,
          choiceLabel: row.choiceLabel,
          shareEquivalentFloat: Number(formatUnits(BigInt(row.shareEquivalent), 18)),
          countedWeightFloat: Number(formatUnits(countedWeight(row), 18)),
          blockNumber: row.blockNumber,
          status: row.status,
          attested: attestedItems.has(row.ballotItemId),
          createdAt: row.createdAt,
        };
      }),
      counts: {
        total: rows.length,
        active: rows.filter((row) => row.status === "active").length,
        superseded: rows.filter((row) => row.status === "superseded").length,
      },
    };
  }),

  /** One receipt, re-verified on the server, with its Merkle proof once the item is attested. */
  receipt: base.input(z.object({ id: z.string() })).handler(async ({ input }) => {
    const [row] = await db.select().from(schema.instructions).where(eq(schema.instructions.id, input.id)).limit(1);
    if (!row) throw new ORPCError("NOT_FOUND", { message: "No such receipt." });
    const { item, ballot } = await loadItem(row.ballotItemId);
    const typedData = JSON.parse(row.typedData) as TypedDataDefinition;

    let signatureValid = false;
    try {
      signatureValid = await verifyTypedData({
        ...(typedData as Parameters<typeof verifyTypedData>[0]),
        address: row.wallet as Address,
        signature: row.signature as Hex,
      });
    } catch {
      signatureValid = false;
    }

    const [attestation] = await db.select().from(schema.attestations).where(eq(schema.attestations.ballotItemId, item.id)).limit(1);
    let proof: { leaf: Hex; index: number; siblings: Hex[]; root: Hex; valid: boolean } | null = null;
    if (attestation) {
      const leaves = JSON.parse(attestation.leaves) as Hex[];
      const leaf = leafHash(canonicalReceipt(row));
      const index = leaves.findIndex((entry) => entry.toLowerCase() === leaf.toLowerCase());
      if (index >= 0) {
        const siblings = merkleProof(leaves, index);
        proof = { leaf, index, siblings, root: attestation.merkleRoot as Hex, valid: verifyProof(leaf, siblings, attestation.merkleRoot as Hex) };
      } else {
        proof = { leaf, index: -1, siblings: [], root: attestation.merkleRoot as Hex, valid: false };
      }
    }

    return {
      id: row.id,
      wallet: row.wallet,
      symbol: row.symbol,
      contractAddress: row.contractAddress,
      choice: row.choice,
      choiceLabel: row.choiceLabel,
      delegate: row.delegate,
      rawBalance: row.rawBalance,
      uiMultiplier: row.uiMultiplier,
      shareEquivalent: row.shareEquivalent,
      shareEquivalentFloat: Number(formatUnits(BigInt(row.shareEquivalent), 18)),
      closeBalance: row.closeBalance,
      closeWeight: row.closeWeight,
      countedWeightFloat: Number(formatUnits(countedWeight(row), 18)),
      blockNumber: row.blockNumber,
      status: row.status,
      supersedesId: row.supersedesId,
      createdAt: row.createdAt,
      typedData,
      typedDataJson: row.typedData,
      signature: row.signature,
      signatureValid,
      canonical: canonicalReceipt(row),
      item: publicItem(item),
      ballot: publicBallot(ballot),
      token: findToken(row.symbol) ? { name: findToken(row.symbol)!.name, logo: findToken(row.symbol)!.logo } : null,
      attestation: attestation ? publicAttestation(attestation) : null,
      proof,
    };
  }),

  /** Closes an item: re-checks every weight, computes the tally, stores the Merkle root. Idempotent. */
  attest: base.input(z.object({ itemId: z.string() })).handler(async ({ input }) => {
    const { item, ballot } = await loadItem(input.itemId);
    const attestation = await attestItem(item, ballot);
    return publicAttestation(attestation);
  }),

  /** Every attestation so far, newest first. */
  attestations: base.handler(async () => {
    const rows = await db.select().from(schema.attestations).orderBy(desc(schema.attestations.createdAt));
    const itemIds = rows.map((row) => row.ballotItemId);
    const items = itemIds.length ? await db.select().from(schema.ballotItems).where(inArray(schema.ballotItems.id, itemIds)) : [];
    const itemById = new Map(items.map((item) => [item.id, item]));
    return rows.map((row) => {
      const item = itemById.get(row.ballotItemId);
      return { ...publicAttestation(row), index: item?.index ?? "", title: item?.title ?? "", logo: findToken(row.symbol)?.logo ?? null };
    });
  }),

  /** Closed items that have not been attested yet — attestation is lazy and anyone may trigger it. */
  pendingAttestation: base.handler(async () => {
    const now = nowSeconds();
    const closed = await db.select().from(schema.ballots).where(sql`${schema.ballots.closesAt} <= ${now}`);
    const closedIds = closed.map((row) => row.id);
    if (closedIds.length === 0) return { items: [] };
    const items = await db.select().from(schema.ballotItems).where(inArray(schema.ballotItems.ballotId, closedIds));
    const attested = new Set((await db.select({ id: schema.attestations.ballotItemId }).from(schema.attestations)).map((row) => row.id));
    const instructed = new Set(
      (await db.select({ id: schema.instructions.ballotItemId }).from(schema.instructions).where(eq(schema.instructions.status, "active"))).map(
        (row) => row.id,
      ),
    );
    return {
      items: items
        .filter((item) => !attested.has(item.id) && instructed.has(item.id))
        .map((item) => ({ id: item.id, symbol: item.symbol, index: item.index, title: item.title })),
    };
  }),
};
