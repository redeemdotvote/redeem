import { cn } from "@/lib/utils";

/**
 * The ledger: full-width rows on the page surface, hairlines between them, engraved column
 * heads, numbers right-aligned in mono. Nothing floats; the page is the sheet.
 */
export function Ledger({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("w-full overflow-x-auto", className)}>
      <table className="w-full min-w-[720px] border-collapse">{children}</table>
    </div>
  );
}

export function LHead({ children }: { children: React.ReactNode }) {
  return (
    <thead>
      <tr className="border-b border-line-2">{children}</tr>
    </thead>
  );
}

export function LTh({ children, align = "left", className, hide }: { children?: React.ReactNode; align?: "left" | "right"; className?: string; hide?: "md" | "lg" | "xl" }) {
  const hidden = hide === "md" ? "hidden md:table-cell" : hide === "lg" ? "hidden lg:table-cell" : hide === "xl" ? "hidden xl:table-cell" : "";
  return <th className={cn("eyebrow py-3 pr-4 font-medium whitespace-nowrap first:pl-1 last:pr-1", align === "right" ? "text-right" : "text-left", hidden, className)}>{children}</th>;
}

export function LRow({ className, onClick, ...props }: React.ComponentProps<"tr">) {
  return <tr className={cn("border-b border-line transition-colors duration-150 last:border-b-0", onClick && "cursor-pointer hover:bg-mint/60", className)} onClick={onClick} {...props} />;
}

export function LTd({ children, align = "left", mono = false, className, hide, muted = false }: { children?: React.ReactNode; align?: "left" | "right"; mono?: boolean; className?: string; hide?: "md" | "lg" | "xl"; muted?: boolean }) {
  const hidden = hide === "md" ? "hidden md:table-cell" : hide === "lg" ? "hidden lg:table-cell" : hide === "xl" ? "hidden xl:table-cell" : "";
  return (
    <td className={cn("py-4 pr-4 align-middle text-[14px] first:pl-1 last:pr-1", align === "right" ? "text-right" : "text-left", mono && "font-mono text-[14px]", muted && "text-grey-green", hidden, className)}>
      {children}
    </td>
  );
}

/** Mobile counterpart: one compact security row per record, no horizontal overflow. */
export function SecurityRow({ leading, title, subtitle, primary, secondary, onClick, className }: { leading: React.ReactNode; title: React.ReactNode; subtitle?: React.ReactNode; primary: React.ReactNode; secondary?: React.ReactNode; onClick?: () => void; className?: string }) {
  return (
    <button type="button" onClick={onClick} className={cn("flex w-full items-center gap-3 border-b border-line py-3.5 text-left last:border-b-0", className)}>
      {leading}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium text-ink">{title}</span>
        {subtitle ? <span className="block truncate text-[12px] text-grey-green">{subtitle}</span> : null}
      </span>
      <span className="shrink-0 text-right">
        <span className="font-mono block text-[14px] text-ink">{primary}</span>
        {secondary ? <span className="block text-[11.5px] text-grey-green">{secondary}</span> : null}
      </span>
    </button>
  );
}
