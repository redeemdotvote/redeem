import { eq, sql } from "drizzle-orm";
import { db } from "./__client";
import { indexerCursors } from "./schema";

/**
 * The schema is applied at boot with idempotent DDL, so a fresh SQLite file, a Turso database
 * and a long-lived deployment all converge on the same tables without a separate migrate step.
 * `drizzle-kit generate/push` remain available for anyone who prefers managed migrations.
 */
const DDL = [
  `CREATE TABLE IF NOT EXISTS ballots (
    id TEXT PRIMARY KEY, symbol TEXT NOT NULL, cik TEXT NOT NULL, accession TEXT NOT NULL, form TEXT NOT NULL,
    filed_at TEXT NOT NULL, doc_url TEXT NOT NULL, company_name TEXT NOT NULL, meeting_type TEXT NOT NULL,
    meeting_date TEXT NOT NULL, meeting_time TEXT, meeting_format TEXT, meeting_url TEXT, record_date TEXT,
    closes_at INTEGER NOT NULL, published_at INTEGER NOT NULL)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS ballots_accession_uq ON ballots(accession)`,
  `CREATE INDEX IF NOT EXISTS ballots_symbol_idx ON ballots(symbol)`,
  `CREATE INDEX IF NOT EXISTS ballots_closes_idx ON ballots(closes_at)`,
  `CREATE TABLE IF NOT EXISTS ballot_items (
    id TEXT PRIMARY KEY, ballot_id TEXT NOT NULL, symbol TEXT NOT NULL, ordinal INTEGER NOT NULL, "index" TEXT NOT NULL,
    title TEXT NOT NULL, summary TEXT NOT NULL, item_type TEXT NOT NULL, proponent TEXT NOT NULL,
    board_recommendation TEXT NOT NULL, approval_standard TEXT, abstain_effect TEXT, broker_non_vote_effect TEXT,
    routine INTEGER, choices TEXT NOT NULL, nominees TEXT NOT NULL DEFAULT '[]')`,
  `CREATE INDEX IF NOT EXISTS ballot_items_ballot_idx ON ballot_items(ballot_id)`,
  `CREATE INDEX IF NOT EXISTS ballot_items_symbol_idx ON ballot_items(symbol)`,
  `CREATE TABLE IF NOT EXISTS instructions (
    id TEXT PRIMARY KEY, ballot_item_id TEXT NOT NULL, ballot_id TEXT NOT NULL, symbol TEXT NOT NULL,
    contract_address TEXT NOT NULL, wallet TEXT NOT NULL, choice TEXT NOT NULL, choice_label TEXT NOT NULL,
    delegate TEXT NOT NULL DEFAULT '0x0000000000000000000000000000000000000000', raw_balance TEXT NOT NULL, ui_multiplier TEXT NOT NULL, share_equivalent TEXT NOT NULL, block_number INTEGER NOT NULL,
    typed_data TEXT NOT NULL, signature TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', supersedes_id TEXT,
    close_balance TEXT, close_weight TEXT, created_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS instructions_item_idx ON instructions(ballot_item_id)`,
  `CREATE INDEX IF NOT EXISTS instructions_wallet_idx ON instructions(wallet)`,
  `CREATE INDEX IF NOT EXISTS instructions_ballot_idx ON instructions(ballot_id)`,
  `CREATE TABLE IF NOT EXISTS attestations (
    id TEXT PRIMARY KEY, ballot_item_id TEXT NOT NULL, ballot_id TEXT NOT NULL, symbol TEXT NOT NULL,
    merkle_root TEXT NOT NULL, leaf_count INTEGER NOT NULL, tally TEXT NOT NULL, leaves TEXT NOT NULL,
    block_number INTEGER NOT NULL, channel TEXT NOT NULL DEFAULT 'computed', tx_hash TEXT, created_at INTEGER NOT NULL)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS attestations_item_uq ON attestations(ballot_item_id)`,
  `CREATE TABLE IF NOT EXISTS redemption_requests (
    id TEXT PRIMARY KEY, wallet TEXT NOT NULL, symbol TEXT NOT NULL, position INTEGER NOT NULL,
    requested_share_equivalent TEXT NOT NULL, held_share_equivalent TEXT NOT NULL, block_number INTEGER NOT NULL,
    jurisdiction TEXT, acknowledgements TEXT NOT NULL, terms_hash TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'waiting',
    message TEXT NOT NULL, signature TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS redemption_requests_wallet_symbol_uq ON redemption_requests(wallet, symbol)`,
  `CREATE INDEX IF NOT EXISTS redemption_requests_symbol_idx ON redemption_requests(symbol)`,
  `CREATE TABLE IF NOT EXISTS snapshots (
    id TEXT PRIMARY KEY, wallet TEXT NOT NULL, block_number INTEGER NOT NULL, chain_id INTEGER NOT NULL DEFAULT 4663,
    payload TEXT NOT NULL, digest TEXT NOT NULL, total_usd TEXT NOT NULL, position_count INTEGER NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS snapshots_wallet_idx ON snapshots(wallet)`,
  `CREATE TABLE IF NOT EXISTS corporate_actions (
    id TEXT PRIMARY KEY, symbol TEXT NOT NULL, contract_address TEXT NOT NULL, old_multiplier TEXT NOT NULL,
    new_multiplier TEXT NOT NULL, effective_at INTEGER NOT NULL, block_number INTEGER NOT NULL, tx_hash TEXT NOT NULL,
    log_index INTEGER NOT NULL, observed_at INTEGER NOT NULL)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS corporate_actions_log_uq ON corporate_actions(tx_hash, log_index)`,
  `CREATE INDEX IF NOT EXISTS corporate_actions_symbol_idx ON corporate_actions(symbol)`,
  `CREATE TABLE IF NOT EXISTS indexer_cursors (
    key TEXT PRIMARY KEY, last_block INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'idle', detail TEXT,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()))`,
];

