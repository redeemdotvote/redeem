import { ArrowRight, ArrowUpRight, Search } from "lucide-react";
import { motion, useScroll, useTransform } from "motion/react";
import { useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { ChainLine, ChainLogo, PostRef, TENEV_POST } from "../components/robinhood-chain";
import { ArchiveIllustration, ARCHIVE_FRONT_X, ARCHIVE_TABS } from "../components/archive";
import { MultiplierPlates } from "../components/multiplier-plates";
import { ShareEqCalculator } from "../components/calc";
import { Page } from "../components/layout";
import { startGuide } from "../components/guide";
import { DeskRow, SecurityDesk } from "../components/desk";
import { TokenCA } from "../components/token-ca";
import { FoundingLine } from "../components/founding";
import { COUNTER_THRESHOLD, LatestRecords } from "../components/latest-records";
import { PHOTOS, PhotoBand } from "../components/photo";
import { SecurityRow } from "../components/ledger";
import { Num } from "../components/number";
import { OwnershipDiagram } from "../components/ownership";
import { RecordInspector } from "../components/record-inspector";
import { RecordTable } from "../components/record-table";
import { Sheet } from "../components/sheet";
import { AssetLogo } from "../components/brand";
import { Button, Display, Eyebrow, Input, Mark, Select, Skeleton } from "../components/ui";
import { useWallet } from "../hooks/use-wallet";
import { ageLabel, multiplier, shares, shortDate, usd, wad } from "../lib/format";
import { useCorporateActions } from "../queries/portfolio";
import { useRecordBook } from "../queries/record";
import { useHomeStats } from "../queries/stats";

const SEQUENCE = [
  { n: "01", title: "Read the chain", body: "Official balances and multiplier events, checked against the contract.", code: "balanceOf · uiMultiplier · UIMultiplierUpdated" },
  { n: "02", title: "Normalise the record", body: "Raw balances become share-equivalents. Tokens never rebase; the ratio moves.", code: "shareEq = raw × uiMultiplier ÷ 1e18" },
  { n: "03", title: "Record intent", body: "Holders sign what they would want, weighted by what they hold. Intent, not a vote.", code: "EIP-712 · BallotInstruction" },
  { n: "04", title: "Prepare redemption", body: "Demand and acknowledgements packaged per ticker before a window opens.", code: "queue position · terms sha256" },
];

const TRUST: Array<[string, string]> = [
  ["Official assets only", "Only verified Robinhood Stock Token contracts."],
  ["Multiplier-aware", "Share-equivalents use the token's live uiMultiplier."],
  ["No fake voting", "Intent is not shareholder voting."],
  ["No custody", "Redeem does not custody Stock Tokens."],
  ["No fake redemption", "Queue participation does not guarantee settlement."],
  ["Open accounting", "Every calculation can be inspected."],
];

const fmt4 = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 });

/* ------------------------------------------------------------------ hero */

const INDEX = ["NVDA", "AAPL", "MSFT", "GOOGL", "SPY"];
const INDEX_TOP = ARCHIVE_TABS.map((t) => t * 100);

/** The archive's index: one ticker per drawer, with the share-equivalent on record. One column, five hairlines. */
function ArchiveIndex({ rows }: { rows: Array<{ symbol: string; shareEquivalent: number }> }) {
  return (
    <div className="pointer-events-none absolute inset-0 hidden lg:block" aria-hidden>
      {INDEX.map((symbol, index) => {
        const row = rows.find((entry) => entry.symbol === symbol);
        return (
          <div key={symbol} className="absolute flex -translate-y-1/2 items-center" style={{ top: `${INDEX_TOP[index]}%`, left: "0%", width: `calc(${ARCHIVE_FRONT_X * 100}% + 6px)` }}>
            <div className="w-[120px] shrink-0 text-right">
              <div className="font-mono text-[13px] leading-none text-ink">{symbol}</div>
              <div className="font-mono mt-1 text-[11.5px] leading-none text-grey-green">{row ? `${shares(row.shareEquivalent)} sh-eq` : "—"}</div>
            </div>
            <span className="mx-3 h-px flex-1 bg-ink/30" />
            <span className="size-[5px] shrink-0 rounded-full bg-ink" />
          </div>
        );
      })}
    </div>
  );
}

