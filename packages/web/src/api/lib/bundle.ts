import { createHash } from "node:crypto";
import { asc, eq, inArray } from "drizzle-orm";
import type { Hex } from "viem";
import { leafHash, merkleProof } from "../ballots/merkle";
import { canonicalReceipt } from "../ballots/tally";
import { db } from "../database";
import * as schema from "../database/schema";
import { canonicalJson } from "./canonical";
import { loadRecordIndex, SEASON } from "./records";

/**
 * Everything a wallet has signed, in one self-verifying file: each intent with its EIP-712 payload
 * and signature, each queue request with its message and signature, the Merkle proof for every
 * attested receipt, and the record numbers. Nothing in it has to be taken on trust: the signatures
 * recover to the wallet, the proofs rebuild the published roots, and `bundleDigest` is the SHA-256
 * of the canonical form of `contents`. The /verify page checks all of it in the browser.
 */
export async function buildBundle(walletInput: string) {
  const wallet = walletInput.toLowerCase();
  const [intents, requests, index] = await Promise.all([
    db.select().from(schema.instructions).where(eq(schema.instructions.wallet, wallet)).orderBy(asc(schema.instructions.createdAt)),
    db.select().from(schema.redemptionRequests).where(eq(schema.redemptionRequests.wallet, wallet)).orderBy(asc(schema.redemptionRequests.createdAt)),
    loadRecordIndex(),
  ]);
  const itemIds = [...new Set(intents.map((row) => row.ballotItemId))];
  const [items, attestations] = await Promise.all([
    itemIds.length ? db.select().from(schema.ballotItems).where(inArray(schema.ballotItems.id, itemIds)) : Promise.resolve([]),
    itemIds.length ? db.select().from(schema.attestations).where(inArray(schema.attestations.ballotItemId, itemIds)) : Promise.resolve([]),
  ]);
  const itemById = new Map(items.map((item) => [item.id, item]));
  const attestationByItem = new Map(attestations.map((row) => [row.ballotItemId, row]));
  const mine = index.wallets.get(wallet) ?? null;

  const contents = {
    type: "redeem.wallet-bundle",
    version: 1,
    note: "Intent and redemption readiness recorded by this wallet. Not a shareholder vote, not a redemption.",
    wallet: walletInput,
    season: SEASON.label,
    walletNumber: mine?.number ?? null,
    recordNumbers: [...index.bySymbol.entries()].filter(([, holders]) => holders.has(wallet)).map(([symbol, holders]) => ({ symbol, recordNumber: holders.get(wallet)!.number })),
    intents: intents.map((row) => {
      const attestation = attestationByItem.get(row.ballotItemId) ?? null;
      const canonical = canonicalReceipt(row);
      let proof: null | { root: string; leaf: string; index: number; siblings: string[] } = null;
      if (attestation && row.status === "active") {
        const leaves = JSON.parse(attestation.leaves) as Hex[];
        const leaf = leafHash(canonical);
        const at = leaves.findIndex((entry) => entry.toLowerCase() === leaf.toLowerCase());
        if (at >= 0) proof = { root: attestation.merkleRoot, leaf, index: at, siblings: merkleProof(leaves, at) };
      }
      return {
        id: row.id,
        itemId: row.ballotItemId,
        symbol: row.symbol,
        title: itemById.get(row.ballotItemId)?.title ?? null,
        choice: row.choice,
        delegate: row.delegate,
        shareEquivalent: row.shareEquivalent,
        closeWeight: row.closeWeight,
        blockNumber: row.blockNumber,
        status: row.status,
        signedAt: Math.floor(row.createdAt.getTime() / 1000),
        typedData: JSON.parse(row.typedData) as unknown,
        signature: row.signature,
        canonical,
        proof,
      };
    }),
    redemptionRequests: requests.map((row) => ({
      id: row.id,
      symbol: row.symbol,
      position: row.position,
      requestedShareEquivalent: row.requestedShareEquivalent,
      heldShareEquivalent: row.heldShareEquivalent,
      blockNumber: row.blockNumber,
      status: row.status,
      termsHash: row.termsHash,
      signedAt: Math.floor(row.createdAt.getTime() / 1000),
      message: row.message,
      signature: row.signature,
    })),
  };
  return { generatedAt: Math.floor(Date.now() / 1000), bundleDigest: createHash("sha256").update(canonicalJson(contents), "utf8").digest("hex"), contents };
}
