import type { RecordIndex } from "./records";

/**
 * XP. A number derived from signed records and referrals, recomputed on every read. It is not a
 * token, it is not redeemable, and it never enters a tally or a queue position. It exists so that
 * being early and thorough in the file is visible.
 *
 * Every rule below needs a signature that itself needs a real position (the server reads the
 * wallet's share-equivalent at signing), so XP cannot be earned from an empty wallet. Referral
 * credit is only paid when the referred wallet's first record carries at least
 * REFERRAL_MIN_SHARE_EQ, which keeps dust-wallet farming from being worth the effort.
 */
export const XP_RULES = [
  { key: "first_record", label: "First record", points: 25, note: "Your first signature puts the wallet in the file." },
  { key: "first_intent_ticker", label: "First intent on a ticker", points: 50, note: "Once per ticker, for the first proxy item you sign." },
  { key: "intent", label: "Each further intent", points: 10, note: "Every additional item signed, any ticker." },
  { key: "first_queue_ticker", label: "Join a redemption queue", points: 40, note: "Once per ticker, for a readiness request on file." },
  { key: "referral", label: "Referral", points: 100, note: "When a wallet you referred records with at least 1 share-eq." },
  { key: "referred", label: "Arriving by referral", points: 25, note: "If you recorded through someone's link." },
] as const;

export type XpKey = (typeof XP_RULES)[number]["key"];
export const REFERRAL_MIN_SHARE_EQ = 1n * 10n ** 18n;

const points = Object.fromEntries(XP_RULES.map((rule) => [rule.key, rule.points])) as Record<XpKey, number>;

export interface ReferralRow {
  referee: string;
  referrer: string;
}

export interface XpBreakdown {
  total: number;
  lines: Array<{ key: XpKey; label: string; count: number; points: number }>;
}

/** The wallet's first recorded weight, used for the referral threshold. */
function firstWeight(index: RecordIndex, wallet: string): bigint {
  const event = index.events.find((entry) => entry.wallet === wallet);
  return event ? BigInt(event.weight) : 0n;
}

export function referralCredited(index: RecordIndex, referee: string): boolean {
  return index.wallets.has(referee) && firstWeight(index, referee) >= REFERRAL_MIN_SHARE_EQ;
}

export function computeXp(index: RecordIndex, referrals: ReferralRow[], wallet: string): XpBreakdown {
  const counts: Record<XpKey, number> = { first_record: 0, first_intent_ticker: 0, intent: 0, first_queue_ticker: 0, referral: 0, referred: 0 };
  const mine = index.events.filter((event) => event.wallet === wallet);
  if (mine.length > 0) counts.first_record = 1;
  const intentTickers = new Set<string>();
  const queueTickers = new Set<string>();
  for (const event of mine) {
    if (event.kind === "intent") {
      if (intentTickers.has(event.symbol)) counts.intent += 1;
      else intentTickers.add(event.symbol);
    } else if (!queueTickers.has(event.symbol)) queueTickers.add(event.symbol);
  }
  counts.first_intent_ticker = intentTickers.size;
  counts.first_queue_ticker = queueTickers.size;
  for (const row of referrals) {
    if (row.referrer === wallet && referralCredited(index, row.referee)) counts.referral += 1;
    if (row.referee === wallet && mine.length > 0) counts.referred = 1;
  }
  const lines = XP_RULES.map((rule) => ({ key: rule.key, label: rule.label, count: counts[rule.key], points: counts[rule.key] * points[rule.key] }));
  return { total: lines.reduce((sum, line) => sum + line.points, 0), lines };
}

/** XP for every wallet in the index, for the leaderboard. */
export function xpForAll(index: RecordIndex, referrals: ReferralRow[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const wallet of index.wallets.keys()) out.set(wallet, computeXp(index, referrals, wallet).total);
  return out;
}
