import { Download, Share2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "./ui";

/**
 * The record card: one position, drawn as a certificate a holder can post. It is a Canvas 2D
 * drawing (so the PNG matches what is on screen and needs no font embedding) with the same paper,
 * ink and emerald as the site. Everything on it is already public on the record page; the card
 * just puts it in one frame, with the intent-not-a-vote line printed on the card itself.
 */
export interface CertificateData {
  symbol: string;
  name: string;
  shareEquivalent: number;
  rawTokens: number;
  multiplier: number;
  blockNumber: string;
  wallet: string;
  recordNumber: number | null;
  holdersRecorded: number | null;
  queuePosition: number | null;
  season: { label: string; note: string };
  issuedAt: Date;
  origin: string;
}

const W = 1200;
const H = 640;

function fmt(value: number, digits: number) {
  return value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function drawCertificate(canvas: HTMLCanvasElement, d: CertificateData, dark = false) {
  const scale = 2;
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  const paper = dark ? "#0d1210" : "#f4f4ee";
  const cream = dark ? "#121816" : "#faf9f3";
  const ink = dark ? "#e9ede7" : "#131614";
  const ink2 = dark ? "#b9c2ba" : "#3b433e";
  const grey = dark ? "#9aa79e" : "#55645b";
  const line = dark ? "#2c3a31" : "#cfd6cf";
  const emerald = dark ? "#5fbd8f" : "#1c6b4a";
  const serif = '"Newsreader", "Iowan Old Style", Georgia, serif';
  const sans = '"Geist", "Helvetica Neue", Arial, sans-serif';
  const mono = '"Geist Mono", "IBM Plex Mono", ui-monospace, Menlo, monospace';

  // Paper, a cream plate, a hairline frame and the perforated stub of a boarding pass.
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = cream;
  ctx.fillRect(40, 40, W - 80, H - 80);
  ctx.strokeStyle = line;
  ctx.lineWidth = 1;
  ctx.strokeRect(40.5, 40.5, W - 81, H - 81);
  const stubX = W - 330;
  ctx.setLineDash([4, 6]);
  ctx.beginPath();
  ctx.moveTo(stubX, 40);
  ctx.lineTo(stubX, H - 40);
  ctx.stroke();
  ctx.setLineDash([]);
  for (const y of [40, H - 40]) {
    ctx.fillStyle = paper;
    ctx.beginPath();
    ctx.arc(stubX, y, 10, 0, Math.PI * 2);
    ctx.fill();
  }
  // Faint ledger rules on the main plate.
  ctx.strokeStyle = dark ? "rgba(233,237,231,0.05)" : "rgba(19,22,20,0.05)";
  for (let y = 120; y < H - 60; y += 40) {
    ctx.beginPath();
    ctx.moveTo(80, y + 0.5);
    ctx.lineTo(stubX - 40, y + 0.5);
    ctx.stroke();
  }

  const eyebrow = (text: string, x: number, y: number, color = grey) => {
    ctx.fillStyle = color;
    ctx.font = `500 11px ${sans}`;
    ctx.letterSpacing = "1.6px";
    ctx.fillText(text.toUpperCase(), x, y);
    ctx.letterSpacing = "0px";
  };

  // Header: wordmark, season, network.
  ctx.fillStyle = ink;
  ctx.font = `400 30px ${serif}`;
  ctx.fillText("Redeem", 80, 96);
  eyebrow("Record of share-equivalents", 200, 92);
  ctx.textAlign = "right";
  eyebrow(`${d.season.label} · Robinhood Chain`, stubX - 40, 92, emerald);
  ctx.textAlign = "left";

  // Ticker and name.
  ctx.fillStyle = ink;
  ctx.font = `400 96px ${serif}`;
  ctx.fillText(d.symbol, 80, 220);
  ctx.fillStyle = ink2;
  ctx.font = `400 22px ${sans}`;
  ctx.fillText(`${d.name} · Robinhood Stock Token`, 80, 258);

  // The number that matters.
  eyebrow("Share-equivalents recorded", 80, 318);
  ctx.fillStyle = ink;
  ctx.font = `400 64px ${mono}`;
  ctx.fillText(fmt(d.shareEquivalent, 4), 80, 384);
  ctx.fillStyle = grey;
  ctx.font = `400 16px ${mono}`;
  ctx.fillText(`${fmt(d.rawTokens, 4)} raw × ${fmt(d.multiplier, 6)} · block ${Number(d.blockNumber).toLocaleString("en-US")}`, 80, 416);

  // Three facts along the bottom.
  const facts: Array<[string, string]> = [
    ["Wallet", `${d.wallet.slice(0, 6)}…${d.wallet.slice(-4)}`],
    ["Recorded", d.issuedAt.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })],
    ["Status", d.season.note],
  ];
  let fx = 80;
  for (const [label, value] of facts) {
    eyebrow(label, fx, 486);
    ctx.fillStyle = ink;
    ctx.font = `400 17px ${label === "Wallet" ? mono : sans}`;
    ctx.fillText(value, fx, 512);
    fx += label === "Wallet" ? 220 : 210;
  }
  ctx.fillStyle = emerald;
  ctx.fillRect(80, 548, 6, 6);
  ctx.fillStyle = grey;
  ctx.font = `500 12px ${sans}`;
  ctx.letterSpacing = "1.4px";
  ctx.fillText("INTENT · NOT A SHAREHOLDER VOTE · NOT CUSTODY · NOT A REDEMPTION", 96, 557);
  ctx.letterSpacing = "0px";
  ctx.fillStyle = grey;
  ctx.font = `400 13px ${sans}`;
  ctx.fillText(`${d.origin.replace(/^https?:\/\//, "")}/record/${d.symbol}`, 80, 582);

  // The stub: record number, queue position.
  const sx = stubX + 40;
  eyebrow("Record no.", sx, 132);
  ctx.fillStyle = d.recordNumber ? ink : grey;
  ctx.font = `400 72px ${mono}`;
  ctx.fillText(d.recordNumber ? `#${d.recordNumber}` : "—", sx, 204);
  ctx.fillStyle = grey;
  ctx.font = `400 14px ${sans}`;
  ctx.fillText(d.recordNumber ? `of ${d.holdersRecorded ?? d.recordNumber} wallets to record ${d.symbol}` : `No signature on file for ${d.symbol} yet`, sx, 232);

  eyebrow("Redemption queue", sx, 300);
  ctx.fillStyle = d.queuePosition ? ink : grey;
  ctx.font = `400 48px ${mono}`;
  ctx.fillText(d.queuePosition ? `#${d.queuePosition}` : "—", sx, 350);
  ctx.fillStyle = grey;
  ctx.font = `400 14px ${sans}`;
  ctx.fillText(d.queuePosition ? "readiness request on file" : "not in the queue", sx, 376);

  eyebrow("Season", sx, 444);
  ctx.fillStyle = emerald;
  ctx.font = `400 30px ${serif}`;
  ctx.fillText(d.season.label, sx, 478);
  ctx.fillStyle = grey;
  ctx.font = `400 13px ${sans}`;
  wrap(ctx, d.season.note, sx, 504, 240, 18);

  ctx.fillStyle = ink;
  ctx.font = `400 15px ${serif}`;
  ctx.fillText("Every token leaves a record.", sx, 582);
}

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, lineHeight: number) {
  const words = text.split(" ");
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > width && line) {
      ctx.fillText(line, x, y);
      line = word;
      y += lineHeight;
    } else line = test;
  }
  if (line) ctx.fillText(line, x, y);
}

