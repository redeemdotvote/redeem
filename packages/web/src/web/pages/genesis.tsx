import { Link } from "wouter";
import { Page, PageHead } from "../components/layout";
import { ChainLine } from "../components/robinhood-chain";
import { Button, Eyebrow, Mark, Skeleton } from "../components/ui";
import { useWallet } from "../hooks/use-wallet";
import { dateTimeUtc, shares, shortAddress, shortHash } from "../lib/format";
import { useGenesis } from "../queries/reports";

/** /genesis — the first of everything, with its timestamp, and the founding hundred. */
export default function GenesisPage() {
  const genesis = useGenesis();
  const wallet = useWallet();
  const g = genesis.data;
  const slots = g ? Array.from({ length: g.limit }, (_, index) => g.founders[index] ?? null) : [];
  return (
    <Page>
      <PageHead
        eyebrow={<span className="inline-flex flex-wrap items-center gap-4">Genesis · {g?.season.label ?? "Season 0"} <ChainLine caption={null} /></span>}
        title={
          <>
            The first hundred <span className="italic">on the record.</span>
          </>
        }
        body="Wallet numbers are assigned by signing order and never change. The first hundred wallets to record an intent or pre-register for redemption are the founding hundred. This page is the permanent file of who they are and of the first of everything."
        aside={
          g ? (
            <div className="grid grid-cols-2 gap-x-10 lg:text-right">
              <div>
                <div className="eyebrow">On file</div>
                <div className="font-mono mt-1 text-[32px] leading-none text-ink">{Math.min(g.recorded, g.limit)}</div>
              </div>
              <div>
                <div className="eyebrow">Founding numbers left</div>
                <div className="font-mono mt-1 text-[32px] leading-none text-emerald">{g.remaining}</div>
              </div>
            </div>
          ) : null
        }
      />
      {!g ? (
        <Skeleton className="h-72" />
      ) : (
        <>
          <section className="border-t border-line-2 pt-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <Eyebrow>The founding hundred</Eyebrow>
                <p className="mt-2 max-w-[60ch] text-[14.5px] text-ink-2">Filled squares are wallets on file, in the order they signed. The next signature takes #{Math.min(g.recorded + 1, g.limit)}.</p>
              </div>
              {g.remaining > 0 ? (
                <Button asChild>
                  <Link to={wallet.address ? "/portfolio" : "/intents"}>Take #{g.recorded + 1}</Link>
                </Button>
              ) : null}
            </div>
            <ol className="mt-6 grid grid-cols-10 gap-1.5 sm:gap-2">
              {slots.map((founder, index) =>
                founder ? (
                  <li key={index}>
                    <Link
                      to={`/portfolio?address=${founder.wallet}`}
                      title={`#${founder.number} · ${shortAddress(founder.wallet, 5)} · ${dateTimeUtc(founder.at)} · ${founder.tickers.join(", ")}`}
                      className="font-mono grid aspect-square place-items-center rounded-[6px] bg-emerald text-[10px] text-paper transition-transform hover:scale-105 sm:text-[12px]"
                    >
                      {founder.number}
                    </Link>
                  </li>
                ) : (
                  <li key={index} className={`font-mono grid aspect-square place-items-center rounded-[6px] border text-[10px] sm:text-[12px] ${index === g.recorded ? "border-emerald text-emerald" : "border-line text-grey-green/50"}`}>
                    {index + 1}
                  </li>
                ),
              )}
            </ol>
          </section>

          <section className="mt-14 border-t border-line-2 pt-8">
            <Eyebrow>The first of everything</Eyebrow>
            <div className="mt-5 grid gap-x-10 gap-y-8 md:grid-cols-2">
              <First
                title="First intent"
                empty="No intent has been signed yet. The first one is recorded here, permanently."
                lines={
                  g.firsts.intent
                    ? [
                        [`${g.firsts.intent.symbol} · ${g.firsts.intent.choiceLabel}`, `${shares(g.firsts.intent.shareEq)} share-eq`],
                        [shortAddress(g.firsts.intent.wallet, 6), `block ${g.firsts.intent.blockNumber.toLocaleString("en-US")}`],
                        [dateTimeUtc(g.firsts.intent.at), ""],
                      ]
                    : null
                }
                href={g.firsts.intent ? `/receipts/${g.firsts.intent.id}` : "/intents"}
                cta={g.firsts.intent ? "Open the receipt" : "Sign the first intent"}
              />
              <First
                title="First redemption pre-registration"
                empty="Nobody has joined a queue yet. Position #1 on every ticker is open."
                lines={
                  g.firsts.request
                    ? [
                        [`${g.firsts.request.symbol} · queue #${g.firsts.request.position}`, `${shares(g.firsts.request.shareEq)} share-eq`],
                        [shortAddress(g.firsts.request.wallet, 6), `block ${g.firsts.request.blockNumber.toLocaleString("en-US")}`],
                        [dateTimeUtc(g.firsts.request.at), ""],
                      ]
                    : null
                }
                href={g.firsts.request ? `/redeem?symbol=${g.firsts.request.symbol}` : "/redeem"}
                cta={g.firsts.request ? "Open the queue" : "Take position #1"}
              />
              <First
                title="First attested tally"
                empty="No meeting with recorded intent has reached its cutoff yet. The first Merkle root lands here, with its Bitcoin timestamp."
                lines={
                  g.firsts.attestation
                    ? [
                        [`${g.firsts.attestation.symbol} · ${g.firsts.attestation.leafCount} receipts`, `block ${g.firsts.attestation.blockNumber.toLocaleString("en-US")}`],
                        [shortHash(g.firsts.attestation.merkleRoot), g.firsts.attestation.timestamp?.status === "stamped" ? "timestamped" : "stamp pending"],
                        [dateTimeUtc(g.firsts.attestation.at), ""],
                      ]
                    : null
                }
                href={g.firsts.attestation ? `/reports/${g.firsts.attestation.ballotId}` : "/reports"}
                cta={g.firsts.attestation ? "Open the report" : "See open meetings"}
              />
              <First
                title="First referral"
                empty="No wallet has recorded through a referral link yet."
                lines={g.firsts.referral ? [[`Referred by ${shortAddress(g.firsts.referral.referrer, 6)}`, ""], [dateTimeUtc(g.firsts.referral.at), ""]] : null}
                href="/portfolio"
                cta="Get your link"
              />
            </div>
          </section>
          <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-grey-green">
            <Mark tone="muted">A place in a file · not a token, a vote or a claim</Mark>
            <span>Numbers are derived from the signed receipts on every read. They cannot be bought, moved or reassigned.</span>
          </div>
        </>
      )}
    </Page>
  );
}

function First({ title, lines, empty, href, cta }: { title: string; lines: Array<[string, string]> | null; empty: string; href: string; cta: string }) {
  return (
    <div className="border-t border-line pt-4">
      <h2 className="font-serif text-[24px] text-ink">{title}</h2>
      {lines ? (
        <dl className="mt-3">
          {lines.map(([left, right]) => (
            <div key={left} className="font-mono flex items-baseline justify-between gap-4 border-b border-line py-2 text-[13px]">
              <span className="text-ink">{left}</span>
              <span className="text-grey-green">{right}</span>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-2 max-w-[48ch] text-[14px] text-grey-green">{empty}</p>
      )}
      <Link to={href} className="mt-3 inline-block text-[13.5px] font-medium text-emerald hover:underline">
        {cta} →
      </Link>
    </div>
  );
}
