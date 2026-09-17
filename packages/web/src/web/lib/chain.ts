import { defineChain } from "viem";

/**
 * Robinhood Chain, client side. The browser only ever uses this to sign — every balance,
 * multiplier and price read happens server side behind a cache, because the public RPC is
 * rate limited and explicitly not meant for production throughput.
 */
export const CHAIN_ID = 4663;

export const robinhoodChain = defineChain({
  id: CHAIN_ID,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.chain.robinhood.com"] } },
  blockExplorers: { default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" } },
  contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" } },
});

export const EXPLORER_URL = "https://robinhoodchain.blockscout.com";

export const explorerAddress = (address: string) => `${EXPLORER_URL}/address/${address}`;
export const explorerTx = (hash: string) => `${EXPLORER_URL}/tx/${hash}`;
export const explorerBlock = (block: string | number) => `${EXPLORER_URL}/block/${block}`;
