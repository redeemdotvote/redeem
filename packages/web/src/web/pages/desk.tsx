import { Link, useParams } from "wouter";
import { DESKS, DeskRow, SecurityDesk } from "../components/desk";
import { Page } from "../components/layout";
import { RightsTable } from "../components/rights";
import { ChainLine, PostRef } from "../components/robinhood-chain";
import { Eyebrow } from "../components/ui";

/** /desk/:symbol — the front-page treatment for one security, in full. */
export default function DeskPage() {
  const params = useParams<{ symbol: string }>();
  const symbol = (params.symbol ?? "").toUpperCase();
  if (!DESKS[symbol]) {
    return (
      <Page>
        <div className="py-28 text-center">
          <h1 className="display text-[40px] text-ink">No desk for {symbol || "that"}.</h1>
          <p className="mt-3 text-[14.5px] text-grey-green">
            Every security still has a record page.{" "}
            <Link to={symbol ? `/record/${symbol}` : "/record"} className="text-emerald hover:underline">
              Open it
            </Link>
            .
          </p>
        </div>
      </Page>
    );
  }
  return (
    <>
      <section className="env-mint py-14 lg:py-16">
        <Page>
          <div className="mb-8 flex flex-wrap items-center gap-x-6 gap-y-2">
            <ChainLine caption="Read from" />
            <PostRef />
          </div>
          <SecurityDesk symbol={symbol} />
        </Page>
      </section>
      <DeskRow current={symbol} />
      <Page>
        <section className="pt-14">
          <Eyebrow>Rights today</Eyebrow>
          <h2 className="font-serif mt-2 text-[30px] text-ink">A share of {symbol}, a token for {symbol}, and the gap between them.</h2>
          <RightsTable symbol={symbol} className="mt-6" />
        </section>
      </Page>
    </>
  );
}
