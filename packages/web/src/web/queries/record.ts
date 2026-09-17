import { useQuery } from "@tanstack/react-query";
import { orpc } from "../lib/api";

/** Chain data comes from the API, never the browser: reads are batched and cached server side. */
export function useRecordBook(wallet?: string) {
  return useQuery(
    orpc.record.book.queryOptions({
      input: wallet ? { wallet } : {},
      staleTime: 45_000,
      refetchInterval: 90_000,
    }),
  );
}

export function useRecord(symbol: string, wallet?: string) {
  return useQuery(
    orpc.record.detail.queryOptions({
      input: { symbol, ...(wallet ? { wallet } : {}) },
      enabled: Boolean(symbol),
      staleTime: 30_000,
    }),
  );
}
