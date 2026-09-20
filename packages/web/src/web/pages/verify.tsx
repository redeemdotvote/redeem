import { CheckCircle2, Upload, XCircle } from "lucide-react";
import { useState } from "react";
import { verifyMessage, verifyTypedData, type Hex } from "viem";
import { leafHash, verifyProof } from "../../api/ballots/merkle";
import { canonicalJson } from "../../api/lib/canonical";
import { Page, PageHead } from "../components/layout";
import { Button, Eyebrow, Input, Mark, Note } from "../components/ui";
import { shares } from "../lib/format";

/**
 * /verify — checks a wallet bundle entirely in the browser: every EIP-712 intent signature and
 * every queue-request signature must recover to the wallet, every Merkle proof must rebuild its
 * published root, and the bundle digest must match. Nothing is sent anywhere.
 */
const UINT_FIELDS = new Set(["rawBalance", "uiMultiplier", "shareEquivalent", "block"]);

type Check = { label: string; detail: string; ok: boolean };

async function sha256Hex(text: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function verifyBundle(bundle: any): Promise<Check[]> {
  const checks: Check[] = [];
  const contents = bundle?.contents;
  if (!contents || contents.type !== "redeem.wallet-bundle") throw new Error("This is not a Redeem wallet bundle.");
  const wallet = contents.wallet as Hex;
  const digest = await sha256Hex(canonicalJson(contents));
  checks.push({ label: "Bundle digest", detail: `sha256 ${digest.slice(0, 20)}…`, ok: digest === bundle.bundleDigest });
  for (const intent of contents.intents ?? []) {
    const typed = intent.typedData;
    let ok = false;
    try {
      const message = Object.fromEntries(Object.entries(typed.message).map(([key, value]) => [key, UINT_FIELDS.has(key) ? BigInt(value as string) : value]));
      ok = await verifyTypedData({ address: wallet, domain: typed.domain, types: typed.types, primaryType: typed.primaryType, message, signature: intent.signature } as Parameters<typeof verifyTypedData>[0]);
    } catch {
      ok = false;
    }
    checks.push({ label: `Intent · ${intent.symbol} · ${String(intent.choice).toUpperCase()}`, detail: `${shares(Number(BigInt(intent.shareEquivalent)) / 1e18)} sh-eq · block ${intent.blockNumber} · EIP-712 signature recovers to the wallet`, ok });
    if (intent.proof) {
      const leafOk = leafHash(intent.canonical).toLowerCase() === String(intent.proof.leaf).toLowerCase();
      const proofOk = leafOk && verifyProof(intent.proof.leaf, intent.proof.siblings, intent.proof.root);
      checks.push({ label: `Merkle proof · ${intent.symbol}`, detail: `receipt is leaf ${intent.proof.index} under root ${String(intent.proof.root).slice(0, 14)}…`, ok: proofOk });
    }
  }
  for (const request of contents.redemptionRequests ?? []) {
    let ok = false;
    try {
      ok = await verifyMessage({ address: wallet, message: request.message, signature: request.signature });
    } catch {
      ok = false;
    }
    checks.push({ label: `Queue request · ${request.symbol} · #${request.position}`, detail: `${shares(Number(BigInt(request.requestedShareEquivalent)) / 1e18)} sh-eq · signed message recovers to the wallet`, ok });
  }
  return checks;
}

export default function VerifyPage() {
  const [address, setAddress] = useState("");
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [wallet, setWallet] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (load: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    setChecks(null);
    try {
      const bundle = (await load()) as any;
      setWallet(bundle?.contents?.wallet ?? null);
      setChecks(await verifyBundle(bundle));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not read that file.");
    } finally {
      setBusy(false);
    }
  };
  const failed = checks?.filter((check) => !check.ok).length ?? 0;

  return (
    <Page narrow>
      <PageHead
        eyebrow="Verify"
        title={
          <>
            Check a record <span className="italic">without trusting Redeem.</span>
          </>
        }
        body="A wallet bundle holds everything a wallet has signed. This page checks it in your browser: each signature must recover to the wallet, each Merkle proof must rebuild its published root, and the digest must match. Nothing is uploaded."
      />
      <div className="grid gap-6 border-t border-line-2 pt-8 md:grid-cols-2">
        <div>
          <Eyebrow>Fetch by address</Eyebrow>
          <div className="mt-3 flex gap-2">
            <Input value={address} onChange={(event) => setAddress(event.target.value.trim())} placeholder="0x…" className="font-mono text-[13px]" />
            <Button disabled={busy || !/^0x[a-fA-F0-9]{40}$/.test(address)} onClick={() => run(async () => (await fetch(`/api/v1/wallets/${address}/bundle`)).json())}>
              Verify
            </Button>
          </div>
          <p className="mt-2 text-[12.5px] text-grey-green">Downloads the bundle from the public API, then verifies it locally.</p>
        </div>
        <div>
          <Eyebrow>Or open a saved bundle</Eyebrow>
          <label className="mt-3 flex h-10 cursor-pointer items-center justify-center gap-2 rounded-[10px] border border-dashed border-line-2 text-[13.5px] text-ink-2 hover:border-ink">
            <Upload className="size-4" /> Choose redeem-bundle-0x….json
            <input type="file" accept="application/json,.json" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void run(async () => JSON.parse(await file.text())); }} />
          </label>
          <p className="mt-2 text-[12.5px] text-grey-green">Works offline once this page has loaded.</p>
        </div>
      </div>
      {error ? <Note tone="danger" className="mt-6">{error}</Note> : null}
      {checks ? (
        <section className="mt-10">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-2 pb-3">
            <div>
              <Eyebrow>Result</Eyebrow>
              <div className="font-mono mt-1 text-[13px] text-ink">{wallet}</div>
            </div>
            {failed === 0 ? <Mark tone="live">All {checks.length} checks passed</Mark> : <Mark tone="danger">{failed} of {checks.length} checks failed</Mark>}
          </div>
          {checks.length === 1 ? <p className="mt-4 text-[14px] text-grey-green">This wallet has not signed anything yet, so there is only the digest to check.</p> : null}
          <ol>
            {checks.map((check, index) => (
              <li key={index} className="flex items-start gap-3 border-b border-line py-3">
                {check.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-rust" />}
                <span>
                  <span className="block text-[14.5px] text-ink">{check.label}</span>
                  <span className="block text-[12.5px] text-grey-green">{check.detail}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </Page>
  );
}
