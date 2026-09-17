import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export type FaqItem = { q: string; a: React.ReactNode };

export function Faq({ items, className }: { items: FaqItem[]; className?: string }) {
  return (
    <div className={cn("border-t border-line", className)}>
      {items.map((item) => (
        <details key={item.q} className="group border-b border-line">
          <summary className="flex cursor-pointer list-none items-start justify-between gap-6 py-5">
            <h3 className="font-serif text-[20px] leading-snug text-ink group-open:text-emerald sm:text-[22px]">{item.q}</h3>
            <span className="mt-1 text-grey-green transition-transform duration-200 group-open:rotate-45">
              <Plus className="size-4" />
            </span>
          </summary>
          <div className="pb-6">
            <p className="max-w-[70ch] text-[15px] leading-relaxed text-ink-2">{item.a}</p>
          </div>
        </details>
      ))}
    </div>
  );
}
