import { formatUnits, type Abi, type Address } from "viem";
import { AGGREGATOR_V3_ABI, STOCK_TOKEN_ABI } from "./abis";
import { cached, type Cached } from "./cache";
import { publicClient } from "./chain";
import { TOKENS, type TokenDefinition } from "./tokens";

const WAD = 10n ** 18n;

/**
 * Batches mix two ABIs and a dozen function names, which viem's `multicall` would rather infer
 * one literal tuple type for. The calls go in as a plain list and come back as `unknown` per
 * entry; every read below states the type it expects through `value<T>()`.
 */
type ContractCall = { address: Address; abi: Abi; functionName: string; args?: readonly unknown[] };
type CallResult = { status: "success"; result: unknown } | { status: "failure"; error: Error };
type MulticallContracts = Parameters<typeof publicClient.multicall>[0]["contracts"];

/**
 * ~1,200 view calls cover the whole market. They go out as a handful of Multicall3 batches, one
 * after another rather than in parallel — the public RPC throttles on concurrency, not weight.
 */
const CHUNK = 240;

async function multicallRaw(contracts: readonly ContractCall[]): Promise<CallResult[]> {
  const results: CallResult[] = [];
  for (let offset = 0; offset < contracts.length; offset += CHUNK) {
    const slice = contracts.slice(offset, offset + CHUNK);
    const part = (await publicClient.multicall({
      contracts: slice as unknown as MulticallContracts,
      allowFailure: true,
      batchSize: 0,
    })) as unknown as CallResult[];
    results.push(...part);
  }
  return results;
}

/** Share equivalent in 18-decimal fixed point: raw * uiMultiplier / 1e18. Tokens do not rebase. */
export function shareEquivalentWad(rawBalance: bigint, uiMultiplier: bigint): bigint {
  return (rawBalance * uiMultiplier) / WAD;
}

export function multiplierToFloat(multiplier: bigint): number {
  return Number(formatUnits(multiplier, 18));
}

export interface MarketState {
  symbol: string;
  name: string;
  address: Address;
  feed: Address | null;
  kind: TokenDefinition["kind"];
  sector: string;
  logo: string | null;
  /** uiMultiplier(), 18-decimal string. */
  uiMultiplier: string;
  uiMultiplierFloat: number;
  pendingMultiplier: string | null;
  pendingMultiplierFloat: number | null;
  /** effectiveAt(), unix seconds — when the staged multiplier becomes active. */
  effectiveAt: number | null;
  oraclePaused: boolean;
  /** Chainlink answer in USD. Already multiplier-aware — never scale it again. */
  priceUsd: number | null;
  priceUpdatedAt: number | null;
  priceStale: boolean;
  totalSupply: string;
  totalSupplyFloat: number;
  totalSupplyUI: string;
  totalSupplyUIFloat: number;
  /** Total supply valued at the feed answer, when a feed exists. */
  marketValueUsd: number | null;
  incomplete: boolean;
}

export interface MarketSnapshot {
  blockNumber: string;
  blockTimestamp: number;
  assets: MarketState[];
}

const TOKEN_READS = ["uiMultiplier", "newUIMultiplier", "effectiveAt", "oraclePaused", "totalSupply", "totalSupplyUI"] as const;

function tokenContracts(token: TokenDefinition): ContractCall[] {
  const calls: ContractCall[] = TOKEN_READS.map((functionName) => ({
    address: token.address,
    abi: STOCK_TOKEN_ABI as Abi,
    functionName,
  }));
  if (token.feed) {
    calls.push({ address: token.feed, abi: AGGREGATOR_V3_ABI as Abi, functionName: "latestRoundData" });
  }
  return calls;
}

