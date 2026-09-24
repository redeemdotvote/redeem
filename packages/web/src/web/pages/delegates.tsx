import { ArrowUpRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { AssetLogo } from "../components/brand";
import { Page, PageHead } from "../components/layout";
import { ChainLine } from "../components/robinhood-chain";
import { Button, Eyebrow, FieldLabel, Input, Mark, Note, Skeleton, Spinner, Textarea } from "../components/ui";
import { useWallet } from "../hooks/use-wallet";
import { shares, shortAddress, usd } from "../lib/format";
import { useDelegate, useDelegates, useRegisterDelegate } from "../queries/delegates";

/**
 * Delegates. Holders can name an address on a delegate intent; this page ranks those addresses
 * by the weight named to them and lets any wallet put a name and a statement on its own address.
 * Weight moves with receipts and is never money. A delegate intent confers no proxy authority
 * and may not be bought, sold or compensated; Redeem carries no way to do so.
 */
export default function DelegatesPage() {
  const list = useDelegates();
  const d = list.data;
  return (
    <Page>
      <PageHead
        eyebrow={<span className="inline-flex flex-wrap items-center gap-4">Delegates <ChainLine caption={null} /></span>}
        title={
          <>
            Carry more weight than you <span className="italic">hold.</span>
          </>
        }
        body="A holder who signs a delegate intent names an address to carry it. Put a name on your address, say what you would do with the weight, and holders can name you on the items they hold. Weight named to you is counted from receipts on every read and moves when they do. It is never money."
        aside={
          d ? (
            <div className="grid grid-cols-3 gap-x-10">
              <div>
                <div className="eyebrow">Registered</div>
                <div className="font-mono mt-1 text-[26px] text-ink">{d.registered}</div>
              </div>
              <div>
                <div className="eyebrow">Addresses named</div>
                <div className="font-mono mt-1 text-[26px] text-ink">{d.named}</div>
              </div>
              <div>
                <div className="eyebrow">Weight named</div>
                <div className="font-mono mt-1 text-[26px] text-ink">{d.valueUsd ? usd(d.valueUsd, { compact: true }) : "$0"}</div>
              </div>
            </div>
          ) : null
        }
      />

      <div className="grid gap-x-12 gap-y-12 border-t border-line-2 pt-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <section>
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="font-serif text-[26px] text-ink">Weight controlled</h2>
              <p className="mt-1 text-[13px] text-grey-green">Per ticker, the largest single-item sum of counted weight naming the address; priced where a Chainlink feed exists.</p>
            </div>
            <Mark tone="muted">Weight · never money</Mark>
          </div>
          {!d ? (
            <Skeleton className="mt-6 h-48" />
          ) : d.rows.length === 0 ? (
            <p className="mt-6 text-[14px] text-grey-green">No address has been named on a delegate intent yet, and nobody has registered. Be the first on either side.</p>
          ) : (
            <ol className="mt-4 border-t border-line-2">
              {d.rows.map((row, index) => (
                <li key={row.wallet}>
                  <Link to={`/delegates/${row.wallet}`} className="grid gap-2 border-b border-line py-3.5 transition-colors hover:bg-cream sm:grid-cols-[32px_minmax(0,1fr)_180px] sm:items-center">
                    <span className="font-mono text-[13px] text-grey-green">{index + 1}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] text-ink">
                        {row.profile ? row.profile.name : <span className="font-mono">{shortAddress(row.wallet, 5)}</span>}
                        {row.profile ? <span className="font-mono ml-2 text-[11.5px] text-grey-green">{shortAddress(row.wallet, 4)}</span> : <span className="ml-2 text-[11.5px] text-grey-green">unregistered</span>}
                      </span>
                      <span className="mt-0.5 block truncate text-[12.5px] text-grey-green">
                        {row.profile ? row.profile.statement : "Named on a delegate intent; no profile yet."}
                      </span>
                    </span>
                    <span className="font-mono text-[12.5px] text-ink sm:text-right">
                      {row.valueUsd !== null && row.valueUsd > 0 ? usd(row.valueUsd, { compact: true }) : `${shares(row.shareEq)} sh-eq`}
                      <span className="block text-[11.5px] text-grey-green">
                        {row.backers} {row.backers === 1 ? "backer" : "backers"} · {row.tickers.length} {row.tickers.length === 1 ? "ticker" : "tickers"}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </section>

        <aside className="space-y-8">
          <RegisterCard />
          <section className="text-[13px] leading-relaxed text-grey-green">
            <Eyebrow>What a delegate is</Eyebrow>
            <ul className="mt-3 space-y-2">
              <li>A named address holders can put on a delegate intent. The intent records that the holder would want that address to instruct on their behalf.</li>
              <li>Weight named to a delegate is a number derived from receipts. It is not a proxy, not a vote, and nothing is transferred.</li>
              <li>Delegation may not be paid for. There is no way on Redeem to buy, sell or compensate a delegate intent, and offering to do so off Redeem is the holder's own risk under securities law.</li>
              <li>REDEEM has no role. Holding it changes nothing about weight, ranking or eligibility.</li>
            </ul>
          </section>
        </aside>
      </div>
    </Page>
  );
}

/** Register or update your own profile. Signs a plain message that says what a profile is and is not. */
function RegisterCard() {
  const wallet = useWallet();
  const existing = useDelegate(wallet.address);
  const register = useRegisterDelegate();
  const [name, setName] = useState("");
  const [statement, setStatement] = useState("");
  const [link, setLink] = useState("");
  useEffect(() => {
    const profile = existing.data?.profile;
    if (profile) {
      setName(profile.name);
      setStatement(profile.statement);
      setLink(profile.link ?? "");
    }
  }, [existing.data?.profile?.updatedAt]);
  const ready = /^[A-Za-z0-9][A-Za-z0-9 ._-]{1,31}$/.test(name) && statement.trim().length >= 20 && statement.trim().length <= 600 && (!link || /^https:\/\//.test(link));
  return (
    <section className="surface-plain rounded-[16px] p-6">
      <div className="flex items-center justify-between">
        <Eyebrow>{existing.data?.profile ? "Your delegate profile" : "Register as a delegate"}</Eyebrow>
        {existing.data?.rank ? <Mark tone="emerald">#{existing.data.rank} by weight</Mark> : null}
      </div>
      {!wallet.address ? (
        <>
          <p className="mt-3 text-[14px] text-ink-2">Connect the address holders should name. Registering signs one message; it costs nothing and sends no transaction.</p>
          <Button className="mt-4 w-full" onClick={wallet.connect} disabled={wallet.isConnecting}>
            {wallet.isConnecting ? <Spinner className="size-3.5" /> : null} Connect wallet
          </Button>
        </>
      ) : (
        <div className="mt-4 space-y-3">
          <div>
            <FieldLabel>Name</FieldLabel>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="A name holders will recognise" maxLength={32} />
          </div>
          <div>
            <FieldLabel>Statement</FieldLabel>
            <Textarea value={statement} onChange={(e) => setStatement(e.target.value)} placeholder="What you would do with weight named to you: which tickers, which kinds of items, where you stand on pay, boards, splits." rows={4} maxLength={600} />
            <div className="font-mono mt-1 text-right text-[11px] text-grey-green">{statement.trim().length}/600</div>
          </div>
          <div>
            <FieldLabel>Link (optional, https)</FieldLabel>
            <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" className="font-mono text-[13px]" />
          </div>
          <Button className="w-full" variant="emerald" disabled={!ready || register.isPending} onClick={() => wallet.address && register.mutate({ wallet: wallet.address, name: name.trim(), statement: statement.trim(), link })}>
            {register.isPending ? <Spinner className="size-3.5" /> : null}
            {existing.data?.profile ? "Update profile · sign" : "Register · sign"}
          </Button>
          {register.isError ? <Note tone="danger">{register.error instanceof Error ? register.error.message : "Could not register."}</Note> : null}
          {register.isSuccess ? (
            <Note tone="emerald">
              Registered.{" "}
              <Link to={`/delegates/${wallet.address.toLowerCase()}`} className="inline-flex items-center gap-1 text-emerald hover:underline">
                Your page <ArrowUpRight className="size-3" />
              </Link>
            </Note>
          ) : null}
          <p className="text-[11.5px] leading-relaxed text-grey-green">The message you sign states that a profile confers no proxy authority, carries no vote, and may not be bought, sold or compensated. Names that imply an affiliation with Robinhood or Redeem are refused.</p>
        </div>
      )}
      {existing.data?.standing ? (
        <div className="mt-5 border-t border-line pt-3">
          <div className="eyebrow">Named to you</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {existing.data.standing.perSymbol.map((row) => (
              <span key={row.symbol} className="font-mono inline-flex items-center gap-1.5 rounded-[8px] border border-line-2 px-2 py-1 text-[11.5px] text-ink">
                <AssetLogo symbol={row.symbol} logo={row.logo} size="xs" /> {row.symbol} {shares(row.shareEq)}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
