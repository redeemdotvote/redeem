import { formatUnits, type Address } from "viem";
import { getCorporateActions, getTransfers, estimateBlockAt } from "../chain/events";
import { getBalances, getMarket } from "../chain/market";
import { findToken } from "../chain/tokens";

/**
 * What a wallet held on an issuer's record date, without an archive node. The public RPC keeps no
 * historical state, so the balance is rebuilt from the chain's own Transfer logs:
 *
 *   balance(record date) = balance(now) − received since + sent since
 *
 * and the multiplier in force that day is read from the mirrored UIMultiplierUpdated history. The
 * result is exact when the transfer scan reaches back past the record date, and is reported as
 * incomplete when it does not; it is never guessed. It is shown for information: counted weight
 * stays the smaller of what was signed and what is held at cutoff.
 */
const WAD = 10n ** 18n;

export async function recordDatePosition(wallet: Address, symbol: string, recordDate: string) {
  const token = findToken(symbol);
  if (!token) return null;
  // Holders of record are fixed at the close of business; the end of that UTC day is used and said so.
  const at = Math.floor(Date.parse(`${recordDate}T23:59:59Z`) / 1000);
  if (!Number.isFinite(at)) return null;
  const [market, balances, history, actions] = await Promise.all([getMarket(), getBalances(wallet), getTransfers(wallet, 100), getCorporateActions().catch(() => null)]);
  const head = { block: Number(market.value.blockNumber), timestamp: market.value.blockTimestamp };
  const block = estimateBlockAt(at, head);
  const current = BigInt(balances.value.find((entry) => entry.symbol === token.symbol)?.rawBalance ?? "0");

  let balance = current;
  for (const transfer of history.value.transfers) {
    if (transfer.symbol !== token.symbol || transfer.blockNumber <= block) continue;
    if (transfer.direction === "in") balance -= BigInt(transfer.value);
    else if (transfer.direction === "out") balance += BigInt(transfer.value);
  }
  // The scan only follows tokens the wallet holds now, and may stop early under rate limits.
  // Coverage is contiguous from the head down to scannedFromBlock. A truncated list keeps the newest
  // rows, so it is still complete for this purpose if its oldest row is at or before the record date.
  const rows = history.value.transfers;
  const oldest = rows.length ? rows[rows.length - 1]!.blockNumber : Number.MAX_SAFE_INTEGER;
  const reached = history.value.scannedFromBlock <= block && (!history.value.truncated || oldest <= block);
  const complete = current > 0n ? reached : false;

  const events = (actions?.value ?? []).filter((action) => action.symbol === token.symbol).sort((a, b) => a.effectiveAt - b.effectiveAt);
  const before = events.filter((action) => action.effectiveAt <= at);
  const multiplier = before.length ? BigInt(before[before.length - 1]!.newMultiplier) : events.length ? BigInt(events[0]!.oldMultiplier) : BigInt(market.value.assets.find((asset) => asset.symbol === token.symbol)?.uiMultiplier ?? WAD);
  const safeBalance = balance < 0n ? 0n : balance;
  const shareEquivalent = (safeBalance * multiplier) / WAD;
  return {
    symbol: token.symbol,
    recordDate,
    asOf: at,
    block,
    coverage: complete ? ("complete" as const) : ("incomplete" as const),
    scannedFromBlock: history.value.scannedFromBlock,
    rawBalance: safeBalance.toString(),
    multiplier: multiplier.toString(),
    shareEquivalent: shareEquivalent.toString(),
    shareEquivalentFloat: Number(formatUnits(shareEquivalent, 18)),
    currentShareEquivalentFloat: Number(formatUnits((current * BigInt(market.value.assets.find((asset) => asset.symbol === token.symbol)?.uiMultiplier ?? WAD)) / WAD, 18)),
    method: "current balance minus net transfers since the record date, from Transfer logs; multiplier from mirrored UIMultiplierUpdated events",
  };
}
