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

/** The wallet's record numbers, queue positions and Season badge. */
export function useWalletStatus(wallet?: string) {
  return useQuery(orpc.portfolio.status.queryOptions({ input: { wallet: wallet ?? "" }, enabled: Boolean(wallet), staleTime: 15_000 }));
}

/** XP breakdown, rank and referral link. `withCode` only for the connected wallet, so viewing someone else's address never mints a code for them. */
export function useWalletXp(wallet?: string, withCode = false) {
  return useQuery(orpc.portfolio.xp.queryOptions({ input: { wallet: wallet ?? "", withCode }, enabled: Boolean(wallet), staleTime: 15_000 }));
}