const ADDED_COLUMNS: Array<[string, string, string]> = [
  ["instructions", "delegate", "TEXT NOT NULL DEFAULT '0x0000000000000000000000000000000000000000'"],
];

/** Bump when DDL or ADDED_COLUMNS change; a database already at this version skips the DDL pass. */
export const SCHEMA_VERSION = "2026-09-17.1";
const SCHEMA_CURSOR = "schema:version";

/** Reads a marker row from indexer_cursors; null when the row or the table is missing. */
export async function readMarker(key: string): Promise<string | null> {
  try {
    const rows = await db.select({ detail: indexerCursors.detail }).from(indexerCursors).where(eq(indexerCursors.key, key)).limit(1);
    return rows[0]?.detail ?? null;
  } catch {
    return null;
  }
}

export async function writeMarker(key: string, detail: string): Promise<void> {
  const values = { key, lastBlock: 0, status: "applied", detail, updatedAt: new Date() };
  await db.insert(indexerCursors).values(values).onConflictDoUpdate({ target: indexerCursors.key, set: { status: values.status, detail, updatedAt: values.updatedAt } });
}

let ready: Promise<void> | null = null;

export function ensureSchema(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      // On a serverless host every cold start boots again and each statement is a network round
      // trip, so a database already at the current version is left alone after one read.
      if ((await readMarker(SCHEMA_CURSOR)) === SCHEMA_VERSION) return;
      for (const statement of DDL) await db.run(sql.raw(statement));
      // Columns added after a table first shipped. CREATE TABLE IF NOT EXISTS leaves an existing
      // table untouched, so each addition is checked against the live column list.
      for (const [table, column, definition] of ADDED_COLUMNS) {
        const info = await db.all<{ name: string }>(sql.raw(`PRAGMA table_info(${table})`));
        if (!info.some((row) => row.name === column)) {
          await db.run(sql.raw(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`));
        }
      }
      await writeMarker(SCHEMA_CURSOR, SCHEMA_VERSION);
    })();
  }
  return ready;
}
