import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "../lib/api";

export function useStatements(wallet?: string) {
  return useQuery(orpc.statements.forWallet.queryOptions({ input: { wallet: wallet ?? "" }, enabled: Boolean(wallet), staleTime: 10_000 }));
}

export function useStatement(id: string) {
  return useQuery(orpc.statements.get.queryOptions({ input: { id }, enabled: Boolean(id), staleTime: Infinity }));
}

export function useCreateStatement() {
  const queryClient = useQueryClient();
  return useMutation(orpc.statements.create.mutationOptions({ onSuccess: () => queryClient.invalidateQueries({ queryKey: orpc.statements.key() }) }));
}
