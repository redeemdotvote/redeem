import { createHash, randomUUID } from "node:crypto";
import { ORPCError } from "@orpc/server";
import { and, asc, eq, sql } from "drizzle-orm";
import { formatUnits, parseUnits } from "viem";
import { z } from "zod";
import { base } from "../__core/app";
import { bindReferral } from "../lib/referrals";
import { ACKNOWLEDGEMENT_KEYS, buildRedemptionMessage, REDEMPTION_TERMS } from "../ballots/typed-data";
import { ChallengeError, consumeChallenge, issueChallenge } from "../challenges";
import { getBalances, getMarket, shareEquivalentWad } from "../chain/market";
import { findToken } from "../chain/tokens";
import { db } from "../database";
import * as schema from "../database/schema";
import { addressSchema, formatWad } from "../lib/shared";

export const TERMS_HASH = createHash("sha256").update(REDEMPTION_TERMS).digest("hex");

interface RequestPayload {
  symbol: string;
  contractAddress: string;
  requested: string;
  held: string;
  blockNumber: number;
  jurisdiction: string;
  acknowledgements: string[];
}

const f18 = (value: bigint) => Number(formatUnits(value, 18));

/** Readiness of one request: the pack is complete when every acknowledgement is on file. */
function readiness(acknowledgements: string[], jurisdiction: string | null) {
  const complete = ACKNOWLEDGEMENT_KEYS.every((key) => acknowledgements.includes(key)) && Boolean(jurisdiction);
  return complete ? "pack_complete" : "incomplete";
}

