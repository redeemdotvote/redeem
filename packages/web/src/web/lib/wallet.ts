import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { createAppKit, type AppKit } from "@reown/appkit/react";
import { createConfig, http, type Config } from "wagmi";
import { injected } from "wagmi/connectors";
import { CHAIN_ID, robinhoodChain } from "./chain";

/**
 * Wallet wiring.
 *
 * With a Reown project id present we run the full AppKit modal — WalletConnect, mobile wallets,
 * the lot. Without one we degrade to injected wallets only rather than crashing, so the app is
 * usable before the key is supplied and picks the modal up the moment it lands in `.env`.
 */
const projectId = (import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? "").trim();

export const walletConnectEnabled = projectId.length > 0;

const metadata = {
  name: "Redeem",
  description: "Shareholder voting instructions for Robinhood Stock Tokens.",
  url: typeof window === "undefined" ? "https://redeem.app" : window.location.origin,
  icons: ["https://robinhoodchain.blockscout.com/favicon.ico"],
};

function injectedOnlyConfig(): Config {
  return createConfig({
    chains: [robinhoodChain],
    connectors: [injected({ shimDisconnect: true })],
    transports: { [CHAIN_ID]: http() },
    ssr: false,
  });
}

function buildWallet(): { config: Config; appKit: AppKit | null } {
  if (!walletConnectEnabled) return { config: injectedOnlyConfig(), appKit: null };

  try {
    const network = { ...robinhoodChain, caipNetworkId: `eip155:${CHAIN_ID}`, chainNamespace: "eip155" } as never;
    const adapter = new WagmiAdapter({
      networks: [network],
      projectId,
      transports: { [CHAIN_ID]: http() },
    });
    const appKit = createAppKit({
      adapters: [adapter],
      networks: [network],
      defaultNetwork: network,
      projectId,
      metadata,
      features: { analytics: false, email: false, socials: [], swaps: false, onramp: false },
      themeMode: "light",
      themeVariables: {
        "--w3m-accent": "#157a4f",
        "--w3m-font-family": "DM Sans, sans-serif",
        "--w3m-border-radius-master": "3px",
      },
    });
    return { config: adapter.wagmiConfig as unknown as Config, appKit };
  } catch (error) {
    // A bad or rejected project id must never take the record book down with it.
    console.warn("[redeem] AppKit init failed, falling back to injected wallets only", error);
    return { config: injectedOnlyConfig(), appKit: null };
  }
}

const wallet = buildWallet();

export const wagmiConfig = wallet.config;
export const appKit = wallet.appKit;

export function openWalletModal() {
  return appKit?.open();
}
