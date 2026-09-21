import { ExternalLink } from "lucide-react";
import { isoDate } from "../lib/format";
import { Eyebrow, Mark } from "./ui";

type Outcome = {
  source: { form: string; filedAt: string; docUrl: string };
  result: string | null;
  carried: string | null;
  votesFor: number | null;
  votesAgainst: number | null;
  votesWithheld: number | null;
  votesAbstain: number | null;
  brokerNonVotes: number | null;
  frequency: { oneYear: number | null; twoYears: number | null; threeYears: number | null } | null;
  forShare: number | null;
  nominees: Array<{ name: string; votesFor: number | null; votesAgainst: number | null; votesWithheld: number | null }>;
};

const n = (value: number | null) => (value === null ? "—" : value.toLocaleString("en-US"));
const RESULT: Record<string, string> = { approved: "Approved", not_approved: "Not approved", elected: "Elected", not_elected: "Not elected", one_year: "Every year", two_years: "Every two years", three_years: "Every three years" };

/**
 * What holders of record actually voted, from the issuer's Form 8-K, Item 5.07. Shown beside
 * holder intent and never mixed into it.
 */
export function OutcomeCard({ outcome, holderLeading }: { outcome: Outcome; holderLeading: string | null }) {
  const agreed = holderLeading && outcome.carried ? holderLeading === outcome.carried : null;
  return (
    <section className="rounded-[16px] border border-line bg-cream p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Eyebrow>How shareholders voted</Eyebrow>
          {outcome.result ? <Mark tone="ink">{RESULT[outcome.result] ?? outcome.result}</Mark> : null}
        </div>
        {agreed === null ? null : <Mark tone={agreed ? "live" : "warn"}>{agreed ? "Token holders agreed" : "Token holders differed"}</Mark>}
      </div>
      {outcome.frequency ? (
        <dl className="mt-4 grid grid-cols-3 gap-x-6">
          {(
            [
              ["Every year", outcome.frequency.oneYear],
              ["Two years", outcome.frequency.twoYears],
              ["Three years", outcome.frequency.threeYears],
            ] as Array<[string, number | null]>
          ).map(([label, value]) => (
            <div key={label}>
              <dd className="font-mono text-[18px] text-ink">{n(value)}</dd>
              <dt className="eyebrow mt-1">{label}</dt>
            </div>
          ))}
        </dl>
      ) : (
        <>
          {outcome.forShare !== null ? (
            <div className="mt-4">
              <div className="h-[6px] w-full overflow-hidden rounded-full bg-line">
                <div className="h-full rounded-full bg-ink" style={{ width: `${outcome.forShare}%` }} />
              </div>
              <div className="font-mono mt-1.5 text-[12px] text-grey-green">{outcome.forShare.toFixed(1)}% for, of votes for and against</div>
            </div>
          ) : null}
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
            {(
              [
                ["For", outcome.votesFor],
                [outcome.votesWithheld ? "Withheld" : "Against", outcome.votesWithheld ? outcome.votesWithheld : outcome.votesAgainst],
                ["Abstain", outcome.votesAbstain],
                ["Broker non-votes", outcome.brokerNonVotes],
              ] as Array<[string, number | null]>
            ).map(([label, value]) => (
              <div key={label}>
                <dd className="font-mono text-[15px] text-ink">{n(value)}</dd>
                <dt className="eyebrow mt-1">{label}</dt>
              </div>
            ))}
          </dl>
        </>
      )}
      {outcome.nominees.length > 0 ? (
        <details className="mt-4 text-[13px]">
          <summary className="cursor-pointer text-grey-green hover:text-ink">{outcome.nominees.length} nominees, individually</summary>
          <ol className="mt-2 border-t border-line">
            {outcome.nominees.map((nominee) => (
              <li key={nominee.name} className="font-mono flex justify-between gap-4 border-b border-line py-1.5 text-[12.5px]">
                <span className="font-sans text-ink">{nominee.name}</span>
                <span className="text-grey-green">
                  {n(nominee.votesFor)} for · {n(nominee.votesWithheld ?? nominee.votesAgainst)} {nominee.votesWithheld !== null ? "withheld" : "against"}
                </span>
              </li>
            ))}
          </ol>
        </details>
      ) : null}
      <p className="mt-4 text-[12.5px] leading-relaxed text-grey-green">
        Shares voted by holders of record, as reported by the issuer in its{" "}
        <a href={outcome.source.docUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-emerald hover:underline">
          {outcome.source.form} filed {isoDate(outcome.source.filedAt)} <ExternalLink className="size-3" />
        </a>
        . Token-holder intent above was not part of this count; where this differs from the filing, the filing governs.
      </p>
    </section>
  );
}
