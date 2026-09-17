import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { orpc } from "../lib/api";

/** Home numbers. The last good read is kept on screen while a refresh fails, so the ledger never blanks. */
export function useHomeStats() {
  return useQuery(orpc.stats.home.queryOptions({ staleTime: 30_000, refetchInterval: 60_000, placeholderData: keepPreviousData, retry: 3, retryDelay: (attempt) => Math.min(1500 * 2 ** attempt, 15_000) }));
}

export function useStatus() {
  return useQuery(orpc.stats.status.queryOptions({ staleTime: 15_000, refetchInterval: 30_000, placeholderData: keepPreviousData }));
}

export function useLeaderboard() {
  return useQuery(orpc.stats.leaderboard.queryOptions({ staleTime: 30_000, refetchInterval: 60_000, placeholderData: keepPreviousData }));
}
