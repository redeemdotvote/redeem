import { useCallback, useState } from "react";
import { useAccount, useChainId, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { CHAIN_ID } from "../lib/chain";
import { openWalletModal, walletConnectEnabled } from "../lib/wallet";

/**
 * One hook for the whole wallet story: connect through the AppKit modal when a Reown project id
 * is configured, or straight through an injected provider when it is not.
 */
export function useWallet() {
  const { address, isConnected, status, connector } = useAccount();
  const chainId = useChainId();
  const { connectors, connectAsync, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain();
  const [error, setError] = useState<string | null>(null);

  const injectedConnector = connectors.find((entry) => entry.type === "injected") ?? connectors[0];
  const canConnect = walletConnectEnabled || Boolean(injectedConnector);

  const connect = useCallback(async () => {
    setError(null);
    try {
      if (walletConnectEnabled) {
        await openWalletModal();
        return;
      }
      if (!injectedConnector) {
        setError("No browser wallet detected. Add a WalletConnect project id to enable mobile wallets.");
        return;
      }
      await connectAsync({ connector: injectedConnector, chainId: CHAIN_ID });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not connect a wallet.");
    }
  }, [connectAsync, injectedConnector]);

  const switchToRobinhood = useCallback(async () => {
    setError(null);
    try {
      await switchChainAsync({ chainId: CHAIN_ID });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not switch network.");
    }
  }, [switchChainAsync]);

  return {
    address,
    isConnected,
    status,
    walletName: connector?.name ?? null,
    chainId,
    /** Signing works on any chain, but the record book is chain 4663 — say so when they differ. */
    wrongNetwork: isConnected && chainId !== CHAIN_ID,
    connect,
    disconnect,
    switchToRobinhood,
    isConnecting,
    isSwitching,
    canConnect,
    walletConnectEnabled,
    error,
  };
}
