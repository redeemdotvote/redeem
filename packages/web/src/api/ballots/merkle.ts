import { keccak256, toBytes, toHex, type Hex } from "viem";

/**
 * A plain sorted-pair Merkle tree over receipt hashes. Sorting each pair before hashing means a
 * proof is just the list of sibling hashes — no left/right flags — and anyone can recompute the
 * root from the receipts alone.
 */
export function leafHash(canonicalJson: string): Hex {
  return keccak256(toBytes(canonicalJson));
}

function hashPair(a: Hex, b: Hex): Hex {
  const [lo, hi] = a.toLowerCase() < b.toLowerCase() ? [a, b] : [b, a];
  return keccak256(`0x${lo.slice(2)}${hi.slice(2)}` as Hex);
}

export function merkleRoot(leaves: Hex[]): Hex {
  if (leaves.length === 0) return toHex(new Uint8Array(32));
  let level = [...leaves];
  while (level.length > 1) {
    const next: Hex[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i]!;
      const right = level[i + 1] ?? left;
      next.push(hashPair(left, right));
    }
    level = next;
  }
  return level[0]!;
}

export function merkleProof(leaves: Hex[], index: number): Hex[] {
  const proof: Hex[] = [];
  let level = [...leaves];
  let position = index;
  while (level.length > 1) {
    const sibling = position % 2 === 0 ? position + 1 : position - 1;
    proof.push(level[sibling] ?? level[position]!);
    const next: Hex[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i]!;
      const right = level[i + 1] ?? left;
      next.push(hashPair(left, right));
    }
    level = next;
    position = Math.floor(position / 2);
  }
  return proof;
}

export function verifyProof(leaf: Hex, proof: Hex[], root: Hex): boolean {
  let hash = leaf;
  for (const sibling of proof) hash = hashPair(hash, sibling);
  return hash.toLowerCase() === root.toLowerCase();
}
