import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { wagmiConfig } from "../lib/wallet";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // The public RPC is rate limited and every read is cached server side, so refetching on
      // every window focus buys nothing and costs requests.
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export function Provider({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
