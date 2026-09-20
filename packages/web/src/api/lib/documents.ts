import { canonicalJson } from "./timestamps";

/** The frozen, hashable form of one item's attestation. Everything in it is already public. */
export function attestationDocument(input: {
  itemId: string;
  ballotId: string;
  symbol: string;
  index: string;
  title: string;
  merkleRoot: string;
  leafCount: number;
  tally: { rows: Array<{ value: string; weight: string; wallets: number }>; totalWeight: string; wallets: number };
  blockNumber: number;
  attestedAt: number;
}): string {
  return canonicalJson({
    type: "redeem.attestation",
    version: 1,
    note: "Intent of Robinhood Stock Token holders. Not a shareholder vote.",
    itemId: input.itemId,
    ballotId: input.ballotId,
    symbol: input.symbol,
    index: input.index,
    title: input.title,
    merkleRoot: input.merkleRoot,
    leafCount: input.leafCount,
    tally: { rows: input.tally.rows.map((row) => ({ value: row.value, weight: row.weight, wallets: row.wallets })), totalWeight: input.tally.totalWeight, wallets: input.tally.wallets },
    blockNumber: input.blockNumber,
    attestedAt: input.attestedAt,
  });
}