export const redemption = {
  /** The terms every request acknowledges, and their hash. */
  terms: base.handler(() => ({ terms: REDEMPTION_TERMS, termsHash: TERMS_HASH, acknowledgements: ACKNOWLEDGEMENT_KEYS })),

  /** Queue depth per ticker, and the wallet's own requests when given. */
  status: base.input(z.object({ wallet: addressSchema.optional(), symbol: z.string().optional() })).handler(async ({ input }) => {
    const [rows, market] = await Promise.all([db.select().from(schema.redemptionRequests).orderBy(asc(schema.redemptionRequests.createdAt)), getMarket().catch(() => null)]);
    const circulatingOf = (symbol: string) => market?.value.assets.find((entry) => entry.symbol === symbol)?.totalSupplyUIFloat ?? null;
    const waiting = rows.filter((row) => row.status === "waiting");
    const bySymbol = new Map<string, { requests: number; requested: bigint; wallets: Set<string> }>();
    for (const row of waiting) {
      const entry = bySymbol.get(row.symbol) ?? { requests: 0, requested: 0n, wallets: new Set<string>() };
      entry.requests += 1;
      entry.requested += BigInt(row.requestedShareEquivalent);
      entry.wallets.add(row.wallet);
      bySymbol.set(row.symbol, entry);
    }
    const wallet = input.wallet?.toLowerCase();
    const mine = wallet ? rows.filter((row) => row.wallet === wallet) : [];
    return {
      live: false,
      total: waiting.length,
      totalRequested: f18(waiting.reduce((sum, row) => sum + BigInt(row.requestedShareEquivalent), 0n)),
      wallets: new Set(waiting.map((row) => row.wallet)).size,
      queues: [...bySymbol.entries()]
        .map(([symbol, entry]) => ({ symbol, requests: entry.requests, requested: f18(entry.requested), wallets: entry.wallets.size, circulating: circulatingOf(symbol), logo: findToken(symbol)?.logo ?? null, name: findToken(symbol)?.name ?? symbol }))
        .sort((a, b) => b.requested - a.requested),
      selected: input.symbol
        ? (() => {
            const symbol = input.symbol.toUpperCase();
            const entry = bySymbol.get(symbol);
            return { symbol, requests: entry?.requests ?? 0, requested: entry ? f18(entry.requested) : 0, wallets: entry?.wallets.size ?? 0, circulating: circulatingOf(symbol) };
          })()
        : null,
      mine: mine.map((row) => ({
        id: row.id,
        symbol: row.symbol,
        logo: findToken(row.symbol)?.logo ?? null,
        position: row.position,
        requested: f18(BigInt(row.requestedShareEquivalent)),
        held: f18(BigInt(row.heldShareEquivalent)),
        jurisdiction: row.jurisdiction,
        status: row.status,
        readiness: readiness(JSON.parse(row.acknowledgements) as string[], row.jurisdiction),
        priority: "standard" as const,
        blockNumber: row.blockNumber,
        createdAt: row.createdAt,
      })),
      recent: waiting
        .slice(-8)
        .reverse()
        .map((row) => ({ symbol: row.symbol, position: row.position, wallet: `${row.wallet.slice(0, 6)}…${row.wallet.slice(-4)}`, requested: f18(BigInt(row.requestedShareEquivalent)), createdAt: row.createdAt })),
    };
  }),

  /** Step one: the server reads the position and issues the exact request text to sign. */
  prepare: base
    .input(
      z.object({
        wallet: addressSchema,
        symbol: z.string(),
        requestedShareEquivalent: z.string().regex(/^\d+(\.\d{1,18})?$/, "Enter a share-equivalent amount"),
        jurisdiction: z.string().min(2).max(64),
        acknowledgements: z.array(z.enum(ACKNOWLEDGEMENT_KEYS)),
      }),
    )
    .handler(async ({ input }) => {
      const token = findToken(input.symbol);
      if (!token) throw new ORPCError("NOT_FOUND", { message: "Unknown token." });
      const missing = ACKNOWLEDGEMENT_KEYS.filter((key) => !input.acknowledgements.includes(key));
      if (missing.length > 0) throw new ORPCError("BAD_REQUEST", { message: "Every acknowledgement is required before a request can be signed." });

      const existing = await db
        .select()
        .from(schema.redemptionRequests)
        .where(and(eq(schema.redemptionRequests.wallet, input.wallet.toLowerCase()), eq(schema.redemptionRequests.symbol, token.symbol)))
        .limit(1);
      if (existing.length > 0) throw new ORPCError("CONFLICT", { message: `This wallet already holds place #${existing[0]?.position} in the ${token.symbol} queue.` });

      const [market, balances] = await Promise.all([getMarket(), getBalances(input.wallet)]);
      const asset = market.value.assets.find((entry) => entry.symbol === token.symbol);
      const balance = balances.value.find((entry) => entry.symbol === token.symbol);
      const raw = BigInt(balance?.rawBalance ?? "0");
      const multiplier = BigInt(asset?.uiMultiplier ?? "1000000000000000000");
      const held = shareEquivalentWad(raw, multiplier);
      const requested = parseUnits(input.requestedShareEquivalent, 18);
      if (requested <= 0n) throw new ORPCError("BAD_REQUEST", { message: "Request a share-equivalent greater than zero." });
      if (held === 0n) throw new ORPCError("BAD_REQUEST", { message: `This wallet holds no ${token.symbol} on Robinhood Chain.` });
      if (requested > held) throw new ORPCError("BAD_REQUEST", { message: `The request exceeds the ${formatWad(held)} share-equivalent this wallet holds.` });

      const challenge = issueChallenge<RequestPayload>(input.wallet, ({ nonce, issuedAt }) => ({
        message: buildRedemptionMessage({
          wallet: input.wallet,
          symbol: token.symbol,
          contractAddress: token.address,
          requestedFormatted: formatWad(requested),
          heldFormatted: formatWad(held),
          jurisdiction: input.jurisdiction.trim(),
          acknowledgements: input.acknowledgements,
          termsHash: TERMS_HASH,
          blockNumber: market.value.blockNumber,
          issuedAt,
          nonce,
        }),
        payload: {
          symbol: token.symbol,
          contractAddress: token.address,
          requested: requested.toString(),
          held: held.toString(),
          blockNumber: Number(market.value.blockNumber),
          jurisdiction: input.jurisdiction.trim(),
          acknowledgements: input.acknowledgements,
        },
      }));
      return { challengeId: challenge.id, message: challenge.message ?? "", issuedAt: challenge.issuedAt, held: formatWad(held) };
    }),

  /** Step two: verify and take a numbered place in the ticker's queue. */
  commit: base.input(z.object({ challengeId: z.string(), signature: z.string(), ref: z.string().max(16).optional() })).handler(async ({ input }) => {
    let challenge;
    try {
      challenge = await consumeChallenge<RequestPayload>(input.challengeId, input.signature);
    } catch (error) {
      if (error instanceof ChallengeError) throw new ORPCError("BAD_REQUEST", { message: error.message });
      throw error;
    }
    const wallet = challenge.wallet.toLowerCase();
    const payload = challenge.payload;
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.redemptionRequests)
      .where(eq(schema.redemptionRequests.symbol, payload.symbol));
    try {
      const [row] = await db
        .insert(schema.redemptionRequests)
        .values({
          id: randomUUID(),
          wallet,
          symbol: payload.symbol,
          position: Number(count) + 1,
          requestedShareEquivalent: payload.requested,
          heldShareEquivalent: payload.held,
          blockNumber: payload.blockNumber,
          jurisdiction: payload.jurisdiction,
          acknowledgements: JSON.stringify(payload.acknowledgements),
          termsHash: TERMS_HASH,
          status: "waiting",
          message: challenge.message ?? "",
          signature: input.signature,
        })
        .returning();
      await bindReferral(wallet, input.ref).catch(() => false);
      return { id: row?.id ?? "", position: row?.position ?? Number(count) + 1, symbol: payload.symbol };
    } catch {
      const [existing] = await db
        .select()
        .from(schema.redemptionRequests)
        .where(and(eq(schema.redemptionRequests.wallet, wallet), eq(schema.redemptionRequests.symbol, payload.symbol)))
        .limit(1);
      if (existing) return { id: existing.id, position: existing.position, symbol: existing.symbol };
      throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Could not record the request." });
    }
  }),
};
