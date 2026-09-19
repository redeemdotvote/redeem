import { Link } from "wouter";
import { RecordCards } from "../components/record-cards";
import { ChainLine, PostRef } from "../components/robinhood-chain";
import { Faq } from "../components/faq";
import { Page, PageHead, SectionHead } from "../components/layout";
import { PHOTOS, PhotoBand } from "../components/photo";
import { Button, Display, Eyebrow, Mark } from "../components/ui";

const STEPS = [
  { n: "01", title: "Read the chain", body: "Official Stock Token contracts on Robinhood Chain are read through Multicall3: balanceOf, uiMultiplier, newUIMultiplier, effectiveAt, totalSupply and totalSupplyUI, plus every UIMultiplierUpdated event. Chainlink feeds supply a price where one is deployed. The public RPC is rate limited, so all of this happens server side, cached for seconds, never from the browser." },
  { n: "02", title: "Normalise the record", body: "Raw ERC-20 balances are turned into share-equivalents: balance × uiMultiplier ÷ 1e18. Stock Tokens do not rebase; a split or dividend arrives as a change in the multiplier. The arithmetic is checked against the contract's own balanceOfUI() on every read and shown on every row." },
  { n: "03", title: "Record intent", body: "For each matter on an issuer's proxy statement, a holder signs an EIP-712 statement of intent — for, against, abstain or delegate — weighted by the share-equivalent the wallet holds at that block. No deposit, no gas, no approval. The tally is public, attested with a Merkle root at cutoff, and labelled intent, never a shareholder vote." },
  { n: "04", title: "Prepare redemption", body: "Before in-kind redemption opens, a holder can place a signed, numbered request in a ticker-specific queue with the acknowledgements a window would need. It records demand and readiness. It does not promise settlement; the issuer decides eligibility." },
];

const NOT = [
  ["Not a proxy", "Redeem is not a proxy solicitation and carries no proxy authority. A recorded intent is a statement of how a holder would want a position voted, not a proxy card."],
  ["Not a shareholder vote", "Stock Tokens do not currently carry shareholder voting rights. Redeem records intent so the record exists when they do."],
  ["Not custody", "Redeem never holds, moves or approves tokens. It reads public chain state and stores signatures."],
  ["Not the issuer", "Stock Tokens are issued by Robinhood Assets (Jersey) Limited. Redeem is independent and not affiliated with Robinhood, Say or any issuer."],
  ["Not a redemption", "A queue request records demand and acknowledgements. Redemption availability, eligibility and settlement are the issuer's alone."],
  ["Not advice", "Nothing here is investment, legal or tax advice. The proxy statement is the authoritative description of every matter."],
  ["Not the token", "XP, record numbers, queue positions and the Season badge are derived from signed records on every read. They are not the REDEEM token, not spendable, not a vote and not a claim on the issuer. Holding REDEEM does not change any of them."],
];

