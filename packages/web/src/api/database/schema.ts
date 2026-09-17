import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * Redeem keeps a record. Nothing in this schema casts a vote, moves a token, or creates a
 * shareholder right: every row is either public chain state mirrored for durability, a signed
 * instruction from a wallet, or a fingerprint computed over those instructions.
 */

/** One stockholder meeting, extracted from the issuer's proxy statement (DEF 14A). */
export const ballots = sqliteTable(
  "ballots",
  {
    id: text("id").primaryKey(),
    symbol: text("symbol").notNull(),
    cik: text("cik").notNull(),
    /** SEC accession number of the proxy statement, e.g. 0001193125-26-123456. */
    accession: text("accession").notNull(),
    form: text("form").notNull(),
    filedAt: text("filed_at").notNull(),
    docUrl: text("doc_url").notNull(),
    companyName: text("company_name").notNull(),
    /** "annual" | "special" */
    meetingType: text("meeting_type").notNull(),
    meetingDate: text("meeting_date").notNull(),
    meetingTime: text("meeting_time"),
    meetingFormat: text("meeting_format"),
    meetingUrl: text("meeting_url"),
    /** The issuer's record date, from the proxy. Always predates or is unrelated to token issuance. */
    recordDate: text("record_date"),
    /** Instructions close at this instant (unix seconds), ahead of the meeting. */
    closesAt: integer("closes_at").notNull(),
    publishedAt: integer("published_at").notNull(),
  },
  (t) => [uniqueIndex("ballots_accession_uq").on(t.accession), index("ballots_symbol_idx").on(t.symbol), index("ballots_closes_idx").on(t.closesAt)],
);

/** One matter stockholders are asked to vote on. */
export const ballotItems = sqliteTable(
  "ballot_items",
  {
    id: text("id").primaryKey(),
    ballotId: text("ballot_id").notNull(),
    symbol: text("symbol").notNull(),
    /** Position within the meeting, for ordering. */
    ordinal: integer("ordinal").notNull(),
    /** As printed in the proxy: "1", "2", "4a". */
    index: text("index").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    itemType: text("item_type").notNull(),
    /** "board" | "shareholder" */
    proponent: text("proponent").notNull(),
    /** "for" | "against" | "one_year" | "two_years" | "three_years" | "none" */
    boardRecommendation: text("board_recommendation").notNull(),
    approvalStandard: text("approval_standard"),
    abstainEffect: text("abstain_effect"),
    brokerNonVoteEffect: text("broker_non_vote_effect"),
    routine: integer("routine", { mode: "boolean" }),
    /** JSON: [{ value, label, tone }] — the choices a holder can sign. */
    choices: text("choices").notNull(),
    /** JSON: string[] — director nominees on an election item. */
    nominees: text("nominees").notNull().default("[]"),
  },
  (t) => [index("ballot_items_ballot_idx").on(t.ballotId), index("ballot_items_symbol_idx").on(t.symbol)],
);

/**
 * A signed instruction — the receipt. The weight is the position the server read from chain at
 * the block the instruction was issued; the browser never supplies it. Re-signing supersedes,
 * never deletes.
 */
