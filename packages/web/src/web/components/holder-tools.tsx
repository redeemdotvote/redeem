import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { useSignMessage } from "wagmi";
import { client, orpc } from "../lib/api";
import { useWallet } from "../hooks/use-wallet";
import { relative } from "../lib/format";
import { Button, Eyebrow, Input, Mark, Note, Skeleton } from "./ui";

/** Must match hookMessage() on the server byte for byte. */
const hookMessage = (action: "add" | "remove", wallet: string, target: string, issuedAt: number) => `Redeem webhooks\naction: ${action}\nwallet: ${wallet.toLowerCase()}\ntarget: ${target}\nissued: ${issuedAt}`;

/** Tier standing and webhook management for the connected wallet. Signing proves ownership; nothing is spent. */
export function HolderTools() {
  const wallet = useWallet();
  const queryClient = useQueryClient();
  const { signMessageAsync } = useSignMessage();
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const address = wallet.address;
  const tier = useQuery(orpc.hooks.tier.queryOptions({ input: { wallet: address ?? "" }, enabled: Boolean(address), staleTime: 60_000 }));
  const hooks = useQuery(orpc.hooks.list.queryOptions({ input: { wallet: address ?? "" }, enabled: Boolean(address), staleTime: 10_000 }));
  const refresh = () => queryClient.invalidateQueries({ queryKey: orpc.hooks.key() });

  const add = useMutation({
    mutationFn: async () => {
      const issuedAt = Math.floor(Date.now() / 1000);
      const signature = await signMessageAsync({ message: hookMessage("add", address!, url.trim(), issuedAt) });
      return client.hooks.add({ wallet: address!, url: url.trim(), issuedAt, signature });
    },
    onSuccess: (result) => {
      setSecret(result.secret);
      setUrl("");
      void refresh();
    },
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const issuedAt = Math.floor(Date.now() / 1000);
      const signature = await signMessageAsync({ message: hookMessage("remove", address!, id, issuedAt) });
      return client.hooks.remove({ wallet: address!, id, issuedAt, signature });
    },
    onSuccess: () => void refresh(),
  });

  if (!address) {
    return (
      <div className="rounded-[16px] border border-line bg-cream p-6">
        <Eyebrow>Your standing</Eyebrow>
        <p className="mt-2 text-[14.5px] text-ink-2">Connect a wallet to read its REDEEM balance and manage webhooks.</p>
        <Button className="mt-4" onClick={wallet.connect}>
          Connect wallet
        </Button>
      </div>
    );
  }
  const t = tier.data;
  const allowed = t?.tier?.webhooks ?? 0;
  return (
    <div className="rounded-[16px] border border-line bg-cream p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Eyebrow>Your standing</Eyebrow>
        {t ? t.tier ? <Mark tone="live">{t.tier.label}</Mark> : <Mark tone="muted">No tier yet</Mark> : null}
      </div>
      {!t ? (
        <Skeleton className="mt-3 h-10" />
      ) : (
        <>
          <div className="font-mono mt-2 text-[28px] leading-none text-ink">
            {t.balanceWhole.toLocaleString("en-US")} <span className="text-[14px] text-grey-green">REDEEM</span>
          </div>
          <p className="mt-2 text-[13px] text-grey-green">
            {t.tiers
              .slice()
              .reverse()
              .map((entry) => `${entry.label}: ${entry.min.toLocaleString("en-US")}+ REDEEM, ${entry.webhooks} webhook${entry.webhooks === 1 ? "" : "s"}`)
              .join(" · ")}
          </p>
        </>
      )}
      <div className="mt-6 border-t border-line pt-4">
        <div className="flex items-center justify-between">
          <Eyebrow>Webhooks</Eyebrow>
          <span className="font-mono text-[12px] text-grey-green">
            {hooks.data?.length ?? 0} / {allowed}
          </span>
        </div>
        <ul className="mt-2">
          {(hooks.data ?? []).map((hook) => (
            <li key={hook.id} className="flex items-center justify-between gap-3 border-b border-line py-2.5 text-[13px]">
              <span className="min-w-0">
                <span className="font-mono block truncate text-ink">{hook.target}</span>
                <span className="block text-[11.5px] text-grey-green">
                  {hook.active ? "active" : "switched off after repeated failures"}
                  {hook.lastDeliveredAt ? ` · last delivery ${hook.lastStatus} ${relative(hook.lastDeliveredAt)}` : " · no delivery yet"}
                </span>
              </span>
              <button type="button" onClick={() => remove.mutate(hook.id)} disabled={remove.isPending} className="grid size-8 shrink-0 place-items-center rounded-[8px] text-grey-green hover:text-rust" aria-label="Remove webhook">
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
        {allowed > (hooks.data?.length ?? 0) ? (
          <div className="mt-3 flex gap-2">
            <Input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://your-server.example/redeem-hook" className="font-mono text-[12.5px]" />
            <Button disabled={add.isPending || !/^https:\/\/.+\..+/.test(url.trim())} onClick={() => add.mutate()}>
              Sign &amp; add
            </Button>
          </div>
        ) : allowed === 0 && t ? (
          <p className="mt-3 text-[13px] text-grey-green">Webhooks unlock at {t.tiers[t.tiers.length - 1]?.min.toLocaleString("en-US")} REDEEM.</p>
        ) : null}
        {add.isError ? <Note tone="danger" className="mt-3">{add.error instanceof Error ? add.error.message : "Could not add the webhook."}</Note> : null}
        {secret ? (
          <Note tone="emerald" className="mt-3">
            <span className="block font-medium">Signing secret, shown once:</span>
            <span className="font-mono block text-[12px] break-all">{secret}</span>
            <span className="mt-1 block text-[12px] text-grey-green">Each delivery carries x-redeem-signature: sha256=HMAC(secret, body).</span>
          </Note>
        ) : null}
      </div>
    </div>
  );
}