export function shareText(d: CertificateData) {
  const number = d.recordNumber ? ` Record No. ${d.recordNumber}.` : "";
  return `Recorded ${fmt(d.shareEquivalent, 2)} share-eq of ${d.symbol} on Redeem before rights went live.${number} Intent, not a vote.`;
}

/** The record card in a sheet, with download and share. */
export function CertificateSheet({ data, onClose }: { data: CertificateData; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [png, setPng] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    const paint = () => {
      if (cancelled) return;
      drawCertificate(canvas, data, document.documentElement.classList.contains("dark"));
      setPng(canvas.toDataURL("image/png"));
    };
    // Draw once the site fonts are in, so the card matches the page.
    if ("fonts" in document) document.fonts.ready.then(paint, paint);
    else paint();
    return () => {
      cancelled = true;
    };
  }, [data]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const url = `${data.origin}/record/${data.symbol}`;
  const post = `https://x.com/intent/post?text=${encodeURIComponent(shareText(data))}&url=${encodeURIComponent(url)}`;
  const file = `redeem-${data.symbol.toLowerCase()}-record${data.recordNumber ? `-${data.recordNumber}` : ""}.png`;

  return createPortal(
    <div className="fixed inset-0 z-[70] grid place-items-center p-4" role="dialog" aria-modal="true" aria-label={`${data.symbol} record card`}>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 cursor-default bg-[rgb(11_18_14_/_0.62)]" />
      <div className="rise surface relative w-full max-w-[960px] rounded-[16px] p-4 sm:p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="eyebrow">Record card · {data.symbol}</div>
            <p className="mt-1 text-[13px] text-grey-green">Everything on the card is already public on the record page. Post it, or keep it.</p>
          </div>
          <button type="button" onClick={onClose} className="grid size-8 place-items-center rounded-[8px] text-grey-green hover:text-ink" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>
        <div className="mt-4 overflow-hidden rounded-[12px] border border-line">
          <canvas ref={canvasRef} className="block h-auto w-full" style={{ aspectRatio: `${W} / ${H}` }} />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button asChild disabled={!png}>
            <a href={png ?? "#"} download={file}>
              <Download className="size-4" /> Download PNG
            </a>
          </Button>
          <Button asChild variant="outline">
            <a href={post} target="_blank" rel="noreferrer">
              <Share2 className="size-4" /> Post on X
            </a>
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              void navigator.clipboard?.writeText(`${shareText(data)} ${url}`);
            }}
          >
            Copy text
          </Button>
          <span className="ml-auto text-[12px] text-grey-green">Attach the PNG to the post; X strips images from links.</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