const FAQ = [
  { q: "Is an intent a legal vote?", a: "No. Stock Tokens provide economic exposure and do not currently carry shareholder voting rights. An intent is a signed, weighted statement of what a holder would want. It is labelled that way on every tally, every receipt and every export." },
  { q: "Where do the items come from?", a: "From each issuer's proxy statement (DEF 14A) on SEC EDGAR. Every item links to the filing it was extracted from; where the two differ, the filing governs." },
  { q: "How is weight worked out?", a: "The server reads the wallet's token balance and the token's uiMultiplier from Robinhood Chain when the intent is signed, multiplies them, and pins the block. Those numbers are inside the signed payload." },
  { q: "What if I sell after signing?", a: "At cutoff the balance is read again and the smaller of the signed and held share-equivalent counts. Weight can fall; it never rises." },
  { q: "Why is my share-equivalent different from my token balance?", a: "The multiplier. Share-equivalent = tokens × uiMultiplier ÷ 1e18. Splits and dividends move the multiplier, never the token balance." },
  { q: "Does Redeem custody tokens or need an approval?", a: "No. Only read calls and signatures. There is no allowance to grant and nothing to revoke." },
  { q: "Why does Redeem read at signing rather than at the record date?", a: "The public Robinhood Chain RPC keeps no historical state. Positions are read live and re-checked at cutoff; every receipt says which block. Historical reads are on the roadmap if an archive source becomes available." },
  { q: "Is redemption available?", a: "No. In-kind redemption is on the issuer's roadmap. The readiness queue records demand and acknowledgements per ticker so the file is complete before any window opens." },
  { q: "What does attestation prove?", a: "That the tally published at cutoff is the tally of exactly these receipts, in this order, with these weights, unchanged since. Each receipt carries its Merkle proof. Writing roots to a contract on Robinhood Chain is planned; today they are published here and in the API." },
  { q: "Does Robinhood endorse this?", a: "No. Redeem is independent infrastructure with no affiliation to Robinhood Markets, Inc., Robinhood Assets (Jersey) Limited, Say, or any issuer." },
  { q: "Is there a Redeem token?", a: "Yes. REDEEM is the project's official token on Robinhood Chain, contract 0x3473cCcfD7c186aae98CbebBf8388251237D3896, a standard ERC-20 with a fixed supply of 1,000,000,000. That is the only official address; check it character for character. The token has no role in the record: intent weight is the share-equivalent of the Stock Token a wallet holds, and REDEEM does not change tallies, queue positions, record numbers or XP. It is not a Stock Token, not a claim on shares, not affiliated with Robinhood, and nothing here is investment advice." },
  { q: "What is a record number, and what is Season 0?", a: "The first signature a wallet makes for a ticker gives it that ticker's next record number; the first signature it makes at all gives it its Redeem wallet number. Season 0 is everything recorded before the issuer's first in-kind window. Both are derived from the receipts on every read, never stored, and carry no rights, points or value. They exist so a holder can prove when they recorded." },
  { q: "What is XP, and can it be farmed?", a: "XP is a number derived from signed records: 25 for a wallet's first signature, 50 for the first intent on each ticker, 10 for each further intent, 40 for joining a ticker's redemption queue, 100 when a wallet you referred records with at least 1 share-equivalent, and 25 for arriving by referral. It is not the REDEEM token. It is recomputed on every read, never stored, never spendable, and never enters a tally or a queue position. Every rule needs a signature, and every signature needs a real position read from Robinhood Chain, so an empty wallet earns nothing. Referral credit needs the referred wallet's first record to carry at least 1 share-equivalent, so splitting dust across wallets is not worth the effort." },
  { q: "How do referrals work?", a: "Your referral link carries a short code. A wallet that arrives through it and then makes its first signature is bound to you at that moment, once, and only if it has no record yet and is not you. There is no cookie sync and nothing is sent on arrival; the code travels with the signature. A binding never changes and carries no rights." },
  { q: "Is the record card a certificate of ownership?", a: "No. It restates what the record page already shows for that wallet and ticker, with the intent-not-a-vote line printed on it. It is not a share certificate, not a claim on the issuer and not proof of anything the chain does not already show." },
];

