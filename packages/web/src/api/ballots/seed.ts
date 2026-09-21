import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
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
  // Multi-row upserts in chunks: a few dozen statements instead of one round trip per row, which
  // matters when the database is remote and the first boot runs inside a function's time limit.
  const ballotValues = rows
    .filter((ballot) => findToken(ballot.symbol))
    .map((ballot) => ({
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
    }));
  // Two filings can share an accession only by mistake; keep the first so the unique index holds.
  const seenAccession = new Set<string>();
  const uniqueBallots = ballotValues.filter((ballot) => (seenAccession.has(ballot.accession) ? false : (seenAccession.add(ballot.accession), true)));
  const kept = new Set(uniqueBallots.map((ballot) => ballot.id));
  const excluded = (column: string) => sql.raw(`excluded."${column}"`);
  for (let i = 0; i < uniqueBallots.length; i += 40) {
    await db
      .insert(schema.ballots)
      .values(uniqueBallots.slice(i, i + 40))
      .onConflictDoUpdate({
        target: schema.ballots.id,
        set: { docUrl: excluded("doc_url"), companyName: excluded("company_name"), meetingType: excluded("meeting_type"), meetingDate: excluded("meeting_date"), meetingTime: excluded("meeting_time"), meetingFormat: excluded("meeting_format"), meetingUrl: excluded("meeting_url"), recordDate: excluded("record_date"), closesAt: excluded("closes_at"), publishedAt: excluded("published_at") },
      });
  }
  const itemValues = rows
    .filter((ballot) => kept.has(ballot.id))
    .flatMap((ballot) => {
      const seenIds = new Set<string>();
      return ballot.items.flatMap((item, ordinal) => {
        const id = itemId(ballot.id, item.index);
        if (seenIds.has(id)) return [];
        seenIds.add(id);
        return [{ id, ballotId: ballot.id, symbol: ballot.symbol, ordinal, index: item.index, title: item.title, summary: item.summary, itemType: item.type, proponent: item.proponent, boardRecommendation: item.boardRecommendation, approvalStandard: item.approvalStandard, abstainEffect: item.abstainEffect, brokerNonVoteEffect: item.brokerNonVoteEffect, routine: item.routine, choices: JSON.stringify(choicesFor(item)), nominees: JSON.stringify(item.nominees) }];
      });
    });
  // Items are re-upserted so a corrected extraction lands without touching signed instructions.
  for (let i = 0; i < itemValues.length; i += 40) {
    await db
      .insert(schema.ballotItems)
      .values(itemValues.slice(i, i + 40))
      .onConflictDoUpdate({
        target: schema.ballotItems.id,
        set: { ordinal: excluded("ordinal"), index: excluded("index"), title: excluded("title"), summary: excluded("summary"), itemType: excluded("item_type"), proponent: excluded("proponent"), boardRecommendation: excluded("board_recommendation"), approvalStandard: excluded("approval_standard"), abstainEffect: excluded("abstain_effect"), brokerNonVoteEffect: excluded("broker_non_vote_effect"), routine: excluded("routine"), choices: excluded("choices"), nominees: excluded("nominees") },
      });
  }
  await writeMarker(SEED_CURSOR, fingerprint);
}
