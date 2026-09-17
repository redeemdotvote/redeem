import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSignTypedData } from "wagmi";
import { client, orpc } from "../lib/api";

export interface IntentFilters {
  status: "active" | "closed" | "all";
  symbol?: string;
  q?: string;
  page: number;
  pageSize?: number;
  wallet?: string;
}

export function useIntentItems(filters: IntentFilters) {
  return useQuery(
    orpc.intents.list.queryOptions({
      input: {
        status: filters.status,
        page: filters.page,
        pageSize: filters.pageSize ?? 25,
        ...(filters.symbol ? { symbol: filters.symbol } : {}),
        ...(filters.q ? { q: filters.q } : {}),
        ...(filters.wallet ? { wallet: filters.wallet } : {}),
      },
      staleTime: 15_000,
      placeholderData: (previous) => previous,
    }),
  );
}

export function useIntentItem(id: string, wallet?: string) {
  return useQuery(orpc.intents.item.queryOptions({ input: { id, ...(wallet ? { wallet } : {}) }, enabled: Boolean(id), staleTime: 10_000 }));
}

export function useReceipts(wallet?: string) {
  return useQuery(orpc.intents.receipts.queryOptions({ input: { wallet: wallet ?? "" }, enabled: Boolean(wallet), staleTime: 10_000 }));
}

export function useReceipt(id: string) {
  return useQuery(orpc.intents.receipt.queryOptions({ input: { id }, enabled: Boolean(id), staleTime: 30_000 }));
}

export function useAttestations() {
  return useQuery(orpc.intents.attestations.queryOptions({ staleTime: 30_000 }));
}

export function usePendingAttestation() {
  return useQuery(orpc.intents.pendingAttestation.queryOptions({ staleTime: 30_000 }));
}

const UINT_FIELDS = new Set(["rawBalance", "uiMultiplier", "shareEquivalent", "block"]);

/**
 * Two steps on purpose. The server reads the position from chain and writes the exact EIP-712
 * payload; the wallet signs that payload verbatim; the server verifies the signature against the
 * payload it issued before storing anything. The browser never gets to state its own weight.
 */
export function useSignIntent() {
  const queryClient = useQueryClient();
  const { signTypedDataAsync } = useSignTypedData();
  return useMutation({
    mutationKey: ["intents", "sign"],
    mutationFn: async (input: { wallet: string; itemId: string; choice: string; delegate?: string }) => {
      const prepared = await client.intents.prepare(input);
      const typed = prepared.typedData as unknown as {
        domain: Record<string, unknown>;
        types: Record<string, Array<{ name: string; type: string }>>;
        primaryType: string;
        message: Record<string, unknown>;
      };
      const message = Object.fromEntries(Object.entries(typed.message).map(([key, value]) => [key, UINT_FIELDS.has(key) ? BigInt(value as string) : value]));
      const args = { domain: typed.domain, types: typed.types, primaryType: typed.primaryType, message } as unknown as Parameters<typeof signTypedDataAsync>[0];
      const signature = await signTypedDataAsync(args);
      return client.intents.commit({ challengeId: prepared.challengeId, signature });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orpc.intents.key() });
      queryClient.invalidateQueries({ queryKey: orpc.record.key() });
      queryClient.invalidateQueries({ queryKey: orpc.stats.key() });
    },
  });
}

export function useAttest() {
  const queryClient = useQueryClient();
  return useMutation(orpc.intents.attest.mutationOptions({ onSuccess: () => queryClient.invalidateQueries({ queryKey: orpc.intents.key() }) }));
}
