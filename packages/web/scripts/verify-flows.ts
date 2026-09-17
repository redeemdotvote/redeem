/**
 * Offline check of the signing and attestation machinery, with a throwaway key:
 * typed-data challenge → EIP-712 signature → verification, then Merkle root + proof.
 * Run: bun scripts/verify-flows.ts
 */
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { buildInstructionTypedData, serializeTypedData } from "../src/api/ballots/typed-data";
import { issueChallenge, consumeChallenge } from "../src/api/challenges";
import { leafHash, merkleProof, merkleRoot, verifyProof } from "../src/api/ballots/merkle";
import { canonicalReceipt, computeTally } from "../src/api/ballots/tally";
import { choicesFor } from "../src/api/ballots/seed";

const account = privateKeyToAccount(generatePrivateKey());
const challenge = issueChallenge<{ ok: true }>(account.address, ({ nonce, issuedAt }) => ({
  typedData: buildInstructionTypedData({
    ballotItemId: "AMC-2026-09-24-1",
    proposal: "AMC — Item 1: Declassify the board",
    stock: "AMC",
    token: "0x05a3d1Cd21d0C88145E82600E62e7E496e0F222B",
    wallet: account.address,
    choice: "for",
    rawBalance: 12_500000000000000000n,
    uiMultiplier: 1_000000000000000000n,
    shareEquivalent: 12_500000000000000000n,
    block: 64_983_186n,
    issuedAt,
    nonce,
  }),
  payload: { ok: true },
}));

const typed = challenge.typedData!;
const signature = await account.signTypedData(typed as Parameters<typeof account.signTypedData>[0]);
const consumed = await consumeChallenge<{ ok: true }>(challenge.id, signature);
console.log("signature verified for", consumed.wallet, "payload bytes", serializeTypedData(typed).length);

// A tampered signature must be rejected.
const bad = issueChallenge<{ ok: true }>(account.address, () => ({ typedData: typed, payload: { ok: true } }));
try {
  await consumeChallenge(bad.id, signature.replace(/.$/, signature.endsWith("a") ? "b" : "a"));
  throw new Error("tampered signature was accepted");
} catch (error) {
  console.log("tampered signature rejected:", (error as Error).message);
}

// Merkle: five receipts, prove each one.
const rows = Array.from({ length: 5 }, (_, i) => ({
  id: `r${i}`,
  ballotItemId: "AMC-2026-09-24-1",
  wallet: account.address,
  choice: i % 2 ? "against" : "for",
  shareEquivalent: (BigInt(i + 1) * 1_000000000000000000n).toString(),
  closeWeight: i === 4 ? "500000000000000000" : null,
  blockNumber: 64_983_186,
  signature,
}));
const leaves = rows.map((row) => leafHash(canonicalReceipt(row)));
const root = merkleRoot(leaves);
for (let i = 0; i < leaves.length; i++) {
  const proof = merkleProof(leaves, i);
  if (!verifyProof(leaves[i]!, proof, root)) throw new Error(`proof ${i} failed`);
}
if (verifyProof(leaves[0]!, merkleProof(leaves, 1), root)) throw new Error("wrong proof accepted");
console.log("merkle root", root, "— 5/5 proofs verify, mismatched proof rejected");

const tally = computeTally(choicesFor({ type: "charter_amendment", approvalStandard: "Majority of shares outstanding" }), rows.map((row) => ({ choice: row.choice, weight: BigInt(row.closeWeight ?? row.shareEquivalent) })));
console.log("tally", tally.rows.map((row) => `${row.label} ${row.weightFloat} (${row.share}%)`).join(", "), "leading:", tally.leading);
