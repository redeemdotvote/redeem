import { useQuery } from "@tanstack/react-query";
import { orpc } from "../lib/api";

export function useHomeStats() {
  return useQuery(orpc.stats.home.queryOptions({ staleTime: 30_000, refetchInterval: 60_000 }));
}
