import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../database";
import * as schema from "../database/schema";

/**
 * Timestamp proofs without a contract. A document (an attestation, or a whole meeting report) is
 * frozen as canonical JSON, hashed with SHA-256, and the digest is submitted to the public
 * OpenTimestamps calendars, which aggregate it into a Bitcoin transaction. The resulting .ots
 * file proves the document existed at that time and has not changed since, and it can be checked
 * by anyone with the standard `ots` client, without trusting Redeem. The exact document bytes are
 * stored, because the proof is over those bytes and nothing else.
 */
const CALENDARS = ["https://a.pool.opentimestamps.org", "https://b.pool.opentimestamps.org", "https://a.pool.eternitywall.com"];

/** `\x00OpenTimestamps\x00\x00Proof\x00` + magic, then format version 1. */
const OTS_HEADER = Buffer.concat([Buffer.from("004f70656e54696d657374616d7073000050726f6f6600bf89e2e884e89294", "hex"), Buffer.from([0x01])]);
const OP_SHA256 = 0x08;
const FORK = 0xff;

/** Stable JSON: keys sorted at every level, no whitespace, so the same facts always hash the same. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined);
    return `{${entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function submit(calendar: string, digest: Buffer): Promise<Buffer | null> {
  try {
    const response = await fetch(`${calendar}/digest`, {
      method: "POST",
      headers: { accept: "application/vnd.opentimestamps.v1", "content-type": "application/x-www-form-urlencoded", "user-agent": "redeem-record-layer" },
      body: new Uint8Array(digest),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    const body = Buffer.from(await response.arrayBuffer());
    return body.length > 0 && body.length < 4096 ? body : null;
  } catch {
    return null;
  }
}

/** Header, the hash op, the digest, then one branch per calendar (all but the last prefixed by a fork). */
export function buildOts(digest: Buffer, branches: Buffer[]): Buffer {
  const parts: Buffer[] = [OTS_HEADER, Buffer.from([OP_SHA256]), digest];
  branches.forEach((branch, index) => {
    if (index < branches.length - 1) parts.push(Buffer.from([FORK]));
    parts.push(branch);
  });
  return Buffer.concat(parts);
}

export type TimestampRow = typeof schema.timestamps.$inferSelect;

/**
 * Freezes `document` under `key` and stamps it. Idempotent: an existing row is returned as is, so
 * the stored bytes never change after the first call. A failed submission is stored as "failed"
 * with the document intact and retried on the next call.
 */
export async function ensureTimestamp(key: string, kind: "attestation" | "report", document: string): Promise<TimestampRow> {
  const [existing] = await db.select().from(schema.timestamps).where(eq(schema.timestamps.key, key)).limit(1);
  if (existing && existing.status === "stamped") return existing;
  const text = existing?.document ?? document;
  const digest = createHash("sha256").update(text, "utf8").digest();
  const results = await Promise.all(CALENDARS.map((calendar) => submit(calendar, digest)));
  const used = CALENDARS.filter((_, index) => results[index]);
  const branches = results.filter((entry): entry is Buffer => Boolean(entry));
  const values = {
    key,
    kind,
    document: text,
    digest: digest.toString("hex"),
    ots: branches.length ? buildOts(digest, branches).toString("base64") : null,
    calendars: JSON.stringify(used),
    status: branches.length ? "stamped" : "failed",
    stampedAt: branches.length ? new Date() : null,
  };
  await db.insert(schema.timestamps).values(values).onConflictDoUpdate({ target: schema.timestamps.key, set: { ots: values.ots, calendars: values.calendars, status: values.status, stampedAt: values.stampedAt } });
  const [row] = await db.select().from(schema.timestamps).where(eq(schema.timestamps.key, key)).limit(1);
  return row!;
}

export async function getTimestamp(key: string): Promise<TimestampRow | null> {
  const [row] = await db.select().from(schema.timestamps).where(eq(schema.timestamps.key, key)).limit(1);
  return row ?? null;
}

export function publicTimestamp(row: TimestampRow | null) {
  if (!row) return null;
  return { key: row.key, digest: row.digest, status: row.status, calendars: JSON.parse(row.calendars) as string[], stampedAt: row.stampedAt, bytes: Buffer.byteLength(row.document, "utf8") };
}