export default function HowItWorksPage() {
  return (
    <>
      <Page>
        <PageHead
          eyebrow="How it works"
          size="xl"
          title={
            <>
              The economics pass through. <span className="italic">The record is built here.</span>
            </>
          }
          body="Robinhood Stock Tokens track real equities and pay out what the shares pay out. What they do not carry yet is shareholder-of-record status. Redeem builds the record layer for that gap: share-equivalents, holder intent and redemption readiness, kept in a form that is verifiable now and ready when rights arrive."
        />
      </Page>

      <section className="env-mint relative overflow-hidden py-20">
        <Page className="relative">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center">
            <div>
              <Eyebrow>In one line</Eyebrow>
              <p className="font-serif mt-3 text-[32px] leading-[1.1] text-ink sm:text-[40px]">A verifiable record of Stock Token share-equivalents, holder intent and redemption demand — before shareholder rights come onchain.</p>
            </div>
            <RecordCards front="record" className="mx-auto max-w-[520px]" />
          </div>
        </Page>
      </section>

      <Page>
        <SectionHead className="pt-20" eyebrow="The mechanism" title={<>Four steps, each one <span className="italic">checkable.</span></>} />
        <ol className="mt-12 border-t border-line-2">
          {STEPS.map((step) => (
            <li key={step.n} className="grid gap-4 border-b border-line-2 py-10 md:grid-cols-[120px_minmax(0,380px)_minmax(0,1fr)] md:gap-10">
              <div className="font-mono text-[13px] text-emerald">{step.n}</div>
              <h3 className="font-serif text-[32px] leading-none text-ink sm:text-[38px]">{step.title}</h3>
              <p className="max-w-[62ch] text-[15.5px] leading-relaxed text-ink-2">{step.body}</p>
            </li>
          ))}
        </ol>

        <section className="grid gap-10 pt-24 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div>
            <Eyebrow>Share-equivalent accounting</Eyebrow>
            <Display size="md" className="mt-4">
              The balance never rebases. <span className="italic">The ratio carries the action.</span>
            </Display>
          </div>
          <div>
            <pre className="font-mono overflow-x-auto rounded-[12px] border border-line bg-cream px-5 py-4 text-[13px] leading-relaxed text-ink-2">{`rawBalance        balanceOf(wallet)                // ERC-20, 18 decimals
uiMultiplier      uiMultiplier()                   // 1e18 = 1.000000×
shareEquivalent   rawBalance × uiMultiplier ÷ 1e18
valueUsd          rawBalance × chainlinkAnswer     // feed already multiplier-aware
check             shareEquivalent == balanceOfUI(wallet)`}</pre>
            <p className="mt-4 max-w-[60ch] text-[14.5px] leading-relaxed text-ink-2">The Chainlink answer for a Stock Token is already expressed per token after the multiplier, so it is never multiplied again. When the two arithmetic paths disagree the record shows both rather than picking one.</p>
          </div>
        </section>

      </Page>

      <PhotoBand photo={PHOTOS.lettering} tone="dark" minHeight={620} className="mt-24 scroll-mt-24" >
        <div id="precedent" />
        <Page className="pt-28 pb-14 lg:pt-44 lg:pb-16">
          <div className="max-w-[720px]">
            <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-2">
              <PostRef dark />
              <ChainLine caption="Read from" dark />
            </div>
            <div className="eyebrow">The precedent</div>
            <h2 className="display mt-3 text-[34px] text-[#e9ede7] sm:text-[44px] lg:text-[52px]">
              Street-name holders vote through <span className="italic text-[#8fd3b0]">someone else's record.</span>
            </h2>
          </div>
          <div className="mt-8 grid gap-8 text-[15.5px] leading-relaxed text-[#b5c4ba] md:grid-cols-2 lg:max-w-[1040px]">
            <p>Most retail shares in the United States are not registered in the buyer's name. They sit in street name: the broker, or its depository, is the shareholder of record. Those holders still vote — the record holder passes ballots down, collects instructions and votes the registered shares to match.</p>
            <p>Redeem keeps the same kind of record for tokenized holders, ahead of the rail: what each wallet holds as share-equivalents, what it would want, and what it would redeem. The shape is not new. The holders it serves are.</p>
          </div>
        </Page>
      </PhotoBand>

      <Page>

        <section id="plainly" className="scroll-mt-24 pt-24">
          <SectionHead eyebrow="Plainly stated" title={<>What Redeem <span className="italic">is not.</span></>} />
          <div className="mt-10 grid gap-x-12 gap-y-8 border-t border-line-2 pt-10 sm:grid-cols-2 lg:grid-cols-3">
            {NOT.map(([title, body]) => (
              <div key={title}>
                <Mark tone="emerald">{title}</Mark>
                <p className="mt-3 max-w-[40ch] text-[14.5px] leading-relaxed text-ink-2">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="faq" className="scroll-mt-24 pt-24">
          <SectionHead eyebrow="Questions" title="Frequently asked" />
          <Faq items={FAQ} className="mt-10" />
        </section>

        <div className="mt-16 flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link to="/record">Open Record Book</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/developers">Read the API</Link>
          </Button>
        </div>
      </Page>
    </>
  );
}
