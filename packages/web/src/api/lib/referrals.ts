import { eq, sql } from "drizzle-orm";
import { keccak256, toBytes } from "viem";
import { db } from "../database";
import * as schema from "../database/schema";
import type { RecordIndex } from "./records";
import { referralCredited } from "./xp";

/**
 * Referrals. A wallet's code is derived from its address and stored the first time it is asked
 * for. A referee is bound to a referrer exactly once, at the referee's first signature, and only
 * if it arrived with a code and is not the referrer itself. Bindings never change and carry no
 * rights; XP is computed from them at read time.
 */
export async function codeFor(wallet: string): Promise<string> {
  const lower = wallet.toLowerCase();
  const [existing] = await db.select({ code: schema.referralCodes.code }).from(schema.referralCodes).where(eq(schema.referralCodes.wallet, lower)).limit(1);
  if (existing) return existing.code;
  const code = keccak256(toBytes(lower)).slice(2, 10);
  await db.insert(schema.referralCodes).values({ code, wallet: lower }).onConflictDoNothing();
  return code;
}

async function eventCount(wallet: string): Promise<number> {
  const [[a], [b]] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(schema.instructions).where(eq(schema.instructions.wallet, wallet)),
    db.select({ count: sql<number>`count(*)` }).from(schema.redemptionRequests).where(eq(schema.redemptionRequests.wallet, wallet)),
  ]);
  return Number(a?.count ?? 0) + Number(b?.count ?? 0);
}

/** Called right after a signature is stored. Binds only when that signature was the wallet's first. */
export async function bindReferral(referee: string, code: string | undefined): Promise<boolean> {
  if (!code) return false;
  const lower = referee.toLowerCase();
  const normalized = code.trim().toLowerCase();
  if (!/^[a-z0-9]{6,12}$/.test(normalized)) return false;
  const [bound] = await db.select({ referee: schema.referrals.referee }).from(schema.referrals).where(eq(schema.referrals.referee, lower)).limit(1);
  if (bound) return false;
  const [owner] = await db.select({ wallet: schema.referralCodes.wallet }).from(schema.referralCodes).where(eq(schema.referralCodes.code, normalized)).limit(1);
  if (!owner || owner.wallet === lower) return false;
  if ((await eventCount(lower)) > 1) return false;
  await db.insert(schema.referrals).values({ referee: lower, referrer: owner.wallet, code: normalized }).onConflictDoNothing();
  return true;
}

export async function loadReferrals() {
  return db.select({ referee: schema.referrals.referee, referrer: schema.referrals.referrer, createdAt: schema.referrals.createdAt }).from(schema.referrals);
}

export function referralSummary(rows: Array<{ referee: string; referrer: string }>, index: RecordIndex, wallet: string) {
  const mine = rows.filter((row) => row.referrer === wallet);
  const credited = mine.filter((row) => referralCredited(index, row.referee)).length;
  const referredBy = rows.find((row) => row.referee === wallet)?.referrer ?? null;
  return { referred: mine.length, credited, pending: mine.length - credited, referredBy };
}