async function loadMarket(): Promise<MarketSnapshot> {
  const plan = TOKENS.map((token) => ({ token, calls: tokenContracts(token) }));
  const contracts = plan.flatMap((entry) => entry.calls);
  const [results, block] = await Promise.all([
    multicallRaw(contracts),
    publicClient.getBlock({ blockTag: "latest", includeTransactions: false }),
  ]);

  const nowSeconds = Math.floor(Date.now() / 1000);
  let cursor = 0;

  const assets = plan.map(({ token, calls }) => {
    const slice = results.slice(cursor, cursor + calls.length);
    cursor += calls.length;
    const value = <T>(offset: number): T | null => {
      const entry = slice[offset];
      return entry && entry.status === "success" ? (entry.result as T) : null;
    };

    const uiMultiplier = value<bigint>(0) ?? WAD;
    const stagedMultiplier = value<bigint>(1) ?? 0n;
    const effectiveAtRaw = Number(value<bigint>(2) ?? 0n);
    const oraclePaused = value<boolean>(3) ?? false;
    const totalSupply = value<bigint>(4) ?? 0n;
    const totalSupplyUI = value<bigint>(5) ?? 0n;
    const round = token.feed ? value<readonly [bigint, bigint, bigint, bigint, bigint]>(6) : null;

    const hasPending = stagedMultiplier > 0n && stagedMultiplier !== uiMultiplier && effectiveAtRaw > nowSeconds;
    const priceUsd = round ? Number(formatUnits(round[1] < 0n ? 0n : round[1], 8)) : null;
    const priceUpdatedAt = round ? Number(round[3]) : null;
    const totalSupplyFloat = Number(formatUnits(totalSupply, 18));

    return {
      symbol: token.symbol,
      name: token.name,
      address: token.address,
      feed: token.feed,
      kind: token.kind,
      sector: token.sector,
      logo: token.logo,
      uiMultiplier: uiMultiplier.toString(),
      uiMultiplierFloat: multiplierToFloat(uiMultiplier),
      pendingMultiplier: hasPending ? stagedMultiplier.toString() : null,
      pendingMultiplierFloat: hasPending ? multiplierToFloat(stagedMultiplier) : null,
      effectiveAt: hasPending ? effectiveAtRaw : null,
      oraclePaused,
      priceUsd,
      priceUpdatedAt,
      priceStale: oraclePaused || (priceUpdatedAt !== null && nowSeconds - priceUpdatedAt > 6 * 3600),
      totalSupply: totalSupply.toString(),
      totalSupplyFloat,
      totalSupplyUI: totalSupplyUI.toString(),
      totalSupplyUIFloat: Number(formatUnits(totalSupplyUI, 18)),
      marketValueUsd: priceUsd === null ? null : totalSupplyFloat * priceUsd,
      incomplete: slice.some((entry) => entry.status !== "success"),
    } satisfies MarketState;
  });

  return { blockNumber: block.number.toString(), blockTimestamp: Number(block.timestamp), assets };
}

/** Market state for every token. Cached 90s — feeds and multipliers move far slower than that. */
export function getMarket(): Promise<Cached<MarketSnapshot>> {
  return cached("market", 90_000, loadMarket);
}

export interface RawBalance {
  symbol: string;
  /** ERC-20 balanceOf, raw 18-decimal units. */
  rawBalance: string;
  /** balanceOfUI() straight from the contract, used to verify our own multiplier math. */
  balanceOfUI: string | null;
}

async function loadBalances(wallet: Address): Promise<RawBalance[]> {
  const contracts = TOKENS.flatMap((token): ContractCall[] => [
    { address: token.address, abi: STOCK_TOKEN_ABI as Abi, functionName: "balanceOf", args: [wallet] },
    { address: token.address, abi: STOCK_TOKEN_ABI as Abi, functionName: "balanceOfUI", args: [wallet] },
  ]);
  const results = await multicallRaw(contracts);
  return TOKENS.map((token, index) => {
    const balance = results[index * 2];
    const balanceUi = results[index * 2 + 1];
    return {
      symbol: token.symbol,
      rawBalance: balance && balance.status === "success" ? (balance.result as bigint).toString() : "0",
      balanceOfUI: balanceUi && balanceUi.status === "success" ? (balanceUi.result as bigint).toString() : null,
    };
  });
}

/** Wallet balances across every token, in two multicalls. Cached 20s per wallet. */
export function getBalances(wallet: Address): Promise<Cached<RawBalance[]>> {
  return cached(`balances:${wallet.toLowerCase()}`, 20_000, () => loadBalances(wallet));
}

/** One token's balance for many wallets — used when a ballot closes and every weight is re-checked. */
export async function loadBalancesForWallets(token: TokenDefinition, wallets: Address[]): Promise<Map<string, bigint>> {
  const contracts = wallets.map((wallet): ContractCall => ({
    address: token.address,
    abi: STOCK_TOKEN_ABI as Abi,
    functionName: "balanceOf",
    args: [wallet],
  }));
  const results = await multicallRaw(contracts);
  const out = new Map<string, bigint>();
  wallets.forEach((wallet, index) => {
    const entry = results[index];
    out.set(wallet.toLowerCase(), entry && entry.status === "success" ? (entry.result as bigint) : 0n);
  });
  return out;
}

export async function currentBlock(): Promise<{ number: string; timestamp: number }> {
  const block = await publicClient.getBlock({ blockTag: "latest", includeTransactions: false });
  return { number: block.number.toString(), timestamp: Number(block.timestamp) };
}
