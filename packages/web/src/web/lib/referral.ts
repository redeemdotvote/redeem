/**
 * Referral capture. A link like /?ref=CODE remembers the code in this browser; it is sent with the
 * wallet's first signature and bound server side only if the wallet has no record yet. Nothing
 * happens on arrival alone: no cookie sync, no request, no tracking.
 */
const KEY = "redeem-ref";

export function captureReferral() {
  try {
    const code = new URLSearchParams(window.location.search).get("ref");
    if (code && /^[a-z0-9]{6,12}$/i.test(code) && !localStorage.getItem(KEY)) localStorage.setItem(KEY, code.toLowerCase());
  } catch {}
}

export function getReferral(): string | undefined {
  try {
    return localStorage.getItem(KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function clearReferral() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}
