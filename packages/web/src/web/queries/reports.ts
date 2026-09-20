import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { orpc } from "../lib/api";

export function useReports() {
  return useQuery(orpc.reports.list.queryOptions({ staleTime: 30_000, placeholderData: keepPreviousData }));
}

export function useReport(ballotId: string) {
  return useQuery(orpc.reports.get.queryOptions({ input: { ballotId }, enabled: Boolean(ballotId), staleTime: 30_000, refetchInterval: 60_000, placeholderData: keepPreviousData }));
}

export function useGenesis() {
  return useQuery(orpc.stats.genesis.queryOptions({ staleTime: 20_000, refetchInterval: 60_000, placeholderData: keepPreviousData }));
}
