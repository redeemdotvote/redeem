import { ArrowLeft, ArrowUpRight, Check, ExternalLink } from "lucide-react";
import { useMemo, useState } from "react";
import { isAddress } from "viem";
import { Link, useParams } from "wouter";
import { cn } from "@/lib/utils";
import { AssetLogo } from "../components/brand";
import { Page } from "../components/layout";
import { ChainLine } from "../components/robinhood-chain";
import { Button, Display, Eyebrow, Mark, Note, Skeleton, Spinner } from "../components/ui";
import { useWallet } from "../hooks/use-wallet";
import { closesIn, shares, shortAddress, usd } from "../lib/format";
import { useDelegate } from "../queries/delegates";
import { useSignIntent } from "../queries/intents";
import { usePortfolio } from "../queries/portfolio";

/**
 * /delegates/:address — one delegate's page: who they are, what weight is named to them and by
 * whom, and a one-pass way for a visiting holder to name them on every open item they hold.
 */
export default function DelegatePage() {
  const params = useParams<{ address: string }>();
  const address = (params.address ?? "").toLowerCase();
  const valid = isAddress(address);
  const query = useDelegate(valid ? address : undefined);
  const d = query.data;
  if (!valid) {
    return (
      <Page narrow>
        <div className="py-20">
          <h1 className="display text-[36px] text-ink">That is not a wallet address.</h1>
        </div>
      </Page>
    );
  }
  return (
    <Page>
      <div className="flex flex-wrap items-center gap-2 pt-8 text-[13px] text-grey-green">
        <Link to="/delegates" className="inline-flex items-center gap-1 hover:text-ink">
          <ArrowLeft className="size-3.5" /> Delegates
        </Link>
        <span>/</span>
        <span className="font-mono text-ink">{shortAddress(address, 6)}</span>
      </div>
      {!d ? (
        <Skeleton className="mt-10 h-64" />
      ) : (
        <>
          <header className="grid gap-10 border-b border-line-2 pt-10 pb-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:items-end">
            <div className="rise">
              <div className="flex flex-wrap items-center gap-3">
                <Eyebrow>Delegate</Eyebrow>
                {d.rank ? <Mark tone="emerald">#{d.rank} of {d.of} by weight named</Mark> : <Mark tone="muted">No weight named yet</Mark>}
                <ChainLine caption={null} />
              </div>
              <Display as="h1" size="md" className="mt-5">
                {d.profile ? d.profile.name : shortAddress(address, 6)}
              </Display>
              <p className="mt-4 max-w-[60ch] text-[16px] leading-relaxed text-ink-2">{d.profile ? d.profile.statement : d.standing ? "This address has been named on delegate intents but has not registered a profile. If it is yours, register on the delegates page and this space is yours to fill." : "No profile and no weight named to this address yet. If it is yours, register on the delegates page; holders can then name it on any open item."}</p>
              <div className="mt-4 flex flex-wrap items-center gap-4 text-[13px]">
                <Link to={`/w/${address}`} className="font-mono text-grey-green hover:text-ink">
                  {address}
                </Link>
                {d.profile?.link ? (
                  <a href={d.profile.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-emerald hover:underline">
                    {new URL(d.profile.link).hostname} <ExternalLink className="size-3" />
                  </a>
                ) : null}
              </div>
            </div>
            <dl className="grid grid-cols-3 gap-x-6 lg:justify-items-end lg:text-right">
              <div>
                <dd className="font-mono text-[26px] text-ink">{d.standing?.valueUsd ? usd(d.standing.valueUsd, { compact: true }) : shares(d.standing?.shareEq ?? 0)}</dd>
                <dt className="eyebrow mt-1.5">{d.standing?.valueUsd ? "Weight named" : "Share-eq named"}</dt>
              </div>
              <div>
                <dd className="font-mono text-[26px] text-ink">{d.standing?.backers ?? 0}</dd>
                <dt className="eyebrow mt-1.5">Backers</dt>
              </div>
              <div>
                <dd className="font-mono text-[26px] text-ink">{d.standing?.items ?? 0}</dd>
                <dt className="eyebrow mt-1.5">Items named on</dt>
              </div>
            </dl>
          </header>

          <div className="grid gap-x-16 gap-y-12 pt-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <div className="space-y-12">
              <section>
                <Eyebrow>Weight by ticker</Eyebrow>
                {d.standing && d.standing.perSymbol.length > 0 ? (
                  <ol className="mt-3 border-t border-line-2">
                    {d.standing.perSymbol.map((row) => (
                      <li key={row.symbol} className="flex items-center justify-between gap-3 border-b border-line py-3">
                        <span className="flex items-center gap-3">
                          <AssetLogo symbol={row.symbol} logo={row.logo} size="sm" />
                          <Link to={`/record/${row.symbol}`} className="text-[14.5px] text-ink hover:underline">
                            {row.symbol}
                          </Link>
                          {row.open ? <Mark tone="live">Open</Mark> : null}
                        </span>
                        <span className="font-mono text-right text-[13px] text-ink">
                          {shares(row.shareEq)} sh-eq{row.valueUsd ? ` · ${usd(row.valueUsd, { compact: true })}` : ""}
                          <span className="block text-[11.5px] text-grey-green">
                            {row.backers} {row.backers === 1 ? "backer" : "backers"} · {row.items} {row.items === 1 ? "item" : "items"}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="mt-3 text-[14px] text-grey-green">No holder has named this address yet.</p>
                )}
              </section>

              {d.namedOn.length > 0 ? (
                <section>
                  <Eyebrow>Named on</Eyebrow>
                  <ol className="mt-3 border-t border-line-2">
                    {d.namedOn.map((item) => (
                      <li key={item.id}>
                        <Link to={`/intents/${item.id}`} className="grid gap-1 border-b border-line py-3 hover:bg-cream sm:grid-cols-[minmax(0,1fr)_160px] sm:items-center">
                          <span className="min-w-0 truncate text-[14px] text-ink">
                            <span className="font-mono mr-2 text-[12px] text-grey-green">{item.symbol} {item.index}</span>
                            {item.title}
                          </span>
                          <span className="font-mono text-[12.5px] text-grey-green sm:text-right">
                            {shares(item.shareEq)} sh-eq · {item.backers} {item.backers === 1 ? "wallet" : "wallets"}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ol>
                </section>
              ) : null}

              {d.backers.length > 0 ? (
                <section>
                  <Eyebrow>Backers</Eyebrow>
                  <ol className="mt-3 border-t border-line-2">
                    {d.backers.map((backer) => (
                      <li key={backer.wallet} className="flex items-center justify-between gap-3 border-b border-line py-2.5 text-[13px]">
                        <Link to={`/w/${backer.wallet}`} className="font-mono text-ink hover:underline">
                          {shortAddress(backer.wallet, 5)}
                        </Link>
                        <span className="font-mono text-grey-green">
                          {backer.symbols.join(", ")} · {shares(backer.shareEq)} sh-eq
                        </span>
                      </li>
                    ))}
                  </ol>
                </section>
              ) : null}
            </div>

            <aside className="space-y-8">
              <BackCard delegate={address} name={d.profile?.name ?? shortAddress(address, 5)} openItems={d.openItems} />
              <Mark tone="muted">Weight, never money · no proxy authority · not a vote</Mark>
            </aside>
          </div>
        </>
      )}
    </Page>
  );
}

/** Name this delegate on every open item the visitor holds, one signature per item. */
function BackCard({ delegate, name, openItems }: { delegate: string; name: string; openItems: Array<{ id: string; symbol: string; logo: string | null; index: string; title: string; closesAt: number; companyName: string }> }) {
  const wallet = useWallet();
  const portfolio = usePortfolio(wallet.address);
  const sign = useSignIntent();
  const [done, setDone] = useState<Record<string, "ok" | "error">>({});
  const [running, setRunning] = useState(false);
  const heldSymbols = useMemo(() => new Set((portfolio.data?.held ?? []).map((row) => row.symbol)), [portfolio.data]);
  const mine = openItems.filter((item) => heldSymbols.has(item.symbol));
  const self = wallet.address?.toLowerCase() === delegate;

  async function backAll() {
    if (!wallet.address) return;
    setRunning(true);
    for (const item of mine) {
      if (done[item.id] === "ok") continue;
      try {
        await sign.mutateAsync({ wallet: wallet.address, itemId: item.id, choice: "delegate", delegate });
        setDone((prev) => ({ ...prev, [item.id]: "ok" }));
      } catch {
        setDone((prev) => ({ ...prev, [item.id]: "error" }));
        break;
      }
    }
    setRunning(false);
  }

  return (
    <section className="surface-plain rounded-[16px] p-6">
      <Eyebrow>Name {name}</Eyebrow>
      <p className="mt-3 text-[14px] leading-relaxed text-ink-2">Sign a delegate intent naming this address on each open item you hold. Your weight is read from Robinhood Chain at signing; nothing moves and nothing is paid.</p>
      {!wallet.address ? (
        <Button className="mt-4 w-full" onClick={wallet.connect} disabled={wallet.isConnecting}>
          {wallet.isConnecting ? <Spinner className="size-3.5" /> : null} Connect wallet
        </Button>
      ) : self ? (
        <Note className="mt-4">This is your own address. Holders name you from here; you cannot name yourself.</Note>
      ) : !portfolio.data ? (
        <Skeleton className="mt-4 h-16" />
      ) : mine.length === 0 ? (
        <Note className="mt-4">
          {openItems.length === 0 ? "No item is open for intent right now." : `You hold none of the ${new Set(openItems.map((item) => item.symbol)).size} tickers with open items.`}{" "}
          <Link to="/intents?status=active" className="text-emerald hover:underline">
            Open items
          </Link>
          .
        </Note>
      ) : (
        <>
          <ol className="mt-4 border-t border-line">
            {mine.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 border-b border-line py-2.5 text-[13px]">
                <Link to={`/intents/${item.id}?delegate=${delegate}`} className="flex min-w-0 items-center gap-2 text-ink hover:underline">
                  <AssetLogo symbol={item.symbol} logo={item.logo} size="xs" />
                  <span className="truncate">
                    <span className="font-mono mr-1.5 text-[11.5px] text-grey-green">{item.symbol} {item.index}</span>
                    {item.title}
                  </span>
                </Link>
                <span className={cn("font-mono shrink-0 text-[11.5px]", done[item.id] === "ok" ? "text-emerald" : done[item.id] === "error" ? "text-rust" : "text-grey-green")}>{done[item.id] === "ok" ? <Check className="size-3.5" /> : done[item.id] === "error" ? "failed" : closesIn(item.closesAt)}</span>
              </li>
            ))}
          </ol>
          <Button className="mt-4 w-full" variant="emerald" disabled={running || mine.every((item) => done[item.id] === "ok")} onClick={backAll}>
            {running ? <Spinner className="size-3.5" /> : null}
            {mine.every((item) => done[item.id] === "ok") ? "Named on every item" : `Name ${name} on ${mine.length} ${mine.length === 1 ? "item" : "items"} · EIP-712`}
          </Button>
          {sign.isError ? <Note tone="danger" className="mt-3">{sign.error instanceof Error ? sign.error.message : "Signing failed."}</Note> : null}
          <p className="mt-3 text-[11.5px] leading-relaxed text-grey-green">
            One signature per item, in order. Each supersedes any earlier intent you signed on that item. To name this address on one item only, open it{" "}
            <Link to="/intents?status=active" className="inline-flex items-center gap-0.5 text-emerald hover:underline">
              from the list <ArrowUpRight className="size-3" />
            </Link>
            .
          </p>
        </>
      )}
    </section>
  );
}
