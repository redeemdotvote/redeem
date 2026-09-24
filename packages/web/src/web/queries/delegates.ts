import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSignMessage } from "wagmi";
import { client, orpc } from "../lib/api";

export function useDelegates() {
  return useQuery(orpc.delegates.list.queryOptions({ staleTime: 30_000, refetchInterval: 60_000, placeholderData: keepPreviousData }));
}

export function useDelegate(wallet?: string) {
  return useQuery(orpc.delegates.get.queryOptions({ input: { wallet: wallet ?? "" }, enabled: Boolean(wallet), staleTime: 15_000, placeholderData: keepPreviousData }));
}

export function useDelegateNames(wallets: string[]) {
  const sorted = [...new Set(wallets.map((wallet) => wallet.toLowerCase()))].sort();
  return useQuery(orpc.delegates.names.queryOptions({ input: { wallets: sorted }, enabled: sorted.length > 0, staleTime: 60_000 }));
}

/** The exact text the wallet signs. Mirrors delegateMessage on the server, digest included. */
async function sha256Hex(text: string) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function useRegisterDelegate() {
  const queryClient = useQueryClient();
  const { signMessageAsync } = useSignMessage();
  return useMutation({
    mutationKey: ["delegates", "register"],
    mutationFn: async (input: { wallet: string; name: string; statement: string; link?: string }) => {
      const issuedAt = Math.floor(Date.now() / 1000);
      const link = input.link?.trim() ?? "";
      const message = `Redeem delegates\nwallet: ${input.wallet.toLowerCase()}\nname: ${input.name}\nstatement sha256: ${await sha256Hex(input.statement)}\nlink: ${link || "none"}\nissued: ${issuedAt}\n\nA delegate profile is a name for an address holders may name on a delegate intent. It confers no proxy authority, carries no vote, and may not be bought, sold or compensated.`;
      const signature = await signMessageAsync({ message });
      return client.delegates.register({ wallet: input.wallet, name: input.name, statement: input.statement, ...(link ? { link } : {}), issuedAt, signature });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orpc.delegates.key() }),
  });
}
