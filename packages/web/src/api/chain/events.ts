import { parseAbiItem, type Address, type Hex } from "viem";
import { db } from "../database";
import * as schema from "../database/schema";
import { cached, isRateLimited, type Cached } from "./cache";
import { RPC_URL, publicClient } from "./chain";
import { addressTopic, rpcGetLogs, RpcCallError, type RawLog } from "./rpc";
import { getBalances } from "./market";
import { TOKEN_ADDRESSES, TOKENS, findToken } from "./tokens";

const UI_MULTIPLIER_UPDATED = parseAbiItem(
  "event UIMultiplierUpdated(uint256 oldMultiplier, uint256 newMultiplier, uint256 effectiveAtTimestamp)",
);

/**
 * Robinhood Chain produces a block roughly every 100ms and its logs come back without a usable
 * `blockTimestamp`, so resolving a timestamp per log would mean one RPC round trip per row on a
 * rate-limited endpoint. Instead we interpolate against a measured anchor pair and label the
 * result as approximate in the UI. Corporate actions never rely on this — their `effectiveAt`
 * is carried in the event payload itself.
 */
const ANCHOR = { block: 64_851_329, timestamp: 1_789_596_210 };

/** Address-filter size per corporate-action query — the endpoint refuses lists much longer. */
const ACTION_SCAN_ADDRESSES = 40;
const HISTORICAL_ANCHOR = { block: 36_345_344, timestamp: 1_786_719_786 };
const SECONDS_PER_BLOCK =
  (ANCHOR.timestamp - HISTORICAL_ANCHOR.timestamp) / (ANCHOR.block - HISTORICAL_ANCHOR.block);

export function estimateBlockTimestamp(blockNumber: number, head?: { block: number; timestamp: number }): number {
  const anchor = head ?? ANCHOR;
  return Math.round(anchor.timestamp - (anchor.block - blockNumber) * SECONDS_PER_BLOCK);
}

export interface CorporateAction {
  symbol: string;
  contractAddress: string;
  oldMultiplier: string;
  newMultiplier: string;
  /** Percentage change the action applied to the UI multiplier. */
  changeBps: number;
  effectiveAt: number;
  blockNumber: number;
  txHash: string;
  logIndex: number;
}

function changeBps(oldMultiplier: bigint, newMultiplier: bigint): number {
  if (oldMultiplier === 0n) return 0;
  return Number(((newMultiplier - oldMultiplier) * 1_000_000n) / oldMultiplier) / 100;
}

/**
 * Pulls every UIMultiplierUpdated event for the tracked tokens in a single filtered
 * `eth_getLogs` over the full range (verified to work and stay cheap on 4663 — the topic
 * filter keeps the result to a handful of rows), mirrors them into SQLite so history survives
 * an RPC that stops answering, and records how far the scan got.
 */
