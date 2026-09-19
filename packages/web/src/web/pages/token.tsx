import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Page, PageHead } from "../components/layout";
import { ChainLine } from "../components/robinhood-chain";
import { TokenCA } from "../components/token-ca";
import { Def, Eyebrow, Mark } from "../components/ui";
import { REDEEM_TOKEN, tokenExplorerUrl } from "../lib/token";

/** /token — the official REDEEM token: the address, what the chain says about it, and what it does not do. */
export default function TokenPage() {
  const live = useQuery({
    queryKey: ["redeem-token"],
    queryFn: async () => (await fetch("/api/v1/token")).json() as Promise<{ name: string | null; symbol: string | null; decimals: number | null; totalSupply: string | null; block: string | null; verified: boolean }>,
    staleTime: 60_000,
  });
  const supply = live.data?.totalSupply ? Number(BigInt(live.data.totalSupply) / 10n ** BigInt(live.data.decimals ?? 18)) : REDEEM_TOKEN.totalSupply;
  return (
    <Page narrow>
      <PageHead
        eyebrow={<span className="inline-flex flex-wrap items-center gap-4">The official token <ChainLine caption={null} /></span>}
        title={
          <>
            $REDEEM, on <span className="italic">Robinhood Chain.</span>
          </>
        }
        body="One contract address, published here and nowhere else first. If an address does not match this one character for character, it is not ours."
      />
      <div className="border-t border-line-2 pt-8">
        <TokenCA full className="w-full justify-between sm:w-auto" />
        <dl className="mt-8 max-w-[680px]">
          <Def term="Name">{live.data?.name ?? REDEEM_TOKEN.name}</Def>
          <Def term="Symbol">{live.data?.symbol ?? REDEEM_TOKEN.symbol}</Def>
          <Def term="Decimals">{live.data?.decimals ?? REDEEM_TOKEN.decimals}</Def>
          <Def term="Total supply">{supply.toLocaleString("en-US")}</Def>
          <Def term="Network">Robinhood Chain</Def>
          <Def term="Read from the contract">{live.data ? (live.data.verified ? `Yes · block ${Number(live.data.block).toLocaleString("en-US")}` : "Contract not reachable right now; showing the last verified values") : "Reading…"}</Def>
          <Def term="Explorer">
            <a href={tokenExplorerUrl} target="_blank" rel="noreferrer" className="text-emerald hover:underline">
              View on Blockscout
            </a>
          </Def>
        </dl>
      </div>

      <section className="mt-14 grid gap-10 border-t border-line-2 pt-10 md:grid-cols-2">
        <div>
          <Eyebrow>What it is</Eyebrow>
          <p className="mt-3 text-[15.5px] leading-relaxed text-ink-2">REDEEM is the token of the Redeem project, a standard ERC-20 on Robinhood Chain with a fixed supply. Anything it is used for on this platform will be announced on this page first.</p>
        </div>
        <div>
          <Eyebrow>What it is not</Eyebrow>
          <ul className="mt-3 space-y-2.5 text-[14.5px] leading-relaxed text-ink-2">
            {[
              "Not a Stock Token, and not issued by or affiliated with Robinhood.",
              "Not a share, a claim on shares, or a right to redeem anything.",
              "No weight in intents: tallies count share-equivalents of the Stock Token only.",
              "No effect on queue positions, record numbers or XP.",
              "Not investment advice. Crypto assets can lose all of their value.",
            ].map((line) => (
              <li key={line} className="flex gap-2.5">
                <span className="mt-[9px] size-[5px] shrink-0 bg-grey-green/60" />
                {line}
              </li>
            ))}
          </ul>
        </div>
      </section>
      <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2">
        <Mark tone="warn">Verify the address before every transaction</Mark>
        <Link to="/how-it-works#faq" className="text-[13.5px] text-emerald hover:underline">
          Token questions in the FAQ
        </Link>
      </div>
    </Page>
  );
}
