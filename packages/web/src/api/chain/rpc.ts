import type { Address, Hex } from "viem";

/**
 * A hand-rolled `eth_getLogs` against Robinhood Chain, used instead of viem's for the transfer
 * scan alone.
 *
 * The scan is the one read where the endpoint's refusals are routine and each one has a
 * different correct response — narrow the block window, or hold it and wait — so the scan has
 * to be able to tell them apart. viem cannot help there: this endpoint answers a 429 with
 * `content-type: text/plain`, which viem does not parse as JSON, and the failure reaches the
 * caller as "An unknown RPC error occurred / Cannot destructure property 'error' from null"
 * with the status code gone. Classified on message alone that is indistinguishable from a
 * query that was too heavy, and the two want opposite treatment — which is exactly how an
 * earlier version of this scan spent a minute narrowing its window against what was only ever
 * a rate limit asking it to wait a moment.
 *
 * Talking to the endpoint directly keeps the HTTP status, so the distinction survives.
 */
export type RpcFailureKind =
  /** HTTP 429, or a JSON-RPC error carrying it: hold the window, wait, ask again. */
  | "rate-limit"
  /** The query scanned more than the endpoint will spend time on, or matched more than its
   * ten-thousand-log response cap: ask for a narrower window. */
  | "too-heavy"
  /** Anything else — a transport failure, a malformed body, an unexpected JSON-RPC error. */
  | "other";

export class RpcCallError extends Error {
  readonly kind: RpcFailureKind;
  readonly status?: number;

  constructor(kind: RpcFailureKind, message: string, status?: number) {
    super(message);
    this.name = "RpcCallError";
    this.kind = kind;
    this.status = status;
  }
}

export interface RawLog {
  address: Address;
  topics: Hex[];
  data: Hex;
  blockNumber: bigint;
  transactionHash: Hex;
  logIndex: number;
}

interface JsonRpcResponse {
  result?: unknown;
  error?: { code?: number; message?: string };
}

function classify(message: string, status?: number): RpcFailureKind {
  if (status === 429 || /\b429\b|too many requests|rate limit/i.test(message)) return "rate-limit";
  if (/query timed out|exceeds limit|too large|response size|limit exceeded/i.test(message)) return "too-heavy";
  return "other";
}

/** Left-pads an address into the 32-byte topic form indexed parameters are matched on. */
export function addressTopic(address: Address): Hex {
  return `0x${address.toLowerCase().replace(/^0x/, "").padStart(64, "0")}` as Hex;
}

/**
 * Every log query in the process goes out through one queue, one at a time, with a gap between
 * them.
 *
 * This endpoint throttles on concurrency, not on how much a query asks for: six parallel
 * requests matching nothing at all were all answered 429 within 90ms. Scanning a wallet's
 * incoming and outgoing history at the same time is enough to trip that, and the scan then
 * reads its own self-inflicted 429s as the chain being busy and gives up early with half the
 * history. Serialising costs the span-to-span latency of one query — under 100ms when the
 * endpoint is healthy — and in exchange the refusals that do arrive are real signal.
 */
/**
 * Measured from the end of one query to the start of the next, because that is the spacing the
 * endpoint was actually observed to sustain: fourteen consecutive 4,000,000-block queries with
 * a 150ms rest between them were all answered, averaging 77ms each, while the same queries
 * spaced 140ms apart *from the start* — around 60ms of rest — drew 429s on roughly a third.
 */
const MIN_GAP_MS = 220;
let lastFinishedAt = 0;
let queueTail: Promise<unknown> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = queueTail.then(async () => {
    const wait = MIN_GAP_MS - (Date.now() - lastFinishedAt);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    try {
      return await task();
    } finally {
      lastFinishedAt = Date.now();
    }
  });
  // The tail must not reject, or one failed query would poison every queued one behind it.
  queueTail = run.catch(() => undefined);
  return run;
}

export function rpcGetLogs(
  url: string,
  params: {
    address: Address[];
    topics: (Hex | Hex[] | null)[];
    fromBlock: bigint;
    toBlock: bigint;
  },
  timeoutMs = 8_000,
): Promise<RawLog[]> {
  return enqueue(() => sendGetLogs(url, params, timeoutMs));
}

async function sendGetLogs(
  url: string,
  params: {
    address: Address[];
    topics: (Hex | Hex[] | null)[];
    fromBlock: bigint;
    toBlock: bigint;
  },
  timeoutMs = 8_000,
): Promise<RawLog[]> {
  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "eth_getLogs",
    params: [
      {
        ...(params.address.length > 0 ? { address: params.address } : {}),
        topics: params.topics,
        fromBlock: `0x${params.fromBlock.toString(16)}`,
        toBlock: `0x${params.toBlock.toString(16)}`,
      },
    ],
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  let text: string;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    text = await response.text();
  } catch (error) {
    const aborted = (error as Error)?.name === "AbortError";
    // A query the endpoint never finishes is a query that asked for too much, so it is treated
    // the same as the refusal it would eventually have sent.
    throw new RpcCallError(aborted ? "too-heavy" : "other", aborted ? `timed out after ${timeoutMs}ms` : String(error));
  } finally {
    clearTimeout(timer);
  }

  // The 429 body arrives as text/plain, so the status is read before the body is trusted.
  if (response.status === 429) throw new RpcCallError("rate-limit", `HTTP 429 ${text.slice(0, 120)}`, 429);

  let payload: JsonRpcResponse;
  try {
    payload = JSON.parse(text) as JsonRpcResponse;
  } catch {
    throw new RpcCallError(classify(text, response.status), `HTTP ${response.status} ${text.slice(0, 120)}`, response.status);
  }

  if (payload.error) {
    const message = payload.error.message ?? "rpc error";
    throw new RpcCallError(classify(message, payload.error.code === 429 ? 429 : response.status), message, response.status);
  }

  if (!response.ok) {
    throw new RpcCallError(classify(text, response.status), `HTTP ${response.status}`, response.status);
  }

  if (!Array.isArray(payload.result)) {
    throw new RpcCallError("other", "eth_getLogs returned a non-array result");
  }

  return (payload.result as Record<string, string>[]).map((log) => ({
    address: log.address as Address,
    topics: (log.topics ?? []) as unknown as Hex[],
    data: (log.data ?? "0x") as Hex,
    blockNumber: BigInt(log.blockNumber ?? "0x0"),
    transactionHash: (log.transactionHash ?? "0x") as Hex,
    logIndex: Number(BigInt(log.logIndex ?? "0x0")),
  }));
}
