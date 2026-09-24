import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSignTypedData } from "wagmi";
import { client, orpc } from "../lib/api";

export function useForecast(itemId: string, wallet?: string) {
  return useQuery(orpc.forecasts.item.queryOptions({ input: { id: itemId, ...(wallet ? { wallet } : {}) }, enabled: Boolean(itemId), staleTime: 10_000, placeholderData: keepPreviousData }));
}

export function useForecastsBySymbol(symbol: string) {
  return useQuery(orpc.forecasts.bySymbol.queryOptions({ input: { symbol }, enabled: Boolean(symbol), staleTime: 30_000 }));
}

export function useForecastBoard() {
  return useQuery(orpc.forecasts.board.queryOptions({ staleTime: 30_000, refetchInterval: 60_000, placeholderData: keepPreviousData }));
}

export function useWalletForecasts(wallet?: string) {
  return useQuery(orpc.forecasts.wallet.queryOptions({ input: { wallet: wallet ?? "" }, enabled: Boolean(wallet), staleTime: 15_000 }));
}

/** Same two-step shape as an intent: the server writes the payload, the wallet signs it verbatim. */
export function useSignForecast() {
  const queryClient = useQueryClient();
  const { signTypedDataAsync } = useSignTypedData();
  return useMutation({
    mutationKey: ["forecasts", "sign"],
    mutationFn: async (input: { wallet: string; itemId: string; prediction: string }) => {
      const prepared = await client.forecasts.prepare(input);
      const typed = prepared.typedData as unknown as { domain: Record<string, unknown>; types: Record<string, Array<{ name: string; type: string }>>; primaryType: string; message: Record<string, unknown> };
      const signature = await signTypedDataAsync({ domain: typed.domain, types: typed.types, primaryType: typed.primaryType, message: typed.message } as unknown as Parameters<typeof signTypedDataAsync>[0]);
      return client.forecasts.commit({ challengeId: prepared.challengeId, signature });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orpc.forecasts.key() }),
  });
}
