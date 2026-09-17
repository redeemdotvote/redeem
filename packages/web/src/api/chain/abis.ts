/**
 * Robinhood Stock Tokens are standard ERC-20s (18 decimals) that additionally implement
 * ERC-8056 (Scaled UI Amount Extension). The multiplier scales the *effective* amount
 * without touching raw balances or total supply — these tokens are NOT rebasing.
 */
export const STOCK_TOKEN_ABI = [
  // --- ERC-20 ---
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  { type: "function", name: "totalSupply", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "decimals", inputs: [], outputs: [{ type: "uint8" }], stateMutability: "view" },
  { type: "function", name: "symbol", inputs: [], outputs: [{ type: "string" }], stateMutability: "view" },
  { type: "function", name: "name", inputs: [], outputs: [{ type: "string" }], stateMutability: "view" },

  // --- ERC-8056: Scaled UI Amount Extension ---
  /** Current UI multiplier, 18 decimals (1e18 = 1.0). */
  { type: "function", name: "uiMultiplier", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  /** Pending multiplier scheduled to take effect at effectiveAt(). */
  { type: "function", name: "newUIMultiplier", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  /** Timestamp at which newUIMultiplier() becomes the active uiMultiplier(). */
  { type: "function", name: "effectiveAt", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  /** UI-adjusted balance (raw balance scaled by uiMultiplier) — used to verify our own math. */
  {
    type: "function",
    name: "balanceOfUI",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  { type: "function", name: "totalSupplyUI", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  /** When true the Chainlink feed freezes at its last good value (corporate action in flight). */
  { type: "function", name: "oraclePaused", inputs: [], outputs: [{ type: "bool" }], stateMutability: "view" },

  // --- Events ---
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { indexed: true, name: "from", type: "address" },
      { indexed: true, name: "to", type: "address" },
      { indexed: false, name: "value", type: "uint256" },
    ],
  },
  {
    type: "event",
    name: "UIMultiplierUpdated",
    inputs: [
      { indexed: false, name: "oldMultiplier", type: "uint256" },
      { indexed: false, name: "newMultiplier", type: "uint256" },
      { indexed: false, name: "effectiveAtTimestamp", type: "uint256" },
    ],
  },
  {
    type: "event",
    name: "TransferWithScaledUI",
    inputs: [
      { indexed: true, name: "from", type: "address" },
      { indexed: true, name: "to", type: "address" },
      { indexed: false, name: "value", type: "uint256" },
      { indexed: false, name: "uiValue", type: "uint256" },
    ],
  },
] as const;

/**
 * Standard Chainlink AggregatorV3Interface. Robinhood tokenized equity feeds publish the
 * Total Return Value: underlying market price × uiMultiplier, read from the token contract
 * by the oracle itself. The answer is ALREADY multiplier-aware — never scale it again.
 */
export const AGGREGATOR_V3_ABI = [
  {
    type: "function",
    name: "latestRoundData",
    inputs: [],
    outputs: [
      { name: "roundId", type: "uint80" },
      { name: "answer", type: "int256" },
      { name: "startedAt", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ],
    stateMutability: "view",
  },
  { type: "function", name: "decimals", inputs: [], outputs: [{ type: "uint8" }], stateMutability: "view" },
  { type: "function", name: "description", inputs: [], outputs: [{ type: "string" }], stateMutability: "view" },
] as const;

/** Minimal ERC-4626 surface, for the vault adapter that ships as a planned source. */
export const ERC4626_ABI = [
  { type: "function", name: "asset", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "convertToAssets",
    inputs: [{ name: "shares", type: "uint256" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  { type: "function", name: "totalAssets", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "totalSupply", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
] as const;
