import { randomBytes, randomUUID } from "node:crypto";
import { ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { verifyMessage, type Address, type Hex } from "viem";
import { z } from "zod";
import { base } from "../__core/app";
import { db } from "../database";
import * as schema from "../database/schema";
import { assertPublicUrl } from "../lib/alerts";
import { addressSchema } from "../lib/shared";
import { tierFor } from "../lib/tier";

/**
 * Holder webhooks: the one thing REDEEM unlocks. A wallet holding enough REDEEM can register
 * https endpoints that receive every record event (multiplier changes, new proxy items, final
 * reports), signed with a per-hook secret. Ownership is proved with a signed message; nothing is
 * spent and no transaction is sent.
 */
const FRESH_SECONDS = 600;

export function hookMessage(action: "add" | "remove", wallet: string, target: string, issuedAt: number) {
  return `Redeem webhooks\naction: ${action}\nwallet: ${wallet.toLowerCase()}\ntarget: ${target}\nissued: ${issuedAt}`;
}

async function authorise(action: "add" | "remove", wallet: string, target: string, issuedAt: number, signature: string) {
  if (Math.abs(Math.floor(Date.now() / 1000) - issuedAt) > FRESH_SECONDS) throw new ORPCError("BAD_REQUEST", { message: "That signature has expired. Sign again." });
  const ok = await verifyMessage({ address: wallet as Address, message: hookMessage(action, wallet, target, issuedAt), signature: signature as Hex }).catch(() => false);
  if (!ok) throw new ORPCError("UNAUTHORIZED", { message: "The signature does not match this wallet." });
}

const mask = (url: string) => {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname.length > 1 ? "/…" : ""}`;
  } catch {
    return "…";
  }
};

export const hooks = {
  tier: base.input(z.object({ wallet: addressSchema })).handler(({ input }) => tierFor(input.wallet)),

  list: base.input(z.object({ wallet: addressSchema })).handler(async ({ input }) => {
    const rows = await db.select().from(schema.webhooks).where(eq(schema.webhooks.wallet, input.wallet.toLowerCase()));
    return rows.map((row) => ({ id: row.id, target: mask(row.url), active: row.active, lastStatus: row.lastStatus, lastDeliveredAt: row.lastDeliveredAt, failures: row.failures, createdAt: row.createdAt }));
  }),

  add: base.input(z.object({ wallet: addressSchema, url: z.string().max(400), issuedAt: z.number().int(), signature: z.string() })).handler(async ({ input }) => {
    await authorise("add", input.wallet, input.url, input.issuedAt, input.signature);
    const standing = await tierFor(input.wallet);
    if (!standing.tier) throw new ORPCError("FORBIDDEN", { message: `Webhooks need at least ${standing.tiers[standing.tiers.length - 1]?.min.toLocaleString("en-US")} REDEEM in this wallet.` });
    const existing = await db.select().from(schema.webhooks).where(eq(schema.webhooks.wallet, input.wallet.toLowerCase()));
    if (existing.length >= standing.tier.webhooks) throw new ORPCError("FORBIDDEN", { message: `The ${standing.tier.label} tier allows ${standing.tier.webhooks} webhook${standing.tier.webhooks === 1 ? "" : "s"}. Remove one first.` });
    const url = await assertPublicUrl(input.url).catch((error: Error) => {
      throw new ORPCError("BAD_REQUEST", { message: error.message });
    });
    const secret = randomBytes(24).toString("hex");
    const id = randomUUID();
    await db.insert(schema.webhooks).values({ id, wallet: input.wallet.toLowerCase(), url: url.toString(), secret, active: true, failures: 0 });
    // The secret is shown once, here, and never again.
    return { id, target: mask(url.toString()), secret };
  }),

  remove: base.input(z.object({ wallet: addressSchema, id: z.string(), issuedAt: z.number().int(), signature: z.string() })).handler(async ({ input }) => {
    await authorise("remove", input.wallet, input.id, input.issuedAt, input.signature);
    await db.delete(schema.webhooks).where(and(eq(schema.webhooks.id, input.id), eq(schema.webhooks.wallet, input.wallet.toLowerCase())));
    return { removed: input.id };
  }),
};
