import { randomUUID } from "node:crypto";
import { recoverMessageAddress, verifyTypedData, type Address, type TypedDataDefinition } from "viem";

/**
 * Anything a holder records is signed by their wallet, and the facts inside the signed payload
 * (balance, multiplier, block) are the ones *this server* read from chain — never numbers the
 * browser supplied. The flow is: prepare → the server reads chain state and issues the exact
 * payload → the wallet signs it → commit returns the signature and the challenge id.
 *
 * Challenges live in memory for ten minutes. A signature is only ever verified against a stored
 * payload, so a client cannot sign a statement of its own invention.
 */
export interface Challenge<T> {
  id: string;
  wallet: Address;
  /** Plain-text message (personal_sign) — used by the redemption queue. */
  message: string | null;
  /** EIP-712 payload (signTypedData) — used by ballot instructions. */
  typedData: TypedDataDefinition | null;
  payload: T;
  issuedAt: string;
  expiresAt: number;
}

const TTL_MS = 10 * 60 * 1000;
const store = new Map<string, Challenge<unknown>>();

function sweep() {
  const now = Date.now();
  for (const [id, challenge] of store) {
    if (challenge.expiresAt < now) store.delete(id);
  }
}

export function issueChallenge<T>(
  wallet: Address,
  build: (facts: { nonce: string; issuedAt: string }) => { message?: string; typedData?: TypedDataDefinition; payload: T },
): Challenge<T> {
  sweep();
  const id = randomUUID();
  const issuedAt = new Date().toISOString();
  const built = build({ nonce: id, issuedAt });
  const challenge: Challenge<T> = {
    id,
    wallet,
    message: built.message ?? null,
    typedData: built.typedData ?? null,
    payload: built.payload,
    issuedAt,
    expiresAt: Date.now() + TTL_MS,
  };
  store.set(id, challenge as Challenge<unknown>);
  return challenge;
}

export class ChallengeError extends Error {}

/** Verifies the signature against the stored payload and consumes the challenge. */
export async function consumeChallenge<T>(id: string, signature: string): Promise<Challenge<T>> {
  sweep();
  const challenge = store.get(id) as Challenge<T> | undefined;
  if (!challenge) throw new ChallengeError("This signing request expired. Refresh and try again.");

  let valid = false;
  try {
    if (challenge.typedData) {
      valid = await verifyTypedData({
        ...(challenge.typedData as Parameters<typeof verifyTypedData>[0]),
        address: challenge.wallet,
        signature: signature as `0x${string}`,
      });
    } else if (challenge.message) {
      const recovered = await recoverMessageAddress({ message: challenge.message, signature: signature as `0x${string}` });
      valid = recovered.toLowerCase() === challenge.wallet.toLowerCase();
    }
  } catch {
    throw new ChallengeError("That signature could not be read.");
  }
  if (!valid) throw new ChallengeError("The signature was produced by a different address.");

  store.delete(id);
  return challenge;
}
