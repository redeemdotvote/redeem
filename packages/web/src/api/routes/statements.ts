import { createHash, randomUUID } from "node:crypto";
import { ORPCError } from "@orpc/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { base } from "../__core/app";
import { NON_BINDING_DISCLOSURE } from "../ballots/typed-data";
import { getBalances, getMarket, shareEquivalentWad } from "../chain/market";
import { db } from "../database";
import * as schema from "../database/schema";
import { addressSchema, formatWad } from "../lib/shared";

const SNAPSHOT_SCHEMA = "redeem.statement.v1";

export interface SnapshotPayload {
  schema: string;
  chainId: number;
  wallet: string;
  blockNumber: string;
  blockTimestamp: number;
  observedAt: string;
  positions: Array<{
    symbol: string;
    name: string;
    contract: string;
    priceFeed: string | null;
    rawBalance: string;
    uiMultiplier: string;
    shareEquivalent: string;
    contractBalanceOfUI: string | null;
    mathVerified: boolean;
    priceUsd: number | null;
    priceUpdatedAt: number | null;
    valueUsd: number | null;
  }>;
  totals: { positions: number; shareEquivalent: string; valueUsd: number };
  disclosure: string;
}

/**
 * The digest is taken over `JSON.stringify(payload)` exactly as stored, and the stored string is
 * what the certificate serves — so anyone can re-hash the JSON they downloaded and get the same
 * SHA-256 back.
 */
function digestOf(payload: SnapshotPayload): { json: string; digest: string } {
  const json = JSON.stringify(payload);
  return { json, digest: createHash("sha256").update(json).digest("hex") };
}

export const statements = {
  /** Reads the wallet's positions at the current block and certifies them with a SHA-256 digest. */
  create: base.input(z.object({ wallet: addressSchema })).handler(async ({ input }) => {
    const [market, balances] = await Promise.all([getMarket(), getBalances(input.wallet)]);
    const assetBySymbol = new Map(market.value.assets.map((asset) => [asset.symbol, asset]));

    let totalShareEquivalent = 0n;
    let totalUsd = 0;
    const positions: SnapshotPayload["positions"] = [];

    for (const balance of balances.value) {
      const raw = BigInt(balance.rawBalance);
      if (raw === 0n) continue;
      const asset = assetBySymbol.get(balance.symbol);
      if (!asset) continue;
      const uiMultiplier = BigInt(asset.uiMultiplier);
      const shareEquivalent = shareEquivalentWad(raw, uiMultiplier);
      const rawFloat = Number(formatWad(raw, 18));
      const valueUsd = asset.priceUsd === null ? null : rawFloat * asset.priceUsd;
      totalShareEquivalent += shareEquivalent;
      totalUsd += valueUsd ?? 0;
      positions.push({
        symbol: asset.symbol,
        name: asset.name,
        contract: asset.address,
        priceFeed: asset.feed,
        rawBalance: raw.toString(),
        uiMultiplier: uiMultiplier.toString(),
        shareEquivalent: shareEquivalent.toString(),
        contractBalanceOfUI: balance.balanceOfUI,
        mathVerified: balance.balanceOfUI !== null && BigInt(balance.balanceOfUI) === shareEquivalent,
        priceUsd: asset.priceUsd,
        priceUpdatedAt: asset.priceUpdatedAt,
        valueUsd,
      });
    }

    if (positions.length === 0) {
      throw new ORPCError("BAD_REQUEST", { message: "This wallet holds no Stock Tokens, so there is nothing to certify." });
    }

    const payload: SnapshotPayload = {
      schema: SNAPSHOT_SCHEMA,
      chainId: 4663,
      wallet: input.wallet,
      blockNumber: market.value.blockNumber,
      blockTimestamp: market.value.blockTimestamp,
      observedAt: new Date().toISOString(),
      positions,
      totals: { positions: positions.length, shareEquivalent: totalShareEquivalent.toString(), valueUsd: totalUsd },
      disclosure: NON_BINDING_DISCLOSURE.replace(/\n/g, " "),
    };

    const { json, digest } = digestOf(payload);
    const [row] = await db
      .insert(schema.snapshots)
      .values({
        id: randomUUID(),
        wallet: input.wallet.toLowerCase(),
        blockNumber: Number(payload.blockNumber),
        chainId: 4663,
        payload: json,
        digest,
        totalUsd: totalUsd.toFixed(2),
        positionCount: positions.length,
      })
      .returning();

    return { id: row?.id ?? "", digest, payload };
  }),

  forWallet: base.input(z.object({ wallet: addressSchema })).handler(async ({ input }) => {
    const rows = await db
      .select({
        id: schema.snapshots.id,
        blockNumber: schema.snapshots.blockNumber,
        digest: schema.snapshots.digest,
        totalUsd: schema.snapshots.totalUsd,
        positionCount: schema.snapshots.positionCount,
        createdAt: schema.snapshots.createdAt,
      })
      .from(schema.snapshots)
      .where(eq(schema.snapshots.wallet, input.wallet.toLowerCase()))
      .orderBy(desc(schema.snapshots.createdAt));
    return { wallet: input.wallet, snapshots: rows };
  }),

  /** One certificate, with the stored JSON verbatim so the digest can be re-checked client side. */
  get: base.input(z.object({ id: z.string() })).handler(async ({ input }) => {
    const [row] = await db.select().from(schema.snapshots).where(eq(schema.snapshots.id, input.id)).limit(1);
    if (!row) throw new ORPCError("NOT_FOUND", { message: "No such statement" });
    const payload = JSON.parse(row.payload) as SnapshotPayload;
    return {
      id: row.id,
      wallet: row.wallet,
      blockNumber: row.blockNumber,
      chainId: row.chainId,
      digest: row.digest,
      createdAt: row.createdAt,
      json: row.payload,
      recomputedDigest: createHash("sha256").update(row.payload).digest("hex"),
      payload,
    };
  }),
};
