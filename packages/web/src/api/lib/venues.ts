import { erc20Abi, formatUnits, getAddress, type Address } from "viem";
import { cached } from "../chain/cache";
import { publicClient } from "../chain/chain";
import { getMarket } from "../chain/market";
import { TOKENS } from "../chain/tokens";
import registry from "../data/venues.json";

/**
 * Look-through adapters. Stock Tokens do not only sit in wallets: some sit in liquidity pools and
 * vaults, and the record should say so rather than count a pool as one very large holder.
 *
 * `venues.json` is written by scripts/discover-venues.ts, which finds contracts holding Stock
 * Tokens and classifies the ones that can be read: Uniswap V3 style pools, V2 style pairs and
 * ERC-4626 vaults. Everything here is a view call against someone else's contract. Nothing is
 * deployed, and nothing is sent.
 *
 * What is resolved today: how many share-equivalents each venue holds. For V2 pairs and ERC-4626
 * vaults a wallet's pro rata share can also be read (`resolveHolder`). V3 positions are NFTs held
 * through a position manager, so they are resolved to the pool, not yet to each provider.
 */
export interface Venue {
  address: Address;
  kind: "v3_pool" | "v2_pair" | "pool" | "erc4626_vault";
  symbols: Array<string | null>;
  token0?: Address;
  token1?: Address;
  asset?: Address;
  fee?: number | null;
  factory?: Address | null;
}

export const VENUES = (registry as { venues: Venue[] }).venues;
export const VENUES_GENERATED_AT = (registry as { generatedAt: string | null }).generatedAt;
const WAD = 10n ** 18n;
const f18 = (value: bigint) => Number(formatUnits(value, 18));

export interface VenueHolding {
  venue: Address;
  kind: Venue["kind"];
  symbol: string;
  pairedWith: string | null;
  fee: number | null;
  rawBalance: string;
  shareEquivalent: number;
}

/** Every registered venue's Stock Token balance, as share-equivalents. One multicall, cached five minutes. */
export function getVenueHoldings() {
  return cached("venue-holdings", 300_000, async (): Promise<VenueHolding[]> => {
    const market = await getMarket();
    const multiplierBy = new Map(market.value.assets.map((asset) => [asset.symbol, BigInt(asset.uiMultiplier)]));
    const legs = VENUES.flatMap((venue) => {
      const sides = venue.kind === "erc4626_vault" ? [venue.asset] : [venue.token0, venue.token1];
      return sides.flatMap((side, index) => {
        const symbol = side ? TOKENS.find((token) => token.address.toLowerCase() === side.toLowerCase())?.symbol : undefined;
        if (!side || !symbol) return [];
        const other = venue.kind === "erc4626_vault" ? null : (index === 0 ? venue.token1 : venue.token0) ?? null;
        return [{ venue, symbol, side, other }];
      });
    });
    const results = await publicClient.multicall({
      allowFailure: true,
      contracts: legs.flatMap((leg) => [
        { address: leg.side, abi: erc20Abi, functionName: "balanceOf", args: [getAddress(leg.venue.address)] } as const,
        { address: (leg.other ?? leg.side) as Address, abi: erc20Abi, functionName: "symbol" } as const,
      ]),
    });
    return legs
      .map((leg, index) => {
        const balance = results[index * 2];
        const paired = results[index * 2 + 1];
        const raw = balance?.status === "success" ? (balance.result as bigint) : 0n;
        const pairedSymbol = leg.other && paired?.status === "success" ? String(paired.result) : null;
        return { venue: getAddress(leg.venue.address), kind: leg.venue.kind, symbol: leg.symbol, pairedWith: pairedSymbol, fee: leg.venue.fee ?? null, rawBalance: raw.toString(), shareEquivalent: f18((raw * (multiplierBy.get(leg.symbol) ?? WAD)) / WAD) };
      })
      .filter((holding) => holding.shareEquivalent > 0)
      .sort((a, b) => b.shareEquivalent - a.shareEquivalent);
  });
}

