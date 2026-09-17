import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "../hooks/use-theme";

export function ThemeToggle({ className }: { className?: string }) {
  const { isDark, toggle } = useTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Light theme" : "Dark theme"}
      className={cn("relative grid size-8 shrink-0 place-items-center overflow-hidden rounded-[8px] text-grey-green transition-colors hover:text-ink", className)}
    >
      <Sun className={cn("absolute size-4 transition-all duration-300", isDark ? "translate-y-4 opacity-0" : "translate-y-0 opacity-100")} />
      <Moon className={cn("absolute size-4 transition-all duration-300", isDark ? "translate-y-0 opacity-100" : "-translate-y-4 opacity-0")} />
    </button>
  );
}