export const instructions = sqliteTable(
  "instructions",
  {
    id: text("id").primaryKey(),
    ballotItemId: text("ballot_item_id").notNull(),
    ballotId: text("ballot_id").notNull(),
    symbol: text("symbol").notNull(),
    contractAddress: text("contract_address").notNull(),
    wallet: text("wallet").notNull(),
    choice: text("choice").notNull(),
    choiceLabel: text("choice_label").notNull(),
    /** Address named on a delegate intent; zero address otherwise. */
    delegate: text("delegate").notNull().default("0x0000000000000000000000000000000000000000"),
    rawBalance: text("raw_balance").notNull(),
    uiMultiplier: text("ui_multiplier").notNull(),
    /** rawBalance × uiMultiplier ÷ 1e18 — the share equivalent at signing, 18-decimal string. */
    shareEquivalent: text("share_equivalent").notNull(),
    blockNumber: integer("block_number").notNull(),
    /** The full EIP-712 payload (domain, types, primaryType, message), stored verbatim. */
    typedData: text("typed_data").notNull(),
    signature: text("signature").notNull(),
    /** "active" | "superseded" */
    status: text("status").notNull().default("active"),
    supersedesId: text("supersedes_id"),
    /** Filled at close: the balance still held, and the weight that counted. */
    closeBalance: text("close_balance"),
    closeWeight: text("close_weight"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index("instructions_item_idx").on(t.ballotItemId),
    index("instructions_wallet_idx").on(t.wallet),
    index("instructions_ballot_idx").on(t.ballotId),
  ],
);

/** The closed tally of one item, folded into a Merkle root over its receipts. */
export const attestations = sqliteTable(
  "attestations",
  {
    id: text("id").primaryKey(),
    ballotItemId: text("ballot_item_id").notNull(),
    ballotId: text("ballot_id").notNull(),
    symbol: text("symbol").notNull(),
    merkleRoot: text("merkle_root").notNull(),
    leafCount: integer("leaf_count").notNull(),
    /** JSON tally: per choice, weight and wallets, plus totals. */
    tally: text("tally").notNull(),
    /** JSON ordered list of leaf hashes, so any receipt's proof can be rebuilt. */
    leaves: text("leaves").notNull(),
    /** Chain head when the close re-check ran. */
    blockNumber: integer("block_number").notNull(),
    /** "computed" today; "onchain" once an attestation contract exists. */
    channel: text("channel").notNull().default("computed"),
    txHash: text("tx_hash"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [uniqueIndex("attestations_item_uq").on(t.ballotItemId)],
);

/**
 * A redemption-readiness request: one wallet, one ticker, a requested share-equivalent, and the
 * acknowledgements that make the pack complete. In-kind redemption is not live; a request is a
 * signed, timestamped place in a ticker-specific queue and promises no settlement.
 */
export const redemptionRequests = sqliteTable(
  "redemption_requests",
  {
    id: text("id").primaryKey(),
    wallet: text("wallet").notNull(),
    symbol: text("symbol").notNull(),
    /** Per-ticker place in line, in the order signatures arrived. */
    position: integer("position").notNull(),
    /** Requested share-equivalent, 18-decimal string. */
    requestedShareEquivalent: text("requested_share_equivalent").notNull(),
    /** Share-equivalent the wallet held when it signed, 18-decimal string. */
    heldShareEquivalent: text("held_share_equivalent").notNull(),
    blockNumber: integer("block_number").notNull(),
    jurisdiction: text("jurisdiction"),
    /** JSON: the acknowledgement keys the holder accepted. */
    acknowledgements: text("acknowledgements").notNull(),
    /** SHA-256 of the eligibility terms text the holder acknowledged. */
    termsHash: text("terms_hash").notNull(),
    /** "waiting" | "restricted" | "withdrawn" */
    status: text("status").notNull().default("waiting"),
    message: text("message").notNull(),
    signature: text("signature").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [uniqueIndex("redemption_requests_wallet_symbol_uq").on(t.wallet, t.symbol), index("redemption_requests_symbol_idx").on(t.symbol)],
);

/** A certified statement: the holder's positions at one block, hashed so it can be proven later. */
export const snapshots = sqliteTable(
  "snapshots",
  {
    id: text("id").primaryKey(),
    wallet: text("wallet").notNull(),
    blockNumber: integer("block_number").notNull(),
    chainId: integer("chain_id").notNull().default(4663),
    payload: text("payload").notNull(),
    digest: text("digest").notNull(),
    totalUsd: text("total_usd").notNull(),
    positionCount: integer("position_count").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("snapshots_wallet_idx").on(t.wallet)],
);

/** UIMultiplierUpdated events, mirrored from chain so history survives RPC rate limits. */
export const corporateActions = sqliteTable(
  "corporate_actions",
  {
    id: text("id").primaryKey(),
    symbol: text("symbol").notNull(),
    contractAddress: text("contract_address").notNull(),
    oldMultiplier: text("old_multiplier").notNull(),
    newMultiplier: text("new_multiplier").notNull(),
    effectiveAt: integer("effective_at").notNull(),
    blockNumber: integer("block_number").notNull(),
    txHash: text("tx_hash").notNull(),
    logIndex: integer("log_index").notNull(),
    observedAt: integer("observed_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [uniqueIndex("corporate_actions_log_uq").on(t.txHash, t.logIndex), index("corporate_actions_symbol_idx").on(t.symbol)],
);

/** How far the log scan has walked, per stream, so a rate-limited scan can resume. */
export const indexerCursors = sqliteTable("indexer_cursors", {
  key: text("key").primaryKey(),
  lastBlock: integer("last_block").notNull().default(0),
  status: text("status").notNull().default("idle"),
  detail: text("detail"),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});
