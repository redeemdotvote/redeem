/**
 * The first-connect notice: three lines a holder sees once, before the wallet modal opens.
 * Accepted state lives in this browser; the full text stays in the footer and How it works.
 */
const KEY = "redeem-notice";
type Listener = (resolve: (accepted: boolean) => void) => void;
let listener: Listener | null = null;

export function noticeAccepted(): boolean {
  try {
    return localStorage.getItem(KEY) === "accepted";
  } catch {
    return true;
  }
}

export function markNoticeAccepted() {
  try {
    localStorage.setItem(KEY, "accepted");
  } catch {}
}

export function registerNotice(fn: Listener | null) {
  listener = fn;
}

/** Resolves true when the holder continues, false when they dismiss. Resolves true if no notice UI is mounted. */
export function requestNotice(): Promise<boolean> {
  if (noticeAccepted() || !listener) return Promise.resolve(true);
  return new Promise((resolve) => listener!(resolve));
}
