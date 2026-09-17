import { ChainLine } from "../components/robinhood-chain";
import { Page, PageHead } from "../components/layout";
import { Mark, Skeleton } from "../components/ui";
import { ageLabel, dateTime, relative } from "../lib/format";
import { useStatus } from "../queries/stats";

/**
 * The public status page. Three things can go wrong on a record layer: the chain cannot be read,
 * the database that holds signatures is out, or the market read is stale. Each is shown with the
 * number that proves it, refreshed every thirty seconds.
 */
export default function StatusPage() {
  const status = useStatus();
  const s = status.data;
  const rpcOk = s?.rpc.ok ?? false;
  const dbOk = s?.database.ok ?? false;
  const marketFresh = s?.market.ok && (s.market.ageMs ?? Infinity) < 10 * 60_000 && !s.market.stale;
  const all = rpcOk && dbOk && marketFresh;

  return (
    <Page narrow>
      <PageHead
        eyebrow={<span className="inline-flex flex-wrap items-center gap-4">Status <ChainLine caption={null} /></span>}
        title={
          s ? (
            all ? (
              <>
                All systems <span className="text-emerald italic">live.</span>
              </>
            ) : (
              <>
                Running <span className="text-amber italic">degraded.</span>
              </>
            )
          ) : (
            "Checking…"
          )
        }
        body={s ? `Checked ${relative(new Date(s.checkedAt))} · build ${s.build}${s.region ? ` · ${s.region}` : ""} · refreshes every 30 seconds.` : "Reading the chain, the market cache and the database."}
      />
      {!s ? (
        <Skeleton className="h-64" />
      ) : (
        <div className="border-t border-line-2">
          <Row label="Robinhood Chain RPC" ok={rpcOk} value={rpcOk ? `Block ${Number(s.rpc.blockNumber).toLocaleString("en-US")}` : "Unreachable"} sub={rpcOk ? `${s.rpc.latencyMs} ms round trip` : ("error" in s.rpc ? s.rpc.error : null) ?? "No response"} />
          <Row
            label="Market read"
            ok={Boolean(marketFresh)}
            warn={s.market.ok && !marketFresh}
            value={s.market.ok ? `Block ${Number(s.market.blockNumber).toLocaleString("en-US")}` : "No cached read"}
            sub={s.market.ok ? `${s.market.assets} assets · ${s.market.priced} priced feeds · read ${ageLabel(s.market.ageMs)}${s.market.stale ? " · served stale" : ""}` : "The first read after a cold start takes a few seconds."}
          />
          <Row
            label="Signature database"
            ok={dbOk}
            value={dbOk ? "Connected" : "Unreachable"}
            sub={dbOk && s.database.ok ? `${s.database.ballots} ballots · ${s.database.items} items · ${s.database.instructions} intents · ${s.database.requests} queue requests · ${s.database.attestations} attestations · schema ${s.database.schemaCurrent ? "current" : "outdated"}` : "Chain columns still render; intents and queues are unavailable until it returns."}
          />
          {dbOk && s.database.ok
            ? s.database.cursors.map((cursor) => (
                <Row
                  key={cursor.key}
                  label={`Indexer · ${cursor.key.replace(/_/g, " ")}`}
                  ok={cursor.status !== "error"}
                  warn={cursor.status === "error"}
                  value={cursor.lastBlock ? `Block ${Number(cursor.lastBlock).toLocaleString("en-US")}` : cursor.status === "error" ? "Retrying" : cursor.status}
                  sub={`${cursor.status === "error" ? `Last scan refused by the RPC (${/429|Too Many/i.test(cursor.detail ?? "") ? "rate limited" : "error"}); the mirrored events still serve` : (cursor.detail ?? cursor.status)} · ${cursor.updatedAt ? dateTime(cursor.updatedAt) : "—"}`}
                />
              ))
            : null}
          <Row label="Security master" ok value={`${s.tokens} official Stock Tokens`} sub="Issuer allowlist, verified against the contracts at build time." />
        </div>
      )}
      <p className="mt-8 max-w-[70ch] text-[13px] leading-relaxed text-grey-green">
        The public Robinhood Chain RPC is rate limited. Every chain read happens server side behind a cache, and a stale value is served with its age rather than an error. Extra endpoints can be added with a comma-separated <span className="font-mono">RPC_URL</span>.
      </p>
    </Page>
  );
}

function Row({ label, ok, warn, value, sub }: { label: string; ok: boolean; warn?: boolean; value: string; sub?: string | null }) {
  return (
    <div className="grid gap-1 border-b border-line py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div>
        <div className="text-[15px] text-ink">{label}</div>
        {sub ? <div className="mt-0.5 text-[12.5px] text-grey-green">{sub}</div> : null}
      </div>
      <div className="flex items-center gap-3 sm:justify-end">
        <span className="font-mono text-[13px] text-ink">{value}</span>
        <Mark tone={ok ? "live" : warn ? "warn" : "danger"}>{ok ? "Live" : warn ? "Stale" : "Down"}</Mark>
      </div>
    </div>
  );
}
