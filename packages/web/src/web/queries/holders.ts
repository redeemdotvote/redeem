import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { orpc } from "../lib/api";

export function useHolderRanks(wallet?: string) {
  return useQuery(orpc.holders.ranks.queryOptions({ input: { wallet: wallet ?? "" }, enabled: Boolean(wallet), staleTime: 60_000 }));
}

export function useTopHolders(symbol: string) {
  return useQuery(orpc.holders.top.queryOptions({ input: { symbol }, enabled: Boolean(symbol), staleTime: 60_000, placeholderData: keepPreviousData }));
}
