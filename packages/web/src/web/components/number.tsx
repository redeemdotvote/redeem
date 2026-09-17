import { animate, useInView } from "motion/react";
import { useEffect, useRef } from "react";

/**
 * A number that tweens to its value when it appears and whenever it changes. Formatting is the
 * caller's; the tween runs on a raw float so mono digits stay aligned while moving.
 */
export function Num({ value, format, className, duration = 0.9 }: { value: number | null | undefined; format: (value: number) => string; className?: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const previous = useRef(0);
  const inView = useInView(ref, { once: true, margin: "-10% 0px" });

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (value === null || value === undefined || !Number.isFinite(value)) {
      node.textContent = format(0).replace(/[0-9.,]+/g, "—");
      return;
    }
    if (!inView) {
      node.textContent = format(value);
      return;
    }
    const from = previous.current;
    const controls = animate(from, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => {
        node.textContent = format(latest);
      },
    });
    previous.current = value;
    return () => controls.stop();
  }, [value, inView, format, duration]);

  return <span ref={ref} className={className} />;
}
