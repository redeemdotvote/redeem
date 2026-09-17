import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSignMessage } from "wagmi";
import { client, orpc } from "../lib/api";
import { getReferral } from "../lib/referral";

export function useRedemptionTerms() {
  return useQuery(orpc.redemption.terms.queryOptions({ staleTime: Infinity }));
}

export function useRedemptionStatus(wallet?: string, symbol?: string) {
  return useQuery(orpc.redemption.status.queryOptions({ input: { ...(wallet ? { wallet } : {}), ...(symbol ? { symbol } : {}) }, staleTime: 15_000 }));
}

/** Prepare → sign the request text → commit. The place in the ticker's queue is assigned server side. */
export function useRequestRedemption() {
  const queryClient = useQueryClient();
  const { signMessageAsync } = useSignMessage();
  return useMutation({
    mutationKey: ["redemption", "request"],
    mutationFn: async (input: { wallet: string; symbol: string; requestedShareEquivalent: string; jurisdiction: string; acknowledgements: Array<"not_live" | "eligibility_by_issuer" | "restrictions" | "no_guarantee"> }) => {
      const prepared = await client.redemption.prepare(input);
      const signature = await signMessageAsync({ message: prepared.message });
      return client.redemption.commit({ challengeId: prepared.challengeId, signature, ref: getReferral() });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orpc.redemption.key() });
      queryClient.invalidateQueries({ queryKey: orpc.record.key() });
    },
  });
}