const view = (name: string, outputs: Array<{ type: string }>, inputs: Array<{ type: string }> = []) => [{ type: "function", name, stateMutability: "view", inputs, outputs }] as const;
async function read<T>(address: Address, name: string, outputs: Array<{ type: string }>): Promise<T | null> {
  try {
    return (await publicClient.readContract({ address, abi: view(name, outputs), functionName: name })) as T;
  } catch {
    return null;
  }
}

/**
 * Resolves one wallet's pro rata share of the Stock Tokens inside any contract, by probing what
 * the contract is. ERC-4626 vault: shares × totalAssets ÷ totalSupply. V2 pair: LP balance ×
 * reserve ÷ totalSupply. V3 pool: the pool's holding only, with a note.
 */
export async function resolveHolder(contract: Address, wallet: Address | null) {
  const market = await getMarket();
  const multiplierOf = (symbol: string) => BigInt(market.value.assets.find((asset) => asset.symbol === symbol)?.uiMultiplier ?? WAD);
  const tokenAt = (address: Address | null) => (address ? (TOKENS.find((token) => token.address.toLowerCase() === address.toLowerCase()) ?? null) : null);
  const token0 = await read<Address>(contract, "token0", [{ type: "address" }]);
  if (token0) {
    const token1 = await read<Address>(contract, "token1", [{ type: "address" }]);
    const fee = await read<number>(contract, "fee", [{ type: "uint24" }]);
    const sides = [token0, token1].map(tokenAt);
    if (!sides.some(Boolean)) return { contract, kind: "unrelated" as const, note: "This pool holds no official Stock Token.", positions: [] };
    const totalSupply = fee === null ? await read<bigint>(contract, "totalSupply", [{ type: "uint256" }]) : null;
    const lp = fee === null && wallet && totalSupply ? await publicClient.readContract({ address: contract, abi: erc20Abi, functionName: "balanceOf", args: [wallet] }).catch(() => 0n) : 0n;
    const positions = [];
    for (const [index, token] of sides.entries()) {
      if (!token) continue;
      const held = await publicClient.readContract({ address: token.address as Address, abi: erc20Abi, functionName: "balanceOf", args: [contract] });
      const venueShareEq = (held * multiplierOf(token.symbol)) / WAD;
      const mine = totalSupply && totalSupply > 0n ? (venueShareEq * lp) / totalSupply : null;
      positions.push({ symbol: token.symbol, side: index, venueShareEquivalent: f18(venueShareEq), walletShareEquivalent: mine === null ? null : f18(mine) });
    }
    return { contract, kind: fee === null ? ("v2_pair" as const) : ("v3_pool" as const), fee, note: fee === null ? "Pro rata by LP token balance." : "V3 positions are NFTs held through a position manager; resolved to the pool, not yet to each provider.", positions };
  }
  const asset = await read<Address>(contract, "asset", [{ type: "address" }]);
  const token = tokenAt(asset);
  if (asset && token) {
    const [totalAssets, totalSupply] = await Promise.all([read<bigint>(contract, "totalAssets", [{ type: "uint256" }]), read<bigint>(contract, "totalSupply", [{ type: "uint256" }])]);
    const shares = wallet ? await publicClient.readContract({ address: contract, abi: erc20Abi, functionName: "balanceOf", args: [wallet] }).catch(() => 0n) : 0n;
    const venueShareEq = ((totalAssets ?? 0n) * multiplierOf(token.symbol)) / WAD;
    const mine = totalSupply && totalSupply > 0n ? (venueShareEq * shares) / totalSupply : null;
    return { contract, kind: "erc4626_vault" as const, note: "Pro rata by vault share balance.", positions: [{ symbol: token.symbol, side: 0, venueShareEquivalent: f18(venueShareEq), walletShareEquivalent: mine === null ? null : f18(mine) }] };
  }
  return { contract, kind: "unknown" as const, note: "Not a V2 pair, a V3 pool or an ERC-4626 vault over a Stock Token. Adapters for other venue types are open bounties.", positions: [] };
}
