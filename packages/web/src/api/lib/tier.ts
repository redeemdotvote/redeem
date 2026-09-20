import { erc20Abi, type Address } from "viem";
import { cached } from "../chain/cache";
import { publicClient } from "../chain/chain";

/**
 * Holder tiers for the REDEEM token. A tier is read from the wallet's REDEEM balance on Robinhood
 * Chain and unlocks delivery features only (webhooks). It never touches the record: intent weight,
 * queue positions, record numbers and XP ignore it completely.
 *
 * Thresholds are whole tokens and can be overridden with REDEEM_TIERS="holder:100000,steward:1000000".
 */
export const REDEEM_TOKEN_ADDRESS = "0x3473cCcfD7c186aae98CbebBf8388251237D3896" as const;

const DEFAULT_TIERS = [
  { key: "steward", label: "Steward", min: 1_000_000, webhooks: 5 },
  { key: "holder", label: "Holder", min: 100_000, webhooks: 1 },
];

export function tiers() {
  const configured = (process.env.REDEEM_TIERS ?? "").split(",").map((part) => part.trim().split(":"));
  const overrides = new Map(configured.filter((pair) => pair.length === 2 && Number(pair[1]) > 0).map(([key, min]) => [key, Number(min)]));
  return DEFAULT_TIERS.map((tier) => ({ ...tier, min: overrides.get(tier.key) ?? tier.min })).sort((a, b) => b.min - a.min);
}

export async function tierFor(wallet: string) {
  const balance = await cached(`redeem-balance:${wallet.toLowerCase()}`, 60_000, () => publicClient.readContract({ address: REDEEM_TOKEN_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [wallet as Address] }));
  const whole = Number(balance.value / 10n ** 18n);
  const tier = tiers().find((entry) => whole >= entry.min) ?? null;
  return { wallet, balance: balance.value.toString(), balanceWhole: whole, tier: tier ? { key: tier.key, label: tier.label, webhooks: tier.webhooks } : null, tiers: tiers().map((entry) => ({ key: entry.key, label: entry.label, min: entry.min, webhooks: entry.webhooks })) };
}
