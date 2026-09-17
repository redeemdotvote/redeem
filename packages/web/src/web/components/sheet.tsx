import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect } from "react";

/** A bottom sheet on phones, a right-hand drawer on wider screens. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: React.ReactNode; children: React.ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div key="backdrop" className="fixed inset-0 z-50 bg-charcoal/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} onClick={onClose} />
          <motion.div
            key="panel"
            className="fixed inset-x-0 bottom-0 z-50 max-h-[88vh] overflow-y-auto rounded-t-[18px] bg-cream sm:inset-y-0 sm:right-0 sm:left-auto sm:w-[460px] sm:max-h-none sm:rounded-none sm:border-l sm:border-line"
            initial={{ y: "100%", x: 0 }}
            animate={{ y: 0, x: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 38 }}
          >
            <div className="sticky top-0 flex items-center justify-between border-b border-line bg-cream px-5 py-3.5">
              <div className="text-[15px] font-medium text-ink">{title}</div>
              <button type="button" onClick={onClose} aria-label="Close" className="grid size-8 place-items-center rounded-[8px] text-grey-green hover:text-ink">
                <X className="size-4" />
              </button>
            </div>
            <div className="px-5 py-5">{children}</div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
