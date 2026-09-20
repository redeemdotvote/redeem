/**
 * Finds the contracts that hold Stock Tokens on Robinhood Chain and classifies the ones the record
 * can look through: Uniswap V3 style pools, V2 style pairs and ERC-4626 vaults. It walks recent
 * Transfer logs of the most valuable tokens, probes the busiest contract counterparties, and writes
 * src/api/data/venues.json. Read-only; nothing is deployed or sent.
 *
 * Run from packages/web:  bun scripts/discover-venues.ts [tokenCount=14]
 */
import { createPublicClient, http, parseAbiItem, type Address } from "viem";
import { writeFile } from "node:fs/promises";
import path from "node:path";

const RPC = (process.env.RPC_URL ?? "").split(",")[0]?.trim() || "https://rpc.mainnet.chain.robinhood.com";
const client = createPublicClient({ transport: http(RPC, { retryCount: 4, retryDelay: 1500, timeout: 25_000 }) });
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const registry = JSON.parse(await Bun.file(path.resolve(import.meta.dirname, "../src/api/data/stocks.json")).text());
const all: Array<{ symbol: string; address: Address }> = Array.isArray(registry) ? registry : registry.tokens;
const bySymbol = new Map(all.map((token) => [token.address.toLowerCase(), token.symbol]));

const want = Number(process.argv[2] ?? 14);
const record = (await (await fetch("https://www.redeem.vote/api/v1/record")).json()) as { tokens: Array<{ symbol: string; contract: Address; priceUsd: number | null; shareEquivalentSupply: string }> };
const ranked = record.tokens
  .map((token) => ({ symbol: token.symbol, address: token.contract, value: (token.priceUsd ?? 0) * (Number(BigInt(token.shareEquivalentSupply) / 10n ** 12n) / 1e6) }))
  .sort((a, b) => b.value - a.value)
  .slice(0, want);

const transfer = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
const head = await client.getBlockNumber();
const counterparties = new Map<string, number>();
for (const token of ranked) {
  let to = head;
  let window = 120_000n;
  let logsSeen = 0;
  for (let step = 0; step < 6 && logsSeen < 4000; step++) {
    const from = to - window;
    try {
      const logs = await client.getLogs({ address: token.address, event: transfer, fromBlock: from, toBlock: to });
      logsSeen += logs.length;
      for (const log of logs) for (const party of [log.args.from, log.args.to]) if (party) counterparties.set(party.toLowerCase(), (counterparties.get(party.toLowerCase()) ?? 0) + 1);
      to = from - 1n;
      if (logs.length < 1500) window = window * 2n;
    } catch {
      window = window / 4n > 5_000n ? window / 4n : 5_000n;
    }
    await sleep(600);
  }
  console.log(`${token.symbol.padEnd(6)} ${logsSeen} transfers read`);
}

const fn = (name: string, outputs: Array<{ type: string }>) => [{ type: "function", name, stateMutability: "view", inputs: [], outputs }] as const;
const read = async <T>(address: Address, name: string, outputs: Array<{ type: string }>): Promise<T | null> => {
  try {
    return (await client.readContract({ address, abi: fn(name, outputs), functionName: name })) as T;
  } catch {
    return null;
  }
};

const busiest = [...counterparties.entries()].filter(([address]) => !/^0x0{40}$/.test(address) && !bySymbol.has(address)).sort((a, b) => b[1] - a[1]).slice(0, 120);
const venues: Array<Record<string, unknown>> = [];
for (const [address, transfers] of busiest) {
  const code = await client.getCode({ address: address as Address }).catch(() => null);
  if (!code || code === "0x") continue;
  const token0 = await read<Address>(address as Address, "token0", [{ type: "address" }]);
  const asset = token0 ? null : await read<Address>(address as Address, "asset", [{ type: "address" }]);
  if (token0) {
    const token1 = await read<Address>(address as Address, "token1", [{ type: "address" }]);
    const fee = await read<number>(address as Address, "fee", [{ type: "uint24" }]);
    const reserves = fee === null ? await read<unknown>(address as Address, "getReserves", [{ type: "uint112" }, { type: "uint112" }, { type: "uint32" }]) : null;
    const factory = await read<Address>(address as Address, "factory", [{ type: "address" }]);
    const symbols = [token0, token1].map((token) => (token ? (bySymbol.get(token.toLowerCase()) ?? null) : null));
    if (symbols.some(Boolean)) venues.push({ address, kind: fee !== null ? "v3_pool" : reserves ? "v2_pair" : "pool", token0, token1, symbols, fee, factory, transfers });
  } else if (asset && bySymbol.has(asset.toLowerCase())) {
    venues.push({ address, kind: "erc4626_vault", asset, symbols: [bySymbol.get(asset.toLowerCase())], transfers });
  }
  await sleep(200);
}

const out = path.resolve(import.meta.dirname, "../src/api/data/venues.json");
await writeFile(out, `${JSON.stringify({ generatedAt: new Date().toISOString(), block: head.toString(), scannedTokens: ranked.map((token) => token.symbol), venues }, null, 2)}\n`);
console.log(`${venues.length} venues written to ${path.relative(process.cwd(), out)}`);
