/**
 * Holder snapshot: who holds each Stock Token on Robinhood Chain, ranked, at one block.
 *
 * The chain publishes no holder list, so one is built the only honest way: every address that
 * ever received a token (from its Transfer logs, scanned in adaptive windows back to the chain's
 * early blocks) is a candidate, and every candidate's balance is read exactly with balanceOf via
 * Multicall3 at the end. Contracts the record can identify (pools from venues.json) are labelled.
 *
 * Output: src/api/data/holders.json — per token, the holder count, the top 100 with exact
 * balances, and 100 percentile cut points so any wallet can be placed ("top 4% of 3,412").
 *
 * Run from packages/web:  bun scripts/snapshot-holders.ts [symbols=ALL] [--resume]
 */
import { createPublicClient, erc20Abi, getAddress, http, parseAbiItem, type Address } from "viem";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const RPC = (process.env.RPC_URL ?? "").split(",")[0]?.trim() || "https://rpc.mainnet.chain.robinhood.com";
const client = createPublicClient({ transport: http(RPC, { retryCount: 3, retryDelay: 1200, timeout: 25_000 }), batch: { multicall: { wait: 16 } } });
const MULTICALL = "0xcA11bde05977b3631167028862bE2a173976CA11" as const;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const dataDir = path.resolve(import.meta.dirname, "../src/api/data");
const cacheDir = path.resolve(import.meta.dirname, ".ingest/holders");
await mkdir(cacheDir, { recursive: true });

const registry = JSON.parse(await readFile(path.join(dataDir, "stocks.json"), "utf8"));
const tokens: Array<{ symbol: string; address: Address }> = Array.isArray(registry) ? registry : registry.tokens;
const venues = new Set((JSON.parse(await readFile(path.join(dataDir, "venues.json"), "utf8")).venues as Array<{ address: string }>).map((venue) => venue.address.toLowerCase()));
const only = (process.argv[2] ?? "ALL").toUpperCase();
const wanted = only === "ALL" ? tokens : tokens.filter((token) => only.split(",").includes(token.symbol));
const FLOOR = 300_000n;
const transfer = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
const head = await client.getBlockNumber();
console.log(`head ${head}; ${wanted.length} tokens`);

async function candidates(token: { symbol: string; address: Address }): Promise<Set<string>> {
  const cacheFile = path.join(cacheDir, `${token.symbol}.json`);
  try {
    const cached = JSON.parse(await readFile(cacheFile, "utf8")) as { block: string; addresses: string[] };
    if (BigInt(cached.block) >= head - 200_000n) return new Set(cached.addresses);
  } catch {}
  const out = new Set<string>();
  let to = head;
  let window = 1_500_000n;
  let emptyStreak = 0;
  let queries = 0;
  while (to > FLOOR && queries < 400) {
    const from = to - window > FLOOR ? to - window : FLOOR;
    try {
      const logs = await client.getLogs({ address: token.address, event: transfer, fromBlock: from, toBlock: to });
      queries += 1;
      for (const log of logs) if (log.args.to) out.add(log.args.to.toLowerCase());
      to = from - 1n;
      if (logs.length === 0) emptyStreak += 1;
      else emptyStreak = 0;
      // Eight empty 1.5M-block windows in a row is well before the token existed.
      if (emptyStreak >= 8 && window >= 1_500_000n) break;
      if (logs.length < 2_000 && window < 4_000_000n) window *= 2n;
    } catch (error) {
      queries += 1;
      const message = error instanceof Error ? error.message : String(error);
      if (/429|too many/i.test(message)) await sleep(2500);
      window = window / 3n > 20_000n ? window / 3n : 20_000n;
    }
    await sleep(350);
  }
  await writeFile(cacheFile, JSON.stringify({ block: head.toString(), addresses: [...out] }));
  return out;
}

async function balances(token: Address, addresses: string[]): Promise<Map<string, bigint>> {
  const out = new Map<string, bigint>();
  for (let i = 0; i < addresses.length; i += 300) {
    const slice = addresses.slice(i, i + 300);
    const results = await client.multicall({ multicallAddress: MULTICALL, allowFailure: true, contracts: slice.map((address) => ({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [getAddress(address)] }) as const) });
    results.forEach((result, index) => {
      if (result.status === "success" && (result.result as bigint) > 0n) out.set(slice[index]!, result.result as bigint);
    });
    await sleep(250);
  }
  return out;
}

const snapshot: Record<string, unknown> = {};
let existing: Record<string, unknown> = {};
try {
  existing = JSON.parse(await readFile(path.join(dataDir, "holders.json"), "utf8")).tokens ?? {};
} catch {}
const startedAt = Date.now();
for (const [index, token] of wanted.entries()) {
  const t0 = Date.now();
  const set = await candidates(token);
  const held = await balances(token.address, [...set]);
  const sorted = [...held.entries()].sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0));
  const total = sorted.reduce((sum, [, balance]) => sum + balance, 0n);
  const cuts: string[] = [];
  for (let p = 0; p < 100; p++) cuts.push((sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]?.[1] ?? 0n).toString());
  snapshot[token.symbol] = {
    holders: sorted.length,
    candidates: set.size,
    totalHeld: total.toString(),
    top: sorted.slice(0, 100).map(([address, balance]) => ({ address, balance: balance.toString(), pool: venues.has(address) })),
    cuts,
  };
  console.log(`${String(index + 1).padStart(3)}/${wanted.length} ${token.symbol.padEnd(6)} candidates ${set.size} holders ${sorted.length} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  await writeFile(path.join(dataDir, "holders.json"), JSON.stringify({ generatedAt: new Date().toISOString(), block: head.toString(), tokens: { ...existing, ...snapshot } }));
}
console.log(`done in ${((Date.now() - startedAt) / 60000).toFixed(1)} min`);