function Hero() {
  const stats = useHomeStats();
  const book = useRecordBook();
  const nvda = book.data?.rows.find((row) => row.symbol === "NVDA");
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const artY = useTransform(scrollYProgress, [0, 1], [0, 50]);
  const strip: Array<[string, React.ReactNode]> = [
    ["Share-equivalents recorded", stats.data?.shareEquivalentRecorded ? <Num value={stats.data.shareEquivalentRecorded} format={shares} /> : null],
    ["Recorded value", stats.data?.supplyValueUsd ? <Num value={stats.data.supplyValueUsd} format={(v) => usd(v, { compact: true })} /> : null],
    ["Official assets", stats.data ? String(stats.data.stocks) : null],
    stats.data && stats.data.founding.remaining > 0
      ? ["Founding numbers left", <Num key="f" value={stats.data.founding.remaining} format={(v) => `${Math.round(v)} / ${stats.data!.founding.limit}`} />]
      : ["Wallets recorded", stats.data ? <Num value={stats.data.recordedWallets} format={(v) => Math.round(v).toLocaleString("en-US")} /> : null],
    // Activity counters appear once there is enough activity for them to mean something; until then
    // the strip shows what is open to be signed, which is just as real.
    stats.data && stats.data.intents >= COUNTER_THRESHOLD ? ["Intents signed", <Num key="i" value={stats.data.intents} format={(v) => Math.round(v).toLocaleString("en-US")} />] : ["Proxy items open", stats.data ? String(stats.data.openBallotItems) : null],
    stats.data && stats.data.requests >= COUNTER_THRESHOLD ? ["Queue requests", <Num key="q" value={stats.data.requests} format={(v) => Math.round(v).toLocaleString("en-US")} />] : ["Meetings open", stats.data ? String(stats.data.openCompanies) : null],
  ];

  return (
    <section ref={ref} className="env-hero relative overflow-hidden">
      <div aria-hidden className="ledger-lines pointer-events-none absolute inset-0" />
      <Page className="relative">
        <div className="grid min-h-[calc(90svh-60px)] items-center gap-10 pt-10 pb-6 lg:grid-cols-[minmax(0,0.48fr)_minmax(0,0.52fr)] lg:gap-6 lg:pt-4">
          <div className="relative z-10 max-w-[640px]">
            <div className="rise flex flex-wrap items-center gap-x-4 gap-y-2">
              <ChainLine caption="Read from" />
              <span className="text-[13px] text-grey-green">Independent record layer</span>
            </div>
            <Display as="h1" size="hero" className="rise-2 mt-7">
              Every token
              <br />
              leaves a <span className="text-emerald italic">record.</span>
            </Display>
            <p className="rise-3 mt-7 max-w-[46ch] text-[17px] leading-relaxed text-ink sm:text-[19px]">
              When Robinhood turns on votes and 1:1 share redemption, this is the file that already knows what you held and what you wanted.
            </p>
            <p className="rise-3 mt-3 max-w-[46ch] text-[15px] leading-relaxed text-grey-green">Connect wallet. Sign intent. Join the redemption queue. No custody. No approval. No fake vote.</p>
            <div className="rise-4 mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <Link to="/record">
                  Open Record Book <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/portfolio">View my positions</Link>
              </Button>
              <button type="button" onClick={startGuide} className="text-[14px] text-grey-green underline-offset-4 hover:text-ink hover:underline">
                New here? Take the walkthrough
              </button>
            </div>
            <div className="rise-4 mt-5 flex flex-col items-start gap-3">
              <FoundingLine />
              <TokenCA />
            </div>
          </div>

          <div className="relative min-w-0">
            <motion.div style={{ y: artY }} className="drift relative mx-auto w-full max-w-[560px] lg:mr-[2vw] lg:ml-auto">
              <ArchiveIllustration />
              <ArchiveIndex rows={book.data?.rows ?? []} />
            </motion.div>
            <motion.div className="surface relative z-10 mt-4 rounded-[14px] px-5 py-4 lg:absolute lg:inset-x-0 lg:-bottom-8 lg:mt-0" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}>
              {nvda ? (
                <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
                  <div className="flex items-center gap-2.5">
                    <AssetLogo symbol={nvda.symbol} logo={nvda.logo} size="sm" />
                    <div>
                      <div className="text-[14px] font-medium text-ink">{nvda.symbol}</div>
                      <div className="text-[11.5px] text-grey-green">Record snapshot</div>
                    </div>
                  </div>
                  {(
                    [
                      [fmt4(nvda.shareEquivalent), "Share-equivalent"],
                      [`${multiplier(nvda.uiMultiplier, 6)}×`, "Multiplier"],
                      [nvda.valueUsd === null ? "No feed" : usd(nvda.valueUsd, { compact: true }), "Value"],
                    ] as Array<[string, string]>
                  ).map(([value, label]) => (
                    <div key={label}>
                      <div className="font-mono text-[17px] leading-none text-ink">{value}</div>
                      <div className="eyebrow mt-1.5">{label}</div>
                    </div>
                  ))}
                  <div className="ml-auto hidden items-center gap-2.5 text-[12px] text-grey-green xl:flex">
                    <ChainLogo height={13} />
                    <span>updated {ageLabel(book.data?.dataAgeMs)}</span>
                  </div>
                </div>
              ) : (
                <Skeleton className="h-12" />
              )}
            </motion.div>
          </div>
        </div>

        <dl className="rise-4 grid grid-cols-2 gap-x-8 gap-y-6 border-t border-line-2 py-6 sm:grid-cols-3 lg:grid-cols-6">
          {strip.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dd className="font-mono text-[26px] leading-none text-ink sm:text-[30px]">{value ?? <Skeleton className="h-8 w-24" />}</dd>
              <dt className="eyebrow mt-2">{label}</dt>
            </div>
          ))}
        </dl>
      </Page>
    </section>
  );
}

