import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { createAppKit, type AppKit } from "@reown/appkit/react";
import { createConfig, http, type Config } from "wagmi";
import { injected } from "wagmi/connectors";
import { CHAIN_ID, robinhoodChain } from "./chain";

/**
 * Wallet wiring, on Reown AppKit (the WalletConnect stack).
 *
 * With a Reown project id present we run the full AppKit modal: browser wallets, WalletConnect
 * QR and mobile deep links, with Robinhood Chain as the only network. Without one we degrade to
 * injected wallets only rather than crashing. The id is public by design (it ships in the bundle);
 * the domains allowed to use it are set in the Reown dashboard.
 */
const projectId = (import.meta.env.VITE_REOWN_PROJECT_ID ?? import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? "").trim();

export const walletConnectEnabled = projectId.length > 0;

const origin = typeof window === "undefined" ? "https://redeem-desktop.vercel.app" : window.location.origin;

/** Shown inside the wallet when it asks the holder to approve the connection and each signature. */
const metadata = {
  name: "Redeem",
  description: "The record layer for Robinhood Stock Tokens: share-equivalents, holder intent, redemption readiness. Signatures only; never a transaction.",
  url: origin,
  icons: [`${origin}/apple-touch-icon.png`],
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
      ssr: false,
    });
    const dark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");
    const appKit = createAppKit({
      adapters: [adapter],
      networks: [network],
      defaultNetwork: network,
      projectId,
      metadata,
      // Signing is the only thing a wallet does here, so the modal carries nothing but wallets:
      // no email or social login, no swaps, no on-ramp, no analytics beacon.
      features: { analytics: false, email: false, socials: [], swaps: false, onramp: false, send: false, history: false },
      // A custom chain has no entry in the WalletConnect explorer, so give the modal its icon.
      chainImages: { [CHAIN_ID]: `${origin}/assets/logos/robinhood-feather-dark.svg` },
      allowUnsupportedChain: true,
      enableWalletGuide: false,
      themeMode: dark ? "dark" : "light",
      themeVariables: {
        "--w3m-accent": dark ? "#5fbd8f" : "#1c6b4a",
        "--w3m-font-family": "Geist, Helvetica Neue, Arial, sans-serif",
        "--w3m-border-radius-master": "3px",
        "--w3m-z-index": 90,
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
