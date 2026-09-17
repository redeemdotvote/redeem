import { createPublicClient, defineChain, fallback, http } from "viem";

/**
 * Robinhood Chain — mainnet.
 * Multicall3 is deployed at the canonical address (verified onchain), which lets a whole
 * portfolio refresh collapse into a single eth_call. That matters: the public RPC is
 * aggressively rate limited and explicitly "not intended for production-grade throughput",
 * so every read in this app goes through here, server-side, behind a cache.
 */
export const robinhoodChain = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.mainnet.chain.robinhood.com"] },
  },
  blockExplorers: {
    default: {
      name: "Blockscout",
      url: "https://robinhoodchain.blockscout.com",
    },
  },
  contracts: {
    multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" },
  },
});

export const EXPLORER_URL = "https://robinhoodchain.blockscout.com";

/** Extra endpoints can be supplied as a comma separated RPC_URL to escape the public rate limit. */
function rpcEndpoints(): string[] {
  const configured = (process.env.RPC_URL ?? "")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);
  return [...configured, "https://rpc.mainnet.chain.robinhood.com"];
}

export const publicClient = createPublicClient({
  chain: robinhoodChain,
  transport: fallback(
    rpcEndpoints().map((url) =>
      http(url, {
        // JSON-RPC batching is supported upstream — fewer HTTP requests, fewer 429s.
        batch: { wait: 16 },
        retryCount: 2,
        retryDelay: 400,
        timeout: 20_000,
      }),
    ),
    { rank: false },
  ),
  batch: { multicall: { wait: 16 } },
});

/**
 * The endpoint the transfer scan talks to directly, without viem in the way. It needs the HTTP
 * status of a refusal to decide what to do about it, and viem's transport does not carry that
 * through — see the note at the top of ./rpc.ts.
 */
export const RPC_URL = rpcEndpoints()[0];

export function explorerAddress(address: string) {
  return `${EXPLORER_URL}/address/${address}`;
}

export function explorerTx(hash: string) {
  return `${EXPLORER_URL}/tx/${hash}`;
}