/* ---------------------------------------------------------------- the desk */

function Desk() {
  return (
    <>
      <section className="env-mint py-14 lg:py-16">
        <Page>
          <SecurityDesk symbol="AMC" compact />
        </Page>
      </section>
      <DeskRow />
    </>
  );
}

/* ---------------------------------------------------------------- the post */

/** The post Redeem was built for. */
function ThePost() {
  return (
    <section className="border-y border-line-2">
      <Page>
        <div className="grid gap-10 py-14 lg:grid-cols-[minmax(0,0.42fr)_minmax(0,0.58fr)] lg:items-center lg:py-16">
          <div>
            <Eyebrow>Why Redeem exists</Eyebrow>
            <p className="mt-4 max-w-[40ch] text-[16px] leading-relaxed text-ink-2">
              On {TENEV_POST.date}, Robinhood's CEO said in-kind redemption and voting are coming for Stock Tokens. Redeem is the record layer built for that day: share-equivalents, holder intent and redemption demand, verifiable now and ready when the rights arrive.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-4">
              <ChainLine caption="Built on" />
              <span className="text-[12.5px] text-grey-green">Independent · not affiliated with or endorsed by Robinhood</span>
            </div>
          </div>
          <a href={TENEV_POST.url} target="_blank" rel="noreferrer" className="group block border-l-2 border-emerald pl-6 sm:pl-8">
            <blockquote className="font-serif text-[30px] leading-[1.15] text-ink sm:text-[40px] lg:text-[44px]">“{TENEV_POST.text}”</blockquote>
            <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px]">
              <span className="font-medium text-ink">{TENEV_POST.author}</span>
              <span className="text-grey-green">{TENEV_POST.role}</span>
              <span className="text-grey-green">·</span>
              <span className="text-grey-green">
                {TENEV_POST.handle} on X · {TENEV_POST.date}
              </span>
              <span className="inline-flex items-center gap-1 text-emerald group-hover:underline">
                View post <ArrowUpRight className="size-3.5" />
              </span>
            </div>
          </a>
        </div>
      </Page>
    </section>
  );
}

