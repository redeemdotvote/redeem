import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import seed from "../data/ballots.json";
import { db } from "../database";
import { readMarker, writeMarker } from "../database/migrate";
import * as schema from "../database/schema";
import { findToken } from "../chain/tokens";

/**
 * Ballots are extracted from each issuer's proxy statement (DEF 14A) on SEC EDGAR by
 * `scripts/ingest-proxies.py` into `data/ballots.json`, and mirrored into the database at boot.
 * Where the extraction and the filing differ, the filing governs — every item links to it.
 */
export interface SeedItem {
  index: string;
  title: string;
  summary: string;
  type: string;
  proponent: string;
  boardRecommendation: string;
  approvalStandard: string | null;
  abstainEffect: string | null;
  brokerNonVoteEffect: string | null;
  routine: boolean | null;
  nominees: string[];
}

export interface SeedBallot {
  id: string;
  symbol: string;
  cik: string;
  accession: string;
  form: string;
  filedAt: string;
  docUrl: string;
  companyName: string;
  meetingType: string;
  meetingDate: string;
  meetingTime: string | null;
  meetingFormat: string | null;
  meetingUrl: string | null;
  recordDate: string | null;
  closesAt: number;
  publishedAt: number;
  items: SeedItem[];
}

export interface Choice {
  value: string;
  label: string;
  /** "for" | "against" | "neutral" — drives colour in the tally. */
  tone: "for" | "against" | "neutral";
  help: string;
}

const DELEGATE: Choice = { value: "delegate", label: "Delegate", tone: "neutral", help: "Name an address to carry this intent for you. Nothing is delegated today; the address is recorded." };

/** The choices a holder can sign for an item, derived from what the proxy asks. */
export function choicesFor(item: Pick<SeedItem, "type" | "approvalStandard">): Choice[] {
  if (item.type === "say_on_frequency") {
    return [
      { value: "one_year", label: "Every year", tone: "for", help: "Hold the advisory vote on executive pay annually." },
      { value: "two_years", label: "Every two years", tone: "neutral", help: "Hold it every two years." },
      { value: "three_years", label: "Every three years", tone: "neutral", help: "Hold it every three years." },
      { value: "abstain", label: "Abstain", tone: "neutral", help: "Recorded as present, without a preference." },
      DELEGATE,
    ];
  }
  const plurality = /plurality/i.test(item.approvalStandard ?? "");
  if (item.type === "election" && plurality) {
    return [
      { value: "for", label: "For", tone: "for", help: "Vote for the nominees." },
      { value: "withhold", label: "Withhold", tone: "against", help: "Withhold authority to vote for the nominees." },
      DELEGATE,
    ];
  }
  return [
    { value: "for", label: "For", tone: "for", help: "Counts toward approval." },
    { value: "against", label: "Against", tone: "against", help: "Counts against approval." },
    { value: "abstain", label: "Abstain", tone: "neutral", help: "Recorded as present, without a preference." },
    DELEGATE,
  ];
}

export function itemId(ballotId: string, index: string): string {
  return `${ballotId}-${index.toLowerCase().replace(/[^a-z0-9]+/g, "")}`;
}

let seeded: Promise<void> | null = null;

export function seedBallots(): Promise<void> {
  if (!seeded) seeded = runSeed();
  return seeded;
}

const SEED_CURSOR = "seed:ballots";

async function runSeed(): Promise<void> {
  const rows = seed as SeedBallot[];
  // The mirror is a few hundred upserts; on a serverless host that is a few hundred round trips
  // per cold start. A fingerprint of the extraction file says whether the database already has it.
  const fingerprint = createHash("sha256").update(JSON.stringify(rows)).digest("hex").slice(0, 32);
  if ((await readMarker(SEED_CURSOR)) === fingerprint) return;
  const existing = new Set((await db.select({ id: schema.ballots.id }).from(schema.ballots)).map((row) => row.id));

  for (const ballot of rows) {
    if (!findToken(ballot.symbol)) continue;
    const values = {
      id: ballot.id,
      symbol: ballot.symbol,
      cik: ballot.cik,
      accession: ballot.accession,
      form: ballot.form,
      filedAt: ballot.filedAt,
      docUrl: ballot.docUrl,
      companyName: ballot.companyName,
      meetingType: ballot.meetingType,
      meetingDate: ballot.meetingDate,
      meetingTime: ballot.meetingTime,
      meetingFormat: ballot.meetingFormat,
      meetingUrl: ballot.meetingUrl,
      recordDate: ballot.recordDate,
      closesAt: ballot.closesAt,
      publishedAt: ballot.publishedAt,
    };
    if (existing.has(ballot.id)) {
      await db.update(schema.ballots).set(values).where(eq(schema.ballots.id, ballot.id));
    } else {
      await db.insert(schema.ballots).values(values).onConflictDoNothing();
    }

    const items = ballot.items.map((item, ordinal) => ({
      id: itemId(ballot.id, item.index),
      ballotId: ballot.id,
      symbol: ballot.symbol,
      ordinal,
      index: item.index,
      title: item.title,
      summary: item.summary,
      itemType: item.type,
      proponent: item.proponent,
      boardRecommendation: item.boardRecommendation,
      approvalStandard: item.approvalStandard,
      abstainEffect: item.abstainEffect,
      brokerNonVoteEffect: item.brokerNonVoteEffect,
      routine: item.routine,
      choices: JSON.stringify(choicesFor(item)),
      nominees: JSON.stringify(item.nominees),
    }));
    // Items are re-upserted so a corrected extraction lands without touching signed instructions.
    for (const item of items) {
      await db
        .insert(schema.ballotItems)
        .values(item)
        .onConflictDoUpdate({ target: schema.ballotItems.id, set: item });
    }
  }
  await writeMarker(SEED_CURSOR, fingerprint);
}
