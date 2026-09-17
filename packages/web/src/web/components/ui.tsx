import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/* ---------- Buttons ---------- */

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-[background-color,color,border-color,transform] duration-200 disabled:pointer-events-none disabled:opacity-40 [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 outline-none focus-visible:ring-2 focus-visible:ring-emerald/40",
  {
    variants: {
      variant: {
        ink: "bg-ink text-paper hover:bg-ink-2",
        emerald: "bg-emerald text-primary-foreground hover:bg-emerald-deep",
        outline: "border border-line-2 bg-transparent text-ink hover:border-ink",
        ghost: "text-grey-green hover:text-ink",
        link: "text-emerald underline-offset-4 hover:underline px-0",
        paper: "bg-paper text-ink border border-line hover:border-line-2",
      },
      size: {
        sm: "h-8 rounded-[8px] px-3 text-[13px]",
        md: "h-10 rounded-[10px] px-4 text-[14px]",
        lg: "h-12 rounded-[12px] px-6 text-[15px]",
        icon: "size-9 rounded-[10px]",
      },
    },
    defaultVariants: { variant: "ink", size: "md" },
  },
);

export function Button({ className, variant, size, asChild = false, ...props }: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

/* ---------- Type ---------- */

export function Eyebrow({ className, ink = false, ...props }: React.ComponentProps<"div"> & { ink?: boolean }) {
  return <div className={cn(ink ? "eyebrow-ink" : "eyebrow", className)} {...props} />;
}

export function Display({ as: Tag = "h2", size = "lg", className, ...props }: { as?: "h1" | "h2" | "h3" | "p"; size?: "hero" | "xl" | "lg" | "md" | "sm" } & React.ComponentProps<"h2">) {
  const sizes = {
    hero: "text-[44px] sm:text-[64px] lg:text-[88px] xl:text-[104px]",
    xl: "text-[40px] sm:text-[56px] lg:text-[72px]",
    lg: "text-[34px] sm:text-[44px] lg:text-[56px]",
    md: "text-[28px] sm:text-[34px] lg:text-[40px]",
    sm: "text-[22px] sm:text-[26px] lg:text-[30px]",
  };
  return <Tag className={cn("display text-ink", sizes[size], className)} {...(props as object)} />;
}

/* ---------- Status marks (no pills) ---------- */

export type MarkTone = "live" | "muted" | "warn" | "danger" | "emerald" | "ink";

export function Mark({ tone = "muted", className, children, ...props }: React.ComponentProps<"span"> & { tone?: MarkTone }) {
  const dot = { live: "bg-emerald", muted: "bg-grey-green/50", warn: "bg-amber", danger: "bg-rust", emerald: "bg-emerald", ink: "bg-ink" }[tone];
  const text = { live: "text-emerald", muted: "text-grey-green", warn: "text-amber", danger: "text-rust", emerald: "text-emerald", ink: "text-ink" }[tone];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[11px] font-medium tracking-[0.12em] uppercase whitespace-nowrap", text, className)} {...props}>
      <span className={cn("inline-block size-[6px]", dot)} />
      {children}
    </span>
  );
}

/** A bordered label, used sparingly (asset class, item type). */
export function Tag({ className, ...props }: React.ComponentProps<"span">) {
  return <span className={cn("inline-flex items-center rounded-[6px] border border-line-2 px-1.5 py-[1px] text-[10.5px] font-medium tracking-[0.08em] uppercase text-grey-green", className)} {...props} />;
}

/* ---------- Numbers ---------- */

export function Stat({ label, value, sub, className, size = "md", tone = "ink" }: { label: React.ReactNode; value: React.ReactNode; sub?: React.ReactNode; className?: string; size?: "sm" | "md" | "lg" | "xl"; tone?: "ink" | "emerald" | "muted" | "warn" }) {
  const sizes = { sm: "text-[17px]", md: "text-[22px]", lg: "text-[26px] sm:text-[32px] xl:text-[38px]", xl: "text-[44px] sm:text-[64px]" };
  const tones = { ink: "text-ink", emerald: "text-emerald", muted: "text-grey-green", warn: "text-amber" };
  return (
    <div className={cn("min-w-0", className)}>
      <div className="eyebrow">{label}</div>
      <div className={cn("font-mono mt-1.5 leading-none font-normal tracking-[-0.01em] whitespace-nowrap", sizes[size], tones[tone])}>{value}</div>
      {sub ? <div className="mt-1.5 text-[12.5px] text-grey-green">{sub}</div> : null}
    </div>
  );
}