/* ----------------------------------------------------------- record book */

type Sort = "value" | "shareEq" | "queue" | "action" | "symbol";

function RecordBookPanel() {
  const wallet = useWallet();
  const book = useRecordBook(wallet.address);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("value");
  const [selected, setSelected] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const rows = useMemo(() => {
    const all = book.data?.rows ?? [];
    const query = q.trim().toLowerCase();
    return all
      .filter((row) => !query || row.symbol.toLowerCase().includes(query) || row.name.toLowerCase().includes(query))
      .sort((a, b) => {
        switch (sort) {
          case "shareEq":
            return b.shareEquivalent - a.shareEquivalent;
          case "queue":
            return b.requestedShareEq - a.requestedShareEq || b.intents - a.intents;
          case "action":
            return (b.lastAction?.effectiveAt ?? 0) - (a.lastAction?.effectiveAt ?? 0);
          case "symbol":
            return a.symbol.localeCompare(b.symbol);
          default:
            return (b.valueUsd ?? -1) - (a.valueUsd ?? -1) || b.shareEquivalent - a.shareEquivalent;
        }
      })
      .slice(0, 12);
  }, [book.data, q, sort]);
  const current = rows.find((row) => row.symbol === selected) ?? rows[0] ?? null;

  return (
    <section className="py-14 lg:py-16">
      <Page>
        <div data-guide="record-book" className="flex flex-col justify-between gap-5 border-b border-line-2 pb-5 lg:flex-row lg:items-end">
          <div>
            <Eyebrow>The Record Book</Eyebrow>
            <Display size="md" className="mt-2">
              One ledger for every official <span className="italic">Stock Token.</span>
            </Display>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              <p className="text-[15px] text-ink-2">Official Stock Tokens only. Read live from the contracts on</p>
              <ChainLogo height={16} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-grey-green" />
              <Input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search" className="h-9 w-[170px] pl-8 text-[13.5px]" />
            </div>
            <Select value={sort} onChange={(event) => setSort(event.target.value as Sort)} aria-label="Sort">
              <option value="value">Sort · USD value</option>
              <option value="shareEq">Sort · Share-equivalent</option>
              <option value="queue">Sort · Queue</option>
              <option value="action">Sort · Last action</option>
              <option value="symbol">Sort · Ticker</option>
            </Select>
            <Link to="/record" className="inline-flex h-9 items-center gap-1.5 rounded-[8px] bg-ink px-3.5 text-[13.5px] font-medium text-paper">
              Full Record Book <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </div>

        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0">
            {book.isLoading ? (
              <div className="mt-4 space-y-px">
                {Array.from({ length: 8 }).map((_, index) => (
                  <Skeleton key={index} className="h-16" />
                ))}
              </div>
            ) : (
              <>
                <div className="hidden md:block">
                  <RecordTable rows={rows} selected={current?.symbol ?? null} onSelect={setSelected} wallet={Boolean(wallet.address)} animate />
                </div>
                <div className="md:hidden">
                  {rows.map((row) => (
                    <SecurityRow
                      key={row.symbol}
                      leading={<AssetLogo symbol={row.symbol} logo={row.logo} size="sm" />}
                      title={row.symbol}
                      subtitle={row.name}
                      primary={`${shares(row.shareEquivalent)} sh-eq`}
                      secondary={row.valueUsd === null ? "no feed" : usd(row.valueUsd, { compact: true })}
                      onClick={() => {
                        setSelected(row.symbol);
                        setSheet(true);
                      }}
                    />
                  ))}
                </div>
              </>
            )}
            <div className="mt-3 text-[13px] text-grey-green">
              Top {rows.length} of {book.data?.totals.tokens ?? 194} securities · updated {ageLabel(book.data?.dataAgeMs)}
            </div>
          </div>
          <aside className="hidden lg:block">
            <div className="sticky top-[76px] border-l border-line-2 pl-8">
              <div className="eyebrow mb-4">Inspector</div>
              {current ? <RecordInspector row={current} /> : <Skeleton className="h-64" />}
            </div>
          </aside>
        </div>
        <Sheet open={sheet} onClose={() => setSheet(false)} title="Record inspector">
          {current ? <RecordInspector row={current} onClose={() => setSheet(false)} /> : null}
        </Sheet>
      </Page>
    </section>
  );
}

