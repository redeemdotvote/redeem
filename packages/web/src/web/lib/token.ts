/**
 * The official REDEEM token on Robinhood Chain. Name, symbol, decimals and supply below were read
 * from the contract; the token page reads them live. This is the only official address: anything
 * else using the name is not ours.
 */
export const REDEEM_TOKEN = {
  address: "0x3473cCcfD7c186aae98CbebBf8388251237D3896",
  name: "Redeem Inc",
  symbol: "REDEEM",
  decimals: 18,
  totalSupply: 1_000_000_000,
} as const;

export const tokenExplorerUrl = `https://robinhoodchain.blockscout.com/token/${REDEEM_TOKEN.address}`;