/** Definition row: engraved term, value to the right. */
export function Def({ term, children, className, mono = false }: { term: React.ReactNode; children: React.ReactNode; className?: string; mono?: boolean }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-6 border-b border-line py-3 text-[14px] last:border-b-0", className)}>
      <dt className="shrink-0 text-grey-green">{term}</dt>
      <dd className={cn("min-w-0 text-right text-ink", mono && "font-mono text-[13px]")}>{children}</dd>
    </div>
  );
}

/* ---------- Fields ---------- */

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-11 w-full rounded-[10px] border border-line-2 bg-cream px-3.5 text-[15px] text-ink placeholder:text-grey-green/70",
        "focus-visible:border-ink focus-visible:outline-none disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea className={cn("w-full rounded-[10px] border border-line-2 bg-cream px-3.5 py-2.5 text-[15px] text-ink placeholder:text-grey-green/70 focus-visible:border-ink focus-visible:outline-none", className)} {...props} />;
}

export function Select({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-9 appearance-none rounded-[8px] border border-line-2 bg-cream pr-8 pl-3 text-[13px] text-ink focus-visible:border-ink focus-visible:outline-none",
        "bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2210%22 height=%2210%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%236d7a71%22 stroke-width=%222%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[length:10px] bg-[position:right_12px_center] bg-no-repeat",
        className,
      )}
      {...props}
    />
  );
}

export function FieldLabel({ className, ...props }: React.ComponentProps<"label">) {
  return <label className={cn("eyebrow mb-2 block", className)} {...props} />;
}

export function Checkbox({ checked, onChange, label, className }: { checked: boolean; onChange: (value: boolean) => void; label: React.ReactNode; className?: string }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-3 text-[14px] leading-relaxed text-ink-2", className)}>
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn("mt-[3px] grid size-4 shrink-0 place-items-center border transition-colors", checked ? "border-ink bg-ink" : "border-line-2 bg-cream")}
      >
        {checked ? <svg viewBox="0 0 12 12" className="size-2.5 text-paper"><path d="M2 6.5 4.8 9 10 3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg> : null}
      </button>
      <span>{label}</span>
    </label>
  );
}

/* ---------- Misc ---------- */

export function Spinner({ className }: { className?: string }) {
  return <span className={cn("inline-block size-4 animate-spin rounded-full border-[1.5px] border-current border-t-transparent align-[-2px]", className)} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-[8px] bg-mint", className)} />;
}

export function Note({ children, className, tone = "muted" }: { children: React.ReactNode; className?: string; tone?: "muted" | "warn" | "danger" | "emerald" }) {
  const tones = {
    muted: "border-line bg-mint/60 text-ink-2",
    warn: "border-amber/40 bg-amber/8 text-ink",
    danger: "border-rust/40 bg-rust/8 text-rust",
    emerald: "border-emerald/30 bg-emerald/8 text-ink",
  };
  return <div className={cn("rounded-[10px] border px-4 py-3 text-[13.5px] leading-relaxed", tones[tone], className)}>{children}</div>;
}

export function Divider({ className }: { className?: string }) {
  return <div className={cn("hairline", className)} />;
}

/** Segmented control, rendered as underlined text tabs rather than pills. */
export function Tabs<T extends string>({ value, onChange, options, className }: { value: T; onChange: (value: T) => void; options: Array<{ value: T; label: React.ReactNode; count?: number }>; className?: string }) {
  return (
    <div className={cn("flex items-center gap-5 border-b border-line", className)}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn("-mb-px flex items-center gap-1.5 border-b-2 pb-2.5 text-[13.5px] font-medium transition-colors", active ? "border-ink text-ink" : "border-transparent text-grey-green hover:text-ink")}
          >
            {option.label}
            {option.count !== undefined ? <span className="font-mono text-[11px] text-grey-green">{option.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