/* ----------------------------------------------------- corporate actions */

function CorporateActions() {
  const actions = useCorporateActions();
  const rows = actions.data?.actions ?? [];
  const lead = rows[0];
  return (
    <section className="env-mint py-14 lg:py-16">
      <Page>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center">
          <div>
            <Eyebrow>Corporate actions</Eyebrow>
            <Display size="md" className="mt-3">
              The balance did not change. <span className="italic">The ratio did.</span>
            </Display>
            <p className="mt-4 max-w-[46ch] text-[15.5px] leading-relaxed text-ink-2">
              A dividend or split reaches a Stock Token as a UIMultiplierUpdated event. The ERC-20 balance never rebases; its share-equivalent moves. Every event is mirrored with the previous ratio, the new ratio and the moment it took effect.
            </p>
          </div>
          <div className="relative hidden lg:block">
            <MultiplierPlates className="mx-auto max-w-[520px]" />
          </div>
          <div>
            {actions.isLoading ? (
              <Skeleton className="h-64" />
            ) : !lead ? (
              <p className="text-[14px] text-grey-green">No multiplier events have been mirrored yet.</p>
            ) : (
              <>
                <div className="border-t border-line-2 pt-5">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[20px] font-medium text-ink">{lead.symbol}</span>
                    <span className="font-mono text-[12.5px] text-grey-green">UIMultiplierUpdated</span>
                  </div>
                  <dl className="mt-5 grid grid-cols-3 gap-4">
                    <div>
                      <dd className="font-mono text-[24px] leading-none text-grey-green">{wad(lead.oldMultiplier, 4)}×</dd>
                      <dt className="eyebrow mt-2">Previous</dt>
                    </div>
                    <div>
                      <dd className="font-mono text-[24px] leading-none text-ink">{wad(lead.newMultiplier, 4)}×</dd>
                      <dt className="eyebrow mt-2">Current</dt>
                    </div>
                    <div>
                      <dd className="font-mono text-[24px] leading-none text-ink">{shortDate(lead.effectiveAt)}</dd>
                      <dt className="eyebrow mt-2">Effective</dt>
                    </div>
                  </dl>
                  <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-4">
                    <div>
                      <dd className="font-mono text-[15px] text-ink">Unchanged</dd>
                      <dt className="eyebrow mt-1">Token balance</dt>
                    </div>
                    <div>
                      <dd className="font-mono text-[15px] text-emerald">Updated</dd>
                      <dt className="eyebrow mt-1">Share-equivalent</dt>
                    </div>
                  </dl>
                </div>
                <ol className="mt-6 border-t border-line-2">
                  {rows.slice(1, 6).map((action) => (
                    <li key={`${action.txHash}:${action.logIndex}`} className="flex items-baseline justify-between gap-4 border-b border-line py-2.5 text-[14px]">
                      <Link to={`/record/${action.symbol}`} className="w-16 font-medium text-ink hover:text-emerald">
                        {action.symbol}
                      </Link>
                      <span className="font-mono flex-1 text-grey-green">
                        {wad(action.oldMultiplier, 4)}× → <span className="text-ink">{wad(action.newMultiplier, 4)}×</span>
                      </span>
                      <span className="font-mono text-[13px] text-grey-green">{shortDate(action.effectiveAt)}</span>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </div>
        </div>
      </Page>
    </section>
  );
}

/* ---------------------------------------------------------------- others */

function Calculation() {
  return (
    <section className="py-14 lg:py-16">
      <Page>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] lg:items-start">
          <div>
            <Eyebrow>How the number is made</Eyebrow>
            <Display size="md" className="mt-3">
              One multiplication, <span className="italic">shown every time.</span>
            </Display>
            <p className="mt-4 max-w-[40ch] text-[15.5px] leading-relaxed text-ink-2">Correct share-equivalent accounting is the whole point. The arithmetic is never hidden behind a balance.</p>
          </div>
          <ShareEqCalculator />
        </div>
      </Page>
    </section>
  );
}

function Sequence() {
  return (
    <section className="border-t border-line-2 py-14 lg:py-16">
      <Page>
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <Eyebrow>How it works</Eyebrow>
            <Display size="md" className="mt-3">
              Four steps. Each one <span className="italic">checkable.</span>
            </Display>
          </div>
          <Link to="/how-it-works" className="inline-flex items-center gap-1 text-[14px] font-medium text-emerald hover:underline">
            The mechanism in full <ArrowUpRight className="size-4" />
          </Link>
        </div>
        <ol className="relative mt-10 grid gap-10 md:grid-cols-4 md:gap-6">
          <div aria-hidden className="absolute top-[7px] right-0 left-0 hidden h-px bg-line-2 md:block" />
          {SEQUENCE.map((step) => (
            <li key={step.n} className="relative">
              <div className="flex items-center gap-3">
                <span className="relative z-10 size-[15px] rounded-full border-2 border-emerald bg-paper" />
                <span className="font-mono text-[12px] text-emerald">{step.n}</span>
              </div>
              <h3 className="font-serif mt-4 text-[28px] leading-none text-ink">{step.title}</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{step.body}</p>
              <div className="font-mono mt-3 text-[12.5px] text-grey-green">{step.code}</div>
            </li>
          ))}
        </ol>
      </Page>
    </section>
  );
}

function Precedent() {
  return (
    <PhotoBand photo={PHOTOS.nyse} tone="paper" minHeight={560} className="border-t border-line-2">
      <Page className="pt-24 pb-14 lg:pt-40 lg:pb-16">
        <div className="max-w-[560px]">
          <Eyebrow>The precedent</Eyebrow>
          <Display size="md" className="mt-3">
            Street name was a <span className="italic">record layer too.</span>
          </Display>
          <p className="mt-5 max-w-[52ch] text-[15.5px] leading-relaxed text-ink-2">Most US retail shares are held in street name: the broker is the holder of record, passes each ballot down, and votes the registered shares to match. Redeem keeps that kind of record for tokenized holders, ahead of the rail.</p>
          <Link to="/how-it-works#precedent" className="mt-6 inline-flex items-center gap-1 text-[14px] font-medium text-emerald hover:underline">
            How the precedent maps <ArrowUpRight className="size-4" />
          </Link>
        </div>
      </Page>
    </PhotoBand>
  );
}

function Chamber() {
  const stats = useHomeStats();
  return (
    <section className="chamber relative overflow-hidden">
      <Page className="relative">
        <div className="grid gap-12 py-16 lg:grid-cols-[minmax(0,0.42fr)_minmax(0,0.58fr)] lg:items-center lg:py-24">
          <div>
            <div className="eyebrow">Beneficial ownership</div>
            <h2 className="display mt-3 text-[38px] text-[#e9ede7] sm:text-[48px] lg:text-[56px]">
              Every position has a path <span className="italic text-[#8fd3b0]">back to a holder.</span>
            </h2>
            <p className="mt-5 max-w-[46ch] text-[15.5px] leading-relaxed text-[#b5c4ba]">A share-equivalent can sit in a wallet, a vault or a lending position. The record resolves each path, pro rata, back to the holder it belongs to.</p>
            <dl className="mt-8 flex flex-wrap gap-x-12 gap-y-4">
              <div>
                <dd className="font-mono text-[20px] text-[#e9ede7]">{stats.data?.shareEquivalentRecorded ? `${shares(stats.data.shareEquivalentRecorded)} sh-eq` : "reading"}</dd>
                <dt className="mt-1 text-[12.5px] text-[#8fb3a0]">Direct wallets · indexed</dt>
              </div>
              <div>
                <dd className="font-mono text-[20px] text-[#e9ede7]">{stats.data?.pooled ? `${shares(stats.data.pooled.shareEq)} sh-eq` : "reading"}</dd>
                <dt className="mt-1 text-[12.5px] text-[#8fb3a0]">{stats.data?.pooled ? `In ${stats.data.pooled.venues} liquidity pools · looked through` : "Liquidity pools"}</dt>
              </div>
              <div>
                <dd className="font-mono text-[20px] text-[#7f998c]">Not indexed yet</dd>
                <dt className="mt-1 text-[12.5px] text-[#8fb3a0]">Vaults · lending · nested</dt>
              </div>
            </dl>
            <div className="mt-8">
              <ChainLine caption="Read from" dark />
            </div>
          </div>
          <div className="relative">
            <div aria-hidden className="pointer-events-none absolute -inset-10 rounded-full bg-[radial-gradient(60%_60%_at_50%_50%,rgba(31,107,74,0.22),transparent_70%)]" />
            <div className="relative border-t border-[#1f2c25] pt-6">
              <OwnershipDiagram />
            </div>
          </div>
        </div>
      </Page>
    </section>
  );
}

function Trust() {
  return (
    <section className="py-14 lg:py-16">
      <Page>
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <Eyebrow>Plainly stated</Eyebrow>
            <Display size="md" className="mt-3">
              Accuracy is the <span className="italic">brand.</span>
            </Display>
          </div>
          <div className="max-w-[48ch] text-[14px] text-grey-green">
            <PostRef />
            <p className="mt-2">Redeem is independent and is not affiliated with or endorsed by Robinhood.</p>
          </div>
        </div>
        <div className="mt-8 grid gap-x-10 border-t border-line-2 sm:grid-cols-2 lg:grid-cols-3">
          {TRUST.map(([title, body]) => (
            <div key={title} className="border-b border-line py-6">
              <Mark tone="emerald">{title}</Mark>
              <p className="mt-2 text-[15.5px] text-ink">{body}</p>
            </div>
          ))}
        </div>
      </Page>
    </section>
  );
}

function Closing() {
  const stats = useHomeStats();
  return (
    <section className="relative overflow-hidden border-t border-line-2">
      <div aria-hidden className="emboss font-serif pointer-events-none absolute right-0 -bottom-4 hidden text-[12vw] leading-none whitespace-nowrap opacity-60 select-none lg:block">
        {String(stats.data?.stocks ?? 194).padStart(6, "0")}
      </div>
      <Page className="relative">
        <div className="grid gap-8 py-16 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:py-20">
          <div>
            <Display size="xl" className="mt-4">
              Record today.
              <br />
              <span className="italic">Ready for what comes next.</span>
            </Display>
            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2">
              <ChainLine caption="Built on" />
              <PostRef />
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <TokenCA full />
              <Link to="/token" className="text-[13px] text-grey-green hover:text-ink">
                About the token
              </Link>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/record">Open Record Book</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/portfolio">Connect a wallet</Link>
            </Button>
          </div>
        </div>
      </Page>
    </section>
  );
}

export default function HomePage() {
  return (
    <>
      <Hero />
      <LatestRecords />
      <ThePost />
      <RecordBookPanel />
      <Desk />
      <CorporateActions />
      <Calculation />
      <Sequence />
      <Precedent />
      <Chamber />
      <Trust />
      <Closing />
    </>
  );
}
