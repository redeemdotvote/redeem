import type { Address } from "viem";
import registry from "../data/stocks.json";

/**
 * Every Robinhood Stock Token on Robinhood Chain (chain id 4663).
 *
 * The registry is generated from the issuer's own asset list (`GET https://api.robinhood.com/rhj/assets`),
 * joined with SEC EDGAR company data (CIK, fiscal year end, exchange) and the Chainlink feed
 * directory for Robinhood Chain. Regenerate with `scripts/build-registry.py`.
 *
 * Stock Tokens are ERC-20s (18 decimals) issued by Robinhood Assets (Jersey) Limited and backed
 * 1:1 by shares held in custody. They carry the economics of the share. Shareholder voting and
 * in-kind redemption are on the issuer's roadmap and are not live — which is exactly why this
 * record exists.
 */
export type TokenKind = "stock" | "etf" | "foreign";

export interface TokenDefinition {
  symbol: string;
  /** Plain company / fund name, e.g. "NVIDIA". */
  name: string;
  /** The issuer's full token name, e.g. "NVIDIA • Robinhood Token". */
  tokenName: string;
  address: Address;
  isin: string | null;
  kind: TokenKind;
  /** SEC Central Index Key, when the issuer files with the SEC. */
  cik: string | null;
  sicDescription: string | null;
  sector: string;
  /** MMDD, from EDGAR. */
  fiscalYearEnd: string | null;
  exchange: string | null;
  stateOfIncorporation: string | null;
  /** Chainlink AggregatorV3 proxy (8 decimals, multiplier-aware) when one is deployed on 4663. */
  feed: Address | null;
  logo: string | null;
  decimals: number;
}

interface RegistryRow {
  symbol: string;
  name: string;
  tokenName: string;
  address: string;
  isin: string | null;
  kind: string;
  cik: string | null;
  sicDescription: string | null;
  sector: string;
  fiscalYearEnd: string | null;
  exchange: string | null;
  stateOfIncorporation: string | null;
  feed: string | null;
  logo: string | null;
}

export const TOKENS: readonly TokenDefinition[] = (registry as RegistryRow[]).map((row) => ({
  symbol: row.symbol,
  name: row.name,
  tokenName: row.tokenName,
  address: row.address as Address,
  isin: row.isin,
  kind: (row.kind === "etf" || row.kind === "foreign" ? row.kind : "stock") as TokenKind,
  cik: row.cik,
  sicDescription: row.sicDescription,
  sector: row.sector,
  fiscalYearEnd: row.fiscalYearEnd,
  exchange: row.exchange,
  stateOfIncorporation: row.stateOfIncorporation,
  feed: (row.feed as Address | null) ?? null,
  logo: row.logo,
  decimals: 18,
}));

export const TOKENS_BY_SYMBOL = new Map(TOKENS.map((token) => [token.symbol, token]));
export const TOKENS_BY_ADDRESS = new Map(TOKENS.map((token) => [token.address.toLowerCase(), token]));

export function findToken(symbol: string): TokenDefinition | undefined {
  return TOKENS_BY_SYMBOL.get(symbol.toUpperCase());
}

export const TOKEN_ADDRESSES = TOKENS.map((token) => token.address);

/** ETFs and non-US issuers do not hold SEC-style stockholder meetings the record can follow. */
export function votable(token: TokenDefinition): boolean {
  return token.kind === "stock" && token.cik !== null;
}

export const SECTORS = [...new Set(TOKENS.map((token) => token.sector))].sort();
