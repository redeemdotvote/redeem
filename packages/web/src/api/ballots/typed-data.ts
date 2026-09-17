import type { Address, TypedDataDefinition } from "viem";

/**
 * The EIP-712 payload a holder signs. Every field a tally depends on is inside the signed
 * struct — the wallet, the token, the choice, the position and the block it was read at — so a
 * receipt is verifiable on its own, with nothing looked up from Redeem.
 */
export const DOMAIN = {
  name: "Redeem",
  version: "1",
  chainId: 4663,
} as const;

export const INSTRUCTION_TYPES = {
  BallotInstruction: [
    { name: "ballotItem", type: "string" },
    { name: "proposal", type: "string" },
    { name: "stock", type: "string" },
    { name: "token", type: "address" },
    { name: "wallet", type: "address" },
    { name: "choice", type: "string" },
    { name: "delegate", type: "address" },
    { name: "rawBalance", type: "uint256" },
    { name: "uiMultiplier", type: "uint256" },
    { name: "shareEquivalent", type: "uint256" },
    { name: "block", type: "uint256" },
    { name: "issuedAt", type: "string" },
    { name: "nonce", type: "string" },
    { name: "statement", type: "string" },
  ],
} as const;

export const INSTRUCTION_STATEMENT =
  "This is a signed statement of intent from a Robinhood Stock Token holder, recorded by Redeem. It is intent, not a shareholder vote. " +
  "It is weighted by the share-equivalent read from Robinhood Chain at the stated block. It is not a legal proxy, " +
  "does not instruct the issuer or any broker, and confers no shareholder right. Redeem is independent and not affiliated with Robinhood.";

export interface InstructionFacts {
  ballotItemId: string;
  proposal: string;
  stock: string;
  token: Address;
  wallet: Address;
  choice: string;
  delegate: Address;
  rawBalance: bigint;
  uiMultiplier: bigint;
  shareEquivalent: bigint;
  block: bigint;
  issuedAt: string;
  nonce: string;
}

export function buildInstructionTypedData(facts: InstructionFacts): TypedDataDefinition {
  return {
    domain: DOMAIN,
    types: INSTRUCTION_TYPES,
    primaryType: "BallotInstruction",
    message: {
      ballotItem: facts.ballotItemId,
      proposal: facts.proposal,
      stock: facts.stock,
      token: facts.token,
      wallet: facts.wallet,
      choice: facts.choice,
      delegate: facts.delegate,
      rawBalance: facts.rawBalance,
      uiMultiplier: facts.uiMultiplier,
      shareEquivalent: facts.shareEquivalent,
      block: facts.block,
      issuedAt: facts.issuedAt,
      nonce: facts.nonce,
      statement: INSTRUCTION_STATEMENT,
    },
  };
}

/** bigint-safe JSON for storing and returning typed data verbatim. */
export function serializeTypedData(data: TypedDataDefinition): string {
  return JSON.stringify(data, (_key, value) => (typeof value === "bigint" ? value.toString() : value));
}

export const NON_BINDING_DISCLOSURE = [
  "This record is a statement of a token holder's instruction or position. It is not a vote cast at a",
  "meeting, not an instruction to any issuer, broker or transfer agent, and it creates no shareholder",
  "right. Robinhood Stock Tokens are ERC-20 tokens issued by Robinhood Assets (Jersey) Limited, backed",
  "1:1 by shares held in custody, that carry the economics of the share. Shareholder voting and in-kind",
  "redemption for token holders are on the issuer's roadmap and are not live. Redeem keeps the record.",
].join("\n");

export interface RedemptionFacts {
  wallet: string;
  symbol: string;
  contractAddress: string;
  requestedFormatted: string;
  heldFormatted: string;
  jurisdiction: string;
  acknowledgements: string[];
  termsHash: string;
  blockNumber: string;
  issuedAt: string;
  nonce: string;
}

export const REDEMPTION_TERMS = [
  "In-kind redemption of Robinhood Stock Tokens for shares is on the issuer's roadmap and is not live.",
  "Availability is subject to issuer and platform rules. Geographical restrictions apply; US persons may be restricted where applicable.",
  "Robinhood, not Redeem, determines actual redemption eligibility. Redeem is not the issuer and does not custody tokens.",
  "Joining this queue records a timestamped, signed request. It does not guarantee redemption, settlement, priority or any outcome.",
].join("\n");

export const ACKNOWLEDGEMENT_KEYS = ["not_live", "eligibility_by_issuer", "restrictions", "no_guarantee"] as const;

/** The exact text a holder signs to place a redemption-readiness request. */
export function buildRedemptionMessage(facts: RedemptionFacts): string {
  return [
    "Redeem — Redemption readiness request (non-binding)",
    "",
    `Wallet: ${facts.wallet}`,
    `Token: ${facts.symbol} (${facts.contractAddress})`,
    "Chain: Robinhood Chain (chain id 4663)",
    `Observed at block: ${facts.blockNumber}`,
    `Held share-equivalent: ${facts.heldFormatted}`,
    `Requested share-equivalent: ${facts.requestedFormatted}`,
    `Jurisdiction: ${facts.jurisdiction}`,
    `Acknowledged: ${facts.acknowledgements.join(", ")}`,
    `Terms (sha256): ${facts.termsHash}`,
    "",
    REDEMPTION_TERMS,
    "",
    NON_BINDING_DISCLOSURE,
    "",
    `Issued at: ${facts.issuedAt}`,
    `Nonce: ${facts.nonce}`,
  ].join("\n");
}
