import data from "../data/outcomes.json";

/**
 * What shareholders actually decided, as the issuer reported it on Form 8-K, Item 5.07. Built by
 * scripts/ingest-outcomes.py. It sits beside holder intent for comparison and is never blended
 * with it: intent is what token holders recorded, this is what holders of record voted.
 */
export interface OutcomeItem {
  index: string;
  title: string;
  votesFor: number | null;
  votesAgainst: number | null;
  votesAbstain: number | null;
  votesWithheld: number | null;
  brokerNonVotes: number | null;
  oneYear: number | null;
  twoYears: number | null;
  threeYears: number | null;
  nominees: Array<{ name: string; votesFor: number | null; votesAgainst: number | null; votesWithheld: number | null; votesAbstain: number | null; brokerNonVotes: number | null }>;
  result: string | null;
}
export interface Outcome {
  form: string;
  filedAt: string;
  accession: string;
  docUrl: string;
  symbol: string;
  ballotId: string;
  items: OutcomeItem[];
}

const OUTCOMES = data as unknown as Record<string, Outcome>;
const norm = (index: string) => index.toLowerCase().replace(/[^a-z0-9]+/g, "");

export function outcomeForBallot(ballotId: string): Outcome | null {
  return OUTCOMES[ballotId] ?? null;
}

/** The shareholder result for one item, reduced to the side that carried and the counts behind it. */
export function outcomeForItem(ballotId: string, index: string) {
  const outcome = OUTCOMES[ballotId];
  const item = outcome?.items.find((entry) => norm(entry.index) === norm(index));
  if (!outcome || !item) return null;
  const sum = (key: "votesFor" | "votesAgainst" | "votesWithheld" | "votesAbstain") => (item.nominees.length ? item.nominees.reduce((total, nominee) => total + (nominee[key] ?? 0), 0) : (item[key] ?? 0));
  const votesFor = sum("votesFor");
  const opposed = sum("votesAgainst") + sum("votesWithheld");
  const frequency = [
    ["one_year", item.oneYear],
    ["two_years", item.twoYears],
    ["three_years", item.threeYears],
  ].filter((entry): entry is [string, number] => typeof entry[1] === "number");
  let carried: string | null = null;
  if (frequency.length) carried = frequency.sort((a, b) => b[1] - a[1])[0]![0];
  else if (votesFor + opposed > 0) carried = votesFor >= opposed ? "for" : "against";
  return {
    source: { form: outcome.form, filedAt: outcome.filedAt, docUrl: outcome.docUrl },
    result: item.result,
    carried,
    votesFor: item.nominees.length ? votesFor : item.votesFor,
    votesAgainst: item.nominees.length ? sum("votesAgainst") : item.votesAgainst,
    votesWithheld: item.nominees.length ? sum("votesWithheld") : item.votesWithheld,
    votesAbstain: item.votesAbstain,
    brokerNonVotes: item.brokerNonVotes,
    frequency: frequency.length ? { oneYear: item.oneYear, twoYears: item.twoYears, threeYears: item.threeYears } : null,
    forShare: votesFor + opposed > 0 ? (votesFor / (votesFor + opposed)) * 100 : null,
    nominees: item.nominees,
  };
}

export const OUTCOME_COUNT = Object.keys(OUTCOMES).length;