async function syncCorporateActions(): Promise<CorporateAction[]> {
  const head = await publicClient.getBlockNumber();
  try {
    // The endpoint caps the address filter well below the size of the registry, so the scan
    // asks for the tokens a few dozen at a time. Each query is one round trip over the whole
    // chain; the topic filter keeps every answer to a handful of rows.
    const logs: Awaited<ReturnType<typeof publicClient.getLogs<typeof UI_MULTIPLIER_UPDATED>>> = [];
    for (let offset = 0; offset < TOKEN_ADDRESSES.length; offset += ACTION_SCAN_ADDRESSES) {
      const part = await publicClient.getLogs({
        address: TOKEN_ADDRESSES.slice(offset, offset + ACTION_SCAN_ADDRESSES) as unknown as Address[],
        event: UI_MULTIPLIER_UPDATED,
        fromBlock: 0n,
        toBlock: head,
      });
      logs.push(...part);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    for (const log of logs) {
      const token = TOKENS.find((entry) => entry.address.toLowerCase() === log.address.toLowerCase());
      if (!token || !log.transactionHash) continue;
      const args = log.args as { oldMultiplier?: bigint; newMultiplier?: bigint; effectiveAtTimestamp?: bigint };
      await db
        .insert(schema.corporateActions)
        .values({
          id: `${log.transactionHash}:${log.logIndex ?? 0}`,
          symbol: token.symbol,
          contractAddress: token.address,
          oldMultiplier: (args.oldMultiplier ?? 0n).toString(),
          newMultiplier: (args.newMultiplier ?? 0n).toString(),
          effectiveAt: Number(args.effectiveAtTimestamp ?? 0n),
          blockNumber: Number(log.blockNumber ?? 0n),
          txHash: log.transactionHash,
          logIndex: Number(log.logIndex ?? 0),
        })
        .onConflictDoNothing();
    }

    await setCursor("corporate_actions", Number(head), "idle", `${logs.length} events mirrored`);
  } catch (error) {
    await setCursor(
      "corporate_actions",
      0,
      isRateLimited(error) ? "rate_limited" : "error",
      error instanceof Error ? error.message.slice(0, 200) : "unknown error",
    );
  }

  const rows = await db.select().from(schema.corporateActions);
  return rows
    .map((row) => ({
      symbol: row.symbol,
      contractAddress: row.contractAddress,
      oldMultiplier: row.oldMultiplier,
      newMultiplier: row.newMultiplier,
      changeBps: changeBps(BigInt(row.oldMultiplier), BigInt(row.newMultiplier)),
      effectiveAt: row.effectiveAt,
      blockNumber: row.blockNumber,
      txHash: row.txHash,
      logIndex: row.logIndex,
    }))
    .sort((a, b) => b.blockNumber - a.blockNumber);
}

async function setCursor(key: string, lastBlock: number, status: string, detail: string) {
  const values = { key, lastBlock, status, detail, updatedAt: new Date() };
  await db
    .insert(schema.indexerCursors)
    .values(values)
    .onConflictDoUpdate({
      target: schema.indexerCursors.key,
      set: { lastBlock, status, detail, updatedAt: new Date() },
    });
}

/** Scan state per stream, so the UI can say plainly when chain history is behind. */
export function getIndexerStatus() {
  return db.select().from(schema.indexerCursors);
}

/** Corporate action history, refreshed from chain at most once every five minutes. */
export function getCorporateActions(): Promise<Cached<CorporateAction[]>> {
  return cached("corporate-actions", 300_000, syncCorporateActions);
}

export interface TransferRecord {
  symbol: string;
  from: string;
  to: string;
  /** Raw ERC-20 value, 18 decimals. */
  value: string;
  direction: "in" | "out" | "self";
  blockNumber: number;
  /** Interpolated from block height — approximate, and labelled as such. */
  approxTimestamp: number;
  txHash: string;
  /** Position in the block's logs — two transfers can share a tx, sender and recipient. */
  logIndex: number;
}

/**
 * Transfer history is the one read this RPC genuinely struggles with, and its three limits were
 * measured rather than guessed. Block range on its own is not one of them — a 20,000,000-block
 * span that matches nothing comes back in 118ms. What the endpoint enforces is:
 *
 *  - a query budget of roughly two seconds, after which it answers "log query timed out";
 *  - a hard cap of ten thousand logs in one response ("logs matched by query exceeds limit");
 *  - a concurrency limit — six parallel requests were all answered `429`, even matching nothing.
 *
 * The first two mean "ask for a narrower span" and the third means "ask again in a moment", so
 * they get opposite treatment: narrow the window, or hold the window and back off. Conflating
 * them is what made an empty wallet spend a minute narrowing to nothing, since every 429 spent
 * another slice of the budget while the endpoint was only asking to be left alone briefly.
 *
 * The scan runs newest-first and stops at the first span it cannot read at the narrowest width,
 * because skipping a span and carrying on into older blocks produced the worst possible result:
 * month-old transfers presented as the newest activity, because the recent span had quietly
 * 429'd. Reporting the range actually covered is the honest alternative.
 */
const SCAN_WINDOW_START = 2_000_000n;
const SCAN_WINDOW_MIN = 25_000n;
/**
 * Widening stops here. A 16,000,000-block span does come back in ~100ms when the endpoint is
 * unloaded, but measured over a full empty-wallet scan it blew the query budget on five of
 * fourteen spans and each failure cost a query slot to re-ask at a quarter of the width — so the
 * wider cap made the scan slower *and* occasionally left it reporting incomplete history after
 * running out of budget short of the floor. Four million is the width that held up every time.
 */
const SCAN_WINDOW_MAX = 4_000_000n;
/** Blocks below this are never queried — the genesis end of the range is what times out. */
const SCAN_FLOOR = 500_000n;
/**
 * Hard ceiling on RPC calls per direction, so one wallet cannot stall the endpoint. Sized to
 * cover the whole chain at SCAN_WINDOW_MAX with room for a few narrowings on the way: reaching
 * the floor is what lets the scan say "no older history" instead of "unknown".
 */
const SCAN_MAX_QUERIES = 24;
/**
 * Backoffs allowed per direction before the scan gives up. Generous, because a rate limit comes
 * back in well under a tenth of a second and waiting it out is the cheapest thing the scan can
 * do — the deadline below is the guard that matters, not this count.
 */
const SCAN_MAX_BACKOFFS = 6;
/**
 * Wall clock the scan is allowed, per direction. Query and backoff ceilings alone are not
 * enough of a guard: a stretch the endpoint dislikes answers slowly *and* fails, so a budget
 * counted in calls can still add up to a minute of waiting on a page load. Time is what the
 * person waiting actually experiences, so time is what is capped — and whatever the scan has
 * reached by then is returned, labelled as not covering older history.
 */
const SCAN_DEADLINE_MS = 12_000;

export interface TransferHistory {
  transfers: TransferRecord[];
  /** True when older history exists that the scan did not cover. */
  partial: boolean;
  /** True when the scan stopped because it had already collected a full page. */
  truncated: boolean;
  /** The oldest block the scan actually covered, and the newest. Rows outside it are unknown. */
  scannedFromBlock: number;
  scannedToBlock: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Set SCAN_DEBUG=1 to print every window the walk asks for, which is how its limits were tuned. */
const scanDebug = (label: string, detail: Record<string, unknown>) => {
  if (!process.env.SCAN_DEBUG) return;
  console.log(`[scan] ${label}`, JSON.stringify(detail, (_key, value) => (typeof value === "bigint" ? Number(value) : value)));
};

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef" as Hex;

/**
 * One window of one direction, asked of the endpoint directly rather than through viem, so the
 * scan can tell a rate limit from a query that was too heavy — see the note in ./rpc.ts. The
 * event is matched by topic and the payload decoded by hand: a Transfer carries `from` and `to`
 * as indexed topics and its value as the whole of `data`, so there is nothing viem's decoder
 * would add here.
 */
function queryTransfers(args: { to: Address } | { from: Address }, fromBlock: bigint, toBlock: bigint, addresses: Address[]) {
  const topics: (Hex | null)[] = [
    TRANSFER_TOPIC,
    "from" in args ? addressTopic(args.from) : null,
    "to" in args ? addressTopic(args.to) : null,
  ];
  return rpcGetLogs(RPC_URL, {
    address: addresses,
    topics,
    fromBlock,
    toBlock,
  });
}

interface TransferLogRow {
  address: Address;
  from: Address;
  to: Address;
  value: bigint;
  blockNumber: bigint;
  transactionHash: Hex;
  logIndex: number;
}

type TransferLog = TransferLogRow[];

function topicToAddress(topic: Hex | undefined): Address {
  if (!topic) return "0x0000000000000000000000000000000000000000";
  return `0x${topic.slice(-40)}` as Address;
}

function decodeTransfer(log: RawLog): TransferLogRow {
  return {
    address: log.address,
    from: topicToAddress(log.topics[1]),
    to: topicToAddress(log.topics[2]),
    value: log.data && log.data !== "0x" ? BigInt(log.data) : 0n,
    blockNumber: log.blockNumber,
    transactionHash: log.transactionHash,
    logIndex: log.logIndex,
  };
}

interface DirectionScan {
  logs: TransferLog;
  /** Oldest block covered without a gap. */
  coveredFrom: bigint;
  /** Why the walk ended: read the whole range, filled a page, or hit a span it could not read. */
  outcome: "complete" | "truncated" | "failed";
}

/**
 * Walks one direction of the wallet's transfers backwards from the head. Incoming and outgoing
 * are scanned separately so that a wallet which is busy on one side does not force the other
 * side's window down with it.
 */
async function scanDirection(
  args: { to: Address } | { from: Address },
  addresses: Address[],
  head: bigint,
  limit: number,
  floor: bigint = SCAN_FLOOR,
): Promise<DirectionScan> {
  const result = await walkDirection(args, addresses, head, limit, floor);
  scanDebug("outcome", {
    dir: "to" in args ? "in" : "out",
    outcome: result.outcome,
    coveredFrom: result.coveredFrom,
    rows: result.logs.length,
  });
  return result;
}

async function walkDirection(
  args: { to: Address } | { from: Address },
  addresses: Address[],
  head: bigint,
  limit: number,
  floor: bigint,
): Promise<DirectionScan> {
  const logs: TransferLog = [];
  const dir = "to" in args ? "in" : "out";
  let toBlock = head;
  let coveredFrom = head;
  let window = SCAN_WINDOW_START;
  let queries = 0;
  let backoffs = 0;
  const deadline = Date.now() + SCAN_DEADLINE_MS;

  while (toBlock > floor) {
    if (queries >= SCAN_MAX_QUERIES || Date.now() > deadline) {
      return { logs, coveredFrom, outcome: "truncated" };
    }

    const fromBlock = toBlock - window > floor ? toBlock - window : floor;
    queries += 1;

    let rows: TransferLog;
    const started = Date.now();
    try {
      rows = (await queryTransfers(args, fromBlock, toBlock, addresses)).map(decodeTransfer);
      scanDebug("span", { dir, fromBlock, toBlock, window, rows: rows.length, ms: Date.now() - started });
    } catch (error) {
      const kind = error instanceof RpcCallError ? error.kind : "other";
      scanDebug("error", {
        dir,
        fromBlock,
        toBlock,
        window,
        ms: Date.now() - started,
        kind,
        message: (error as Error)?.message?.slice(0, 120),
      });
      // A rate limit is about pace, not weight: the same window will answer fine in a moment,
      // and narrowing it would only spend more of the budget asking more often.
      if (kind === "rate-limit") {
        backoffs += 1;
        if (backoffs > SCAN_MAX_BACKOFFS) return { logs, coveredFrom, outcome: "failed" };
        await sleep(400 * backoffs);
        continue;
      }
      // Too heavy — or an unclassifiable failure, which in practice has meant the same thing:
      // ask for a narrower span from the same head.
      if (window > SCAN_WINDOW_MIN) {
        window = window / 4n > SCAN_WINDOW_MIN ? window / 4n : SCAN_WINDOW_MIN;
        continue;
      }
      // Already at the narrowest span and still refused — this stretch is unreadable.
      return { logs, coveredFrom, outcome: "failed" };
    }

    logs.push(...rows);
    coveredFrom = fromBlock;

    if (fromBlock <= floor) return { logs, coveredFrom, outcome: "complete" };
    if (logs.length >= limit) return { logs, coveredFrom, outcome: "truncated" };

    toBlock = fromBlock - 1n;
    // Nothing in that span — reach further back rather than paying for another empty read.
    if (rows.length === 0 && window < SCAN_WINDOW_MAX) {
      window = window * 4n < SCAN_WINDOW_MAX ? window * 4n : SCAN_WINDOW_MAX;
    }
  }

  return { logs, coveredFrom, outcome: "complete" };
}

/**
 * What has already been read for a wallet, so coverage accumulates instead of being redone.
 *
 * A full sweep of this chain is around sixty-five million blocks. Read at the pace the endpoint
 * sustains — roughly four million blocks per query, a query every fifth of a second, both
 * directions — that is comfortably more than anyone will wait for a page, and it was measured
 * getting about halfway before the scan's deadline. Redoing that same half on every visit would
 * mean the older half is never read at all.
 *
 * So each visit does two cheap things instead: it reads the sliver above what is already known,
 * which is what "your latest activity" depends on, and then spends whatever time is left
 * extending the known range further back. Coverage deepens as the wallet is looked at, the rows
 * already collected stay, and the range actually covered is reported rather than implied.
 */
interface WalletCoverage {
  rows: TransferLogRow[];
  coveredFrom: bigint;
  coveredTo: bigint;
}

const coverageByWallet = new Map<string, WalletCoverage>();

/**
 * Coverage lives in process, so it needs a ceiling: without one a long-running server keeps every
 * wallet it was ever asked about. Insertion order is the eviction order and every write re-inserts,
 * which makes this a plain LRU over wallets.
 */
const COVERAGE_MAX_WALLETS = 200;

function rememberCoverage(key: string, coverage: WalletCoverage): void {
  coverageByWallet.delete(key);
  coverageByWallet.set(key, coverage);
  while (coverageByWallet.size > COVERAGE_MAX_WALLETS) {
    const oldest = coverageByWallet.keys().next();
    if (oldest.done) break;
    coverageByWallet.delete(oldest.value);
  }
}

function mergeRows(into: TransferLogRow[], rows: TransferLogRow[]): TransferLogRow[] {
  const seen = new Set(into.map((row) => `${row.transactionHash}:${row.logIndex}`));
  const merged = [...into];
  for (const row of rows) {
    const key = `${row.transactionHash}:${row.logIndex}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(row);
  }
  return merged;
}

/**
 * The endpoint refuses address filters much longer than a few dozen entries and times out on
 * unfiltered scans of any useful span, so the walk is scoped to the tokens the wallet holds
 * right now — for almost every wallet a handful — plus nothing else. History on a token the
 * wallet has fully exited is not read; the coverage flags say so rather than implying it was.
 */
async function scopeAddresses(wallet: Address): Promise<Address[]> {
  const balances = await getBalances(wallet);
  const held = balances.value.filter((entry) => BigInt(entry.rawBalance) > 0n).map((entry) => findToken(entry.symbol)?.address);
  return held.filter((address): address is Address => Boolean(address)).slice(0, SCAN_MAX_ADDRESSES);
}

const SCAN_MAX_ADDRESSES = 40;

async function loadTransfers(wallet: Address, limit: number): Promise<TransferHistory> {
  const addresses = await scopeAddresses(wallet);
  const head = await publicClient.getBlock({ blockTag: "latest", includeTransactions: false });
  if (addresses.length === 0) {
    return { transfers: [], partial: false, truncated: false, scannedFromBlock: Number(head.number), scannedToBlock: Number(head.number) };
  }
  const anchor = { block: Number(head.number), timestamp: Number(head.timestamp) };
  const key = wallet.toLowerCase();
  const known = coverageByWallet.get(key);

  let rows = known?.rows ?? [];
  let coveredFrom = known?.coveredFrom ?? head.number;
  let failed = false;

  // The catch-up: everything newer than the last visit saw. Usually a few hundred thousand
  // blocks, so one quick query a direction.
  if (known && head.number > known.coveredTo) {
    const [fresh, freshOut] = await Promise.all([
      scanDirection({ to: wallet }, addresses, head.number, limit, known.coveredTo + 1n),
      scanDirection({ from: wallet }, addresses, head.number, limit, known.coveredTo + 1n),
    ]);
    rows = mergeRows(rows, [...fresh.logs, ...freshOut.logs]);
    failed = fresh.outcome === "failed" || freshOut.outcome === "failed";
    // A gap between the catch-up and what was known before would be invisible in the output,
    // so if the catch-up could not reach the old ceiling, coverage restarts from the new rows.
    const caughtUp = fresh.coveredFrom <= known.coveredTo + 1n && freshOut.coveredFrom <= known.coveredTo + 1n;
    if (!caughtUp) coveredFrom = fresh.coveredFrom > freshOut.coveredFrom ? fresh.coveredFrom : freshOut.coveredFrom;
  }

  // The extension: carry the known range further back with the time that is left.
  if (coveredFrom > SCAN_FLOOR) {
    const [older, olderOut] = await Promise.all([
      scanDirection({ to: wallet }, addresses, coveredFrom - 1n, limit),
      scanDirection({ from: wallet }, addresses, coveredFrom - 1n, limit),
    ]);
    rows = mergeRows(rows, [...older.logs, ...olderOut.logs]);
    failed = failed || older.outcome === "failed" || olderOut.outcome === "failed";
    // Only as deep as the shallower direction: one side of a ledger reaching further back than
    // the other would read as activity that stopped, rather than history that was not read.
    coveredFrom = older.coveredFrom > olderOut.coveredFrom ? older.coveredFrom : olderOut.coveredFrom;
  }

  rememberCoverage(key, { rows, coveredFrom, coveredTo: head.number });

  const seen = new Set<string>();
  const records: TransferRecord[] = [];
  for (const log of rows) {
    const blockNumber = log.blockNumber ?? 0n;
    if (blockNumber < coveredFrom) continue;
    const rowKey = `${log.transactionHash}:${log.logIndex}`;
    if (seen.has(rowKey)) continue;
    seen.add(rowKey);
    const token = TOKENS.find((entry) => entry.address.toLowerCase() === log.address.toLowerCase());
    if (!token) continue;
    const from = log.from.toLowerCase();
    const to = log.to.toLowerCase();
    const self = wallet.toLowerCase();
    records.push({
      symbol: token.symbol,
      from: log.from,
      to: log.to,
      value: log.value.toString(),
      direction: from === self && to === self ? "self" : to === self ? "in" : "out",
      blockNumber: Number(blockNumber),
      approxTimestamp: estimateBlockTimestamp(Number(blockNumber), anchor),
      txHash: log.transactionHash ?? "",
      logIndex: Number(log.logIndex ?? 0),
    });
  }

  const transfers = records.sort((a, b) => b.blockNumber - a.blockNumber).slice(0, limit);

  return {
    transfers,
    partial: failed || coveredFrom > SCAN_FLOOR,
    truncated: !failed && coveredFrom > SCAN_FLOOR,
    scannedFromBlock: Number(coveredFrom),
    scannedToBlock: Number(head.number),
  };
}

/** Token transfer history for a wallet. Cached 5 minutes — a windowed log scan per refresh. */
export function getTransfers(wallet: Address, limit = 25): Promise<Cached<TransferHistory>> {
  return cached(`transfers:${wallet.toLowerCase()}:${limit}`, 300_000, () => loadTransfers(wallet, limit));
}

export function corporateActionsFor(actions: CorporateAction[], symbol: string): CorporateAction[] {
  return actions.filter((action) => action.symbol === symbol);
}

export function tokenExists(symbol: string): boolean {
  return Boolean(findToken(symbol));
}
