import { useQuery } from "@tanstack/react-query";
import { orpc } from "../lib/api";

export function usePortfolio(wallet?: string) {
  return useQuery(orpc.portfolio.forWallet.queryOptions({ input: { wallet: wallet ?? "" }, enabled: Boolean(wallet), staleTime: 15_000, refetchInterval: 60_000 }));
}

export function useTransfers(wallet?: string, limit = 25) {
  return useQuery(orpc.portfolio.transfers.queryOptions({ input: { wallet: wallet ?? "", limit }, enabled: Boolean(wallet), staleTime: 60_000 }));
}

export function useCorporateActions() {
  return useQuery(orpc.portfolio.corporateActions.queryOptions({ staleTime: 120_000 }));
}
