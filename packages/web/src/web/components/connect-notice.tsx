import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "wouter";
import { markNoticeAccepted, registerNotice } from "../lib/notice";
import { Button } from "./ui";

/** Three lines, once, before the wallet modal. Everything longer lives one layer down. */
export function ConnectNotice() {
  const [resolver, setResolver] = useState<((accepted: boolean) => void) | null>(null);
  useEffect(() => {
    registerNotice((resolve) => setResolver(() => resolve));
    return () => registerNotice(null);
  }, []);
  if (!resolver) return null;
  const finish = (accepted: boolean) => {
    if (accepted) markNoticeAccepted();
    resolver(accepted);
    setResolver(null);
  };
  return createPortal(
    <div className="fixed inset-0 z-[80] grid place-items-center p-4" role="dialog" aria-modal="true" aria-label="Before you connect">
      <button type="button" aria-label="Dismiss" onClick={() => finish(false)} className="absolute inset-0 cursor-default bg-[rgb(11_18_14_/_0.62)]" />
      <div className="rise surface relative w-full max-w-[440px] rounded-[16px] p-6">
        <div className="eyebrow">Before you connect</div>
        <ol className="mt-4 space-y-3">
          {[
            ["Intent, not a vote.", "What you sign is what you would want. Stock Tokens carry no shareholder vote today."],
            ["A record, not a settlement.", "A queue request pre-registers demand. Redemption opens only when the issuer opens it."],
            ["Signatures, never transactions.", "Redeem reads balances and stores signatures. No custody, no approval, no gas."],
          ].map(([title, body]) => (
            <li key={title} className="flex gap-3">
              <span className="mt-[9px] size-[6px] shrink-0 bg-emerald" />
              <span>
                <span className="block text-[15px] font-medium text-ink">{title}</span>
                <span className="block text-[13px] leading-relaxed text-grey-green">{body}</span>
              </span>
            </li>
          ))}
        </ol>
        <div className="mt-6 flex items-center justify-between gap-3">
          <Link to="/how-it-works#plainly" onClick={() => finish(false)} className="text-[12.5px] text-grey-green hover:text-ink">
            Read the full text
          </Link>
          <Button onClick={() => finish(true)}>Continue to wallet</Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
